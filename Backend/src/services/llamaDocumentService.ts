import { Document, SentenceSplitter } from "llamaindex";
import type { ParsedPage } from "../parsers/parserTypes";

interface CreateLlamaChunksParams {
  pages: ParsedPage[];
  documentId: string;
}

export interface ProcessedChunk {
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
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

/**
 * Create lightweight application-level chunks from a document.
 *
 * LlamaIndex is used only for:
 *
 *   Document -> SentenceSplitter -> TextNode[]
 *
 * The LlamaIndex TextNode objects are immediately converted into
 * ProcessedChunk objects so they do not need to travel through
 * the rest of the processing pipeline.
 */
export async function createLlamaChunks({
  pages,
  documentId,
}: CreateLlamaChunksParams): Promise<ProcessedChunk[]> {
  if (pages.length === 0) {
    return [];
  }

  try {
    // 1. Combine all pages into one continuous text while
    //    remembering the offsets of every original page.
    const { text, pageOffsets } = combinePages(pages);

    // 2. Create one LlamaIndex Document for the entire file.
    const llamaDocument = new Document({
      text,
      id_: documentId,
    });

    // 3. Split the document into semantic chunks.
    //
    // Chunks are allowed to cross page boundaries.
    const splitter = new SentenceSplitter({
      chunkSize: 512,
      chunkOverlap: 50,
    });

    const nodes = splitter.getNodesFromDocuments([llamaDocument]);

    // 4. Immediately convert LlamaIndex nodes into our
    //    lightweight application representation.
    return nodes.map((node, index) => {
      const { startCharIdx, endCharIdx } = node;

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error(
          `LlamaIndex did not provide character offsets for node ${node.id_}`,
        );
      }

      // Extract the chunk text once.
      const chunkText = node.getContent();

      if (!chunkText.trim()) {
        throw new Error(`LlamaIndex node ${node.id_} contains empty text`);
      }

      // Determine which original pages this chunk overlaps.
      const { pageStart, pageEnd } = getPageRange(
        startCharIdx,
        endCharIdx,
        pageOffsets,
      );

      return {
        chunkIndex: index,
        text: chunkText,
        startOffset: startCharIdx,
        endOffset: endCharIdx,
        pageStart,
        pageEnd,
      };
    });
  } catch (error) {
    throw new Error(`Failed to create chunks for document "${documentId}"`, {
      cause: error,
    });
  }
}
