import { extractText, getDocumentProxy } from "unpdf";

import type { ParseDocumentParams, ParsedPage } from "./parserTypes";

export async function parsePdf({
  buffer,
}: ParseDocumentParams): Promise<ParsedPage[]> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    const { text } = await extractText(pdf, {
      mergePages: false,
    });

    return text
      .map((pageText, index) => ({
        pageNumber: index + 1,
        text: pageText.trim(),
      }))
      .filter((page) => page.text.length > 0);
  } catch (error) {
    throw new Error("PDF parsing failed", {
      cause: error,
    });
  }
}
