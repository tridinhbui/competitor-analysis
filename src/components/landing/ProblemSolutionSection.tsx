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
        className="rounded-3xl border border-border bg-gradient-to-b from-[#fff6f1] to-white p-6 shadow-subtle"
      >
        <p className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
          <FileSearch className="h-3 w-3" aria-hidden />
          Challenge
        </p>
        <h2 id="problem-solution-heading" className="mt-3 text-xl font-bold text-foreground sm:text-2xl">
          Enterprise teams lose speed when insight is fragmented
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>- Product and channel data sits in disconnected systems.</li>
          <li>- Leadership reviews spend too long on assembly, not decisions.</li>
          <li>- Brand performance signals are hard to compare quarter to quarter.</li>
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
        <h3 className="mt-3 text-xl font-bold text-foreground sm:text-2xl">Smithfield-style dashboard turns signal into action</h3>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          <p className="inline-flex items-start gap-2">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Present category, channel, and brand KPI views in one clean workspace.
          </p>
          <p className="inline-flex items-start gap-2">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Keep decisions aligned with clear narrative copy and executive-ready exports.
          </p>
        </div>
      </motion.article>
    </section>
  );
}
