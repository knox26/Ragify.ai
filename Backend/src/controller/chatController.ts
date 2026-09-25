import { Context } from "hono";
import { stream } from "hono/streaming";
import { Prisma } from "@prisma/client";
import prisma from "../db/dbConfig";
import {
  chatMessageSchema,
  renameChatSchema,
} from "../validators/chatValidators";
import { retrievePipeline } from "../services/retrievalPipeline";
import {
  buildSources,
  buildSystemPrompt,
  buildUserPrompt,
  streamChatAnswer,
  truncateTitle,
  type ChatSourcePayload,
} from "../services/chatService";
import { serializeStreamEvent } from "../utils/streamEvents";
import { isUuid } from "../utils/isUuid";
import {
  buildPage,
  keysetWhere,
  readDirection,
  readPagination,
} from "../utils/pagination";

function notFound(c: Context, message: string) {
  return c.json({ success: false, message }, 404);
}

function forbidden(c: Context, message = "Unauthorized") {
  return c.json({ success: false, message }, 403);
}

// The sessions list only needs a teaser of the last message. Sending full
// content would let 100 long answers balloon the payload despite the row cap.
const LAST_MESSAGE_PREVIEW_CHARS = 200;

/**
 * POST /api/chats/message
 *
 * Resolves (or lazily creates) the session, persists the user message, then
 * streams an NDJSON answer: meta -> delta* -> done. Pre-stream failures
 * (validation, ownership, DB) return JSON — never NDJSON. Mid-stream failures
 * emit a {type:"error"} line and persist any partial answer with error: true.
 */
export const messageController = async (c: Context) => {
  const userId = c.get("userId") as string;

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, message: "Invalid JSON body" }, 400);
  }

  const result = chatMessageSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        success: false,
        message: "Invalid request body",
        errors: result.error.flatten(),
      },
      400,
    );
  }

  const { sessionId, documentId, content } = result.data;

  if (content.trim().length === 0) {
    return c.json({ success: false, message: "Message cannot be empty" }, 400);
  }

  let session: {
    id: string;
    title: string;
    userId: string;
    documentId: string | null;
  } | null = null;

  if (sessionId) {
    session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, title: true, userId: true, documentId: true },
    });

    if (!session) {
      return notFound(c, "Chat session not found");
    }

    if (session.userId !== userId) {
      return forbidden(c);
    }
  }

  // Effective scope: the session's own documentId wins once a session exists —
  // scope is immutable per session. A body documentId is only used at creation.
  const effectiveDocumentId = session
    ? session.documentId
    : (documentId ?? null);

  if (effectiveDocumentId) {
    const doc = await prisma.document.findFirst({
      where: { id: effectiveDocumentId, userId },
      select: { id: true },
    });

    if (!doc) {
      return notFound(c, "Document not found");
    }
  }

  const cleanContent = content.trim();

  // Lazily create the session + first user message atomically so a crash can't
  // leave an orphaned empty session behind.
  let activeSession: {
    id: string;
    title: string;
    userId: string;
    documentId: string | null;
  };
  let userMessageId: string;

  if (session) {
    activeSession = session;
    userMessageId = (
      await prisma.chatMessage.create({
        data: {
          sessionId: activeSession.id,
          role: "USER",
          content: cleanContent,
        },
        select: { id: true },
      })
    ).id;
  } else {
    const title = truncateTitle(cleanContent);

    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.chatSession.create({
        data: { userId, documentId: effectiveDocumentId, title },
        select: { id: true, title: true, userId: true, documentId: true },
      });

      const m = await tx.chatMessage.create({
        data: { sessionId: s.id, role: "USER", content: cleanContent },
        select: { id: true },
      });

      return { s, m };
    });

    activeSession = created.s;
    userMessageId = created.m.id;
  }

  const sessionIdOut = activeSession.id;

  // Prisma's @updatedAt does NOT auto-bump when a related message is inserted,
  // so "newest first" session ordering would go stale. Touch it explicitly.
  await prisma.chatSession.update({
    where: { id: sessionIdOut },
    data: { updatedAt: new Date() },
  });

  c.header("Content-Type", "application/x-ndjson");
  c.header("Cache-Control", "no-cache, no-transform");

  let fullText = "";
  let sources: ChatSourcePayload[] = [];
  let completed = false;

  return stream(c, async (s) => {
    s.onAbort(() => {
      // Client disconnected. The LLM loop's next write throws, which lands in
      // the catch below where the partial is persisted with error: true.
    });

    try {
      await s.writeln(
        serializeStreamEvent({
          type: "meta",
          sessionId: sessionIdOut,
          messageId: userMessageId,
          title: activeSession.title,
          documentId: activeSession.documentId,
        }),
      );

      // Phase 1 retrieval pipeline: rewrite → route → rerank. Same first
      // stage (decompose + hybrid retrieve + gap-fill) but the candidates
      // are rescored by a cross-encoder and narrowed to RERANK_TOP_K (8).
      // Observability hook emits one non-PII structured line per request —
      // never logs rewrite text, rerank text, or answer content.
      const chunks = await retrievePipeline({
        userId,
        question: cleanContent,
        documentId: effectiveDocumentId,
        observer: (m) => {
          console.log(
            `[pipeline] ` +
              `route=${m.route} (${m.routeSource}) ` +
              `variants=${m.variantCount} ` +
              `pool=${m.candidatePoolSize} ` +
              `rerank=${m.rerankProvider} ` +
              `latency=${m.rerankLatencyMs}ms ` +
              `gap_rounds=${m.gapFillRounds} ` +
              `final=${m.finalChunkCount}`,
          );
        },
      });

      sources = buildSources(chunks);

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(cleanContent, chunks);

      for await (const piece of streamChatAnswer({
        systemPrompt,
        userPrompt,
      })) {
        fullText += piece;

        await s.writeln(serializeStreamEvent({ type: "delta", text: piece }));
      }

      if (!fullText.trim()) {
        await s.writeln(
          serializeStreamEvent({
            type: "error",
            message: "The assistant returned no answer. Try rephrasing.",
          }),
        );

        return;
      }

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          sessionId: sessionIdOut,
          role: "ASSISTANT",
          content: fullText,
          sources:
            sources.length > 0
              ? (sources as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
        },
        select: { id: true },
      });

      await prisma.chatSession.update({
        where: { id: sessionIdOut },
        data: { updatedAt: new Date() },
      });

      completed = true;

      await s.writeln(
        serializeStreamEvent({
          type: "done",
          messageId: assistantMessage.id,
          sources,
        }),
      );
    } catch (error) {
      // Mid-stream failure (LLM error, Qdrant down, write error, abort). Keep
      // whatever arrived — persist it as an interrupted answer.
      if (!completed && fullText.trim()) {
        try {
          await prisma.chatMessage.create({
            data: {
              sessionId: sessionIdOut,
              role: "ASSISTANT",
              content: fullText,
              sources:
                sources.length > 0
                  ? (sources as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              error: true,
            },
          });
        } catch (persistError) {
          console.error(
            "Failed to persist partial assistant message:",
            persistError,
          );
        }
      }

      console.error("Chat stream failed:", error);

      try {
        await s.writeln(
          serializeStreamEvent({
            type: "error",
            message:
              error instanceof Error
                ? unwrapChatError(error)
                : "Stream failed. Please try again.",
          }),
        );
      } catch {
        // Client is gone; nothing more to write.
      }
    }
  });
};

function unwrapChatError(error: Error): string {
  const cause = error.cause;

  if (cause instanceof Error && cause.message) {
    return `${error.message} — cause: ${cause.message}`;
  }

  return error.message;
}

export const getChatsController = async (c: Context) => {
  try {
    const userId = c.get("userId") as string;

    const pageParams = readPagination(c.req.query());
    if (!pageParams.ok) {
      return c.json({ success: false, message: pageParams.message }, 400);
    }

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId,
        ...keysetWhere("lt", pageParams.cursor, "updatedAt"),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: pageParams.limit + 1,
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { role: true, content: true, createdAt: true },
        },
      },
    });

    const { rows, pagination } = buildPage(
      sessions,
      pageParams.limit,
      (session) => ({ c: session.updatedAt, i: session.id }),
    );

    return c.json({
      success: true,
      data: rows.map((session) => ({
        id: session.id,
        title: session.title,
        documentId: session.documentId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session._count.messages,
        lastMessage: session.messages[0]
          ? {
              role: session.messages[0].role,
              content: session.messages[0].content.slice(
                0,
                LAST_MESSAGE_PREVIEW_CHARS,
              ),
              createdAt: session.messages[0].createdAt,
            }
          : null,
      })),
      pagination,
    });
  } catch (error) {
    console.error("Failed to fetch chat sessions:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const getMessagesController = async (c: Context) => {
  try {
    const userId = c.get("userId") as string;
    const sessionId = c.req.param("id") ?? "";

    if (!isUuid(sessionId)) {
      return notFound(c, "Chat session not found");
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session) {
      return notFound(c, "Chat session not found");
    }

    if (session.userId !== userId) {
      return forbidden(c);
    }

    const pageParams = readPagination(c.req.query());
    if (!pageParams.ok) {
      return c.json({ success: false, message: pageParams.message }, 400);
    }

    // "desc" loads newest-first, then walks backward through the cursor
    // toward older rows — what the chat UI requests. "asc" (the readDirection
    // default) walks forward from the start of the thread.
    const direction = readDirection(c.req.query());
    const keysetDir = direction === "desc" ? "lt" : "gt";
    const order = direction === "desc" ? "desc" : "asc";

    const messages = await prisma.chatMessage.findMany({
      where: {
        sessionId,
        ...keysetWhere(keysetDir, pageParams.cursor, "createdAt"),
      },
      // createdAt can collide; id tiebreak keeps order stable.
      orderBy: [{ createdAt: order }, { id: order }],
      take: pageParams.limit + 1,
      select: {
        id: true,
        role: true,
        content: true,
        sources: true,
        error: true,
        createdAt: true,
      },
    });

    const { rows, pagination } = buildPage(
      messages,
      pageParams.limit,
      (message) => ({ c: message.createdAt, i: message.id }),
    );

    return c.json({
      success: true,
      data: rows.map((message) => ({
        ...message,
        sources: message.sources
          ? (message.sources as unknown as ChatSourcePayload[])
          : null,
      })),
      pagination,
    });
  } catch (error) {
    console.error("Failed to fetch chat messages:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const getChatController = async (c: Context) => {
  try {
    const userId = c.get("userId") as string;
    const sessionId = c.req.param("id") ?? "";

    if (!isUuid(sessionId)) {
      return notFound(c, "Chat session not found");
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { role: true, content: true, createdAt: true },
        },
      },
    });

    if (!session) {
      return notFound(c, "Chat session not found");
    }

    return c.json({
      success: true,
      data: {
        id: session.id,
        title: session.title,
        documentId: session.documentId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session._count.messages,
        lastMessage: session.messages[0] ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to fetch chat session:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const renameChatController = async (c: Context) => {
  try {
    const userId = c.get("userId") as string;
    const sessionId = c.req.param("id") ?? "";

    if (!isUuid(sessionId)) {
      return notFound(c, "Chat session not found");
    }

    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, message: "Invalid JSON body" }, 400);
    }

    const result = renameChatSchema.safeParse(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          message: "Invalid request body",
          errors: result.error.flatten(),
        },
        400,
      );
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session) {
      return notFound(c, "Chat session not found");
    }

    if (session.userId !== userId) {
      return forbidden(c);
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: result.data.title },
      select: { id: true, title: true, documentId: true, updatedAt: true },
    });

    return c.json({ success: true, data: updated });
  } catch (error) {
    console.error("Failed to rename chat session:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};

export const deleteChatController = async (c: Context) => {
  try {
    const userId = c.get("userId") as string;
    const sessionId = c.req.param("id") ?? "";

    if (!isUuid(sessionId)) {
      return notFound(c, "Chat session not found");
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session) {
      return notFound(c, "Chat session not found");
    }

    if (session.userId !== userId) {
      return forbidden(c);
    }

    // Cascade removes messages.
    await prisma.chatSession.delete({ where: { id: sessionId } });

    return c.json({ success: true, message: "Chat session deleted" });
  } catch (error) {
    console.error("Failed to delete chat session:", error);

    return c.json({ success: false, message: "Internal Server Error" }, 500);
  }
};
