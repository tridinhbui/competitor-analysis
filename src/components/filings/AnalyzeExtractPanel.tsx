"use client";

/**
 * /analyze idle UI — ingest + extract entry only:
 * - SEC ticker: server-side XBRL pipeline (official ingest).
 * - PDF: client-side parse + extract (same product surface as ticker output).
 * No backfill, quiz, or idle chat here (those live elsewhere).
 */

import type { RefObject } from "react";
import { Search, ArrowRight, FileUp, CheckCircle2, Sparkles, FileScan, ChartColumnBig } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyzeExtractPanelProps {
  ticker: string;
  setTicker: (v: string) => void;
  analyzeViaSec: (t: string) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function AnalyzeExtractPanel({
  ticker,
  setTicker,
  analyzeViaSec,
  dragOver,
  setDragOver,
  handleDrop,
  handleFileInput,
  inputRef,
}: AnalyzeExtractPanelProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Analyze</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Extract from filings</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
          Ingest by <strong className="font-semibold text-slate-800">ticker</strong> (SEC stream) or <strong className="font-semibold text-slate-800">10-Q PDF</strong>. We map key lines,
          score quality, and prepare dashboard-ready output.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-elevation sm:p-6">
          <form
            className="relative flex w-full items-center rounded-full border border-slate-200/90 bg-white shadow-subtle transition focus-within:border-primary/35 focus-within:ring-4 focus-within:ring-primary/10"
            onSubmit={(e) => {
              e.preventDefault();
              analyzeViaSec(ticker);
            }}
          >
            <Search className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400 sm:left-5" aria-hidden />
            <input
              type="text"
              placeholder="Ticker (e.g. AAPL, MSFT)…"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              autoComplete="off"
              className="h-12 w-full rounded-full bg-transparent pl-11 pr-28 text-sm text-slate-900 outline-none placeholder:text-slate-400 sm:h-14 sm:pl-12 sm:pr-32 sm:text-base"
            />
            <button
              type="submit"
              disabled={!ticker.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[oklch(0.48_0.16_290)] px-4 text-xs font-semibold text-white shadow-subtle transition hover:opacity-95 disabled:opacity-40 sm:right-2 sm:top-2 sm:bottom-2 sm:gap-2 sm:px-5 sm:text-sm"
            >
              Run <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </button>
          </form>

          <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:text-xs">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200" />
            <span>or upload PDF</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200" />
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-10",
              dragOver ? "border-primary bg-primary/[0.06] shadow-elevation" : "border-slate-200 bg-white/80 shadow-subtle hover:border-primary/35 hover:bg-white"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            aria-label="Upload a 10-Q PDF for analysis"
          >
            <div
              className={cn(
                "mb-1 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors sm:h-14 sm:w-14",
                dragOver ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
              )}
            >
              <FileUp className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-slate-900 sm:text-base">Drop your 10-Q PDF here</p>
            <p className="text-xs text-slate-500 sm:text-sm">Parsed in-browser. Live extraction progress appears in the workflow panel.</p>
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-subtle sm:p-6">
          <p className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" aria-hidden />
            What happens next
          </p>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-semibold text-slate-900">1) Ingest & parse</p>
              <p className="mt-1 text-xs text-slate-600">Ticker route streams SEC pipeline; PDF route parses pages and tables locally.</p>
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-semibold text-slate-900">2) Map financial lines</p>
              <p className="mt-1 text-xs text-slate-600">We map debt, cash flow, balance sheet, and dividend metrics into structured blocks.</p>
            </li>
            <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="font-semibold text-slate-900">3) Review & export</p>
              <p className="mt-1 text-xs text-slate-600">Dashboard is ready for review, AI Q&A, and meeting-ready exports.</p>
            </li>
          </ol>
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
            <p className="inline-flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Pro tip
            </p>
            <p className="mt-1 leading-relaxed">
              Start with ticker for speed, then validate nuance by dropping the raw PDF.
            </p>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Bulk historical quarters? Use{" "}
            <a href="/data-source" className="font-semibold text-primary hover:underline">
              Data Source → Load historical quarters
            </a>
            .
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500">
            <FileScan className="h-3.5 w-3.5" aria-hidden />
            <ChartColumnBig className="h-3.5 w-3.5" aria-hidden />
            Workflow, context, and outputs stay synced.
          </div>
        </aside>
      </div>
    </div>
  );
}
