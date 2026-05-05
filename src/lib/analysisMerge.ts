import type { FullAnalysis } from "../types/analysis";

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
