import type { BSItem, FullAnalysis } from "@/types/analysis";

/** How a ratio was built (for tooltips). `inputs` are keys into `buildMetricTraceLabelMap`. */
export type TraceDerivation = {
  formula: string;
  /** Optional longer note (e.g. disclosed vs computed) — keep `formula` short for UI. */
  formulaNote?: string;
  inputs: string[];
};

/** Passed from the data board to the PDF viewer for row matching + highlighting. */
export interface PdfTraceTarget {
  key: string;
  /** Dashboard label (shown in the trace bar). */
  label: string;
  /** Prefer the numeric value from the traced line item (for PDF row scoring). */
  value?: number | null;
  /** Full provenance string from extraction, e.g. `PDF:p12:"Net sales"` or `AI:cf:Revenues`. */
  sourceHint?: string;
  /** 1-based page when known independently of `sourceHint`. */
  pageHint?: number | null;
  /** Substring from `PDF:pN:"..."` provenance to boost the correct row. */
  rowLabelHint?: string | null;
  /**
   * Key into `METRIC_ALIASES` in PdfViewer for label-based row search.
   * Use when the dashboard shows a derived metric but the PDF row text matches a base line (e.g. Operating Income for EBITDA build-up).
   */
  pdfMatchLabel?: string;
  /** Optional formula + input metric keys for calculated ratios. */
  derivation?: TraceDerivation;
}

export function collectLineItems(result: FullAnalysis): BSItem[] {
  return [
    ...(result.balanceSheet?.items ?? []),
    ...(result.cfItems ?? []),
    ...(result.debtStructure?.items ?? []),
  ];
}

function valuesRoughlyMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA < 1e-6 || absB < 1e-6) return false;
  const diff = Math.abs(absA - absB);
  return diff <= Math.max(0.01, Math.min(0.5, Math.max(absA, absB) * 0.001));
}

/**
 * Pick the best backing line for trace: exact tag match, prefer rows with `PDF:pN` provenance.
 */
export function findBestLineForTrace(
  tags: string[],
  items: BSItem[],
  targetValue?: number | null
): BSItem | null {
  const candidates = items
    .filter((i) => tags.includes(i.tag))
    .sort((a, b) => {
      const aPdf = /^PDF:p\d+/i.test(a.source) ? 1 : 0;
      const bPdf = /^PDF:p\d+/i.test(b.source) ? 1 : 0;
      const aValueMatch = valuesRoughlyMatch(a.value, targetValue) ? 1 : 0;
      const bValueMatch = valuesRoughlyMatch(b.value, targetValue) ? 1 : 0;
      const aTagIndex = tags.indexOf(a.tag);
      const bTagIndex = tags.indexOf(b.tag);

      if (bValueMatch !== aValueMatch) return bValueMatch - aValueMatch;
      if (bPdf !== aPdf) return bPdf - aPdf;
      if (aTagIndex !== bTagIndex) return aTagIndex - bTagIndex;
      return 0;
    });
  return candidates[0] ?? null;
}

/** Trace directly from an extracted line (e.g. raw line-items table). */
export function buildPdfTraceFromLineItem(item: BSItem, displayLabel?: string): PdfTraceTarget {
  const prov = parsePdfProvenance(item.source);
  const v = Number.isFinite(item.value) ? Math.abs(item.value) : null;
  const src = item.source;
  return {
    key: displayLabel ?? item.tag,
    label: displayLabel ?? item.label ?? item.tag,
    value: v,
    sourceHint: src,
    pageHint: prov.page,
    rowLabelHint: prov.rowLabelHint,
  };
}

export function parsePdfProvenance(source: string | undefined): {
  page: number | null;
  rowLabelHint: string | null;
} {
  if (!source?.trim()) return { page: null, rowLabelHint: null };
  const pageM = source.match(/^PDF:p(\d+)/i);
  const page = pageM ? parseInt(pageM[1], 10) : null;
  const qM = source.match(/^PDF:p\d+:"([^"]*)"/i);
  const rowLabelHint = qM?.[1]?.trim() ? qM[1].trim() : null;
  return { page, rowLabelHint };
}

export type TraceSpecInput = {
  value: number | null | undefined;
  tags: string[];
  sourceTags?: string[];
  pdfMatchLabel?: string;
  derivation?: TraceDerivation;
};

/**
 * Build a trace target from a metric spec + analysis result.
 */
export function buildPdfTraceTarget(
  displayLabel: string,
  spec: TraceSpecInput,
  result: FullAnalysis
): PdfTraceTarget {
  const items = collectLineItems(result);
  const sourceTags = spec.sourceTags ?? spec.tags;
  const best = findBestLineForTrace(sourceTags, items, spec.value ?? null);
  const prov = parsePdfProvenance(best?.source);

  let traceValue: number | null | undefined = spec.value ?? null;
  const specNum =
    spec.value != null && Number.isFinite(spec.value) && Math.abs(spec.value) > 1e-6
      ? Math.abs(spec.value)
      : null;
  if (best != null && Number.isFinite(best.value)) {
    const v = Math.abs(best.value);
    const fromPdf = /^PDF:p\d+/i.test(best.source || "");
    const tagMatchesSpec = sourceTags.includes(best.tag);
    const valueMatchesSpec = specNum != null && valuesRoughlyMatch(v, specNum);
    // Prefer PDF line value when provenance is PDF-backed and the line tag matches this metric's
    // sourceTags. For derived metrics, allow a real PDF row to still drive highlighting.
    if (v > 1e-6 && fromPdf && tagMatchesSpec && (specNum == null || valueMatchesSpec)) {
      traceValue = v;
    } else if (v > 1e-6 && specNum == null) {
      traceValue = v;
    }
  }

  const sourceHint = best?.source;

  return {
    key: displayLabel,
    label: displayLabel,
    value: traceValue ?? null,
    sourceHint,
    pageHint: prov.page,
    rowLabelHint: prov.rowLabelHint,
    pdfMatchLabel:
      spec.pdfMatchLabel && spec.pdfMatchLabel !== displayLabel
        ? spec.pdfMatchLabel
        : undefined,
    derivation: spec.derivation,
  };
}
