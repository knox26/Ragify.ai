import { describe, expect, test } from "bun:test";
import { chatMessageSchema, renameChatSchema } from "../validators/chatValidators";

describe("chatMessageSchema", () => {
  test("valid global chat message passes", () => {
    const result = chatMessageSchema.safeParse({
      content: "What is revenue?",
    });

    expect(result.success).toBe(true);
  });

  test("valid document-scoped first message passes", () => {
    const result = chatMessageSchema.safeParse({
      documentId: "1f4a5f6e-8d3a-4f2b-9a1c-0b9e2f3a4c5d",
      content: "What is revenue?",
    });

    expect(result.success).toBe(true);
  });

  test("valid follow-up with sessionId passes", () => {
    const result = chatMessageSchema.safeParse({
      sessionId: "1f4a5f6e-8d3a-4f2b-9a1c-0b9e2f3a4c5d",
      content: "Tell me more",
    });

    expect(result.success).toBe(true);
  });

  test("documentId null passes (explicit global)", () => {
    const result = chatMessageSchema.safeParse({
      documentId: null,
      content: "Hello",
    });

    expect(result.success).toBe(true);
  });

  test("empty content fails", () => {
    const result = chatMessageSchema.safeParse({ content: "" });

    expect(result.success).toBe(false);
  });

  test("whitespace-only content fails", () => {
    const result = chatMessageSchema.safeParse({ content: "   \n\t  " });

    expect(result.success).toBe(false);
  });

  test("content over 4000 chars fails", () => {
    const result = chatMessageSchema.safeParse({
      content: "a".repeat(4001),
    });

    expect(result.success).toBe(false);
  });

  test("4000 char content passes", () => {
    const result = chatMessageSchema.safeParse({
      content: "a".repeat(4000),
    });

    expect(result.success).toBe(true);
  });

  test("malformed sessionId fails", () => {
    const result = chatMessageSchema.safeParse({
      sessionId: "not-a-uuid",
      content: "Hello",
    });

    expect(result.success).toBe(false);
  });

  test("malformed documentId fails", () => {
    const result = chatMessageSchema.safeParse({
      documentId: "not-a-uuid",
      content: "Hello",
    });

    expect(result.success).toBe(false);
  });

  test("non-string content fails", () => {
    const result = chatMessageSchema.safeParse({ content: 42 });

    expect(result.success).toBe(false);
  });
});

describe("renameChatSchema", () => {
  test("valid title passes", () => {
    const result = renameChatSchema.safeParse({ title: "Q3 Review" });

    expect(result.success).toBe(true);
  });

  test("whitespace-padded title is trimmed", () => {
    const result = renameChatSchema.safeParse({ title: "  Q3 Review  " });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Q3 Review");
  });

  test("empty title fails", () => {
    const result = renameChatSchema.safeParse({ title: "" });

    expect(result.success).toBe(false);
  });

  test("whitespace-only title fails", () => {
    const result = renameChatSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
  });

  test("title over 120 chars fails", () => {
    const result = renameChatSchema.safeParse({ title: "a".repeat(121) });

    expect(result.success).toBe(false);
  });
});
