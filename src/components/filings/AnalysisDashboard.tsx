"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FullAnalysis, BSItem, IncomeStatement } from "@/types/analysis";
import { buildMetricTraceLabelMap, type MetricTraceSpec } from "@/lib/metricTraceLabels";
import {
  buildPdfTraceTarget,
  buildPdfTraceFromLineItem,
  type PdfTraceTarget,
} from "@/lib/pdfTraceResolve";
import type { DataSourceRow } from "@/types/dataSource";

export type TraceMetric = PdfTraceTarget;
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  CheckCircle2, XCircle, Download, AlertCircle,
  TrendingUp, TrendingDown, ShieldCheck, ShieldAlert,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Info, Search,
} from "lucide-react";

interface Props {
  result: FullAnalysis;
  onExport?: () => void;
  onTraceMetric?: (target: TraceMetric) => void;
}

const COLORS = {
  primary: "#4f46e5", blue: "#3b82f6", emerald: "#10b981",
  amber: "#f59e0b", red: "#ef4444", slate: "#94a3b8",
  purple: "#8b5cf6", cyan: "#06b6d4",
};
const PIE_PALETTE = [COLORS.primary, COLORS.blue, COLORS.emerald, COLORS.amber, COLORS.purple, COLORS.cyan];

const fmt = (v: number | null | undefined, prefix = "$", suffix = "M"): string =>
  v != null ? `${prefix}${v.toLocaleString()}${suffix}` : "—";
const fmtPct = (v: number | null | undefined): string => v != null ? `${v.toFixed(1)}%` : "—";
const fmtX = (v: number | null | undefined): string => v != null ? `${v.toFixed(2)}x` : "—";
const fmtNum = (v: number | null | undefined): string => v != null ? v.toLocaleString() : "—";

function formatTraceInputValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fmt(v, "$", "M");
}

/** PDF magnifying glass only for direct line metrics (not formula rows). */
function wantsPdfTrace(
  trace: PdfTraceTarget | null | undefined,
  opts: { traceToPdf?: boolean; enabled: boolean },
): boolean {
  return !!((opts.traceToPdf ?? true) && opts.enabled && !trace?.derivation);
}

/** KPI strip tooltips need more width (e.g. Working Capital formula + note). */
const DERIVATION_TOOLTIP_BASE =
  "absolute z-30 mt-1 rounded-lg border border-slate-200 bg-white text-left shadow-lg";

function DerivationTooltip({
  trace,
  labelMap,
  position,
  hover,
  /** When set, toggles visibility (metric tables); omit for CSS group-hover on KPI/ratio cards. */
  show,
}: {
  trace: PdfTraceTarget;
  labelMap: Record<string, MetricTraceSpec>;
  position: "left" | "right";
  hover: "kpi" | "ratio" | "table";
  show?: boolean;
}) {
  const d = trace.derivation!;
  const hoverCls =
    hover === "kpi" ? "group-hover/kpi:block" : hover === "ratio" ? "group-hover/ratio:block" : "group-hover:block";
  const controlled = show !== undefined;
  const maxW =
    hover === "kpi"
      ? "max-w-[min(26rem,calc(100vw-1.5rem))] px-3 py-2.5"
      : "max-w-[min(18rem,calc(100vw-2rem))] px-2.5 py-2";
  return (
    <div
      className={cn(
        DERIVATION_TOOLTIP_BASE,
        maxW,
        position === "left" ? "left-2 top-full" : "right-0 top-full",
        controlled ? (show ? "block" : "hidden") : cn("hidden pointer-events-none", hoverCls),
      )}
    >
      <p className="text-[10px] font-medium leading-snug text-slate-700 whitespace-normal break-words">{d.formula}</p>
      {d.formulaNote ? (
        <p className="mt-1 text-[9px] leading-snug text-slate-500 whitespace-normal break-words">{d.formulaNote}</p>
      ) : null}
      {d.inputs.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[10px] text-slate-600">
          {d.inputs.map((inp) => (
            <li key={inp}>
              <span className="text-slate-400">{inp}:</span> {formatTraceInputValue(labelMap[inp]?.value ?? null)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Prefer first matching tag (US‑GAAP uses both `AccountsPayable` and `AccountsPayableCurrent`, etc.). */
function lineValueByTags(
  cfItems: BSItem[],
  bsItems: BSItem[] | undefined,
  ...tags: string[]
): number | null {
  for (const t of tags) {
    const row =
      cfItems.find((i) => i.tag === t) ?? bsItems?.find((i) => i.tag === t);
    if (
      row != null &&
      Number.isFinite(row.value) &&
      Math.abs(row.value) > 1e-6
    ) {
      return row.value;
    }
  }
  return null;
}

const tooltipStyle = {
  borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12,
  background: "#fff", color: "#1e293b", boxShadow: "0 4px 12px rgb(0 0 0/0.08)",
};

/* ──────────────────── Tabs ──────────────────── */

type TabId = "summary" | "income" | "balance" | "cashflow" | "insights" | "deep-dive";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Executive Summary" },
  { id: "income", label: "Income & Margins" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "insights", label: "Insights" },
  { id: "deep-dive", label: "Deep Dive" },
];

/* ──────────────────── Main Component ──────────────────── */

export function AnalysisDashboard({ result, onExport, onTraceMetric }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  /** Single open derivation tooltip across Deep Dive ratio columns (mutual exclusion). */
  const [deepDiveDerivationKey, setDeepDiveDerivationKey] = useState<string | null>(null);
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, dividendAnalysis: div, incomeStatement: inc, validation, meta, reconcile } = result;
  const cfItems = result.cfItems ?? [];

  const traceLabelMap = useMemo(() => buildMetricTraceLabelMap(result), [result]);

  const traceByLabel = useMemo(() => {
    const out: Record<string, PdfTraceTarget> = {};
    for (const k of Object.keys(traceLabelMap)) {
      out[k] = buildPdfTraceTarget(k, traceLabelMap[k]!, result);
    }
    return out;
  }, [traceLabelMap, result]);

  const metricTableTraceProps = useMemo(
    () => (onTraceMetric ? { labelMap: traceLabelMap, traceByLabel } : {}),
    [onTraceMetric, traceLabelMap, traceByLabel],
  );

  useEffect(() => {
    if (activeTab !== "deep-dive") setDeepDiveDerivationKey(null);
  }, [activeTab]);

  const onMetricTableRowClick = useCallback(
    (label: string, extra?: Record<string, MetricTraceSpec>) => {
      if (!onTraceMetric) return;
      const merged = { ...traceLabelMap, ...extra };
      const m = merged[label];
      if (m) onTraceMetric(buildPdfTraceTarget(label, m, result));
    },
    [onTraceMetric, traceLabelMap, result],
  );

  const traceLineItemRow = useCallback(
    (item: BSItem) => {
      if (!onTraceMetric) return;
      onTraceMetric(buildPdfTraceFromLineItem(item, item.label));
    },
    [onTraceMetric],
  );

  const verdictColor = {
    strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
    adequate: "text-blue-700 bg-blue-50 border-blue-200",
    stretched: "text-amber-700 bg-amber-50 border-amber-200",
    unknown: "text-slate-500 bg-slate-50 border-slate-200",
  }[div.verdict];

  // Detect missing critical data
  const missingFields: string[] = [];
  if (!inc.revenue) missingFields.push("Revenue");
  if (!inc.grossProfit) missingFields.push("Gross Profit");
  if (!inc.operatingIncome) missingFields.push("Operating Income");
  if (!inc.netIncome) missingFields.push("Net Income");
  if (!bs.totalAssets) missingFields.push("Total Assets");
  if (!bs.totalEquity) missingFields.push("Total Equity");
  if (!cf.operatingCashFlow) missingFields.push("Operating Cash Flow");
  const hasMissingData = missingFields.length > 0;

  return (
    <div className="flex flex-col gap-0 text-slate-800">
      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {meta.companyName ?? meta.fileName ?? "Financial Analysis"}
            </h2>
            {meta.ticker && (
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                {meta.ticker}
              </span>
            )}
            {meta.periodEnd && (
              <span className="text-xs text-slate-400">
                {meta.periodEnd}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{meta.source === "sec" ? "SEC EDGAR XBRL" : `PDF${meta.pagesRead ? ` (${meta.pagesRead}p)` : ""}`}</span>
            {meta.extractionMethod && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{
                  meta.extractionMethod === "pdf-ai-section-split" ? "Section-based AI" :
                  meta.extractionMethod === "pdf-vision" ? "Vision API" :
                  meta.extractionMethod === "pdf-ai" ? "AI extraction" :
                  meta.extractionMethod === "pdf-ai-partial" ? "AI (partial)" :
                  meta.extractionMethod === "pdf-heuristic" ? "Pattern matching" :
                  "Extraction"
                }</span>
              </>
            )}
            {meta.confidence && (
              <>
                <span className="text-slate-300">•</span>
                <span className={cn(
                  "font-semibold uppercase",
                  meta.confidence === "high" ? "text-emerald-600" : meta.confidence === "medium" ? "text-amber-600" : "text-slate-500"
                )}>
                  {meta.confidence} confidence
                </span>
              </>
            )}
          </div>
        </div>
        {onExport && (
          <button onClick={onExport} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
            <Download className="h-3.5 w-3.5" />
            Export XLSX
          </button>
        )}
      </header>

      {/* ═══ KPI STRIP ═══ */}
      <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-6">
        <KpiCell label="Revenue" value={fmt(inc.revenue)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Revenue") : undefined} trace={traceByLabel?.["Revenue"]} labelMap={traceLabelMap} traceToPdf={false} />
        <KpiCell label="Gross Margin" value={fmtPct(inc.grossMargin)} highlight={inc.grossMargin} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Gross Margin") : undefined} trace={traceByLabel?.["Gross Margin"]} labelMap={traceLabelMap} traceToPdf={false} />
        <KpiCell label="OP Margin" value={fmtPct(inc.operatingMargin)} highlight={inc.operatingMargin} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("OP Margin") : undefined} trace={traceByLabel?.["OP Margin"]} labelMap={traceLabelMap} traceToPdf={false} />
        <KpiCell label="EBITDA" value={fmt(inc.ebitda)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("EBITDA") : undefined} trace={traceByLabel?.["EBITDA"]} labelMap={traceLabelMap} traceToPdf={false} />
        <KpiCell label="Net Income" value={fmt(inc.netIncome)} highlight={inc.netIncome} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Net Income") : undefined} trace={traceByLabel?.["Net Income"]} labelMap={traceLabelMap} traceToPdf={false} />
        <KpiCell label="FCF" value={fmt(cf.freeCashFlow)} highlight={cf.freeCashFlow} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Free Cash Flow") : undefined} trace={traceByLabel?.["Free Cash Flow"]} labelMap={traceLabelMap} traceToPdf={false} />
      </div>

      {/* ═══ TAB BAR ═══ */}
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-semibold transition sm:px-4",
              activeTab === id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ═══ TAB CONTENT ═══ */}
      <div className="min-h-[320px]">

        {/* ─── EXECUTIVE SUMMARY ─── */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            {/* Verdict */}
            <div className={cn("flex items-start gap-3 rounded-xl border p-4", verdictColor)}>
              {div.verdict === "strong" || div.verdict === "adequate"
                ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />}
              <div>
                <p className="text-sm font-bold">{div.headline}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {div.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed opacity-90">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Missing Data Alert */}
            {hasMissingData && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Incomplete data extraction</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Missing: {missingFields.join(", ")}. Try uploading a clearer PDF or manually enter values in the Data Source.
                  </p>
                </div>
              </div>
            )}

            {/* Extraction Method Info (for PDF) */}
            {meta.source === "pdf" && meta.extractionMethod && (
              <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div className="text-blue-800">
                  <span className="font-semibold">Extraction method:</span>{" "}
                  {meta.extractionMethod === "pdf-ai-section-split"
                    ? "Section-based AI extraction for improved coverage"
                    : meta.extractionMethod === "pdf-vision"
                    ? "OpenAI Vision API for table extraction"
                    : meta.extractionMethod === "pdf-ai"
                    ? "AI-powered text analysis"
                    : meta.extractionMethod === "pdf-ai-partial"
                    ? "AI extraction returned partial coverage; results may be incomplete"
                    : "Pattern matching heuristics"}
                </div>
              </div>
            )}

            {/* Financial Overview Table */}
            <Section title="Financial Overview">
              <div className="grid gap-4 lg:grid-cols-2">
                <MetricTable
                  onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                  {...metricTableTraceProps}
                  rows={[
                    { label: "Revenue", value: fmt(inc.revenue), traceable: true },
                    { label: "Cost of Revenue", value: fmt(inc.costOfRevenue), dim: true, traceable: true },
                    { label: "Gross Profit", value: fmt(inc.grossProfit), bold: true, sub: fmtPct(inc.grossMargin), traceable: true },
                    { label: "SG&A Expense", value: fmt(inc.sgaExpense), dim: true, traceable: true },
                    { label: "R&D Expense", value: fmt(inc.rdExpense), dim: true, traceable: true },
                    { label: "Operating Income", value: fmt(inc.operatingIncome), bold: true, sub: fmtPct(inc.operatingMargin), traceable: true },
                    { label: "EBITDA", value: fmt(inc.ebitda), bold: true, sub: fmtPct(inc.ebitdaMargin), traceable: true },
                    { label: "Net Income", value: fmt(inc.netIncome), bold: true, sub: fmtPct(inc.netMargin), traceable: true },
                  ]}
                />
                <MetricTable
                  onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                  {...metricTableTraceProps}
                  rows={[
                    { label: "Total Assets", value: fmt(bs.totalAssets), traceable: true },
                    { label: "Total Equity", value: fmt(bs.totalEquity), traceable: true },
                    { label: "Total Debt", value: fmt(debt.totalDebt), traceable: true },
                    { label: "Net Debt", value: fmt(debt.netDebt), bold: true, traceable: true },
                    { label: "Cash & Equivalents", value: fmt(bs.cashAndEquivalents), traceable: true },
                    { label: "Operating CF", value: fmt(cf.operatingCashFlow), traceable: true },
                    { label: "Capital Expenditures", value: fmt(cf.capitalExpenditures), traceable: true },
                    { label: "Free Cash Flow", value: fmt(cf.freeCashFlow), bold: true, traceable: true },
                  ]}
                />
              </div>
            </Section>

            {/* Earnings Narrative (if available) */}
            {result.earningsNarrative && (
              <Section title="Earnings Insights">
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("rounded px-2 py-1 text-xs font-bold",
                        result.earningsNarrative.result.includes("Beat") ? "bg-emerald-100 text-emerald-700" :
                        result.earningsNarrative.result.includes("Missed") ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {result.earningsNarrative.result}
                      </span>
                      <span className={cn("rounded px-2 py-1 text-xs font-semibold",
                        result.earningsNarrative.tone === "bullish" ? "bg-emerald-100 text-emerald-700" :
                        result.earningsNarrative.tone === "cautious" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {result.earningsNarrative.tone.charAt(0).toUpperCase() + result.earningsNarrative.tone.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 mb-2">{result.earningsNarrative.summary}</p>
                    {(result.earningsNarrative.priorGuidance || result.earningsNarrative.currentGuidance) && (
                      <div className="mt-2 flex gap-4 text-xs text-slate-600">
                        {result.earningsNarrative.priorGuidance && (
                          <div><span className="font-semibold">Prior Guidance:</span> {result.earningsNarrative.priorGuidance}</div>
                        )}
                        {result.earningsNarrative.currentGuidance && (
                          <div><span className="font-semibold">Current Guidance:</span> {result.earningsNarrative.currentGuidance}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {result.earningsNarrative.keyThemes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2 uppercase">Key Themes</p>
                      <ul className="space-y-1">
                        {result.earningsNarrative.keyThemes.map((theme, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="text-primary font-bold">•</span>
                            <span>{theme}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Key Ratios Grid */}
            <Section title="Key Ratios">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <RatioCard label="Gross Margin" value={fmtPct(ratios.grossMargin)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Gross Margin") : undefined} trace={traceByLabel?.["Gross Margin"]} labelMap={traceLabelMap} />
                <RatioCard label="Operating Margin" value={fmtPct(ratios.operatingMargin)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Operating Margin") : undefined} trace={traceByLabel?.["Operating Margin"]} labelMap={traceLabelMap} />
                <RatioCard label="EBITDA Margin" value={fmtPct(ratios.ebitdaMargin)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("EBITDA Margin") : undefined} trace={traceByLabel?.["EBITDA Margin"]} labelMap={traceLabelMap} />
                <RatioCard label="Net Margin" value={fmtPct(ratios.netMargin)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Net Margin") : undefined} trace={traceByLabel?.["Net Margin"]} labelMap={traceLabelMap} />
                <RatioCard label="ROE" value={fmtPct(ratios.returnOnEquity)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("ROE") : undefined} trace={traceByLabel?.["ROE"]} labelMap={traceLabelMap} />
                <RatioCard label="ROA" value={fmtPct(ratios.returnOnAssets)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("ROA") : undefined} trace={traceByLabel?.["ROA"]} labelMap={traceLabelMap} />
                <RatioCard label="ROIC" value={fmtPct(ratios.returnOnInvestedCapital)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("ROIC") : undefined} trace={traceByLabel?.["ROIC"]} labelMap={traceLabelMap} />
                <RatioCard label="D/E Ratio" value={fmtX(ratios.debtToEquity)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("D/E Ratio") : undefined} trace={traceByLabel?.["D/E Ratio"]} labelMap={traceLabelMap} />
                <RatioCard label="ND/EBITDA" value={fmtX(ratios.netDebtToEbitda)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Net Debt / EBITDA") : undefined} trace={traceByLabel?.["ND/EBITDA"]} labelMap={traceLabelMap} />
                <RatioCard label="Interest Cov." value={fmtX(ratios.interestCoverage)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Interest Coverage") : undefined} trace={traceByLabel?.["Interest Cov."]} labelMap={traceLabelMap} />
                <RatioCard label="Current Ratio" value={fmtX(ratios.currentRatio)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Current Ratio") : undefined} trace={traceByLabel?.["Current Ratio"]} labelMap={traceLabelMap} />
                <RatioCard label="FCF Yield" value={fmtPct(ratios.fcfYield)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("FCF Yield") : undefined} trace={traceByLabel?.["FCF Yield"]} labelMap={traceLabelMap} />
              </div>
            </Section>

            {/* Segments if available */}
            {result.segments && result.segments.length > 0 && (
              <Section title="Segment Breakdown">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">Segment</th>
                        <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                        <th className="px-3 py-2 text-right font-semibold">OP Income</th>
                        <th className="px-3 py-2 text-right font-semibold">OP Margin</th>
                        <th className="px-3 py-2 text-right font-semibold">Volume</th>
                        <th className="px-3 py-2 text-right font-semibold">Rev/Unit</th>
                        <th className="px-3 py-2 text-right font-semibold">OP/Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.segments.map((seg, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium">{seg.segmentName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(seg.revenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(seg.operatingIncome)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", (seg.operatingMargin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {fmtPct(seg.operatingMargin)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.volumeUnits != null ? `${fmtNum(seg.volumeUnits)} ${seg.volumeUnitType ?? ""}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.revenuePerUnit != null ? `$${seg.revenuePerUnit.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.operatingIncomePerUnit != null ? `$${seg.operatingIncomePerUnit.toFixed(0)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ─── INCOME & MARGINS ─── */}
        {activeTab === "income" && (() => {
          const bridgeData = [
            { name: "Revenue", amt: inc.revenue ?? 0 },
            { name: "COGS", amt: -(inc.costOfRevenue ?? 0) },
            { name: "Gross Profit", amt: inc.grossProfit ?? 0 },
            { name: "SG&A", amt: -(inc.sgaExpense ?? 0) },
            { name: "OP Income", amt: inc.operatingIncome ?? 0 },
            { name: "EBITDA", amt: inc.ebitda ?? 0 },
            { name: "Net Income", amt: inc.netIncome ?? 0 },
          ];

          const marginData = [
            { name: "Gross", value: inc.grossMargin ?? 0 },
            { name: "Operating", value: inc.operatingMargin ?? 0 },
            { name: "EBITDA", value: inc.ebitdaMargin ?? 0 },
            { name: "Net", value: inc.netMargin ?? 0 },
          ].filter(d => d.value !== 0);

          return (
            <div className="space-y-4">
              {/* Income Statement Table */}
              <Section title="Income Statement">
                <IncomeStatementTable inc={inc} onRowClick={onTraceMetric ? onMetricTableRowClick : undefined} />
              </Section>

              {/* Charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Profit Waterfall ($M)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bridgeData}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                        <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                          {bridgeData.map((d, i) => (
                            <Cell key={i} fill={d.amt >= 0 ? COLORS.blue : COLORS.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                <Section title="Margin Profile (%)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={marginData} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                        <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              {/* SG&A / R&D / D&A Breakdown */}
              <Section title="Operating Expense Breakdown">
                <MetricTable
                  onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                  {...metricTableTraceProps}
                  rows={[
                    { label: "SG&A Expense", value: fmt(inc.sgaExpense), sub: inc.revenue && inc.sgaExpense ? `${((inc.sgaExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined, traceable: true },
                    { label: "R&D Expense", value: fmt(inc.rdExpense), sub: inc.revenue && inc.rdExpense ? `${((inc.rdExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined, traceable: true },
                    { label: "Depreciation", value: fmt(inc.depreciation), traceable: true },
                    { label: "Amortization", value: fmt(inc.amortization), traceable: true },
                    { label: "D&A Total", value: fmt(inc.depreciation != null || inc.amortization != null ? (inc.depreciation ?? 0) + (inc.amortization ?? 0) : null), bold: true, traceable: true },
                    { label: "Interest Expense", value: fmt(inc.interestExpense), traceable: true },
                    { label: "Income Tax", value: fmt(inc.incomeTax), traceable: true },
                  ]}
                />
              </Section>

              {/* EPS */}
              {(inc.epsBasic != null || inc.epsDiluted != null) && (
                <Section title="Earnings Per Share">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <RatioCard label="EPS (Basic)" value={inc.epsBasic != null ? `$${inc.epsBasic.toFixed(2)}` : "—"} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("EPS (Basic)") : undefined} trace={traceByLabel?.["EPS (Basic)"]} labelMap={traceLabelMap} />
                    <RatioCard label="EPS (Diluted)" value={inc.epsDiluted != null ? `$${inc.epsDiluted.toFixed(2)}` : "—"} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("EPS (Diluted)") : undefined} trace={traceByLabel?.["EPS (Diluted)"]} labelMap={traceLabelMap} />
                  </div>
                </Section>
              )}
            </div>
          );
        })()}

        {/* ─── BALANCE SHEET ─── */}
        {activeTab === "balance" && (() => {
          const capitalPie = [
            { name: "Equity", value: Math.abs(bs.totalEquity) },
            { name: "LT Debt", value: debt.longTermDebt },
            { name: "ST Debt", value: debt.shortTermDebt },
          ].filter(d => d.value > 0);

          const topBs = [...bs.items]
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 10)
            .map(i => ({ name: i.label.length > 20 ? `${i.label.slice(0, 20)}...` : i.label, value: Math.abs(i.value) }));

          const ar = lineValueByTags(cfItems, bs.items, "AccountsReceivableNetCurrent", "AccountsReceivableNet");
          const inv = lineValueByTags(cfItems, bs.items, "InventoryNet");
          const ap = lineValueByTags(cfItems, bs.items, "AccountsPayableCurrent", "AccountsPayable");

          return (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Key Balance Sheet Metrics */}
                <Section title="Balance Sheet Summary">
                  <MetricTable
                    onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                    {...metricTableTraceProps}
                    rows={[
                      { label: "Total Assets", value: fmt(bs.totalAssets), bold: true, traceable: true },
                      { label: "Current Assets", value: fmt(bs.items.find(i => i.tag === "AssetsCurrent")?.value ?? null), traceable: true },
                      { label: "PP&E (Net)", value: fmt(bs.items.find(i => i.tag === "PropertyPlantAndEquipmentNet")?.value ?? null), traceable: true },
                      { label: "Goodwill", value: fmt(bs.items.find(i => i.tag === "Goodwill")?.value ?? null), traceable: true },
                      { label: "Total Liabilities", value: fmt(bs.totalLiabilities), bold: true, traceable: true },
                      { label: "Current Liabilities", value: fmt(bs.items.find(i => i.tag === "LiabilitiesCurrent")?.value ?? null), traceable: true },
                      { label: "Total Equity", value: fmt(bs.totalEquity), bold: true, traceable: true },
                      { label: "Retained Earnings", value: fmt(bs.retainedEarnings), traceable: true },
                    ]}
                  />
                </Section>

                {/* Capital Structure Pie */}
                {capitalPie.length > 0 && (
                  <Section title="Capital Structure">
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={capitalPie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                            {capitalPie.map((_, i) => <Cell key={i} fill={PIE_PALETTE[i]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Section>
                )}
              </div>

              {/* Debt Structure */}
              <Section title="Debt Structure">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RatioCard label="Short-Term Debt" value={fmt(debt.shortTermDebt)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Short-Term Debt") : undefined} trace={traceByLabel?.["Short-Term Debt"]} labelMap={traceLabelMap} />
                  <RatioCard label="Long-Term Debt" value={fmt(debt.longTermDebt)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Long-Term Debt") : undefined} trace={traceByLabel?.["Long-Term Debt"]} labelMap={traceLabelMap} />
                  <RatioCard label="Total Debt" value={fmt(debt.totalDebt)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Total Debt") : undefined} trace={traceByLabel?.["Total Debt"]} labelMap={traceLabelMap} />
                  <RatioCard label="Net Debt" value={fmt(debt.netDebt)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Net Debt") : undefined} trace={traceByLabel?.["Net Debt"]} labelMap={traceLabelMap} />
                </div>
              </Section>

              {/* Working Capital */}
              <Section title="Working Capital">
                <div className="grid gap-4 lg:grid-cols-2">
                  <MetricTable
                    onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                    {...metricTableTraceProps}
                    rows={[
                      { label: "Accounts Receivable", value: fmt(ar), traceable: true },
                      { label: "Inventories", value: fmt(inv), traceable: true },
                      { label: "Accounts Payable", value: fmt(ap), traceable: true },
                      { label: "Working Capital", value: fmt(ratios.workingCapital), bold: true, traceable: true },
                      { label: "Current Ratio", value: fmtX(ratios.currentRatio), traceable: true },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <RatioCard label="Asset Turnover" value={fmtX(ratios.assetTurnover)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Asset Turnover") : undefined} trace={traceByLabel?.["Asset Turnover"]} labelMap={traceLabelMap} />
                    <RatioCard label="Inventory Turn." value={fmtX(ratios.inventoryTurnover)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Inventory Turn.") : undefined} trace={traceByLabel?.["Inventory Turn."]} labelMap={traceLabelMap} />
                    <RatioCard label="Receivables Turn." value={fmtX(ratios.receivablesTurnover)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Receivables Turn.") : undefined} trace={traceByLabel?.["Receivables Turn."]} labelMap={traceLabelMap} />
                    <RatioCard label="WC / Revenue" value={fmtPct(ratios.workingCapitalRatio)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("WC / Revenue") : undefined} trace={traceByLabel?.["WC / Revenue"]} labelMap={traceLabelMap} />
                  </div>
                </div>
              </Section>

              {/* Top Items Chart */}
              {topBs.length > 0 && (
                <Section title="Largest Balance Sheet Items">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topBs} layout="vertical" margin={{ left: 4, right: 8 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              )}
            </div>
          );
        })()}

        {/* ─── CASH FLOW ─── */}
        {activeTab === "cashflow" && (() => {
          const cfBridge = [
            { name: "OCF", amt: cf.operatingCashFlow ?? 0 },
            { name: "CapEx", amt: -(cf.capitalExpenditures ?? 0) },
            { name: "FCF", amt: cf.freeCashFlow ?? 0 },
            { name: "Dividends", amt: -(cf.dividendsPaid ?? 0) },
            { name: "Net Income", amt: cf.netIncome ?? 0 },
          ];

          const buyback = cf.shareRepurchases ?? cfItems.find(i => i.tag === "PaymentsForRepurchaseOfCommonStock")?.value ?? null;
          const debtIssuance = cfItems.find(i => i.tag === "ProceedsFromIssuanceOfLongTermDebt")?.value ?? null;
          const debtRepay =
            cfItems.find(i => i.tag === "RepaymentsOfLongTermDebt")?.value ??
            cfItems.find(i => i.tag === "RepaymentsOfDebt")?.value ??
            cfItems.find(i => i.tag === "RepaymentsOfShortTermDebt")?.value ??
            cfItems.find(i => i.tag === "RepaymentsOfCommercialPaper")?.value ??
            null;
          let finCF = cf.financingCashFlow ?? cfItems.find(i => i.tag === "NetCashProvidedByFinancingActivities")?.value ?? null;
          if (finCF == null) {
            let derivedFin = 0;
            let hasDerivedFinPart = false;
            if (debtIssuance != null) {
              derivedFin += Math.abs(debtIssuance);
              hasDerivedFinPart = true;
            }
            if (debtRepay != null) {
              derivedFin -= Math.abs(debtRepay);
              hasDerivedFinPart = true;
            }
            if (cf.dividendsPaid != null) {
              derivedFin -= Math.abs(cf.dividendsPaid);
              hasDerivedFinPart = true;
            }
            if (buyback != null) {
              derivedFin -= Math.abs(buyback);
              hasDerivedFinPart = true;
            }
            finCF = hasDerivedFinPart ? Math.round(derivedFin) : null;
          }
          const invCF = cf.investingCashFlow ?? cfItems.find(i => i.tag === "NetCashProvidedByInvestingActivities")?.value ?? null;

          return (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <RatioCard label="Operating CF" value={fmt(cf.operatingCashFlow)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Operating CF") : undefined} trace={traceByLabel?.["Operating CF"]} labelMap={traceLabelMap} />
                <RatioCard label="CapEx" value={cf.capitalExpenditures != null ? fmt(-Math.abs(cf.capitalExpenditures)) : "—"} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Capital Expenditures") : undefined} trace={traceByLabel?.["Capital Expenditures"]} labelMap={traceLabelMap} />
                <RatioCard label="Free Cash Flow" value={fmt(cf.freeCashFlow)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Free Cash Flow") : undefined} trace={traceByLabel?.["Free Cash Flow"]} labelMap={traceLabelMap} />
                <RatioCard label="Dividends Paid" value={cf.dividendsPaid != null ? fmt(-Math.abs(cf.dividendsPaid)) : "—"} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Dividends Paid") : undefined} trace={traceByLabel?.["Dividends Paid"]} labelMap={traceLabelMap} />
                <RatioCard label="FCF Conversion" value={fmtPct(ratios.fcfConversion)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("FCF Conversion") : undefined} trace={traceByLabel?.["FCF Conversion"]} labelMap={traceLabelMap} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* CF Bridge */}
                <Section title="Cash Flow Bridge ($M)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cfBridge}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                        <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                          {cfBridge.map((d, i) => <Cell key={i} fill={d.amt >= 0 ? COLORS.emerald : COLORS.red} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                {/* Cash Flow Detail */}
                <Section title="Cash Flow Statement">
                  <MetricTable
                    onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                    {...metricTableTraceProps}
                    rows={[
                      { label: "Operating Cash Flow", value: fmt(cf.operatingCashFlow), bold: true, traceable: true },
                      { label: "Capital Expenditures", value: fmt(cf.capitalExpenditures != null ? -Math.abs(cf.capitalExpenditures) : null), dim: true, traceable: true },
                      { label: "Free Cash Flow", value: fmt(cf.freeCashFlow), bold: true, traceable: true },
                      { label: "Dividends Paid", value: fmt(cf.dividendsPaid != null ? -Math.abs(cf.dividendsPaid) : null), dim: true, traceable: true },
                      { label: "Share Repurchases", value: fmt(buyback != null ? -Math.abs(buyback) : null), dim: true, traceable: true },
                      { label: "Investing Cash Flow", value: fmt(invCF), traceable: true },
                      { label: "LT Debt Issuance", value: fmt(debtIssuance), dim: true, traceable: true },
                      { label: "LT Debt Repayments", value: fmt(debtRepay != null ? -Math.abs(debtRepay) : null), dim: true, traceable: true },
                      { label: "Financing Cash Flow", value: fmt(finCF), traceable: true },
                    ]}
                  />
                </Section>
              </div>

              {/* Dividend Assessment */}
              <Section title="Dividend Assessment">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RatioCard label="Verdict" value={div.verdict.toUpperCase()} />
                  <RatioCard label="Payout (NI)" value={fmtPct(div.payoutRatioNI)} />
                  <RatioCard label="Payout (FCF)" value={fmtPct(div.payoutRatioFCF)} />
                  <RatioCard label="FCF Coverage" value={div.fcfCoverageYears != null ? `${div.fcfCoverageYears}x` : "—"} />
                </div>
              </Section>
            </div>
          );
        })()}

        {/* ─── INSIGHTS ─── */}
        {activeTab === "insights" && (
          <InsightsTab
            result={result}
            onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
            traceLabelMap={onTraceMetric ? traceLabelMap : undefined}
            traceByLabel={onTraceMetric ? traceByLabel : undefined}
          />
        )}

        {/* ─── DEEP DIVE ─── */}
        {activeTab === "deep-dive" && (() => {
          const footnotes = result.footnotes ?? [];
          const adjustedMetrics = result.adjustedMetrics ?? [];
          const passedCount = validation.checks.filter(c => c.passed).length;

          return (
            <div className="space-y-4">
              {/* Data Quality */}
              <Section title="Data Quality">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <CheckCircle2 className={cn("h-5 w-5", passedCount === validation.checks.length ? "text-emerald-500" : "text-amber-500")} />
                    <div>
                      <p className="text-sm font-bold">{passedCount}/{validation.checks.length} checks passed</p>
                      <p className="text-[11px] text-slate-500">Data integrity</p>
                    </div>
                  </div>
                  {reconcile && (
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                      {reconcile.status === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}
                      <div>
                        <p className="text-sm font-bold">A = L+E: {reconcile.status.toUpperCase()}</p>
                        <p className="text-[11px] text-slate-500">Gap: {reconcile.gapPct}% (${Math.abs(reconcile.gapM).toLocaleString()}M)</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {validation.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2.5">
                      {c.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-red-500" />}
                      <div>
                        <p className="text-[11px] font-semibold">{c.name}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-2">{c.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* All Ratios */}
              <Section title="Complete Ratio Analysis">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Profitability</h5>
                    <MetricTable
                      compact
                      onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                      {...metricTableTraceProps}
                      derivationOpenKey={deepDiveDerivationKey}
                      onDerivationOpenChange={setDeepDiveDerivationKey}
                      derivationScope="dd-p"
                      rows={[
                        { label: "Gross Margin", value: fmtPct(ratios.grossMargin), traceable: true },
                        { label: "Operating Margin", value: fmtPct(ratios.operatingMargin), traceable: true },
                        { label: "EBITDA Margin", value: fmtPct(ratios.ebitdaMargin), traceable: true },
                        { label: "Net Margin", value: fmtPct(ratios.netMargin), traceable: true },
                        { label: "ROE", value: fmtPct(ratios.returnOnEquity), traceable: true },
                        { label: "ROA", value: fmtPct(ratios.returnOnAssets), traceable: true },
                        { label: "ROIC", value: fmtPct(ratios.returnOnInvestedCapital), traceable: true },
                      ]}
                    />
                  </div>
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Leverage & Liquidity</h5>
                    <MetricTable
                      compact
                      onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                      {...metricTableTraceProps}
                      derivationOpenKey={deepDiveDerivationKey}
                      onDerivationOpenChange={setDeepDiveDerivationKey}
                      derivationScope="dd-l"
                      rows={[
                        { label: "Debt / Equity", value: fmtX(ratios.debtToEquity), traceable: true },
                        { label: "Debt / Capital", value: fmtPct(ratios.debtToCapital), traceable: true },
                        { label: "Net Debt / EBITDA", value: fmtX(ratios.netDebtToEbitda), traceable: true },
                        { label: "Interest Coverage", value: fmtX(ratios.interestCoverage), traceable: true },
                        { label: "Current Ratio", value: fmtX(ratios.currentRatio), traceable: true },
                        { label: "Working Capital", value: fmt(ratios.workingCapital), traceable: true },
                      ]}
                    />
                  </div>
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Efficiency & Cash</h5>
                    <MetricTable
                      compact
                      onRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
                      {...metricTableTraceProps}
                      derivationOpenKey={deepDiveDerivationKey}
                      onDerivationOpenChange={setDeepDiveDerivationKey}
                      derivationScope="dd-e"
                      rows={[
                        { label: "Asset Turnover", value: fmtX(ratios.assetTurnover), traceable: true },
                        { label: "Inventory Turnover", value: fmtX(ratios.inventoryTurnover), traceable: true },
                        { label: "Receivables Turnover", value: fmtX(ratios.receivablesTurnover), traceable: true },
                        { label: "FCF Yield", value: fmtPct(ratios.fcfYield), traceable: true },
                        { label: "FCF Conversion", value: fmtPct(ratios.fcfConversion), traceable: true },
                      ]}
                    />
                  </div>
                </div>
              </Section>

              {/* Footnotes */}
              {footnotes.length > 0 && (
                <Section title={`Notable Footnotes (${footnotes.length})`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {footnotes.map((fn, i) => (
                      <div key={i} className="rounded-lg border border-slate-100 p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800">{fn.title}</p>
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            fn.significance === "high" ? "bg-red-100 text-red-700" : fn.significance === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                          )}>
                            {fn.significance}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600">{fn.summary}</p>
                        <span className="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{fn.type}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Adjusted Metrics */}
              {adjustedMetrics.length > 0 && (
                <Section title={`Non-GAAP Adjusted Metrics (${adjustedMetrics.length})`}>
                  <div className="space-y-3">
                    {adjustedMetrics.map((am, i) => {
                      const totalAdj = am.adjustments.reduce((s, a) => s + a.value, 0);
                      const unit = am.unit === "per-share" ? "" : "M";
                      return (
                        <div key={i} className="rounded-lg border border-slate-100 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-slate-800">{am.name}</p>
                              <p className="text-[10px] text-slate-400">{am.period}</p>
                            </div>
                            <p className="text-base font-bold tabular-nums text-emerald-600">
                              {am.adjustedValue != null ? `$${am.adjustedValue.toLocaleString()}${unit}` : "—"}
                            </p>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              <tr className="border-b border-slate-100">
                                <td className="py-1 text-slate-500">GAAP</td>
                                <td className="py-1 text-right tabular-nums font-semibold">{am.gaapValue != null ? `$${am.gaapValue.toLocaleString()}${unit}` : "—"}</td>
                              </tr>
                              {am.adjustments.map((adj, j) => (
                                <tr key={j} className="border-b border-slate-50">
                                  <td className="py-1 pl-3 text-slate-400">+ {adj.label}</td>
                                  <td className={cn("py-1 text-right tabular-nums", adj.value >= 0 ? "text-emerald-600" : "text-red-500")}>
                                    {adj.value >= 0 ? "+" : ""}${adj.value.toLocaleString()}{unit}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-slate-200">
                                <td className="py-1 font-bold">Total adjustments</td>
                                <td className={cn("py-1 text-right tabular-nums font-bold", totalAdj >= 0 ? "text-emerald-600" : "text-red-500")}>
                                  {totalAdj >= 0 ? "+" : ""}${totalAdj.toLocaleString()}{unit}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Raw Line Items */}
              <Section title="Extracted Line Items">
                <div className="grid gap-4 lg:grid-cols-2">
                  <LineItemTable
                    title="Balance Sheet"
                    items={bs.items}
                    onRowClick={onTraceMetric ? traceLineItemRow : undefined}
                  />
                  <LineItemTable
                    title="Income & Cash Flow"
                    items={cfItems}
                    onRowClick={onTraceMetric ? traceLineItemRow : undefined}
                  />
                </div>
              </Section>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ──────────────────── Sub-components ──────────────────── */

function KpiCell({
  label,
  value,
  highlight,
  traceable,
  onClick,
  trace,
  labelMap,
  /** When false, no magnifying glass / PDF jump (e.g. top KPI strip only). */
  traceToPdf = true,
}: {
  label: string;
  value: string;
  highlight?: number | null;
  traceable?: boolean;
  onClick?: () => void;
  trace?: PdfTraceTarget | null;
  labelMap?: Record<string, MetricTraceSpec> | null;
  traceToPdf?: boolean;
}) {
  const valueClass = cn(
    "mt-0.5 text-sm font-bold tabular-nums sm:text-base",
    highlight != null ? (highlight > 0 ? "text-slate-900" : highlight < 0 ? "text-red-600" : "text-slate-900") : "text-slate-900",
  );
  const showInsight = trace && labelMap && trace.derivation;
  const pdfTrace = wantsPdfTrace(trace, {
    traceToPdf,
    enabled: !!(traceable && onClick),
  });
  return (
    <div className={cn("relative bg-white px-3 py-2.5 sm:px-4 sm:py-3", showInsight && "group/kpi")}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {pdfTrace ? (
        <button
          type="button"
          onClick={onClick}
          title="Show in PDF"
          aria-label={`Show ${label} in PDF`}
          className="group mt-0.5 flex w-full items-center justify-between gap-1 rounded-md text-left transition hover:bg-yellow-50/80"
        >
          <span className={valueClass}>{value}</span>
          <Search className="h-3.5 w-3.5 shrink-0 text-yellow-600 opacity-40 transition group-hover:opacity-100" aria-hidden />
        </button>
      ) : (
        <p className={valueClass}>{value}</p>
      )}
      {showInsight && (
        <DerivationTooltip trace={trace!} labelMap={labelMap!} position="left" hover="kpi" />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-white p-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
            >
              <XCircle className="h-3.5 w-3.5" /> Close
            </button>
          </div>
          <div className="text-base">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 group">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
        <button
          onClick={() => setExpanded(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <ArrowUpRight className="h-3 w-3" /> Expand
        </button>
      </div>
      {children}
    </div>
  );
}

function RatioCard({
  label,
  value,
  traceable,
  onClick,
  trace,
  labelMap,
}: {
  label: string;
  value: string;
  traceable?: boolean;
  onClick?: () => void;
  trace?: PdfTraceTarget | null;
  labelMap?: Record<string, MetricTraceSpec> | null;
}) {
  const showInsight = trace && labelMap && trace.derivation;
  const pdfTrace = wantsPdfTrace(trace, { enabled: !!(traceable && onClick) });
  return (
    <div className={cn("relative rounded-lg bg-slate-50 px-3 py-2.5", pdfTrace && "transition hover:bg-yellow-50/80", showInsight && "group/ratio")}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {pdfTrace ? (
        <button
          type="button"
          onClick={onClick}
          title="Show in PDF"
          aria-label={`Show ${label} in PDF`}
          className="group mt-0.5 flex w-full items-start justify-between gap-1 text-left"
        >
          <span className="text-sm font-bold tabular-nums text-slate-900">{value}</span>
          <Search className="h-3 w-3 shrink-0 text-yellow-600 opacity-40 transition group-hover:opacity-100" aria-hidden />
        </button>
      ) : (
        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      )}
      {showInsight && (
        <DerivationTooltip trace={trace!} labelMap={labelMap!} position="left" hover="ratio" />
      )}
    </div>
  );
}

function MetricTable({ rows, compact, onRowClick, labelMap, traceByLabel,
  derivationOpenKey,
  onDerivationOpenChange,
  derivationScope = "mt",
}: {
  rows: Array<{
    label: string;
    value: string;
    bold?: boolean;
    dim?: boolean;
    sub?: string;
    traceable?: boolean;
    /** When set, resolve trace from this key instead of `label` (e.g. display vs map key). */
    traceKey?: string;
  }>;
  compact?: boolean;
  onRowClick?: (label: string) => void;
  labelMap?: Record<string, MetricTraceSpec> | null;
  traceByLabel?: Record<string, PdfTraceTarget> | null;
  /** Controlled: one open tooltip id across sibling tables (e.g. Deep Dive ratio columns). */
  derivationOpenKey?: string | null;
  onDerivationOpenChange?: (key: string | null) => void;
  derivationScope?: string;
}) {
  const [localDerivationKey, setLocalDerivationKey] = useState<string | null>(null);
  const controlled = onDerivationOpenChange != null;
  const openDerivation = controlled ? (derivationOpenKey ?? null) : localDerivationKey;
  const setDerivation = controlled ? onDerivationOpenChange : setLocalDerivationKey;

  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.filter(r => r.value !== "—" || !compact).map((r, i) => {
          const lk = r.traceKey ?? r.label;
          const trace = traceByLabel?.[lk];
          const showInsight = !!(trace && labelMap && trace.derivation);
          const wantsPdf = wantsPdfTrace(trace, {
            enabled: !!(r.traceable && onRowClick),
          });
          const rowDerivationId = `${derivationScope}:${lk}`;
          return (
            <tr
              key={i}
              onClick={wantsPdf && onRowClick ? () => onRowClick(r.label) : undefined}
              className={cn(
                "border-b border-slate-100 last:border-b-0",
                r.bold && "bg-slate-50/50",
                wantsPdf && "group cursor-pointer transition hover:bg-yellow-50/60 hover:border-yellow-200",
              )}
            >
              <td className={cn(
                compact ? "py-1 px-1" : "py-1.5 px-2",
                r.bold ? "font-bold text-slate-800" : r.dim ? "text-slate-400" : "text-slate-600",
                wantsPdf && "group-hover:text-yellow-800"
              )}>
                {r.label}
                {wantsPdf && <Search className="ml-1 inline h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity text-yellow-600" />}
              </td>
              <td className={cn(
                "text-right tabular-nums align-top",
                compact ? "py-1 px-1" : "py-1.5 px-2",
                r.bold ? "font-bold text-slate-900" : "font-semibold text-slate-700",
              )}>
                <div
                  className="relative ml-auto w-full max-w-full min-w-0"
                  onPointerEnter={() => {
                    if (showInsight) setDerivation(rowDerivationId);
                  }}
                  onPointerLeave={() => {
                    if (showInsight) setDerivation(null);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span>{r.value}</span>
                    {r.sub && <span className="text-[10px] font-normal text-slate-400">{r.sub}</span>}
                  </div>
                  {showInsight && (
                    <DerivationTooltip
                      trace={trace!}
                      labelMap={labelMap!}
                      position="right"
                      hover="table"
                      show={openDerivation === rowDerivationId}
                    />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function IncomeStatementTable({ inc, onRowClick }: { inc: IncomeStatement; onRowClick?: (label: string) => void }) {
  const lines: Array<{ label: string; value: number | null; bold?: boolean; dim?: boolean; marginLabel?: string; margin?: number | null; indent?: boolean }> = [
    { label: "Revenue", value: inc.revenue, bold: true },
    { label: "Cost of Revenue", value: inc.costOfRevenue ? -inc.costOfRevenue : null, dim: true },
    { label: "Gross Profit", value: inc.grossProfit, bold: true, marginLabel: "Gross Margin", margin: inc.grossMargin },
    { label: "SG&A Expense", value: inc.sgaExpense ? -inc.sgaExpense : null, indent: true, dim: true },
    { label: "R&D Expense", value: inc.rdExpense ? -inc.rdExpense : null, indent: true, dim: true },
    { label: "Operating Income", value: inc.operatingIncome, bold: true, marginLabel: "OP Margin", margin: inc.operatingMargin },
    { label: "D&A", value: inc.depreciation != null ? inc.depreciation : null, indent: true, dim: true },
    { label: "EBITDA", value: inc.ebitda, bold: true, marginLabel: "EBITDA Margin", margin: inc.ebitdaMargin },
    { label: "Interest Expense", value: inc.interestExpense ? -inc.interestExpense : null, indent: true, dim: true },
    { label: "Income Tax", value: inc.incomeTax ? -inc.incomeTax : null, indent: true, dim: true },
    { label: "Net Income", value: inc.netIncome, bold: true, marginLabel: "Net Margin", margin: inc.netMargin },
  ];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-slate-200">
          <th className="px-3 py-2 text-left font-semibold text-slate-500">Line Item</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">$M</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">Margin</th>
        </tr>
      </thead>
      <tbody>
        {lines.filter(l => l.value != null).map((l, i) => {
          const clickable = !!onRowClick;
          return (
            <tr
              key={i}
              onClick={clickable ? () => onRowClick(l.label) : undefined}
              className={cn(
                "border-b border-slate-100",
                l.bold && "bg-slate-50/50",
                clickable && "cursor-pointer transition hover:bg-yellow-50/60",
              )}
            >
              <td className={cn(
                "px-3 py-1.5",
                l.indent && "pl-6",
                l.bold ? "font-bold text-slate-800" : l.dim ? "text-slate-400" : "text-slate-600",
              )}>
                {l.label}
                {clickable && <Search className="ml-1 inline h-3 w-3 text-yellow-600 opacity-40" aria-hidden />}
              </td>
              <td className={cn(
                "px-3 py-1.5 text-right tabular-nums",
                l.bold ? "font-bold text-slate-900" : "text-slate-700",
                l.value != null && l.value < 0 && "text-red-500",
              )}>
                {l.value != null ? (l.value < 0 ? `(${Math.abs(l.value).toLocaleString()})` : l.value.toLocaleString()) : "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                {l.margin != null ? `${l.margin.toFixed(1)}%` : ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ──────────────────── Insights Tab ──────────────────── */

function InsightsTab({
  result,
  onMetricTableRowClick,
  traceLabelMap,
  traceByLabel,
}: {
  result: FullAnalysis;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
  traceLabelMap?: Record<string, MetricTraceSpec> | null;
  traceByLabel?: Record<string, PdfTraceTarget> | null;
}) {
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, incomeStatement: inc } = result;
  const cfItems = result.cfItems ?? [];

  // ── Fetch ALL data source rows for trend charts + peer comparison
  const [allRows, setAllRows] = useState<DataSourceRow[]>([]);
  useEffect(() => {
    fetch("/api/data-source")
      .then(r => r.json())
      .then((d: { rows?: DataSourceRow[] }) => setAllRows(d.rows ?? []))
      .catch(() => {});
  }, []);

  const ticker = result.meta.ticker;

  // Current ticker's historical rows (sorted chronologically, exclude TTM)
  const historyRows = useMemo(() =>
    allRows.filter(r => r.ticker === ticker && r.periodEnd !== "TTM").sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)),
    [allRows, ticker]
  );

  // ── Fetch segment history for trend charts
  interface SegmentQuarter {
    periodEnd: string;
    quarterLabel: string;
    segments: Array<{
      segmentName: string;
      revenue: number | null;
      operatingIncome: number | null;
      operatingMargin: number | null;
      revenuePerUnit: number | null;
      operatingIncomePerUnit: number | null;
    }>;
  }
  const [segmentHistory, setSegmentHistory] = useState<SegmentQuarter[]>([]);
  useEffect(() => {
    if (!ticker || ticker === "UNKNOWN") return;
    fetch(`/api/segment-history?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { quarters?: SegmentQuarter[] } | null) => {
        if (d?.quarters) setSegmentHistory(d.quarters);
      })
      .catch(() => {});
  }, [ticker]);

  // ── TTM computation: sum last 4 quarters for flow metrics, latest for stock metrics
  const ttm = useMemo(() => {
    if (historyRows.length < 4) return null;
    const last4 = historyRows.slice(-4);
    const sumN = (fn: (r: DataSourceRow) => number | null) => {
      const vals = last4.map(fn).filter((v): v is number => v != null);
      return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const latest = last4[last4.length - 1];
    const rev = sumN(r => r.revenue);
    const gp = sumN(r => r.grossProfit);
    const op = sumN(r => r.operatingIncome);
    const ni = sumN(r => r.netIncome);
    const ebitda = sumN(r => r.ebitda);
    const ocf = sumN(r => r.operatingCashFlow);
    const fcf = sumN(r => r.freeCashFlow);
    const capex = sumN(r => r.capex);
    const divPaid = sumN(r => r.dividendsPaid);
    return {
      label: `TTM (${last4[0].quarterLabel}–${last4[3].quarterLabel})`,
      revenue: rev,
      grossProfit: gp,
      operatingIncome: op,
      netIncome: ni,
      ebitda,
      operatingCashFlow: ocf,
      freeCashFlow: fcf,
      capex,
      dividendsPaid: divPaid,
      grossMargin: rev && gp ? Math.round((gp / rev) * 1000) / 10 : null,
      operatingMargin: rev && op ? Math.round((op / rev) * 1000) / 10 : null,
      netMargin: rev && ni ? Math.round((ni / rev) * 1000) / 10 : null,
      ebitdaMargin: rev && ebitda ? Math.round((ebitda / rev) * 1000) / 10 : null,
      fcfMargin: rev && fcf ? Math.round((fcf / rev) * 1000) / 10 : null,
      // Stock metrics from latest quarter
      totalAssets: latest.totalAssets,
      totalEquity: latest.totalEquity,
      totalDebt: latest.totalDebt,
      cashAndEquivalents: latest.cashAndEquivalents,
      debtToEquity: latest.debtToEquity,
      currentRatio: latest.currentRatio,
      roe: ni != null && latest.totalEquity ? Math.round((ni / latest.totalEquity) * 1000) / 10 : null,
      roa: ni != null && latest.totalAssets ? Math.round((ni / latest.totalAssets) * 1000) / 10 : null,
    };
  }, [historyRows]);

  const ttmTraceExtra = useMemo((): Record<string, MetricTraceSpec> | undefined => {
    if (!ttm) return undefined;
    return {
      "Revenue TTM": { value: ttm.revenue, tags: ["Revenues", "NetRevenues"] },
      "EBITDA TTM": { value: ttm.ebitda, tags: ["EBITDA"] },
      "Net Income TTM": { value: ttm.netIncome, tags: ["NetIncome"] },
      "OCF TTM": { value: ttm.operatingCashFlow, tags: ["OperatingCashFlow"] },
      "FCF TTM": { value: ttm.freeCashFlow, tags: ["FreeCashFlow"] },
      "CapEx TTM": { value: ttm.capex, tags: ["CapitalExpenditure"] },
      "Gross Margin": { value: ttm.grossMargin, tags: ["GrossProfit", "Revenues"] },
      "OP Margin": { value: ttm.operatingMargin, tags: ["OperatingIncome", "Revenues"] },
      "EBITDA Margin": { value: ttm.ebitdaMargin, tags: ["EBITDA", "Revenues"] },
      "Net Margin": { value: ttm.netMargin, tags: ["NetIncome", "Revenues"] },
      "ROE (TTM)": { value: ttm.roe, tags: ["NetIncome", "StockholdersEquity"] },
      "ROA (TTM)": { value: ttm.roa, tags: ["NetIncome", "Assets"] },
      "FCF Margin": { value: ttm.fcfMargin, tags: ["FreeCashFlow", "Revenues"] },
    };
  }, [ttm]);

  // ── Peer comparison: compute latest-quarter metrics per company
  interface PeerSummary {
    ticker: string;
    companyName: string;
    revenue: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    ebitdaMargin: number | null;
    roe: number | null;
    roa: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    fcfMargin: number | null;
    totalDebt: number | null;
    totalEquity: number | null;
    netIncome: number | null;
    ebitda: number | null;
    freeCashFlow: number | null;
  }

  const peers = useMemo((): PeerSummary[] => {
    // Group by ticker, take most recent quarter. Filter out UNKNOWN, TTM rows.
    const byTicker = new Map<string, DataSourceRow>();
    for (const r of allRows) {
      if (r.ticker === "UNKNOWN" || r.periodEnd === "TTM") continue;
      const existing = byTicker.get(r.ticker);
      if (!existing || r.periodEnd > existing.periodEnd) byTicker.set(r.ticker, r);
    }
    return [...byTicker.values()]
      .map(r => ({
        ticker: r.ticker,
        companyName: r.companyName,
        revenue: r.revenue,
        grossMargin: r.grossMargin,
        operatingMargin: r.operatingMargin,
        netMargin: r.netMargin,
        ebitdaMargin: r.ebitdaMargin ?? null,
        roe: r.roe ?? null,
        roa: r.roa ?? null,
        debtToEquity: r.debtToEquity,
        currentRatio: r.currentRatio,
        fcfMargin: r.fcfMargin ?? null,
        totalDebt: r.totalDebt,
        totalEquity: r.totalEquity,
        netIncome: r.netIncome,
        ebitda: r.ebitda,
        freeCashFlow: r.freeCashFlow,
      }))
      .sort((a, b) => (a.ticker === ticker ? -1 : b.ticker === ticker ? 1 : a.ticker.localeCompare(b.ticker)));
  }, [allRows, ticker]);

  // ── DuPont 3-Factor: ROE = Net Margin × Asset Turnover × Equity Multiplier
  const dupont = useMemo(() => {
    const netMargin = inc.revenue && inc.netIncome ? inc.netIncome / inc.revenue : null;
    const assetTurnover = inc.revenue && bs.totalAssets ? inc.revenue / bs.totalAssets : null;
    const equityMultiplier = bs.totalAssets && bs.totalEquity ? bs.totalAssets / bs.totalEquity : null;
    const computed = netMargin && assetTurnover && equityMultiplier
      ? netMargin * assetTurnover * equityMultiplier * 100 : null;

    // 5-factor: ROE = (EBT/EBIT) × (EBIT/Revenue) × (Revenue/Assets) × (Assets/Equity) × (NI/EBT)
    const ebit = inc.operatingIncome;
    const ebt = inc.netIncome != null && inc.incomeTax != null ? inc.netIncome + inc.incomeTax : null;
    const taxBurden = inc.netIncome != null && ebt != null && ebt !== 0 ? inc.netIncome / ebt : null;
    const interestBurden = ebt != null && ebit != null && ebit !== 0 ? ebt / ebit : null;
    const opMarginFactor = ebit != null && inc.revenue ? ebit / inc.revenue : null;

    return { netMargin, assetTurnover, equityMultiplier, computed, taxBurden, interestBurden, opMarginFactor };
  }, [inc, bs]);

  // ── Altman Z-Score (manufacturing model)
  const zScore = useMemo(() => {
    if (!bs.totalAssets) return null;
    const ta = bs.totalAssets;
    const wc = ratios.workingCapital ?? 0;
    const re = bs.retainedEarnings ?? 0;
    const ebit = inc.operatingIncome ?? 0;
    const equity = bs.totalEquity;
    const totalLiab = bs.totalLiabilities;
    const revenue = inc.revenue ?? 0;

    const x1 = wc / ta;
    const x2 = re / ta;
    const x3 = ebit / ta;
    const x4 = totalLiab > 0 ? equity / totalLiab : 0;
    const x5 = revenue / ta;

    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    const zone: "safe" | "grey" | "distress" = z > 2.99 ? "safe" : z > 1.81 ? "grey" : "distress";
    return { z: Math.round(z * 100) / 100, zone, x1, x2, x3, x4, x5 };
  }, [bs, inc, ratios]);

  // ── Piotroski F-Score (0-9)
  const piotroski = useMemo(() => {
    const signals: { name: string; pass: boolean | null; desc: string }[] = [];
    // Profitability
    signals.push({ name: "ROA > 0", pass: inc.netIncome != null && bs.totalAssets ? (inc.netIncome / bs.totalAssets) > 0 : null, desc: "Positive return on assets" });
    signals.push({ name: "OCF > 0", pass: cf.operatingCashFlow != null ? cf.operatingCashFlow > 0 : null, desc: "Positive operating cash flow" });
    signals.push({ name: "Accruals < 0", pass: cf.operatingCashFlow != null && inc.netIncome != null ? (cf.operatingCashFlow - inc.netIncome) > 0 : null, desc: "OCF exceeds net income (quality earnings)" });
    // Leverage & Liquidity
    const ltDebtRatio = bs.totalAssets ? debt.longTermDebt / bs.totalAssets : null;
    signals.push({ name: "LT Debt ↓", pass: ltDebtRatio != null ? ltDebtRatio < 0.4 : null, desc: "LT debt/assets < 40% (lower is better)" });
    signals.push({ name: "Current Ratio > 1", pass: ratios.currentRatio != null ? ratios.currentRatio > 1 : null, desc: "Sufficient liquidity" });
    // Operating efficiency
    signals.push({ name: "Gross Margin ↑", pass: inc.grossMargin != null ? inc.grossMargin > 0 : null, desc: "Positive gross margins" });
    signals.push({ name: "Asset Turnover", pass: ratios.assetTurnover != null ? ratios.assetTurnover > 0.5 : null, desc: "Efficient asset utilization" });
    // Equity
    signals.push({ name: "No Dilution", pass: true, desc: "Not issuing excessive new shares (assumed)" });
    signals.push({ name: "Positive Equity", pass: bs.totalEquity > 0, desc: "Positive shareholders' equity" });

    const score = signals.filter(s => s.pass === true).length;
    return { score, signals };
  }, [inc, cf, bs, debt, ratios]);

  // ── Earnings Quality
  const earningsQuality = useMemo(() => {
    const accruals = cf.operatingCashFlow != null && inc.netIncome != null
      ? cf.operatingCashFlow - inc.netIncome : null;
    const accrualRatio = accruals != null && bs.totalAssets
      ? Math.round((accruals / bs.totalAssets) * 1000) / 10 : null;
    const ocfToNI = cf.operatingCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? Math.round((cf.operatingCashFlow / inc.netIncome) * 100) / 100 : null;
    const fcfToNI = cf.freeCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? Math.round((cf.freeCashFlow / inc.netIncome) * 100) / 100 : null;
    const quality: "high" | "moderate" | "low" | "unknown" =
      ocfToNI == null ? "unknown" :
      ocfToNI >= 1.0 ? "high" :
      ocfToNI >= 0.7 ? "moderate" : "low";
    return { accruals, accrualRatio, ocfToNI, fcfToNI, quality };
  }, [cf, inc, bs]);

  // ── Cash Conversion Cycle
  const ccc = useMemo(() => {
    const rev = inc.revenue;
    const cogs = inc.costOfRevenue;
    const ar = lineValueByTags(cfItems, bs.items, "AccountsReceivableNetCurrent", "AccountsReceivableNet");
    const inv = lineValueByTags(cfItems, bs.items, "InventoryNet");
    const ap = lineValueByTags(cfItems, bs.items, "AccountsPayableCurrent", "AccountsPayable");

    const dso = ar != null && rev ? Math.round((ar / rev) * 365) : null;
    const dio = inv != null && cogs ? Math.round((inv / cogs) * 365) : null;
    const dpo = ap != null && cogs ? Math.round((ap / cogs) * 365) : null;
    const cycle = dso != null && dio != null && dpo != null ? dso + dio - dpo : null;
    return { dso, dio, dpo, cycle };
  }, [inc, cfItems, bs]);

  // ── Capital Allocation
  const capAlloc = useMemo(() => {
    const buyback = cfItems.find(i => i.tag === "PaymentsForRepurchaseOfCommonStock")?.value ?? null;
    const sbc = cfItems.find(i => i.tag === "ShareBasedCompensation")?.value ?? null;
    const capex = cf.capitalExpenditures;
    const ocf = cf.operatingCashFlow;
    const divPaid = cf.dividendsPaid;
    const reinvestmentRate = ocf && capex ? Math.round((Math.abs(capex) / ocf) * 1000) / 10 : null;
    const totalReturn = (divPaid ?? 0) + (buyback ?? 0);
    const returnYieldOnEquity = totalReturn && bs.totalEquity ? Math.round((totalReturn / bs.totalEquity) * 1000) / 10 : null;
    return { buyback, sbc, reinvestmentRate, totalReturn, returnYieldOnEquity };
  }, [cf, cfItems, bs]);

  // ── Overall Financial Health
  const healthScore = useMemo(() => {
    let score = 0; let max = 0;
    // Profitability (3 pts)
    if (inc.operatingMargin != null) { max += 3; if (inc.operatingMargin > 15) score += 3; else if (inc.operatingMargin > 5) score += 2; else if (inc.operatingMargin > 0) score += 1; }
    // Leverage (3 pts)
    if (ratios.debtToEquity != null) { max += 3; if (ratios.debtToEquity < 0.5) score += 3; else if (ratios.debtToEquity < 1.5) score += 2; else if (ratios.debtToEquity < 3) score += 1; }
    // Liquidity (2 pts)
    if (ratios.currentRatio != null) { max += 2; if (ratios.currentRatio > 2) score += 2; else if (ratios.currentRatio > 1) score += 1; }
    // Cash generation (3 pts)
    if (earningsQuality.ocfToNI != null) { max += 3; if (earningsQuality.ocfToNI >= 1.2) score += 3; else if (earningsQuality.ocfToNI >= 0.8) score += 2; else if (earningsQuality.ocfToNI > 0) score += 1; }
    // Returns (3 pts)
    if (ratios.returnOnEquity != null) { max += 3; if (ratios.returnOnEquity > 20) score += 3; else if (ratios.returnOnEquity > 10) score += 2; else if (ratios.returnOnEquity > 0) score += 1; }
    // FCF (2 pts)
    if (ratios.fcfYield != null) { max += 2; if (ratios.fcfYield > 8) score += 2; else if (ratios.fcfYield > 3) score += 1; }
    // Interest coverage (2 pts)
    if (ratios.interestCoverage != null) { max += 2; if (ratios.interestCoverage > 5) score += 2; else if (ratios.interestCoverage > 2) score += 1; }
    const pctScore = max > 0 ? Math.round((score / max) * 100) : 0;
    const grade: string = pctScore >= 80 ? "A" : pctScore >= 65 ? "B" : pctScore >= 45 ? "C" : pctScore >= 25 ? "D" : "F";
    return { score, max, pctScore, grade };
  }, [inc, ratios, earningsQuality]);

  const footnotes = result.footnotes ?? [];
  const adjustedMetrics = result.adjustedMetrics ?? [];
  const narrative = result.earningsNarrative;

  // ── Valuation Multiples (auto-fetch or manual market cap)
  const [marketCapInput, setMarketCapInput] = useState("");
  const [marketCapLoading, setMarketCapLoading] = useState(false);
  const [stockPrice, setStockPrice] = useState<number | null>(null);

  // Auto-fetch market cap on mount
  useEffect(() => {
    if (!ticker || ticker === "UNKNOWN") return;
    setMarketCapLoading(true);
    fetch(`/api/market-cap?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { marketCapM?: number; price?: number } | null) => {
        if (d?.marketCapM) {
          setMarketCapInput(String(d.marketCapM));
          setStockPrice(d.price ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setMarketCapLoading(false));
  }, [ticker]);

  const marketCap = useMemo(() => {
    const v = parseFloat(marketCapInput);
    return isNaN(v) || v <= 0 ? null : v;
  }, [marketCapInput]);

  const valuation = useMemo(() => {
    if (!marketCap) return null;
    const netDebt = (debt.longTermDebt + (debt.shortTermDebt ?? 0)) - (bs.cashAndEquivalents);
    const ev = marketCap + netDebt;
    const ebitdaVal = ttm?.ebitda ?? (inc.operatingIncome != null && cfItems.find(i => i.tag === "DepreciationDepletionAndAmortization" || i.tag === "DepreciationAndAmortization")?.value != null
      ? inc.operatingIncome + Math.abs(cfItems.find(i => i.tag === "DepreciationDepletionAndAmortization" || i.tag === "DepreciationAndAmortization")!.value)
      : null);
    const niVal = ttm?.netIncome ?? inc.netIncome;
    const fcfVal = ttm?.freeCashFlow ?? cf.freeCashFlow;
    const revVal = ttm?.revenue ?? inc.revenue;

    const evToEbitda = ebitdaVal && ebitdaVal > 0 ? Math.round((ev / ebitdaVal) * 10) / 10 : null;
    const evToRev = revVal && revVal > 0 ? Math.round((ev / revVal) * 10) / 10 : null;
    const pe = niVal && niVal > 0 ? Math.round((marketCap / niVal) * 10) / 10 : null;
    const pFcf = fcfVal && fcfVal > 0 ? Math.round((marketCap / fcfVal) * 10) / 10 : null;
    const fcfYield = fcfVal && marketCap > 0 ? Math.round((fcfVal / marketCap) * 1000) / 10 : null;
    const divYield = cf.dividendsPaid && marketCap > 0 ? Math.round((Math.abs(cf.dividendsPaid) / marketCap) * 1000) / 10 : null;

    return { ev, netDebt, evToEbitda, evToRev, pe, pFcf, fcfYield, divYield };
  }, [marketCap, debt, bs, inc, cf, cfItems, ttm]);

  // ── AI Commentary state ──
  interface Commentary {
    dupont: string | null;
    zScore: string | null;
    piotroski: string | null;
    earningsQuality: string | null;
    ccc: string | null;
    peerPositioning: string | null;
    ttmOutlook: string | null;
    overallAssessment: string;
  }
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);

  const generateCommentary = async () => {
    setCommentaryLoading(true);
    try {
      const resp = await fetch("/api/insights-commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          companyName: result.meta.companyName,
          dupont: {
            netMargin: dupont.netMargin != null ? Math.round(dupont.netMargin * 1000) / 10 : null,
            assetTurnover: dupont.assetTurnover != null ? Math.round(dupont.assetTurnover * 100) / 100 : null,
            equityMultiplier: dupont.equityMultiplier != null ? Math.round(dupont.equityMultiplier * 100) / 100 : null,
            roe: dupont.computed,
          },
          zScore: zScore ? { score: zScore.z, zone: zScore.zone } : undefined,
          piotroski: { score: piotroski.score, maxScore: 9 },
          earningsQuality: {
            accrualRatio: earningsQuality.accrualRatio,
            cashConversion: earningsQuality.ocfToNI,
          },
          ccc: { dso: ccc.dso, dio: ccc.dio, dpo: ccc.dpo, ccc: ccc.cycle },
          peerMetrics: peers.slice(0, 6).map(p => ({
            ticker: p.ticker,
            operatingMargin: p.operatingMargin,
            roe: p.roe,
            debtToEquity: p.debtToEquity,
          })),
          ttm: ttm ? {
            revenue: ttm.revenue,
            operatingMargin: ttm.operatingMargin,
            netMargin: ttm.netMargin,
            fcfMargin: ttm.fcfMargin,
          } : undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setCommentary(data);
      }
    } catch (e) {
      console.error("Commentary generation failed:", e);
    } finally {
      setCommentaryLoading(false);
    }
  };

  const [deckLoading, setDeckLoading] = useState(false);
  const exportInsightsDeck = async () => {
    setDeckLoading(true);
    try {
      const resp = await fetch("/api/export/insights-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: result.meta.ticker, analysis: result }),
      });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.meta.ticker ?? "Insights"}_Deck_${new Date().toISOString().slice(0, 10)}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Deck export failed:", e);
    } finally {
      setDeckLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Action Buttons ── */}
      <div className="flex justify-end gap-2">
        <button
          onClick={generateCommentary}
          disabled={commentaryLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:bg-violet-700 disabled:opacity-50"
        >
          <Info className="h-3.5 w-3.5" />
          {commentaryLoading ? "Analyzing…" : commentary ? "Refresh Commentary" : "Generate AI Commentary"}
        </button>
        <button
          onClick={exportInsightsDeck}
          disabled={deckLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {deckLoading ? "Generating…" : "Export Insights Deck"}
        </button>
      </div>

      {/* ── Overall AI Assessment ── */}
      {commentary?.overallAssessment && (
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-violet-600" />
            <p className="text-xs font-bold uppercase tracking-wider text-violet-600">AI Analyst Assessment</p>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{commentary.overallAssessment}</p>
        </div>
      )}

      {/* ── Financial Health Summary ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn("rounded-xl border-2 p-4 text-center",
          healthScore.grade === "A" ? "border-emerald-300 bg-emerald-50" :
          healthScore.grade === "B" ? "border-blue-300 bg-blue-50" :
          healthScore.grade === "C" ? "border-amber-300 bg-amber-50" :
          "border-red-300 bg-red-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Financial Health</p>
          <p className={cn("text-4xl font-black mt-1",
            healthScore.grade === "A" ? "text-emerald-600" :
            healthScore.grade === "B" ? "text-blue-600" :
            healthScore.grade === "C" ? "text-amber-600" : "text-red-600"
          )}>{healthScore.grade}</p>
          <p className="text-xs text-slate-500 mt-1">{healthScore.score}/{healthScore.max} points ({healthScore.pctScore}%)</p>
        </div>

        {zScore && (
          <div className={cn("rounded-xl border-2 p-4 text-center",
            zScore.zone === "safe" ? "border-emerald-300 bg-emerald-50" :
            zScore.zone === "grey" ? "border-amber-300 bg-amber-50" :
            "border-red-300 bg-red-50"
          )}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Altman Z-Score</p>
            <p className={cn("text-3xl font-black mt-1",
              zScore.zone === "safe" ? "text-emerald-600" :
              zScore.zone === "grey" ? "text-amber-600" : "text-red-600"
            )}>{zScore.z.toFixed(2)}</p>
            <p className="text-xs mt-1">
              <span className={cn("rounded px-1.5 py-0.5 font-bold text-[10px]",
                zScore.zone === "safe" ? "bg-emerald-200 text-emerald-800" :
                zScore.zone === "grey" ? "bg-amber-200 text-amber-800" : "bg-red-200 text-red-800"
              )}>
                {zScore.zone === "safe" ? "SAFE ZONE" : zScore.zone === "grey" ? "GREY ZONE" : "DISTRESS ZONE"}
              </span>
            </p>
          </div>
        )}

        <div className={cn("rounded-xl border-2 p-4 text-center",
          piotroski.score >= 7 ? "border-emerald-300 bg-emerald-50" :
          piotroski.score >= 4 ? "border-amber-300 bg-amber-50" :
          "border-red-300 bg-red-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Piotroski F-Score</p>
          <p className={cn("text-3xl font-black mt-1",
            piotroski.score >= 7 ? "text-emerald-600" :
            piotroski.score >= 4 ? "text-amber-600" : "text-red-600"
          )}>{piotroski.score}/9</p>
          <p className="text-xs text-slate-500 mt-1">{piotroski.score >= 7 ? "Strong" : piotroski.score >= 4 ? "Moderate" : "Weak"} fundamentals</p>
        </div>

        <div className={cn("rounded-xl border-2 p-4 text-center",
          earningsQuality.quality === "high" ? "border-emerald-300 bg-emerald-50" :
          earningsQuality.quality === "moderate" ? "border-blue-300 bg-blue-50" :
          earningsQuality.quality === "low" ? "border-red-300 bg-red-50" :
          "border-slate-300 bg-slate-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Earnings Quality</p>
          <p className={cn("text-2xl font-black mt-1",
            earningsQuality.quality === "high" ? "text-emerald-600" :
            earningsQuality.quality === "moderate" ? "text-blue-600" :
            earningsQuality.quality === "low" ? "text-red-600" : "text-slate-500"
          )}>{earningsQuality.quality === "unknown" ? "N/A" : earningsQuality.quality.toUpperCase()}</p>
          <p className="text-xs text-slate-500 mt-1">OCF/NI: {earningsQuality.ocfToNI != null ? `${earningsQuality.ocfToNI}x` : "—"}</p>
        </div>
      </div>

      {/* ── Segment Analysis (Insights tab) ── */}
      {result.segments && result.segments.length > 0 && (() => {
        const segs = result.segments!.filter(s => s.revenue != null && s.revenue > 0);
        const totalRev = segs.reduce((acc, s) => acc + (s.revenue ?? 0), 0);
        const pieData = segs.map((s, i) => ({
          name: s.segmentName,
          value: s.revenue ?? 0,
          pct: totalRev > 0 ? Math.round(((s.revenue ?? 0) / totalRev) * 1000) / 10 : 0,
          fill: PIE_PALETTE[i % PIE_PALETTE.length],
        }));
        const barData = segs.map(s => ({
          name: s.segmentName.length > 12 ? s.segmentName.slice(0, 12) + "…" : s.segmentName,
          opMargin: s.operatingMargin ?? 0,
          opIncome: s.operatingIncome ?? 0,
        }));
        return (
          <Section title={`Segment Analysis (${segs.length} segments)`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Revenue Mix</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        outerRadius={80} label={(props) => `${props.name} ${(props as unknown as { pct: number }).pct}%`}
                        labelLine={false} fontSize={9}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Operating Margin by Segment (%)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 4, right: 12 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} unit="%" />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                      <Bar dataKey="opMargin" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            {/* Segment table */}
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-500">
                    <th className="px-2 py-1.5 text-left font-semibold">Segment</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Revenue</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Rev %</th>
                    <th className="px-2 py-1.5 text-right font-semibold">OP Income</th>
                    <th className="px-2 py-1.5 text-right font-semibold">OP Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {segs.map((seg, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-medium">{seg.segmentName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(seg.revenue)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                        {totalRev > 0 ? `${(((seg.revenue ?? 0) / totalRev) * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(seg.operatingIncome)}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold",
                        (seg.operatingMargin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"
                      )}>{fmtPct(seg.operatingMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })()}

      {/* ── Segment Trend Charts (if multi-quarter segment data) ── */}
      {segmentHistory.length >= 2 && (() => {
        // Collect all unique segment names across quarters
        const segNames = [...new Set(segmentHistory.flatMap(q => q.segments.map(s => s.segmentName)))];
        // Build chart data: { quarter, seg1_rev, seg1_margin, seg2_rev, ... }
        const revData = segmentHistory.map(q => {
          const point: Record<string, string | number | null> = { q: q.quarterLabel || q.periodEnd.slice(0, 7) };
          for (const name of segNames) {
            const seg = q.segments.find(s => s.segmentName === name);
            point[name] = seg?.revenue ?? null;
          }
          return point;
        });
        const marginData = segmentHistory.map(q => {
          const point: Record<string, string | number | null> = { q: q.quarterLabel || q.periodEnd.slice(0, 7) };
          for (const name of segNames) {
            const seg = q.segments.find(s => s.segmentName === name);
            point[name] = seg?.operatingMargin ?? null;
          }
          return point;
        });
        const opData = segmentHistory.map(q => {
          const point: Record<string, string | number | null> = { q: q.quarterLabel || q.periodEnd.slice(0, 7) };
          for (const name of segNames) {
            const seg = q.segments.find(s => s.segmentName === name);
            point[name] = seg?.operatingIncome ?? null;
          }
          return point;
        });

        return (
          <Section title={`Segment Trends (${segmentHistory.length} quarters × ${segNames.length} segments)`}>
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Segment Revenue Trends */}
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Segment Revenue ($M)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="q" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                      {segNames.map((name, i) => (
                        <Line key={name} type="monotone" dataKey={name} name={name}
                          stroke={PIE_PALETTE[i % PIE_PALETTE.length]} strokeWidth={2}
                          dot={{ r: 3 }} connectNulls />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Segment OP Margin Trends */}
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Segment OP Margin (%)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={marginData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="q" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                      {segNames.map((name, i) => (
                        <Line key={name} type="monotone" dataKey={name} name={name}
                          stroke={PIE_PALETTE[i % PIE_PALETTE.length]} strokeWidth={2}
                          dot={{ r: 3 }} connectNulls />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* Segment OP Income Trends */}
              <div className="lg:col-span-2">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Segment Operating Income ($M)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="q" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                      {segNames.map((name, i) => (
                        <Bar key={name} dataKey={name} name={name}
                          fill={PIE_PALETTE[i % PIE_PALETTE.length]} radius={[3, 3, 0, 0]} />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Section>
        );
      })()}

      {/* ── Historical Trend Charts (if multi-quarter data) ── */}
      {historyRows.length >= 2 && (
        <Section title={`Quarterly Trends (${historyRows.length} quarters)`}>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Revenue & Net Income */}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Revenue & Net Income ($M)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyRows.map(r => ({ q: r.quarterLabel || r.periodEnd.slice(0, 7), rev: r.revenue, ni: r.netIncome }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="q" tick={{ fontSize: 9 }} interval={historyRows.length > 8 ? 1 : 0} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                    <Line type="monotone" dataKey="rev" name="Revenue" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="ni" name="Net Income" stroke={COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Margin Trends */}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Margin Trends (%)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyRows.map(r => ({ q: r.quarterLabel || r.periodEnd.slice(0, 7), gm: r.grossMargin, om: r.operatingMargin, nm: r.netMargin }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="q" tick={{ fontSize: 9 }} interval={historyRows.length > 8 ? 1 : 0} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                    <Line type="monotone" dataKey="gm" name="Gross" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="om" name="Operating" stroke={COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="nm" name="Net" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Debt & Leverage */}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Debt & Cash ($M)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historyRows.map(r => ({ q: r.quarterLabel || r.periodEnd.slice(0, 7), debt: r.totalDebt, cash: r.cashAndEquivalents }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="q" tick={{ fontSize: 9 }} interval={historyRows.length > 8 ? 1 : 0} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                    <Bar dataKey="debt" name="Total Debt" fill={COLORS.red} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="cash" name="Cash" fill={COLORS.emerald} radius={[3, 3, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Cash Flow Trends */}
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Cash Flow ($M)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyRows.map(r => ({ q: r.quarterLabel || r.periodEnd.slice(0, 7), ocf: r.operatingCashFlow, fcf: r.freeCashFlow, capex: r.capex != null ? -Math.abs(r.capex) : null }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="q" tick={{ fontSize: 9 }} interval={historyRows.length > 8 ? 1 : 0} angle={-30} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                    <Line type="monotone" dataKey="ocf" name="Operating CF" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="fcf" name="FCF" stroke={COLORS.emerald} strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="capex" name="CapEx" stroke={COLORS.red} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── QoQ Momentum ── */}
      {historyRows.length >= 2 && (() => {
        const curr = historyRows[historyRows.length - 1];
        const prev = historyRows[historyRows.length - 2];
        const qoq = (c: number | null, p: number | null) => {
          if (c == null || p == null || p === 0) return null;
          return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
        };
        const metrics = [
          { label: "Revenue", change: qoq(curr.revenue, prev.revenue), curr: curr.revenue, prev: prev.revenue },
          { label: "Gross Profit", change: qoq(curr.grossProfit, prev.grossProfit), curr: curr.grossProfit, prev: prev.grossProfit },
          { label: "Operating Income", change: qoq(curr.operatingIncome, prev.operatingIncome), curr: curr.operatingIncome, prev: prev.operatingIncome },
          { label: "Net Income", change: qoq(curr.netIncome, prev.netIncome), curr: curr.netIncome, prev: prev.netIncome },
          { label: "Operating CF", change: qoq(curr.operatingCashFlow, prev.operatingCashFlow), curr: curr.operatingCashFlow, prev: prev.operatingCashFlow },
          { label: "FCF", change: qoq(curr.freeCashFlow, prev.freeCashFlow), curr: curr.freeCashFlow, prev: prev.freeCashFlow },
        ].filter(m => m.change != null);

        if (metrics.length === 0) return null;
        return (
          <Section title={`QoQ Momentum: ${prev.quarterLabel ?? prev.periodEnd} → ${curr.quarterLabel ?? curr.periodEnd}`}>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {metrics.map((m, i) => (
                <div key={i} className={cn("rounded-lg border p-3 text-center",
                  m.change! > 0 ? "border-emerald-200 bg-emerald-50/50" :
                  m.change! < -10 ? "border-red-200 bg-red-50/50" :
                  "border-slate-200 bg-white"
                )}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{m.label}</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {m.change! > 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" /> :
                     m.change! < 0 ? <ArrowDownRight className="h-3.5 w-3.5 text-red-500" /> :
                     <Minus className="h-3.5 w-3.5 text-slate-400" />}
                    <span className={cn("text-lg font-black tabular-nums",
                      m.change! > 0 ? "text-emerald-600" : m.change! < 0 ? "text-red-500" : "text-slate-600"
                    )}>{m.change! > 0 ? "+" : ""}{m.change}%</span>
                  </div>
                  <p className="text-[9px] text-slate-400 tabular-nums mt-0.5">
                    {fmt(m.prev)} → {fmt(m.curr)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        );
      })()}

      {/* ── YoY Comparison (same quarter, prior year) ── */}
      {historyRows.length >= 5 && (() => {
        // Match current quarter to same quarter from prior year via quarter label (e.g. Q1 FY2025 → Q1 FY2024)
        const curr = historyRows[historyRows.length - 1];
        // Try to find same fiscal quarter from ~4 quarters ago
        const currQ = curr.quarterLabel?.match(/Q(\d)/)?.[1];
        let yago: DataSourceRow | null = null;
        if (currQ) {
          // Search backwards for matching quarter label with different year
          for (let i = historyRows.length - 2; i >= 0; i--) {
            const q = historyRows[i].quarterLabel?.match(/Q(\d)/)?.[1];
            if (q === currQ && historyRows[i].periodEnd !== curr.periodEnd) {
              yago = historyRows[i];
              break;
            }
          }
        }
        // Fallback: take the row ~4 positions back
        if (!yago && historyRows.length >= 5) {
          yago = historyRows[historyRows.length - 5];
        }
        if (!yago) return null;

        const yoy = (c: number | null, p: number | null) => {
          if (c == null || p == null || p === 0) return null;
          return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
        };
        const delta = (c: number | null, p: number | null) => {
          if (c == null || p == null) return null;
          return Math.round((c - p) * 10) / 10;
        };

        const metrics = [
          { label: "Revenue", change: yoy(curr.revenue, yago.revenue), curr: curr.revenue, prev: yago.revenue, type: "pct" as const },
          { label: "Gross Profit", change: yoy(curr.grossProfit, yago.grossProfit), curr: curr.grossProfit, prev: yago.grossProfit, type: "pct" as const },
          { label: "OP Income", change: yoy(curr.operatingIncome, yago.operatingIncome), curr: curr.operatingIncome, prev: yago.operatingIncome, type: "pct" as const },
          { label: "Net Income", change: yoy(curr.netIncome, yago.netIncome), curr: curr.netIncome, prev: yago.netIncome, type: "pct" as const },
          { label: "Gross Margin", change: delta(curr.grossMargin, yago.grossMargin), curr: curr.grossMargin, prev: yago.grossMargin, type: "bps" as const },
          { label: "OP Margin", change: delta(curr.operatingMargin, yago.operatingMargin), curr: curr.operatingMargin, prev: yago.operatingMargin, type: "bps" as const },
          { label: "Net Margin", change: delta(curr.netMargin, yago.netMargin), curr: curr.netMargin, prev: yago.netMargin, type: "bps" as const },
          { label: "D/E Ratio", change: delta(curr.debtToEquity, yago.debtToEquity), curr: curr.debtToEquity, prev: yago.debtToEquity, type: "ratio" as const },
          { label: "FCF", change: yoy(curr.freeCashFlow, yago.freeCashFlow), curr: curr.freeCashFlow, prev: yago.freeCashFlow, type: "pct" as const },
          { label: "EPS Diluted", change: yoy(curr.epsDiluted, yago.epsDiluted), curr: curr.epsDiluted, prev: yago.epsDiluted, type: "pct" as const },
        ].filter(m => m.change != null);

        if (metrics.length === 0) return null;

        return (
          <Section title={`YoY Comparison: ${yago.quarterLabel ?? yago.periodEnd} → ${curr.quarterLabel ?? curr.periodEnd}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-slate-500">
                    <th className="px-3 py-2 text-left font-semibold">Metric</th>
                    <th className="px-3 py-2 text-right font-semibold">{yago.quarterLabel ?? yago.periodEnd}</th>
                    <th className="px-3 py-2 text-right font-semibold">{curr.quarterLabel ?? curr.periodEnd}</th>
                    <th className="px-3 py-2 text-right font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m, i) => {
                    const isPositive = m.type === "ratio"
                      ? (m.change! < 0) // lower D/E is better
                      : (m.change! > 0);
                    const isNegative = m.type === "ratio"
                      ? (m.change! > 0.2)
                      : (m.change! < -5);
                    const changeStr = m.type === "pct"
                      ? `${m.change! > 0 ? "+" : ""}${m.change}%`
                      : m.type === "bps"
                      ? `${m.change! > 0 ? "+" : ""}${(m.change! * 100).toFixed(0)} bps`
                      : `${m.change! > 0 ? "+" : ""}${m.change!.toFixed(2)}x`;
                    const fmtVal = (v: number | null) =>
                      m.type === "pct" ? fmt(v) :
                      m.type === "bps" ? fmtPct(v) :
                      fmtX(v);
                    return (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-700">{m.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtVal(m.prev)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtVal(m.curr)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-bold",
                          isPositive ? "text-emerald-600" : isNegative ? "text-red-500" : "text-slate-600"
                        )}>
                          <span className="inline-flex items-center gap-0.5">
                            {isPositive ? <ArrowUpRight className="h-3 w-3" /> :
                             isNegative ? <ArrowDownRight className="h-3 w-3" /> :
                             <Minus className="h-3 w-3" />}
                            {changeStr}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })()}

      {/* ── TTM Summary (if 4+ quarters) ── */}
      {ttm && (
        <Section title={ttm.label}>
          <div className="space-y-3">
            {commentary?.ttmOutlook && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
                <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.ttmOutlook}</p>
              </div>
            )}
            <p className="text-xs text-slate-500">Trailing 12 months computed from last 4 quarters. Flow metrics are summed; balance sheet metrics use the latest quarter.</p>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-6">
              <KpiCell label="Revenue TTM" value={fmt(ttm.revenue)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Revenue TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["Revenue"]} labelMap={traceLabelMap} />
              <KpiCell label="EBITDA TTM" value={fmt(ttm.ebitda)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("EBITDA TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["EBITDA"]} labelMap={traceLabelMap} />
              <KpiCell label="Net Income TTM" value={fmt(ttm.netIncome)} highlight={ttm.netIncome} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Net Income TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["Net Income"]} labelMap={traceLabelMap} />
              <KpiCell label="OCF TTM" value={fmt(ttm.operatingCashFlow)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("OCF TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["Operating CF"]} labelMap={traceLabelMap} />
              <KpiCell label="FCF TTM" value={fmt(ttm.freeCashFlow)} highlight={ttm.freeCashFlow} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("FCF TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["Free Cash Flow"]} labelMap={traceLabelMap} />
              <KpiCell label="CapEx TTM" value={fmt(ttm.capex != null ? -Math.abs(ttm.capex) : null)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("CapEx TTM", ttmTraceExtra) : undefined} trace={traceByLabel?.["Capital Expenditures"]} labelMap={traceLabelMap} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <RatioCard label="Gross Margin" value={fmtPct(ttm.grossMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Gross Margin", ttmTraceExtra) : undefined} trace={traceByLabel?.["Gross Margin"]} labelMap={traceLabelMap} />
              <RatioCard label="OP Margin" value={fmtPct(ttm.operatingMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("OP Margin", ttmTraceExtra) : undefined} trace={traceByLabel?.["OP Margin"]} labelMap={traceLabelMap} />
              <RatioCard label="EBITDA Margin" value={fmtPct(ttm.ebitdaMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("EBITDA Margin", ttmTraceExtra) : undefined} trace={traceByLabel?.["EBITDA Margin"]} labelMap={traceLabelMap} />
              <RatioCard label="Net Margin" value={fmtPct(ttm.netMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Net Margin", ttmTraceExtra) : undefined} trace={traceByLabel?.["Net Margin"]} labelMap={traceLabelMap} />
              <RatioCard label="ROE (TTM)" value={fmtPct(ttm.roe)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("ROE (TTM)", ttmTraceExtra) : undefined} trace={traceByLabel?.["ROE (TTM)"]} labelMap={traceLabelMap} />
              <RatioCard label="ROA (TTM)" value={fmtPct(ttm.roa)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("ROA (TTM)", ttmTraceExtra) : undefined} trace={traceByLabel?.["ROA (TTM)"]} labelMap={traceLabelMap} />
              <RatioCard label="FCF Margin" value={fmtPct(ttm.fcfMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("FCF Margin", ttmTraceExtra) : undefined} trace={traceByLabel?.["FCF Margin"]} labelMap={traceLabelMap} />
            </div>
          </div>
        </Section>
      )}

      {/* ── Peer Comparison (if 2+ companies in Data Source) ── */}
      {peers.length >= 2 && (
        <>
          {commentary?.peerPositioning && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
              <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI Peer Analysis:</span> {commentary.peerPositioning}</p>
            </div>
          )}
          {/* Margin Comparison */}
          <Section title={`Peer Margin Comparison (${peers.length} companies)`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Operating Margin (%)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peers.map(p => ({ name: p.ticker, gm: p.grossMargin, om: p.operatingMargin, nm: p.netMargin }))} layout="vertical" margin={{ left: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 10, fontWeight: 600 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                      <Bar dataKey="gm" name="Gross" fill={COLORS.blue} radius={[0, 3, 3, 0]} />
                      <Bar dataKey="om" name="Operating" fill={COLORS.emerald} radius={[0, 3, 3, 0]} />
                      <Bar dataKey="nm" name="Net" fill={COLORS.purple} radius={[0, 3, 3, 0]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Return & Efficiency (%)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peers.map(p => ({ name: p.ticker, roe: p.roe, roa: p.roa, fcf: p.fcfMargin }))} layout="vertical" margin={{ left: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 10, fontWeight: 600 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                      <Bar dataKey="roe" name="ROE" fill={COLORS.primary} radius={[0, 3, 3, 0]} />
                      <Bar dataKey="roa" name="ROA" fill={COLORS.cyan} radius={[0, 3, 3, 0]} />
                      <Bar dataKey="fcf" name="FCF Margin" fill={COLORS.amber} radius={[0, 3, 3, 0]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Section>

          {/* Radar Chart */}
          <Section title="Peer Financial Profile — Radar">
            <div className="flex justify-center">
              <div className="h-72 w-full max-w-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={[
                    { metric: "Gross Margin", ...Object.fromEntries(peers.map(p => [p.ticker, Math.max(0, p.grossMargin ?? 0)])) },
                    { metric: "OP Margin", ...Object.fromEntries(peers.map(p => [p.ticker, Math.max(0, p.operatingMargin ?? 0)])) },
                    { metric: "Net Margin", ...Object.fromEntries(peers.map(p => [p.ticker, Math.max(0, p.netMargin ?? 0)])) },
                    { metric: "ROE", ...Object.fromEntries(peers.map(p => [p.ticker, Math.max(0, p.roe ?? 0)])) },
                    { metric: "Current Ratio", ...Object.fromEntries(peers.map(p => [p.ticker, Math.min((p.currentRatio ?? 0) * 10, 50)])) },
                    { metric: "FCF Margin", ...Object.fromEntries(peers.map(p => [p.ticker, Math.max(0, p.fcfMargin ?? 0)])) },
                  ]}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis tick={{ fontSize: 8 }} />
                    {peers.slice(0, 6).map((p, i) => (
                      <Radar key={p.ticker} name={p.ticker} dataKey={p.ticker}
                        stroke={PIE_PALETTE[i % PIE_PALETTE.length]}
                        fill={PIE_PALETTE[i % PIE_PALETTE.length]}
                        fillOpacity={p.ticker === ticker ? 0.25 : 0.08}
                        strokeWidth={p.ticker === ticker ? 2.5 : 1.5} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Section>

          {/* Relative Valuation / Comparison Table */}
          <Section title="Peer Comparison Table">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="px-2 py-2 text-left font-bold text-slate-600">Company</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">Revenue</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">EBITDA</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">Net Inc.</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">FCF</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">GM %</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">OP %</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">NM %</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">ROE %</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">D/E</th>
                    <th className="px-2 py-2 text-right font-semibold text-slate-500">Curr.</th>
                  </tr>
                </thead>
                <tbody>
                  {peers.map((p, i) => {
                    const isSubject = p.ticker === ticker;
                    return (
                      <tr key={i} className={cn("border-b border-slate-100", isSubject && "bg-indigo-50/50 font-semibold")}>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            {isSubject && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
                            <span className={cn("font-bold", isSubject ? "text-indigo-700" : "text-slate-800")}>{p.ticker}</span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{p.companyName}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(p.revenue)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(p.ebitda)}</td>
                        <td className={cn("px-2 py-2 text-right tabular-nums", p.netIncome != null && p.netIncome < 0 && "text-red-500")}>{fmt(p.netIncome)}</td>
                        <td className={cn("px-2 py-2 text-right tabular-nums", p.freeCashFlow != null && p.freeCashFlow < 0 && "text-red-500")}>{fmt(p.freeCashFlow)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(p.grossMargin)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(p.operatingMargin)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(p.netMargin)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(p.roe)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtX(p.debtToEquity)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtX(p.currentRatio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {/* ── Valuation Multiples ── */}
      <Section title="Valuation Multiples">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Market Cap ($M):</label>
            <input
              type="number"
              value={marketCapInput}
              onChange={(e) => setMarketCapInput(e.target.value)}
              placeholder="e.g. 25000"
              className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
            {marketCapLoading && <span className="text-xs text-blue-500 animate-pulse">Fetching live data...</span>}
            {!marketCapLoading && stockPrice != null && (
              <span className="text-xs text-slate-500">
                Stock: <span className="font-semibold text-slate-700">${stockPrice.toFixed(2)}</span>
                {marketCap && <> | MCap: <span className="font-semibold text-slate-700">${(marketCap / 1000).toFixed(1)}B</span></>}
              </span>
            )}
            {!marketCapLoading && !marketCap && !stockPrice && <span className="text-xs text-slate-400">Enter market cap or wait for auto-fetch</span>}
          </div>
          {valuation && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
              <div className="bg-white p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">EV / EBITDA</p>
                <p className="text-xl font-black tabular-nums text-slate-900 mt-1">{valuation.evToEbitda != null ? `${valuation.evToEbitda}x` : "—"}</p>
                <p className="text-[9px] text-slate-400">EV: {fmt(Math.round(valuation.ev))}</p>
              </div>
              <div className="bg-white p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">EV / Revenue</p>
                <p className="text-xl font-black tabular-nums text-slate-900 mt-1">{valuation.evToRev != null ? `${valuation.evToRev}x` : "—"}</p>
                <p className="text-[9px] text-slate-400">Net Debt: {fmt(Math.round(valuation.netDebt))}</p>
              </div>
              <div className="bg-white p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">P/E Ratio</p>
                <p className={cn("text-xl font-black tabular-nums mt-1", valuation.pe != null && valuation.pe < 15 ? "text-emerald-600" : valuation.pe != null && valuation.pe > 30 ? "text-amber-600" : "text-slate-900")}>
                  {valuation.pe != null ? `${valuation.pe}x` : "—"}
                </p>
                <p className="text-[9px] text-slate-400">{ttm ? "TTM basis" : "Quarterly"}</p>
              </div>
              <div className="bg-white p-3 text-center">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">P/FCF</p>
                <p className={cn("text-xl font-black tabular-nums mt-1", valuation.pFcf != null && valuation.pFcf < 20 ? "text-emerald-600" : "text-slate-900")}>
                  {valuation.pFcf != null ? `${valuation.pFcf}x` : "—"}
                </p>
                <p className="text-[9px] text-slate-400">FCF Yield: {valuation.fcfYield != null ? `${valuation.fcfYield}%` : "—"}</p>
              </div>
            </div>
          )}
          {valuation && valuation.divYield != null && (
            <div className="flex items-center gap-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2">
                <p className="text-[9px] font-bold uppercase text-emerald-500">Dividend Yield</p>
                <p className="text-lg font-black text-emerald-700 tabular-nums">{valuation.divYield}%</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── DuPont ROE Decomposition ── */}
      <Section title="DuPont ROE Decomposition">
        <div className="space-y-3">
          {commentary?.dupont && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
              <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.dupont}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">
            ROE = Net Profit Margin × Asset Turnover × Equity Multiplier
          </p>
          <div className="flex flex-wrap items-center gap-2 text-center">
            <DupontFactor label="Net Margin" value={dupont.netMargin != null ? `${(dupont.netMargin * 100).toFixed(1)}%` : "—"}
              sub={inc.netIncome != null && inc.revenue ? `$${inc.netIncome.toLocaleString()}M / $${inc.revenue.toLocaleString()}M` : undefined} />
            <span className="text-lg font-bold text-slate-400">×</span>
            <DupontFactor label="Asset Turnover" value={dupont.assetTurnover != null ? `${dupont.assetTurnover.toFixed(2)}x` : "—"}
              sub={inc.revenue != null && bs.totalAssets ? `$${inc.revenue.toLocaleString()}M / $${bs.totalAssets.toLocaleString()}M` : undefined} />
            <span className="text-lg font-bold text-slate-400">×</span>
            <DupontFactor label="Equity Multiplier" value={dupont.equityMultiplier != null ? `${dupont.equityMultiplier.toFixed(2)}x` : "—"}
              sub={bs.totalAssets && bs.totalEquity ? `$${bs.totalAssets.toLocaleString()}M / $${bs.totalEquity.toLocaleString()}M` : undefined} />
            <span className="text-lg font-bold text-slate-400">=</span>
            <DupontFactor label="ROE" value={dupont.computed != null ? `${dupont.computed.toFixed(1)}%` : "—"} highlight />
          </div>

          {/* 5-Factor Extension */}
          {dupont.taxBurden != null && dupont.interestBurden != null && (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">5-Factor Breakdown</p>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div>
                  <p className="text-[10px] text-slate-400">Tax Burden</p>
                  <p className="font-bold tabular-nums">{dupont.taxBurden != null ? `${(dupont.taxBurden * 100).toFixed(1)}%` : "—"}</p>
                  <p className="text-[9px] text-slate-400">NI/EBT</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Interest Burden</p>
                  <p className="font-bold tabular-nums">{dupont.interestBurden != null ? `${(dupont.interestBurden * 100).toFixed(1)}%` : "—"}</p>
                  <p className="text-[9px] text-slate-400">EBT/EBIT</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">OP Margin</p>
                  <p className="font-bold tabular-nums">{dupont.opMarginFactor != null ? `${(dupont.opMarginFactor * 100).toFixed(1)}%` : "—"}</p>
                  <p className="text-[9px] text-slate-400">EBIT/Rev</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Asset Turn.</p>
                  <p className="font-bold tabular-nums">{dupont.assetTurnover != null ? `${dupont.assetTurnover.toFixed(2)}x` : "—"}</p>
                  <p className="text-[9px] text-slate-400">Rev/Assets</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Leverage</p>
                  <p className="font-bold tabular-nums">{dupont.equityMultiplier != null ? `${dupont.equityMultiplier.toFixed(2)}x` : "—"}</p>
                  <p className="text-[9px] text-slate-400">Assets/Equity</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Altman Z-Score Detail ── */}
      {zScore && (
        <Section title="Altman Z-Score Breakdown">
          {commentary?.zScore && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 mb-3">
              <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.zScore}</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-100 p-3">
              <p className="text-xs text-slate-500 mb-2">
                Z = 1.2×X1 + 1.4×X2 + 3.3×X3 + 0.6×X4 + 1.0×X5
              </p>
              <table className="w-full text-xs">
                <tbody>
                  <ZRow label="X1: WC/Assets" raw={zScore.x1} weight={1.2} />
                  <ZRow label="X2: RE/Assets" raw={zScore.x2} weight={1.4} />
                  <ZRow label="X3: EBIT/Assets" raw={zScore.x3} weight={3.3} />
                  <ZRow label="X4: Equity/Liabilities" raw={zScore.x4} weight={0.6} />
                  <ZRow label="X5: Revenue/Assets" raw={zScore.x5} weight={1.0} />
                  <tr className="border-t-2 border-slate-200">
                    <td className="py-1.5 font-bold text-slate-800">Z-Score</td>
                    <td></td>
                    <td className={cn("py-1.5 text-right font-black tabular-nums",
                      zScore.zone === "safe" ? "text-emerald-600" : zScore.zone === "grey" ? "text-amber-600" : "text-red-600"
                    )}>{zScore.z.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-slate-100 p-3 lg:col-span-2">
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Interpretation</p>
              <div className="space-y-2 text-xs text-slate-600">
                <InterpretRow color="emerald" label="> 2.99 — Safe Zone" desc="Low probability of bankruptcy. Strong financial position." active={zScore.zone === "safe"} />
                <InterpretRow color="amber" label="1.81 – 2.99 — Grey Zone" desc="Moderate risk. Monitor closely for deterioration." active={zScore.zone === "grey"} />
                <InterpretRow color="red" label="< 1.81 — Distress Zone" desc="High probability of financial distress within 2 years." active={zScore.zone === "distress"} />
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── Piotroski F-Score Detail ── */}
      <Section title="Piotroski F-Score Analysis">
        {commentary?.piotroski && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 mb-3">
            <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.piotroski}</p>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {piotroski.signals.map((s, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-lg border p-2.5",
              s.pass === true ? "border-emerald-200 bg-emerald-50/50" :
              s.pass === false ? "border-red-200 bg-red-50/50" :
              "border-slate-200 bg-slate-50/50"
            )}>
              {s.pass === true ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> :
               s.pass === false ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> :
               <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
              <div>
                <p className="text-[11px] font-bold text-slate-800">{s.name}</p>
                <p className="text-[10px] text-slate-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Earnings Quality Deep Dive ── */}
      <Section title="Earnings Quality Analysis">
        {commentary?.earningsQuality && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 mb-3">
            <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.earningsQuality}</p>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <RatioCard label="OCF / Net Income" value={earningsQuality.ocfToNI != null ? `${earningsQuality.ocfToNI}x` : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("OCF / Net Income") : undefined} trace={traceByLabel?.["OCF / Net Income"]} labelMap={traceLabelMap} />
              <RatioCard label="FCF / Net Income" value={earningsQuality.fcfToNI != null ? `${earningsQuality.fcfToNI}x` : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("FCF / Net Income") : undefined} trace={traceByLabel?.["FCF / Net Income"]} labelMap={traceLabelMap} />
              <RatioCard label="Accrual Ratio" value={earningsQuality.accrualRatio != null ? `${earningsQuality.accrualRatio}%` : "—"} />
              <RatioCard label="Accruals ($M)" value={earningsQuality.accruals != null ? `$${earningsQuality.accruals.toLocaleString()}M` : "—"} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">What This Means</p>
            <div className="space-y-1.5 text-xs text-slate-600">
              <p><span className="font-semibold">OCF/NI ≥ 1.0:</span> Earnings are backed by real cash — high quality.</p>
              <p><span className="font-semibold">OCF/NI &lt; 0.7:</span> Significant accruals — earnings may be inflated by non-cash items.</p>
              <p><span className="font-semibold">Accrual Ratio:</span> Negative is good (cash exceeds reported earnings). Positive is a warning sign.</p>
              {earningsQuality.quality === "high" && (
                <p className="mt-2 rounded bg-emerald-50 p-2 text-emerald-700 font-semibold">
                  This company generates strong cash flows relative to reported earnings — high quality signal.
                </p>
              )}
              {earningsQuality.quality === "low" && (
                <p className="mt-2 rounded bg-red-50 p-2 text-red-700 font-semibold">
                  Warning: Cash flows significantly trail reported earnings. Investigate non-cash items and accruals.
                </p>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Cash Conversion Cycle ── */}
      {ccc.cycle != null && (
        <Section title="Cash Conversion Cycle">
          {commentary?.ccc && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 mb-3">
              <p className="text-xs text-violet-700 leading-relaxed"><span className="font-bold">AI:</span> {commentary.ccc}</p>
            </div>
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2 text-center">
              <DupontFactor label="DSO" value={ccc.dso != null ? `${ccc.dso} days` : "—"} sub="Days Sales Outstanding" />
              <span className="text-lg font-bold text-slate-400">+</span>
              <DupontFactor label="DIO" value={ccc.dio != null ? `${ccc.dio} days` : "—"} sub="Days Inventory Outstanding" />
              <span className="text-lg font-bold text-slate-400">−</span>
              <DupontFactor label="DPO" value={ccc.dpo != null ? `${ccc.dpo} days` : "—"} sub="Days Payable Outstanding" />
              <span className="text-lg font-bold text-slate-400">=</span>
              <DupontFactor label="CCC" value={`${ccc.cycle} days`} highlight sub="Cash Conversion Cycle" />
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs text-slate-600">
              {ccc.cycle < 0 ? (
                <p><span className="font-semibold text-emerald-600">Negative CCC ({ccc.cycle} days):</span> The company gets paid before paying suppliers — excellent working capital efficiency. Common in companies with strong bargaining power.</p>
              ) : ccc.cycle < 30 ? (
                <p><span className="font-semibold text-emerald-600">Short CCC ({ccc.cycle} days):</span> Efficient cash management. Capital is tied up for less than a month.</p>
              ) : ccc.cycle < 90 ? (
                <p><span className="font-semibold text-amber-600">Moderate CCC ({ccc.cycle} days):</span> Typical for manufacturing/distribution. Look for trends over time.</p>
              ) : (
                <p><span className="font-semibold text-red-600">Long CCC ({ccc.cycle} days):</span> Significant capital tied up in working capital. May indicate inventory buildup or slow collections.</p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Capital Allocation ── */}
      <Section title="Capital Allocation">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricTable
            onRowClick={onMetricTableRowClick ?? undefined}
            labelMap={traceLabelMap ?? undefined}
            traceByLabel={traceByLabel ?? undefined}
            rows={[
              { label: "Operating Cash Flow", value: fmt(cf.operatingCashFlow), bold: true, traceable: true },
              { label: "CapEx (Reinvestment)", value: fmt(cf.capitalExpenditures != null ? -Math.abs(cf.capitalExpenditures) : null), dim: true, traceable: true },
              { label: "Reinvestment Rate", value: capAlloc.reinvestmentRate != null ? `${capAlloc.reinvestmentRate}%` : "—", sub: "CapEx / OCF" },
              { label: "Dividends Paid", value: fmt(cf.dividendsPaid != null ? -Math.abs(cf.dividendsPaid) : null), dim: true, traceable: true },
              { label: "Share Repurchases", value: fmt(capAlloc.buyback != null ? -Math.abs(capAlloc.buyback) : null), dim: true, traceable: true },
              { label: "Total Shareholder Returns", value: fmt(capAlloc.totalReturn != null ? -Math.abs(capAlloc.totalReturn) : null), bold: true, traceable: true },
              { label: "Return Yield on Equity", value: capAlloc.returnYieldOnEquity != null ? `${Math.abs(capAlloc.returnYieldOnEquity).toFixed(1)}%` : "—" },
              { label: "Stock-Based Comp", value: fmt(capAlloc.sbc), traceable: true },
            ]}
          />
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Allocation Insight</p>
            <div className="space-y-1.5 text-xs text-slate-600">
              {capAlloc.reinvestmentRate != null && capAlloc.reinvestmentRate > 50 && (
                <p>High reinvestment rate ({capAlloc.reinvestmentRate}%) — company is investing heavily in growth.</p>
              )}
              {capAlloc.reinvestmentRate != null && capAlloc.reinvestmentRate < 20 && (
                <p>Low reinvestment rate ({capAlloc.reinvestmentRate}%) — mature business returning capital to shareholders.</p>
              )}
              {cf.freeCashFlow != null && cf.freeCashFlow > 0 && cf.dividendsPaid != null && (
                <p>FCF after dividends: <span className="font-semibold">${(cf.freeCashFlow - Math.abs(cf.dividendsPaid)).toLocaleString()}M</span> — {cf.freeCashFlow > Math.abs(cf.dividendsPaid) ? "dividend is well-covered by FCF" : "FCF does not fully cover dividends"}.</p>
              )}
              {capAlloc.sbc != null && inc.netIncome != null && inc.netIncome > 0 && (
                <p>SBC as % of Net Income: <span className="font-semibold">{((capAlloc.sbc / inc.netIncome) * 100).toFixed(1)}%</span> — {capAlloc.sbc / inc.netIncome > 0.15 ? "elevated dilution risk" : "manageable level"}.</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Non-Recurring Items & Comparability Adjustments ── */}
      {result.nonRecurringItems && result.nonRecurringItems.length > 0 && (() => {
        const items = result.nonRecurringItems!;
        const totalAddBack = items.filter(i => i.adjustDirection === "add-back").reduce((s, i) => s + Math.abs(i.amount), 0);
        const totalSubtract = items.filter(i => i.adjustDirection === "subtract").reduce((s, i) => s + Math.abs(i.amount), 0);
        const netAdjustment = totalAddBack - totalSubtract;
        const reportedOP = inc.operatingIncome ?? 0;
        const adjustedOP = reportedOP + netAdjustment;

        const categoryLabels: Record<string, string> = {
          legal: "Legal / Litigation",
          restructuring: "Restructuring",
          impairment: "Impairment / Write-down",
          "gain-loss-disposal": "Gain/Loss on Disposal",
          "tax-adjustment": "Tax Adjustment",
          insurance: "Insurance",
          erc: "Employee Retention Credit",
          acquisition: "M&A Related",
          other: "Other",
        };
        const confidenceColor: Record<string, string> = {
          high: "bg-emerald-100 text-emerald-700",
          medium: "bg-amber-100 text-amber-700",
          low: "bg-slate-100 text-slate-500",
        };

        return (
          <Section title={`Non-Recurring Adjustments (${items.length} items)`}>
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Reported OP</p>
                  <p className="text-lg font-black tabular-nums text-slate-900">{fmt(reportedOP)}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-emerald-500">Add-Backs</p>
                  <p className="text-lg font-black tabular-nums text-emerald-700">+{fmt(totalAddBack)}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-red-400">Subtractions</p>
                  <p className="text-lg font-black tabular-nums text-red-600">-{fmt(totalSubtract)}</p>
                </div>
                <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase text-indigo-500">Adjusted OP</p>
                  <p className="text-lg font-black tabular-nums text-indigo-700">{fmt(Math.round(adjustedOP))}</p>
                  {inc.revenue != null && inc.revenue > 0 && (
                    <p className="text-[9px] text-indigo-400">{((adjustedOP / inc.revenue) * 100).toFixed(1)}% margin</p>
                  )}
                </div>
              </div>

              {/* Items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-slate-500">
                      <th className="px-2 py-2 text-left font-semibold">Item</th>
                      <th className="px-2 py-2 text-left font-semibold">Category</th>
                      <th className="px-2 py-2 text-right font-semibold">Amount</th>
                      <th className="px-2 py-2 text-center font-semibold">Direction</th>
                      <th className="px-2 py-2 text-center font-semibold">Co. Adj?</th>
                      <th className="px-2 py-2 text-center font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).map((item, i) => (
                      <tr key={item.id || i} className="border-b border-slate-100 hover:bg-slate-50/50 group">
                        <td className="px-2 py-2">
                          <p className="font-medium text-slate-800">{item.label}</p>
                          <p className="text-[10px] text-slate-400 max-w-xs truncate group-hover:whitespace-normal">{item.description}</p>
                          {item.sourceRef && <p className="text-[9px] text-slate-300 italic">{item.sourceRef}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {categoryLabels[item.category] ?? item.category}
                          </span>
                        </td>
                        <td className={cn("px-2 py-2 text-right tabular-nums font-bold",
                          item.amount > 0 ? "text-red-500" : "text-emerald-600"
                        )}>
                          {item.amount > 0 ? `($${Math.abs(item.amount).toLocaleString()}M)` : `$${Math.abs(item.amount).toLocaleString()}M`}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold",
                            item.adjustDirection === "add-back" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                          )}>
                            {item.adjustDirection === "add-back" ? "Add Back" : "Subtract"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {item.companyAdjusts ? (
                            <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <XCircle className="inline h-3.5 w-3.5 text-slate-300" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", confidenceColor[item.confidence])}>
                            {item.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Impact lines breakdown */}
              {(() => {
                const byLine = new Map<string, number>();
                for (const item of items) {
                  const adj = item.adjustDirection === "add-back" ? Math.abs(item.amount) : -Math.abs(item.amount);
                  byLine.set(item.impactedLine, (byLine.get(item.impactedLine) ?? 0) + adj);
                }
                const lineLabels: Record<string, string> = {
                  operatingIncome: "Operating Income",
                  netIncome: "Net Income",
                  revenue: "Revenue",
                  cogs: "Cost of Goods Sold",
                  sga: "SG&A",
                  other: "Other",
                };
                return byLine.size > 1 ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Adjustment by P&L Line</p>
                    <div className="flex flex-wrap gap-3">
                      {[...byLine.entries()].map(([line, amount]) => (
                        <div key={line} className="text-xs">
                          <span className="text-slate-500">{lineLabels[line] ?? line}: </span>
                          <span className={cn("font-bold tabular-nums", amount > 0 ? "text-emerald-600" : "text-red-500")}>
                            {amount > 0 ? "+" : ""}{fmt(Math.round(amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </Section>
        );
      })()}

      {/* ── Footnotes & Commentary ── */}
      {footnotes.length > 0 && (
        <Section title={`Filing Commentary & Footnotes (${footnotes.length})`}>
          <div className="space-y-3">
            {/* High significance first */}
            {footnotes.filter(fn => fn.significance === "high").length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-red-500 mb-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Critical Items
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {footnotes.filter(fn => fn.significance === "high").map((fn, i) => (
                    <FootnoteCard key={i} fn={fn} />
                  ))}
                </div>
              </div>
            )}
            {footnotes.filter(fn => fn.significance === "medium").length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-amber-500 mb-2">Notable Items</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {footnotes.filter(fn => fn.significance === "medium").map((fn, i) => (
                    <FootnoteCard key={i} fn={fn} />
                  ))}
                </div>
              </div>
            )}
            {footnotes.filter(fn => fn.significance === "low").length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Other Disclosures</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {footnotes.filter(fn => fn.significance === "low").map((fn, i) => (
                    <FootnoteCard key={i} fn={fn} compact />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Non-GAAP Adjusted Metrics ── */}
      {adjustedMetrics.length > 0 && (
        <Section title={`Non-GAAP Reconciliation (${adjustedMetrics.length})`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {adjustedMetrics.map((am, i) => {
              const totalAdj = am.adjustments.reduce((s, a) => s + a.value, 0);
              const unit = am.unit === "per-share" ? "" : "M";
              return (
                <div key={i} className="rounded-lg border border-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{am.name}</p>
                      <p className="text-[10px] text-slate-400">{am.period}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">GAAP → Adjusted</p>
                      <p className="text-sm font-bold tabular-nums">
                        <span className="text-slate-500">{am.gaapValue != null ? `$${am.gaapValue.toLocaleString()}${unit}` : "—"}</span>
                        <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
                        <span className="text-emerald-600">{am.adjustedValue != null ? `$${am.adjustedValue.toLocaleString()}${unit}` : "—"}</span>
                      </p>
                    </div>
                  </div>
                  {am.adjustments.length > 0 && (
                    <div className="space-y-0.5">
                      {am.adjustments.map((adj, j) => (
                        <div key={j} className="flex justify-between text-[11px]">
                          <span className="text-slate-400 truncate mr-2">{adj.label}</span>
                          <span className={cn("tabular-nums font-semibold shrink-0", adj.value >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {adj.value >= 0 ? "+" : ""}{adj.value.toLocaleString()}{unit}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-[11px] border-t border-slate-200 pt-1 mt-1">
                        <span className="font-bold text-slate-700">Net Adjustment</span>
                        <span className={cn("tabular-nums font-bold", totalAdj >= 0 ? "text-emerald-600" : "text-red-500")}>
                          {totalAdj >= 0 ? "+" : ""}{totalAdj.toLocaleString()}{unit}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Earnings Narrative (if available) ── */}
      {narrative && (
        <Section title="Management Commentary & Earnings">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={cn("rounded-lg px-3 py-1.5 text-sm font-bold",
                narrative.result.includes("Beat") ? "bg-emerald-100 text-emerald-700" :
                narrative.result.includes("Missed") ? "bg-red-100 text-red-700" :
                "bg-amber-100 text-amber-700"
              )}>{narrative.result}</span>
              <span className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold",
                narrative.tone === "bullish" ? "bg-emerald-100 text-emerald-700" :
                narrative.tone === "cautious" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-700"
              )}>Tone: {narrative.tone.charAt(0).toUpperCase() + narrative.tone.slice(1)}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-800 leading-relaxed">{narrative.summary}</p>
            </div>
            {(narrative.priorGuidance || narrative.currentGuidance) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {narrative.priorGuidance && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Prior Guidance</p>
                    <p className="text-xs text-slate-700">{narrative.priorGuidance}</p>
                  </div>
                )}
                {narrative.currentGuidance && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <p className="text-[10px] font-bold uppercase text-blue-500 mb-1">Current Guidance</p>
                    <p className="text-xs text-slate-700">{narrative.currentGuidance}</p>
                  </div>
                )}
              </div>
            )}
            {narrative.keyThemes.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Key Themes from MD&A</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {narrative.keyThemes.map((theme, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white p-2.5">
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="text-xs text-slate-700">{theme}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function DupontFactor({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg px-4 py-3 min-w-[100px]", highlight ? "bg-indigo-100 border-2 border-indigo-300" : "bg-slate-50 border border-slate-200")}>
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("text-lg font-black tabular-nums mt-0.5", highlight ? "text-indigo-700" : "text-slate-900")}>{value}</p>
      {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ZRow({ label, raw, weight }: { label: string; raw: number; weight: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1 text-xs text-slate-600">{label}</td>
      <td className="py-1 text-right text-[10px] tabular-nums text-slate-400">{raw.toFixed(3)} × {weight}</td>
      <td className="py-1 text-right text-xs tabular-nums font-semibold text-slate-800">{(raw * weight).toFixed(3)}</td>
    </tr>
  );
}

function InterpretRow({ color, label, desc, active }: { color: "emerald" | "amber" | "red"; label: string; desc: string; active: boolean }) {
  const styles = {
    emerald: { border: "border-emerald-300 bg-emerald-50", text: "text-emerald-700" },
    amber: { border: "border-amber-300 bg-amber-50", text: "text-amber-700" },
    red: { border: "border-red-300 bg-red-50", text: "text-red-700" },
  };
  return (
    <div className={cn("rounded-lg p-2.5 border", active ? styles[color].border : "border-slate-100 bg-white opacity-50")}>
      <p className={cn("text-xs font-bold", active ? styles[color].text : "text-slate-500")}>{label}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </div>
  );
}

function FootnoteCard({ fn, compact }: { fn: import("@/types/analysis").FootnoteItem; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3",
      fn.significance === "high" ? "border-red-200 bg-red-50/30" :
      fn.significance === "medium" ? "border-amber-200 bg-amber-50/30" :
      "border-slate-100"
    )}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className={cn("font-bold text-slate-800", compact ? "text-[10px]" : "text-xs")}>{fn.title}</p>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
          fn.type === "debt" ? "bg-purple-100 text-purple-700" :
          fn.type === "contingency" ? "bg-red-100 text-red-700" :
          fn.type === "tax" ? "bg-cyan-100 text-cyan-700" :
          fn.type === "revenue" ? "bg-emerald-100 text-emerald-700" :
          fn.type === "segment" ? "bg-blue-100 text-blue-700" :
          "bg-slate-100 text-slate-500"
        )}>{fn.type}</span>
      </div>
      <p className={cn("leading-relaxed text-slate-600", compact ? "text-[10px]" : "text-[11px]")}>{fn.summary}</p>
    </div>
  );
}

function LineItemTable({
  title,
  items,
  onRowClick,
}: {
  title: string;
  items: BSItem[];
  onRowClick?: (item: BSItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex max-h-[300px] flex-col overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
        <h5 className="text-[11px] font-bold text-slate-700">{title}</h5>
        <span className="text-[10px] text-slate-400">{items.length} items</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 border-b border-slate-100 bg-white">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Line</th>
              <th className="px-3 py-1.5 text-right font-semibold text-slate-500">USD (M)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((item, i) => {
              const clickable = !!onRowClick;
              return (
                <tr
                  key={i}
                  onClick={clickable ? () => onRowClick(item) : undefined}
                  className={cn(
                    clickable ? "cursor-pointer transition hover:bg-yellow-50/60" : "hover:bg-slate-50/50",
                  )}
                >
                  <td className="px-3 py-1">
                    <span className="block font-medium text-slate-700">{item.label}</span>
                    <span className="block max-w-[150px] truncate text-[9px] text-slate-400" title={item.source}>{item.source}</span>
                  </td>
                  <td className={cn("px-3 py-1 text-right tabular-nums font-semibold", item.value < 0 ? "text-red-500" : "text-slate-800")}>
                    {item.value < 0 ? `(${Math.abs(item.value).toLocaleString()})` : item.value.toLocaleString()}
                    {clickable && <Search className="ml-1 inline h-3 w-3 text-yellow-600 opacity-40" aria-hidden />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
