"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles, Send, X, Loader2, MessageSquare, ChevronDown,
  ChevronUp, Bot, User, Minimize2, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compactAnalysisForLLM } from "@/lib/analysisContext";
import type { FullAnalysis } from "@/types/analysis";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string; isAutoSummary?: boolean };

interface Props {
  analysis: FullAnalysis | null;
  inline?: boolean;
  /** When true, skip auto-summary (e.g. TypingAnalysisPanel handles it) */
  disableAutoSummary?: boolean;
}

export function AnalysisChatPanel({ analysis, inline, disableAutoSummary = false }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [autoSummaryDone, setAutoSummaryDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevAnalysisRef = useRef<FullAnalysis | null>(null);

  const contextRef = useRef<string>("");
  useEffect(() => {
    contextRef.current = analysis ? compactAnalysisForLLM(analysis) : "";
  }, [analysis]);

  const hasContext = Boolean(analysis);

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
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, autoSummary: true }),
          signal: abortController.signal,
        });
        const data = (await res.json()) as { message?: string; error?: string };
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: contextRef.current,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
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
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-elevation">
        {/* Header - clickable to minimize/expand */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setMinimized(!minimized)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMinimized(!minimized); } }}
          className="flex cursor-pointer items-center gap-2.5 border-b border-slate-100 bg-gradient-to-r from-[oklch(0.96_0.04_264)] via-white to-[oklch(0.97_0.03_200)] px-3 py-2.5 sm:px-4 sm:py-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)]">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 sm:text-sm">AI Analyst</p>
            <p className="text-[10px] text-slate-500 sm:text-xs">
              {loading ? "Analyzing…" : hasContext ? "Report attached — ask anything" : "Run analysis for insights"}
            </p>
          </div>
          {hasContext && !loading && messages.some(m => m.isAutoSummary) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-600">✓</span>
          )}
          {minimized ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </div>

        {!minimized && (
          <>
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/30 px-3 py-3 sm:px-4" style={{ maxHeight: "400px", minHeight: "120px" }}>
              {!hasContext && messages.length === 0 && (
                <EmptyState />
              )}
              {hasContext && messages.length === 0 && !loading && (
                <p className="text-xs leading-relaxed text-slate-500">Waiting for AI analysis…</p>
              )}
              {messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{messages.length === 0 ? "Generating analysis summary…" : "Thinking…"}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick questions */}
            {hasContext && messages.length > 0 && !loading && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-slate-50 bg-white px-3 py-2 sm:px-4">
                {["Is the dividend safe?", "Key risks?", "How's the leverage?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:text-[11px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-slate-100 bg-white p-2.5 sm:p-3">
              <div className="flex gap-1.5">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder={hasContext ? "Ask about this analysis…" : "Ask a question…"}
                  className="min-h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15 sm:min-h-10 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)] text-white shadow-subtle transition disabled:opacity-40 sm:h-10 sm:w-10"
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
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full pl-3 pr-4 shadow-float transition-all duration-300 sm:bottom-5 sm:right-5 sm:h-14 sm:pl-4 sm:pr-5",
            "bg-gradient-to-r from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)] text-white",
            "ring-2 ring-white/80 ring-offset-2 ring-offset-transparent hover:scale-[1.03] hover:shadow-lg"
          )}
          aria-label="Open AI analyst chat"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 sm:h-9 sm:w-9">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-white/80">AI Analyst</span>
            <span className="text-xs font-semibold leading-tight sm:text-sm">{hasContext ? "Report attached" : "Ask anything"}</span>
          </span>
          {hasContext && messages.some(m => m.isAutoSummary) && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-white sm:h-5 sm:w-5 sm:text-[10px]">✓</span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-2 sm:p-4 md:p-6">
          <button type="button" className="absolute inset-0 bg-slate-900/25 backdrop-blur-[3px]" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative flex h-[min(600px,92dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-float backdrop-blur-xl ring-1 ring-slate-200/80 sm:max-w-[460px]">
            {/* Header */}
            <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r from-[oklch(0.96_0.04_264)] via-white to-[oklch(0.97_0.03_200)] px-3 py-3 sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)]">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold tracking-tight text-slate-900">AI Analyst</p>
                    <p className="text-[10px] text-slate-500 sm:text-xs">
                      {loading ? "Analyzing…" : hasContext ? "Insights based on your filing data" : "Run analysis for data-driven answers"}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 px-3 py-3 sm:px-4">
              {!hasContext && messages.length === 0 && (
                <EmptyState />
              )}
              {hasContext && messages.length === 0 && !loading && (
                <p className="text-xs leading-relaxed text-slate-600">
                  Try: &ldquo;Is the dividend safe given current FCF and net debt?&rdquo;
                </p>
              )}
              {messages.map((m, i) => (
                <ChatBubble key={i} msg={m} />
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>{messages.length === 0 ? "Generating analysis summary…" : "Thinking…"}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick questions */}
            {hasContext && messages.length > 0 && !loading && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-slate-50 bg-white px-3 py-2">
                {["Is the dividend safe?", "Key risks?", "Compare to peers?", "Leverage outlook?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary sm:text-[11px]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-slate-100 bg-white p-2.5 sm:p-3">
              <div className="flex gap-1.5 sm:gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder={hasContext ? "Ask about this analysis…" : "Ask a question…"}
                  className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15 sm:min-h-11 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)] text-white shadow-subtle transition disabled:opacity-40 sm:h-11 sm:w-11"
                >
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[9px] text-slate-400">Not investment advice. Always verify against official filings.</p>
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
    <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">No report attached</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Analyze a ticker or upload a PDF first. The AI will automatically generate a comprehensive summary.
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
        isUser ? "bg-slate-200" : "bg-gradient-to-br from-[oklch(0.52_0.19_264)] to-[oklch(0.48_0.16_290)]"
      )}>
        {isUser
          ? <User className="h-3 w-3 text-slate-600" />
          : <Bot className="h-3 w-3 text-white" />}
      </div>
      <div className={cn(
        "min-w-0 max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-subtle sm:text-sm",
        isUser
          ? "border border-slate-100 bg-white text-slate-900"
          : "border border-slate-100 bg-white text-slate-800",
        msg.isAutoSummary && "ring-1 ring-primary/10"
      )}>
        {msg.isAutoSummary && (
          <div className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-primary/60">
            <Sparkles className="h-3 w-3" />
            Auto Analysis
          </div>
        )}
        <div className="prose-chat">
          <ReactMarkdown
            components={{
              h2: ({ children }) => <h3 className="mb-1 mt-3 text-xs font-bold text-slate-900 first:mt-0 sm:text-sm">{children}</h3>,
              h3: ({ children }) => <h4 className="mb-1 mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">{children}</h4>,
              p: ({ children }) => <p className="mb-1.5 text-[11px] leading-relaxed text-slate-700 sm:text-xs">{children}</p>,
              ul: ({ children }) => <ul className="mb-2 ml-3 list-disc space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 ml-3 list-decimal space-y-0.5">{children}</ol>,
              li: ({ children }) => <li className="text-[11px] leading-relaxed text-slate-700 sm:text-xs">{children}</li>,
              strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
              table: ({ children }) => (
                <div className="my-2 overflow-x-auto rounded border border-slate-200">
                  <table className="w-full text-[10px] sm:text-[11px]">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
              th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-slate-600">{children}</th>,
              td: ({ children }) => <td className="border-t border-slate-100 px-2 py-1 text-slate-700">{children}</td>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
