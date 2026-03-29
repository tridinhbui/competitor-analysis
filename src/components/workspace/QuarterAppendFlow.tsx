"use client";

import { useCallback, useRef, useState } from "react";
import type { FullAnalysis, StepEvent } from "@/types/analysis";
import type { AppendReview, TimelineSlot } from "@/types/competitor";
import { QuarterReviewPanel } from "./QuarterReviewPanel";
import { AgentWorkflow } from "@/components/filings/AgentWorkflow";
import { analyzePdf } from "@/lib/pdfAnalysis";
import {
  parseSseBlock,
  isFullAnalysisPayload,
  isStepEventPayload,
} from "@/lib/sseClient";
import {
  FileUp,
  Search,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";

type Phase =
  | "input"       // waiting for ticker or file
  | "analyzing"   // running analysis pipeline
  | "reviewing"   // showing review panel
  | "confirming"  // saving
  | "done"        // appended successfully
  | "error";

interface Props {
  /** Pre-fill ticker when opening from workspace sidebar */
  prefilledTicker?: string;
  /** Called after successful append with updated timeline */
  onAppended?: (timeline: TimelineSlot[], quarterCount: number) => void;
  /** Called to close the flow */
  onClose?: () => void;
}

export function QuarterAppendFlow({
  prefilledTicker,
  onAppended,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [ticker, setTicker] = useState(prefilledTicker ?? "");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [review, setReview] = useState<AppendReview | null>(null);
  const [error, setError] = useState("");
  const [appendResult, setAppendResult] = useState<{
    quarterLabel: string;
    quarterCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------ Analyze via SEC ------
  const analyzeViaSec = useCallback(async (t: string) => {
    const clean = t.trim().toUpperCase();
    if (!clean) return;
    setPhase("analyzing");
    setEvents([]);
    setError("");
    setAnalysis(null);
    setReview(null);

    let result: FullAnalysis | null = null;

    const processBlock = (rawBlock: string) => {
      const block = rawBlock.trim();
      if (!block) return;
      const { event, data } = parseSseBlock(block);
      if (!data) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (
        (event === "result" || isFullAnalysisPayload(parsed)) &&
        isFullAnalysisPayload(parsed)
      ) {
        result = parsed;
        return;
      }
      if (isStepEventPayload(parsed)) {
        setEvents((prev) => [...prev, parsed]);
        if (parsed.status === "error" && parsed.message) setError(parsed.message);
      }
    };

    try {
      const resp = await fetch(
        `/api/analyze?ticker=${encodeURIComponent(clean)}`
      );
      if (!resp.ok || !resp.body)
        throw new Error(`Server returned ${resp.status}`);
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

      if (!result) {
        setPhase("error");
        setError("Analysis stream ended without a result.");
        return;
      }

      setAnalysis(result);
      await requestReview(clean, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  // ------ Analyze PDF ------
  const analyzePdfFile = useCallback(async (file: File) => {
    setPhase("analyzing");
    setEvents([]);
    setError("");
    setAnalysis(null);
    setReview(null);

    try {
      const result = await analyzePdf(file, (evt) =>
        setEvents((prev) => [...prev, evt])
      );
      setAnalysis(result);
      const t = result.meta.ticker?.toUpperCase() || ticker.toUpperCase() || "UNKNOWN";
      setTicker(t);
      await requestReview(t, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [ticker]);

  // ------ Request review from server ------
  const requestReview = async (t: string, a: FullAnalysis) => {
    try {
      const resp = await fetch("/api/filings/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t, analysis: a, action: "review" }),
      });
      if (!resp.ok) throw new Error(`Review failed: ${resp.status}`);
      const reviewData: AppendReview = await resp.json();
      setReview(reviewData);
      setPhase("reviewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  // ------ Confirm append ------
  const confirmAppend = useCallback(async () => {
    if (!analysis || !review) return;
    setPhase("confirming");

    try {
      const resp = await fetch("/api/filings/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: review.ticker,
          analysis,
          action: "confirm",
        }),
      });
      if (!resp.ok) throw new Error(`Confirm failed: ${resp.status}`);
      const data = await resp.json();
      setAppendResult({
        quarterLabel: review.quarter.label,
        quarterCount: data.quarterCount,
      });
      setPhase("done");
      onAppended?.(data.timeline, data.quarterCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [analysis, review, onAppended]);

  // ------ Reset ------
  const resetFlow = () => {
    setPhase("input");
    setEvents([]);
    setAnalysis(null);
    setReview(null);
    setError("");
    setAppendResult(null);
    setTicker(prefilledTicker ?? "");
  };

  // ------ Render ------

  // Done state
  if (phase === "done" && appendResult) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
        <p className="text-sm font-bold text-emerald-800">
          {appendResult.quarterLabel} appended successfully
        </p>
        <p className="mt-1 text-xs text-emerald-600">
          {review?.ticker} now has {appendResult.quarterCount} quarter(s) on
          file.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={resetFlow}
            className="rounded-lg border border-emerald-300 bg-white px-4 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            Add Another Quarter
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  // Review state
  if (phase === "reviewing" && review) {
    return (
      <QuarterReviewPanel
        review={review}
        onConfirm={confirmAppend}
        onCancel={resetFlow}
        confirming={phase === "confirming"}
      />
    );
  }

  // Confirming state (same as review but with spinner)
  if (phase === "confirming" && review) {
    return (
      <QuarterReviewPanel
        review={review}
        onConfirm={confirmAppend}
        onCancel={resetFlow}
        confirming={true}
      />
    );
  }

  // Analyzing state
  if (phase === "analyzing") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Analyzing {ticker || "uploaded file"}…
          </p>
          <AgentWorkflow events={events} isRunning={true} />
        </div>
      </div>
    );
  }

  // Error state
  if (phase === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">Append failed</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
        </div>
        <button
          onClick={resetFlow}
          className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Input state — ticker search + PDF upload
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          Append New Quarter
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Ticker input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          analyzeViaSec(ticker);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (e.g. AAPL)"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <button
          type="submit"
          disabled={!ticker.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-40"
        >
          Fetch <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
        <div className="h-px flex-1 bg-slate-100" />
        or upload
        <div className="h-px flex-1 bg-slate-100" />
      </div>

      {/* PDF upload */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-slate-200 bg-white p-4 text-left transition hover:border-primary/30 hover:bg-primary/5"
      >
        <FileUp className="h-5 w-5 text-slate-400" />
        <div>
          <p className="text-xs font-semibold text-slate-700">
            Upload 10-Q PDF
          </p>
          <p className="text-[10px] text-slate-400">
            Drag or click to select
          </p>
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) analyzePdfFile(file);
        }}
      />
    </div>
  );
}
