"use client";

import type { FullAnalysis } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ArrowRight, AlertCircle, Info } from "lucide-react";
import { fmt, fmtPct, fmtX, fmtNum } from "./analysisDashboardConstants";
import { Section, MetricTable, RatioCard } from "./analysisDashboardPrimitives";

export function AnalysisDashboardSummaryTab({
  result,
  verdictClassName,
  hasMissingData,
  missingFields,
  onMetricTableRowClick,
}: {
  result: FullAnalysis;
  verdictClassName: string;
  hasMissingData: boolean;
  missingFields: string[];
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, dividendAnalysis: div, incomeStatement: inc, meta } = result;

  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-xl border p-4", verdictClassName)}>
        {div.verdict === "strong" || div.verdict === "adequate" ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        )}
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

      <Section title="Financial Overview">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricTable
            onRowClick={onMetricTableRowClick}
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
            onRowClick={onMetricTableRowClick}
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

      {result.earningsNarrative && (
        <Section title="Earnings Insights">
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "rounded px-2 py-1 text-xs font-bold",
                    result.earningsNarrative.result.includes("Beat")
                      ? "bg-emerald-100 text-emerald-700"
                      : result.earningsNarrative.result.includes("Missed")
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700",
                  )}
                >
                  {result.earningsNarrative.result}
                </span>
                <span
                  className={cn(
                    "rounded px-2 py-1 text-xs font-semibold",
                    result.earningsNarrative.tone === "bullish"
                      ? "bg-emerald-100 text-emerald-700"
                      : result.earningsNarrative.tone === "cautious"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-700",
                  )}
                >
                  {result.earningsNarrative.tone.charAt(0).toUpperCase() + result.earningsNarrative.tone.slice(1)}
                </span>
              </div>
              <p className="mb-2 text-sm text-slate-800">{result.earningsNarrative.summary}</p>
              {(result.earningsNarrative.priorGuidance || result.earningsNarrative.currentGuidance) && (
                <div className="mt-2 flex gap-4 text-xs text-slate-600">
                  {result.earningsNarrative.priorGuidance && (
                    <div>
                      <span className="font-semibold">Prior Guidance:</span> {result.earningsNarrative.priorGuidance}
                    </div>
                  )}
                  {result.earningsNarrative.currentGuidance && (
                    <div>
                      <span className="font-semibold">Current Guidance:</span> {result.earningsNarrative.currentGuidance}
                    </div>
                  )}
                </div>
              )}
            </div>
            {result.earningsNarrative.keyThemes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-600">Key Themes</p>
                <ul className="space-y-1">
                  {result.earningsNarrative.keyThemes.map((theme, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="font-bold text-primary">•</span>
                      <span>{theme}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Key Ratios">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <RatioCard label="Gross Margin" value={fmtPct(ratios.grossMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Gross Margin") : undefined} />
          <RatioCard label="Operating Margin" value={fmtPct(ratios.operatingMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Operating Margin") : undefined} />
          <RatioCard label="EBITDA Margin" value={fmtPct(ratios.ebitdaMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("EBITDA Margin") : undefined} />
          <RatioCard label="Net Margin" value={fmtPct(ratios.netMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Net Margin") : undefined} />
          <RatioCard label="ROE" value={fmtPct(ratios.returnOnEquity)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("ROE") : undefined} />
          <RatioCard label="ROA" value={fmtPct(ratios.returnOnAssets)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("ROA") : undefined} />
          <RatioCard label="ROIC" value={fmtPct(ratios.returnOnInvestedCapital)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("ROIC") : undefined} />
          <RatioCard label="D/E Ratio" value={fmtX(ratios.debtToEquity)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("D/E Ratio") : undefined} />
          <RatioCard label="ND/EBITDA" value={fmtX(ratios.netDebtToEbitda)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Net Debt / EBITDA") : undefined} />
          <RatioCard label="Interest Cov." value={fmtX(ratios.interestCoverage)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Interest Coverage") : undefined} />
          <RatioCard label="Current Ratio" value={fmtX(ratios.currentRatio)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Current Ratio") : undefined} />
          <RatioCard label="FCF Yield" value={fmtPct(ratios.fcfYield)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("FCF Yield") : undefined} />
        </div>
      </Section>

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
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-semibold tabular-nums",
                        (seg.operatingMargin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500",
                      )}
                    >
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
  );
}
