/**
 * Heading detection for section/parent assignment. Pure functions over
 * normalized line text. A line inside a table region is NEVER a heading —
 * callers must check table membership first (table detection runs before
 * heading classification per region).
 */

export function normalizeHeadingLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

export function splitIntoLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Rejoin words split by PDF line-break hyphenation ("Me-\nchanical" →
 * "Mechanical"). Same-case letter pairs join fully; mixed-case keeps the
 * hyphen ("Asset-\nBacked" → "Asset-Backed") since the break fell on a
 * real compound hyphen.
 */
export function dehyphenateText(text: string): string {
  return text.replace(/(\p{L})-\r?\n(\p{L})/gu, (_m, a, b) => {
    const lowerA = a === a.toLowerCase();
    const lowerB = b === b.toLowerCase();
    return lowerA === lowerB ? `${a}${b}` : `${a}-${b}`;
  });
}

const ATX_RE = /^#{1,6}\s+\S/;
const ALL_CAPS_RE = /^[A-Z][A-Z0-9 .&/()-]{2,60}$/;
const NUMBERED_RE = /^(\d+[.)]\s*)+[A-Z]/;
const STATEMENT_TITLE_RE =
  /^(consolidated\s+)?(balance sheets?|statements? of income|statements? of operations|statements? of cash flows?|statements? of (changes in )?(stockholders'?|shareholders'?|owners'?) equity|profit and loss|notes to (consolidated )?financial statements|management'?s discussion)/i;
const HORIZONTAL_RULE_RE = /^[-—=\s]+$/;

function looksSentenceLike(line: string): boolean {
  // Ends with a period → prose. A mid-line letter-period-space boundary
  // ("segment. It", "documents. 📈") is a sentence end; digit-period
  // ("Item 8. Financial") is enumeration → title.
  if (/\.\s*$/.test(line)) return true;
  return /[a-zA-Z]\.\s+\S/.test(line);
}

/**
 * True when the line opens a new section. Rules in order:
 * ATX markdown → statement-title override → ALL-CAPS/short-title →
 * numbered → short-title fallback. Sentence-like lines, horizontal rules,
 * and empty lines are never headings.
 */
export function isHeadingLine(line: string): boolean {
  const text = normalizeHeadingLine(line);

  if (!text) return false;
  if (HORIZONTAL_RULE_RE.test(text)) return false;
  if (ATX_RE.test(text)) return true;
  if (STATEMENT_TITLE_RE.test(text)) return true;
  if (ALL_CAPS_RE.test(text)) return true;
  if (NUMBERED_RE.test(text)) return true;

  // Content markers: lists, meta separators, labels, dates, and parenthetical
  // qualifiers mean a line is content, not a title ("JavaScript, Go, SQL",
  // "Austin, TX | Mar 2023 – Present", "DIN: 10106739", "May 2021",
  // "AWS Certified ... Associate (2024)"). Explicit matchers above (ATX,
  // statement titles, ALL-CAPS, numbered) still win for real headings.
  const FALLBACK_CONTENT_RE =
    /[|,:\u2013\u2014]|\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

  // Short-title fallback: brief, non-sentence, marker-free lines read as titles.
  if (
    text.length <= 80 &&
    /^[A-Z]/.test(text) &&
    !looksSentenceLike(text) &&
    !FALLBACK_CONTENT_RE.test(text) &&
    !/\)\s*$/.test(text)
  ) {
    return true;
  }

  return false;
}

/** First heading line in order, or null when the region has none. */
export function extractSectionTitle(lines: string[]): string | null {
  for (const line of lines) {
    if (isHeadingLine(line)) return normalizeHeadingLine(line);
  }
  return null;
}
