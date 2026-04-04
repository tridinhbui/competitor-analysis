"use client";

import { motion } from "framer-motion";
import { FileSearch, ScanSearch, MessageSquareText, BarChart3 } from "lucide-react";

export function ProblemSolutionSection() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:py-16" aria-labelledby="problem-solution-heading">
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.45 }}
        className="rounded-3xl border border-rose-200/70 bg-gradient-to-b from-rose-50/70 to-white p-6 shadow-subtle"
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-700">
          <FileSearch className="h-3 w-3" aria-hidden />
          Problem
        </p>
        <h2 id="problem-solution-heading" className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
          Reading 10-Q manually kills momentum
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>- Hundreds of pages per filing slow every decision loop.</li>
          <li>- Debt and cash flow details are hidden across notes and tables.</li>
          <li>- Teams lose hours rebuilding the same summary deck every quarter.</li>
        </ul>
      </motion.article>

      <motion.article
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ delay: 0.05, duration: 0.45 }}
        className="rounded-3xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/65 to-white p-6 shadow-subtle"
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          <ScanSearch className="h-3 w-3" aria-hidden />
          Solution
        </p>
        <h3 className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">Dividend IQ turns filings into decisions</h3>
        <div className="mt-4 grid gap-2 text-sm text-slate-600">
          <p className="inline-flex items-start gap-2">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Convert SEC / PDF 10-Q into a structured dashboard instantly.
          </p>
          <p className="inline-flex items-start gap-2">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Chat directly with extracted financial context, then export in one click.
          </p>
        </div>
      </motion.article>
    </section>
  );
}
