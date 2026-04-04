"use client";

import Link from "next/link";
import { ArrowRight, Play, Sparkles, ShieldCheck, Database } from "lucide-react";
import { motion } from "framer-motion";

interface LandingHeroProps {
  onTryDemo: () => void;
}

export function LandingHero({ onTryDemo }: LandingHeroProps) {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 sm:pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="text-center lg:text-left">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-subtle backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          SEC filings · 10-Q PDF · Analyst-grade output
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-[1.05]"
        >
          Cut 90% of 10-Q reading time with AI extraction
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-slate-600 sm:text-base lg:mx-0"
        >
          Type a ticker. Extract SEC data. Reveal debt, cash flow, and dividend risk in seconds. Then ask AI and export
          in one click.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start"
        >
          <Link
            href="/analyze"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-[oklch(0.48_0.16_290)] px-7 text-sm font-semibold text-white shadow-elevation transition hover:opacity-95 focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none"
          >
            Analyze ticker now
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onTryDemo}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-7 text-sm font-semibold text-slate-800 shadow-subtle transition hover:border-slate-300 hover:bg-white focus-visible:ring-4 focus-visible:ring-slate-200"
          >
            <Play className="h-4 w-4 text-primary" aria-hidden />
            Watch live demo
          </button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:justify-start"
        >
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
            <ShieldCheck className="h-3 w-3 text-primary" aria-hidden />
            Powered by OpenAI
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
            <Database className="h-3 w-3 text-primary" aria-hidden />
            Data from SEC EDGAR
          </span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.6 }}
        className="rounded-3xl border border-slate-200/90 bg-white/85 p-4 shadow-float backdrop-blur-sm"
      >
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">8-second product loop</p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs font-semibold text-slate-400">Ticker</span>
            <motion.span
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-sm font-bold text-slate-900"
            >
              AAPL
            </motion.span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total debt</p>
              <p className="mt-1 text-base font-bold text-slate-900">$98.6B</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Free cash flow</p>
              <p className="mt-1 text-base font-bold text-emerald-600">$26.1B</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary via-indigo-500 to-emerald-500"
              initial={{ width: "20%" }}
              animate={{ width: ["20%", "75%", "92%"] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
