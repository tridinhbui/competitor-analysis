"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Sparkles, FileOutput } from "lucide-react";

const steps = [
  {
    id: "01",
    title: "Load the quarter",
    body: "Start from a ticker, a 10-Q PDF, or the filing set the CFO office is already working from.",
    icon: Search,
  },
  {
    id: "02",
    title: "Build the management-ready model",
    body: "The platform extracts statement lines, computes finance metrics, and organizes them into one workbook.",
    icon: Sparkles,
  },
  {
    id: "03",
    title: "Prepare the external narrative",
    body: "Review peer gaps, pressure-test guidance, answer analyst questions, and export executive-ready materials.",
    icon: FileOutput,
  },
] as const;

export function HowItWorksSection() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } },
  } as const;

  return (
    <section className="border-y border-border bg-secondary/60 py-14 sm:py-16" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
          <h2 id="how-it-works-heading" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Three steps that shorten the finance cycle.
          </h2>
        </div>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-4 md:grid-cols-3"
        >
          {steps.map((s, i) => (
            <motion.article
              key={s.id}
              variants={{
                hidden: { opacity: 0, y: 18 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl border border-border bg-white/95 p-5 shadow-subtle backdrop-blur-sm sm:p-6"
            >
              <motion.p
                animate={{ opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/90"
              >
                {s.id}
              </motion.p>
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 6.2 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                className="mt-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
              >
                <s.icon className="h-5 w-5" aria-hidden />
              </motion.div>
              <h3 className="mt-3 text-base font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.article>
          ))}
        </motion.div>
        <div className="mt-8 text-center">
          <Link
            href="/analyze"
            className="inline-flex rounded-full border border-[#e7c7b7] bg-white px-5 py-2 text-xs font-semibold text-[#8c3a15] shadow-subtle transition hover:border-[#cc521d]/35 hover:bg-[#fff6f1]"
          >
            Open the workspace
          </Link>
        </div>
      </div>
    </section>
  );
}
