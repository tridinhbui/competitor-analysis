"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Coins, RotateCcw } from "lucide-react";
import {
  readTokenUsage,
  resetTokenUsage,
  TOKEN_USAGE_EVENT,
  type TokenUsageSnapshot,
} from "@/lib/tokenUsageTracker";

const PANEL_OPEN_KEY = "token-tracker-open-v1";

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function TokenTrackerFab() {
  const [snapshot, setSnapshot] = useState<TokenUsageSnapshot>(() => readTokenUsage());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storedOpen = typeof window !== "undefined" ? window.localStorage.getItem(PANEL_OPEN_KEY) : null;
    if (storedOpen === "1") setOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    const onUsage = () => setSnapshot(readTokenUsage());
    window.addEventListener(TOKEN_USAGE_EVENT, onUsage);
    window.addEventListener("storage", onUsage);
    return () => {
      window.removeEventListener(TOKEN_USAGE_EVENT, onUsage);
      window.removeEventListener("storage", onUsage);
    };
  }, []);

  const averagePerRequest = useMemo(() => {
    if (!snapshot.requests) return 0;
    return Math.round(snapshot.totalTokens / snapshot.requests);
  }, [snapshot.requests, snapshot.totalTokens]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#cc521d] text-white shadow-float ring-2 ring-white/90 transition hover:scale-[1.03] hover:bg-[#b7491a] sm:bottom-5 sm:left-5"
        aria-label="Open token tracker"
        title={`Token tracker | ${formatNumber(snapshot.totalTokens)} total`}
      >
        <Coins className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 w-[220px] rounded-2xl border border-border bg-background/95 p-3 shadow-float backdrop-blur sm:bottom-5 sm:left-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#cc521d] text-white">
            <Coins className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold text-foreground">Token Tracker</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Collapse token tracker"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
          <p className="text-muted-foreground">Total</p>
          <p className="text-xs font-semibold text-foreground">{formatNumber(snapshot.totalTokens)}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
          <p className="text-muted-foreground">Requests</p>
          <p className="text-xs font-semibold text-foreground">{formatNumber(snapshot.requests)}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
          <p className="text-muted-foreground">Prompt</p>
          <p className="text-xs font-semibold text-foreground">{formatNumber(snapshot.promptTokens)}</p>
        </div>
        <div className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5">
          <p className="text-muted-foreground">Completion</p>
          <p className="text-xs font-semibold text-foreground">{formatNumber(snapshot.completionTokens)}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          Avg/request: <span className="font-semibold text-foreground">{formatNumber(averagePerRequest)}</span>
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetTokenUsage}
            className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Reset token tracker"
            title="Reset token tracker"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Minimize token tracker"
            title="Minimize"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
