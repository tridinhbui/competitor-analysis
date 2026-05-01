"use client";

import { useCallback, useState } from "react";
import { History, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface BackfillEvent {
  step: string;
  status: string;
  message: string;
  detail?: Record<string, unknown>;
}

/**
 * Bulk SEC quarter ingest for the Data Source table — lives here (not on /analyze)
 * because it is data-pipeline / storage, not single-run extract.
 */
export function HistoricalBackfillPanel() {
  const [ticker, setTicker] = useState("");
  const [events, setEvents] = useState<BackfillEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const run = useCallback(async (t: string) => {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setRunning(true);
    setDone(false);
    setEvents([]);
    try {
      const resp = await fetch(`/api/analyze/history?ticker=${encodeURIComponent(clean)}&quarters=12`);
      if (!resp.ok || !resp.body) throw new Error(`Server returned ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.trim().split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(5)) as BackfillEvent;
            setEvents((prev) => [...prev, evt]);
          } catch {
            /* ignore */
          }
        }
      }
      setDone(true);
    } catch (err) {
      setEvents((prev) => [...prev, { step: "error", status: "error", message: String(err) }]);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Load historical SEC quarters">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-bold text-slate-900">Load historical quarters</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">12 qtrs</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Backfill up to 12 quarters into this data source. For single-ticker or PDF extraction, use{" "}
        <a href="/analyze" className="font-semibold text-primary hover:underline">
          Quick Analyze
        </a>
        .
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          run(ticker);
        }}
      >
        <input
          type="text"
          placeholder="Ticker (e.g. TSN, HRL)…"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />
        <button
          type="submit"
          disabled={!ticker.trim() || running}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-40"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <History className="h-3.5 w-3.5" aria-hidden />}
          {running ? "Loading…" : "Load"}
        </button>
      </form>
      {events.length > 0 && (
        <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5">
              {ev.status === "done" && <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" aria-hidden />}
              {ev.status === "error" && <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" aria-hidden />}
              {ev.status === "running" && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" aria-hidden />}
              {ev.status === "skipped" && <span className="mt-0.5 h-3 w-3 shrink-0 text-center text-[8px] text-slate-400">—</span>}
              <span className="text-[11px] text-slate-600">{ev.message}</span>
            </div>
          ))}
          {done && (
            <div className="mt-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
              Complete — refresh the table below if needed
            </div>
          )}
        </div>
      )}
    </section>
  );
}
