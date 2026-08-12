import { describe, expect, test } from "bun:test";
import { Document as LlamaDocument, SentenceSplitter } from "llamaindex";

describe("LlamaIndex character offsets", () => {
  test("should provide accurate offsets for generated nodes", () => {
    const combinedText = [
      "Page one contains information about databases and distributed systems.",
      "Page two continues the discussion about distributed systems and caching.",
      "Page three explains how vector databases are used in RAG applications.",
    ].join("\n\n");

    const document = new LlamaDocument({
      text: combinedText,
      id_: "test-document",
    });

    const splitter = new SentenceSplitter({
      chunkSize: 50,
      chunkOverlap: 10,
    });

    const nodes = splitter.getNodesFromDocuments([document]);

    expect(nodes.length).toBeGreaterThan(0);

    for (const node of nodes) {
      const { startCharIdx, endCharIdx } = node;

      expect(startCharIdx).toBeDefined();
      expect(endCharIdx).toBeDefined();

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error("LlamaIndex did not provide character offsets");
      }

      const extractedText = combinedText.slice(startCharIdx, endCharIdx);

      expect(extractedText).toBe(node.text);
    }
  });

  test("should provide accurate offsets with repeated punctuation and special characters", () => {
    const combinedText = "[see the docs](../path/to/file.md) ".repeat(20);

    const document = new LlamaDocument({
      text: combinedText,
      id_: "test-document",
    });

    const splitter = new SentenceSplitter({
      chunkSize: 20,
      chunkOverlap: 5,
    });

    const nodes = splitter.getNodesFromDocuments([document]);

    expect(nodes.length).toBeGreaterThan(0);

    for (const node of nodes) {
      const { startCharIdx, endCharIdx } = node;

      expect(startCharIdx).toBeDefined();
      expect(endCharIdx).toBeDefined();

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error("LlamaIndex did not provide character offsets");
      }

      const extractedText = combinedText.slice(startCharIdx, endCharIdx);

      expect(extractedText).toBe(node.text);
    }
  });

  test("should return offsets in order and within document bounds", () => {
    const combinedText = Array.from(
      { length: 12 },
      (_, i) =>
        `Page ${i + 1} discusses topic ${
          i + 1
        } in reasonable detail, covering several related subpoints and examples relevant to distributed systems and databases.`,
    ).join("\n\n");

    const document = new LlamaDocument({
      text: combinedText,
      id_: "test-document",
    });

    const splitter = new SentenceSplitter({
      chunkSize: 50,
      chunkOverlap: 10,
    });

    const nodes = splitter.getNodesFromDocuments([document]);

    // This test verifies ordering between multiple nodes.
    // If only one node is produced, the ordering assertion
    // would not actually test anything.
    expect(nodes.length).toBeGreaterThan(1);

    let previousStart = -1;

    for (const node of nodes) {
      const { startCharIdx, endCharIdx } = node;

      expect(startCharIdx).toBeDefined();
      expect(endCharIdx).toBeDefined();

      if (startCharIdx === undefined || endCharIdx === undefined) {
        throw new Error("LlamaIndex did not provide character offsets");
      }

      // Nodes should appear in document order.
      expect(startCharIdx).toBeGreaterThanOrEqual(previousStart);

      // Offset must be inside the document.
      expect(startCharIdx).toBeGreaterThanOrEqual(0);

      // End must not come before start.
      expect(endCharIdx).toBeGreaterThanOrEqual(startCharIdx);

      // End must not exceed document length.
      expect(endCharIdx).toBeLessThanOrEqual(combinedText.length);

      previousStart = startCharIdx;
    }
  });
});
