"use client";

import { AlertTriangle, GitBranch, Landmark, TrendingDown, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const metrics: Array<{
  label: string;
  value: string;
  icon: LucideIcon;
  hint: string;
  accent?: boolean;
}> = [
  { label: "Peer margin gap", value: "-180 bps", icon: TrendingDown, hint: "vs peer median" },
  { label: "Net leverage", value: "2.4x", icon: Landmark, hint: "Illustrative" },
  { label: "FCF bridge", value: "Ready", icon: GitBranch, hint: "Illustrative" },
  { label: "Analyst risk flags", value: "4", icon: AlertTriangle, hint: "Sample output", accent: true },
];

export function MockResultPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-gradient-to-br from-white to-secondary p-4 shadow-elevation"
      role="region"
      aria-label="Sample investor relations snapshot"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Executive snapshot</p>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Demo data</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.35 }}
            className={`rounded-xl border p-3 ${m.accent ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-white/90"}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <m.icon className="h-3 w-3" aria-hidden />
              {m.label}
            </div>
            <p className={`mt-1.5 text-lg font-bold tabular-nums tracking-tight ${m.accent ? "text-primary" : "text-foreground"}`}>
              {m.value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
