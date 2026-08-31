import { describe, expect, test } from "vitest";
import type { Root } from "mdast";
import { citationPlugin, hasValidCitations } from "./citations";

function makeTree(text: string): Root {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: text }],
      },
    ],
  } as unknown as Root;
}

function apply(text: string, maxN: number): Root {
  // citationPlugin(maxN) returns a remark plugin; calling it yields the
  // transformer, which mutates the mdast tree in place.
  const transformer = citationPlugin(maxN)();
  const tree = makeTree(text);
  transformer(tree);
  return tree;
}

function childrenOf(tree: Root): unknown[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree.children[0] as any).children;
}

describe("citationPlugin", () => {
  test("turns an in-range [n] into a sup html node", () => {
    const tree = apply("Revenue grew[1] 15%.", 3);

    expect(childrenOf(tree)).toEqual([
      { type: "text", value: "Revenue grew" },
      { type: "html", value: '<sup data-cite="1">1</sup>' },
      { type: "text", value: " 15%." },
    ]);
  });

  test("leaves out-of-range numbers as literal text", () => {
    const tree = apply("See [9] for details.", 3);

    expect(childrenOf(tree)).toEqual([
      { type: "text", value: "See " },
      { type: "text", value: "[9]" },
      { type: "text", value: " for details." },
    ]);
  });

  test("leaves text with no citations untouched", () => {
    const tree = apply("Just a plain sentence.", 3);

    expect(childrenOf(tree)).toEqual([{ type: "text", value: "Just a plain sentence." }]);
  });

  test("handles multiple in-range citations in one text node", () => {
    const tree = apply("a[1]b[2]c", 2);

    expect(childrenOf(tree)).toEqual([
      { type: "text", value: "a" },
      { type: "html", value: '<sup data-cite="1">1</sup>' },
      { type: "text", value: "b" },
      { type: "html", value: '<sup data-cite="2">2</sup>' },
      { type: "text", value: "c" },
    ]);
  });

  test("keeps out-of-range markers and converts in-range ones", () => {
    const tree = apply("[4] grew[2]", 2);

    expect(childrenOf(tree)).toEqual([
      { type: "text", value: "[4]" },
      { type: "text", value: " grew" },
      { type: "html", value: '<sup data-cite="2">2</sup>' },
    ]);
  });

  test("does not convert when maxN is zero", () => {
    const tree = apply("[1]", 0);

    expect(childrenOf(tree)).toEqual([{ type: "text", value: "[1]" }]);
  });
});

describe("hasValidCitations", () => {
  test("true when at least one citation is in range", () => {
    expect(hasValidCitations("Revenue grew[2].", 2)).toBe(true);
  });

  test("false when all citations are out of range", () => {
    expect(hasValidCitations("Revenue grew[9].", 2)).toBe(false);
  });

  test("false when there are no citations", () => {
    expect(hasValidCitations("Plain answer with no markers.", 2)).toBe(false);
  });

  test("true when one of many is in range", () => {
    expect(hasValidCitations("[9] and [1] together", 2)).toBe(true);
  });
});
