"use client";

import { motion } from "framer-motion";
import { Clock3, Gauge, ChartNoAxesCombined, ShieldCheck } from "lucide-react";

const metrics = [
  {
    label: "Hours saved per quarter",
    value: "18-30",
    sub: "Less time rebuilding decks, ratios, and peer packs",
    icon: Clock3,
  },
  {
    label: "Decision speed",
    value: "2-3x",
    sub: "Faster turnaround from filing read to leadership-ready output",
    icon: Gauge,
  },
  {
    label: "ROI payback",
    value: "< 1 qtr",
    sub: "When finance teams replace repetitive analyst work with one workflow",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Governance",
    value: "One source",
    sub: "A single, auditable model for finance, IR, and strategy",
    icon: ShieldCheck,
  },
] as const;

export function ImpactMetricsSection() {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  } as const;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:py-16" aria-labelledby="impact-metrics-heading">
      <div className="mb-8 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Impact metrics</p>
        <h2 id="impact-metrics-heading" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          What changes after the quarter moves into one workflow
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Illustrative economics for investor-grade finance teams: fewer handoffs, fewer duplicate models, and faster
          confidence in the story leadership takes to the market.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((metric, i) => (
          <motion.article
            key={metric.label}
            variants={{
              hidden: { opacity: 0, y: 18 },
              show: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border border-border bg-white/95 p-5 shadow-subtle backdrop-blur-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{metric.value}</p>
              </div>
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 5.8 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              >
                <metric.icon className="h-5 w-5" aria-hidden />
              </motion.div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{metric.sub}</p>
          </motion.article>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.55 }}
        className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-[#fff7f2] via-white to-[#fff2ea] p-6 shadow-subtle sm:p-7"
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Illustrative ROI</p>
            <h3 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">
              Replace scattered analyst work with one repeatable finance system
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The real value is not just faster report generation. It is reducing the number of times the same quarter
              is rebuilt across IR, FP&amp;A, strategy, and executive review, which cuts drag from the operating cycle
              and improves confidence in every external message.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 shadow-subtle">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
                <p className="mt-1 text-lg font-bold text-foreground">Manual quarter assembly</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">After</p>
                <p className="mt-1 text-lg font-bold text-primary">Single finance layer</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-border/70">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#cc521d] via-[#de6b36] to-[#f39a6d]"
                initial={{ width: "24%" }}
                whileInView={{ width: ["24%", "60%", "88%"] }}
                viewport={{ once: true }}
                transition={{ duration: 3.8, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-border bg-secondary/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rebuilds</p>
                <p className="mt-1 text-sm font-bold text-foreground">3-4x fewer</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence</p>
                <p className="mt-1 text-sm font-bold text-foreground">Higher</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cycle time</p>
                <p className="mt-1 text-sm font-bold text-foreground">Shorter</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
