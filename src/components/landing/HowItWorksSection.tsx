"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Sparkles, FileOutput } from "lucide-react";

const steps = [
  {
    id: "01",
    title: "Add a company",
    body: "Start from a ticker, a PDF, or an existing filing set.",
    icon: Search,
  },
  {
    id: "02",
    title: "Run the model",
    body: "We extract lines, calculate metrics, and build the workbook.",
    icon: Sparkles,
  },
  {
    id: "03",
    title: "Share the output",
    body: "Review gaps, answer questions, and export the final pack.",
    icon: FileOutput,
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="border-y border-border bg-secondary/60 py-14 sm:py-16" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 id="how-it-works-heading" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Three steps. No scramble.
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
              className="rounded-3xl border border-border bg-white p-5 shadow-subtle sm:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90">{s.id}</p>
              <div className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-3 text-base font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.article>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/analyze"
            className="inline-flex rounded-full border border-[#e7c7b7] bg-white px-5 py-2 text-xs font-semibold text-[#8c3a15] shadow-subtle transition hover:border-[#cc521d]/35 hover:bg-[#fff6f1]"
          >
            Open app
          </Link>
        </div>
      </div>
    </section>
  );
}
