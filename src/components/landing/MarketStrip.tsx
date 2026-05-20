"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type TickerAccent = "blue";

export interface MockTicker {
  symbol: string;
  price: string;
  changePct: number;
  spark: number[];
  accent?: TickerAccent;
}

export const DEMO_TICKERS: MockTicker[] = [
  { symbol: "TSN", price: "61.2", changePct: 1.24, spark: [0.45, 0.48, 0.46, 0.54, 0.59, 0.63, 0.62, 0.68, 0.74, 0.8] },
  { symbol: "HRL", price: "31.8", changePct: -0.42, spark: [0.82, 0.79, 0.8, 0.74, 0.71, 0.69, 0.66, 0.63, 0.61, 0.59] },
  { symbol: "PPC", price: "44.7", changePct: 0.96, spark: [0.5, 0.52, 0.51, 0.55, 0.56, 0.6, 0.64, 0.63, 0.67, 0.72], accent: "blue" },
  { symbol: "CAG", price: "29.4", changePct: 0.18, spark: [0.62, 0.61, 0.63, 0.64, 0.63, 0.65, 0.67, 0.68, 0.69, 0.7] },
  { symbol: "KHC", price: "36.6", changePct: -0.37, spark: [0.7, 0.72, 0.69, 0.67, 0.66, 0.65, 0.64, 0.62, 0.6, 0.58] },
  { symbol: "GIS", price: "70.1", changePct: 0.44, spark: [0.55, 0.54, 0.56, 0.58, 0.57, 0.6, 0.61, 0.63, 0.64, 0.66], accent: "blue" },
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
      aria-label="Simulated investor relations and peer signals for demonstration"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white/95 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white/95 to-transparent" />
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-5">
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 shadow-subtle">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Peer tape</span>
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
      <p className="sr-only">Figures shown are illustrative only and do not reflect live market data.</p>
    </div>
  );
}
