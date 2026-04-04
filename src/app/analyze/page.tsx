import { Suspense } from "react";
import { AnalyzeHub } from "@/components/filings/AnalyzeHub";

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-slate-500">Loading analyze workspace…</div>}>
      <AnalyzeHub />
    </Suspense>
  );
}
