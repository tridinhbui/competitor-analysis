"use client";

import { BarChart3, Bot, FileOutput, FileSpreadsheet, Gauge } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "Q&A Copilot",
    body: "Check talking points before the call.",
    icon: Bot,
  },
  {
    title: "Peer Workspace",
    body: "Compare the quarter with peers in one workbook.",
    icon: BarChart3,
  },
  {
    title: "Guidance Bridge",
    body: "Turn filings into editable models.",
    icon: FileSpreadsheet,
  },
  {
    title: "Exports",
    body: "Ship Excel, decks, and short summaries.",
    icon: FileOutput,
  },
] as const;

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16" aria-labelledby="features-heading">
      <div className="mb-10 text-center">
        <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Everything needed before the call
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Built for teams that want speed without losing auditability.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f, i) => (
          <motion.article
            key={f.title}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="group rounded-3xl border border-border bg-white p-5 shadow-subtle transition-all hover:-translate-y-0.5 hover:shadow-elevation sm:p-6"
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <f.icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Gauge className="h-3 w-3" aria-hidden />
              Core
            </div>
            <h3 className="text-base font-bold text-foreground">{f.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{f.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
