"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Sparkles, Send, X, Loader2, ChevronDown,
  ChevronUp, Bot, User, BrainCircuit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compactAnalysisForLLM } from "@/lib/analysisContext";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { trackTokenUsage } from "@/lib/tokenUsageTracker";
import type { FullAnalysis } from "@/types/analysis";
import ReactMarkdown from "react-markdown";

interface CfoPageCtx {
  title: string;
  cfoGoal: string;
  keyQuestions: string[];
  expectedOutputs: string[];
  quickActions: string[];
  bootMessage: string;
}

const PAGE_CFO_CONTEXT: Record<string, CfoPageCtx> = {
  "/analyze": {
    title: "Quick Analyze",
    cfoGoal: "Assess debt, cash flow sustainability, and dividend risk in under 2 minutes.",
    keyQuestions: [
      "Is leverage within safe range for this sector?",
      "Is free cash flow enough to sustain dividends?",
      "Any red flags in debt maturity or interest coverage?",
    ],
    expectedOutputs: [
      "Green / Yellow / Red signal on financial health",
      "Top 2–3 anomalies worth flagging to the board",
      "Dividend sustainability verdict",
    ],
    quickActions: ["Give me a CFO decision memo", "Is the dividend safe?", "Top 3 risks?", "Leverage outlook?"],
    bootMessage: `**CFO Briefing — Quick Analyze**

As your strategic copilot, here's what matters on this page:

**Goal:** Quickly assess debt, cash flow sustainability, and dividend risk.

**Key questions:**
• Is leverage within a safe range for this sector?
• Does free cash flow cover dividends with adequate buffer?
• Any near-term refinancing risk or coverage concern?

**Expected output:** A green/yellow/red signal, top anomalies, and a dividend sustainability verdict.

Run an analysis above, then ask me anything — or use the quick actions below.`,
  },
  "/workspace": {
    title: "Workspace",
    cfoGoal: "Build a decision-ready narrative: peer comparison, thesis consistency, investment implications.",
    keyQuestions: [
      "How does this company stack up against peers?",
      "Is the investment thesis consistent across quarters?",
      "What are the top 3 implications for capital allocation?",
    ],
    expectedOutputs: [
      "Top 3 investment implications",
      "Peer comparison summary",
      "Items to verify before the board",
    ],
    quickActions: ["Top 3 investment implications", "Compare to peers", "What to verify before board?", "Thesis consistency?"],
    bootMessage: `**CFO Briefing — Workspace**

This page is built for decision-making, not just data review.

**Goal:** Construct a peer-benchmarked, narrative-consistent investment case.

**Key questions:**
• How does this company rank among peers on key metrics?
• Is the financial story consistent quarter-over-quarter?
• What are the 3 implications that matter most for capital allocation?

**Expected output:** Investment implications, peer ranking, and a board-ready verification checklist.`,
  },
  "/data-source": {
    title: "Data Source",
    cfoGoal: "Validate data quality, recency, and completeness before committing to any analysis.",
    keyQuestions: [
      "Is the data recent enough for a current decision?",
      "Are critical fields missing that could skew analysis?",
      "What is the extraction confidence level?",
    ],
    expectedOutputs: [
      "Data quality verdict (High / Medium / Low)",
      "List of missing critical fields",
      "Recommended next steps to fill gaps",
    ],
    quickActions: ["Data quality verdict", "What fields are missing?", "How reliable is this data?", "What to backfill?"],
    bootMessage: `**CFO Briefing — Data Source**

Before any analysis means anything, the data must be trustworthy.

**Goal:** Validate recency, completeness, and reliability of extracted financial data.

**Key questions:**
• Is this data current enough for a live investment decision?
• What critical fields are missing or estimated?
• What is the overall extraction confidence?

**Expected output:** A data quality verdict and a gap-fill checklist.`,
  },
  "/history": {
    title: "Analysis History",
    cfoGoal: "Detect thesis drift, benchmark trend consistency, and track what changed between runs.",
    keyQuestions: [
      "What changed meaningfully since the last run?",
      "Is the investment thesis drifting or holding steady?",
      "Are margin or leverage trends moving in the right direction?",
    ],
    expectedOutputs: [
      "Delta summary: what changed vs prior run",
      "Thesis drift assessment (stable / drifting / reversed)",
      "Trend direction on key metrics",
    ],
    quickActions: ["What changed since last run?", "Is thesis still intact?", "Leverage trend?", "Any metric reversed?"],
    bootMessage: `**CFO Briefing — Analysis History**

History isn't just a log — it's your early warning system.

**Goal:** Spot thesis drift, benchmark trends, and understand what changed between runs.

**Key questions:**
• What shifted materially since the previous analysis?
• Is the core investment thesis still supported?
• Are key metrics (margins, leverage, FCF) trending in the right direction?

**Expected output:** A delta summary, thesis stability rating, and directional trend flags.`,
  },
};

const BOOT_SESSION_KEY = "cfo-boot-shown-v1";
const FAB_POS_STORAGE_KEY = "cfo-chat-fab-pos-v1";
const FAB_PADDING = 8;
const FAB_DRAG_THRESHOLD = 6;

type Msg = { role: "user" | "assistant"; content: string; isAutoSummary?: boolean; isBoot?: boolean };
type ChatResponse = {
  message?: string;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};
type FabPosition = { x: number; y: number };
type FabDragState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

interface Props {
  analysis: FullAnalysis | null;
  inline?: boolean;
  /** When true, skip auto-summary (e.g. TypingAnalysisPanel handles it) */
  disableAutoSummary?: boolean;
}

export function AnalysisChatPanel({ analysis, inline, disableAutoSummary = false }: Props) {
  const pathname = usePathname();
  const cfoCtx = PAGE_CFO_CONTEXT[pathname] ?? null;

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [autoSummaryDone, setAutoSummaryDone] = useState(false);
  const [fabReady, setFabReady] = useState(false);
  const [fabPos, setFabPos] = useState<FabPosition>({ x: 0, y: 0 });
  const [isDraggingFab, setIsDraggingFab] = useState(false);
  const bootInjectedRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevAnalysisRef = useRef<FullAnalysis | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const fabRafRef = useRef<number | null>(null);
  const fabPendingPosRef = useRef<FabPosition | null>(null);
  const fabDragRef = useRef<FabDragState>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  const contextRef = useRef<string>("");
  useEffect(() => {
    contextRef.current = analysis ? compactAnalysisForLLM(analysis) : "";
  }, [analysis]);

  const hasContext = Boolean(analysis);

  const getFabSize = useCallback(() => {
    if (fabRef.current) {
      return {
        width: fabRef.current.offsetWidth || 280,
        height: fabRef.current.offsetHeight || 56,
      };
    }
    if (typeof window === "undefined") return { width: 280, height: 56 };
    return window.innerWidth >= 640 ? { width: 280, height: 56 } : { width: 48, height: 48 };
  }, []);

  const clampFabPos = useCallback((pos: FabPosition): FabPosition => {
    if (typeof window === "undefined") return pos;
    const { width, height } = getFabSize();
    return {
      x: Math.min(Math.max(FAB_PADDING, pos.x), window.innerWidth - width - FAB_PADDING),
      y: Math.min(Math.max(FAB_PADDING, pos.y), window.innerHeight - height - FAB_PADDING),
    };
  }, [getFabSize]);

  const getDefaultFabPos = useCallback((): FabPosition => {
    if (typeof window === "undefined") return { x: 24, y: 24 };
    const { width, height } = getFabSize();
    return {
      x: window.innerWidth - width - FAB_PADDING,
      y: window.innerHeight - height - FAB_PADDING,
    };
  }, [getFabSize]);

  useEffect(() => {
    if (inline) return;
    const fallback = getDefaultFabPos();
    if (typeof window === "undefined") {
      setFabPos(fallback);
      setFabReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(FAB_POS_STORAGE_KEY);
      if (!raw) {
        setFabPos(fallback);
      } else {
        const parsed = JSON.parse(raw) as Partial<FabPosition>;
        const next = {
          x: typeof parsed.x === "number" ? parsed.x : fallback.x,
          y: typeof parsed.y === "number" ? parsed.y : fallback.y,
        };
        setFabPos(clampFabPos(next));
      }
    } catch {
      setFabPos(fallback);
    } finally {
      setFabReady(true);
    }
  }, [inline, getDefaultFabPos, clampFabPos]);

  useEffect(() => {
    if (inline || !fabReady || typeof window === "undefined") return;
    const onResize = () => setFabPos((prev) => clampFabPos(prev));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [inline, fabReady, clampFabPos]);

  const persistFabPos = useCallback((pos: FabPosition) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(FAB_POS_STORAGE_KEY, JSON.stringify(pos));
    } catch {
      // Ignore persistence failures (private mode, quota, etc.)
    }
  }, []);

  const scheduleFabPosUpdate = useCallback((nextPos: FabPosition) => {
    fabPendingPosRef.current = nextPos;
    if (fabRafRef.current != null || typeof window === "undefined") return;
    fabRafRef.current = window.requestAnimationFrame(() => {
      fabRafRef.current = null;
      if (fabPendingPosRef.current) {
        setFabPos(fabPendingPosRef.current);
      }
    });
  }, []);

  const handleFabPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (open) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    fabDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: fabPos.x,
      originY: fabPos.y,
      moved: false,
    };
    setIsDraggingFab(true);
  }, [open, fabPos.x, fabPos.y]);

  const handleFabPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > FAB_DRAG_THRESHOLD || Math.abs(dy) > FAB_DRAG_THRESHOLD) {
      drag.moved = true;
    }
    scheduleFabPosUpdate(clampFabPos({ x: drag.originX + dx, y: drag.originY + dy }));
  }, [clampFabPos, scheduleFabPosUpdate]);

  const handleFabPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.active = false;
    drag.pointerId = null;
    setIsDraggingFab(false);
    const pending = fabPendingPosRef.current;
    const clamped = clampFabPos(pending ?? fabPos);
    fabPendingPosRef.current = clamped;
    setFabPos(clamped);
    persistFabPos(clamped);
  }, [fabPos, clampFabPos, persistFabPos]);

  const handleFabPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.active = false;
    drag.pointerId = null;
    setIsDraggingFab(false);
  }, []);

  const handleFabClick = useCallback(() => {
    if (fabDragRef.current.moved) {
      fabDragRef.current.moved = false;
      return;
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (fabRafRef.current != null && typeof window !== "undefined") {
        window.cancelAnimationFrame(fabRafRef.current);
      }
    };
  }, []);

  // Inject CFO boot message once per pathname per session
  useEffect(() => {
    if (!cfoCtx || !open) return;
    if (bootInjectedRef.current === pathname) return;

    const shownKey = `${BOOT_SESSION_KEY}:${pathname}`;
    const alreadyShown = typeof window !== "undefined" && sessionStorage.getItem(shownKey);
    if (alreadyShown) return;

    bootInjectedRef.current = pathname;
    if (typeof window !== "undefined") sessionStorage.setItem(shownKey, "1");

    setMessages((prev) => [{ role: "assistant", content: cfoCtx.bootMessage, isBoot: true }, ...prev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathname]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, loading, minimized]);

  // Auto-trigger AI summary when analysis completes (unless disabled)
  const skipAutoSummary = Boolean(disableAutoSummary);
  useEffect(() => {
    if (skipAutoSummary || !analysis || analysis === prevAnalysisRef.current || autoSummaryDone) return;
    prevAnalysisRef.current = analysis;

    const context = compactAnalysisForLLM(analysis);
    if (!context) return;

    setAutoSummaryDone(true);
    setOpen(true);
    setMinimized(false);
    setLoading(true);

    const abortController = new AbortController();

    (async () => {
      try {
        const res = await fetchWithAuth("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, autoSummary: true }),
          signal: abortController.signal,
        });
        const data = (await res.json()) as ChatResponse;
        trackTokenUsage(data.usage);
        if (!res.ok) {
          setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? `Request failed (${res.status})`, isAutoSummary: true }]);
          return;
        }
        setMessages((prev) => [...prev, { role: "assistant", content: data.message ?? "(empty)", isAutoSummary: true }]);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMessages((prev) => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Network error", isAutoSummary: true }]);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [analysis, autoSummaryDone, skipAutoSummary]);

  // Reset when analysis is cleared
  useEffect(() => {
    if (!analysis && prevAnalysisRef.current) {
      prevAnalysisRef.current = null;
      setMessages([]);
      setAutoSummaryDone(false);
      setOpen(false);
    }
  }, [analysis]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: contextRef.current,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          pathname,
          pageContext: cfoCtx
            ? { title: cfoCtx.title, cfoGoal: cfoCtx.cfoGoal, keyQuestions: cfoCtx.keyQuestions, expectedOutputs: cfoCtx.expectedOutputs }
            : undefined,
        }),
      });
      const data = (await res.json()) as ChatResponse;
      trackTokenUsage(data.usage);
      if (!res.ok) {
        setMessages([...next, { role: "assistant", content: data.error ?? `Request failed (${res.status})` }]);
        return;
      }
      setMessages([...next, { role: "assistant", content: data.message ?? "(empty)" }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: e instanceof Error ? e.message : "Network error" }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  /* ─── INLINE MODE: embedded panel in the dashboard layout ─── */
  if (inline) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-elevation">
        {/* Header - clickable to minimize/expand */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setMinimized(!minimized)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMinimized(!minimized); } }}
          className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-secondary/40 px-3 py-2.5 sm:px-4 sm:py-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-foreground sm:text-sm">CFO Copilot</p>
              {cfoCtx && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                  {cfoCtx.title}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground sm:text-xs">
              {loading ? "Analyzing…" : hasContext ? "Report attached — ask anything" : "Run analysis for insights"}
            </p>
          </div>
          {hasContext && !loading && messages.some(m => m.isAutoSummary) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-600">✓</span>
          )}
          {minimized ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>

        {!minimized && (
          <>
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/30 px-3 py-3 sm:px-4" style={{ maxHeight: "400px", minHeight: "120px" }}>
              {!hasContext && messages.length === 0 && (
                <EmptyState />
              )}
              {hasContext && messages.length === 0 && !loading && (
                <p className="text-xs leading-relaxed text-muted-foreground">Waiting for AI analysis…</p>
              )}
              {messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{messages.length === 0 ? "Generating analysis summary…" : "Thinking…"}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick questions */}
            {messages.length > 0 && !loading && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-border bg-background px-3 py-2 sm:px-4">
                {(cfoCtx?.quickActions ?? ["Is the dividend safe?", "Key risks?", "How's the leverage?"]).map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:text-[11px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border bg-background p-2.5 sm:p-3">
              <div className="flex gap-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder={hasContext ? "Ask about this analysis…" : "Ask a question…"}
                  className="min-h-9 flex-1 rounded-lg border border-border bg-secondary/70 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15 sm:min-h-10 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-subtle transition hover:bg-primary/90 disabled:opacity-40 sm:h-10 sm:w-10"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ─── FLOATING MODE: FAB + overlay panel ─── */
  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onClick={handleFabClick}
          onPointerDown={handleFabPointerDown}
          onPointerMove={handleFabPointerMove}
          onPointerUp={handleFabPointerUp}
          onPointerCancel={handleFabPointerCancel}
          className={cn(
            "group fixed z-40 flex h-12 touch-none items-center gap-2 rounded-full pl-3 pr-4 shadow-float sm:h-14 sm:pl-4 sm:pr-5",
            "bg-primary text-white",
            "ring-2 ring-white/80 ring-offset-2 ring-offset-transparent hover:scale-[1.03] hover:shadow-lg",
            isDraggingFab ? "transition-none" : "transition-[transform,box-shadow] duration-200 ease-out",
            isDraggingFab ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{
            left: 0,
            top: 0,
            transform: `translate3d(${fabPos.x}px, ${fabPos.y}px, 0)`,
            visibility: fabReady ? "visible" : "hidden",
            willChange: isDraggingFab ? "transform" : undefined,
          }}
          aria-label="Open AI analyst chat"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 sm:h-9 sm:w-9">
            <BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-white/80">
              {cfoCtx ? `CFO · ${cfoCtx.title}` : "CFO Copilot"}
            </span>
            <span className="text-xs font-semibold leading-tight sm:text-sm">{hasContext ? "Report attached" : "Ask anything"}</span>
          </span>
          {hasContext && messages.some(m => m.isAutoSummary) && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-white sm:h-5 sm:w-5 sm:text-[10px]">✓</span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-1.5 sm:p-2.5 md:p-3">
          <button
            type="button"
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-500 ease-out"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-[min(640px,94dvh)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-float backdrop-blur-xl ring-1 ring-border/80 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {/* Header */}
            <div className="relative overflow-hidden border-b border-border bg-secondary/40 px-3 py-3 sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                    <BrainCircuit className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold tracking-tight text-foreground">CFO Copilot</p>
                      {cfoCtx && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                          {cfoCtx.title}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground sm:text-xs">
                      {loading ? "Analyzing…" : hasContext ? "Report attached — ask anything" : "Run analysis for data-driven answers"}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-secondary/40 px-3 py-3 sm:px-4">
              {!hasContext && messages.length === 0 && (
                <EmptyState />
              )}
              {hasContext && messages.length === 0 && !loading && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Try: &ldquo;Is the dividend safe given current FCF and net debt?&rdquo;
                </p>
              )}
              {messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{messages.length === 0 ? "Generating analysis summary…" : "Thinking…"}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick questions */}
            {messages.length > 0 && !loading && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-border bg-background px-3 py-2">
                {(cfoCtx?.quickActions ?? ["Is the dividend safe?", "Key risks?", "Compare to peers?", "Leverage outlook?"]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:text-[11px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border bg-background p-2.5 sm:p-3">
              <div className="flex gap-1.5 sm:gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder={hasContext ? "Ask about this analysis…" : "Ask a question…"}
                  className="min-h-10 flex-1 rounded-lg border border-border bg-secondary/70 px-3 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15 sm:min-h-11 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-subtle transition hover:bg-primary/90 disabled:opacity-40 sm:h-11 sm:w-11"
                >
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[9px] text-muted-foreground">Not investment advice. Always verify against official filings.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Sub-components ─── */

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">No report attached</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Run Quick Analyze with a ticker or upload a PDF first. The AI will automatically generate a comprehensive summary.
      </p>
    </div>
  );
}

function ChatBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <div className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
        isUser ? "bg-secondary" : "bg-primary"
      )}>
        {isUser
          ? <User className="h-3 w-3 text-muted-foreground" />
          : <Bot className="h-3 w-3 text-white" />}
      </div>
      <div className={cn(
        "min-w-0 max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-subtle sm:text-sm",
        isUser
          ? "border border-border bg-background text-foreground"
          : "border border-border bg-background text-foreground",
        msg.isAutoSummary && "ring-1 ring-primary/10"
      )}>
        {msg.isBoot && (
          <div className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-primary/70">
            <BrainCircuit className="h-3 w-3" />
            CFO Brief
          </div>
        )}
        {msg.isAutoSummary && !msg.isBoot && (
          <div className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-primary/60">
            <Sparkles className="h-3 w-3" />
            Auto Analysis
          </div>
        )}
        <div className="prose-chat">
          <ReactMarkdown
            components={{
              h2: ({ children }) => <h3 className="mb-1 mt-3 text-xs font-bold text-foreground first:mt-0 sm:text-sm">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-1 mt-2 text-[11px] font-bold text-foreground sm:text-xs">{children}</h4>,
              p: ({ children }) => <p className="mb-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{children}</p>,
              ul: ({ children }) => <ul className="mb-2 ml-3 list-disc space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 ml-3 list-decimal space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{children}</li>,
              strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
              table: ({ children }) => (
                <div className="my-2 overflow-x-auto rounded border border-border">
                  <table className="w-full text-[10px] sm:text-[11px]">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-secondary">{children}</thead>,
              th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-muted-foreground">{children}</th>,
              td: ({ children }) => <td className="border-t border-border px-2 py-1 text-muted-foreground">{children}</td>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
