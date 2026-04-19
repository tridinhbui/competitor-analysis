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

/**
 * Pick the best backing line for trace: exact tag match, prefer rows with `PDF:pN` provenance.
 */
export function findBestLineForTrace(tags: string[], items: BSItem[]): BSItem | null {
  for (const tag of tags) {
    const hit = items.find((i) => i.tag === tag);
    if (hit && /^PDF:p\d+/i.test(hit.source)) return hit;
  }
  for (const tag of tags) {
    const hit = items.find((i) => i.tag === tag);
    if (hit) return hit;
  }
  return null;
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
  const best = findBestLineForTrace(sourceTags, items);
  const prov = parsePdfProvenance(best?.source);

  let traceValue: number | null | undefined = spec.value ?? null;
  const specNum =
    spec.value != null && Number.isFinite(spec.value) && Math.abs(spec.value) > 1e-6
      ? Math.abs(spec.value)
      : null;
  if (best != null && Number.isFinite(best.value) && !spec.derivation) {
    const v = Math.abs(best.value);
    const fromPdf = /^PDF:p\d+/i.test(best.source || "");
    const tagMatchesSpec = sourceTags.includes(best.tag);
    // Prefer PDF line value when provenance is PDF-backed and the line tag matches this metric's
    // sourceTags (avoids highlighting OI for EBITDA when EBITDA is tagged separately).
    if (v > 1e-6 && fromPdf && tagMatchesSpec) {
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
