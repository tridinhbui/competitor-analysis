"use client";

import { useState } from "react";
import { PIPELINE_STEPS, type StepEvent } from "@/types/analysis";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, CircleDashed, Loader2, AlertCircle, PlayCircle,
  ChevronRight, Clock, Database, Cpu, BarChart3, ShieldCheck,
  FileText, Search, Calculator, Activity,
} from "lucide-react";

interface Props {
  events: StepEvent[];
  isRunning?: boolean;
  compact?: boolean;
  /** Horizontal stepper for top-bar layout (PDF mode) */
  horizontal?: boolean;
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ingest: FileText,
  resolve: Search,
  extract_bs: Database,
  extract_cf: Database,
  compute_capital: Calculator,
  compute_debt: Calculator,
  compute_ratios: BarChart3,
  dividend_assessment: Activity,
  validate: ShieldCheck,
  complete: CheckCircle2,
};

function allEventsForStep(events: StepEvent[], stepId: string): StepEvent[] {
  return events.filter((e) => e.step === stepId);
}

function latestEvent(events: StepEvent[], stepId: string): StepEvent | undefined {
  const matches = allEventsForStep(events, stepId);
  return matches[matches.length - 1];
}

export function AgentWorkflow({ events, isRunning, compact, horizontal }: Props) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const totalDone = PIPELINE_STEPS.filter(
    (s) => latestEvent(events, s.id)?.status === "done"
  ).length;
  const progress = PIPELINE_STEPS.length > 0
    ? Math.round((totalDone / PIPELINE_STEPS.length) * 100)
    : 0;

  const totalMs = events
    .filter((e) => e.status === "done" && e.durationMs != null)
    .reduce((acc, e) => acc + (e.durationMs ?? 0), 0);

  if (horizontal) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STEPS.map((step, idx) => {
            const evt = latestEvent(events, step.id);
            const status = evt?.status ?? "pending";
            const StepIcon = STEP_ICONS[step.id] ?? Cpu;
            const isLast = idx === PIPELINE_STEPS.length - 1;
            return (
              <div key={step.id} className="flex shrink-0 items-center">
                <div
                  title={evt?.message}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
                    status === "done" && "border-emerald-200 bg-emerald-50/80",
                    status === "running" && "border-primary/40 bg-primary/10",
                    status === "error" && "border-red-200 bg-red-50/80",
                    status === "pending" && "border-slate-100 bg-slate-50/50"
                  )}
                >
                  {status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                  {status === "pending" && <CircleDashed className="h-3.5 w-3.5 text-slate-300" />}
                  <span className={cn(
                    "whitespace-nowrap text-[10px] font-semibold sm:text-[11px]",
                    status === "done" ? "text-slate-700" : status === "running" ? "text-primary" : status === "error" ? "text-red-600" : "text-slate-400"
                  )}>
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-slate-200" />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-slate-500">
            {totalDone}/{PIPELINE_STEPS.length}
            {totalMs > 0 && ` · ${(totalMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-[10px] font-medium text-slate-500">{totalDone}/{PIPELINE_STEPS.length}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            {isRunning
              ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
              : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-900 sm:text-sm">Analysis Pipeline</h3>
            <p className="text-[10px] text-slate-500 sm:text-xs">
              {isRunning ? "Processing…" : "Complete — click steps for details"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{totalDone}/{PIPELINE_STEPS.length} steps</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalMs > 0 ? `${(totalMs / 1000).toFixed(1)}s` : "—"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                progress === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step list */}
      <div className="relative">
        <div className="absolute left-[13px] top-1 bottom-1 w-px bg-slate-100" />
        <ol className="space-y-1">
          {PIPELINE_STEPS.map((step) => {
            const evt = latestEvent(events, step.id);
            const status = evt?.status ?? "pending";
            const allEvts = allEventsForStep(events, step.id);
            const isExpanded = expandedStep === step.id;
            const hasDetail = allEvts.length > 0;
            const StepIcon = STEP_ICONS[step.id] ?? Cpu;

            return (
              <li key={step.id} className="relative z-10">
                {/* Step row — clickable */}
                <div
                  role="button"
                  tabIndex={hasDetail ? 0 : -1}
                  onClick={() => hasDetail && setExpandedStep(isExpanded ? null : step.id)}
                  onKeyDown={(e) => {
                    if (hasDetail && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setExpandedStep(isExpanded ? null : step.id);
                    }
                  }}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-1 py-1.5 transition-colors sm:gap-2.5 sm:py-2",
                    hasDetail && "cursor-pointer hover:bg-slate-50",
                    isExpanded && "bg-slate-50"
                  )}
                >
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0 rounded bg-white">
                    {status === "done" && <CheckCircle2 className="h-[22px] w-[22px] text-primary" />}
                    {status === "running" && <Loader2 className="h-[22px] w-[22px] animate-spin text-primary" />}
                    {status === "error" && <AlertCircle className="h-[22px] w-[22px] text-red-500" />}
                    {status === "skipped" && <PlayCircle className="h-[22px] w-[22px] text-slate-300" />}
                    {status === "pending" && <CircleDashed className="h-[22px] w-[22px] text-slate-200" />}
                  </div>

                  {/* Label + message */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "truncate text-[11px] font-semibold transition-colors sm:text-xs",
                        status === "done" ? "text-slate-800"
                          : status === "running" ? "text-primary"
                          : status === "error" ? "text-red-600"
                          : "text-slate-300"
                      )}>
                        {step.label}
                      </span>
                      {evt?.durationMs != null && status === "done" && (
                        <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[8px] tabular-nums text-slate-400">
                          {evt.durationMs}ms
                        </span>
                      )}
                    </div>
                    {evt?.message && status !== "pending" && (
                      <p className={cn(
                        "mt-px line-clamp-1 text-[10px] leading-snug",
                        status === "error" ? "text-red-400"
                          : status === "running" ? "text-primary/60"
                          : "text-slate-400"
                      )}>
                        {evt.message}
                      </p>
                    )}
                  </div>

                  {/* Expand arrow */}
                  {hasDetail && (
                    <ChevronRight className={cn(
                      "mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform duration-200",
                      isExpanded && "rotate-90 text-slate-500"
                    )} />
                  )}
                </div>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <div className="ml-7 mb-1 overflow-hidden rounded-lg border border-slate-100 bg-white shadow-subtle sm:ml-8">
                    {/* Step info header */}
                    <div className="flex items-center gap-2 border-b border-slate-50 bg-slate-50/50 px-3 py-2">
                      <StepIcon className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {step.label}
                      </span>
                      {evt?.durationMs != null && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="h-3 w-3" />
                          {evt.durationMs}ms
                        </span>
                      )}
                    </div>

                    {/* Event log */}
                    <div className="max-h-[200px] overflow-y-auto px-3 py-2">
                      <div className="space-y-2">
                        {allEvts.map((e, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={cn(
                              "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                              e.status === "running" ? "animate-pulse bg-primary"
                                : e.status === "done" ? "bg-emerald-400"
                                : e.status === "error" ? "bg-red-400"
                                : "bg-slate-200"
                            )} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "text-[10px] font-medium",
                                  e.status === "running" ? "text-primary"
                                    : e.status === "done" ? "text-slate-700"
                                    : e.status === "error" ? "text-red-600"
                                    : "text-slate-400"
                                )}>
                                  {e.status === "running" ? "Running" : e.status === "done" ? "Completed" : e.status === "error" ? "Error" : e.status}
                                </span>
                                {e.durationMs != null && (
                                  <span className="text-[9px] tabular-nums text-slate-300">{e.durationMs}ms</span>
                                )}
                              </div>
                              <p className="mt-px text-[10px] leading-relaxed text-slate-500">{e.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Detail data if available */}
                      {evt?.detail && Object.keys(evt.detail).length > 0 && (
                        <div className="mt-2.5 rounded border border-slate-100 bg-slate-50/70 p-2">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Extracted Data</p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            {Object.entries(evt.detail).map(([k, v]) => (
                              <div key={k} className="flex items-baseline justify-between gap-1">
                                <span className="truncate text-[10px] text-slate-500">{k}</span>
                                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-700">
                                  {Array.isArray(v) ? `[${v.length}]` : String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
