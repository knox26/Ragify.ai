import { describe, expect, test } from "bun:test";
import {
  detectConsolidation,
  detectStatementType,
} from "../services/chunking/statementDetector";

describe("statementDetector", () => {
  test("title keyword sets", () => {
    expect(detectStatementType("Consolidated Balance Sheets", [])).toBe("balance_sheet");
    expect(detectStatementType("Statements of Income", [])).toBe("income_statement");
    expect(detectStatementType("Statements of Cash Flows", [])).toBe("cash_flow");
    expect(detectStatementType("Statement of Changes in Equity", [])).toBe("equity");
    expect(detectStatementType("Notes to Consolidated Financial Statements", [])).toBe("notes");
    expect(detectStatementType("Management's Discussion", [])).toBe("mdna");
    expect(detectStatementType("Random Section", [])).toBe("other");
    expect(detectStatementType(null, [])).toBe("other");
  });

  test("notes title beats body keywords", () => {
    expect(
      detectStatementType("Notes to Financial Statements", ["Total revenue 100", "Net income 10"]),
    ).toBe("notes");
  });

  test("body fallback when title absent", () => {
    expect(detectStatementType(null, ["Current assets 50", "Total assets 90"])).toBe(
      "balance_sheet",
    );
    expect(detectStatementType(null, ["Net cash from operating activities 5"])).toBe(
      "cash_flow",
    );
  });

  test("consolidation scope", () => {
    expect(detectConsolidation("Consolidated Balance Sheets", [])).toBe("consolidated");
    expect(detectConsolidation("Standalone Profit and Loss", [])).toBe("parent_company");
    expect(detectConsolidation(null, ["parent company figures"])).toBe("parent_company");
    expect(detectConsolidation("Balance Sheet", [])).toBe("unspecified");
  });
});
