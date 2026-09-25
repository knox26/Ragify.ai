import { describe, expect, test } from "bun:test";
import {
  buildOrderedVariants,
  buildQueryVariants,
  parseStepbackResponse,
} from "../services/queryRewriter";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("buildOrderedVariants", () => {
  test("drops nulls", () => {
    const out = buildOrderedVariants(
      [
        { kind: "original", text: "q" },
        null,
        { kind: "subquery", text: "q1" },
      ],
      10,
    );
    expect(out).toHaveLength(2);
  });

  test("dedupes by normalized text", () => {
    const out = buildOrderedVariants(
      [
        { kind: "original", text: "Hello World" },
        { kind: "subquery", text: "  hello   world  " },
        { kind: "hyde", text: "different" },
      ],
      10,
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe("original");
    expect(out[1]?.kind).toBe("hyde");
  });

  test("preserves order", () => {
    const out = buildOrderedVariants(
      [
        { kind: "original", text: "a" },
        { kind: "subquery", text: "b" },
        { kind: "stepback", text: "c" },
        { kind: "hyde", text: "d" },
      ],
      10,
    );
    expect(out.map((v) => v.kind)).toEqual([
      "original",
      "subquery",
      "stepback",
      "hyde",
    ]);
  });

  test("caps at maxVariants", () => {
    const out = buildOrderedVariants(
      Array.from({ length: 10 }, (_, i) => ({
        kind: "subquery" as const,
        text: `q${i}`,
      })),
      3,
    );
    expect(out).toHaveLength(3);
  });

  test("returns [] for empty input", () => {
    expect(buildOrderedVariants([], 10)).toEqual([]);
  });
});

describe("parseStepbackResponse", () => {
  test("parses clean JSON", () => {
    expect(
      parseStepbackResponse('{"stepback": "What factors affect ROA?"}'),
    ).toBe("What factors affect ROA?");
  });

  test("strips code fences", () => {
    expect(
      parseStepbackResponse(
        '```json\n{"stepback": "abstract question"}\n```',
      ),
    ).toBe("abstract question");
  });

  test("returns null on missing field", () => {
    expect(parseStepbackResponse('{"other": "x"}')).toBeNull();
  });

  test("returns null on empty string", () => {
    expect(parseStepbackResponse('{"stepback": "   "}')).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    expect(parseStepbackResponse("not json")).toBeNull();
  });

  test("returns null on non-string stepback", () => {
    expect(parseStepbackResponse('{"stepback": 42}')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildQueryVariants — full flow
// ---------------------------------------------------------------------------

describe("buildQueryVariants", () => {
  test("returns [] for empty question", async () => {
    expect(await buildQueryVariants("", "lookup")).toEqual([]);
    expect(await buildQueryVariants("   ", "lookup")).toEqual([]);
  });

  test("returns just the original when no rewrite strategies are enabled", async () => {
    const out = await buildQueryVariants("What was AES revenue?", "lookup", {
      decomposeQuery: async () => ["What was AES revenue?"], // no-op decompose
    });
    expect(out.map((v) => v.kind)).toEqual(["original"]);
    expect(out[0]?.text).toBe("What was AES revenue?");
  });

  test("includes subqueries when decompose is enabled", async () => {
    const out = await buildQueryVariants(
      "What was AES revenue and profit?",
      "metric_calc",
      {
        decomposeQuery: async () => ["AES revenue FY27", "AES profit FY27"],
        stepbackEnabled: false,
        hydeEnabled: false,
      },
    );
    const kinds = out.map((v) => v.kind);
    expect(kinds).toContain("original");
    expect(kinds).toContain("subquery");
    expect(out.filter((v) => v.kind === "subquery")).toHaveLength(2);
  });

  test("route-gates HyDE off for lookup/metric_calc/multi_hop/comparison", async () => {
    let hydeCallCount = 0;
    const fakeGen = async () => {
      hydeCallCount++;
      return "hypothetical";
    };

    for (const route of ["lookup", "metric_calc", "comparison"] as const) {
      const out = await buildQueryVariants("What was AES revenue?", route, {
        decomposeQuery: async () => ["x"],
        generateText: fakeGen,
      });
      expect(out.find((v) => v.kind === "hyde")).toBeUndefined();
      // Reset for next iteration.
      hydeCallCount = 0;
    }
    // HyDE should never have been called.
    expect(hydeCallCount).toBe(0);
  });

  test("skips HyDE for short factual questions even on conceptual", async () => {
    let hydeCalled = false;
    const fakeGen = async () => {
      hydeCalled = true;
      return "A short hypothetical answer.";
    };
    const out = await buildQueryVariants("How is intent annotated?", "conceptual", {
      decomposeQuery: async () => ["How is intent annotated?"],
      generateText: fakeGen,
      stepbackEnabled: false,
    });
    expect(out.find((v) => v.kind === "hyde")).toBeUndefined();
    expect(hydeCalled).toBe(false);
  });

  test("keeps HyDE for longer conceptual questions", async () => {
    const out = await buildQueryVariants(
      "Why do rumors spread faster than verified news on social media?",
      "conceptual",
      {
        decomposeQuery: async () => ["Why do rumors spread?"],
        generateText: async () => "A short hypothetical answer.",
        stepbackEnabled: false,
      },
    );
    expect(out.find((v) => v.kind === "hyde")).toBeDefined();
  });

  test("enables HyDE only for conceptual", async () => {
    let hydeCalled = false;
    const fakeGen = async () => {
      hydeCalled = true;
      return "A short hypothetical answer.";
    };

    const out = await buildQueryVariants(
      "What is a balance sheet and why do companies prepare one alongside income statements?",
      "conceptual",
      {
        decomposeQuery: async () => ["balance sheet purpose"], // dedupe to nothing
        generateText: fakeGen,
      },
    );

    expect(hydeCalled).toBe(true);
    expect(out.find((v) => v.kind === "hyde")).toBeDefined();
  });

  test("route-gates step-back off for lookup/metric_calc", async () => {
    let stepbackCalled = false;
    const fakeGen = async () => {
      stepbackCalled = true;
      return '{"stepback": "abstract"}';
    };

    for (const route of ["lookup", "metric_calc"] as const) {
      const out = await buildQueryVariants("AES ROA", route, {
        decomposeQuery: async () => ["AES ROA"],
        generateText: fakeGen,
      });
      expect(out.find((v) => v.kind === "stepback")).toBeUndefined();
      stepbackCalled = false;
    }
  });

  test("enables step-back for multi_hop / comparison / conceptual", async () => {
    let stepbackCalled = false;
    const fakeGen = async () => {
      stepbackCalled = true;
      return '{"stepback": "abstract"}';
    };

    for (const route of ["multi_hop", "comparison", "conceptual"] as const) {
      const out = await buildQueryVariants("AES vs TCS", route, {
        decomposeQuery: async () => ["AES vs TCS"],
        generateText: fakeGen,
      });
      expect(out.find((v) => v.kind === "stepback")).toBeDefined();
      stepbackCalled = false;
    }
  });

  test("global feature switches override route-gating (off)", async () => {
    let called = false;
    const fakeGen = async () => {
      called = true;
      return "ignored";
    };

    const out = await buildQueryVariants("What is X?", "conceptual", {
      decomposeQuery: async () => ["what is x?"],
      generateText: fakeGen,
      hydeEnabled: false,
      stepbackEnabled: false,
    });

    expect(called).toBe(false);
    expect(out.find((v) => v.kind === "hyde")).toBeUndefined();
    expect(out.find((v) => v.kind === "stepback")).toBeUndefined();
  });

  test("failures in decompose drop the subqueries only", async () => {
    const out = await buildQueryVariants("AES revenue", "lookup", {
      decomposeQuery: async () => {
        throw new Error("decompose failed");
      },
    });
    // Original still present; no subqueries; no throw.
    expect(out.map((v) => v.kind)).toEqual(["original"]);
  });

  test("failures in HyDE drop that variant only", async () => {
    const out = await buildQueryVariants("What is X?", "conceptual", {
      decomposeQuery: async () => ["what is x?", "x definition"],
      generateText: async () => {
        throw new Error("LLM down");
      },
      stepbackEnabled: false,
    });
    // Original + subquery survive; no hyde.
    expect(out.map((v) => v.kind)).toEqual(["original", "subquery"]);
  });

  test("failures in step-back drop that variant only", async () => {
    const out = await buildQueryVariants("What is X?", "conceptual", {
      decomposeQuery: async () => ["what is x?", "x definition"],
      generateText: async () => {
        throw new Error("LLM down");
      },
      hydeEnabled: false,
    });
    expect(out.map((v) => v.kind)).toEqual(["original", "subquery"]);
  });

  test("maxVariants caps the total", async () => {
    const out = await buildQueryVariants("AES ROA", "metric_calc", {
      decomposeQuery: async () => ["q1", "q2", "q3", "q4", "q5"],
      maxVariants: 3,
      generateText: async () => "never called",
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });

  test("default route produces today-equivalent set (decompose only)", async () => {
    const out = await buildQueryVariants("anything", "default", {
      decomposeQuery: async () => ["anything", "anything else"],
      generateText: async () => "ignored",
    });
    expect(out.find((v) => v.kind === "hyde")).toBeUndefined();
    expect(out.find((v) => v.kind === "stepback")).toBeUndefined();
    expect(out.find((v) => v.kind === "original")).toBeDefined();
    expect(out.find((v) => v.kind === "subquery")).toBeDefined();
  });
});
