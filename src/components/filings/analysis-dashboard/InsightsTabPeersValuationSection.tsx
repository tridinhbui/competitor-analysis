"use client";

import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { COLORS, PIE_PALETTE, fmt, fmtPct, fmtX, tooltipStyle } from "./analysisDashboardConstants";
import { Section } from "./analysisDashboardPrimitives";
import type { InsightsTabModel } from "./useInsightsTabModel";

export function InsightsTabPeersValuationSection({ model }: { model: InsightsTabModel }) {
  const {
    peers,
    commentary,
    ticker,
    marketCapInput,
    setMarketCapInput,
    marketCapLoading,
    stockPrice,
    marketCap,
    valuation,
    ttm,
  } = model;

  return (
    <>
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
    </>
  );
}

