import type { FullAnalysis } from "../types/analysis";

/** Merge streamed / heuristic preview with a newer extraction chunk. */
export function mergeProgressivePdfAnalysis(
  prev: FullAnalysis | null,
  next: FullAnalysis
): FullAnalysis {
  if (!prev) return next;

  const prevCfCount = prev.cfItems?.length ?? 0;
  const nextCfCount = next.cfItems?.length ?? 0;
  const keepPrevCf = prevCfCount > 0 && nextCfCount === 0;

  const withSupplementals: FullAnalysis = {
    ...next,
    segments: (next.segments?.length ?? 0) > 0 ? next.segments : prev.segments,
    footnotes: (next.footnotes?.length ?? 0) > 0 ? next.footnotes : prev.footnotes,
    nonRecurringItems:
      (next.nonRecurringItems?.length ?? 0) > 0 ? next.nonRecurringItems : prev.nonRecurringItems,
    adjustedMetrics:
      (next.adjustedMetrics?.length ?? 0) > 0 ? next.adjustedMetrics : prev.adjustedMetrics,
    earningsNarrative: next.earningsNarrative ?? prev.earningsNarrative,
  };

  if (!keepPrevCf) return withSupplementals;

  return {
    ...withSupplementals,
    cfItems: prev.cfItems,
    cashFlow: prev.cashFlow,
    incomeStatement: prev.incomeStatement,
    ratios: prev.ratios,
    dividendAnalysis: prev.dividendAnalysis,
  };
}

export function mergeRebuiltAnalysisWithSupplementals(
  base: FullAnalysis,
  rebuilt: FullAnalysis
): FullAnalysis {
  const extractionRepairs = Array.from(
    new Set([
      ...(base.meta.extractionRepairs ?? []),
      ...(rebuilt.meta.extractionRepairs ?? []),
    ])
  );

  return {
    ...base,
    ...rebuilt,
    meta: {
      ...base.meta,
      ...rebuilt.meta,
      extractionRepairs: extractionRepairs.length > 0 ? extractionRepairs : undefined,
    },
    segments: rebuilt.segments ?? base.segments,
    methodologyVariants: rebuilt.methodologyVariants ?? base.methodologyVariants,
    footnotes: rebuilt.footnotes ?? base.footnotes,
    adjustedMetrics: rebuilt.adjustedMetrics ?? base.adjustedMetrics,
    earningsNarrative: rebuilt.earningsNarrative ?? base.earningsNarrative,
    nonRecurringItems: rebuilt.nonRecurringItems ?? base.nonRecurringItems,
  };
}
