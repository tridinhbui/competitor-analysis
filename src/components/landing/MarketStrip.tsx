"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MockTicker {
  symbol: string;
  price: string;
  changePct: number;
  /** Normalized 0–1 sparkline points */
  spark: number[];
}

export const DEMO_TICKERS: MockTicker[] = [
  { symbol: "AAPL", price: "189.42", changePct: 0.46, spark: [0.45, 0.52, 0.48, 0.61, 0.55, 0.68, 0.72, 0.65, 0.78, 0.82] },
  { symbol: "MSFT", price: "378.91", changePct: -0.21, spark: [0.82, 0.78, 0.8, 0.74, 0.76, 0.71, 0.73, 0.69, 0.72, 0.68] },
  { symbol: "TSN", price: "58.34", changePct: 1.12, spark: [0.5, 0.48, 0.52, 0.49, 0.55, 0.53, 0.58, 0.61, 0.59, 0.64] },
  { symbol: "JPM", price: "198.07", changePct: 0.33, spark: [0.62, 0.64, 0.61, 0.66, 0.63, 0.67, 0.7, 0.68, 0.72, 0.75] },
  { symbol: "XOM", price: "112.55", changePct: -0.54, spark: [0.7, 0.72, 0.69, 0.71, 0.68, 0.65, 0.67, 0.64, 0.66, 0.63] },
  { symbol: "SPY", price: "502.18", changePct: 0.18, spark: [0.55, 0.56, 0.54, 0.57, 0.56, 0.58, 0.57, 0.59, 0.6, 0.58] },
];

function MiniSparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 48;
  const h = 18;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = 2;
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1 || 1)) * (w - pad * 2);
      const y = h - pad - ((p - min) / (max - min || 1)) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <path
        d={path}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(positive ? "stroke-emerald-500/80" : "stroke-rose-500/75")}
      />
    </svg>
  );
}

export function MarketStrip() {
  return (
    <div
      className="relative w-full overflow-hidden border-b border-slate-200/70 bg-white/50 backdrop-blur-md"
      role="region"
      aria-label="Simulated market prices for demonstration"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[oklch(0.999_0.002_250_/_0.95)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[oklch(0.999_0.002_250_/_0.95)] to-transparent" />
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1 shadow-subtle">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Demo</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DEMO_TICKERS.map((t) => {
            const pos = t.changePct >= 0;
            return (
              <div
                key={t.symbol}
                className="flex shrink-0 items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 shadow-subtle"
              >
                <span className="text-[11px] font-bold tabular-nums text-slate-800">{t.symbol}</span>
                <span className="text-[11px] tabular-nums text-slate-600">${t.price}</span>
                <span className={cn("text-[10px] font-semibold tabular-nums", pos ? "text-emerald-600" : "text-rose-600")}>
                  {pos ? "+" : ""}
                  {t.changePct.toFixed(2)}%
                </span>
                <MiniSparkline points={t.spark} positive={pos} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only">Prices shown are illustrative only and do not reflect live market data.</p>
    </div>
  );
}
