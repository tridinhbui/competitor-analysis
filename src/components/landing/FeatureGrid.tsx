"use client";

import {
  BarChart3,
  Bot,
  FileSearch,
  FileSpreadsheet,
  Gauge,
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    title: "AI Financial Assistant",
    body: "Ask targeted questions on notes, debt covenants, and cash bridges, then get fast context-grounded answers.",
    icon: Bot,
  },
  {
    title: "Interactive Dashboards",
    body: "Reveal debt pressure and surface cash flow risk with statement-linked visuals that stay easy to read.",
    icon: BarChart3,
  },
  {
    title: "1-Click Export",
    body: "Export meeting-ready output to Excel and deck format in one move, with metrics already structured.",
    icon: FileSpreadsheet,
  },
  {
    title: "Real-time SEC Extraction",
    body: "Extract SEC filings in real time from EDGAR and watch pipeline progress before the dashboard is ready.",
    icon: FileSearch,
  },
] as const;

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16" aria-labelledby="features-heading">
      <div className="mb-10 text-center">
        <h2 id="features-heading" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Financial signal, not filing noise
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
          Built to cut scan time, expose risk fast, and push decision-ready numbers into your workflow.
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
            className="group rounded-3xl border border-slate-200/90 bg-white/85 p-5 shadow-subtle transition-all hover:-translate-y-0.5 hover:shadow-elevation sm:p-6"
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <f.icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Gauge className="h-3 w-3" aria-hidden />
              High signal
            </div>
            <h3 className="text-base font-bold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">{f.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
