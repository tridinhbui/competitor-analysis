export const COLORS = {
  primary: "#4f46e5",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  slate: "#94a3b8",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
} as const;

export const PIE_PALETTE = [
  COLORS.primary,
  COLORS.blue,
  COLORS.emerald,
  COLORS.amber,
  COLORS.purple,
  COLORS.cyan,
];

export const fmt = (v: number | null | undefined, prefix = "$", suffix = "M"): string =>
  v != null ? `${prefix}${v.toLocaleString()}${suffix}` : "—";

export const fmtPct = (v: number | null | undefined): string =>
  v != null ? `${v.toFixed(1)}%` : "—";

export const fmtX = (v: number | null | undefined): string =>
  v != null ? `${v.toFixed(2)}x` : "—";

export const fmtNum = (v: number | null | undefined): string =>
  v != null ? v.toLocaleString() : "—";

export const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  background: "#fff",
  color: "#1e293b",
  boxShadow: "0 4px 12px rgb(0 0 0/0.08)",
};

export type TabId = "summary" | "income" | "balance" | "cashflow" | "insights" | "deep-dive";

export const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Executive Summary" },
  { id: "income", label: "Income & Margins" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "insights", label: "Insights" },
  { id: "deep-dive", label: "Deep Dive" },
];
