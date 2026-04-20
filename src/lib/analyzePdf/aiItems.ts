import type { BSItem } from "@/types/analysis";
import type { ExtractionMeta, RawAiItem } from "./extractionTypes";

export function parseAiEnvelope(raw: unknown): { meta: ExtractionMeta; items: RawAiItem[] } {
  const meta: ExtractionMeta = {};
  const items: RawAiItem[] = [];
  if (!raw || typeof raw !== "object") return { meta, items };
  const o = raw as Record<string, unknown>;
  if (o.meta && typeof o.meta === "object") {
    const m = o.meta as Record<string, unknown>;
    if ("companyName" in m) meta.companyName = m.companyName as string | null;
    if ("periodEnd" in m) meta.periodEnd = m.periodEnd as string | null;
    if ("filingType" in m) meta.filingType = m.filingType as string | null;
    if ("scaleNote" in m && m.scaleNote != null) meta.scaleNote = String(m.scaleNote);
    if ("confidence" in m && m.confidence != null) meta.confidence = String(m.confidence);
  }
  if (meta.companyName === undefined && "companyName" in o) meta.companyName = o.companyName as string | null;
  if (meta.periodEnd === undefined && "periodEnd" in o) meta.periodEnd = o.periodEnd as string | null;
  if (meta.scaleNote === undefined && "scaleNote" in o && o.scaleNote != null) meta.scaleNote = String(o.scaleNote);

  const arr = o.items;
  if (!Array.isArray(arr)) return { meta, items };
  for (const it of arr) {
    if (it && typeof it === "object" && typeof (it as RawAiItem).tag === "string") {
      items.push(it as RawAiItem);
    }
  }
  return { meta, items };
}

function rowLabelForSource(it: RawAiItem): string {
  const r =
    String(it.rowLabel ?? "").trim() ||
    String(it.label ?? "").trim() ||
    String(it.tag ?? "").trim() ||
    "row";
  return r.replace(/"/g, "'").slice(0, 120);
}

function buildProvenanceSource(it: RawAiItem, tag: string, aiPrefix: "bs" | "cf"): string {
  const s = typeof it.source === "string" ? it.source.trim() : "";
  if (/^PDF:p\d+/i.test(s)) return s;
  const pg = it.page;
  if (pg != null && Number.isFinite(Number(pg))) {
    const p = Math.max(1, Math.floor(Number(pg)));
    return `PDF:p${p}:"${rowLabelForSource(it)}"`;
  }
  return `AI:${aiPrefix}:${tag}`;
}

function periodTypeFromItem(it: RawAiItem, kind: "bs" | "cf"): BSItem["period_type"] | undefined {
  if (kind === "bs") return "balance_sheet";
  const b = String(it.periodBasis ?? "").toLowerCase();
  if (b === "quarter") return "quarter";
  if (b === "ytd") return "ytd";
  if (b === "annual") return "annual";
  return undefined;
}

function itemValueForTag(tag: string, v: number | string | null | undefined): number {
  if (v == null) return 0;
  const s = typeof v === "string" ? v.trim() : String(v);
  if (
    s === "" ||
    s === "N/A" ||
    s === "n/a" ||
    s === "-" ||
    s === "\u2013" ||
    s === "\u2014" ||
    s === "\u00e2\u20ac\u201c" ||
    s === "\u00e2\u20ac\u201d"
  ) {
    return 0;
  }
  const cleaned = s.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  if (tag === "EarningsPerShareBasic" || tag === "EarningsPerShareDiluted") {
    return Math.round(n * 10000) / 10000;
  }
  if (tag === "WeightedAverageSharesBasic" || tag === "WeightedAverageSharesDiluted") {
    return Math.round(n * 1000) / 1000;
  }
  return Math.round(n);
}

export function rawAiToBSItem(it: RawAiItem, period: string, kind: "bs" | "cf"): BSItem | null {
  const tag = String(it.tag ?? "").trim();
  if (!tag) return null;
  return {
    tag,
    label: String(it.label ?? tag),
    value: itemValueForTag(tag, it.value),
    period,
    source: buildProvenanceSource(it, tag, kind === "bs" ? "bs" : "cf"),
    period_type: periodTypeFromItem(it, kind),
  };
}

export function dedupeByTagPreferPdf(items: BSItem[]): BSItem[] {
  const m = new Map<string, BSItem>();
  const pdfFirst = (s: string) => /^PDF:p/i.test(s);
  const rankPeriod = (p: BSItem["period_type"] | undefined) =>
    p === "quarter" ? 3 : p === "ytd" ? 2 : p === "annual" ? 1 : 0;
  for (const it of items) {
    const prev = m.get(it.tag);
    if (!prev) {
      m.set(it.tag, it);
      continue;
    }
    let replace = false;
    if (pdfFirst(it.source) && !pdfFirst(prev.source)) replace = true;
    else if (pdfFirst(it.source) === pdfFirst(prev.source)) {
      if (rankPeriod(it.period_type) > rankPeriod(prev.period_type)) replace = true;
    }
    if (replace) m.set(it.tag, it);
  }
  return [...m.values()];
}

/** Map meta.scaleNote ("millions", "unknown", etc.) to heuristic helpers. */
export function normalizeScaleNote(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const l = s.toLowerCase();
  if (l.includes("thousand")) return "thousands";
  if (l.includes("billion")) return "billions";
  if (l.includes("million")) return "millions";
  return undefined;
}
