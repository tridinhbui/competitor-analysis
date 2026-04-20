"use client";

/**
 * /analyze idle UI — PDF extract entry only.
 * No backfill, quiz, or idle chat here (those live elsewhere).
 */

import type { RefObject } from "react";
import { FileUp, CheckCircle2, Sparkles, FileScan, ChartColumnBig } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyzeExtractPanelProps {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  aiEnabled?: boolean;
  onToggleAi?: () => void;
}

export function AnalyzeExtractPanel({
  dragOver,
  setDragOver,
  handleDrop,
  handleFileInput,
  inputRef,
  aiEnabled = true,
  onToggleAi,
}: AnalyzeExtractPanelProps) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary sm:text-base">Analyze</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Extract from filings</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
          Upload a <strong className="font-semibold text-slate-800">10-Q PDF</strong>. We map key lines, score quality, and prepare dashboard-ready output.
        </p>
        {onToggleAi ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onToggleAi}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                aiEnabled
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI extraction {aiEnabled ? "on" : "off"}
              <span className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                aiEnabled ? "bg-primary/20 text-primary" : "bg-slate-200 text-slate-500"
              )}>{aiEnabled ? "enabled" : "disabled"}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex min-h-[26rem] rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-elevation sm:min-h-[30rem] sm:p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-10",
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
              <p className="font-semibold text-slate-900">1) Parse the filing</p>
              <p className="mt-1 text-xs text-slate-600">The PDF route parses pages and tables locally before sending structured text for extraction.</p>
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
              Drag the raw filing PDF when you want the dashboard and PDF highlighter to stay in sync.
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
