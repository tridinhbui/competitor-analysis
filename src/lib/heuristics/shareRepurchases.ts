// ---------------------------------------------------------------------------
// Share Repurchases Heuristic
// Extracts share repurchase amounts from cash flow, equity statement,
// and note tables when AI extraction missed or zeroed the value.
// ---------------------------------------------------------------------------

import { debugLog } from "../debugLogger";

function detectScaleNote(text: string): string | undefined {
  const normalized = text.toLowerCase();
  if (/in\s+thousands?,\s+except\s+(?:per\s+share|share)/i.test(normalized)) return "thousands";
  if (/amounts?\s+in\s+thousands/i.test(normalized)) return "thousands";
  if (/\(\s*in\s+thousands?\s*\)/i.test(normalized)) return "thousands";
  if (/dollars?\s+in\s+thousands/i.test(normalized)) return "thousands";
  if (/in\s+millions?,\s+except\s+(?:per\s+share|share)/i.test(normalized)) return "millions";
  if (/\(\s*in\s+millions?\s*\)/i.test(normalized)) return "millions";
  if (/dollars?\s+in\s+millions/i.test(normalized)) return "millions";
  if (/in\s+billions?\b/i.test(normalized) || /\(\s*in\s+billions?\s*\)/i.test(normalized)) return "billions";
  return undefined;
}

export function extractShareRepurchasesHeuristic(
  text: string,
  scaleNote: string | undefined
): number | null {
  let scale = 1;
  const effectiveScale = scaleNote ?? detectScaleNote(text);
  if (effectiveScale === "thousands") scale = 0.001;
  else if (effectiveScale === "billions") scale = 1000;

  // All positive decimal/integer values from a string.
  // Parenthesised values ("(26)") are treated as positive outflows.
  function numsFrom(s: string): number[] {
    const out: number[] = [];
    const re = /\(?([\d,]+(?:\.\d+)?)\)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }

  // First parenthesised amount: "(26)" → 26
  function parseParen(s: string): number | null {
    const m = s.match(/\(([\d,]+(?:\.\d+)?)\)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }

  // Build a lookahead window: the matched line plus up to `ahead` following lines.
  // PDF table rows are frequently split so the label and value land on different lines.
  function window(arr: string[], i: number, ahead = 3): string {
    return arr.slice(i, i + 1 + ahead).join(" ");
  }

  const lines = text.split(/\n/);

  // --- Priority 1: Cash flow financing section ---
  // Label: "Purchases of Tyson Class A common stock", "Repurchases of common stock", etc.
  const cfSectionMatch = text.match(
    /(?:cash\s+flows?\s+(?:from|used\s+in)\s+financing|financing\s+activities)[\s\S]{0,5000}/i
  );
  if (cfSectionMatch) {
    const cfLines = cfSectionMatch[0].split(/\n/);
    const cfPattern =
      /(?:purchases?|repurchases?)\s+of\s+(?:[\w\s]*?\s+)?(?:class\s+[a-z]\s+)?common\s+stock|treasury\s+stock\s+purchase/i;
    for (let i = 0; i < cfLines.length; i++) {
      if (cfPattern.test(cfLines[i])) {
        const candidate = window(cfLines, i);
        debugLog("[repurchase:cf-stmt] label line:", cfLines[i].trim());
        debugLog("[repurchase:cf-stmt] candidate window:", candidate.trim());
        const amt = parseParen(candidate);
        if (amt != null && amt >= 1) {
          debugLog("[repurchase:cf-stmt] parsed (paren):", amt);
          return Math.round(amt * scale * 100) / 100;
        }
        const nums = numsFrom(candidate).filter(n => n >= 1);
        debugLog("[repurchase:cf-stmt] nums:", nums);
        if (nums.length > 0) {
          return Math.round(nums[0] * scale * 100) / 100;
        }
      }
    }
  }

  // --- Priority 2: Equity statement "Purchase of Class A common stock  (26)" ---
  // The amount may be on the same line or on the next 1–3 lines.
  const equityPattern = /purchase\s+of\s+(?:class\s+[a-z]\s+)?common\s+stock/i;
  for (let i = 0; i < lines.length; i++) {
    if (equityPattern.test(lines[i])) {
      const candidate = window(lines, i);
      debugLog("[repurchase:equity-stmt] label line:", lines[i].trim());
      debugLog("[repurchase:equity-stmt] candidate window:", candidate.trim());
      const amt = parseParen(candidate);
      debugLog("[repurchase:equity-stmt] parsed (paren):", amt);
      if (amt != null && amt >= 1) {
        return Math.round(amt * scale * 100) / 100;
      }
    }
  }

  // --- Priority 3: Note table "Total share repurchases  0.4  26  0.2  13" ---
  // Table layout: [shares_recent, dollars_recent, shares_prior, dollars_prior]
  // We want dollars_recent = nums[1] after the label.
  // The numeric row may be on the next line when the PDF wraps.
  const noteSliceMatch =
    text.match(/note\s+\d+[^a-z]*equity[\s\S]{0,12000}/i) ??
    text.match(/share\s+repurchase\s+program[\s\S]{0,6000}/i) ??
    text.match(/repurchase\s+program[\s\S]{0,6000}/i);
  const searchText = noteSliceMatch ? noteSliceMatch[0] : text;
  const searchLines = searchText.split(/\n/);

  const totalRowPattern = /total\s+(?:share\s+)?repurchases?/i;
  for (let i = 0; i < searchLines.length; i++) {
    if (totalRowPattern.test(searchLines[i])) {
      const candidate = window(searchLines, i);
      debugLog("[repurchase:note-table] label line:", searchLines[i].trim());
      debugLog("[repurchase:note-table] candidate window:", candidate.trim());
      // Extract numbers only from the portion after the matched label
      const labelMatch = candidate.match(/total\s+(?:share\s+)?repurchases?(.*)/i);
      const tail = labelMatch ? labelMatch[1] : candidate;
      const nums = numsFrom(tail);
      debugLog("[repurchase:note-table] nums after label:", nums);
      // nums[0] = share count (e.g. 0.4), nums[1] = dollar amount (e.g. 26)
      if (nums.length >= 2 && nums[1] >= 1) {
        return Math.round(nums[1] * scale * 100) / 100;
      }
      if (nums.length === 1 && nums[0] >= 1) {
        return Math.round(nums[0] * scale * 100) / 100;
      }
    }
  }

  return null;
}
