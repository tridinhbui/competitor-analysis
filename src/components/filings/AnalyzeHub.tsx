"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { TenQDropAnalyzer } from "./TenQDropAnalyzer";

const OverviewSnapshotPanel = dynamic(
  () =>
    import("@/components/overview/OverviewSnapshotPanel").then((m) => ({
      default: m.OverviewSnapshotPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-slate-500">Loading snapshot…</div>
    ),
  }
);

type AnalyzeTab = "extract" | "snapshot";

export function AnalyzeHub() {
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") === "snapshot" ? "snapshot" : "extract") as AnalyzeTab;

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
      </div>

      {tab === "snapshot" ? <OverviewSnapshotPanel /> : <TenQDropAnalyzer />}
    </div>
  );
}

