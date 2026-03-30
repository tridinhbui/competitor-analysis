"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModuleOutput, AnalysisTable, CellValue } from "@/lib/analysisModules";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  BarChart3,
  RefreshCw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Cell renderer
// ---------------------------------------------------------------------------

function formatCell(cell: CellValue): string {
  if (cell.value == null) return "—";
  if (cell.format === "text") return String(cell.value);

  const v = cell.value as number;
  switch (cell.format) {
    case "currency":
      return v < 0
        ? `($${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 1 })})`
        : `$${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
    case "percent":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return v.toFixed(2);
    case "number":
      return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
    default:
      return String(v);
  }
}

function DeltaBadge({ cell }: { cell: CellValue }) {
  if (cell.delta == null) return null;
  const isGood =
    cell.deltaType === "positive-good" ? cell.delta > 0 : cell.delta < 0;
  const isBad =
    cell.deltaType === "positive-good" ? cell.delta < 0 : cell.delta > 0;

  const color = isGood
    ? "text-emerald-600"
    : isBad
      ? "text-red-500"
      : "text-slate-400";
  const arrow = cell.delta > 0 ? "+" : "";

  return (
    <span className={`ml-1 text-[10px] font-medium ${color}`}>
      {arrow}
      {cell.format === "percent"
        ? `${cell.delta.toFixed(1)}pp`
        : cell.delta.toLocaleString(undefined, { maximumFractionDigits: 1 })}
    </span>
  );
}

function CellDisplay({ cell }: { cell: CellValue }) {
  return (
    <span className="tabular-nums">
      {formatCell(cell)}
      <DeltaBadge cell={cell} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Table renderer
// ---------------------------------------------------------------------------

function AnalysisTableView({ table }: { table: AnalysisTable }) {
  return (
    <div className="overflow-x-auto">
      <h5 className="mb-2 text-xs font-semibold text-slate-700">
        {table.title}
      </h5>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200">
            {table.headers.map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 font-semibold text-slate-500 ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className={`transition hover:bg-slate-50/80 ${
                row.highlight ? "bg-primary/5 font-medium" : ""
              }`}
            >
              <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">
                {row.label}
              </td>
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-3 py-1.5 text-right ${
                    cell.value == null ? "text-slate-300" : "text-slate-900"
                  }`}
                >
                  <CellDisplay cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.footnotes && table.footnotes.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {table.footnotes.map((f, i) => (
            <p key={i} className="text-[10px] text-slate-400">
              {f}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module card
// ---------------------------------------------------------------------------

function ModuleCard({ module }: { module: ModuleOutput }) {
  const [open, setOpen] = useState(module.available && module.tables.length > 0);

  const statusIcon = module.available ? (
    module.partial ? (
      <AlertTriangle className="h-4 w-4 text-amber-500" />
    ) : (
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    )
  ) : (
    <XCircle className="h-4 w-4 text-slate-300" />
  );

  const statusBadge = module.available ? (
    module.partial ? (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
        Partial
      </span>
    ) : (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        Ready
      </span>
    )
  ) : (
    <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 ring-1 ring-slate-100">
      Unavailable
    </span>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
      <button
        onClick={() => module.tables.length > 0 && setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/50"
      >
        {statusIcon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">
              {module.title}
            </span>
            {statusBadge}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {module.description}
          </p>
        </div>
        {module.tables.length > 0 && (
          <span className="shrink-0 text-slate-400">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        )}
      </button>

      {open && module.tables.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-4">
          {module.message && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {module.message}
            </p>
          )}
          {module.tables.map((table, i) => (
            <AnalysisTableView key={i} table={table} />
          ))}
        </div>
      )}

      {!open && module.message && !module.available && (
        <div className="border-t border-slate-50 px-4 py-2">
          <p className="text-[11px] text-slate-400">{module.message}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  ticker: string | null;
}

interface AnalysisResponse {
  ticker: string;
  companyName: string;
  quarterCount: number;
  peerCount: number;
  modules: ModuleOutput[];
}

export function AnalysisResults({ ticker }: Props) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/analysis?ticker=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setError(body.error || `HTTP ${resp.status}`);
        setData(null);
      } else {
        setData(await resp.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchAnalysis(ticker);
  }, [ticker, fetchAnalysis]);

  if (!ticker) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-subtle">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">
          Computing analysis modules…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const availableCount = data.modules.filter((m) => m.available).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-slate-900">
            Analysis Results
          </h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {availableCount}/{data.modules.length} modules
          </span>
        </div>
        <button
          onClick={() => fetchAnalysis(data.ticker)}
          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          title="Refresh analysis"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Summary bar */}
      <div className="rounded-lg bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">{data.companyName}</span>
        {" · "}
        {data.quarterCount} quarter(s) · {data.peerCount} peer(s)
      </div>

      {/* Module cards */}
      {data.modules.map((module) => (
        <ModuleCard key={module.moduleId} module={module} />
      ))}
    </div>
  );
}
