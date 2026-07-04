"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HistoryThread } from "@/types/history";
import { Clock, FileText, Globe, Loader2, LogIn, Search, Trash2, RefreshCcw, Filter, History } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";

export function AnalysisHistoryPanel() {
  const router = useRouter();
  const [threads, setThreads] = useState<HistoryThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setUnauthorized(false);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/history");
      if (res.status === 401) {
        setUnauthorized(true);
        setThreads([]);
        return;
      }
      const data = await res.json();
      setThreads(data.threads ?? []);
    } catch (err) {
      setThreads([]);
      setError(err instanceof Error ? err.message : "Unable to load analysis history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleSelect = (id: string) => {
    router.push(`/analyze?tab=extract&historyId=${encodeURIComponent(id)}`);
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await fetchWithAuth(`/api/history/${id}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete this history entry.");
    }
  };

  const filtered = filter
    ? threads.filter((t) =>
        (t.ticker?.toLowerCase().includes(filter.toLowerCase())) ||
        (t.title?.toLowerCase().includes(filter.toLowerCase())) ||
        (t.companyName?.toLowerCase().includes(filter.toLowerCase()))
      )
    : threads;

  const quickAnalyzeThreads = filtered.filter((t) => t.workflowOrigin !== "competitor");
  const competitorThreads = filtered.filter((t) => t.workflowOrigin === "competitor");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="sticky top-[4.5rem] z-20 mb-5 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              <History className="h-3.5 w-3.5" />
              History
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Analysis History</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {threads.length} past analyses saved. Reopen a run to restore the analysis state inside Analyze.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
                placeholder="Search history"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => setFilter("")}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <Filter className="h-4 w-4" />
              Clear
            </button>
          </div>
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
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50/70 p-10 text-center">
          <p className="text-sm font-semibold text-slate-800">Could not load history right now.</p>
          <p className="text-xs text-slate-500">{error}</p>
          <button
            type="button"
            onClick={fetchThreads}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No analysis history yet. Run an analysis to see it here.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <HistorySection
            title="Quick Analyze"
            subtitle="Single-company analysis runs with saved state"
            threads={quickAnalyzeThreads}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
          <HistorySection
            title="Competitor Analysis"
            subtitle="Peer and competitor workflow runs with history restore"
            threads={competitorThreads}
            onSelect={handleSelect}
            onDelete={handleDelete}
          />
        </div>
      )}
    </div>
  );
}

function HistorySection({
  title,
  subtitle,
  threads,
  onSelect,
  onDelete,
}: {
  title: string;
  subtitle: string;
  threads: HistoryThread[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {threads.length}
        </span>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-sm text-slate-400">
          No entries in this section yet.
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => onSelect(t.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold tracking-tight text-slate-900">{t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.source === "sec" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                  }`}>
                    {t.source === "sec" ? <Globe className="mr-0.5 inline h-3 w-3" /> : <FileText className="mr-0.5 inline h-3 w-3" />}
                    {t.source.toUpperCase()}
                  </span>
                  {t.quarterLabel && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      {t.quarterLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  {new Date(t.createdAt).toLocaleString()}
                  {t.ticker && <span>· {t.ticker}</span>}
                </div>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                className="rounded-lg p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="rounded-lg p-2 text-slate-300 transition hover:bg-primary/10 hover:text-primary"
                title="Reopen in Analyze"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
