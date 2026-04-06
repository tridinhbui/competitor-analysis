"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Sparkles, FileOutput } from "lucide-react";

const steps = [
  {
    id: "01",
    title: "Enter a ticker",
    body: "Start with symbols like AAPL, TSLA, or any SEC-listed name.",
    icon: Search,
  },
  {
    id: "02",
    title: "Extract latest 10-Q automatically",
    body: "AI pipeline ingests, maps, and validates key statement lines from SEC.",
    icon: Sparkles,
  },
  {
    id: "03",
    title: "Review, chat, and export",
    body: "Read the dashboard, ask AI follow-ups, then export to Excel or deck format.",
    icon: FileOutput,
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="border-y border-slate-200/80 bg-slate-50/50 py-14 sm:py-16" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 id="how-it-works-heading" className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Three steps. Zero spreadsheet chaos.
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.article
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-subtle sm:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90">{s.id}</p>
              <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </motion.article>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/analyze"
            className="inline-flex rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-800 shadow-subtle transition hover:border-slate-300 hover:bg-slate-50"
          >
            Open Analyze workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
