"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const EXTRACTION_STEPS = [
  { id: "parse", label: "Parsing PDF" },
  { id: "tables", label: "Extracting tables" },
  { id: "notes", label: "Detecting notes" },
  { id: "bs", label: "Building balance sheet" },
  { id: "cf", label: "Computing cash flow" },
  { id: "ready", label: "Ready for analysis" },
] as const;

export function ExtractionTimeline({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="space-y-0" aria-label="Extraction progress">
      {EXTRACTION_STEPS.map((step, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        const pending = i > activeIndex;
        return (
          <li
            key={step.id}
            className={cn(
              "relative flex gap-3 border-l-2 py-2 pl-4 transition-all duration-300 ease-out",
              done && "border-emerald-400/70",
              current && "border-primary",
              pending && "border-border"
            )}
          >
            <span
              className={cn(
                "absolute -left-[9px] top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-white text-[9px] font-bold transition-all duration-300",
                done && "border-emerald-500 bg-emerald-500 text-white",
                current && "border-primary bg-primary text-white shadow-[0_0_0_4px_rgb(37_99_235_/_0.2)]",
                pending && "border-border text-muted-foreground"
              )}
              aria-hidden
            >
              {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : current ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : null}
            </span>
            <span
              className={cn(
                "text-xs font-medium transition-colors duration-300",
                done && "text-emerald-800",
                current && "text-foreground",
                pending && "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
