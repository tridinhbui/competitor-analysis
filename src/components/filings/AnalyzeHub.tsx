"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download, FileSearch2, History, Lightbulb, Route, Sparkles, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TenQDropAnalyzer } from "./TenQDropAnalyzer";
import { AnalysisHistoryPanel } from "@/components/history/AnalysisHistoryPanel";
import DataSourcePage from "@/app/data-source/page";

type AnalyzeTab = "extract" | "workbook" | "history";

export function AnalyzeHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const parsedTab = (rawTab === "history" || rawTab === "workbook" ? rawTab : "extract") as AnalyzeTab;
  const [tab, setTab] = useState<AnalyzeTab>(parsedTab);

  useEffect(() => {
    setTab(parsedTab);
  }, [parsedTab]);

  const switchTab = (nextTab: AnalyzeTab) => {
    if (nextTab === tab) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "extract") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    setTab(nextTab);
    startTransition(() => {
      router.push(`/analyze${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
    });
  };

  const flowSteps = [
    {
      id: "extract" as const,
      label: "Upload",
      detail: "Drop 10-Q",
      icon: FileSearch2,
      active: tab === "extract",
      onClick: () => switchTab("extract"),
    },
    {
      id: "workbook" as const,
      label: "Workbook",
      detail: "Edit & trace",
      icon: Table2,
      active: tab === "workbook",
      onClick: () => switchTab("workbook"),
    },
    {
      id: "insight",
      label: "Analytics",
      detail: "Review output",
      icon: Lightbulb,
      active: tab === "extract",
      onClick: () => switchTab("extract"),
    },
    {
      id: "export",
      label: "Export",
      detail: "Download",
      icon: Download,
      active: tab === "extract",
      onClick: () => switchTab("extract"),
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-[#fffaf6] text-[#3b4043] transition-colors duration-300">
      <div className="mx-auto w-full max-w-7xl px-4 pt-5">
        <div className="rounded-[28px] border border-[#e7c7b7]/70 bg-white/90 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-1">
                <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e7c7b7]/70 bg-[#fff6f1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cc521d]">
                  <Route className="h-3.5 w-3.5" />
                  Analyze command center
                </p>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  One flow: upload → workbook → insight → export
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[#5a6065]">
                  Restore past runs, edit the workbook, and export investor-ready output.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[680px]">
                {flowSteps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={step.onClick}
                    className={cn(
                      "group rounded-2xl border px-3 py-3 text-left transition-all duration-300",
                      step.active
                        ? "border-[#e7c7b7] bg-[#fff6f1] shadow-sm"
                        : "border-[#e3e5e7] bg-white hover:border-[#e7c7b7] hover:bg-[#fffaf6]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-[#cc521d]">
                        <step.icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9b8173]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#3b4043]">{step.label}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-[#5a6065]">{step.detail}</p>
                  </button>
                ))}
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Quick Analyze workspace sections"
              className="flex w-full flex-wrap items-stretch gap-3 sm:gap-4"
            >
        <button
          type="button"
          onClick={() => switchTab("extract")}
          role="tab"
          aria-selected={tab === "extract"}
          aria-current={tab === "extract" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "extract"
              ? "border-[#e7c7b7] bg-[#fff6f1] text-[#cc521d] shadow-sm"
              : "border-[#e3e5e7] bg-white text-[#5a6065] hover:border-[#e7c7b7] hover:text-[#3b4043]"
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
                className="mt-3 block h-1 w-full rounded-full bg-[#cc521d]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        <button
          type="button"
          onClick={() => switchTab("workbook")}
          role="tab"
          aria-selected={tab === "workbook"}
          aria-current={tab === "workbook" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "workbook"
              ? "border-[#e7c7b7] bg-[#fff6f1] text-[#cc521d] shadow-sm"
              : "border-[#e3e5e7] bg-white text-[#5a6065] hover:border-[#e7c7b7] hover:text-[#3b4043]"
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
                className="mt-3 block h-1 w-full rounded-full bg-[#cc521d]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        <button
          type="button"
          onClick={() => switchTab("history")}
          role="tab"
          aria-selected={tab === "history"}
          aria-current={tab === "history" ? "page" : undefined}
          className={cn(
            "inline-flex min-w-[132px] flex-col rounded-2xl border px-4 py-3 text-left shadow-sm transition sm:min-w-[156px]",
            tab === "history"
              ? "border-[#e7c7b7] bg-[#fff6f1] text-[#cc521d] shadow-sm"
              : "border-[#e3e5e7] bg-white text-[#5a6065] hover:border-[#e7c7b7] hover:text-[#3b4043]"
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
                className="mt-3 block h-1 w-full rounded-full bg-[#cc521d]"
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
          tab === "workbook" || tab === "extract" ? "max-w-[min(100vw-0.5rem,2200px)]" : "max-w-7xl",
        )}
      >
        <div className={cn(
          "min-h-[calc(100dvh-11rem)] rounded-[28px] border border-[#e3e5e7] bg-white/95 shadow-[0_18px_60px_rgba(59,64,67,0.08)] transition-all duration-300",
          tab === "workbook" && "overflow-hidden",
        )}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
          {tab === "history" ? (
            <AnalysisHistoryPanel />
          ) : tab === "workbook" ? (
            <div className="w-full overflow-hidden rounded-[28px]">
              <DataSourcePage embedded />
            </div>
          ) : (
            <div className="px-4 py-4 sm:px-6 sm:py-6">
              <div className="mb-4 rounded-[28px] border border-[#e7c7b7]/70 bg-[#fffaf6] p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="inline-flex items-center gap-2 rounded-full border border-[#e7c7b7]/70 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#cc521d]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Extract workspace
                    </p>
                    <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                      Drop a 10Q and turn it into a reviewable analysis in one flow
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5a6065]">
                      Upload, extract, compare, and continue into workbook review without leaving the Analyze surface.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#e7c7b7]/80 bg-white px-4 py-3 text-sm text-[#5a6065]">
                    Upload the filing, review extraction, then continue into the workbook.
                  </div>
                </div>
              </div>
              <TenQDropAnalyzer />
            </div>
          )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
