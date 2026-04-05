"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, Minimize2, FileText, X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// pdfjs-dist v5 uses Object.defineProperty on ESM module internals which
// webpack cannot handle when bundling. Using /* webpackIgnore: true */ tells
// webpack to emit a native browser import() instead of bundling the module.
// The file is served directly from /public/pdf.min.mjs.
// ---------------------------------------------------------------------------

interface PdfjsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (ctx: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
}

interface PdfViewport {
  width: number;
  height: number;
}

let _pdfjsPromise: Promise<PdfjsLib> | null = null;

async function loadPdfjs(): Promise<PdfjsLib> {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = (async () => {
    // webpackIgnore tells webpack to leave this import alone — browser handles it natively
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
    const lib: PdfjsLib = mod.default ?? mod;
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return lib;
  })();
  _pdfjsPromise.catch(() => { _pdfjsPromise = null; });
  return _pdfjsPromise;
}

// ---------------------------------------------------------------------------

interface Props {
  file: File | null;
  /** When true, fills parent height (for fixed dashboard layout) */
  fullHeight?: boolean;
}

export function PdfViewer({ file, fullHeight }: Props) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load PDF document when file changes
  useEffect(() => {
    if (!file) { setPdfDoc(null); setTotalPages(0); setCurrentPage(1); setError(null); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const lib = await loadPdfjs();
        const buffer = await file.arrayBuffer();
        const doc = await lib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF");
        console.error("PDF load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  // Re-render page whenever doc / page / scale changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // Resize canvas — also clears it
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (cancelled) return;
        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err) {
        if (!cancelled) console.error("Page render error:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]);

  const prevPage = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setCurrentPage((p) => Math.min(totalPages, p + 1)), [totalPages]);

  if (!file) return null;

  return (
    <div className={cn(
      "flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-elevation transition-all duration-300",
      fullHeight && "h-full min-h-0",
      expanded && "fixed inset-4 z-50"
    )}>
      {expanded && (
        <div className="fixed inset-0 -z-10 bg-slate-900/40 backdrop-blur-sm" onClick={() => setExpanded(false)} />
      )}

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-slate-700 sm:text-sm">{file.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-[11px] tabular-nums text-slate-600">
            {currentPage}/{totalPages || "\u2014"}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[36px] text-center text-[10px] tabular-nums text-slate-500">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60"
            aria-label={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <button onClick={() => setExpanded(false)} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={canvasContainerRef}
        className={cn(
          "flex flex-1 items-start justify-center overflow-auto bg-slate-100/50 p-2 sm:p-4",
          fullHeight ? "min-h-0" : "max-h-[350px] sm:max-h-[500px]"
        )}
      >
        {loading && (
          <div className="flex h-48 w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
              <span className="text-xs">Loading PDF…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex h-48 w-full items-center justify-center">
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <canvas
            ref={canvasRef}
            className="rounded border border-slate-200 bg-white shadow-sm"
          />
        )}
      </div>

      {/* Page strip */}
      {totalPages > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/50 px-3 py-2">
          {Array.from({ length: Math.min(totalPages, 20) }, (_, i) => i + 1).map((pg) => (
            <button
              key={pg}
              onClick={() => setCurrentPage(pg)}
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[10px] tabular-nums transition",
                pg === currentPage ? "bg-primary text-white shadow-subtle" : "text-slate-500 hover:bg-slate-200/60"
              )}
            >
              {pg}
            </button>
          ))}
          {totalPages > 20 && <span className="px-1 text-[10px] text-slate-400">+{totalPages - 20}</span>}
        </div>
      )}
    </div>
  );
}
