"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type TickerAccent = "blue";

export interface MockTicker {
  symbol: string;
  price: string;
  changePct: number;
  /** Normalized 0-1 sparkline points */
  spark: number[];
  accent?: TickerAccent;
}

export const DEMO_TICKERS: MockTicker[] = [
  { symbol: "PORK", price: "102.4", changePct: 0.46, spark: [0.45, 0.52, 0.48, 0.61, 0.55, 0.68, 0.72, 0.65, 0.78, 0.82] },
  { symbol: "BACON", price: "86.3", changePct: -0.21, spark: [0.82, 0.78, 0.8, 0.74, 0.76, 0.71, 0.73, 0.69, 0.72, 0.68] },
  { symbol: "DELI", price: "74.8", changePct: 1.12, spark: [0.5, 0.48, 0.52, 0.49, 0.55, 0.53, 0.58, 0.61, 0.59, 0.64], accent: "blue" },
  { symbol: "HOTDOG", price: "61.9", changePct: 0.33, spark: [0.62, 0.64, 0.61, 0.66, 0.63, 0.67, 0.7, 0.68, 0.72, 0.75] },
  { symbol: "HAM", price: "88.1", changePct: -0.54, spark: [0.7, 0.72, 0.69, 0.71, 0.68, 0.65, 0.67, 0.64, 0.66, 0.63] },
  { symbol: "PROTEIN", price: "119.7", changePct: 0.18, spark: [0.55, 0.56, 0.54, 0.57, 0.56, 0.58, 0.57, 0.59, 0.6, 0.58], accent: "blue" },
];

function getTickerAccentClasses(ticker: MockTicker) {
  if (ticker.accent === "blue") {
    return {
      symbol: "text-blue-700",
      change: "text-blue-600",
      spark: "stroke-blue-500/80",
    };
  }

  if (ticker.changePct >= 0) {
    return {
      symbol: "text-foreground",
      change: "text-primary",
      spark: "stroke-primary/85",
    };
  }

  return {
    symbol: "text-foreground",
    change: "text-rose-600",
    spark: "stroke-rose-500/75",
  };
}

function MiniSparkline({ points, strokeClassName }: { points: number[]; strokeClassName: string }) {
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
        className={cn(strokeClassName)}
      />
    </svg>
  );
}

export function MarketStrip() {
  return (
    <div
      className="relative w-full overflow-hidden border-b border-border bg-white/60 backdrop-blur-md"
      role="region"
      aria-label="Simulated category indicators for demonstration"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white/95 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white/95 to-transparent" />
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 shadow-subtle">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Category pulse</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DEMO_TICKERS.map((ticker) => {
            const pos = ticker.changePct >= 0;
            const accentClasses = getTickerAccentClasses(ticker);

            return (
              <div
                key={ticker.symbol}
                className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-1.5 shadow-subtle"
              >
                <span className={cn("text-[11px] font-bold tabular-nums", accentClasses.symbol)}>{ticker.symbol}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{ticker.price}</span>
                <span className={cn("text-[10px] font-semibold tabular-nums", accentClasses.change)}>
                  {pos ? "+" : ""}
                  {ticker.changePct.toFixed(2)}%
                </span>
                <MiniSparkline points={ticker.spark} strokeClassName={accentClasses.spark} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only">Figures shown are illustrative only and do not reflect live data.</p>
    </div>
  );
}
