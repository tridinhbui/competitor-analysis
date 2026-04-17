"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FullAnalysis, StepEvent } from "@/types/analysis";
import { AgentWorkflow } from "./AgentWorkflow";
import { AnalysisDashboard, type TraceMetric } from "./AnalysisDashboard";
import { AnalysisChatPanel } from "./AnalysisChatPanel";
import { PdfViewer, type TraceTarget } from "./PdfViewer";
import { AnalyzeExtractPanel } from "./AnalyzeExtractPanel";
import { analyzePdf } from "@/lib/pdfAnalysis";
import {
  parseSseBlock,
  isFullAnalysisPayload,
  isStepEventPayload,
} from "@/lib/sseClient";
import { RotateCcw, FileText } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { normalizeCompanyName, resolveTicker } from "@/lib/filingIdentity";

type Phase = "idle" | "analyzing" | "done" | "error";

export function TenQDropAnalyzer() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [result, setResult] = useState<FullAnalysis | null>(null);
  const [error, setError] = useState<string>("");
  const [ticker, setTicker] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showPdf, setShowPdf] = useState(true);
  const [pdfWidthPct, setPdfWidthPct] = useState(50);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeContainerRef = useRef<HTMLDivElement>(null);
  const [traceTarget, setTraceTarget] = useState<TraceTarget | null>(null);

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
      }).catch((saveErr) => {
        console.warn("[filings/save] failed to persist PDF analysis", saveErr);
      });
    }
    // Save to analysis history
    const companyName = result.meta.companyName ?? result.meta.ticker ?? "Unknown";
    const quarter = result.meta.periodEnd ? result.meta.periodEnd.slice(0, 7) : "";
    const title = result.meta.source === "pdf"
      ? `PDF Analysis — ${companyName} ${quarter}`
      : `${companyName} ${quarter} Analysis`;
    fetchWithAuth("/api/history", {
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
      const resolvedTicker = resolveTicker({
        inputTicker: ticker,
        metaTicker: analysis.meta.ticker,
        fileName: file.name,
        companyName: analysis.meta.companyName,
      });
      const resolvedCompanyName = normalizeCompanyName({
        candidate: analysis.meta.companyName,
        fileName: file.name,
        ticker: resolvedTicker,
      });

      const resolvedAnalysis: FullAnalysis = {
        ...analysis,
        meta: {
          ...analysis.meta,
          ticker: resolvedTicker,
          fileName: analysis.meta.fileName ?? file.name,
          companyName: resolvedCompanyName,
        },
      };

      setResult(resolvedAnalysis);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [ticker]);

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

  /* ───── IDLE: extract entry (SEC ticker + PDF only) ───── */
  if (phase === "idle") {
    return (
      <AnalyzeExtractPanel
        ticker={ticker}
        setTicker={setTicker}
        analyzeViaSec={analyzeViaSec}
        dragOver={dragOver}
        setDragOver={setDragOver}
        handleDrop={handleDrop}
        handleFileInput={handleFileInput}
        inputRef={inputRef}
      />
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
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {phase === "analyzing" ? "Extracting tables · mapping debt lines" : phase === "done" ? "Ready to review, export, and chat" : "Awaiting input"}
            </span>
          </div>
          <AgentWorkflow events={events} isRunning={phase === "analyzing"} horizontal />
        </div>

        {/* Resizable: PDF | Dashboard */}
        <div ref={resizeContainerRef} className="flex min-h-0 flex-1 overflow-hidden">
          {/* PDF — resizable width */}
          <div
            className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden"
            style={{ flex: `0 0 ${pdfWidthPct}%` }}
          >
            <PdfViewer file={pdfFile} fullHeight traceTarget={traceTarget} onClearTrace={() => setTraceTarget(null)} />
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
              <AnalysisDashboard result={result} onExport={handleExport} onTraceMetric={(m: TraceMetric) => setTraceTarget(m)} />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-600">
                    {phase === "analyzing" ? "Analyzing and structuring filing data…" : "Analysis will appear here"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {phase === "analyzing" ? "Parsing pages, extracting tables, and mapping statement lines." : "Upload a PDF to start extraction."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === "error" && (
          <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-800 shadow-lg">
            <p className="text-xs font-bold">{error}</p>
            <p className="text-[11px] opacity-90">Try another ticker or upload a different 10-Q PDF.</p>
          </div>
        )}

        <AnalysisChatPanel analysis={result} disableAutoSummary />
      </div>
    );
  }

  /* ───── SEC MODE or PDF hidden: Original layout ───── */
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-6">
      {phase === "analyzing" && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-2 text-xs text-primary">
          Processing filing stream: ingesting source, mapping statements, and preparing dashboard blocks.
        </div>
      )}
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
            <AgentWorkflow events={events} isRunning={phase === "analyzing"} />
          </div>
          <AnalysisChatPanel analysis={result} inline />
        </div>

        {result && phase === "done" && (
          <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-elevation sm:p-5">
            <AnalysisDashboard result={result} onExport={handleExport} />
          </div>
        )}
      </div>

      {phase === "error" && (
        <div className="mx-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border border-red-100 bg-red-50/80 p-4 text-red-800">
          <p className="text-sm font-bold">Analysis failed</p>
          <p className="text-xs opacity-90">{error}</p>
          <p className="text-xs opacity-90">Check ticker format, retry, or switch to PDF upload.</p>
        </div>
      )}
    </div>
  );
}
