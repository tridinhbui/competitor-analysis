"use client";

import { useState } from "react";
import type { BSItem, FootnoteItem, IncomeStatement } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { Search, ArrowUpRight, XCircle } from "lucide-react";

export function KpiCell({
  label,
  value,
  highlight,
  traceable,
  onClick,
}: {
  label: string;
  value: string;
  highlight?: number | null;
  traceable?: boolean;
  onClick?: () => void;
}) {
  const valueClass = cn(
    "mt-0.5 text-sm font-bold tabular-nums sm:text-base",
    highlight != null
      ? highlight > 0
        ? "text-slate-900"
        : highlight < 0
          ? "text-red-600"
          : "text-slate-900"
      : "text-slate-900",
  );
  return (
    <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      {traceable && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="group mt-0.5 flex w-full items-center justify-between gap-1 rounded-md text-left transition hover:bg-yellow-50/80"
        >
          <span className={valueClass}>{value}</span>
          <Search className="h-3.5 w-3.5 shrink-0 text-yellow-600 opacity-0 transition group-hover:opacity-70" aria-hidden />
        </button>
      ) : (
        <p className={valueClass}>{value}</p>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-white p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
            <button
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              <XCircle className="h-3.5 w-3.5" /> Close
            </button>
          </div>
          <div className="text-base">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
        >
          <ArrowUpRight className="h-3 w-3" /> Expand
        </button>
      </div>
      {children}
    </div>
  );
}

export function RatioCard({
  label,
  value,
  traceable,
  onClick,
}: {
  label: string;
  value: string;
  traceable?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-slate-50 px-3 py-2.5",
        traceable && onClick && "transition hover:bg-yellow-50/80",
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {traceable && onClick ? (
        <button type="button" onClick={onClick} className="group mt-0.5 flex w-full items-center justify-between gap-1 text-left">
          <span className="text-sm font-bold tabular-nums text-slate-900">{value}</span>
          <Search className="h-3 w-3 shrink-0 text-yellow-600 opacity-0 transition group-hover:opacity-70" aria-hidden />
        </button>
      ) : (
        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      )}
    </div>
  );
}

export function MetricTable({
  rows,
  compact,
  onRowClick,
}: {
  rows: Array<{ label: string; value: string; bold?: boolean; dim?: boolean; sub?: string; traceable?: boolean }>;
  compact?: boolean;
  onRowClick?: (label: string) => void;
}) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows
          .filter((r) => r.value !== "—" || !compact)
          .map((r, i) => {
            const clickable = r.traceable && onRowClick;
            return (
              <tr
                key={i}
                onClick={clickable ? () => onRowClick(r.label) : undefined}
                className={cn(
                  "border-b border-slate-100 last:border-b-0",
                  r.bold && "bg-slate-50/50",
                  clickable && "group cursor-pointer transition hover:border-yellow-200 hover:bg-yellow-50/60",
                )}
              >
                <td
                  className={cn(
                    compact ? "px-1 py-1" : "px-2 py-1.5",
                    r.bold ? "font-bold text-slate-800" : r.dim ? "text-slate-400" : "text-slate-600",
                    clickable && "group-hover:text-yellow-800",
                  )}
                >
                  {r.label}
                  {clickable && (
                    <Search className="ml-1 inline h-3 w-3 text-yellow-600 opacity-0 transition-opacity group-hover:opacity-60" />
                  )}
                </td>
                <td
                  className={cn(
                    "text-right tabular-nums",
                    compact ? "px-1 py-1" : "px-2 py-1.5",
                    r.bold ? "font-bold text-slate-900" : "font-semibold text-slate-700",
                  )}
                >
                  {r.value}
                  {r.sub && <span className="ml-1.5 text-[10px] font-normal text-slate-400">{r.sub}</span>}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

export function IncomeStatementTable({
  inc,
  onRowClick,
}: {
  inc: IncomeStatement;
  onRowClick?: (label: string) => void;
}) {
  const lines: Array<{
    label: string;
    value: number | null;
    bold?: boolean;
    dim?: boolean;
    marginLabel?: string;
    margin?: number | null;
    indent?: boolean;
  }> = [
    { label: "Revenue", value: inc.revenue, bold: true },
    { label: "Cost of Revenue", value: inc.costOfRevenue ? -inc.costOfRevenue : null, dim: true },
    { label: "Gross Profit", value: inc.grossProfit, bold: true, marginLabel: "Gross Margin", margin: inc.grossMargin },
    { label: "SG&A Expense", value: inc.sgaExpense ? -inc.sgaExpense : null, indent: true, dim: true },
    { label: "R&D Expense", value: inc.rdExpense ? -inc.rdExpense : null, indent: true, dim: true },
    {
      label: "Operating Income",
      value: inc.operatingIncome,
      bold: true,
      marginLabel: "OP Margin",
      margin: inc.operatingMargin,
    },
    { label: "D&A", value: inc.depreciation != null ? inc.depreciation : null, indent: true, dim: true },
    { label: "EBITDA", value: inc.ebitda, bold: true, marginLabel: "EBITDA Margin", margin: inc.ebitdaMargin },
    { label: "Interest Expense", value: inc.interestExpense ? -inc.interestExpense : null, indent: true, dim: true },
    { label: "Income Tax", value: inc.incomeTax ? -inc.incomeTax : null, indent: true, dim: true },
    { label: "Net Income", value: inc.netIncome, bold: true, marginLabel: "Net Margin", margin: inc.netMargin },
  ];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-slate-200">
          <th className="px-3 py-2 text-left font-semibold text-slate-500">Line Item</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">$M</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">Margin</th>
        </tr>
      </thead>
      <tbody>
        {lines
          .filter((l) => l.value != null)
          .map((l, i) => {
            const clickable = !!onRowClick;
            return (
              <tr
                key={i}
                onClick={clickable ? () => onRowClick(l.label) : undefined}
                className={cn(
                  "border-b border-slate-100",
                  l.bold && "bg-slate-50/50",
                  clickable && "cursor-pointer transition hover:bg-yellow-50/60",
                )}
              >
                <td
                  className={cn(
                    "px-3 py-1.5",
                    l.indent && "pl-6",
                    l.bold ? "font-bold text-slate-800" : l.dim ? "text-slate-400" : "text-slate-600",
                  )}
                >
                  {l.label}
                  {clickable && <Search className="ml-1 inline h-3 w-3 text-yellow-600 opacity-40" aria-hidden />}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums",
                    l.bold ? "font-bold text-slate-900" : "text-slate-700",
                    l.value != null && l.value < 0 && "text-red-500",
                  )}
                >
                  {l.value != null
                    ? l.value < 0
                      ? `(${Math.abs(l.value).toLocaleString()})`
                      : l.value.toLocaleString()
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {l.margin != null ? `${l.margin.toFixed(1)}%` : ""}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

export function DupontFactor({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[100px] rounded-lg px-4 py-3",
        highlight ? "border-2 border-indigo-300 bg-indigo-100" : "border border-slate-200 bg-slate-50",
      )}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-0.5 text-lg font-black tabular-nums", highlight ? "text-indigo-700" : "text-slate-900")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[9px] text-slate-400">{sub}</p>}
    </div>
  );
}

export function ZRow({ label, raw, weight }: { label: string; raw: number; weight: number }) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-1 text-xs text-slate-600">{label}</td>
      <td className="py-1 text-right text-[10px] tabular-nums text-slate-400">
        {raw.toFixed(3)} × {weight}
      </td>
      <td className="py-1 text-right text-xs font-semibold tabular-nums text-slate-800">{(raw * weight).toFixed(3)}</td>
    </tr>
  );
}

export function InterpretRow({
  color,
  label,
  desc,
  active,
}: {
  color: "emerald" | "amber" | "red";
  label: string;
  desc: string;
  active: boolean;
}) {
  const styles = {
    emerald: { border: "border-emerald-300 bg-emerald-50", text: "text-emerald-700" },
    amber: { border: "border-amber-300 bg-amber-50", text: "text-amber-700" },
    red: { border: "border-red-300 bg-red-50", text: "text-red-700" },
  };
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5",
        active ? styles[color].border : "border-slate-100 bg-white opacity-50",
      )}
    >
      <p className={cn("text-xs font-bold", active ? styles[color].text : "text-slate-500")}>{label}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </div>
  );
}

export function FootnoteCard({ fn, compact }: { fn: FootnoteItem; compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        fn.significance === "high"
          ? "border-red-200 bg-red-50/30"
          : fn.significance === "medium"
            ? "border-amber-200 bg-amber-50/30"
            : "border-slate-100",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className={cn("font-bold text-slate-800", compact ? "text-[10px]" : "text-xs")}>{fn.title}</p>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
            fn.type === "debt"
              ? "bg-purple-100 text-purple-700"
              : fn.type === "contingency"
                ? "bg-red-100 text-red-700"
                : fn.type === "tax"
                  ? "bg-cyan-100 text-cyan-700"
                  : fn.type === "revenue"
                    ? "bg-emerald-100 text-emerald-700"
                    : fn.type === "segment"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500",
          )}
        >
          {fn.type}
        </span>
      </div>
      <p className={cn("leading-relaxed text-slate-600", compact ? "text-[10px]" : "text-[11px]")}>{fn.summary}</p>
    </div>
  );
}

export function LineItemTable({
  title,
  items,
  onRowClick,
}: {
  title: string;
  items: BSItem[];
  onRowClick?: (item: BSItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex max-h-[300px] flex-col overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
        <h5 className="text-[11px] font-bold text-slate-700">{title}</h5>
        <span className="text-[10px] text-slate-400">{items.length} items</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 border-b border-slate-100 bg-white">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Line</th>
              <th className="px-3 py-1.5 text-right font-semibold text-slate-500">USD (M)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((item, i) => {
              const clickable = !!onRowClick;
              return (
                <tr
                  key={i}
                  onClick={clickable ? () => onRowClick(item) : undefined}
                  className={cn(clickable ? "cursor-pointer transition hover:bg-yellow-50/60" : "hover:bg-slate-50/50")}
                >
                  <td className="px-3 py-1">
                    <span className="block font-medium text-slate-700">{item.label}</span>
                    <span className="block max-w-[150px] truncate text-[9px] text-slate-400" title={item.source}>
                      {item.source}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1 text-right font-semibold tabular-nums",
                      item.value < 0 ? "text-red-500" : "text-slate-800",
                    )}
                  >
                    {item.value < 0 ? `(${Math.abs(item.value).toLocaleString()})` : item.value.toLocaleString()}
                    {clickable && <Search className="ml-1 inline h-3 w-3 text-yellow-600 opacity-40" aria-hidden />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
