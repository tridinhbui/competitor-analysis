/**
 * When the cash flow statement does not map "Dividends paid", scan Note 11 / EPS /
 * dividend disclosures for **dividends declared** (often by share class). Amounts
 * approximate cash dividends and are labeled accordingly in the UI via extractionRepairs.
 */

import type { BSItem } from "@/types/analysis";

/** Reject tiny note parses (e.g. footnote artifacts); avoids showing a wrong $8M vs real dividends. */
const MIN_NOTE_DIVIDENDS_MILLIONS = 50;

function scaleMultiplier(scaleNote: string | undefined): number {
  const n = scaleNote?.toLowerCase();
  if (n === "thousands") return 0.001;
  if (n === "billions") return 1000;
  return 1;
}

function parseMillions(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ""));
  if (Number.isNaN(n) || n < 1 || n > 500_000) return null;
  return n;
}

/**
 * Prefer Note 11 / earnings per share / dividend policy blocks (shorter search = fewer false positives).
 */
function noteSlice(text: string): string {
  const lower = text.toLowerCase();
  const markers = [
    /\bnote\s+11\b/i,
    /\bearnings\s+per\s+share\b/i,
    /\bdividends?\s+(?:declared|per\s+share)\b/i,
    /\bdividend\s+(?:policy|information)\b/i,
  ];
  let best = "";
  for (const re of markers) {
    const m = lower.match(re);
    if (m?.index != null) {
      const start = Math.max(0, m.index - 400);
      const chunk = text.slice(start, start + 22_000);
      if (chunk.length > best.length) best = chunk;
    }
  }
  return best || text;
}

export interface DividendsNoteExtract {
  millions: number | null;
  /** Short provenance for extractionRepairs */
  detail: string | null;
}

/**
 * Extract total dividends declared (sum of share classes when listed separately).
 */
export function extractDividendsDeclaredFromNotes(
  text: string,
  scaleNote: string | undefined
): DividendsNoteExtract {
  const scale = scaleMultiplier(scaleNote);
  const slice = noteSlice(text);

  // Single total: "Total dividends declared ... 700"
  const totalM = slice.match(
    /\btotal\s+dividends?\s+declared\b[^0-9]{0,350}?(\d{1,3}(?:,\d{3})*)\b/i
  );
  if (totalM?.[1]) {
    const v = parseMillions(totalM[1]);
    if (v != null) {
      const millions = Math.round(v * scale * 100) / 100;
      return {
        millions,
        detail: "Matched total dividends declared line in notes.",
      };
    }
  }

  // Class A / Class B "dividends declared" (Tyson-style dual class)
  const classAmounts: number[] = [];
  const classRe =
    /class\s+([ab])[\s\S]{0,520}?(?:cash\s+)?dividends?\s+declared[\s\S]{0,180}?(\d{1,3}(?:,\d{3})*)/gi;
  let m: RegExpExecArray | null;
  while ((m = classRe.exec(slice)) !== null) {
    const v = parseMillions(m[2] ?? "");
    if (v != null) classAmounts.push(v);
  }

  if (classAmounts.length >= 1) {
    const rawSum = classAmounts.reduce((a, b) => a + b, 0);
    const millions = Math.round(rawSum * scale * 100) / 100;
    return {
      millions,
      detail: `Summed ${classAmounts.length} share-class dividends declared line(s) in notes.`,
    };
  }

  // Alternate word order: "dividends declared on Class A ... 574" / "declared ... Class A ... 574"
  const altRe =
    /dividends?\s+declared[\s\S]{0,500}?class\s+([ab])[\s\S]{0,160}?(\d{1,3}(?:,\d{3})*)/gi;
  const altVals: number[] = [];
  while ((m = altRe.exec(slice)) !== null) {
    const v = parseMillions(m[2] ?? "");
    if (v != null) altVals.push(v);
  }
  if (altVals.length >= 1) {
    const rawSum = altVals.reduce((a, b) => a + b, 0);
    const millions = Math.round(rawSum * scale * 100) / 100;
    return {
      millions,
      detail: `Summed share-class dividends declared (alternate wording) in notes.`,
    };
  }

  return { millions: null, detail: null };
}

/**
 * If CF has no dividends paid tags, backfill from note heuristic.
 * Mutates `cfItems`.
 */
export function applyDividendsDeclaredNoteFallback(
  cfItems: BSItem[],
  filingText: string,
  scaleNote: string | undefined,
  period: string
): string[] {
  const repairs: string[] = [];
  const existing = cfItems.find(
    (i) =>
      (i.tag === "PaymentsOfDividends" ||
        i.tag === "PaymentsOfDividendsCommonStock") &&
      Math.abs(i.value) > 1
  );
  if (existing) return repairs;

  const { millions, detail } = extractDividendsDeclaredFromNotes(
    filingText,
    scaleNote
  );
  if (millions == null || millions < 1) return repairs;
  if (Math.abs(millions) < MIN_NOTE_DIVIDENDS_MILLIONS) return repairs;

  cfItems.push({
    tag: "PaymentsOfDividends",
    label: "Dividends declared (from notes)",
    value: millions,
    period,
    source: "heuristic:notes_dividends_declared",
  });
  repairs.push(
    `Dividends: filled ~${millions.toLocaleString()}M from note disclosure (dividends declared). Cash flow "dividends paid" line was not mapped — amounts may differ slightly from cash paid.${detail ? ` ${detail}` : ""}`
  );
  return repairs;
}
