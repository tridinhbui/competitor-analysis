"use client";

import dynamic from "next/dynamic";

/** Shown while the analysis dashboard chunk downloads (recharts-heavy). */
export function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse p-2" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-7 w-40 rounded bg-slate-200" />
      <div className="h-36 w-full rounded-xl bg-slate-100" />
      <div className="h-28 w-full rounded-xl bg-slate-100" />
    </div>
  );
}

export const LazyAnalysisDashboard = dynamic(
  () => import("./AnalysisDashboard").then((m) => ({ default: m.AnalysisDashboard })),
  { ssr: false, loading: DashboardLoadingSkeleton }
);

export const LazyPdfViewer = dynamic(
  () => import("./PdfViewer").then((m) => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-slate-400">
        Loading PDF viewer…
      </div>
    ),
  }
);

export const LazyAnalysisChatPanel = dynamic(
  () => import("./AnalysisChatPanel").then((m) => ({ default: m.AnalysisChatPanel })),
  { ssr: false, loading: () => null }
);
