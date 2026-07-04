"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { FileSearch2, Table2, History, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TenQDropAnalyzer } from "./TenQDropAnalyzer";
import { AnalysisHistoryPanel } from "@/components/history/AnalysisHistoryPanel";
import DataSourcePage from "@/app/data-source/page";

type AnalyzeTab = "extract" | "workbook" | "history";

export function AnalyzeHub() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const parsedTab = (rawTab === "history" || rawTab === "workbook" ? rawTab : "extract") as AnalyzeTab;
  const [tab, setTab] = useState<AnalyzeTab>(parsedTab);

  useEffect(() => {
    setTab(parsedTab);
  }, [parsedTab]);

  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_24%,#ffffff_100%)]">
      <div className="mx-auto w-full max-w-7xl px-4 pt-5">
        <div className="rounded-[28px] border border-slate-200/80 bg-white/90 px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Analyze workspace</p>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                Extract, workbook, and history in one continuous flow
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Move from filing input to workbook review to prior runs without leaving the analyze surface.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Quick Analyze workspace sections"
              className="flex w-full flex-wrap items-stretch gap-3 sm:gap-4"
            >
        <button
          type="button"
          onClick={() => setTab("extract")}
          role="tab"
          aria-selected={tab === "extract"}
          aria-current={tab === "extract" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "extract"
              ? "border-primary/20 bg-gradient-to-b from-primary/10 to-white text-primary shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
          )}
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-5">
              <FileSearch2 className="h-4 w-4" />
              Extract
            </span>
            <span className="mt-1 text-[11px] font-medium leading-4 text-current/70">
              Drop 10Q, extract facts, review output
            </span>
            {tab === "extract" && (
              <motion.span
                layoutId="analyze-tab-underline"
                className="mt-3 block h-1 w-full rounded-full bg-gradient-to-r from-primary via-amber-500 to-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        <button
          type="button"
          onClick={() => setTab("workbook")}
          role="tab"
          aria-selected={tab === "workbook"}
          aria-current={tab === "workbook" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "workbook"
              ? "border-primary/20 bg-gradient-to-b from-primary/10 to-white text-primary shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
          )}
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-5">
              <Table2 className="h-4 w-4" />
              Workbook
            </span>
            <span className="mt-1 text-[11px] font-medium leading-4 text-current/70">
              Keep the live workbook inside Analyze
            </span>
            {tab === "workbook" && (
              <motion.span
                layoutId="analyze-tab-underline"
                className="mt-3 block h-1 w-full rounded-full bg-gradient-to-r from-primary via-amber-500 to-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          role="tab"
          aria-selected={tab === "history"}
          aria-current={tab === "history" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "history"
              ? "border-primary/20 bg-gradient-to-b from-primary/10 to-white text-primary shadow-[0_10px_24px_rgba(0,0,0,0.06)]"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
          )}
          >
            <span className="flex items-center gap-2 text-[15px] font-semibold leading-5">
              <History className="h-4 w-4" />
              History
            </span>
            <span className="mt-1 text-[11px] font-medium leading-4 text-current/70">
              Reopen prior analyses and restore state
            </span>
            {tab === "history" && (
              <motion.span
                layoutId="analyze-tab-underline"
                className="mt-3 block h-1 w-full rounded-full bg-gradient-to-r from-primary via-amber-500 to-primary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto w-full flex-1 px-4 pb-6 pt-5",
          tab === "workbook" ? "max-w-[min(100vw-1rem,1900px)]" : "max-w-7xl",
        )}
      >
        <div className={cn(
          "min-h-[calc(100dvh-11rem)] rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]",
          tab === "workbook" && "overflow-hidden",
        )}>
          {tab === "history" ? (
            <AnalysisHistoryPanel />
          ) : tab === "workbook" ? (
            <div className="w-full overflow-hidden rounded-[28px]">
              <DataSourcePage embedded />
            </div>
          ) : (
            <div className="px-4 py-4 sm:px-6 sm:py-6">
              <div className="mb-4 rounded-[28px] border border-primary/15 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_42%),linear-gradient(180deg,#fffaf3_0%,#ffffff_100%)] p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] sm:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 shadow-sm">
                      <Sparkles className="h-3.5 w-3.5" />
                      Extract workspace
                    </p>
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      Drop a 10Q and turn it into a reviewable analysis in one flow
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Upload, extract, compare, and continue into workbook review without leaving the Analyze surface.
                    </p>
                  </div>
                  <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Step 1</p>
                      <p className="mt-1 font-semibold text-slate-900">Upload or drag PDF</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Step 2</p>
                      <p className="mt-1 font-semibold text-slate-900">Extract key metrics</p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Step 3</p>
                      <p className="mt-1 font-semibold text-slate-900">Continue into workbook</p>
                    </div>
                  </div>
                </div>
              </div>
              <TenQDropAnalyzer />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
