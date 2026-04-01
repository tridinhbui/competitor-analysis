"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PeerComparisonResult, CompanyQuarterMetrics, MarginGap } from "@/lib/peerComparisonService";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, Minus, Loader2, Search, TrendingUp,
} from "lucide-react";

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const tooltipStyle = {
  borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12,
  background: "#fff", color: "#1e293b", boxShadow: "0 4px 12px rgb(0 0 0/0.08)",
};

const fmt = (v: number | null | undefined): string => v != null ? v.toLocaleString() : "—";
const fmtM = (v: number | null | undefined): string => v != null ? `$${v.toLocaleString()}M` : "—";
const fmtPct = (v: number | null | undefined): string => v != null ? `${v.toFixed(1)}%` : "—";
const fmtX = (v: number | null | undefined): string => v != null ? `${v.toFixed(2)}x` : "—";

type ViewTab = "overview" | "margins" | "financials" | "trends";

export function PeerComparisonView() {
  const [subject, setSubject] = useState("");
  const [peers, setPeers] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PeerComparisonResult | null>(null);
  const [tab, setTab] = useState<ViewTab>("overview");

  const fetchComparison = useCallback(async () => {
    const s = subject.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError("");
    setData(null);

    const params = new URLSearchParams({ subject: s });
    if (peers.trim()) params.set("peers", peers.trim().toUpperCase());

    try {
      const resp = await fetch(`/api/peer-comparison?${params}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? `HTTP ${resp.status}`);
      }
      const result: PeerComparisonResult = await resp.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [subject, peers]);

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-slate-900">Peer Comparison</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Compare financial metrics across companies side-by-side. Load historical quarters first via the Analyze page.
          </p>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); fetchComparison(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Subject Company</label>
                <input
                  type="text"
                  placeholder="e.g. AAPL"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Peers (comma-separated, or leave blank for all)</label>
                <input
                  type="text"
                  placeholder="e.g. MSFT,GOOG"
                  value={peers}
                  onChange={(e) => setPeers(e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!subject.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {loading ? "Loading..." : "Compare"}
            </button>
          </form>
          {error && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>
      </div>
    );
  }

  const companies = data.companies;
  const subjectData = companies[0];
  const peerData = companies.slice(1);

  const TABS: { id: ViewTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "margins", label: "Margin Gaps" },
    { id: "financials", label: "Financials" },
    { id: "trends", label: "Trends" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {subjectData.companyName}
            <span className="ml-2 rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{subjectData.ticker}</span>
            <span className="ml-2 text-sm font-normal text-slate-400">vs</span>
            {peerData.map((p, i) => (
              <span key={i} className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">{p.ticker}</span>
            ))}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{data.quarterLabel} | Period ending {data.periodEnd}</p>
        </div>
        <button
          onClick={() => { setData(null); setTab("overview"); }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          New Comparison
        </button>
      </div>

      {/* Tab bar */}
      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-semibold transition",
              tab === id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab companies={companies} />}
      {tab === "margins" && <MarginGapTab gaps={data.marginGaps} subject={subjectData.ticker} />}
      {tab === "financials" && <FinancialsTab companies={companies} />}
      {tab === "trends" && <TrendsTab trendData={data.trendData} />}
    </div>
  );
}

/* ──────────────────── Overview Tab ──────────────────── */

function OverviewTab({ companies }: { companies: CompanyQuarterMetrics[] }) {
  const metrics: Array<{ label: string; key: keyof CompanyQuarterMetrics; format: "money" | "pct" | "ratio" | "num" }> = [
    { label: "Revenue", key: "revenue", format: "money" },
    { label: "Gross Profit", key: "grossProfit", format: "money" },
    { label: "Gross Margin", key: "grossMargin", format: "pct" },
    { label: "Operating Income", key: "operatingIncome", format: "money" },
    { label: "OP Margin", key: "operatingMargin", format: "pct" },
    { label: "EBITDA", key: "ebitda", format: "money" },
    { label: "EBITDA Margin", key: "ebitdaMargin", format: "pct" },
    { label: "Net Income", key: "netIncome", format: "money" },
    { label: "Net Margin", key: "netMargin", format: "pct" },
    { label: "Total Assets", key: "totalAssets", format: "money" },
    { label: "Total Debt", key: "totalDebt", format: "money" },
    { label: "Net Debt", key: "netDebt", format: "money" },
    { label: "Free Cash Flow", key: "freeCashFlow", format: "money" },
    { label: "D/E Ratio", key: "debtToEquity", format: "ratio" },
    { label: "ROE", key: "returnOnEquity", format: "pct" },
    { label: "ROA", key: "returnOnAssets", format: "pct" },
    { label: "Current Ratio", key: "currentRatio", format: "ratio" },
    { label: "SG&A % Rev", key: "sgaPctRevenue", format: "pct" },
    { label: "Adj. OP Income", key: "adjustedOperatingIncome", format: "money" },
    { label: "Adj. OP Margin", key: "adjustedOperatingMargin", format: "pct" },
    { label: "OP/Head ($)", key: "opPerHead", format: "ratio" },
    { label: "OP/cwt ($)", key: "opPerCwt", format: "ratio" },
    { label: "Adj. OP/Head ($)", key: "adjustedOpPerHead", format: "ratio" },
    { label: "Adj. OP/cwt ($)", key: "adjustedOpPerCwt", format: "ratio" },
  ];

  const fmtCell = (v: unknown, format: string): string => {
    const n = v as number | null;
    if (n == null) return "—";
    if (format === "money") return `$${n.toLocaleString()}M`;
    if (format === "pct") return `${n.toFixed(1)}%`;
    if (format === "ratio") return `${n.toFixed(2)}x`;
    return n.toLocaleString();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-slate-200 bg-slate-50">
            <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left font-semibold text-slate-500">Metric</th>
            {companies.map((c, i) => (
              <th key={i} className="px-4 py-2.5 text-right font-semibold text-slate-700">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px]", i === 0 ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600")}>
                  {c.ticker}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-600">{m.label}</td>
              {companies.map((c, j) => (
                <td key={j} className={cn("px-4 py-2 text-right tabular-nums", j === 0 ? "font-semibold text-slate-900" : "text-slate-700")}>
                  {fmtCell(c[m.key], m.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ──────────────────── Margin Gap Tab ──────────────────── */

function MarginGapTab({ gaps, subject }: { gaps: MarginGap[]; subject: string }) {
  // Group gaps by peer
  const grouped = new Map<string, MarginGap[]>();
  for (const g of gaps) {
    const match = g.metric.match(/\(vs (\w+)\)/);
    const peer = match?.[1] ?? "Unknown";
    if (!grouped.has(peer)) grouped.set(peer, []);
    grouped.get(peer)!.push(g);
  }

  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([peer, peerGaps]) => (
        <div key={peer} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <h4 className="text-xs font-bold text-slate-700">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{subject}</span>
              <span className="mx-2 text-slate-400">vs</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700">{peer}</span>
            </h4>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left font-semibold text-slate-500">Metric</th>
                <th className="px-4 py-2 text-right font-semibold text-slate-500">{subject}</th>
                <th className="px-4 py-2 text-right font-semibold text-slate-500">{peer}</th>
                <th className="px-4 py-2 text-right font-semibold text-slate-500">Gap</th>
              </tr>
            </thead>
            <tbody>
              {peerGaps.map((g, i) => {
                const metricName = g.metric.replace(/\s*\(vs \w+\)/, "");
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-600">{metricName}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">{g.subjectValue != null ? g.subjectValue.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{g.peerValue != null ? g.peerValue.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {g.gap != null ? (
                        <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", g.subjectBetter ? "text-emerald-600" : "text-red-500")}>
                          {g.subjectBetter ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {g.gap > 0 ? "+" : ""}{g.gap.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {gaps.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          No margin gap data available. Ensure both subject and peers have filings.
        </div>
      )}
    </div>
  );
}

/* ──────────────────── Financials Tab ──────────────────── */

function FinancialsTab({ companies }: { companies: CompanyQuarterMetrics[] }) {
  // Margin comparison chart
  const marginChart = companies.map(c => ({
    name: c.ticker,
    "Gross Margin": c.grossMargin ?? 0,
    "OP Margin": c.operatingMargin ?? 0,
    "EBITDA Margin": c.ebitdaMargin ?? 0,
    "Net Margin": c.netMargin ?? 0,
  }));

  // Revenue comparison
  const revChart = companies.map(c => ({
    name: c.ticker,
    Revenue: c.revenue ?? 0,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Margin Comparison (%)</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marginChart}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Gross Margin" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="OP Margin" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="EBITDA Margin" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net Margin" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Revenue ($M)</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revChart}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `$${Number(v).toLocaleString()}M`} />
                <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                  {revChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Per-unit section if volume data exists */}
      {companies.some(c => c.volumeHeads || c.volumeCwt) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">Per-Unit Economics</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Metric</th>
                  {companies.map((c, i) => (
                    <th key={i} className="px-3 py-2 text-right font-semibold text-slate-700">{c.ticker}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Volume (heads)", key: "volumeHeads" as const, fmt: (v: number | null) => v != null ? fmt(v) : "—" },
                  { label: "Volume (cwt)", key: "volumeCwt" as const, fmt: (v: number | null) => v != null ? fmt(v) : "—" },
                  { label: "Revenue/Head", key: "revenuePerHead" as const, fmt: (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—" },
                  { label: "OP/Head", key: "opPerHead" as const, fmt: (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—" },
                  { label: "Revenue/cwt", key: "revenuePerCwt" as const, fmt: (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—" },
                  { label: "OP/cwt", key: "opPerCwt" as const, fmt: (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—" },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-600">{row.label}</td>
                    {companies.map((c, j) => (
                      <td key={j} className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {row.fmt(c[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────── Trends Tab ──────────────────── */

function TrendsTab({ trendData }: { trendData: PeerComparisonResult["trendData"] }) {
  if (trendData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
        Need at least 2 quarters of data to show trends.
      </div>
    );
  }

  // Build chart data: x = quarter, lines = companies
  // Revenue trend
  const allQuarters = new Set<string>();
  for (const td of trendData) {
    for (const q of td.quarters) allQuarters.add(q.quarterLabel);
  }
  const sortedQuarters = [...allQuarters].sort();

  const buildTrendChart = (metricKey: keyof CompanyQuarterMetrics, label: string) => {
    const chartData = sortedQuarters.map(qLabel => {
      const point: Record<string, unknown> = { quarter: qLabel };
      for (const td of trendData) {
        const q = td.quarters.find(q => q.quarterLabel === qLabel);
        point[td.ticker] = q ? (q[metricKey] as number | null) : null;
      }
      return point;
    });

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-xs font-bold uppercase text-slate-500">{label}</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="quarter" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {trendData.map((td, i) => (
                <Line
                  key={td.ticker}
                  type="monotone"
                  dataKey={td.ticker}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {buildTrendChart("operatingMargin", "Operating Margin Trend (%)")}
      {buildTrendChart("adjustedOperatingMargin", "Adj. Operating Margin Trend (%)")}
      {buildTrendChart("grossMargin", "Gross Margin Trend (%)")}
      {buildTrendChart("ebitdaMargin", "EBITDA Margin Trend (%)")}
      {buildTrendChart("netMargin", "Net Margin Trend (%)")}
      {buildTrendChart("revenue", "Revenue Trend ($M)")}
      {buildTrendChart("opPerHead", "OP/Head Trend ($)")}
      {buildTrendChart("returnOnEquity", "ROE Trend (%)")}
    </div>
  );
}
