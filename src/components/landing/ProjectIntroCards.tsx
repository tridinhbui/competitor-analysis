"use client";

import { motion } from "framer-motion";

const blocks = [
  {
    title: "What it does",
    text: "Reads SEC filings and PDFs, then surfaces capital structure, liquidity, and dividend sustainability in a structured dashboard.",
  },
  {
    title: "How it works",
    text: "Server pipeline for tickers (with streamed progress), browser PDF extraction for uploads, then dashboards, exports, and chat on top.",
  },
  {
    title: "What it extracts",
    text: "Balance sheet lines, cash flow metrics, debt composition, footnote-aware adjustments where available, and narrative-friendly ratios.",
  },
  {
    title: "What you get",
    text: "Charts, tables, Excel, deck exports, saved history, and a workspace for manual data and peer sets—without losing filing context.",
  },
  {
    title: "Why it’s useful",
    text: "Less time parsing PDFs and stitching spreadsheets; more time on judgment, messaging, and comparing names side by side.",
  },
] as const;

export function ProjectIntroCards() {
  return (
    <section className="border-y border-slate-200/80 bg-slate-50/50 py-12" aria-labelledby="story-heading">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="story-heading" className="mb-8 text-center text-xl font-bold text-slate-900 sm:text-2xl">
          The story in five beats
        </h2>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5 [&::-webkit-scrollbar]:hidden">
          {blocks.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="min-w-[240px] shrink-0 snap-center rounded-2xl border border-slate-200/90 bg-white p-4 shadow-subtle sm:min-w-0"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 text-sm font-bold text-slate-900">{b.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{b.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
