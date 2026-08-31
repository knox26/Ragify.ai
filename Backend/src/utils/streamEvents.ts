import type { ChatSourcePayload } from "../services/chatService";

export type StreamEvent =
  | {
      type: "meta";
      sessionId: string;
      messageId: string;
      title: string;
      documentId: string | null;
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "done";
      messageId: string;
      sources: ChatSourcePayload[];
    }
  | {
      type: "error";
      message: string;
    };

export function serializeStreamEvent(event: StreamEvent): string {
  return JSON.stringify(event);
}
