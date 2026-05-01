"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Hero + two-column layout aligned with Quick Analyze (`AnalyzeExtractPanel`).
 */
export function AnalyzeLandingShell({
  eyebrow,
  title,
  subtitle,
  heroActions,
  left,
  sidebar,
  className,
}: {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  heroActions?: ReactNode;
  left: ReactNode;
  sidebar: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:py-10", className)}>
      <div className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary sm:text-base">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{subtitle}</p>
        {heroActions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{heroActions}</div> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex min-h-[26rem] flex-col rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-elevation sm:min-h-[30rem] sm:p-6">
          {left}
        </div>
        <aside className="rounded-3xl border border-slate-200/90 bg-white/90 p-5 shadow-subtle sm:p-6">{sidebar}</aside>
      </div>
    </div>
  );
}
