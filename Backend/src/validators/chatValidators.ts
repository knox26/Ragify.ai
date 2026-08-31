import { z } from "zod";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_TITLE_LENGTH = 120;

export const chatMessageSchema = z.object({
  // Omitted on the first message of a session (lazy create), required after.
  sessionId: z.uuid().optional(),

  // Only read on session creation — a session's scope is immutable once it
  // exists. Null/omitted = global chat.
  documentId: z.uuid().nullable().optional(),

  // zod min(1) lets "   " through, so reject whitespace-only content here too
  // (the controller also guards it as a second layer).
  content: z
    .string()
    .min(1)
    .max(MAX_MESSAGE_LENGTH)
    .refine((value) => value.trim().length > 0, "Message cannot be empty"),

  // Accepted now for forward-compat idempotency; uniqueness not enforced yet.
  clientMessageId: z.uuid().optional(),
});

export const renameChatSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
});
