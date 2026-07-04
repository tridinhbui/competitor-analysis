"use client";

import Link from "next/link";
import { ArrowRight, Play, Sparkles, ShieldCheck, Database } from "lucide-react";
import { motion } from "framer-motion";

interface LandingHeroProps {
  onTryDemo: () => void;
}

export function LandingHero({ onTryDemo }: LandingHeroProps) {
  const container = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: 0.09,
        delayChildren: 0.06,
      },
    },
  } as const;

  const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0 },
  } as const;

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-10 sm:pt-14 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="text-center lg:text-left"
      >
        <motion.div
          variants={item}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-subtle backdrop-blur-sm"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          Enterprise finance operating layer
        </motion.div>
        <motion.h1
          variants={item}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-balance font-black tracking-tight text-foreground lg:leading-[1.02]"
        >
          One system for <span className="brand-keyword">earnings prep</span>, investor messaging, and peer strategy
        </motion.h1>
        <motion.p
          variants={item}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground lg:mx-0"
        >
          Turn 10-Qs, scripts, and peer data into one operating layer for CFO, IR, FP&amp;A, and strategy teams that
          need a shared source of truth before the call.
        </motion.p>
        <motion.div
          variants={item}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start"
        >
          <Link
            href="/analyze"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#cc521d] px-7 text-sm font-semibold text-white shadow-elevation transition hover:bg-[#b7491a] focus-visible:ring-4 focus-visible:ring-[#cc521d]/25 focus-visible:outline-none"
          >
            Open the workspace
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onTryDemo}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#e7c7b7] bg-white px-7 text-sm font-semibold text-foreground shadow-subtle transition hover:border-[#cc521d]/35 hover:bg-[#fff6f1] focus-visible:ring-4 focus-visible:ring-[#cc521d]/15"
          >
            <Play className="h-4 w-4 text-primary" aria-hidden />
            Watch workflow demo
          </button>
        </motion.div>
        <motion.div
          variants={item}
          transition={{ duration: 0.5 }}
          className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:justify-start"
        >
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1">
            <ShieldCheck className="h-3 w-3 text-primary" aria-hidden />
            Shared source of truth
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1">
            <Database className="h-3 w-3 text-primary" aria-hidden />
            Board-ready output
          </span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18, rotateX: 3 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative min-h-[370px] overflow-hidden rounded-3xl border border-border bg-white p-5 shadow-float [transform-style:preserve-3d]"
      >
        <motion.div
          animate={{ x: [0, 8, 0], y: [0, -6, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-2xl"
        />
        <motion.div
          animate={{ x: [0, -10, 0], y: [0, 8, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="pointer-events-none absolute -left-10 bottom-6 h-36 w-36 rounded-full bg-[#f0e7e0] blur-xl"
        />

        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Operating snapshot</p>
        <div className="rounded-2xl border border-border bg-secondary/60 p-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Quarter view</span>
            <motion.span
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-sm font-bold text-foreground"
            >
              Q2 closeout
            </motion.span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Margin gap</p>
              <p className="mt-1 text-base font-bold text-foreground">-180 bps</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Guidance</p>
              <p className="mt-1 text-base font-bold text-primary">Ready</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Open questions</p>
              <p className="mt-1 text-base font-bold text-foreground">4 live</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Leverage</p>
              <p className="mt-1 text-base font-bold text-primary">2.4x</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/80">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#cc521d] via-[#de6b36] to-[#f39a6d]"
              initial={{ width: "20%" }}
              animate={{ width: ["20%", "68%", "92%"] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>

        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, 0.6, 0] }}
          transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
          className="floating-food absolute right-5 top-16 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground"
        >
          Q&A
        </motion.div>
        <motion.div
          animate={{ y: [0, -10, 0], rotate: [0, -0.5, 0] }}
          transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="floating-food absolute bottom-14 left-6 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground"
        >
          Guidance
        </motion.div>
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [0, 0.4, 0] }}
          transition={{ duration: 4.9, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
          className="floating-food absolute bottom-5 right-10 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground"
        >
          Peer deck
        </motion.div>
      </motion.div>
    </section>
  );
}
