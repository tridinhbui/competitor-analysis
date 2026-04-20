"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenQDropAnalyzer } from "./TenQDropAnalyzer";
import { OverviewSnapshotPanel } from "@/components/overview/OverviewSnapshotPanel";
import { AnalysisHistoryPanel } from "@/components/history/AnalysisHistoryPanel";

type AnalyzeTab = "extract" | "snapshot" | "history";

export function AnalyzeHub() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = (rawTab === "snapshot" || rawTab === "history" ? rawTab : "extract") as AnalyzeTab;

  return (
    <div className="flex min-h-dvh flex-col">
      <div role="tablist" aria-label="Analyze workspace sections" className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pt-4">
        <Link
          href="/analyze?tab=extract"
          role="tab"
          aria-selected={tab === "extract"}
          aria-current={tab === "extract" ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            tab === "extract" ? "bg-primary/10 text-primary" : "bg-white text-slate-500 hover:text-slate-900"
          )}
        >
          Extract
        </Link>
        <Link
          href="/analyze?tab=snapshot"
          role="tab"
          aria-selected={tab === "snapshot"}
          aria-current={tab === "snapshot" ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            tab === "snapshot" ? "bg-primary/10 text-primary" : "bg-white text-slate-500 hover:text-slate-900"
          )}
        >
          Snapshot
        </Link>
        <Link
          href="/analyze?tab=history"
          role="tab"
          aria-selected={tab === "history"}
          aria-current={tab === "history" ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
            tab === "history" ? "bg-primary/10 text-primary" : "bg-white text-slate-500 hover:text-slate-900"
          )}
        >
          History
        </Link>
      </div>

      {tab === "snapshot" ? <OverviewSnapshotPanel /> : tab === "history" ? <AnalysisHistoryPanel /> : <TenQDropAnalyzer />}
    </div>
  );
}

