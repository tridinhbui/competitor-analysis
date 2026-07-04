"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { FullAnalysis, StepEvent } from "@/types/analysis";
import { AgentWorkflow } from "./AgentWorkflow";
import { AnalysisDashboard, type TraceMetric } from "./AnalysisDashboard";
import { AnalysisChatPanel } from "./AnalysisChatPanel";
import { PdfViewer, type TraceTarget } from "./PdfViewer";
import { AnalyzeExtractPanel } from "./AnalyzeExtractPanel";
import { analyzePdf } from "@/lib/pdfAnalysis";
import {
  isFullAnalysisPayload,
  isStepEventPayload,
} from "@/lib/sseClient";
import { RotateCcw, FileText } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { normalizeCompanyName, resolveTicker } from "@/lib/filingIdentity";
type Phase = "idle" | "analyzing" | "done" | "error";
const ANALYZE_SESSION_KEY = "analyze-latest-session-v2";
const ANALYZE_PDF_DB = "analyze-pdf-cache-v1";
const ANALYZE_PDF_STORE = "files";
const ANALYZE_PDF_KEY = "latest-pdf";
let latestPdfFileMemory: File | null = null;

type PersistedAnalyzeSession = {
  phase: Extract<Phase, "done" | "error">;
  result: FullAnalysis | null;
  events: StepEvent[];
  error: string;
  persistNotice: { kind: "ok" | "warn"; text: string } | null;
};

interface CachedPdfRecord {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

function openPdfDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(ANALYZE_PDF_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ANALYZE_PDF_STORE)) {
        db.createObjectStore(ANALYZE_PDF_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open PDF cache"));
  });
}

async function cachePdfFile(file: File): Promise<void> {
  if (typeof window === "undefined") return;
  latestPdfFileMemory = file;
  const db = await openPdfDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ANALYZE_PDF_STORE, "readwrite");
    const store = tx.objectStore(ANALYZE_PDF_STORE);
    const record: CachedPdfRecord = {
      name: file.name,
      type: file.type || "application/pdf",
      lastModified: file.lastModified || Date.now(),
      blob: file,
    };
    store.put(record, ANALYZE_PDF_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to cache PDF file"));
  });
  db.close();
}

async function loadCachedPdfFile(): Promise<File | null> {
  if (typeof window === "undefined") return null;
  if (latestPdfFileMemory) return latestPdfFileMemory;
  const db = await openPdfDb();
  const record = await new Promise<CachedPdfRecord | null>((resolve, reject) => {
    const tx = db.transaction(ANALYZE_PDF_STORE, "readonly");
    const store = tx.objectStore(ANALYZE_PDF_STORE);
    const req = store.get(ANALYZE_PDF_KEY);
    req.onsuccess = () => resolve((req.result as CachedPdfRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to read cached PDF file"));
  });
  db.close();
  if (!record?.blob) return null;
  return new File([record.blob], record.name, {
    type: record.type || "application/pdf",
    lastModified: record.lastModified || Date.now(),
  });
}

async function clearCachedPdfFile(): Promise<void> {
  if (typeof window === "undefined") return;
  latestPdfFileMemory = null;
  const db = await openPdfDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ANALYZE_PDF_STORE, "readwrite");
    const store = tx.objectStore(ANALYZE_PDF_STORE);
    store.delete(ANALYZE_PDF_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear cached PDF file"));
  });
  db.close();
}

export function TenQDropAnalyzer() {
  const searchParams = useSearchParams();
  const restoreHistoryId = searchParams.get("historyId");
  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [result, setResult] = useState<FullAnalysis | null>(null);
  const [error, setError] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showPdf, setShowPdf] = useState(true);
  const [pdfWidthPct, setPdfWidthPct] = useState(50);
  const [persistNotice, setPersistNotice] = useState<{
    kind: "ok" | "warn";
    text: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resizeContainerRef = useRef<HTMLDivElement>(null);
  const savedResultKeyRef = useRef<string | null>(null);
  const extractedFilingTextRef = useRef<string | null>(null);
  const [traceTarget, setTraceTarget] = useState<TraceTarget | null>(null);
  const aiEnabled = true;

  useEffect(() => {
    if (!restoreHistoryId) return;
    let cancelled = false;

    void (async () => {
      try {
        setPhase("analyzing");
        const res = await fetchWithAuth(`/api/history/${restoreHistoryId}`);
        if (cancelled) return;
        if (!res.ok) {
          setError("Unable to restore this history entry.");
          setPhase("error");
          return;
        }

        const data = (await res.json()) as { analysis?: FullAnalysis; events?: StepEvent[] | null; title?: string };
        if (!data.analysis) {
          setError("This history entry has no saved analysis.");
          setPhase("error");
          return;
        }

        setResult(data.analysis);
        setEvents(Array.isArray(data.events) ? data.events.filter(isStepEventPayload) : []);
        setError("");
        setPersistNotice({ kind: "ok", text: "Restored from History. You can continue in Analyze." });
        setPdfFile(null);
        setShowPdf(false);
        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to restore this history entry.");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restoreHistoryId]);

  useEffect(() => {
    if (restoreHistoryId) return;
    if (typeof window === "undefined") return;
    void (async () => {
      try {
        const raw = window.localStorage.getItem(ANALYZE_SESSION_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<PersistedAnalyzeSession>;
        if (parsed.result && isFullAnalysisPayload(parsed.result)) {
          setResult(parsed.result);
          setEvents(Array.isArray(parsed.events) ? parsed.events.filter(isStepEventPayload) : []);
          setError(typeof parsed.error === "string" ? parsed.error : "");
          setPersistNotice(parsed.persistNotice && (parsed.persistNotice.kind === "ok" || parsed.persistNotice.kind === "warn")
            ? parsed.persistNotice
            : null);
          setPhase(parsed.phase === "error" ? "error" : "done");

          const restoredPdf = await loadCachedPdfFile().catch(() => null);
          if (restoredPdf) {
            latestPdfFileMemory = restoredPdf;
            setPdfFile(restoredPdf);
            setShowPdf(true);
          } else {
            setShowPdf(false);
          }
        }
      } catch {
        // Ignore broken local cache and start fresh.
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (phase !== "done" && phase !== "error") return;
    if (!result) return;
    const payload: PersistedAnalyzeSession = {
      phase,
      result,
      events,
      error,
      persistNotice,
    };
    window.localStorage.setItem(ANALYZE_SESSION_KEY, JSON.stringify(payload));
  }, [phase, result, events, error, persistNotice]);

  // Auto-save: Supabase via /api/filings/save for PDF; SEC saved server-side too.
  useEffect(() => {
    if (phase !== "done" || !result) return;
    const resultKey = `${result.meta.source}:${result.meta.ticker ?? ""}:${result.meta.periodEnd ?? ""}`;
    if (savedResultKeyRef.current === resultKey) return;
    savedResultKeyRef.current = resultKey;

    void (async () => {
      if (result.meta.source === "pdf") {
        try {
          const saveResp = await fetch("/api/filings/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticker: result.meta.ticker,
              periodEnd: result.meta.periodEnd,
              source: "pdf",
              workflowOrigin: "analyze",
              analysis: result,
              filingText: extractedFilingTextRef.current,
            }),
          });
          const body = (await saveResp.json().catch(() => ({}))) as {
            analysis?: FullAnalysis;
            error?: string;
          };
          if (!saveResp.ok) {
            setPersistNotice({
              kind: "warn",
              text:
                body.error ??
                `Cloud save failed (HTTP ${saveResp.status}). Fix Supabase or .env.local and try saving again.`,
            });
          } else {
            setPersistNotice({
              kind: "ok",
              text: "Filing saved to the database.",
            });
            if (body.analysis) setResult(body.analysis);
          }
        } catch (saveErr) {
          console.warn("[filings/save] failed to persist PDF analysis", saveErr);
          setPersistNotice({
            kind: "warn",
            text: "Could not reach the server to save. Try again when you are online and the API is reachable.",
          });
        }
      } else {
        setPersistNotice({
          kind: "ok",
          text: "Analysis complete. SEC filing should be on the server if Supabase is configured.",
        });
      }

      const companyName = result.meta.companyName ?? result.meta.ticker ?? "Unknown";
      const quarter = result.meta.periodEnd ? result.meta.periodEnd.slice(0, 7) : "";
      fetchWithAuth("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: result.meta.ticker ?? null,
          companyName,
          source: result.meta.source ?? "sec",
          workflowOrigin: result.meta.workflowOrigin ?? "analyze",
          periodEnd: result.meta.periodEnd ?? null,
          quarterLabel: quarter,
          analysis: result,
          events,
        }),
      }).catch(() => {});
    })();
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ANALYZE_SESSION_KEY);
    }
    void clearCachedPdfFile().catch(() => {});
    savedResultKeyRef.current = null;
    extractedFilingTextRef.current = null;
    setPersistNotice(null);
    setPhase("idle");
    setEvents([]);
    setResult(null);
    setError("");
    setPdfFile(null);
    setShowPdf(true);
  }, []);

  const analyzePdfFile = useCallback(async (file: File) => {
    latestPdfFileMemory = file;
    void cachePdfFile(file).catch(() => {});
    savedResultKeyRef.current = null;
    setPersistNotice(null);
    setPdfFile(file);
    setShowPdf(true);
    setPhase("analyzing");
    setEvents([]);
    setResult(null);
    setError("");
    try {
      const resolveAnalysisMeta = (analysis: FullAnalysis): FullAnalysis => {
        const resolvedTicker = resolveTicker({
          metaTicker: analysis.meta.ticker,
          fileName: file.name,
          companyName: analysis.meta.companyName,
        });
        const resolvedCompanyName = normalizeCompanyName({
          candidate: analysis.meta.companyName,
          fileName: file.name,
          ticker: resolvedTicker,
        });
        return {
          ...analysis,
          meta: {
            ...analysis.meta,
            ticker: resolvedTicker,
            fileName: analysis.meta.fileName ?? file.name,
            companyName: resolvedCompanyName,
          },
        };
      };

      const analysis = await analyzePdf(
        file,
        (evt) => setEvents((prev) => [...prev, evt]),
        {
          useAI: aiEnabled,
          onExtractedText: (text) => {
            extractedFilingTextRef.current = text;
          },
          onPartial: (partial) => {
            setResult(resolveAnalysisMeta(partial));
          },
        }
      );

      setResult(resolveAnalysisMeta(analysis));
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

  /* ───── IDLE: PDF extract entry only ───── */
  if (phase === "idle") {
    return (
      <AnalyzeExtractPanel
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
          {persistNotice?.kind === "warn" && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-[11px] leading-snug",
                "border-amber-200 bg-amber-50 text-amber-950"
              )}
            >
              {persistNotice.text}
            </div>
          )}
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
            {result && (phase === "done" || phase === "analyzing") ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                {phase === "analyzing" && (
                  <div className="shrink-0 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[11px] font-medium text-primary">
                    Live preview — numbers update as extraction completes.
                  </div>
                )}
                <AnalysisDashboard
                  result={result}
                  onExport={phase === "done" ? handleExport : undefined}
                  onTraceMetric={(m: TraceMetric) => setTraceTarget(m)}
                />
              </div>
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
      {persistNotice?.kind === "warn" && (
        <div
          className={cn(
            "rounded-xl border px-4 py-2.5 text-xs leading-snug",
            "border-amber-200 bg-amber-50 text-amber-950"
          )}
        >
          {persistNotice.text}
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

        {result && (phase === "done" || phase === "analyzing") && (
          <div className="min-w-0 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-elevation sm:p-5">
            {phase === "analyzing" && (
              <div className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[11px] font-medium text-primary">
                Live preview — numbers update as extraction completes.
              </div>
            )}
            <AnalysisDashboard
              result={result}
              onExport={phase === "done" ? handleExport : undefined}
              onTraceMetric={hasPdf ? (m: TraceMetric) => setTraceTarget(m) : undefined}
            />
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
