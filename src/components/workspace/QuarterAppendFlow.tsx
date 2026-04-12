"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { FullAnalysis, StepEvent } from "@/types/analysis";
import type { AppendReview, TimelineSlot } from "@/types/competitor";
import { QuarterReviewPanel } from "./QuarterReviewPanel";
import { AgentWorkflow } from "@/components/filings/AgentWorkflow";
import { analyzePdf } from "@/lib/pdfAnalysis";
import {
  FileUp,
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
  /** Ticker for the company being appended */
  prefilledTicker: string;
  /** The explicit quarter slot the upload belongs to */
  slot: TimelineSlot;
  /** Called after successful append with updated timeline */
  onAppended?: (timeline: TimelineSlot[], quarterCount: number) => void;
  /** Called to close the flow */
  onClose?: () => void;
  /** Auto-open file picker when flow is opened from timeline slot */
  autoOpenPicker?: boolean;
}

export function QuarterAppendFlow({
  prefilledTicker,
  slot,
  onAppended,
  onClose,
  autoOpenPicker = false,
}: Props) {
  const [phase, setPhase] = useState<Phase>("input");
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [review, setReview] = useState<AppendReview | null>(null);
  const [error, setError] = useState("");
  const [appendResult, setAppendResult] = useState<{
    quarterLabel: string;
    quarterCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoOpenedRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!autoOpenPicker || phase !== "input" || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    const timer = window.setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoOpenPicker, phase]);

  const applyPeriodOverride = useCallback(
    (base: FullAnalysis): FullAnalysis => ({
      ...base,
      meta: {
        ...base.meta,
        ticker: prefilledTicker,
        periodEnd: slot.periodEnd,
      },
    }),
    [prefilledTicker, slot.periodEnd]
  );

  const runReview = useCallback(
    async (t: string, baseAnalysis: FullAnalysis) => {
      setReview(null);
      setError("");
      try {
        const resp = await fetch("/api/filings/append", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: t,
            analysis: applyPeriodOverride(baseAnalysis),
            action: "review",
          }),
        });
        if (!resp.ok) throw new Error(`Review failed: ${resp.status}`);
        const reviewData: AppendReview = await resp.json();
        setReview(reviewData);
        setPhase("reviewing");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [applyPeriodOverride]
  );

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
      await runReview(prefilledTicker, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [prefilledTicker, runReview]);

  const handleDropFile = useCallback(
    (file: File | undefined) => {
      if (!file || file.type !== "application/pdf") return;
      analyzePdfFile(file);
    },
    [analyzePdfFile]
  );

  const handleDragEnter = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setDragActive(false);
      handleDropFile(event.dataTransfer.files[0]);
    },
    [handleDropFile]
  );

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
          analysis: applyPeriodOverride(analysis),
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
  }, [analysis, review, onAppended, applyPeriodOverride]);

  // ------ Reset ------
  const resetFlow = () => {
    setPhase("input");
    setEvents([]);
    setAnalysis(null);
    setReview(null);
    setError("");
    setAppendResult(null);
    setDragActive(false);
    autoOpenedRef.current = false;
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
        confirming={false}
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
            Analyzing {prefilledTicker} for {slot.label}…
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
          Upload {slot.label}
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
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">{prefilledTicker}</p>
        <p className="mt-1 text-xs text-slate-500">
          This upload will be saved directly to {slot.label} with period end {slot.periodEnd}.
        </p>
      </div>

      {/* PDF upload */}
      <button
        type="button"
        onClick={() => {
          if (!fileInputRef.current) return;
          fileInputRef.current.value = "";
          fileInputRef.current.click();
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex w-full items-center gap-3 rounded-lg border-2 border-dashed p-4 text-left transition ${dragActive ? "border-primary bg-primary/10" : "border-slate-200 bg-white hover:border-primary/30 hover:bg-primary/5"}`}
      >
        <FileUp className="h-5 w-5 text-slate-400" />
        <div>
          <p className="text-xs font-semibold text-slate-700">
            Upload 10-Q PDF
          </p>
          <p className="text-[10px] text-slate-400">
            Drag & drop or click to select
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
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
    </div>
  );
}
