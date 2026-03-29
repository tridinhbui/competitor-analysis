"use client";

import { useEffect, useState, useRef } from "react";
import { Bot, Loader2 } from "lucide-react";
import { compactAnalysisForLLM } from "@/lib/analysisContext";
import type { FullAnalysis } from "@/types/analysis";
import ReactMarkdown from "react-markdown";

interface Props {
  analysis: FullAnalysis | null;
  isAnalyzing: boolean;
}

const TYPING_SPEED_MS = 12;

export function TypingAnalysisPanel({ analysis, isAnalyzing }: Props) {
  const [displayedText, setDisplayedText] = useState("");
  const [fullText, setFullText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const prevAnalysisRef = useRef<FullAnalysis | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!analysis || analysis === prevAnalysisRef.current) return;
    prevAnalysisRef.current = analysis;

    setDisplayedText("");
    setFullText("");
    setError("");
    setIsTyping(true);

    const context = compactAnalysisForLLM(analysis);

    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context, autoSummary: true }),
        });
        const data = (await res.json()) as { message?: string; error?: string };
        if (!res.ok) {
          setError(data.error ?? `Request failed (${res.status})`);
          setIsTyping(false);
          return;
        }
        const text = data.message?.trim() ?? "";
        setFullText(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        setIsTyping(false);
      }
    })();
  }, [analysis]);

  // Typing effect
  useEffect(() => {
    if (!fullText || fullText.length === 0) return;

    let idx = 0;
    intervalRef.current = setInterval(() => {
      idx += 1;
      setDisplayedText(fullText.slice(0, idx));
      if (idx >= fullText.length && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsTyping(false);
      }
    }, TYPING_SPEED_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fullText]);

  return (
    <div className="flex shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-4">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-slate-800 sm:text-sm">AI Analyst</span>
        {(isAnalyzing || isTyping) && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500 sm:text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isAnalyzing ? "Analyzing document…" : "Typing analysis…"}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-3 py-3 sm:px-4 sm:py-3" style={{ maxHeight: "220px", minHeight: "140px" }}>
        {error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-xs leading-relaxed text-slate-700 sm:text-sm">
            {displayedText ? (
              <>
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => <h3 className="mb-1 mt-3 text-xs font-bold text-slate-900 first:mt-0 sm:text-sm">{children}</h3>,
                    h3: ({ children }) => <h4 className="mb-1 mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">{children}</h4>,
                    p: ({ children }) => <p className="mb-1.5">{children}</p>,
                    ul: ({ children }) => <ul className="mb-2 ml-3 list-disc space-y-0.5">{children}</ul>,
                    li: ({ children }) => <li className="text-[11px] sm:text-xs">{children}</li>,
                    table: ({ children }) => (
                      <div className="my-2 overflow-x-auto rounded border border-slate-200">
                        <table className="w-full text-[10px] sm:text-[11px]">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                    th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-slate-600">{children}</th>,
                    td: ({ children }) => <td className="border-t border-slate-100 px-2 py-1">{children}</td>,
                  }}
                >
                  {displayedText}
                </ReactMarkdown>
                {(isTyping || (fullText && displayedText.length < fullText.length)) && (
                  <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary" />
                )}
              </>
            ) : !analysis && !isAnalyzing ? (
              <p className="text-slate-400">Upload a PDF to see AI analysis.</p>
            ) : isAnalyzing ? (
              <p className="text-slate-500">Extracting data… Analysis will appear here when complete.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
