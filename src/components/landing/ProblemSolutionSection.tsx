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
          Problem
        </p>
        <h2 id="problem-solution-heading" className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
          Too many files slow the quarter down
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>- Teams rebuild the same quarter from PDFs, decks, and Excel tabs.</li>
          <li>- Peer checks and tie-outs are manual.</li>
          <li>- Guidance and leverage are harder to defend.</li>
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
          Fix
        </p>
        <h3 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
          One workspace from filing extraction to board-ready output
        </h3>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          <p className="inline-flex items-start gap-2">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Keep filing data, metrics, and peers in one workbook.
          </p>
          <p className="inline-flex items-start gap-2">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Write talking points, follow-ups, and scenarios from the same numbers.
          </p>
          <p className="inline-flex items-start gap-2">
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Export decks and review packs without rebuilding them by hand.
          </p>
        </div>
      </motion.article>
    </section>
  );
}
