import { describe, expect, test } from "bun:test";
import {
  dehyphenateText,
  extractSectionTitle,
  isHeadingLine,
  normalizeHeadingLine,
  splitIntoLines,
} from "../services/chunking/headingDetector";

describe("headingDetector", () => {
  test("ATX markdown headings", () => {
    expect(isHeadingLine("# Notes to Financial Statements")).toBe(true);
    expect(isHeadingLine("### Risk Factors")).toBe(true);
  });

  test("all-caps and statement titles", () => {
    expect(isHeadingLine("BALANCE SHEETS")).toBe(true);
    expect(isHeadingLine("Consolidated Balance Sheets")).toBe(true);
    expect(isHeadingLine("Item 8. Financial Statements")).toBe(true);
    expect(isHeadingLine("1. Organization")).toBe(true);
  });

  test("sentence lines are not headings", () => {
    expect(isHeadingLine("The Company operates in one segment.")).toBe(false);
    expect(
      isHeadingLine("For the years ended December 31, 2026, 2025 and 2024:"),
    ).toBe(false);
    expect(isHeadingLine("")).toBe(false);
    expect(isHeadingLine("---")).toBe(false);
    expect(isHeadingLine("   ")).toBe(false);
  });

  test("content fragments are not headings (fallback exclusions)", () => {
    expect(isHeadingLine("JavaScript, Go, SQL")).toBe(false);
    expect(isHeadingLine("Austin, TX  |  Mar 2023 – Present")).toBe(false);
    expect(isHeadingLine("May 2021")).toBe(false);
    expect(isHeadingLine("DIN: 10106739")).toBe(false);
    expect(isHeadingLine("AWS Certified Solutions Architect – Associate (2024)")).toBe(false);
    expect(isHeadingLine("July 9, 2026 CEO and Managing Director")).toBe(false);
    // Real titles still win via the explicit matchers above the fallback.
    expect(isHeadingLine("Consolidated Balance Sheets")).toBe(true);
    expect(isHeadingLine("Notes to Consolidated Financial Statements")).toBe(true);
  });

  test("normalize + extract + split", () => {
    expect(normalizeHeadingLine("  Balance   Sheets ")).toBe("Balance Sheets");
    expect(extractSectionTitle(["prose line.", "# Title", "more"])).toBe("# Title");
    expect(extractSectionTitle(["just prose."])).toBeNull();
    expect(splitIntoLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
  });

  test("dehyphenate rejoins line-break splits", () => {
    expect(dehyphenateText("Amazon Me-\nchanical Turk")).toBe("Amazon Mechanical Turk");
    expect(dehyphenateText("we cre-\nated a corpus")).toBe("we created a corpus");
    expect(dehyphenateText("PER-\nSUASIONFORGOOD")).toBe("PERSUASIONFORGOOD");
    expect(dehyphenateText("Asset-\nBacked Notes")).toBe("Asset-Backed Notes");
    expect(dehyphenateText("well-\r\nknown fact")).toBe("wellknown fact");
    expect(dehyphenateText("no splits here - just a dash")).toBe(
      "no splits here - just a dash",
    );
  });
});
