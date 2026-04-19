/**
 * Shared helpers for balance-sheet PDF line heuristics (equity, liabilities).
 */

/** Combined L+E line matches /^total\s+liabilities\b/ but is not the standalone liabilities row. */
export const LIABILITIES_AND_EQUITY_LINE_RE =
  /total\s+liabilities\s+(and|&)\s+((stock|share)holders?['\u2019]?\s+equity|equity)/i;

export function parseNumbersForPdfHeuristic(input: string): number[] {
  const out: number[] = [];
  const re = /\(([\d,]+(?:\.\d+)?)\)|(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const parsed = parseFloat(raw.replace(/,/g, ""));
    if (Number.isNaN(parsed)) continue;
    const value = m[1] ? -parsed : parsed;
    if (
      value >= 1900 &&
      value <= 2100 &&
      !raw.includes(",") &&
      !raw.includes(".")
    ) {
      continue;
    }
    out.push(value);
  }
  return out;
}
