"use client";

import type { DataSourceRow } from "@/types/dataSource";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { COLORS, PIE_PALETTE, fmt, fmtPct, fmtX, tooltipStyle } from "./analysisDashboardConstants";
import { Section, KpiCell, RatioCard } from "./analysisDashboardPrimitives";
import type { InsightsTabModel } from "./useInsightsTabModel";

export function InsightsTabTrendsSection({
  model,
  onMetricTableRowClick,
}: {
  model: InsightsTabModel;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const { result, segmentHistory, historyRows, ttm, commentary, ttmTraceExtra } = model;

  return (
    <>
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
            <KpiCell label="Revenue TTM" value={fmt(ttm.revenue)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Revenue TTM", ttmTraceExtra) : undefined} />
            <KpiCell label="EBITDA TTM" value={fmt(ttm.ebitda)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("EBITDA TTM", ttmTraceExtra) : undefined} />
            <KpiCell label="Net Income TTM" value={fmt(ttm.netIncome)} highlight={ttm.netIncome} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Net Income TTM", ttmTraceExtra) : undefined} />
            <KpiCell label="OCF TTM" value={fmt(ttm.operatingCashFlow)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("OCF TTM", ttmTraceExtra) : undefined} />
            <KpiCell label="FCF TTM" value={fmt(ttm.freeCashFlow)} highlight={ttm.freeCashFlow} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("FCF TTM", ttmTraceExtra) : undefined} />
            <KpiCell label="CapEx TTM" value={fmt(ttm.capex != null ? -Math.abs(ttm.capex) : null)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("CapEx TTM", ttmTraceExtra) : undefined} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <RatioCard label="Gross Margin" value={fmtPct(ttm.grossMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Gross Margin", ttmTraceExtra) : undefined} />
            <RatioCard label="OP Margin" value={fmtPct(ttm.operatingMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("OP Margin", ttmTraceExtra) : undefined} />
            <RatioCard label="EBITDA Margin" value={fmtPct(ttm.ebitdaMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("EBITDA Margin", ttmTraceExtra) : undefined} />
            <RatioCard label="Net Margin" value={fmtPct(ttm.netMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("Net Margin", ttmTraceExtra) : undefined} />
            <RatioCard label="ROE (TTM)" value={fmtPct(ttm.roe)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("ROE (TTM)", ttmTraceExtra) : undefined} />
            <RatioCard label="ROA (TTM)" value={fmtPct(ttm.roa)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("ROA (TTM)", ttmTraceExtra) : undefined} />
            <RatioCard label="FCF Margin" value={fmtPct(ttm.fcfMargin)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick && ttmTraceExtra ? () => onMetricTableRowClick("FCF Margin", ttmTraceExtra) : undefined} />
          </div>
        </div>
      </Section>
    )}
    </>
  );
}

