import {
  LIABILITIES_AND_EQUITY_LINE_RE,
  parseNumbersForPdfHeuristic,
} from "./pdfHeuristicNumbers";

export interface LiabilitiesHeuristicResult {
  totalLiabilities: number | null;
  labelUsed: string | null;
}

/**
 * Parse standalone "Total liabilities" (not the combined L+E line) near the balance sheet.
 */
export function extractTotalLiabilitiesHeuristic(
  text: string,
  scaleNote: string | undefined,
  assetsHint: number | null
): LiabilitiesHeuristicResult {
  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  const lines = text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const liabilitiesAndEquityPattern = LIABILITIES_AND_EQUITY_LINE_RE;
  const liabilitiesAndInvestmentPattern =
    /total\s+liabilities\s+and\s+shareholders?['\u2019]?\s+investment/i;
  const liabilitiesAndShareownersPattern =
    /total\s+liabilities\s+and\s+shareowners?['\u2019]?\s+(?:equity|investment)/i;
  const totalLiabilitiesPattern = /^total\s+liabilities\b/i;

  let leIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (liabilitiesAndEquityPattern.test(lines[i])) {
      leIdx = i;
      break;
    }
  }

  const scanLo = leIdx === -1 ? 0 : Math.max(0, leIdx - 160);
  const scanHi = leIdx === -1 ? lines.length - 1 : leIdx;

  const tryParseLine = (idx: number): { raw: number; label: string } | null => {
    const label = lines[idx];
    const fromLabel = parseNumbersForPdfHeuristic(label);
    const context = lines.slice(idx, Math.min(lines.length, idx + 3)).join(" ");
    const tail = context.slice(label.length).trim();
    const fromTail = parseNumbersForPdfHeuristic(tail);
    const valuesFallback =
      fromLabel.length > 0
        ? fromLabel
        : fromTail.length > 0
          ? fromTail
          : parseNumbersForPdfHeuristic(context);
    if (valuesFallback.length === 0) return null;
    return { raw: Math.abs(valuesFallback[0]), label };
  };

  const plausibleVsAssets = (v: number): boolean => {
    if (assetsHint == null || assetsHint < 500) return true;
    const r = v / assetsHint;
    return r >= 0.03 && r <= 1.15;
  };

  for (let i = scanHi; i >= scanLo; i--) {
    if (
      totalLiabilitiesPattern.test(lines[i]) &&
      !liabilitiesAndEquityPattern.test(lines[i]) &&
      !liabilitiesAndInvestmentPattern.test(lines[i]) &&
      !liabilitiesAndShareownersPattern.test(lines[i])
    ) {
      const parsed = tryParseLine(i);
      if (!parsed) continue;
      const scaled = Math.round(parsed.raw * scale * 100) / 100;
      if (!plausibleVsAssets(scaled)) continue;
      return { totalLiabilities: scaled, labelUsed: parsed.label };
    }
  }

  if (assetsHint == null || assetsHint < 500) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (
        totalLiabilitiesPattern.test(lines[i]) &&
        !liabilitiesAndEquityPattern.test(lines[i]) &&
        !liabilitiesAndInvestmentPattern.test(lines[i]) &&
        !liabilitiesAndShareownersPattern.test(lines[i])
      ) {
        const parsed = tryParseLine(i);
        if (!parsed) continue;
        const scaled = Math.round(parsed.raw * scale * 100) / 100;
        if (!plausibleVsAssets(scaled)) continue;
        return { totalLiabilities: scaled, labelUsed: parsed.label };
      }
    }
  }

  return { totalLiabilities: null, labelUsed: null };
}
