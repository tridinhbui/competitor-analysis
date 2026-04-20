"use client";

import { Download, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightsTabModel } from "./useInsightsTabModel";

export function InsightsTabActionsAndHealthSection({ model }: { model: InsightsTabModel }) {
  const {
    commentary,
    commentaryLoading,
    generateCommentary,
    deckLoading,
    exportInsightsDeck,
    healthScore,
    zScore,
    piotroski,
    earningsQuality,
  } = model;

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={generateCommentary}
          disabled={commentaryLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:bg-violet-700 disabled:opacity-50"
        >
          <Info className="h-3.5 w-3.5" />
          {commentaryLoading ? "Analyzing…" : commentary ? "Refresh Commentary" : "Generate AI Commentary"}
        </button>
        <button
          type="button"
          onClick={exportInsightsDeck}
          disabled={deckLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-subtle transition hover:bg-indigo-700 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {deckLoading ? "Generating…" : "Export Insights Deck"}
        </button>
      </div>

      {commentary?.overallAssessment && (
        <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Info className="h-4 w-4 text-violet-600" />
            <p className="text-xs font-bold uppercase tracking-wider text-violet-600">AI Analyst Assessment</p>
          </div>
          <p className="text-sm leading-relaxed text-slate-800">{commentary.overallAssessment}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn("rounded-xl border-2 p-4 text-center",
          healthScore.grade === "A" ? "border-emerald-300 bg-emerald-50" :
          healthScore.grade === "B" ? "border-blue-300 bg-blue-50" :
          healthScore.grade === "C" ? "border-amber-300 bg-amber-50" :
          "border-red-300 bg-red-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Financial Health</p>
          <p className={cn("mt-1 text-4xl font-black",
            healthScore.grade === "A" ? "text-emerald-600" :
            healthScore.grade === "B" ? "text-blue-600" :
            healthScore.grade === "C" ? "text-amber-600" : "text-red-600"
          )}>{healthScore.grade}</p>
          <p className="mt-1 text-xs text-slate-500">{healthScore.score}/{healthScore.max} points ({healthScore.pctScore}%)</p>
        </div>

        {zScore && (
          <div className={cn("rounded-xl border-2 p-4 text-center",
            zScore.zone === "safe" ? "border-emerald-300 bg-emerald-50" :
            zScore.zone === "grey" ? "border-amber-300 bg-amber-50" :
            "border-red-300 bg-red-50"
          )}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Altman Z-Score</p>
            <p className={cn("mt-1 text-3xl font-black",
              zScore.zone === "safe" ? "text-emerald-600" :
              zScore.zone === "grey" ? "text-amber-600" : "text-red-600"
            )}>{zScore.z.toFixed(2)}</p>
            <p className="mt-1 text-xs">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold",
                zScore.zone === "safe" ? "bg-emerald-200 text-emerald-800" :
                zScore.zone === "grey" ? "bg-amber-200 text-amber-800" : "bg-red-200 text-red-800"
              )}>
                {zScore.zone === "safe" ? "SAFE ZONE" : zScore.zone === "grey" ? "GREY ZONE" : "DISTRESS ZONE"}
              </span>
            </p>
          </div>
        )}

        <div className={cn("rounded-xl border-2 p-4 text-center",
          piotroski.score >= 7 ? "border-emerald-300 bg-emerald-50" :
          piotroski.score >= 4 ? "border-amber-300 bg-amber-50" :
          "border-red-300 bg-red-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Piotroski F-Score</p>
          <p className={cn("mt-1 text-3xl font-black",
            piotroski.score >= 7 ? "text-emerald-600" :
            piotroski.score >= 4 ? "text-amber-600" : "text-red-600"
          )}>{piotroski.score}/9</p>
          <p className="mt-1 text-xs text-slate-500">{piotroski.score >= 7 ? "Strong" : piotroski.score >= 4 ? "Moderate" : "Weak"} fundamentals</p>
        </div>

        <div className={cn("rounded-xl border-2 p-4 text-center",
          earningsQuality.quality === "high" ? "border-emerald-300 bg-emerald-50" :
          earningsQuality.quality === "moderate" ? "border-blue-300 bg-blue-50" :
          earningsQuality.quality === "low" ? "border-red-300 bg-red-50" :
          "border-slate-300 bg-slate-50"
        )}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Earnings Quality</p>
          <p className={cn("mt-1 text-2xl font-black",
            earningsQuality.quality === "high" ? "text-emerald-600" :
            earningsQuality.quality === "moderate" ? "text-blue-600" :
            earningsQuality.quality === "low" ? "text-red-600" : "text-slate-500"
          )}>{earningsQuality.quality === "unknown" ? "N/A" : earningsQuality.quality.toUpperCase()}</p>
          <p className="mt-1 text-xs text-slate-500">OCF/NI: {earningsQuality.ocfToNI != null ? `${earningsQuality.ocfToNI}x` : "—"}</p>
        </div>
      </div>
    </>
  );
}
