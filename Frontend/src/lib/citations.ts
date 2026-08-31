import { visit } from "unist-util-visit";
import type { Root, Text, PhrasingContent } from "mdast";

/**
 * Remark plugin: turns `[n]` text markers into `<sup data-cite="n">` elements
 * so react-markdown renders them as footnote badges. Numbers outside the valid
 * range (1..maxN) are left as literal text — the LLM occasionally cites a
 * source that wasn't actually retrieved, and dropping those beats showing a
 * broken marker.
 */
export function citationPlugin(maxN: number) {
  return function transform() {
    return (tree: Root) => {
      visit(tree, "text", (node, index, parent) => {
        if (typeof index !== "number" || !parent) {
          return;
        }

        const value = (node as Text).value;
        const regex = /\[(\d+)\]/g;
        const parts: PhrasingContent[] = [];
        let last = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(value)) !== null) {
          const n = Number(match[1]);

          if (match.index > last) {
            parts.push({
              type: "text",
              value: value.slice(last, match.index),
            });
          }

          if (n >= 1 && n <= maxN) {
            parts.push({
              type: "html",
              value: `<sup data-cite="${n}">${n}</sup>`,
            });
          } else {
            parts.push({ type: "text", value: match[0] });
          }

          last = match.index + match[0].length;
        }

        if (last < value.length) {
          parts.push({ type: "text", value: value.slice(last) });
        }

        if (parts.length > 0) {
          parent.children.splice(index, 1, ...parts);
        }
      });
    };
  };
}

/**
 * True when the rendered answer can show a footnote block — i.e. at least one
 * citation survived the range check.
 */
export function hasValidCitations(content: string, maxN: number): boolean {
  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const n = Number(match[1]);

    if (n >= 1 && n <= maxN) {
      return true;
    }
  }

  return false;
}
