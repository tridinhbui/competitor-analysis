"use client";

import type { SlideBlock } from "@/types/slideBlocks";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  block: SlideBlock;
}

export function NarrativeBlockDisplay({ block }: Props) {
  return (
    <div className="space-y-3">
      {/* Narrative body */}
      {block.narrativeBody && (
        <div className="prose prose-xs max-w-none text-xs text-slate-700 leading-relaxed">
          {block.narrativeBody.split("\n").map((line, i) => (
            <p key={i} className={line.trim() === "" ? "h-2" : ""}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Segment highlights */}
      {block.segmentHighlights && block.segmentHighlights.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Segment Results
          </p>
          <div className="space-y-1.5">
            {block.segmentHighlights.map((sh, i) => {
              const isPositive = sh.yoyChange.startsWith("+") && !sh.yoyChange.includes("-");
              const isNegative = sh.yoyChange.includes("-") || sh.yoyChange.includes(">");
              const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
              const color = isPositive
                ? "text-emerald-600"
                : isNegative
                  ? "text-red-500"
                  : "text-slate-500";

              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="font-semibold text-slate-700">{sh.segmentName}:</span>
                  <span className="text-slate-600">
                    {sh.operatingIncome != null ? `$${sh.operatingIncome}MM` : "—"}
                  </span>
                  <span className={`font-semibold ${color}`}>{sh.yoyChange}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source links */}
      {block.sourceLinks && block.sourceLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {block.sourceLinks.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-primary transition hover:bg-primary/5"
            >
              <ExternalLink className="h-3 w-3" />
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
