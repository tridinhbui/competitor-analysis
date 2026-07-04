"use client";

import { BarChart3, Bot, FileOutput, FileSpreadsheet, Gauge } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "Analyst Q&A Copilot",
    body: "Pressure-test talking points on leverage, liquidity, notes, covenants, and bridge logic before the question hits the CFO or IR team.",
    icon: Bot,
  },
  {
    title: "Peer Benchmark Workspace",
    body: "Stack the quarter against competitors in one live workbook so IR, finance, strategy, and leadership work from the same numbers.",
    icon: BarChart3,
  },
  {
    title: "Guidance and FP&A Bridges",
    body: "Convert scanned statements into editable models for scenario planning, margin walks, and board-level finance reviews.",
    icon: FileSpreadsheet,
  },
  {
    title: "Executive-ready Exports",
    body: "Ship Excel, board-deck inputs, and concise narrative summaries without rebuilding the story in separate files or hand-offs.",
    icon: FileOutput,
  },
] as const;

export function FeatureGrid() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
  } as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16" aria-labelledby="features-heading">
      <div className="mb-10 text-center">
        <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Everything the finance leadership team needs before the call
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Built for investor relations, FP&amp;A, corporate strategy, and executive finance teams that need speed,
          auditability, and one shared operating layer.
        </p>
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid gap-4 sm:grid-cols-2"
      >
        {features.map((f, i) => (
          <motion.article
            key={f.title}
            variants={{
              hidden: { opacity: 0, y: 18 },
              show: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="group rounded-3xl border border-border bg-white/95 p-5 shadow-subtle backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-elevation sm:p-6"
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 6 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"
            >
              <f.icon className="h-5 w-5" aria-hidden />
            </motion.div>
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3 w-3" aria-hidden />
              High signal
            </div>
            <h3 className="text-base font-bold text-foreground">{f.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{f.body}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}
