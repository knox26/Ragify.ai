/**
 * Statement-type + consolidation tagging. Pure heuristic function —
 * deterministic and inspectable, no LLM in the hot ingestion path.
 * Runs per section/table; the tag is stamped onto every child.
 */

import type { ConsolidationScope, StatementType } from "./types";

type TitleMatcher = { type: StatementType; patterns: RegExp[] };

const TITLE_MATCHERS: TitleMatcher[] = [
  // notes first: a "Notes to ..." title wins over body line-item keywords.
  { type: "notes", patterns: [/\bnotes to\b/i] },
  {
    type: "income_statement",
    patterns: [
      /\bincome statements?\b/i,
      /\bstatements?\b.{0,20}\bof income\b/i,
      /\bstatement of operations\b/i,
      /\bprofit and loss\b/i,
      /\bearnings\b/i,
    ],
  },
  {
    type: "cash_flow",
    patterns: [/\bcash flows?\b/i, /\bstatement of cash\b/i],
  },
  {
    type: "balance_sheet",
    patterns: [/\bbalance sheets?\b/i, /\bstatement of financial position\b/i],
  },
  {
    type: "equity",
    patterns: [
      /\bstockholders\b/i,
      /\bshareholders\b/i,
      /\bchanges in equity\b/i,
      /\bstatement of changes\b/i,
    ],
  },
  {
    type: "mdna",
    patterns: [/\bmanagement'?s discussion\b/i, /\bmd&a\b/i, /\bresults of operations\b/i],
  },
];

const BODY_MATCHERS: TitleMatcher[] = [
  { type: "balance_sheet", patterns: [/\bcurrent assets\b/i, /\btotal assets\b/i, /\bliabilities\b/i] },
  { type: "income_statement", patterns: [/\bnet income\b/i, /\btotal revenue\b/i] },
  { type: "cash_flow", patterns: [/\boperating activities\b/i, /\bnet cash\b/i] },
  { type: "equity", patterns: [/\bretained earnings\b/i] },
];

function matchesAny(text: string, matchers: TitleMatcher[]): StatementType | null {
  for (const { type, patterns } of matchers) {
    if (patterns.some((re) => re.test(text))) return type;
  }
  return null;
}

/**
 * Title match wins; body line-item keywords apply only when the title is
 * absent/ambiguous. Priority: notes > income_statement > cash_flow >
 * balance_sheet > equity > mdna.
 */
export function detectStatementType(
  title: string | null,
  bodyLines: string[],
): StatementType {
  if (title) {
    const hit = matchesAny(title, TITLE_MATCHERS);
    if (hit) return hit;
  }

  if (bodyLines.length > 0) {
    const hit = matchesAny(bodyLines.join("\n"), BODY_MATCHERS);
    if (hit) return hit;
  }

  return "other";
}

export function detectConsolidation(
  title: string | null,
  bodyLines: string[],
): ConsolidationScope {
  const haystack = [title ?? "", ...bodyLines].join("\n");
  if (/\bconsolidated\b/i.test(haystack)) return "consolidated";
  if (/\bstandalone\b|\bparent company\b|\bcompany alone\b|\bseparate\b/i.test(haystack)) {
    return "parent_company";
  }
  return "unspecified";
}
