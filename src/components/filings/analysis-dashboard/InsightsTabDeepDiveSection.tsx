"use client";

import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, ArrowRight, Minus, TrendingUp, AlertCircle,
} from "lucide-react";
import { fmt, fmtPct, fmtX } from "./analysisDashboardConstants";
import {
  Section, RatioCard, MetricTable, DupontFactor, ZRow, InterpretRow, FootnoteCard,
} from "./analysisDashboardPrimitives";
import type { InsightsTabModel } from "./useInsightsTabModel";

export function InsightsTabDeepDiveSection({
  model,
  onMetricTableRowClick,
}: {
  model: InsightsTabModel;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const {
    result,
    commentary,
    dupont,
    inc,
    bs,
    zScore,
    piotroski,
    earningsQuality,
    ccc,
    capAlloc,
    cf,
    footnotes,
    adjustedMetrics,
    narrative,
  } = model;

  return (
    <>

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
            <RatioCard label="OCF / Net Income" value={earningsQuality.ocfToNI != null ? `${earningsQuality.ocfToNI}x` : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("OCF / Net Income") : undefined} />
            <RatioCard label="FCF / Net Income" value={earningsQuality.fcfToNI != null ? `${earningsQuality.fcfToNI}x` : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("FCF / Net Income") : undefined} />
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
    </>
  );
}

