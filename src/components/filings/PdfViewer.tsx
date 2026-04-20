"use client";

/* Canvas PDF preview: pdf.js loads from /public when this component mounts with a file.
   Plain-text extraction for the pipeline lives in src/lib/pdfAnalysis.ts (same /public scripts, separate entry). */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, Minimize2, FileText, X,
  Search, ArrowUp, ArrowDown, XCircle,
} from "lucide-react";

// ─── pdfjs types ─────────────────────────────────────────────────────────────

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
  render: (ctx: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
  getTextContent: () => Promise<PdfTextContent>;
}

interface PdfViewport { width: number; height: number; }
interface PdfTextContent { items: PdfTextItem[]; }
interface PdfTextItem { str: string; transform: number[]; width: number; height: number; }

// ─── public types ────────────────────────────────────────────────────────────

export interface TraceTarget {
  key: string;
  label: string;
  value?: number | null;
  sourceHint?: string;
}

export interface TraceCandidate {
  metricKey: string;
  page: number;
  rowBbox: { x: number; y: number; width: number; height: number };
  tokenBoxes: Array<{ x: number; y: number; width: number; height: number; text: string; isMatch: boolean }>;
  score: number;
  confidence: "high" | "medium" | "low";
  source: "heuristic" | "ai-hint" | "fallback-search";
}

// ─── alias dictionary ────────────────────────────────────────────────────────

const METRIC_ALIASES: Record<string, string[]> = {
  "Revenue":           ["revenue", "revenues", "net revenue", "net revenues", "net sales", "total revenue", "total net sales", "sales"],
  "Gross Profit":      ["gross profit", "gross margin"],
  "Operating Income":  ["operating income", "income from operations", "operating profit", "operating earnings", "income (loss) from operations"],
  "Net Income":        ["net income", "net earnings", "net income attributable", "net income loss", "net earnings attributable", "net income (loss)"],
  "Total Assets":      ["total assets"],
  "Total Equity":      ["total equity", "total stockholders", "total shareholders", "stockholders equity", "shareholders equity"],
  "Total Debt":        ["total debt"],
  "Net Debt":          ["net debt"],
  "Cash & Equivalents":["cash and cash equivalents", "cash and equivalents", "cash & equivalents"],
  "Operating CF":      ["operating cash flow", "cash from operations", "cash provided by operating", "net cash provided by operating"],
  "Free Cash Flow":    ["free cash flow"],
  "EBITDA":            ["ebitda"],
  "Cost of Revenue":   ["cost of revenue", "cost of sales", "cost of goods sold", "cogs"],
};

// ─── row reconstruction engine ───────────────────────────────────────────────

const Y_TOLERANCE = 3.5;

interface TokenBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface ReconstructedRow {
  tokens: TokenBox[];
  rowText: string;
  bbox: { x: number; y: number; width: number; height: number };
  yKey: number;
}

function reconstructRows(items: PdfTextItem[]): ReconstructedRow[] {
  const buckets: Array<{ yKey: number; tokens: TokenBox[] }> = [];

  for (const item of items) {
    if (!item.str?.trim()) continue;
    const tx = item.transform[4];
    const ty = item.transform[5];
    const token: TokenBox = { x: tx, y: ty, width: item.width, height: item.height || 10, text: item.str };

    const existing = buckets.find(b => Math.abs(b.yKey - ty) <= Y_TOLERANCE);
    if (existing) {
      existing.tokens.push(token);
    } else {
      buckets.push({ yKey: ty, tokens: [token] });
    }
  }

  return buckets
    .sort((a, b) => b.yKey - a.yKey)
    .map(bucket => {
      const sorted = bucket.tokens.sort((a, b) => a.x - b.x);
      const rowText = sorted.map(t => t.text).join(" ").toLowerCase();
      const minX = Math.min(...sorted.map(t => t.x));
      const maxRight = Math.max(...sorted.map(t => t.x + t.width));
      const maxH = Math.max(...sorted.map(t => t.height));
      return {
        tokens: sorted,
        rowText,
        bbox: { x: minX, y: bucket.yKey, width: maxRight - minX, height: maxH },
        yKey: bucket.yKey,
      };
    });
}

// ─── scoring ─────────────────────────────────────────────────────────────────

function normalizeNumber(v: number): string[] {
  const abs = Math.abs(v);
  const variants: string[] = [
    abs.toLocaleString("en-US"),
    abs.toString(),
    abs.toFixed(0),
  ];
  if (abs >= 1000) variants.push(Math.round(abs).toLocaleString("en-US"));
  const inK = abs / 1000;
  if (inK >= 1) variants.push(`${inK.toFixed(0)},`);
  return [...new Set(variants)];
}

function scoreRow(row: ReconstructedRow, target: TraceTarget): number {
  const aliases = METRIC_ALIASES[target.label] ?? [target.label.toLowerCase()];
  let score = 0;

  // Label match
  for (const alias of aliases) {
    if (row.rowText.includes(alias)) {
      score += alias === target.label.toLowerCase() ? 50 : 40;
      if (row.rowText.startsWith(alias) || row.rowText.match(new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))) {
        score += 15;
      }
      break;
    }
  }
  if (score === 0) return 0;

  // Numeric consistency
  if (target.value != null && target.value !== 0) {
    const numVariants = normalizeNumber(target.value);
    for (const v of numVariants) {
      if (row.rowText.includes(v)) { score += 30; break; }
    }
  }

  // Penalize very short rows (header fragments)
  if (row.tokens.length < 2) score -= 10;
  // Penalize rows that look like footnotes/notes
  if (row.rowText.match(/^\(\d+\)|^note\s|^see\s/i)) score -= 20;
  // Bonus for rows with $ sign or parenthesized numbers
  if (row.rowText.includes("$") || row.rowText.match(/\(\d[\d,]*\)/)) score += 5;

  return Math.max(0, score);
}

function markMatchingTokens(tokens: TokenBox[], target: TraceTarget): Array<TokenBox & { isMatch: boolean }> {
  const aliases = METRIC_ALIASES[target.label] ?? [target.label.toLowerCase()];
  const numVariants = target.value != null && target.value !== 0 ? normalizeNumber(target.value) : [];

  return tokens.map(t => {
    const lower = t.text.toLowerCase();
    const isLabelMatch = aliases.some(a => lower.includes(a) || a.includes(lower));
    const isNumMatch = numVariants.some(v => lower.includes(v) || lower.replace(/[,$()]/g, "").includes(v.replace(/[,$()]/g, "")));
    return { ...t, isMatch: isLabelMatch || isNumMatch };
  });
}

// ─── search engine ───────────────────────────────────────────────────────────

const SCORE_THRESHOLD = 35;

async function searchDocForTarget(
  doc: PdfDoc,
  target: TraceTarget,
  totalPages: number,
): Promise<TraceCandidate[]> {
  const hintPage = parsePageFromSource(target.sourceHint);
  const candidates: TraceCandidate[] = [];

  const pagesToSearch = hintPage
    ? [hintPage, ...Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p !== hintPage)]
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  for (const pageNum of pagesToSearch) {
    try {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const rows = reconstructRows(content.items as PdfTextItem[]);

      for (const row of rows) {
        const s = scoreRow(row, target);
        if (s < SCORE_THRESHOLD) continue;

        const markedTokens = markMatchingTokens(row.tokens, target);

        candidates.push({
          metricKey: target.key,
          page: pageNum,
          rowBbox: row.bbox,
          tokenBoxes: markedTokens,
          score: s + (pageNum === hintPage ? 10 : 0),
          confidence: s >= 70 ? "high" : s >= 50 ? "medium" : "low",
          source: hintPage === pageNum ? "ai-hint" : "heuristic",
        });
      }
    } catch { /* skip page */ }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ─── pdfjs loader ────────────────────────────────────────────────────────────

let _pdfjsPromise: Promise<PdfjsLib> | null = null;

async function loadPdfjs(): Promise<PdfjsLib> {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = (async () => {
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

function parsePageFromSource(hint?: string): number | null {
  if (!hint) return null;
  const m = hint.match(/PDF:p(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// ─── component ───────────────────────────────────────────────────────────────

interface Props {
  file: File | null;
  fullHeight?: boolean;
  traceTarget?: TraceTarget | null;
  onClearTrace?: () => void;
}

export function PdfViewer({ file, fullHeight, traceTarget, onClearTrace }: Props) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);

  const [candidates, setCandidates] = useState<TraceCandidate[]>([]);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [noMatch, setNoMatch] = useState(false);

  const activeCand = candidates[candidateIdx] ?? null;
  const pagesWithMatches = useMemo(() => new Set(candidates.map(c => c.page)), [candidates]);

  // Load PDF
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Render page
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
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (cancelled) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        if (!cancelled) console.error("Page render error:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]);

  // Draw highlight overlay
  useEffect(() => {
    const hCanvas = highlightCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!hCanvas || !mainCanvas) return;

    hCanvas.width = mainCanvas.width;
    hCanvas.height = mainCanvas.height;
    const ctx = hCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, hCanvas.width, hCanvas.height);

    const pageCands = candidates.filter(c => c.page === currentPage);
    if (pageCands.length === 0) return;

    for (const cand of pageCands) {
      const isActive = cand === activeCand;

      // Primary: row bbox (light yellow)
      const rb = cand.rowBbox;
      const rx = rb.x * scale;
      const rw = rb.width * scale;
      const rh = (rb.height + 6) * scale;
      const ry = hCanvas.height - (rb.y + rb.height + 3) * scale;

      ctx.fillStyle = isActive ? "rgba(250, 204, 21, 0.25)" : "rgba(250, 204, 21, 0.12)";
      ctx.fillRect(rx - 4 * scale, ry, rw + 8 * scale, rh);

      if (isActive) {
        ctx.strokeStyle = "rgba(234, 179, 8, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(rx - 4 * scale, ry, rw + 8 * scale, rh);
      }

      // Secondary: matched token highlights (darker)
      for (const tk of cand.tokenBoxes) {
        if (!tk.isMatch) continue;
        const tx = tk.x * scale;
        const tw = tk.width * scale;
        const th = (tk.height + 4) * scale;
        const ty = hCanvas.height - (tk.y + tk.height + 2) * scale;

        ctx.fillStyle = isActive ? "rgba(250, 204, 21, 0.50)" : "rgba(250, 204, 21, 0.30)";
        ctx.fillRect(tx, ty, tw, th);
      }
    }
  }, [candidates, candidateIdx, currentPage, scale, activeCand]);

  // Search when traceTarget changes
  useEffect(() => {
    if (!traceTarget || !pdfDoc) {
      setCandidates([]);
      setCandidateIdx(0);
      setNoMatch(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setNoMatch(false);

    (async () => {
      const results = await searchDocForTarget(pdfDoc, traceTarget, totalPages);
      if (cancelled) return;

      setCandidates(results);
      setSearching(false);

      if (results.length > 0) {
        setCandidateIdx(0);
        setCurrentPage(results[0].page);
        setNoMatch(false);
      } else {
        setNoMatch(true);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceTarget, pdfDoc, totalPages]);

  const prevPage = useCallback(() => setCurrentPage(p => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setCurrentPage(p => Math.min(totalPages, p + 1)), [totalPages]);

  const goNextMatch = useCallback(() => {
    if (candidates.length === 0) return;
    const next = (candidateIdx + 1) % candidates.length;
    setCandidateIdx(next);
    setCurrentPage(candidates[next].page);
  }, [candidates, candidateIdx]);

  const goPrevMatch = useCallback(() => {
    if (candidates.length === 0) return;
    const prev = (candidateIdx - 1 + candidates.length) % candidates.length;
    setCandidateIdx(prev);
    setCurrentPage(candidates[prev].page);
  }, [candidates, candidateIdx]);

  const clearTrace = useCallback(() => {
    setCandidates([]);
    setCandidateIdx(0);
    setNoMatch(false);
    onClearTrace?.();
  }, [onClearTrace]);

  if (!file) return null;

  const hasTrace = traceTarget != null;
  const confBadge = activeCand ? {
    high:   { label: "High",   cls: "bg-emerald-100 text-emerald-700" },
    medium: { label: "Medium", cls: "bg-amber-100 text-amber-700" },
    low:    { label: "Low",    cls: "bg-red-100 text-red-700" },
  }[activeCand.confidence] : null;

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
          <button onClick={prevPage} disabled={currentPage <= 1} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60 disabled:opacity-30" aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-[11px] tabular-nums text-slate-600">{currentPage}/{totalPages || "\u2014"}</span>
          <button onClick={nextPage} disabled={currentPage >= totalPages} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60 disabled:opacity-30" aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <button onClick={() => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(1)))} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-[36px] text-center text-[10px] tabular-nums text-slate-500">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button>
          <div className="mx-1 h-4 w-px bg-slate-200" />
          <button onClick={() => setExpanded(!expanded)} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label={expanded ? "Minimize" : "Maximize"}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <button onClick={() => setExpanded(false)} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>

      {/* Trace bar */}
      {hasTrace && (
        <div className="flex shrink-0 items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-yellow-700" />
          <span className="text-[11px] font-semibold text-yellow-800">
            {searching ? "Scanning rows…" : noMatch ? `No row match for "${traceTarget.label}"` : `"${traceTarget.label}"`}
          </span>
          {!searching && candidates.length > 0 && (
            <>
              <span className="text-[10px] tabular-nums text-yellow-700">
                {candidateIdx + 1}/{candidates.length}
              </span>
              {confBadge && (
                <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", confBadge.cls)}>
                  {confBadge.label}
                </span>
              )}
              {activeCand && activeCand.source === "fallback-search" && (
                <span className="text-[9px] italic text-yellow-600">Approximate</span>
              )}
              {activeCand && activeCand.source !== "fallback-search" && (
                <span className="text-[9px] text-yellow-600">{activeCand.source}</span>
              )}
              <button onClick={goPrevMatch} className="rounded p-0.5 text-yellow-700 hover:bg-yellow-200/60" aria-label="Previous match">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={goNextMatch} className="rounded p-0.5 text-yellow-700 hover:bg-yellow-200/60" aria-label="Next match">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button onClick={clearTrace} className="ml-auto rounded p-0.5 text-yellow-700 hover:bg-yellow-200/60" aria-label="Clear trace">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
          <div className="relative inline-block">
            <canvas ref={canvasRef} className="rounded border border-slate-200 bg-white shadow-sm" />
            <canvas
              ref={highlightCanvasRef}
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        )}
      </div>

      {/* Page strip */}
      {totalPages > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-slate-100 bg-slate-50/50 px-3 py-2">
          {Array.from({ length: Math.min(totalPages, 20) }, (_, i) => i + 1).map(pg => (
            <button
              key={pg}
              onClick={() => setCurrentPage(pg)}
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[10px] tabular-nums transition",
                pg === currentPage ? "bg-primary text-white shadow-subtle" : "text-slate-500 hover:bg-slate-200/60",
                pagesWithMatches.has(pg) && pg !== currentPage && "ring-1 ring-yellow-400 bg-yellow-50 text-yellow-800"
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
