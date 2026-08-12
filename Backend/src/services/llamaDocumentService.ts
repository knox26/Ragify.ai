import { Document, SentenceSplitter, type TextNode } from "llamaindex";
import type { ParsedPage } from "../parsers/parserTypes";

interface CreateLlamaNodesParams {
  pages: ParsedPage[];
  documentId: string;
  userId: string;
  fileName: string;
}

interface NodeMetadata {
  documentId: string;
  userId: string;
  fileName: string;
  pageStart: number;
  pageEnd: number;
}

interface PageOffset {
  page: number;
  startOffset: number;
  endOffset: number;
}

export const PAGE_SEPARATOR = "\n\n";

export function combinePages(pages: ParsedPage[]): {
  text: string;
  pageOffsets: PageOffset[];
} {
  let combinedText = "";
  const pageOffsets: PageOffset[] = [];

  for (const page of pages) {
    if (combinedText.length > 0) {
      combinedText += PAGE_SEPARATOR;
    }

    const startOffset = combinedText.length;

    combinedText += page.text;

    const endOffset = combinedText.length;

    pageOffsets.push({
      page: page.pageNumber,
      startOffset,
      endOffset,
    });
  }

  return {
    text: combinedText,
    pageOffsets,
  };
}

export function getPageRange(
  chunkStart: number,
  chunkEnd: number,
  pageOffsets: PageOffset[],
): {
  pageStart: number;
  pageEnd: number;
} {
  // A valid chunk must have a positive length.
  if (chunkStart >= chunkEnd) {
    throw new Error(
      `Invalid chunk range: start (${chunkStart}) must be less than end (${chunkEnd})`,
    );
  }

  const overlappingPages = pageOffsets.filter(
    ({ startOffset, endOffset }) =>
      chunkStart < endOffset && chunkEnd > startOffset,
  );

  if (overlappingPages.length === 0) {
    throw new Error(
      `Unable to determine page range for chunk ${chunkStart}-${chunkEnd}`,
    );
  }

  return {
    pageStart: overlappingPages[0].page,
    pageEnd: overlappingPages[overlappingPages.length - 1].page,
  };
}

export async function createLlamaNodes({
  pages,
  documentId,
  userId,
  fileName,
}: CreateLlamaNodesParams): Promise<TextNode[]> {
  if (pages.length === 0) {
    return [];
  }

  try {
    // 1. Combine all pages into one continuous text
    //    while remembering where every page starts/ends.
    const { text, pageOffsets } = combinePages(pages);

    // 2. Create ONE LlamaIndex Document for the entire file.
    const llamaDocument = new Document({
      text,
      id_: documentId,
    });

    // 3. Chunk the entire document.
    //    Chunks are therefore allowed to cross page boundaries.
    const splitter = new SentenceSplitter({
      chunkSize: 512,
      chunkOverlap: 50,
    });

    const nodes = splitter.getNodesFromDocuments([llamaDocument]);

    // 4. Attach our own metadata to every generated node.
    return nodes.map((node) => {
      const { startCharIdx, endCharIdx } = node;

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error(
          `LlamaIndex did not provide character offsets for node ${node.id_}`,
        );
      }

      // 5. Determine which real pages this chunk overlaps.
      const { pageStart, pageEnd } = getPageRange(
        startCharIdx,
        endCharIdx,
        pageOffsets,
      );

      const metadata = {
        documentId,
        userId,
        fileName,
        pageStart,
        pageEnd,
      } satisfies NodeMetadata;

      node.metadata = {
        ...node.metadata,
        ...metadata,
      };

      return node;
    });
  } catch (error) {
    throw new Error(
      `Failed to create Llama nodes for document "${documentId}"`,
      {
        cause: error,
      },
    );
  }
}
