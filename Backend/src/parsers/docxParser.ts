import mammoth from "mammoth";

import type { ParseDocumentParams, ParsedPage } from "./parserTypes";

export async function parseDocx({
  buffer,
}: ParseDocumentParams): Promise<ParsedPage[]> {
  try {
    const { value: rawText } = await mammoth.extractRawText({
      buffer,
    });

    // Mammoth also returns conversion warnings via `messages`.
    // Ignored for now.

    const text = rawText.trim();

    if (!text) {
      return [];
    }

    return [
      {
        pageNumber: 1,
        text,
      },
    ];
  } catch (error) {
    throw new Error("DOCX parsing failed", {
      cause: error,
    });
  }
}
