"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FullAnalysis, StepEvent } from "@/types/analysis";
import { AgentWorkflow } from "./AgentWorkflow";
import { AnalysisDashboard } from "./AnalysisDashboard";
import { AnalysisChatPanel } from "./AnalysisChatPanel";
import { PdfViewer } from "./PdfViewer";
import { FinanceQuiz } from "./FinanceQuiz";
import { analyzePdf } from "@/lib/pdfAnalysis";
import {
  parseSseBlock,
  isFullAnalysisPayload,
  isStepEventPayload,
} from "@/lib/sseClient";
import {
  FileUp, Search, ArrowRight, RotateCcw, Sparkles, FileText, History, CheckCircle, XCircle, Loader2,
} from "lucide-react";

type Phase = "idle" | "analyzing" | "done" | "error";

interface BackfillEvent {
  step: string;
  status: string;
  message: string;
  detail?: Record<string, unknown>;
}

export function TenQDropAnalyzer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [result, setResult] = useState<FullAnalysis | null>(null);
  const [error, setError] = useState<string>("");
  const [ticker, setTicker] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [backfillTicker, setBackfillTicker] = useState("");
  const [backfillEvents, setBackfillEvents] = useState<BackfillEvent[]>([]);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillDone, setBackfillDone] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showPdf, setShowPdf] = useState(true);
  const [pdfWidthPct, setPdfWidthPct] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeContainerRef = useRef<HTMLDivElement>(null);
  const workflowStatus =
    phase === "analyzing" ? "running" :
    phase === "done" ? "done" :
    phase === "error" ? "error" :
    "idle";

  // Auto-save filing when analysis completes (for competitor workspace)
  useEffect(() => {
    if (phase !== "done" || !result) return;
    // SEC-based analyses are saved server-side in the API route.
    // PDF-based analyses need to be saved from the client.
    if (result.meta.source === "pdf") {
      fetch("/api/filings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: result.meta.ticker,
          periodEnd: result.meta.periodEnd,
          source: "pdf",
          analysis: result,
        }),
      }).catch(() => {});
    }
    // Save to analysis history
    const companyName = result.meta.companyName ?? result.meta.ticker ?? "Unknown";
    const quarter = result.meta.periodEnd ? result.meta.periodEnd.slice(0, 7) : "";
    const title = result.meta.source === "pdf"
      ? `PDF Analysis — ${companyName} ${quarter}`
      : `${companyName} ${quarter} Analysis`;
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: result.meta.ticker ?? null,
        companyName,
        source: result.meta.source ?? "sec",
        periodEnd: result.meta.periodEnd ?? null,
        quarterLabel: quarter,
        title,
        analysis: result,
        events,
      }),
    }).catch(() => {});
  }, [phase, result, events]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const el = resizeContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setPdfWidthPct(Math.min(75, Math.max(25, pct)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setEvents([]);
    setResult(null);
    setError("");
    setTicker("");
    setPdfFile(null);
    setShowPdf(true);
  }, []);

  const analyzeViaSec = useCallback(async (t: string) => {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setPhase("analyzing");
    setEvents([]);
    setResult(null);
    setError("");
    setPdfFile(null);

    let receivedResult = false;
    const processBlock = (rawBlock: string) => {
      const block = rawBlock.trim();
      if (!block) return;
      const { event, data } = parseSseBlock(block);
      if (!data) return;
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch { return; }
      if ((event === "result" || isFullAnalysisPayload(parsed)) && isFullAnalysisPayload(parsed)) {
        receivedResult = true;
        setResult(parsed);
        setPhase("done");
        return;
      }
      if (isStepEventPayload(parsed)) {
        setEvents((prev) => [...prev, parsed]);
        if (parsed.status === "error" && parsed.message) setError(parsed.message);
      }
    };

    try {
      const resp = await fetch(`/api/analyze?ticker=${encodeURIComponent(clean)}`);
      if (!resp.ok || !resp.body) throw new Error(`Server returned ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) processBlock(part);
      }
      if (buffer.trim()) processBlock(buffer);
      if (!receivedResult) {
        setPhase("error");
        setError((prev) => prev.trim() || "Stream ended without analysis result.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const analyzePdfFile = useCallback(async (file: File) => {
    setPdfFile(file);
    setShowPdf(true);
    setPhase("analyzing");
    setEvents([]);
    setResult(null);
    setError("");
    try {
      const analysis = await analyzePdf(file, (evt) => setEvents((prev) => [...prev, evt]));
      setResult(analysis);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") analyzePdfFile(file);
  }, [analyzePdfFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzePdfFile(file);
  }, [analyzePdfFile]);

  const runBackfill = useCallback(async (t: string) => {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setBackfillRunning(true);
    setBackfillDone(false);
    setBackfillEvents([]);
    try {
      const resp = await fetch(`/api/analyze/history?ticker=${encodeURIComponent(clean)}&quarters=12`);
      if (!resp.ok || !resp.body) throw new Error(`Server returned ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.trim().split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(5)) as BackfillEvent;
            setBackfillEvents((prev) => [...prev, evt]);
          } catch { /* ignore */ }
        }
      }
      setBackfillDone(true);
    } catch (err) {
      setBackfillEvents((prev) => [...prev, { step: "error", status: "error", message: String(err) }]);
    } finally {
      setBackfillRunning(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!result) return;
    const { utils, writeFile } = await import("xlsx");
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(result.balanceSheet.items.map((i) => ({
      Tag: i.tag, Label: i.label, "Value (M USD)": i.value, Period: i.period, Source: i.source,
    }))), "Balance Sheet");
    utils.book_append_sheet(wb, utils.json_to_sheet([
      { Metric: "Total Assets", Value: result.balanceSheet.totalAssets },
      { Metric: "Total Equity", Value: result.balanceSheet.totalEquity },
      { Metric: "Total Debt", Value: result.debtStructure.totalDebt },
      { Metric: "Net Debt", Value: result.debtStructure.netDebt },
      { Metric: "Cash", Value: result.balanceSheet.cashAndEquivalents },
    ]), "Capital");
    utils.book_append_sheet(wb, utils.json_to_sheet(Object.entries(result.cashFlow).map(([k, v]) => ({ Metric: k, "Value (M USD)": v }))), "Cash Flow");
    utils.book_append_sheet(wb, utils.json_to_sheet(Object.entries(result.ratios).map(([k, v]) => ({ Ratio: k, Value: v }))), "Ratios");
    utils.book_append_sheet(wb, utils.json_to_sheet([
      { Metric: "Verdict", Value: result.dividendAnalysis.verdict },
      { Metric: "Payout NI %", Value: result.dividendAnalysis.payoutRatioNI },
      { Metric: "Payout FCF %", Value: result.dividendAnalysis.payoutRatioFCF },
      { Metric: "FCF Coverage", Value: result.dividendAnalysis.fcfCoverageYears },
      { Metric: "Cash Coverage (yrs)", Value: result.dividendAnalysis.cashCoverageYears },
    ]), "Dividend");
    const name = result.meta.ticker ?? result.meta.fileName ?? "analysis";
    writeFile(wb, `${name}-analysis.xlsx`);
  }, [result]);

  /* ───── IDLE SCREEN ───── */
  if (phase === "idle") {
    return (
      <>
        <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col items-center justify-center gap-8 px-4 py-8 sm:gap-10">
          <div className="w-full max-w-lg space-y-4 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-elevation ring-1 ring-slate-200/80 sm:h-16 sm:w-16">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 sm:h-12 sm:w-12">
                <Sparkles className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">Financial Analysis</h1>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">Extract capital structure &amp; dividend health from SEC filings or 10-Q PDFs.</p>
          </div>

          <form
            className="relative flex w-full max-w-lg items-center rounded-full border border-slate-200/90 bg-white shadow-elevation transition focus-within:border-primary/35 focus-within:ring-4 focus-within:ring-primary/10"
            onSubmit={(e) => { e.preventDefault(); analyzeViaSec(ticker); }}
          >
            <Search className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400 sm:left-5" />
            <input type="text" placeholder="Ticker (e.g. AAPL, MSFT)…" value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="h-12 w-full rounded-full bg-transparent pl-11 pr-28 text-sm text-slate-900 outline-none placeholder:text-slate-400 sm:h-14 sm:pl-12 sm:pr-32 sm:text-base" />
            <button type="submit" disabled={!ticker.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[oklch(0.48_0.16_290)] px-4 text-xs font-semibold text-white shadow-subtle transition hover:opacity-95 disabled:opacity-40 sm:right-2 sm:top-2 sm:bottom-2 sm:gap-2 sm:px-5 sm:text-sm">
              Analyze <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </form>

          <div className="flex w-full max-w-lg items-center gap-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:text-xs">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200" />
            <span>or upload PDF</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200" />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full max-w-lg cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-10",
              dragOver ? "border-primary bg-primary/[0.06] shadow-elevation" : "border-slate-200 bg-white/80 shadow-subtle hover:border-primary/35 hover:bg-white"
            )}
          >
            <div className={cn(
              "mb-1 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors sm:h-14 sm:w-14",
              dragOver ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
            )}>
              <FileUp className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-900 sm:text-base">Drop your 10-Q PDF here</p>
            <p className="text-xs text-slate-500 sm:text-sm">AI-powered extraction — processed server-side for accuracy.</p>
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </div>

          {/* Historical Backfill */}
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-subtle">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-slate-900">Load Historical Quarters</h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">12 qtrs</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">Backfill up to 12 quarters of SEC data for any ticker — stores all quarters in the Data Source.</p>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); runBackfill(backfillTicker); }}
            >
              <input
                type="text"
                placeholder="Ticker (e.g. TSN, HRL)…"
                value={backfillTicker}
                onChange={(e) => setBackfillTicker(e.target.value.toUpperCase())}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              <button
                type="submit"
                disabled={!backfillTicker.trim() || backfillRunning}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-40"
              >
                {backfillRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                {backfillRunning ? "Loading…" : "Load"}
              </button>
            </form>
            {backfillEvents.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
                {backfillEvents.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 py-0.5">
                    {e.status === "done" && <CheckCircle className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />}
                    {e.status === "error" && <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />}
                    {e.status === "running" && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-primary" />}
                    {e.status === "skipped" && <span className="mt-0.5 h-3 w-3 shrink-0 text-center text-[8px] text-slate-400">—</span>}
                    <span className="text-[11px] text-slate-600">{e.message}</span>
                  </div>
                ))}
                {backfillDone && (
                  <div className="mt-1 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    ✓ Complete — check Data Source page for results
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 pb-8">
          <FinanceQuiz />
        </div>
        <AnalysisChatPanel analysis={null} />
      </>
    );
  }

  const hasPdf = pdfFile !== null;

  /* ───── PDF MODE: Horizontal pipeline at top + resizable PDF | Dashboard ───── */
  if (hasPdf && showPdf) {
    return (
      <div className="relative flex h-dvh flex-col overflow-hidden">
        {/* Toolbar + horizontal pipeline */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200/80 bg-white px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle transition hover:border-slate-300 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New analysis
            </button>
            <span className="text-[11px] text-slate-500">{pdfFile?.name}</span>
          </div>
          <AgentWorkflow
            events={events}
            isRunning={phase === "analyzing"}
            horizontal
            status={workflowStatus}
            errorMessage={error}
          />
        </div>

        {/* Resizable: PDF | Dashboard */}
        <div ref={resizeContainerRef} className="flex min-h-0 flex-1 overflow-hidden">
          {/* PDF — resizable width */}
          <div
            className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
            style={{ flex: `0 0 ${pdfWidthPct}%` }}
          >
            <PdfViewer file={pdfFile} fullHeight />
          </div>

          {/* Resize handle */}
          <button
            type="button"
            onMouseDown={handleResizeStart}
            className="flex w-2 shrink-0 cursor-col-resize items-stretch border-l border-r border-slate-200/80 bg-slate-100/80 transition-colors hover:bg-primary/20 hover:border-primary/30"
            aria-label="Resize PDF panel"
          >
            <span className="mx-auto w-0.5 self-stretch bg-slate-300" />
          </button>

          {/* Analysis dashboard */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto border-l border-slate-200/80 bg-white p-3 sm:p-4">
            {result && phase === "done" ? (
              <AnalysisDashboard result={result} onExport={handleExport} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-600">
                    {phase === "analyzing" ? "Analyzing…" : "Analysis will appear here"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {phase === "analyzing" ? "Extracting data from PDF" : "Upload a PDF to get started"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "error" && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-800 shadow-lg">
            <p className="text-xs font-bold">{error}</p>
          </div>
        )}

        <AnalysisChatPanel analysis={result} disableAutoSummary />
      </div>
    );
  }

  /* ───── SEC MODE or PDF hidden: Original layout ───── */
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle transition hover:border-slate-300 hover:text-slate-900">
          <RotateCcw className="h-3.5 w-3.5" />
          New analysis
        </button>
        {hasPdf && (
          <button onClick={() => setShowPdf(!showPdf)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-subtle transition",
              showPdf ? "border-primary/30 bg-primary/5 text-primary" : "border-slate-200 bg-white text-slate-600"
            )}>
            <FileText className="h-3.5 w-3.5" />
            {showPdf ? "Hide PDF" : "Show PDF"}
          </button>
        )}
      </div>

      <div className={cn(
        "grid items-start gap-4 sm:gap-5",
        result && "lg:grid-cols-[280px_1fr] grid-cols-1",
        !result && "mx-auto max-w-xl grid-cols-1",
      )}>
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-elevation sm:p-4">
            <AgentWorkflow
              events={events}
              isRunning={phase === "analyzing"}
              status={workflowStatus}
              errorMessage={error}
            />
          </div>
          <AnalysisChatPanel analysis={result} inline />
        </div>

        {result && phase === "done" && (
          <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-elevation sm:p-5">
            <AnalysisDashboard result={result} onExport={handleExport} />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <FinanceQuiz />
      </div>

      {phase === "error" && (
        <div className="mx-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-red-100 bg-red-50/80 p-4 text-red-800">
          <p className="text-sm font-bold">Analysis failed</p>
          <p className="text-xs opacity-90">{error}</p>
        </div>
      )}

      <AnalysisChatPanel analysis={result} />
    </div>
  );
}
