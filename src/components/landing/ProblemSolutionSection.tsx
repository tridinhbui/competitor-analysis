"use client";

import { motion } from "framer-motion";
import { FileSearch, ScanSearch, MessageSquareText, BarChart3, FileSpreadsheet } from "lucide-react";

export function ProblemSolutionSection() {
  return (
    <section
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:py-16"
      aria-labelledby="problem-solution-heading"
    >
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.45 }}
        className="rounded-3xl border border-border bg-gradient-to-b from-[#fff6f1] to-white p-6 shadow-subtle"
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
          <FileSearch className="h-3 w-3" aria-hidden />
          Challenge
        </p>
        <h2 id="problem-solution-heading" className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
          Enterprise finance teams lose speed when the quarter is trapped across too many tools
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>- IR teams are asked to explain the quarter with stale decks, fragmented notes, and manual updates.</li>
          <li>- FP&amp;A and strategy teams waste time reconciling the same metrics across PDFs, models, and peer sets.</li>
          <li>- CFO, finance, and investor-facing leaders lose time on tie-outs instead of decisions, messaging, and scenarios.</li>
        </ul>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ delay: 0.05, duration: 0.45 }}
        className="rounded-3xl border border-border bg-gradient-to-b from-[#fff1e9] to-white p-6 shadow-subtle"
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
          <ScanSearch className="h-3 w-3" aria-hidden />
          Solution
        </p>
        <h3 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
          One workspace that turns filings into a decision-ready operating layer
        </h3>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          <p className="inline-flex items-start gap-2">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Link filing data, calculations, and peer benchmarks so finance, IR, and strategy stay on the same numbers.
          </p>
          <p className="inline-flex items-start gap-2">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Generate board-ready talking points, investor follow-ups, and scenario framing from a single source of
            truth.
          </p>
          <p className="inline-flex items-start gap-2">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Export analyst bridges, peer packs, and CFO review materials without rebuilding them by hand.
          </p>
        </div>
      </motion.article>
    </section>
  );
}
