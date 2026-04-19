// ---------------------------------------------------------------------------
// Total Equity Heuristic Extraction
// Finds "Total stockholders' equity" from PDF text via pattern-based search
// when AI extraction missed or returned an incorrect value.
// ---------------------------------------------------------------------------

export type EquityConfidence = "high" | "medium" | "low";

export interface EquityExtractionResult {
  totalEquity: number | null;
  labelUsed: string | null;
  confidence: EquityConfidence;
}

export function extractTotalEquityHeuristic(
  text: string,
  scaleNote: string | undefined
): EquityExtractionResult {
  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  const lines = text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const liabilitiesAndEquityPattern =
    /total\s+liabilities\s+(and|&)\s+((stock|share)holders?['\u2019]?\s+equity|equity)/i;
  const totalLiabilitiesPattern = /^total\s+liabilities\b/i;
  const companySpecificPattern =
    /^company\s+shareholders?['\u2019]?\s+equity\b/i;

  const equityPatterns: Array<{
    pattern: RegExp;
    confidence: EquityConfidence;
    isTotal: boolean;
  }> = [
    {
      pattern: /^total\s+shareholders?['\u2019]?\s+equity\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+stockholders?['\u2019]?\s+equity\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+shareholders?['\u2019]?\s+investment\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+stockholders?['\u2019]?\s+investment\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+equity\b/i,
      confidence: "medium",
      isTotal: true,
    },
    {
      pattern: /^shareholders?['\u2019]?\s+investment\b/i,
      confidence: "medium",
      isTotal: false,
    },
  ];

  function parseNumbers(input: string): number[] {
    const out: number[] = [];
    const re = /\(([\d,]+(?:\.\d+)?)\)|(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const raw = m[1] ?? m[2];
      if (!raw) continue;
      const parsed = parseFloat(raw.replace(/,/g, ""));
      if (Number.isNaN(parsed)) continue;
      const value = m[1] ? -parsed : parsed;
      // Filter likely year headers (e.g. 2025) from OCR/table text.
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

  interface Candidate {
    idx: number;
    label: string;
    valueRaw: number;
    confidence: EquityConfidence;
    isTotal: boolean;
    isCompanySpecific: boolean;
  }

  let finalLiabilitiesAndEquityIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (liabilitiesAndEquityPattern.test(lines[i])) {
      finalLiabilitiesAndEquityIdx = i;
      break;
    }
  }

  let startIdx = 0;
  let endIdx = lines.length - 1;
  if (finalLiabilitiesAndEquityIdx !== -1) {
    startIdx = Math.max(0, finalLiabilitiesAndEquityIdx - 160);
    endIdx = finalLiabilitiesAndEquityIdx;
    for (let i = finalLiabilitiesAndEquityIdx; i >= startIdx; i--) {
      if (totalLiabilitiesPattern.test(lines[i])) {
        startIdx = i;
        break;
      }
    }
  }

  const candidates: Candidate[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const label = lines[i];
    const matchedPattern = equityPatterns.find((p) => p.pattern.test(label));
    const isCompanySpecific = companySpecificPattern.test(label);
    if (!matchedPattern && !isCompanySpecific) continue;

    const context = lines.slice(i, Math.min(lines.length, i + 3)).join(" ");
    const tail = context.slice(label.length).trim();
    const values = parseNumbers(tail);
    const valuesFallback = values.length > 0 ? values : parseNumbers(context);
    if (valuesFallback.length === 0) continue;

    candidates.push({
      idx: i,
      label,
      valueRaw: valuesFallback[0],
      confidence: matchedPattern?.confidence ?? "low",
      isTotal: matchedPattern?.isTotal ?? false,
      isCompanySpecific,
    });
  }

  if (candidates.length === 0) {
    return { totalEquity: null, labelUsed: null, confidence: "low" };
  }

  const nonCompanyTotalCandidates = candidates.filter(
    (c) => c.isTotal && !c.isCompanySpecific
  );
  const nonCompanyCandidates = candidates.filter((c) => !c.isCompanySpecific);

  const selected =
    nonCompanyTotalCandidates[nonCompanyTotalCandidates.length - 1] ??
    nonCompanyCandidates[nonCompanyCandidates.length - 1] ??
    candidates[candidates.length - 1];

  const totalEquity = Math.round(selected.valueRaw * scale * 100) / 100;
  return {
    totalEquity,
    labelUsed: selected.label,
    confidence: selected.confidence,
  };
}

/**
 * Compute the percentage gap between Assets and (Liabilities + Equity).
 * Returns Infinity if any input is null or Assets is 0.
 */
export function computeBalanceGapPct(
  assets: number | null,
  liabilities: number | null,
  equity: number | null
): number {
  if (
    assets == null ||
    liabilities == null ||
    equity == null ||
    assets === 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(assets - (liabilities + equity)) / Math.abs(assets);
}
