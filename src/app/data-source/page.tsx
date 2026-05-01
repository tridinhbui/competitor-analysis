"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataSourceRow } from "@/types/dataSource";
import { METRIC_COLUMNS } from "@/types/dataSource";
import { Download, Save, Loader2, RotateCcw, Search, AlertTriangle, X } from "lucide-react";
import * as XLSX from "xlsx-js-style";
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

const LABEL_TO_METRIC_KEY: Record<string, keyof DataSourceRow> = {
  Revenue: "revenue",
  "Cost of Revenue": "revenue",
  "Gross Profit": "grossProfit",
  "Operating Income": "operatingIncome",
  "OP Income": "operatingIncome",
  EBITDA: "ebitda",
  "Net Income": "netIncome",
  "Total Assets": "totalAssets",
  "Total Liabilities": "totalLiabilities",
  "Total Equity": "totalEquity",
  "Total Debt": "totalDebt",
  "Net Debt": "totalDebt",
  "Cash & Equivalents": "cashAndEquivalents",
  "Operating CF": "operatingCashFlow",
  "Operating Cash Flow": "operatingCashFlow",
  "Capital Expenditures": "capex",
  CapEx: "capex",
  "Free Cash Flow": "freeCashFlow",
  "Gross Margin": "grossMargin",
  "Operating Margin": "operatingMargin",
  "OP Margin": "operatingMargin",
  "Net Margin": "netMargin",
  "Debt / Equity": "debtToEquity",
  "D/E Ratio": "debtToEquity",
  "Current Ratio": "currentRatio",
  "SG&A Expense": "sgaExpense",
  "Interest Expense": "interestExpense",
  "EPS (Basic)": "epsBasic",
  "EPS (Diluted)": "epsDiluted",
  ROE: "roe",
  ROA: "roa",
  "FCF Margin": "fcfMargin",
};

const TAG_TO_METRIC_KEY: Record<string, keyof DataSourceRow> = {
  Revenues: "revenue",
  NetRevenues: "revenue",
  SalesRevenueGoodsNet: "revenue",
  GrossProfit: "grossProfit",
  OperatingIncome: "operatingIncome",
  OperatingIncomeLoss: "operatingIncome",
  NetIncome: "netIncome",
  NetIncomeLoss: "netIncome",
  ProfitLoss: "netIncome",
  Assets: "totalAssets",
  AssetsTotal: "totalAssets",
  Liabilities: "totalLiabilities",
  LiabilitiesTotal: "totalLiabilities",
  StockholdersEquity: "totalEquity",
  Equity: "totalEquity",
  GrossDebt: "totalDebt",
  CashAndCashEquivalents: "cashAndEquivalents",
  NetCashProvidedByOperatingActivities: "operatingCashFlow",
  OperatingCashFlow: "operatingCashFlow",
  CapitalExpenditure: "capex",
  PaymentsToAcquirePropertyPlantAndEquipment: "capex",
  FreeCashFlow: "freeCashFlow",
  DebtToEquityRatio: "debtToEquity",
  CurrentRatio: "currentRatio",
};

// ---------------------------------------------------------------------------
// Editable Cell
// ---------------------------------------------------------------------------

function EditableCell({
  rowId,
  field,
  value,
  format,
  isEdited,
  editable,
  activateEditKey,
  onActivateEditConsumed,
  onRequestBeginEdit,
  onSave,
}: {
  rowId: string;
  field: string;
  value: number | null;
  format: string;
  isEdited: boolean;
  editable: boolean;
  /** When this matches `${rowId}:${field}`, the cell opens for editing once. */
  activateEditKey: string | null;
  onActivateEditConsumed: () => void;
  onRequestBeginEdit: () => void;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activateEditKey || !editable) return;
    const k = `${rowId}:${field}`;
    if (activateEditKey !== k) return;
    setEditing(true);
    setText(value != null ? String(value) : "");
    setTimeout(() => ref.current?.focus(), 0);
    onActivateEditConsumed();
  }, [activateEditKey, rowId, field, editable, value, onActivateEditConsumed]);

  const beginEdit = () => {
    if (!editable) return;
    onRequestBeginEdit();
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
      className={`tabular-nums ${editable ? "cursor-pointer" : "cursor-default"} ${isEdited ? "bg-amber-100 text-amber-900 px-1 rounded font-semibold" : ""}`}
      onDoubleClick={editable ? beginEdit : undefined}
      title={editable ? "Double-click to edit (confirmation required)" : undefined}
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
  const [clearingWorkflow, setClearingWorkflow] = useState<"analyze" | "competitor" | null>(null);
  const [filter, setFilter] = useState("");
  const [edits, setEdits] = useState<Map<string, Map<string, number | null>>>(new Map());
  const [editingWorkflows, setEditingWorkflows] = useState<Record<"analyze" | "competitor", boolean>>({
    analyze: false,
    competitor: false,
  });
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const [targetMetricKey, setTargetMetricKey] = useState<keyof DataSourceRow | null>(null);
  const [editModal, setEditModal] = useState<{
    row: DataSourceRow;
    field: keyof DataSourceRow;
    label: string;
  } | null>(null);
  const [editConfirmText, setEditConfirmText] = useState("");
  const [activateEditKey, setActivateEditKey] = useState<string | null>(null);
  const consumeActivateEdit = useCallback(() => setActivateEditKey(null), []);
  const [traceQuery, setTraceQuery] = useState<{ ticker: string; periodEnd: string; metricLabel: string; metricTag: string }>({
    ticker: "",
    periodEnd: "",
    metricLabel: "",
    metricTag: "",
  });
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setTraceQuery({
      ticker: (p.get("ticker") ?? "").trim().toUpperCase(),
      periodEnd: (p.get("periodEnd") ?? "").trim(),
      metricLabel: (p.get("metricLabel") ?? "").trim(),
      metricTag: (p.get("metricTag") ?? "").trim(),
    });
  }, []);

  const traceTicker = traceQuery.ticker;
  const tracePeriodEnd = traceQuery.periodEnd;
  const traceMetricLabel = traceQuery.metricLabel;
  const traceMetricTag = traceQuery.metricTag;

  const tracedMetricKey = useMemo<keyof DataSourceRow | null>(() => {
    if (traceMetricTag && TAG_TO_METRIC_KEY[traceMetricTag]) return TAG_TO_METRIC_KEY[traceMetricTag];
    if (traceMetricLabel && LABEL_TO_METRIC_KEY[traceMetricLabel]) return LABEL_TO_METRIC_KEY[traceMetricLabel];
    return null;
  }, [traceMetricLabel, traceMetricTag]);

  useEffect(() => {
    if (traceTicker) setFilter(traceTicker);
  }, [traceTicker]);

  useEffect(() => {
    if (!traceTicker || !tracePeriodEnd || rows.length === 0) return;
    const targetRow = rows.find(
      (r) => r.ticker.toUpperCase() === traceTicker && r.periodEnd === tracePeriodEnd,
    );
    if (!targetRow) return;
    setTargetRowId(targetRow.id);
    setTargetMetricKey(tracedMetricKey);
    setTimeout(() => {
      rowRefs.current[targetRow.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [rows, tracePeriodEnd, traceTicker, tracedMetricKey]);

  const tickers = [...new Set(rows.map((r) => r.ticker))].sort();
  const filtered = filter
    ? rows.filter((r) => r.ticker === filter || r.companyName.toLowerCase().includes(filter.toLowerCase()))
    : rows;
  const analyzeRows = filtered.filter((r) => r.workflowOrigin === "analyze");
  const competitorRows = filtered.filter((r) => r.workflowOrigin === "competitor");

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
    try {
      const res = await fetch("/api/data-source", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: editList }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert((data as { error?: string }).error ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      setEdits(new Map());
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  const clearEditModal = () => {
    setEditModal(null);
    setEditConfirmText("");
  };

  const confirmEditModal = () => {
    if (!editModal) return;
    if (editConfirmText.trim().toLowerCase() !== "edit") {
      window.alert('Type the word "edit" (all lowercase) to confirm a manual override.');
      return;
    }
    setActivateEditKey(`${editModal.row.id}:${String(editModal.field)}`);
    clearEditModal();
  };

  const handleExportCSV = () => {
    const headers = ["Workflow", "Ticker", "Company", "Quarter", "Period End", ...METRIC_COLUMNS.map((c) => c.label)];
    const csvRows = [headers.join(",")];
    for (const row of filtered) {
      const vals = [
        row.workflowOrigin,
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

  const handleExportExcel = () => {
    const headers = ["Ticker", "Company", "Quarter", ...METRIC_COLUMNS.map((c) => c.label)];
    const toRows = (tableRows: DataSourceRow[]) =>
      tableRows.map((row) => [
        row.ticker,
        row.companyName,
        row.quarterLabel,
        ...METRIC_COLUMNS.map((c) => row[c.key] ?? ""),
      ]);

    const wb = XLSX.utils.book_new();
    const quickSheet = XLSX.utils.aoa_to_sheet([headers, ...toRows(analyzeRows)]);
    const competitorSheet = XLSX.utils.aoa_to_sheet([headers, ...toRows(competitorRows)]);

    const headerStyle = {
      fill: { fgColor: { rgb: "1E293B" } },
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
    };
    const styleHeaderRow = (ws: XLSX.WorkSheet) => {
      for (let col = 0; col < headers.length; col += 1) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!ws[addr]) continue;
        ws[addr].s = headerStyle;
      }
    };
    styleHeaderRow(quickSheet);
    styleHeaderRow(competitorSheet);

    XLSX.utils.book_append_sheet(wb, quickSheet, "Quick Analyze Records");
    XLSX.utils.book_append_sheet(wb, competitorSheet, "Competitor Analyze Records");
    XLSX.writeFile(wb, "data-source-tables.xlsx");
  };

  const handleClearTable = async (workflowOrigin: "analyze" | "competitor") => {
    const label = workflowOrigin === "analyze" ? "Quick Analyze Records" : "Competitor Analyze Records";
    const confirmationPhrase = `Delete ${label}`;
    const typed = window.prompt(
      `This will permanently delete all rows in ${label} from the database.\n\nType "${confirmationPhrase}" to confirm.`
    );
    if (typed == null) return;
    if (typed.trim() !== confirmationPhrase) {
      window.alert(`Deletion cancelled. You must type "${confirmationPhrase}" exactly.`);
      return;
    }

    setClearingWorkflow(workflowOrigin);
    try {
      const res = await fetch("/api/data-source", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowOrigin, confirmationText: typed.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to clear ${label}`);
      }

      setRows((prev) => prev.filter((row) => row.workflowOrigin !== workflowOrigin));
      setEdits((prev) => {
        const next = new Map(prev);
        for (const row of rows) {
          if (row.workflowOrigin === workflowOrigin) next.delete(row.id);
        }
        return next;
      });
    } finally {
      setClearingWorkflow(null);
    }
  };

  const handleToggleEditMode = (workflowOrigin: "analyze" | "competitor") => {
    setEditingWorkflows((prev) => ({
      ...prev,
      [workflowOrigin]: !prev[workflowOrigin],
    }));
  };

  const renderTable = (
    tableRows: DataSourceRow[],
    workflowOrigin: "analyze" | "competitor",
    title: string,
    description: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleToggleEditMode(workflowOrigin)}
            className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              editingWorkflows[workflowOrigin]
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Edit data
          </button>
          <button
            type="button"
            onClick={() => handleClearTable(workflowOrigin)}
            disabled={tableRows.length === 0 || clearingWorkflow != null}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearingWorkflow === workflowOrigin ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Clear all
          </button>
        </div>
      </div>
      <div className="max-h-[38vh] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
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
            {tableRows.map((row, ri) => {
              const rowEdits = edits.get(row.id);
              const cellEditable = editingWorkflows[workflowOrigin] && row.periodEnd !== "TTM";
              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[row.id] = el;
                  }}
                  className={`border-b border-slate-50 transition hover:bg-blue-50/30 ${
                    targetRowId === row.id
                      ? "bg-blue-50/70"
                      : ri % 2 === 1
                        ? "bg-slate-50/40"
                        : ""
                  }`}
                >
                  <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap px-3 py-1.5 font-semibold text-primary">
                    {row.ticker}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 max-w-[150px] truncate">
                    {row.companyName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{row.quarterLabel}</td>
                  {METRIC_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`whitespace-nowrap px-3 py-1.5 text-right ${
                        targetRowId === row.id && targetMetricKey === col.key
                          ? "rounded bg-amber-100 ring-1 ring-amber-300"
                          : ""
                      }`}
                    >
                      <EditableCell
                        rowId={row.id}
                        field={col.key}
                        value={row[col.key] as number | null}
                        format={col.format}
                        isEdited={!!rowEdits?.has(col.key)}
                        editable={cellEditable}
                        activateEditKey={activateEditKey}
                        onActivateEditConsumed={consumeActivateEdit}
                        onRequestBeginEdit={() =>
                          setEditModal({ row, field: col.key, label: col.label })
                        }
                        onSave={(v) => handleCellEdit(row, col.key, v)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={3 + METRIC_COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                  No data found in this table.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <RequireAuth>
    <div className="mx-auto max-w-[98vw] px-4 py-6">
      {editModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="data-source-edit-confirm-title"
        >
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <button
              type="button"
              onClick={clearEditModal}
              className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex gap-3">
              <AlertTriangle className="h-8 w-8 shrink-0 text-amber-500" aria-hidden />
              <div className="min-w-0">
                <h2 id="data-source-edit-confirm-title" className="text-sm font-bold text-slate-900">
                  Confirm manual override
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  You are about to edit <span className="font-semibold text-slate-800">{editModal.label}</span> for{" "}
                  <span className="font-semibold text-slate-800">{editModal.row.ticker}</span>{" "}
                  <span className="text-slate-500">({editModal.row.quarterLabel})</span>.
                </p>
                <p className="mt-2 text-xs font-medium text-amber-900/90">
                  Verify this value against the original filing PDF (or SEC source). Manual overrides replace extracted
                  figures in the database and linked analyses for this period.
                </p>
                <p className="mt-3 text-xs text-slate-600">
                  Type <span className="font-mono font-semibold text-slate-800">edit</span> to confirm you accept this
                  responsibility:
                </p>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                  value={editConfirmText}
                  onChange={(e) => setEditConfirmText(e.target.value)}
                  placeholder="edit"
                  autoComplete="off"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={clearEditModal}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmEditModal}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Continue editing
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Centralized Data Source</h1>
          <p className="text-xs text-slate-500">
            {rows.length} records from {tickers.length} companies · Turn on Edit data, then double-click a cell (TTM rows are read-only) · Dollar columns are{" "}
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
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <Download className="h-3 w-3" /> Excel
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
        <div className="space-y-6">
          {renderTable(analyzeRows, "analyze", "Quick Analyze Records", "Runs saved from the Quick Analyze workflow.")}
          {renderTable(competitorRows, "competitor", "Competitor Analyze Records", "Runs saved from workspace / competitor analysis flows.")}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <AnalysisCalculationsExplainer />
      </div>
    </div>
    </RequireAuth>
  );
}
