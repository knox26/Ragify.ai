import { describe, expect, test } from "bun:test";
import { parseGapResponse } from "../services/gapFillService";

describe("parseGapResponse", () => {
  test("complete response yields no follow-up queries", () => {
    expect(parseGapResponse('{"complete": true}')).toEqual([]);
  });

  test("missing response yields trimmed, deduped queries", () => {
    expect(
      parseGapResponse(
        '{"complete": false, "missing": ["total assets FY2021", " total assets FY2022 "]}',
      ),
    ).toEqual(["total assets FY2021", "total assets FY2022"]);
  });

  test("strips code fences", () => {
    expect(
      parseGapResponse('```json\n{"complete": false, "missing": ["cost of goods sold"]}\n```'),
    ).toEqual(["cost of goods sold"]);
  });

  test("caps at three queries", () => {
    expect(
      parseGapResponse(
        '{"complete": false, "missing": ["a", "b", "c", "d"]}',
      ),
    ).toEqual(["a", "b", "c"]);
  });

  test("drops non-string entries", () => {
    expect(
      parseGapResponse('{"complete": false, "missing": ["x", 3, null, "y"]}'),
    ).toEqual(["x", "y"]);
  });

  test("malformed input falls back to no gaps", () => {
    expect(parseGapResponse("not json at all")).toEqual([]);
    expect(parseGapResponse('{"missing": ["x"]}')).toEqual([]);
  });
});
