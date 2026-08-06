import type { ParseDocumentParams, ParsedPage } from "./parserTypes";

export async function parseText({
  buffer,
}: ParseDocumentParams): Promise<ParsedPage[]> {
  const text = buffer.toString("utf-8").trim();

  if (!text) {
    return [];
  }

  return [
    {
      pageNumber: 1,
      text,
    },
  ];
}
