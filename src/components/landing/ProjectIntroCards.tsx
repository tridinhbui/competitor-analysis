"use client";

import { motion } from "framer-motion";

const blocks = [
  {
    title: "What leadership needs",
    text: "A fast view of the quarter before stepping into investor meetings, analyst calls, or board reviews.",
  },
  {
    title: "What the platform does",
    text: "Reads SEC filings and PDFs, then organizes reported numbers, calculated metrics, and peer benchmarks in one workbook.",
  },
  {
    title: "What it extracts",
    text: "Balance sheet lines, cash flow metrics, leverage, profitability, and the building blocks behind management-ready ratios.",
  },
  {
    title: "What teams do with it",
    text: "Prepare guidance bridges, peer comparisons, analyst Q&A, and executive exports without losing filing context.",
  },
  {
    title: "Why it matters",
    text: "Less time stitching spreadsheets. More time on judgment, messaging, capital allocation, and strategic finance decisions.",
  },
] as const;

export function ProjectIntroCards() {
  return (
    <section className="border-y border-border bg-secondary/55 py-12" aria-labelledby="story-heading">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="story-heading" className="mb-8 text-center text-xl font-bold text-foreground sm:text-2xl">
          The workflow in five beats
        </h2>
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-5 [&::-webkit-scrollbar]:hidden">
          {blocks.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="min-w-[240px] shrink-0 snap-center rounded-2xl border border-border bg-white p-4 shadow-subtle sm:min-w-0"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 text-sm font-bold text-foreground">{b.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{b.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
