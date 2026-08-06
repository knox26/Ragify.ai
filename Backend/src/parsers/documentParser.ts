import { parseDocx } from "./docxParser";
import { MIME_TYPES } from "./mimeTypes";
import { parsePdf } from "./pdfParser";
import { parseText } from "./textParser";

import type { ParseDocumentParams, ParsedPage } from "./parserTypes";

export async function parseDocument(
  params: ParseDocumentParams,
): Promise<ParsedPage[]> {
  const { mimeType } = params;

  switch (mimeType) {
    case MIME_TYPES.PDF:
      return parsePdf(params);

    case MIME_TYPES.DOCX:
      return parseDocx(params);

    case MIME_TYPES.TEXT:
    case MIME_TYPES.MARKDOWN:
    case MIME_TYPES.MARKDOWN_LEGACY:
      return parseText(params);

    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}
