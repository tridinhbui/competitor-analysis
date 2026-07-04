"use client";

import { motion } from "framer-motion";
import { Building2, FileStack, ArrowRightLeft, Workflow } from "lucide-react";

const rows = [
  {
    icon: FileStack,
    title: "Inputs arrive fragmented",
    text: "Financial statements, PDFs, slides, and peer data all land in different places, then get retyped into working files.",
  },
  {
    icon: ArrowRightLeft,
    title: "Teams duplicate the same work",
    text: "IR, FP&A, and strategy each rebuild their own version of the quarter, creating drift and reconciliation overhead.",
  },
  {
    icon: Workflow,
    title: "Leadership needs a single story",
    text: "The CFO office needs a consistent narrative that can travel from analysis to investor messaging to board review.",
  },
  {
    icon: Building2,
    title: "The market expects speed",
    text: "When the quarter moves, the team has to move faster without weakening governance, traceability, or confidence.",
  },
] as const;

export function WhyNowSection() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
  } as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16" aria-labelledby="why-now-heading">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="rounded-3xl border border-border bg-white/95 p-6 shadow-subtle sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Why now</p>
          <h2 id="why-now-heading" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            The finance stack is already data-rich. What&apos;s missing is the operating layer.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enterprise finance teams do not need more spreadsheets. They need a tighter system for turning filings into
            decisions, decisions into narratives, and narratives into board-ready output.
          </p>
          <div className="mt-5 grid gap-3">
            {[
              "Reduce handoffs between IR, FP&A, strategy, and leadership.",
              "Keep every metric traceable back to the source.",
              "Ship a consistent story faster, with less rework.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-secondary/55 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-4 sm:grid-cols-2"
        >
          {rows.map((row, i) => (
            <motion.article
              key={row.title}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl border border-border bg-gradient-to-b from-white to-[#fffaf7] p-5 shadow-subtle"
            >
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 6 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <row.icon className="h-5 w-5" aria-hidden />
              </motion.div>
              <h3 className="mt-3 text-base font-bold text-foreground">{row.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{row.text}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
