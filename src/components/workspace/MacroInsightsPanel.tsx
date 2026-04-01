"use client";

import { useCallback, useState } from "react";
import type {
  CommodityPrice,
  MacroIndicator,
  MacroDataResult,
  NewsItem,
  SearchInsight,
} from "@/lib/externalDataService";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  Globe,
  Newspaper,
  BarChart3,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Zap,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const fmtNum = (v: number | null): string =>
  v != null ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";

const fmtDate = (d: string | null): string => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
};

function ChangeIndicator({ change, pct }: { change: number | null; pct: number | null }) {
  if (change == null) return <span className="text-slate-400">—</span>;
  const positive = change > 0;
  const zero = change === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        zero ? "text-slate-400" : positive ? "text-emerald-600" : "text-red-500"
      }`}
    >
      {zero ? <Minus className="h-3 w-3" /> : positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {fmtNum(change)}
      {pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function CommodityGrid({ items }: { items: CommodityPrice[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <div
          key={c.symbol}
          className="rounded-lg border border-slate-200 bg-white p-3 transition hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {c.symbol.replace("=F", "")}
            </span>
            <span className="text-[9px] text-slate-400">{c.unit}</span>
          </div>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmtNum(c.price)}</p>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 truncate max-w-[120px]">{c.name}</span>
            <ChangeIndicator change={c.change} pct={c.changePercent} />
          </div>
        </div>
      ))}
    </div>
  );
}

function IndicatorTable({ items }: { items: MacroIndicator[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-3 py-2 text-left font-semibold text-slate-500">Indicator</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Value</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Change</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Unit</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-500">Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ind) => (
            <tr key={ind.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="px-3 py-2 font-medium text-slate-700">{ind.name}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-900">
                {ind.value != null ? fmtNum(ind.value) : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <ChangeIndicator change={ind.change} pct={null} />
              </td>
              <td className="px-3 py-2 text-right text-slate-500">{ind.unit}</td>
              <td className="px-3 py-2 text-right text-slate-400">{fmtDate(ind.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((n, i) => (
        <a
          key={i}
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-primary/30 hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">{n.title}</p>
              {n.snippet && (
                <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{n.snippet}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                {n.source && <span className="font-medium text-slate-500">{n.source}</span>}
                {n.date && <span>{fmtDate(n.date)}</span>}
              </div>
            </div>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
          </div>
        </a>
      ))}
    </div>
  );
}

function InsightBox({ insight }: { insight: SearchInsight }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 text-indigo-500" />
        <span className="text-xs font-bold text-indigo-700">AI Market Intelligence</span>
        <span className="text-[9px] text-indigo-400">
          {fmtDate(insight.generatedAt)}
        </span>
      </div>
      <div className="prose prose-xs prose-slate max-w-none text-xs leading-relaxed text-slate-700 whitespace-pre-line">
        {insight.summary}
      </div>
      {insight.sources.length > 0 && (
        <div className="mt-3 border-t border-indigo-100 pt-2">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-indigo-400">Sources</p>
          <div className="flex flex-wrap gap-1">
            {insight.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] text-indigo-600 hover:bg-indigo-100 transition"
              >
                [{i + 1}]
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type Section = "commodities" | "macro" | "news" | "search";

export function MacroInsightsPanel() {
  const [macroData, setMacroData] = useState<MacroDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("commodities");

  // Web search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchInsight | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/macro-data?query=pork+industry+meat+protein");
      if (res.ok) {
        setMacroData(await res.json());
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const doSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(`/api/web-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        setSearchResult(await res.json());
      }
    } catch { /* ignore */ } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const sections: Array<{ key: Section; label: string; icon: React.ReactNode }> = [
    { key: "commodities", label: "Commodities", icon: <BarChart3 className="h-3 w-3" /> },
    { key: "macro", label: "Macro", icon: <TrendingUp className="h-3 w-3" /> },
    { key: "news", label: "News", icon: <Newspaper className="h-3 w-3" /> },
    { key: "search", label: "Search", icon: <Search className="h-3 w-3" /> },
  ];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1">
          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-slate-900">Market & Macro Intelligence</h3>
        </button>
        <button
          onClick={fetchData}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {macroData ? "Refresh" : "Load Data"}
        </button>
      </div>

      {expanded && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {sections.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => {
                  setActiveSection(key);
                  if (!macroData && key !== "search") fetchData();
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                  activeSection === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Loading state */}
          {loading && !macroData && activeSection !== "search" && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-xs text-slate-500">Fetching market data...</span>
            </div>
          )}

          {/* No data yet */}
          {!loading && !macroData && activeSection !== "search" && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <Globe className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-500">No market data loaded</p>
              <p className="mt-1 text-[10px] text-slate-400">
                Click &quot;Load Data&quot; to fetch commodity prices, macro indicators, and industry news.
              </p>
            </div>
          )}

          {/* Errors */}
          {macroData && macroData.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
              <div className="flex items-center gap-1 text-[10px] text-amber-700">
                <AlertCircle className="h-3 w-3" />
                {macroData.errors.map((e, i) => <span key={i}>{e}</span>)}
              </div>
            </div>
          )}

          {/* Commodity section */}
          {activeSection === "commodities" && macroData && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Live commodity futures relevant to pork/protein industry. Data from Yahoo Finance.
              </p>
              <CommodityGrid items={macroData.commodities} />
              <p className="text-right text-[9px] text-slate-400">
                Last updated: {fmtDate(macroData.fetchedAt)}
              </p>
            </div>
          )}

          {/* Macro section */}
          {activeSection === "macro" && macroData && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Key economic indicators from FRED (Federal Reserve Economic Data).
                {macroData.indicators.some(i => i.source.includes("no API key")) && (
                  <span className="ml-1 font-semibold text-amber-600">
                    Add FRED_API_KEY to .env.local for live data.
                  </span>
                )}
              </p>
              <IndicatorTable items={macroData.indicators} />
            </div>
          )}

          {/* News section */}
          {activeSection === "news" && macroData && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Recent industry news from Google News RSS.
              </p>
              <NewsList items={macroData.news} />
            </div>
          )}

          {/* Search section */}
          {activeSection === "search" && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Search for specific industry topics. AI generates a market intelligence summary from recent news.
              </p>
              <div className="flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="e.g. Smithfield pork earnings, hog prices outlook 2025, Tyson Foods guidance..."
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <button
                  onClick={doSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Search
                </button>
              </div>

              {searching && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="ml-2 text-xs text-slate-500">Searching and analyzing...</span>
                </div>
              )}

              {searchResult && (
                <div className="space-y-3">
                  {searchResult.summary && <InsightBox insight={searchResult} />}
                  {/* Show raw news from the search result if available */}
                  {"news" in searchResult && Array.isArray((searchResult as Record<string, unknown>).news) && (
                    <NewsList items={(searchResult as Record<string, unknown>).news as NewsItem[]} />
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
