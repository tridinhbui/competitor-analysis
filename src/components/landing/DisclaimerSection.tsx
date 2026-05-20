"use client";

import { AlertTriangle } from "lucide-react";

export function DisclaimerSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-subtle sm:p-5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="font-semibold">Disclaimer</p>
            <p className="mt-1 leading-relaxed">
              Decision-support software only. Not investment advice, not official company guidance, and not a
              substitute for CFO, IR, legal, or board review.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
