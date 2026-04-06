"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistoryThread } from "@/types/history";
import type { FullAnalysis } from "@/types/analysis";
import { AnalysisDashboard } from "@/components/filings/AnalysisDashboard";
import { ArrowLeft, Clock, FileText, Globe, Loader2, LogIn, Search, Trash2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

export default function HistoryPage() {
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ analysis: FullAnalysis; title: string } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setUnauthorized(false);
    try {
      const res = await fetchWithAuth("/api/history");
      if (res.status === 401) {
        setUnauthorized(true);
        setThreads([]);
        return;
      }
      const data = await res.json();
      setThreads(data.threads ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetchWithAuth(`/api/history/${id}`);
      const data = await res.json();
      setDetail({ analysis: data.analysis, title: data.title });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetchWithAuth(`/api/history/${id}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
  };

  const handleBack = () => {
    setSelectedId(null);
    setDetail(null);
  };

  const filtered = filter
    ? threads.filter((t) =>
        (t.ticker?.toLowerCase().includes(filter.toLowerCase())) ||
        (t.title?.toLowerCase().includes(filter.toLowerCase())) ||
        (t.companyName?.toLowerCase().includes(filter.toLowerCase()))
      )
    : threads;

  // Detail view
  if (selectedId && detail) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <button
          onClick={handleBack}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to History
        </button>
        <h1 className="mb-4 text-lg font-bold text-slate-900">{detail.title}</h1>
        <AnalysisDashboard result={detail.analysis} />
      </div>
    );
  }

  if (selectedId && loadingDetail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">Loading analysis…</span>
      </div>
    );
  }

  // List view
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Analysis History</h1>
          <p className="text-xs text-slate-500">{threads.length} past analyses saved</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            className="rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs shadow-sm outline-none focus:ring-1 focus:ring-primary/40"
            placeholder="Search..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : unauthorized ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-10 text-center">
          <LogIn className="h-6 w-6 text-amber-500" />
          <p className="text-sm font-semibold text-slate-800">Please sign in to view your history.</p>
          <p className="text-xs text-slate-500">Your analyses are saved per account. Sign in to access them.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No analysis history yet. Run an analysis to see it here.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleSelect(t.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.source === "sec" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                  }`}>
                    {t.source === "sec" ? <Globe className="inline h-3 w-3 mr-0.5" /> : <FileText className="inline h-3 w-3 mr-0.5" />}
                    {t.source.toUpperCase()}
                  </span>
                  {t.quarterLabel && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      {t.quarterLabel}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  {new Date(t.createdAt).toLocaleString()}
                  {t.ticker && <span>· {t.ticker}</span>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                className="rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
