"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataSourceRow } from "@/types/dataSource";
import { METRIC_COLUMNS } from "@/types/dataSource";
import { Download, Save, Loader2, RotateCcw, Search } from "lucide-react";
import { HistoricalBackfillPanel } from "@/components/data-source/HistoricalBackfillPanel";
import { AnalysisCalculationsExplainer } from "@/components/data-source/AnalysisCalculationsExplainer";
import { RequireAuth } from "@/components/auth/RequireAuth";
// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Stored currency fields are USD millions; show $XM or $XB when ≥ 1,000M. */
function fmtCurrencyUsdMillions(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const billions = abs / 1000;
    return `${sign}$${billions.toLocaleString(undefined, { maximumFractionDigits: 3 })}B`;
  }
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

function fmtCell(value: number | null, format: string): string {
  if (value == null) return "—";
  if (format === "currency") return fmtCurrencyUsdMillions(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "ratio") return value.toFixed(2);
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Editable Cell
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  format,
  isEdited,
  onSave,
}: {
  value: number | null;
  format: string;
  isEdited: boolean;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const beginEdit = () => {
    setEditing(true);
    setText(value != null ? String(value) : "");
    setTimeout(() => ref.current?.focus(), 0);
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === "" || trimmed === "—") {
      onSave(null);
    } else {
      const n = parseFloat(trimmed);
      if (!isNaN(n)) onSave(n);
    }
  };

  if (editing) {
    return (
      <input
        ref={ref}
        className="w-full bg-transparent text-right text-xs tabular-nums outline-none ring-1 ring-primary/40 rounded px-1 py-0.5"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
      />
    );
  }

  return (
    <span
      className={`cursor-pointer tabular-nums ${isEdited ? "bg-amber-100 text-amber-900 px-1 rounded font-semibold" : ""}`}
      onDoubleClick={beginEdit}
      title="Double-click to edit"
    >
      {fmtCell(value, format)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DataSourcePage() {
  const [rows, setRows] = useState<DataSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Map<string, Map<string, number | null>>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-source");
      const data = await res.json();
      setRows(data.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tickers = [...new Set(rows.map((r) => r.ticker))].sort();
  const filtered = filter
    ? rows.filter((r) => r.ticker === filter || r.companyName.toLowerCase().includes(filter.toLowerCase()))
    : rows;

  const hasEdits = edits.size > 0;

  const handleCellEdit = (row: DataSourceRow, field: string, value: number | null) => {
    setEdits((prev) => {
      const next = new Map(prev);
      if (!next.has(row.id)) next.set(row.id, new Map());
      next.get(row.id)!.set(field, value);
      return next;
    });
    // Update local display
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    if (!hasEdits) return;
    setSaving(true);
    const editList: Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }> = [];
    for (const [id, fields] of edits) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      for (const [field, value] of fields) {
        editList.push({ id, ticker: row.ticker, periodEnd: row.periodEnd, field, value });
      }
    }
    await fetch("/api/data-source", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ edits: editList }) });
    setEdits(new Map());
    setSaving(false);
  };

  const handleExportCSV = () => {
    const headers = ["Ticker", "Company", "Quarter", "Period End", ...METRIC_COLUMNS.map((c) => c.label)];
    const csvRows = [headers.join(",")];
    for (const row of filtered) {
      const vals = [
        row.ticker,
        `"${row.companyName}"`,
        row.quarterLabel,
        row.periodEnd,
        ...METRIC_COLUMNS.map((c) => {
          const v = row[c.key];
          return v != null ? String(v) : "";
        }),
      ];
      csvRows.push(vals.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-source.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RequireAuth>
    <div className="mx-auto max-w-[98vw] px-4 py-6">
      <HistoricalBackfillPanel />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Centralized Data Source</h1>
          <p className="text-xs text-slate-500">
            {rows.length} filings from {tickers.length} companies · Double-click any cell to edit · Dollar columns are{" "}
            <span className="font-medium text-slate-700">USD millions ($M)</span>; totals <span className="font-medium text-slate-700">≥ $1B</span> show as{" "}
            <span className="font-medium text-slate-700">$XB</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              className="rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs shadow-sm outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="Filter by ticker..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {hasEdits && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save {edits.size} edit(s)
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={fetchData}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Refresh"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-slate-500">Loading data source…</span>
        </div>
      ) : (
        <div
          className="max-h-[38vh] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 text-white">
                <th className="sticky left-0 z-20 bg-slate-800 whitespace-nowrap px-3 py-2 text-left font-semibold">Ticker</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Company</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Quarter</th>
                {METRIC_COLUMNS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, ri) => {
                const rowEdits = edits.get(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-50 transition hover:bg-blue-50/30 ${ri % 2 === 1 ? "bg-slate-50/40" : ""}`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap px-3 py-1.5 font-semibold text-primary">
                      {row.ticker}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 max-w-[150px] truncate">
                      {row.companyName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{row.quarterLabel}</td>
                    {METRIC_COLUMNS.map((col) => (
                      <td key={col.key} className="whitespace-nowrap px-3 py-1.5 text-right">
                        <EditableCell
                          value={row[col.key] as number | null}
                          format={col.format}
                          isEdited={!!rowEdits?.has(col.key)}
                          onSave={(v) => handleCellEdit(row, col.key, v)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3 + METRIC_COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                    No data found. Analyze some companies first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <AnalysisCalculationsExplainer />
      </div>
    </div>
    </RequireAuth>
  );
}
