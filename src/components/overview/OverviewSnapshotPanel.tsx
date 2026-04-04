"use client";

import { useCallback, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import {
  Search, Loader2, TrendingUp, TrendingDown, ExternalLink,
  DollarSign, BarChart3, Activity, Globe,
} from "lucide-react";

const PIE_COLORS = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#f59e0b"];

interface OverviewData {
  ticker: string;
  companyName: string;
  description: string | null;
  industry: string | null;
  stock: {
    price: number;
    change: number;
    changePercent: number;
    marketCap: number | null;
    peRatio: number | null;
    dividendYield: number | null;
    week52High: number | null;
    week52Low: number | null;
    avgVolume: number | null;
  } | null;
  segments: Array<{
    name: string;
    revenue: number | null;
    operatingIncome: number | null;
    operatingMargin: number | null;
    revenuePercent: number | null;
  }>;
  financials: {
    revenue: number | null;
    netIncome: number | null;
    totalAssets: number | null;
    totalDebt: number | null;
    freeCashFlow: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
  };
  news: Array<{ title: string; url: string; source: string; date: string }>;
}

function fmtB(v: number | null): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtM(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}
function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function OverviewSnapshotPanel() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async (t: string) => {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/business-overview?ticker=${encodeURIComponent(t.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const pieData = data?.segments?.filter((s) => (s.revenue ?? 0) > 0).map((s) => ({
    name: s.name,
    value: s.revenue!,
  })) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Snapshot</p>
        <p className="mt-1 text-sm text-slate-600">Quick company view: market data, segments, and latest quarter metrics.</p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            placeholder="Enter ticker (e.g., AAPL, TSN)..."
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") fetchOverview(ticker); }}
          />
        </div>
        <button
          onClick={() => fetchOverview(ticker)}
          disabled={loading || !ticker.trim()}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-slate-500">Loading snapshot…</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <div className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{data.companyName}</h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{data.ticker}</span>
                {data.industry && <span className="text-xs text-slate-400">{data.industry}</span>}
              </div>
            </div>
            {data.stock && (
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums text-slate-900">${data.stock.price.toFixed(2)}</p>
                <p className={`flex items-center justify-end gap-1 text-sm font-semibold ${data.stock.change >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {data.stock.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {data.stock.change >= 0 ? "+" : ""}{data.stock.change.toFixed(2)} ({data.stock.changePercent.toFixed(2)}%)
                </p>
              </div>
            )}
          </div>

          {data.stock && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Market Cap" value={fmtB(data.stock.marketCap)} icon={DollarSign} />
              <MetricCard label="P/E Ratio" value={data.stock.peRatio != null ? data.stock.peRatio.toFixed(1) : "—"} icon={BarChart3} />
              <MetricCard label="Dividend Yield" value={data.stock.dividendYield != null ? `${data.stock.dividendYield.toFixed(2)}%` : "—"} icon={Activity} />
              <MetricCard label="Avg Volume" value={data.stock.avgVolume != null ? `${(data.stock.avgVolume / 1e6).toFixed(1)}M` : "—"} icon={Globe} />
            </div>
          )}

          {data.stock?.week52Low != null && data.stock?.week52High != null && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">52-Week Range</p>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-slate-500">${data.stock.week52Low.toFixed(2)}</span>
                <div className="relative flex-1 h-2 rounded-full bg-slate-100">
                  {(() => {
                    const pct = ((data.stock!.price - data.stock!.week52Low!) / (data.stock!.week52High! - data.stock!.week52Low!)) * 100;
                    return <div className="absolute top-0 left-0 h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />;
                  })()}
                </div>
                <span className="text-xs tabular-nums text-slate-500">${data.stock.week52High.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-800">Key Financials (Latest Quarter)</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Revenue" value={fmtM(data.financials.revenue)} />
              <MetricCard label="Net Income" value={fmtM(data.financials.netIncome)} />
              <MetricCard label="Total Assets" value={fmtM(data.financials.totalAssets)} />
              <MetricCard label="Total Debt" value={fmtM(data.financials.totalDebt)} />
              <MetricCard label="Free Cash Flow" value={fmtM(data.financials.freeCashFlow)} />
              <MetricCard label="Operating Margin" value={fmtPct(data.financials.operatingMargin)} />
              <MetricCard label="Net Margin" value={fmtPct(data.financials.netMargin)} />
              <MetricCard label="ROE" value={fmtPct(data.financials.roe)} />
            </div>
          </div>

          {data.segments.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-bold text-slate-800">Business Segments</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {pieData.length > 0 && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => fmtM(typeof v === "number" ? v : null)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Segment</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-500">Revenue</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-500">% Total</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-500">OP Income</th>
                      <th className="px-2 py-2 text-right font-semibold text-slate-500">OP Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.segments.map((seg, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-2 py-1.5 font-medium text-slate-700">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          {seg.name}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(seg.revenue)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{seg.revenuePercent != null ? `${seg.revenuePercent}%` : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtM(seg.operatingIncome)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(seg.operatingMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.news.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-slate-800">Recent News</h2>
              <div className="space-y-2">
                {data.news.map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-lg border border-slate-100 p-3 transition hover:bg-slate-50">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{n.source} · {new Date(n.date).toLocaleDateString()}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 shrink-0 text-slate-300" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.news.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-400">
              Add NEWSAPI_KEY to .env.local to enable news feed.
            </div>
          )}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <Globe className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">Enter a ticker to view snapshot</p>
        </div>
      )}
    </div>
  );
}

