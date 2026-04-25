"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PdfTraceTarget } from "@/lib/pdfTraceResolve";

export type TraceTarget = PdfTraceTarget;
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

export interface TraceCandidate {
  metricKey: string;
  page: number;
  rowBbox: { x: number; y: number; width: number; height: number };
  /** Tight box around the token(s) that match `traceTarget.value` (e.g. one fiscal column). */
  valueBbox: { x: number; y: number; width: number; height: number } | null;
  tokenBoxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    isMatch: boolean;
    isValueMatch?: boolean;
    isLabelMatch?: boolean;
  }>;
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
  "Total Equity":      [
    "total equity",
    "total stockholders",
    "total shareholders",
    "stockholders equity",
    "shareholders equity",
    "stockholders investment",
    "shareholders investment",
    "total stockholders investment",
    "total shareholders investment",
    "shareowners equity",
    "shareowners investment",
    "members equity",
  ],
  "Total Debt":        ["total debt", "total gross debt", "gross debt"],
  "Net Debt":          ["net debt", "total net debt"],
  "Cash & Equivalents":["cash and cash equivalents", "cash and equivalents", "cash & equivalents"],
  "Operating CF":      ["operating cash flow", "cash from operations", "cash provided by operating", "net cash provided by operating"],
  "Free Cash Flow":    ["free cash flow"],
  "EBITDA":            ["ebitda", "ebitda (calculated", "adjusted ebitda"],
  "D&A":               ["depreciation and amortization", "depreciation, depletion and amortization", "depreciation & amortization", "depreciation", "depreciation expense"],
  "D&A Total":         ["depreciation and amortization", "depreciation, depletion and amortization", "depreciation & amortization", "depreciation", "depreciation expense"],
  "Depreciation and Amortization": ["depreciation and amortization", "depreciation, depletion and amortization", "depreciation & amortization", "depreciation", "depreciation expense"],
  "Cost of Revenue":   ["cost of revenue", "cost of sales", "cost of goods sold", "cogs"],
  "Capital Expenditures": ["additions to property, plant and equipment","payments to acquire property", "capital expenditures", "purchases of property"],
  /**
   * `pdfMatchLabel` "Dividends" uses this list. Bare "dividends" must match SCF lines that only say
   * "Dividends"; footnote hits are down-ranked via `scoreRow` (large target + tiny row amount) + page hint.
   */
  Dividends: [
    "payments of dividends",
    "cash dividends paid",
    "dividends paid",
    "cash dividends",
    "dividends",
  ],
  "Dividends Paid": [
    "payments of dividends",
    "cash dividends paid",
    "dividends paid",
    "cash dividends",
    "dividends",
  ],
  "Short-Term Debt":   ["short-term debt", "current portion of long-term debt"],
  "Long-Term Debt":    ["long-term debt", "long term debt"],
  "Return on invested capital": ["return on invested capital", "roic"],

  "PP&E (Net)": [
    "net property, plant and equipment",
    "property, plant and equipment, net",
    "property and equipment, net",
    "property, plant and equipment",
    "net ppe",
    "pp&e",
  ],
  Goodwill: ["goodwill"],
  "Retained Earnings": [
    "retained earnings",
    "accumulated deficit",
    "retained earnings (accumulated deficit)",
  ],
  "Accounts Payable": [
    "accounts payable",
    "trade accounts payable",
    "trade payables",
  ],
  Inventories: ["inventories", "inventory"],
  "Accounts Receivable": [
    "accounts receivable, net",
    "accounts receivable",
    "trade receivables",
  ],
  "Current Assets": ["total current assets"],
  "Current Liabilities": ["total current liabilities"],
};

function labelForPdfSearch(target: PdfTraceTarget): string {
  return (target.pdfMatchLabel?.trim() || target.label).trim();
}

function rowLooksLikeDefinitionOrNarrative(rowText: string): boolean {
  return /ebitda\s+is\s+defined|ebitda\s+represents|net\s+debt\s+to\s+ebitda\s+represents|ratio\s+calculations|reconciliation\s+of\s+(?:net\s+)?(?:debt|ebitda)/i.test(
    rowText
  );
}

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

/** True if combined PDF token text parses to the same number as the dashboard value (e.g. 1,098 ↔ 1098). */
function matchesNumericTarget(combinedRaw: string, absTarget: number): boolean {
  let s = combinedRaw.replace(/[$\s\u00a0]/g, "").trim();
  const paren = /^\(([\d,.]+)\)$/.exec(s);
  if (paren) s = paren[1];
  s = s.replace(/,/g, "");
  if (!s) return false;
  const v = Number.parseFloat(s);
  if (Number.isNaN(v)) return false;
  const t = Math.abs(absTarget);
  if (t >= 1 && t < 1_000_000) {
    return Math.abs(Math.abs(v) - t) < 0.501;
  }
  return Math.abs(v - t) < Math.max(0.0001, t * 0.0005);
}

/**
 * Find the shortest contiguous run of tokens whose joined text parses to the target value.
 * Handles split tokens like "1," + "098" or "$" + "1,098".
 */
function pickContiguousValueTokens(tokens: TokenBox[], value: number | null | undefined): TokenBox[] {
  if (value == null || value === 0 || !Number.isFinite(value)) return [];
  const absTarget = Math.abs(value);
  const n = tokens.length;
  let best: TokenBox[] = [];
  for (let len = 1; len <= Math.min(6, n); len++) {
    for (let i = 0; i + len <= n; i++) {
      const slice = tokens.slice(i, i + len);
      const combined = slice.map((t) => t.text).join("");
      if (matchesNumericTarget(combined, absTarget)) {
        if (best.length === 0 || slice.length < best.length) best = slice;
      }
    }
  }
  return best;
}

function bboxFromTokens(tokens: TokenBox[]): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(...tokens.map((t) => t.x));
  const maxR = Math.max(...tokens.map((t) => t.x + t.width));
  const minY = Math.min(...tokens.map((t) => t.y));
  const maxY = Math.max(...tokens.map((t) => t.y + t.height));
  return { x: minX, y: minY, width: maxR - minX, height: maxY - minY };
}

function scoreRow(row: ReconstructedRow, target: PdfTraceTarget): number {
  const searchLabel = labelForPdfSearch(target);
  const aliases =
    METRIC_ALIASES[searchLabel] ??
    METRIC_ALIASES[target.label] ??
    [searchLabel.toLowerCase()];
  let score = 0;

  for (const alias of aliases) {
    if (row.rowText.includes(alias)) {
      score += alias === searchLabel.toLowerCase() ? 50 : 40;
      if (
        row.rowText.startsWith(alias) ||
        row.rowText.match(new RegExp(`^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      ) {
        score += 15;
      }
      break;
    }
  }
  if (score === 0) return 0;

  const traceBundle =
    `${target.label} ${target.pdfMatchLabel ?? ""} ${target.key ?? ""}`.toLowerCase();
  if (
    traceBundle.includes("dividend") &&
    target.value != null &&
    Number.isFinite(target.value) &&
    Math.abs(target.value) > 100
  ) {
    const nums = row.tokens.map((t) => {
      const x = t.text.replace(/[$\s\u00a0]/g, "").trim();
      const paren = /^\(([\d,.]+)\)$/.exec(x);
      const raw = (paren ? paren[1] : x).replace(/,/g, "");
      const n = parseFloat(raw);
      return Number.isFinite(n) ? Math.abs(n) : NaN;
    }).filter((n) => !Number.isNaN(n));
    const rowMax = nums.length > 0 ? Math.max(...nums) : 0;
    if (rowMax < 50) score -= 40;
  }

  const traceIsCapex =
    traceBundle.includes("capital expenditure") ||
    traceBundle.includes("capex") ||
    traceBundle.includes("additions to property");

  if (traceIsCapex) {
    if (
      /contractual\s+obligation|thereafter|2027|2028|2029|2030|future\s+commit/i.test(
        row.rowText
      )
    ) {
      score -= 60;
    }
    if (
      /approximately|complete\s+buildings|under\s+construction|fiscal\s+2026|expect\s+capital/i.test(
        row.rowText
      )
    ) {
      score -= 50;
    }
  }

  if (target.rowLabelHint) {
    const h = target.rowLabelHint.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 56);
    if (h.length >= 3 && row.rowText.includes(h)) score += 48;
  }

  if (target.value != null && target.value !== 0) {
    const numVariants = normalizeNumber(target.value);
    for (const v of numVariants) {
      if (row.rowText.includes(v)) {
        score += 30;
        break;
      }
    }
    const vt = pickContiguousValueTokens(row.tokens, target.value);
    if (vt.length > 0) score += 22;
  }

  if (row.tokens.length < 2) score -= 10;
  if (row.rowText.match(/^\(\d+\)|^note\s|^see\s/i)) score -= 20;
  if (row.rowText.includes("$") || row.rowText.match(/\(\d[\d,]*\)/)) score += 5;
  if (rowLooksLikeDefinitionOrNarrative(row.rowText)) score -= 55;

  return Math.max(0, score);
}

function markMatchingTokens(
  tokens: TokenBox[],
  target: PdfTraceTarget,
  valueTokens: TokenBox[]
): TraceCandidate["tokenBoxes"] {
  const searchLabel = labelForPdfSearch(target);
  const aliases =
    METRIC_ALIASES[searchLabel] ??
    METRIC_ALIASES[target.label] ??
    [searchLabel.toLowerCase()];
  const numVariants = target.value != null && target.value !== 0 ? normalizeNumber(target.value) : [];
  const valueSet = new Set(valueTokens);

  return tokens.map((t) => {
    const lower = t.text.toLowerCase();
    const isValueMatch = valueSet.has(t);
    const isLabelMatch = aliases.some((a) => lower.includes(a) || a.includes(lower));
    const isNumMatch =
      !isValueMatch &&
      numVariants.some(
        (v) =>
          lower.includes(v) || lower.replace(/[,$()]/g, "").includes(v.replace(/[,$()]/g, ""))
      );
    return {
      ...t,
      isValueMatch,
      isLabelMatch,
      isMatch: isValueMatch || isLabelMatch || isNumMatch,
    };
  });
}

// ─── search engine ───────────────────────────────────────────────────────────

const SCORE_THRESHOLD = 35;

function resolveHintPage(target: PdfTraceTarget, totalPages: number): number | null {
  const fromSource = parsePageFromSource(target.sourceHint);
  if (fromSource != null && fromSource >= 1 && fromSource <= totalPages) return fromSource;
  const ph = target.pageHint;
  if (ph != null && ph >= 1 && ph <= totalPages) return Math.floor(ph);
  return null;
}

async function collectCandidatesForPage(
  doc: PdfDoc,
  pageNum: number,
  target: PdfTraceTarget,
  prioritizedPage: number | null
): Promise<TraceCandidate[]> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const rows = reconstructRows(content.items as PdfTextItem[]);
  const out: TraceCandidate[] = [];
  for (const row of rows) {
    const s = scoreRow(row, target);
    if (s < SCORE_THRESHOLD) continue;
    const valueToks = pickContiguousValueTokens(row.tokens, target.value);
    const valueBbox = valueToks.length > 0 ? bboxFromTokens(valueToks) : null;
    const markedTokens = markMatchingTokens(row.tokens, target, valueToks);
    const onHint = prioritizedPage != null && pageNum === prioritizedPage;
    out.push({
      metricKey: target.key,
      page: pageNum,
      rowBbox: row.bbox,
      valueBbox,
      tokenBoxes: markedTokens,
      score: s + (onHint ? 14 : 0),
      confidence: s >= 70 ? "high" : s >= 50 ? "medium" : "low",
      source: onHint ? "ai-hint" : "heuristic",
    });
  }
  return out;
}

async function searchDocForTarget(
  doc: PdfDoc,
  target: PdfTraceTarget,
  totalPages: number
): Promise<TraceCandidate[]> {
  const hintPage = resolveHintPage(target, totalPages);

  if (hintPage != null) {
    try {
      const onPage = await collectCandidatesForPage(doc, hintPage, target, hintPage);
      onPage.sort((a, b) => b.score - a.score);
      if (onPage.length > 0) {
        const top = onPage[0].score;
        return onPage.filter((c) => c.score >= top - 12).slice(0, 10);
      }
    } catch {
      /* fall through to full scan */
    }
  }

  const all: TraceCandidate[] = [];
  for (let p = 1; p <= totalPages; p++) {
    try {
      all.push(...(await collectCandidatesForPage(doc, p, target, hintPage)));
    } catch {
      /* skip page */
    }
  }
  all.sort((a, b) => b.score - a.score);
  if (all.length === 0) return [];
  const top = all[0].score;
  return all.filter((c) => c.score >= Math.max(SCORE_THRESHOLD, top - 18)).slice(0, 14);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickSearchTokens(tokens: TokenBox[], query: string): TokenBox[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const maxSpan = Math.min(12, tokens.length);
  let best: TokenBox[] = [];

  for (let len = 1; len <= maxSpan; len++) {
    for (let i = 0; i + len <= tokens.length; i++) {
      const slice = tokens.slice(i, i + len);
      const combined = normalizeSearchText(slice.map((token) => token.text).join(" "));
      if (combined.includes(normalizedQuery)) {
        if (best.length === 0 || slice.length < best.length) best = slice;
      }
    }
  }

  if (best.length > 0) return best;

  const words = normalizedQuery.split(" ").filter(Boolean);
  return tokens.filter((token) => {
    const lowered = token.text.toLowerCase();
    return words.some((word) => lowered.includes(word));
  });
}

async function collectTextMatchesForPage(
  doc: PdfDoc,
  pageNum: number,
  query: string,
): Promise<TraceCandidate[]> {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const rows = reconstructRows(content.items as PdfTextItem[]);
  const normalizedQuery = normalizeSearchText(query);
  const out: TraceCandidate[] = [];

  for (const row of rows) {
    if (!row.rowText.includes(normalizedQuery)) continue;
    const matchedTokens = pickSearchTokens(row.tokens, query);
    const markedTokens = row.tokens.map((token) => ({
      ...token,
      isMatch: matchedTokens.includes(token),
    }));
    out.push({
      metricKey: normalizedQuery,
      page: pageNum,
      rowBbox: matchedTokens.length > 0 ? bboxFromTokens(matchedTokens) : row.bbox,
      valueBbox: null,
      tokenBoxes: markedTokens,
      score: normalizedQuery.length * 10 + matchedTokens.length,
      confidence: matchedTokens.length > 0 ? "high" : "medium",
      source: "fallback-search",
    });
  }

  return out;
}

async function searchDocForText(
  doc: PdfDoc,
  query: string,
  totalPages: number,
): Promise<TraceCandidate[]> {
  const all: TraceCandidate[] = [];

  for (let p = 1; p <= totalPages; p++) {
    try {
      all.push(...(await collectTextMatchesForPage(doc, p, query)));
    } catch {
      /* skip page */
    }
  }

  all.sort((a, b) => a.page - b.page || b.score - a.score);
  return all.slice(0, 100);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isHoveredRef = useRef(false);
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
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [manualCandidates, setManualCandidates] = useState<TraceCandidate[]>([]);
  const [manualCandidateIdx, setManualCandidateIdx] = useState(0);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualNoMatch, setManualNoMatch] = useState(false);

  const hasManualSearch = manualSearchOpen && manualSearchQuery.trim().length > 0;
  const displayedCandidates = hasManualSearch ? manualCandidates : candidates;
  const displayedCandidateIdx = hasManualSearch ? manualCandidateIdx : candidateIdx;
  const activeCand = displayedCandidates[displayedCandidateIdx] ?? null;
  const pagesWithMatches = useMemo(() => new Set(displayedCandidates.map(c => c.page)), [displayedCandidates]);
  const traceExpectedPage = useMemo(
    () =>
      traceTarget && totalPages > 0 ? resolveHintPage(traceTarget, totalPages) : null,
    [traceTarget, totalPages],
  );

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

    const pageCands = displayedCandidates.filter(c => c.page === currentPage);
    if (pageCands.length === 0) return;

    for (const cand of pageCands) {
      const isActive = cand === activeCand;

      // Pin highlight to the exact amount cell when we matched dashboard value (not the whole row).
      if (cand.valueBbox) {
        const vb = cand.valueBbox;
        const vx = vb.x * scale;
        const vw = vb.width * scale;
        const vh = (vb.height + 6) * scale;
        const vy = hCanvas.height - (vb.y + vb.height + 3) * scale;

        ctx.fillStyle = isActive ? "rgba(250, 204, 21, 0.52)" : "rgba(250, 204, 21, 0.28)";
        ctx.fillRect(vx - 2 * scale, vy, vw + 4 * scale, vh);

        if (isActive) {
          ctx.strokeStyle = "rgba(234, 179, 8, 0.95)";
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.strokeRect(vx - 2 * scale, vy, vw + 4 * scale, vh);
        }
        continue;
      }

      // Fallback: full row + token highlights when no single value cell was identified
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
  }, [displayedCandidates, currentPage, scale, activeCand]);

  // Search when traceTarget changes
  useEffect(() => {
    if (!traceTarget || !pdfDoc) {
      setCandidates([]);
      setCandidateIdx(0);
      setNoMatch(false);
      return;
    }

    const jumpPage = totalPages > 0 ? resolveHintPage(traceTarget, totalPages) : null;
    if (jumpPage != null) {
      setCurrentPage(jumpPage);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        if (!isHoveredRef.current && !manualSearchOpen) return;
        event.preventDefault();
        setManualSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (!manualSearchOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setManualSearchOpen(false);
        setManualSearchQuery("");
        setManualCandidates([]);
        setManualCandidateIdx(0);
        setManualNoMatch(false);
        return;
      }

      if (event.key === "Enter" && manualCandidates.length > 0) {
        event.preventDefault();
        if (event.shiftKey) {
          const prev = (manualCandidateIdx - 1 + manualCandidates.length) % manualCandidates.length;
          setManualCandidateIdx(prev);
          setCurrentPage(manualCandidates[prev].page);
        } else {
          const next = (manualCandidateIdx + 1) % manualCandidates.length;
          setManualCandidateIdx(next);
          setCurrentPage(manualCandidates[next].page);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manualSearchOpen, manualCandidates, manualCandidateIdx]);

  useEffect(() => {
    if (!pdfDoc || !manualSearchOpen) return;

    const query = manualSearchQuery.trim();
    if (!query) {
      setManualCandidates([]);
      setManualCandidateIdx(0);
      setManualSearching(false);
      setManualNoMatch(false);
      return;
    }

    let cancelled = false;
    setManualSearching(true);
    setManualNoMatch(false);

    const timer = window.setTimeout(() => {
      (async () => {
        const results = await searchDocForText(pdfDoc, query, totalPages);
        if (cancelled) return;
        setManualCandidates(results);
        setManualSearching(false);
        if (results.length > 0) {
          setManualCandidateIdx(0);
          setCurrentPage(results[0].page);
          setManualNoMatch(false);
        } else {
          setManualNoMatch(true);
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [manualSearchQuery, manualSearchOpen, pdfDoc, totalPages]);

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

  const goNextManualMatch = useCallback(() => {
    if (manualCandidates.length === 0) return;
    const next = (manualCandidateIdx + 1) % manualCandidates.length;
    setManualCandidateIdx(next);
    setCurrentPage(manualCandidates[next].page);
  }, [manualCandidates, manualCandidateIdx]);

  const goPrevManualMatch = useCallback(() => {
    if (manualCandidates.length === 0) return;
    const prev = (manualCandidateIdx - 1 + manualCandidates.length) % manualCandidates.length;
    setManualCandidateIdx(prev);
    setCurrentPage(manualCandidates[prev].page);
  }, [manualCandidates, manualCandidateIdx]);

  if (!file) return null;

  const hasTrace = traceTarget != null;
  const confBadge = activeCand ? {
    high:   { label: "High",   cls: "bg-emerald-100 text-emerald-700" },
    medium: { label: "Medium", cls: "bg-amber-100 text-amber-700" },
    low:    { label: "Low",    cls: "bg-red-100 text-red-700" },
  }[activeCand.confidence] : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-elevation transition-all duration-300",
        fullHeight && "h-full min-h-0",
        expanded && "fixed inset-4 z-50"
      )}
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
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
          <button
            onClick={() => {
              setManualSearchOpen((prev) => !prev);
              if (!manualSearchOpen) {
                window.setTimeout(() => searchInputRef.current?.focus(), 0);
              }
            }}
            className={cn(
              "rounded p-1 transition",
              manualSearchOpen ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-200/60"
            )}
            aria-label="Search in PDF"
            title="Search in PDF (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label={expanded ? "Minimize" : "Maximize"}>
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <button onClick={() => setExpanded(false)} className="rounded p-1 text-slate-500 transition hover:bg-slate-200/60" aria-label="Close"><X className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>

      {manualSearchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            ref={searchInputRef}
            value={manualSearchQuery}
            onChange={(event) => setManualSearchQuery(event.target.value)}
            placeholder="Find in PDF..."
            className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
          {manualSearching && (
            <span className="text-[10px] text-slate-500">Searching…</span>
          )}
          {!manualSearching && manualSearchQuery.trim().length > 0 && (
            <span className="text-[10px] tabular-nums text-slate-600">
              {manualCandidates.length > 0 ? `${manualCandidateIdx + 1}/${manualCandidates.length}` : "0/0"}
            </span>
          )}
          <button
            onClick={goPrevManualMatch}
            disabled={manualCandidates.length === 0}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
            aria-label="Previous search match"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={goNextManualMatch}
            disabled={manualCandidates.length === 0}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
            aria-label="Next search match"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setManualSearchOpen(false);
              setManualSearchQuery("");
              setManualCandidates([]);
              setManualCandidateIdx(0);
              setManualNoMatch(false);
            }}
            className="rounded p-1 text-slate-500 transition hover:bg-slate-100"
            aria-label="Close search"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {manualSearchOpen && manualNoMatch && manualSearchQuery.trim().length > 0 && !manualSearching && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <span>No text match for "{manualSearchQuery.trim()}"</span>
        </div>
      )}

      {/* Trace bar */}
      {hasTrace && (
        <div className="flex shrink-0 items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-yellow-700" />
          <span className="text-[11px] font-semibold text-yellow-800">
            {searching ? "Scanning rows…" : noMatch ? `No row match for "${traceTarget.label}"` : `"${traceTarget.label}"`}
            {!searching && traceExpectedPage != null && (
              <span className="ml-1.5 font-normal text-yellow-700">· p.{traceExpectedPage}</span>
            )}
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
