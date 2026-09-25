import { describe, expect, spyOn, test } from "bun:test";
import {
  classifyByRules,
  looksLikeComparison,
  looksLikeConceptual,
  looksLikeMetricCalc,
  looksLikeMultiHop,
  parseRouteResponse,
  routeQuery,
  routeStrategy,
  type QueryRoute,
} from "../services/queryRouter";

// ---------------------------------------------------------------------------
// Rule matchers
// ---------------------------------------------------------------------------

describe("looksLikeComparison", () => {
  test("matches 'compare'", () => {
    expect(looksLikeComparison("Compare AES and TCS ROA")).toBe(true);
  });

  test("matches 'vs'", () => {
    expect(looksLikeComparison("AES vs TCS profit")).toBe(true);
  });

  test("matches 'versus'", () => {
    expect(looksLikeComparison("AES versus TCS profit")).toBe(true);
  });

  test("matches 'difference between'", () => {
    expect(looksLikeComparison("Difference between AES and TCS profit")).toBe(true);
  });

  test("matches two capitalized entities joined by 'and'", () => {
    expect(looksLikeComparison("AES and TCS")).toBe(true);
  });

  test("does not match a single entity", () => {
    expect(looksLikeComparison("What was AES revenue?")).toBe(false);
  });
});

describe("looksLikeMetricCalc", () => {
  test("matches ratio", () => {
    expect(looksLikeMetricCalc("What is the current ratio?")).toBe(true);
  });

  test("matches ROA / ROE", () => {
    expect(looksLikeMetricCalc("AES ROA for FY27")).toBe(true);
  });

  test("matches growth / change / percentage", () => {
    expect(looksLikeMetricCalc("What was the revenue growth?")).toBe(true);
    expect(looksLikeMetricCalc("Calculate the percentage change.")).toBe(true);
  });

  test("does not match a plain lookup", () => {
    expect(looksLikeMetricCalc("What was the revenue?")).toBe(false);
  });
});

describe("looksLikeMultiHop", () => {
  test("matches two asks joined by 'and'", () => {
    expect(
      looksLikeMultiHop("What was AES revenue and what was the profit?"),
    ).toBe(true);
  });

  test("matches asks separated by semicolon", () => {
    expect(
      looksLikeMultiHop("Give me AES revenue; what was the net income?"),
    ).toBe(true);
  });

  test("matches pronouns requiring prior context", () => {
    expect(looksLikeMultiHop("What was it last year?")).toBe(true);
  });

  test("does not match a single ask", () => {
    expect(looksLikeMultiHop("What was AES revenue?")).toBe(false);
  });
});

describe("looksLikeConceptual", () => {
  test("matches 'what is'", () => {
    expect(looksLikeConceptual("What is a balance sheet?")).toBe(true);
  });

  test("matches 'explain'", () => {
    expect(looksLikeConceptual("Explain the difference between revenue and profit.")).toBe(true);
  });

  test("matches 'why'", () => {
    expect(looksLikeConceptual("Why does the margin fluctuate?")).toBe(true);
  });

  test("matches 'how does'", () => {
    expect(looksLikeConceptual("How does ROA work?")).toBe(true);
  });

  test("does not match a numeric question", () => {
    expect(looksLikeConceptual("What was AES revenue in FY27?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyByRules — precedence
// ---------------------------------------------------------------------------

describe("classifyByRules", () => {
  test("returns null for an empty question", () => {
    expect(classifyByRules("")).toBeNull();
    expect(classifyByRules("   ")).toBeNull();
  });

  test("routes comparison before metric_calc when both match", () => {
    expect(
      classifyByRules("Compare ROA of AES vs TCS"),
    ).toBe("comparison");
  });

  test("routes metric_calc when ratio/ROA present, no comparison", () => {
    expect(classifyByRules("What was AES ROA in FY27?")).toBe("metric_calc");
  });

  test("routes multi_hop when joined asks", () => {
    expect(
      classifyByRules("What was AES revenue and what was the profit?"),
    ).toBe("multi_hop");
  });

  test("routes conceptual for 'what is'", () => {
    expect(classifyByRules("What is a balance sheet?")).toBe("conceptual");
  });

  test("routes lookup when no strong signal fires", () => {
    expect(classifyByRules("AES revenue FY27")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseRouteResponse — defensive parser
// ---------------------------------------------------------------------------

describe("parseRouteResponse", () => {
  test("parses clean JSON", () => {
    expect(
      parseRouteResponse('{"route": "metric_calc", "confidence": 0.9}'),
    ).toEqual({ route: "metric_calc", confidence: 0.9 });
  });

  test("strips code fences", () => {
    expect(
      parseRouteResponse(
        '```json\n{"route": "lookup", "confidence": 0.6}\n```',
      ),
    ).toEqual({ route: "lookup", confidence: 0.6 });
  });

  test("clamps confidence to 0..1", () => {
    expect(
      parseRouteResponse('{"route": "lookup", "confidence": 1.5}'),
    ).toEqual({ route: "lookup", confidence: 1 });
    expect(
      parseRouteResponse('{"route": "lookup", "confidence": -0.3}'),
    ).toEqual({ route: "lookup", confidence: 0 });
  });

  test("defaults confidence when missing or non-numeric", () => {
    expect(parseRouteResponse('{"route": "lookup"}')).toEqual({
      route: "lookup",
      confidence: 0.5,
    });
  });

  test("returns null on unknown route", () => {
    expect(parseRouteResponse('{"route": "garbage", "confidence": 0.9}')).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    expect(parseRouteResponse("not json")).toBeNull();
  });

  test("returns null when route is missing", () => {
    expect(parseRouteResponse('{"confidence": 0.9}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// routeQuery — full flow with mocked LLM fallback
// ---------------------------------------------------------------------------

describe("routeQuery", () => {
  test("returns the default route when disabled", async () => {
    const result = await routeQuery("anything", { enabled: false });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });

  test("rule hit bypasses LLM", async () => {
    const spy = spyOn(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../services/chatService"),
      "generateText",
    );

    try {
      const result = await routeQuery("Compare AES and TCS ROA");
      expect(result.route).toBe("comparison");
      expect(result.source).toBe("rule");
      expect(result.confidence).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("falls back to LLM when rules are inconclusive and llmFallback=true", async () => {
    const fakeGenerate = async () =>
      '{"route": "conceptual", "confidence": 0.7}';

    const result = await routeQuery("TCS Q1 earnings", {
      generateText: fakeGenerate,
    });

    expect(result).toEqual({
      route: "conceptual",
      source: "llm",
      confidence: 0.7,
    });
  });

  test("returns default when llmFallback=false and rules inconclusive", async () => {
    const result = await routeQuery("anything goes here", { llmFallback: false });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });

  test("returns default when LLM throws", async () => {
    const result = await routeQuery("anything goes here", {
      generateText: async () => {
        throw new Error("Gemini down");
      },
    });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });

  test("returns default when LLM returns malformed JSON", async () => {
    const result = await routeQuery("anything goes here", {
      generateText: async () => "sorry, I cannot classify",
    });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });

  test("returns default when LLM returns unknown route", async () => {
    const result = await routeQuery("anything goes here", {
      generateText: async () => '{"route": "mystery"}',
    });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });

  test("returns default when question is whitespace", async () => {
    const result = await routeQuery("   ", {
      generateText: async () => '{"route": "lookup"}',
    });
    expect(result).toEqual({ route: "default", source: "default", confidence: 0 });
  });
});

// ---------------------------------------------------------------------------
// routeStrategy — D3 matrix
// ---------------------------------------------------------------------------

describe("routeStrategy (D3 matrix)", () => {
  const cases: Array<[QueryRoute, string[]]> = [
    ["lookup", ["decompose"]],
    ["metric_calc", ["decompose", "gapFill"]],
    ["multi_hop", ["decompose", "stepback", "gapFill"]],
    ["comparison", ["decompose", "stepback", "gapFill"]],
    ["conceptual", ["decompose", "hyde", "stepback"]],
  ];

  for (const [route, expected] of cases) {
    test(`${route} enables ${expected.join(", ")}`, () => {
      const set = routeStrategy(route);
      const got: string[] = [...set].sort();
      const want: string[] = [...expected].sort();
      expect(got).toEqual(want);
    });
  }

  test("default route reproduces current path (decompose + gapFill, no HyDE)", () => {
    const set = routeStrategy("default" as QueryRoute);
    expect(set.has("hyde")).toBe(false);
    expect(set.has("stepback")).toBe(false);
    expect(set.has("decompose")).toBe(true);
    expect(set.has("gapFill")).toBe(true);
  });
});
