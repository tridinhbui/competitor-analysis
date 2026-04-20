"use client";

import type { BSItem, FullAnalysis } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { fmt, fmtPct, fmtX } from "./analysisDashboardConstants";
import { Section, MetricTable, LineItemTable } from "./analysisDashboardPrimitives";

export function AnalysisDashboardDeepDiveTab({
  result,
  onMetricTableRowClick,
  onBsLineClick,
  onCfLineClick,
}: {
  result: FullAnalysis;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
  onBsLineClick?: (item: BSItem) => void;
  onCfLineClick?: (item: BSItem) => void;
}) {
  const { balanceSheet: bs, ratios, validation, reconcile } = result;
  const cfItems = result.cfItems ?? [];
  const footnotes = result.footnotes ?? [];
  const adjustedMetrics = result.adjustedMetrics ?? [];
  const passedCount = validation.checks.filter((c) => c.passed).length;

  return (
    <div className="space-y-4">
      <Section title="Data Quality">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
            <CheckCircle2 className={cn("h-5 w-5", passedCount === validation.checks.length ? "text-emerald-500" : "text-amber-500")} />
            <div>
              <p className="text-sm font-bold">
                {passedCount}/{validation.checks.length} checks passed
              </p>
              <p className="text-[11px] text-slate-500">Data integrity</p>
            </div>
          </div>
          {reconcile && (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              {reconcile.status === "ok" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <p className="text-sm font-bold">A = L+E: {reconcile.status.toUpperCase()}</p>
                <p className="text-[11px] text-slate-500">
                  Gap: {reconcile.gapPct}% (${Math.abs(reconcile.gapM).toLocaleString()}M)
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {validation.checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2.5">
              {c.passed ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 text-red-500" />
              )}
              <div>
                <p className="text-[11px] font-semibold">{c.name}</p>
                <p className="line-clamp-2 text-[10px] text-slate-500">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Complete Ratio Analysis">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Profitability</h5>
            <MetricTable
              compact
              onRowClick={onMetricTableRowClick}
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
              onRowClick={onMetricTableRowClick}
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
              onRowClick={onMetricTableRowClick}
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

      {footnotes.length > 0 && (
        <Section title={`Notable Footnotes (${footnotes.length})`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {footnotes.map((fn, i) => (
              <div key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">{fn.title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      fn.significance === "high"
                        ? "bg-red-100 text-red-700"
                        : fn.significance === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {fn.significance}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">{fn.summary}</p>
                <span className="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {fn.type}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

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
                        <td className="py-1 text-right font-semibold tabular-nums">
                          {am.gaapValue != null ? `$${am.gaapValue.toLocaleString()}${unit}` : "—"}
                        </td>
                      </tr>
                      {am.adjustments.map((adj, j) => (
                        <tr key={j} className="border-b border-slate-50">
                          <td className="py-1 pl-3 text-slate-400">+ {adj.label}</td>
                          <td
                            className={cn(
                              "py-1 text-right font-semibold tabular-nums",
                              adj.value >= 0 ? "text-emerald-600" : "text-red-500",
                            )}
                          >
                            {adj.value >= 0 ? "+" : ""}${adj.value.toLocaleString()}
                            {unit}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200">
                        <td className="py-1 font-bold">Total adjustments</td>
                        <td
                          className={cn(
                            "py-1 text-right font-bold tabular-nums",
                            totalAdj >= 0 ? "text-emerald-600" : "text-red-500",
                          )}
                        >
                          {totalAdj >= 0 ? "+" : ""}${totalAdj.toLocaleString()}
                          {unit}
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

      <Section title="Extracted Line Items">
        <div className="grid gap-4 lg:grid-cols-2">
          <LineItemTable title="Balance Sheet" items={bs.items} onRowClick={onBsLineClick} />
          <LineItemTable title="Income & Cash Flow" items={cfItems} onRowClick={onCfLineClick} />
        </div>
      </Section>
    </div>
  );
}
