"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { FullAnalysis } from "@/types/analysis";
import { buildMetricTraceLabelMap, type MetricTraceSpec } from "@/lib/metricTraceLabels";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

import type { TraceMetric } from "./analysis-dashboard/traceTypes";

export type { TraceMetric } from "./analysis-dashboard/traceTypes";

import { TABS, fmt, fmtPct, type TabId } from "./analysis-dashboard/analysisDashboardConstants";
import { KpiCell } from "./analysis-dashboard/analysisDashboardPrimitives";
import { AnalysisDashboardSummaryTab } from "./analysis-dashboard/AnalysisDashboardSummaryTab";
import { AnalysisDashboardIncomeTab } from "./analysis-dashboard/AnalysisDashboardIncomeTab";
import { AnalysisDashboardBalanceTab } from "./analysis-dashboard/AnalysisDashboardBalanceTab";
import { AnalysisDashboardCashflowTab } from "./analysis-dashboard/AnalysisDashboardCashflowTab";
import { AnalysisDashboardDeepDiveTab } from "./analysis-dashboard/AnalysisDashboardDeepDiveTab";

/** Lazy: Insights tab pulls the largest sub-tree (extra fetches + many charts). */
const LazyInsightsTab = dynamic(
  () => import("./analysis-dashboard/AnalysisDashboardInsightsTab").then((m) => ({ default: m.InsightsTab })),
  {
    ssr: false,
    loading: () => <div className="py-14 text-center text-xs text-slate-400">Loading insights…</div>,
  },
);

interface Props {
  result: FullAnalysis;
  onExport?: () => void;
  onTraceMetric?: (target: TraceMetric) => void;
}

export function AnalysisDashboard({ result, onExport, onTraceMetric }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, dividendAnalysis: div, incomeStatement: inc, meta } = result;
  const cfItems = result.cfItems ?? [];

  const findSource = useCallback(
    (tags: string[]): string | undefined => {
      const allItems = [
        ...(result.balanceSheet.items ?? []),
        ...(result.cfItems ?? []),
        ...(result.debtStructure.items ?? []),
      ];
      for (const tag of tags) {
        const item = allItems.find((i) => i.tag.toLowerCase().includes(tag.toLowerCase()));
        if (item?.source) return item.source;
      }
      return undefined;
    },
    [result],
  );

  const trace = useCallback(
    (label: string, value: number | null | undefined, tags: string[]) => {
      if (!onTraceMetric) return;
      onTraceMetric({ key: label, label, value: value ?? null, sourceHint: findSource(tags) });
    },
    [onTraceMetric, findSource],
  );

  const traceLabelMap = useMemo(
    () => (onTraceMetric ? buildMetricTraceLabelMap(result) : null),
    [result, onTraceMetric],
  );

  const onMetricTableRowClick = useCallback(
    (label: string, extra?: Record<string, MetricTraceSpec>) => {
      if (!onTraceMetric || !traceLabelMap) return;
      const merged = { ...traceLabelMap, ...extra };
      const m = merged[label];
      if (m) trace(label, m.value, m.tags);
    },
    [onTraceMetric, traceLabelMap, trace],
  );

  const verdictClassName = {
    strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
    adequate: "text-blue-700 bg-blue-50 border-blue-200",
    stretched: "text-amber-700 bg-amber-50 border-amber-200",
    unknown: "text-slate-500 bg-slate-50 border-slate-200",
  }[div.verdict];

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
      <header className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {meta.companyName ?? meta.fileName ?? "Financial Analysis"}
            </h2>
            {meta.ticker && (
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{meta.ticker}</span>
            )}
            {meta.periodEnd && <span className="text-xs text-slate-400">{meta.periodEnd}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{meta.source === "sec" ? "SEC EDGAR XBRL" : `PDF${meta.pagesRead ? ` (${meta.pagesRead}p)` : ""}`}</span>
            {meta.extractionMethod && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">
                  {meta.extractionMethod === "pdf-ai-section-split"
                    ? "Section-based AI"
                    : meta.extractionMethod === "pdf-vision"
                      ? "Vision API"
                      : meta.extractionMethod === "pdf-ai"
                        ? "AI extraction"
                        : meta.extractionMethod === "pdf-ai-partial"
                          ? "AI (partial)"
                          : meta.extractionMethod === "pdf-heuristic"
                            ? "Pattern matching"
                            : "Extraction"}
                </span>
              </>
            )}
            {meta.confidence && (
              <>
                <span className="text-slate-300">•</span>
                <span
                  className={cn(
                    "font-semibold uppercase",
                    meta.confidence === "high"
                      ? "text-emerald-600"
                      : meta.confidence === "medium"
                        ? "text-amber-600"
                        : "text-slate-500",
                  )}
                >
                  {meta.confidence} confidence
                </span>
              </>
            )}
          </div>
        </div>
        {onExport && (
          <button
            onClick={onExport}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export XLSX
          </button>
        )}
      </header>

      <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-6">
        <KpiCell label="Revenue" value={fmt(inc.revenue)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Revenue") : undefined} />
        <KpiCell label="Gross Margin" value={fmtPct(inc.grossMargin)} highlight={inc.grossMargin} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Gross Margin") : undefined} />
        <KpiCell label="OP Margin" value={fmtPct(inc.operatingMargin)} highlight={inc.operatingMargin} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("OP Margin") : undefined} />
        <KpiCell label="EBITDA" value={fmt(inc.ebitda)} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("EBITDA") : undefined} />
        <KpiCell label="Net Income" value={fmt(inc.netIncome)} highlight={inc.netIncome} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Net Income") : undefined} />
        <KpiCell label="FCF" value={fmt(cf.freeCashFlow)} highlight={cf.freeCashFlow} traceable={!!onTraceMetric} onClick={onTraceMetric ? () => onMetricTableRowClick("Free Cash Flow") : undefined} />
      </div>

      <nav className="mb-4 flex gap-1 border-b border-slate-200" aria-label="Analysis sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-semibold transition sm:px-4",
              activeTab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-[320px]">
        {activeTab === "summary" && (
          <AnalysisDashboardSummaryTab
            result={result}
            verdictClassName={verdictClassName}
            hasMissingData={hasMissingData}
            missingFields={missingFields}
            onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
          />
        )}
        {activeTab === "income" && (
          <AnalysisDashboardIncomeTab inc={inc} onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined} />
        )}
        {activeTab === "balance" && (
          <AnalysisDashboardBalanceTab
            bs={bs}
            debt={debt}
            cfItems={cfItems}
            ratios={ratios}
            onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
          />
        )}
        {activeTab === "cashflow" && (
          <AnalysisDashboardCashflowTab
            cf={cf}
            cfItems={cfItems}
            div={div}
            ratios={ratios}
            onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
          />
        )}
        {activeTab === "insights" && (
          <LazyInsightsTab result={result} onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined} />
        )}
        {activeTab === "deep-dive" && (
          <AnalysisDashboardDeepDiveTab
            result={result}
            onMetricTableRowClick={onTraceMetric ? onMetricTableRowClick : undefined}
            onBsLineClick={onTraceMetric ? (item) => trace(item.label, item.value, [item.tag]) : undefined}
            onCfLineClick={onTraceMetric ? (item) => trace(item.label, item.value, [item.tag]) : undefined}
          />
        )}
      </div>
    </div>
  );
}
