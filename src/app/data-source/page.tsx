"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataSourceRow } from "@/types/dataSource";
import type {
  DataSourceEditLogEntry,
  DataSourceWorkbookCellState,
  DataSourceWorkbookCellStyle,
  DataSourceWorkbookNumberFormat,
} from "@/types/dataSourceWorkbook";
import { AnalysisCalculationsExplainer } from "@/components/data-source/AnalysisCalculationsExplainer";
import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  DollarSign,
  Download,
  Eraser,
  Italic,
  Loader2,
  Percent,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import {
  columnIndexToLetter,
  computeWorkbookRows,
  EDITABLE_WORKBOOK_FIELDS,
  flattenWorkbookCellsForSave,
  getWorkbookStateForCell,
  normalizeCellState,
  normalizeCellStyle,
  serializeWorkbookRowCellStates,
  WORKBOOK_COLUMNS,
  type WorkbookNumericOverrideMap,
  type WorkbookRowCellStateMap,
} from "@/lib/dataSourceWorkbook";

type WorkflowOrigin = "analyze" | "competitor";
type ActiveSheetKey = WorkflowOrigin | "history";
type SortDirection = "asc" | "desc";

interface SortState {
  field: string;
  direction: SortDirection;
}

interface SelectionRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface HistorySnapshot {
  numericOverrides: WorkbookNumericOverrideMap;
  workbookCells: WorkbookRowCellStateMap;
}

interface EditConfirmState {
  workflow: WorkflowOrigin;
}

interface ContextMenuState {
  x: number;
  y: number;
}

const ROW_NUMBER_COLUMN_KEY = "__row__";
const COLUMN_WIDTHS_STORAGE_KEY = "data-source-column-widths-v1";
const EDIT_WARNING_STORAGE_KEY = "data-source-edit-warning-acknowledged-v1";
const CELL_MERGES_STORAGE_KEY = "data-source-cell-merges-v1";
const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 640;
const DEFAULT_METRIC_COLUMN_WIDTH = 130;
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  [ROW_NUMBER_COLUMN_KEY]: 56,
  ticker: 90,
  companyName: 220,
  quarterLabel: 140,
  periodEnd: 110,
};

function getDefaultColumnWidth(field: string): number {
  return DEFAULT_COLUMN_WIDTHS[field] ?? DEFAULT_METRIC_COLUMN_WIDTH;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getRowFieldValue(
  row: DataSourceRow,
  field: string,
): string | number | null {
  const value = (row as unknown as Record<string, string | number | null | undefined>)[field];
  return value ?? null;
}

function fmtCurrencyUsdMillions(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const billions = abs / 1000;
    return `${sign}$${billions.toLocaleString(undefined, { maximumFractionDigits: 3 })}B`;
  }
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

function fmtCell(value: number | string | null | undefined, format?: string): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  if (format === "currency") return fmtCurrencyUsdMillions(value);
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "ratio") return value.toFixed(2);
  return value.toLocaleString();
}

const NUMBER_FORMAT_OPTIONS: Array<{ value: "auto" | DataSourceWorkbookNumberFormat; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "currency", label: "Currency ($M / $B)" },
  { value: "percent", label: "Percent" },
  { value: "decimal-2", label: "Number (2 dec.)" },
  { value: "integer", label: "Integer" },
  { value: "thousands", label: "Thousands (K)" },
];

function fmtCellWithOverride(
  value: number | string | null | undefined,
  columnFormat: string | undefined,
  userFormat: DataSourceWorkbookNumberFormat | null | undefined,
): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return value;
  switch (userFormat) {
    case "currency":
      return fmtCurrencyUsdMillions(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "decimal-2":
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "integer":
      return Math.round(value).toLocaleString();
    case "thousands":
      return `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
    default:
      return fmtCell(value, columnFormat);
  }
}

function getXlsxNumberFormatCode(userFormat: DataSourceWorkbookNumberFormat | null | undefined): string | null {
  switch (userFormat) {
    case "currency":
      return "\"$\"#,##0.00";
    case "percent":
      return "0.0%";
    case "decimal-2":
      return "#,##0.00";
    case "integer":
      return "#,##0";
    case "thousands":
      return "#,##0,\"K\"";
    default:
      return null;
  }
}

function normalizeWorkbookCellsPayload(
  payload: unknown,
): WorkbookRowCellStateMap {
  if (!payload || typeof payload !== "object") return {};

  const result: WorkbookRowCellStateMap = {};
  for (const [rowId, rowState] of Object.entries(payload as Record<string, unknown>)) {
    if (!rowState || typeof rowState !== "object") continue;
    const normalizedFields: Record<string, DataSourceWorkbookCellState> = {};
    for (const [field, state] of Object.entries(rowState as Record<string, unknown>)) {
      const normalized = normalizeCellState(state as DataSourceWorkbookCellState | null | undefined);
      if (normalized) normalizedFields[field] = normalized;
    }
    if (Object.keys(normalizedFields).length > 0) {
      result[rowId] = normalizedFields;
    }
  }

  return result;
}

function normalizeSelection(selection: SelectionRange): SelectionRange {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

function isCellInSelection(
  selection: SelectionRange | null,
  rowIndex: number,
  colIndex: number,
): boolean {
  if (!selection) return false;
  const normalized = normalizeSelection(selection);
  return (
    rowIndex >= normalized.startRow &&
    rowIndex <= normalized.endRow &&
    colIndex >= normalized.startCol &&
    colIndex <= normalized.endCol
  );
}

function updateNumericOverride(
  map: WorkbookNumericOverrideMap,
  rowId: string,
  field: string,
  value: number | null,
  remove = false,
): WorkbookNumericOverrideMap {
  const next = deepClone(map);
  const rowState = { ...(next[rowId] ?? {}) };

  if (remove) {
    delete rowState[field];
  } else {
    rowState[field] = value;
  }

  if (Object.keys(rowState).length > 0) {
    next[rowId] = rowState;
  } else {
    delete next[rowId];
  }

  return next;
}

function flattenNumericOverrides(
  map: WorkbookNumericOverrideMap,
  rows: DataSourceRow[],
): Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }> {
  const rowLookup = new Map(rows.map((row) => [row.id, row]));
  const payloads: Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }> = [];

  for (const [rowId, fieldMap] of Object.entries(map)) {
    const row = rowLookup.get(rowId);
    if (!row || row.periodEnd === "TTM") continue;
    for (const [field, value] of Object.entries(fieldMap)) {
      payloads.push({
        id: row.id,
        ticker: row.ticker,
        periodEnd: row.periodEnd,
        field,
        value,
      });
    }
  }

  return payloads;
}

function parseNumericInput(input: string): number | null {
  const cleaned = input.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortRows(
  rows: DataSourceRow[],
  sort: SortState | null,
): DataSourceRow[] {
  if (!sort) return rows;

  const next = [...rows];
  next.sort((left, right) => {
    const leftValue = getRowFieldValue(left, sort.field);
    const rightValue = getRowFieldValue(right, sort.field);

    const leftComparable =
      typeof leftValue === "number"
        ? leftValue
        : typeof leftValue === "string"
          ? leftValue.toLowerCase()
          : "";
    const rightComparable =
      typeof rightValue === "number"
        ? rightValue
        : typeof rightValue === "string"
          ? rightValue.toLowerCase()
          : "";

    if (leftComparable < rightComparable) return sort.direction === "asc" ? -1 : 1;
    if (leftComparable > rightComparable) return sort.direction === "asc" ? 1 : -1;
    return 0;
  });

  return next;
}

function buildXlsxStyle(
  style: DataSourceWorkbookCellStyle | null,
  fallbackAlign: "left" | "center" | "right",
): XLSX.CellStyle {
  const normalized = normalizeCellStyle(style);
  const xlsxStyle: XLSX.CellStyle = {
    alignment: {
      horizontal: normalized?.align ?? fallbackAlign,
      vertical: "center",
    },
  };

  if (
    normalized?.bold ||
    normalized?.italic ||
    normalized?.underline ||
    normalized?.strikethrough ||
    normalized?.textColor ||
    normalized?.fontSize ||
    normalized?.fontFamily
  ) {
    xlsxStyle.font = {
      ...(normalized.bold ? { bold: true } : {}),
      ...(normalized.italic ? { italic: true } : {}),
      ...(normalized.underline ? { underline: true } : {}),
      ...(normalized.strikethrough ? { strike: true } : {}),
      ...(normalized.textColor ? { color: { rgb: normalized.textColor.replace("#", "").toUpperCase() } } : {}),
      ...(normalized.fontSize ? { sz: normalized.fontSize } : {}),
      ...(normalized.fontFamily ? { name: normalized.fontFamily } : {}),
    };
  }

  if (normalized?.fillColor) {
    xlsxStyle.fill = {
      fgColor: { rgb: normalized.fillColor.replace("#", "").toUpperCase() },
    };
  }

  if (normalized?.borderTop || normalized?.borderBottom || normalized?.borderLeft || normalized?.borderRight) {
    const sideStyle = { style: "thin" as const, color: { rgb: "94A3B8" } };
    xlsxStyle.border = {
      ...(normalized.borderTop ? { top: sideStyle } : {}),
      ...(normalized.borderBottom ? { bottom: sideStyle } : {}),
      ...(normalized.borderLeft ? { left: sideStyle } : {}),
      ...(normalized.borderRight ? { right: sideStyle } : {}),
    };
  }

  return xlsxStyle;
}

function ToolbarButton({
  active = false,
  disabled = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export default function DataSourcePage() {
  const workbookRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialWorkbookCellsRef = useRef<string>("{}");

  const [baseRows, setBaseRows] = useState<DataSourceRow[]>([]);
  const [workbookCells, setWorkbookCells] = useState<WorkbookRowCellStateMap>({});
  const [numericOverrides, setNumericOverrides] = useState<WorkbookNumericOverrideMap>({});
  const [editLog, setEditLog] = useState<DataSourceEditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheetKey>("analyze");
  const [filter, setFilter] = useState("");
  const [sortByWorkflow, setSortByWorkflow] = useState<Record<WorkflowOrigin, SortState | null>>({
    analyze: null,
    competitor: null,
  });
  const [editingEnabled, setEditingEnabled] = useState<Record<WorkflowOrigin, boolean>>({
    analyze: false,
    competitor: false,
  });
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [inlineDraft, setInlineDraft] = useState("");
  const [formulaDraft, setFormulaDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [editConfirm, setEditConfirm] = useState<EditConfirmState | null>(null);
  const [editWarningAcknowledged, setEditWarningAcknowledged] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [cellMerges, setCellMerges] = useState<Record<WorkflowOrigin, Record<string, { rowSpan: number; colSpan: number }>>>({
    analyze: {},
    competitor: {},
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(EDIT_WARNING_STORAGE_KEY) === "true") {
      setEditWarningAcknowledged(true);
    }
    try {
      const stored = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        const sanitized: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed ?? {})) {
          if (
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= MIN_COLUMN_WIDTH &&
            value <= MAX_COLUMN_WIDTH
          ) {
            sanitized[key] = Math.round(value);
          }
        }
        if (Object.keys(sanitized).length > 0) setColumnWidths(sanitized);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(columnWidths).length === 0) return;
    try {
      window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      // ignore quota errors
    }
  }, [columnWidths]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(CELL_MERGES_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return;
      const next: Record<WorkflowOrigin, Record<string, { rowSpan: number; colSpan: number }>> = {
        analyze: {},
        competitor: {},
      };
      for (const workflow of ["analyze", "competitor"] as WorkflowOrigin[]) {
        const map = (parsed as Record<string, unknown>)[workflow];
        if (!map || typeof map !== "object") continue;
        for (const [key, raw] of Object.entries(map as Record<string, unknown>)) {
          if (
            raw &&
            typeof raw === "object" &&
            typeof (raw as { rowSpan: unknown }).rowSpan === "number" &&
            typeof (raw as { colSpan: unknown }).colSpan === "number"
          ) {
            const rowSpan = Math.max(1, Math.min(50, Math.round((raw as { rowSpan: number }).rowSpan)));
            const colSpan = Math.max(1, Math.min(50, Math.round((raw as { colSpan: number }).colSpan)));
            if (rowSpan > 1 || colSpan > 1) next[workflow][key] = { rowSpan, colSpan };
          }
        }
      }
      setCellMerges(next);
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CELL_MERGES_STORAGE_KEY, JSON.stringify(cellMerges));
    } catch {
      // ignore quota errors
    }
  }, [cellMerges]);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    const handleClose = () => setContextMenu(null);

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [contextMenu]);

  const getColumnWidth = useCallback(
    (field: string) => columnWidths[field] ?? getDefaultColumnWidth(field),
    [columnWidths],
  );

  const totalTableWidth = useMemo(() => {
    let sum = getColumnWidth(ROW_NUMBER_COLUMN_KEY);
    for (const column of WORKBOOK_COLUMNS) sum += getColumnWidth(column.field);
    return sum;
  }, [getColumnWidth]);

  const handleColumnResizeStart = useCallback(
    (field: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = getColumnWidth(field);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + delta));
        setColumnWidths((prev) => ({ ...prev, [field]: Math.round(next) }));
      };

      const handleUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [getColumnWidth],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/data-source");
      const data = await response.json();
      const nextRows = Array.isArray(data.rows) ? (data.rows as DataSourceRow[]) : [];
      const nextWorkbookCells = normalizeWorkbookCellsPayload(data.workbookCells);
      const nextEditLog = Array.isArray(data.editLog) ? (data.editLog as DataSourceEditLogEntry[]) : [];
      setBaseRows(nextRows);
      setWorkbookCells(nextWorkbookCells);
      setEditLog(nextEditLog);
      setNumericOverrides({});
      setUndoStack([]);
      setRedoStack([]);
      setEditingCell(null);
      setContextMenu(null);
      setSelection(null);
      setFormulaDraft("");
      initialWorkbookCellsRef.current = serializeWorkbookRowCellStates(nextWorkbookCells);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const { rows: computedRows, formulaErrors } = useMemo(
    () => computeWorkbookRows(baseRows, numericOverrides, workbookCells),
    [baseRows, numericOverrides, workbookCells],
  );

  const latestFilingByWorkflow = useMemo(() => {
    const result: Record<WorkflowOrigin, DataSourceRow | null> = { analyze: null, competitor: null };
    for (const workflow of ["analyze", "competitor"] as WorkflowOrigin[]) {
      const candidates = computedRows.filter(
        (row) => row.workflowOrigin === workflow && row.periodEnd !== "TTM" && row.savedAt,
      );
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
      result[workflow] = candidates[0];
    }
    return result;
  }, [computedRows]);

  const currentRowsByWorkflow = useMemo(() => {
    const partition: Record<WorkflowOrigin, DataSourceRow[]> = { analyze: [], competitor: [] };
    for (const workflow of ["analyze", "competitor"] as WorkflowOrigin[]) {
      const latest = latestFilingByWorkflow[workflow];
      if (!latest) continue;
      partition[workflow] = computedRows.filter(
        (row) => row.workflowOrigin === workflow && row.ticker === latest.ticker,
      );
    }
    return partition;
  }, [computedRows, latestFilingByWorkflow]);

  const pastRowsByWorkflow = useMemo(() => {
    const partition: Record<WorkflowOrigin, DataSourceRow[]> = { analyze: [], competitor: [] };
    for (const workflow of ["analyze", "competitor"] as WorkflowOrigin[]) {
      const latest = latestFilingByWorkflow[workflow];
      partition[workflow] = computedRows.filter((row) => {
        if (row.workflowOrigin !== workflow) return false;
        if (!latest) return true;
        return row.ticker !== latest.ticker;
      });
    }
    return partition;
  }, [computedRows, latestFilingByWorkflow]);

  const sheetRows = currentRowsByWorkflow;

  const sheetRowNumbers = useMemo(
    () => ({
      analyze: Object.fromEntries(sheetRows.analyze.map((row, index) => [row.id, index + 1])),
      competitor: Object.fromEntries(sheetRows.competitor.map((row, index) => [row.id, index + 1])),
    }),
    [sheetRows],
  );

  const workbookSheets = useMemo(
    () => [
      {
        key: "analyze" as const,
        title: "Quick Analyze",
        description: latestFilingByWorkflow.analyze
          ? `Showing ${latestFilingByWorkflow.analyze.ticker} — latest upload (${latestFilingByWorkflow.analyze.quarterLabel}). Older filings live in the History tab.`
          : "No Quick Analyze upload yet. Upload a PDF in Quick Analyze to populate this sheet.",
        rows: sheetRows.analyze,
        accentClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
      },
      {
        key: "competitor" as const,
        title: "Competitor Analysis",
        description: latestFilingByWorkflow.competitor
          ? `Showing ${latestFilingByWorkflow.competitor.ticker} — latest upload (${latestFilingByWorkflow.competitor.quarterLabel}). Older filings live in the History tab.`
          : "No Competitor Analysis upload yet.",
        rows: sheetRows.competitor,
        accentClass: "border-blue-300 bg-blue-50 text-blue-700",
      },
    ],
    [latestFilingByWorkflow, sheetRows],
  );

  const activeWorkflow: WorkflowOrigin = activeSheet === "history" ? "analyze" : activeSheet;
  const activeSheetConfig =
    activeSheet === "history"
      ? workbookSheets[0]
      : workbookSheets.find((sheet) => sheet.key === activeSheet) ?? workbookSheets[0];

  const visibleRows = useMemo(() => {
    if (activeSheet === "history") return [] as DataSourceRow[];
    const filteredRows = activeSheetConfig.rows.filter((row) => {
      const query = filter.trim().toLowerCase();
      if (!query) return true;
      return (
        row.ticker.toLowerCase().includes(query) ||
        row.companyName.toLowerCase().includes(query) ||
        row.quarterLabel.toLowerCase().includes(query) ||
        row.periodEnd.toLowerCase().includes(query)
      );
    });

    return sortRows(filteredRows, sortByWorkflow[activeWorkflow]);
  }, [activeSheet, activeWorkflow, activeSheetConfig.rows, filter, sortByWorkflow]);

  const selectedRow = selection ? visibleRows[normalizeSelection(selection).endRow] : null;
  const selectedColumn = selection ? WORKBOOK_COLUMNS[normalizeSelection(selection).endCol] : null;
  const selectedField = selectedColumn?.field ?? null;
  const selectedCellState = selectedRow && selectedField
    ? getWorkbookStateForCell(workbookCells, selectedRow.id, selectedField)
    : null;
  const selectedStyle = normalizeCellStyle(selectedCellState?.style);
  const selectedCellError =
    selectedRow && selectedField ? formulaErrors[`${selectedRow.id}:${selectedField}`] ?? null : null;

  const focusWorkbook = useCallback(() => {
    workbookRef.current?.focus();
  }, []);

  const workbookCellChangeJson = useMemo(
    () => serializeWorkbookRowCellStates(workbookCells),
    [workbookCells],
  );
  const hasUnsavedChanges =
    Object.keys(numericOverrides).length > 0 ||
    workbookCellChangeJson !== initialWorkbookCellsRef.current;

  const hasFormulaErrors = Object.keys(formulaErrors).length > 0;

  useEffect(() => {
    if (visibleRows.length === 0) {
      setSelection(null);
      setEditingCell(null);
      return;
    }

    const defaultEditableCol = WORKBOOK_COLUMNS.findIndex((column) => column.editable);
    if (!selection) {
      setSelection({
        startRow: 0,
        endRow: 0,
        startCol: defaultEditableCol,
        endCol: defaultEditableCol,
      });
      return;
    }

    const normalized = normalizeSelection(selection);
    if (normalized.endRow >= visibleRows.length || normalized.startRow >= visibleRows.length) {
      setSelection({
        startRow: 0,
        endRow: 0,
        startCol: normalized.startCol,
        endCol: normalized.endCol,
      });
    }
  }, [activeSheet, selection, visibleRows]);

  useEffect(() => {
    if (!selectedRow || !selectedField) {
      setFormulaDraft("");
      return;
    }

    const currentState = getWorkbookStateForCell(workbookCells, selectedRow.id, selectedField);
    if (currentState?.formula && EDITABLE_WORKBOOK_FIELDS.has(selectedField)) {
      setFormulaDraft(currentState.formula);
      return;
    }

    const rawValue = getRowFieldValue(selectedRow, selectedField);
    setFormulaDraft(rawValue == null ? "" : String(rawValue));
  }, [selectedField, selectedRow, workbookCells, computedRows]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const pushHistory = useCallback(() => {
    const snapshot: HistorySnapshot = {
      numericOverrides: deepClone(numericOverrides),
      workbookCells: deepClone(workbookCells),
    };
    setUndoStack((prev) => [...prev.slice(-39), snapshot]);
    setRedoStack([]);
  }, [numericOverrides, workbookCells]);

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    setNumericOverrides(deepClone(snapshot.numericOverrides));
    setWorkbookCells(deepClone(snapshot.workbookCells));
    setEditingCell(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    const current: HistorySnapshot = {
      numericOverrides: deepClone(numericOverrides),
      workbookCells: deepClone(workbookCells),
    };
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-39), current]);
    applySnapshot(snapshot);
  }, [applySnapshot, numericOverrides, undoStack, workbookCells]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const snapshot = redoStack[redoStack.length - 1];
    const current: HistorySnapshot = {
      numericOverrides: deepClone(numericOverrides),
      workbookCells: deepClone(workbookCells),
    };
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-39), current]);
    applySnapshot(snapshot);
  }, [applySnapshot, numericOverrides, redoStack, workbookCells]);

  const persistEditWarningAcknowledged = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(EDIT_WARNING_STORAGE_KEY, "true");
    } catch {
      // ignore quota errors
    }
  }, []);

  const toggleEditMode = (workflow: WorkflowOrigin) => {
    if (editingEnabled[workflow]) {
      setEditingEnabled((prev) => ({ ...prev, [workflow]: false }));
      return;
    }
    if (editWarningAcknowledged) {
      setEditingEnabled((prev) => ({ ...prev, [workflow]: true }));
      return;
    }
    setEditConfirm({ workflow });
  };

  const confirmEnableEditing = () => {
    if (!editConfirm) return;
    setEditingEnabled((prev) => ({ ...prev, [editConfirm.workflow]: true }));
    setEditWarningAcknowledged(true);
    persistEditWarningAcknowledged();
    setEditConfirm(null);
  };

  const ensureEditingEnabled = useCallback((workflow: WorkflowOrigin): boolean => {
    if (editingEnabled[workflow]) return true;
    if (editWarningAcknowledged) {
      setEditingEnabled((prev) => ({ ...prev, [workflow]: true }));
      return true;
    }
    setEditConfirm({ workflow });
    return false;
  }, [editingEnabled, editWarningAcknowledged]);

  const getSelectionCells = useCallback(() => {
    if (!selection) return [];
    const normalized = normalizeSelection(selection);
    const cells: Array<{ row: DataSourceRow; rowIndex: number; field: string; colIndex: number }> = [];
    for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
      const row = visibleRows[rowIndex];
      if (!row) continue;
      for (let colIndex = normalized.startCol; colIndex <= normalized.endCol; colIndex += 1) {
        const field = WORKBOOK_COLUMNS[colIndex]?.field;
        if (!field) continue;
        cells.push({ row, rowIndex, field, colIndex });
      }
    }
    return cells;
  }, [selection, visibleRows]);

  const selectGridCell = useCallback(
    (
      rowIndex: number,
      colIndex: number,
      options?: {
        extend?: boolean;
        mergeInfo?: { rowSpan: number; colSpan: number } | undefined;
      },
    ) => {
      setSelection((prev) => {
        if (options?.extend && prev) {
          return {
            ...prev,
            endRow: rowIndex,
            endCol: colIndex,
          };
        }

        const endRow = options?.mergeInfo ? rowIndex + options.mergeInfo.rowSpan - 1 : rowIndex;
        const endCol = options?.mergeInfo ? colIndex + options.mergeInfo.colSpan - 1 : colIndex;

        return {
          startRow: rowIndex,
          endRow,
          startCol: colIndex,
          endCol,
        };
      });
    },
    [],
  );

  const commitCellInput = useCallback(
    (row: DataSourceRow, field: string, input: string, trackHistory = true) => {
      if (!EDITABLE_WORKBOOK_FIELDS.has(field) || row.periodEnd === "TTM") return false;
      if (!ensureEditingEnabled(activeWorkflow)) return false;

      const trimmed = input.trim();
      const currentState = getWorkbookStateForCell(workbookCells, row.id, field);
      let nextOverrides = numericOverrides;
      let nextWorkbookCells = workbookCells;

      if (trackHistory) pushHistory();

      if (trimmed.startsWith("=") && trimmed.length > 1) {
        nextOverrides = updateNumericOverride(nextOverrides, row.id, field, null, true);
        nextWorkbookCells = {
          ...nextWorkbookCells,
        };
        const updatedState: DataSourceWorkbookCellState = {
          ...(currentState?.style ? { style: currentState.style } : {}),
          formula: trimmed,
        };
        nextWorkbookCells[row.id] = {
          ...(nextWorkbookCells[row.id] ?? {}),
          [field]: updatedState,
        };
      } else {
        const parsed = parseNumericInput(trimmed);
        if (trimmed && parsed == null) {
          window.alert("Please enter a valid number or a formula starting with =.");
          return false;
        }

        nextOverrides = updateNumericOverride(nextOverrides, row.id, field, parsed);
        const nextCellState = normalizeCellState({
          ...(currentState?.style ? { style: currentState.style } : {}),
        });

        const rowState = { ...(nextWorkbookCells[row.id] ?? {}) };
        if (nextCellState) {
          rowState[field] = nextCellState;
          nextWorkbookCells = { ...nextWorkbookCells, [row.id]: rowState };
        } else {
          delete rowState[field];
          if (Object.keys(rowState).length > 0) {
            nextWorkbookCells = { ...nextWorkbookCells, [row.id]: rowState };
          } else {
            const cloned = { ...nextWorkbookCells };
            delete cloned[row.id];
            nextWorkbookCells = cloned;
          }
        }
      }

      setNumericOverrides(nextOverrides);
      setWorkbookCells(nextWorkbookCells);
      setEditingCell(null);
      return true;
    },
    [activeWorkflow, ensureEditingEnabled, numericOverrides, pushHistory, workbookCells],
  );

  const applyStylePatch = useCallback(
    (patch: Partial<DataSourceWorkbookCellStyle>) => {
      const cells = getSelectionCells();
      if (cells.length === 0) return;
      if (!ensureEditingEnabled(activeWorkflow)) return;

      pushHistory();
      let nextWorkbookCells = workbookCells;

      for (const cell of cells) {
        const currentState = getWorkbookStateForCell(nextWorkbookCells, cell.row.id, cell.field);
        const currentStyle = normalizeCellStyle(currentState?.style) ?? {};
        const nextStyle = normalizeCellStyle({ ...currentStyle, ...patch });
        const nextState = normalizeCellState({
          ...(currentState?.formula ? { formula: currentState.formula } : {}),
          ...(nextStyle ? { style: nextStyle } : {}),
        });

        const rowState = { ...(nextWorkbookCells[cell.row.id] ?? {}) };
        if (nextState) {
          rowState[cell.field] = nextState;
          nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
        } else {
          delete rowState[cell.field];
          if (Object.keys(rowState).length > 0) {
            nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
          } else {
            const cloned = { ...nextWorkbookCells };
            delete cloned[cell.row.id];
            nextWorkbookCells = cloned;
          }
        }
      }

      setWorkbookCells(nextWorkbookCells);
    },
    [activeWorkflow, ensureEditingEnabled, getSelectionCells, pushHistory, workbookCells],
  );

  const applyBorderPreset = useCallback(
    (preset: "none" | "all" | "top" | "bottom" | "left" | "right" | "box") => {
      if (!selection) return;
      const cells = getSelectionCells();
      if (cells.length === 0) return;
      if (!ensureEditingEnabled(activeWorkflow)) return;

      const sel = normalizeSelection(selection);
      pushHistory();
      let nextWorkbookCells = workbookCells;

      const sideFlags = (cellRow: number, cellCol: number): Partial<DataSourceWorkbookCellStyle> => {
        const onTop = cellRow === sel.startRow;
        const onBottom = cellRow === sel.endRow;
        const onLeft = cellCol === sel.startCol;
        const onRight = cellCol === sel.endCol;
        switch (preset) {
          case "none":
            return { borderTop: false, borderBottom: false, borderLeft: false, borderRight: false };
          case "all":
            return { borderTop: true, borderBottom: true, borderLeft: true, borderRight: true };
          case "top":
            return { borderTop: true };
          case "bottom":
            return { borderBottom: true };
          case "left":
            return { borderLeft: true };
          case "right":
            return { borderRight: true };
          case "box":
            return {
              borderTop: onTop || undefined,
              borderBottom: onBottom || undefined,
              borderLeft: onLeft || undefined,
              borderRight: onRight || undefined,
            };
        }
      };

      for (const cell of cells) {
        const patch = sideFlags(cell.rowIndex, cell.colIndex);
        const currentState = getWorkbookStateForCell(nextWorkbookCells, cell.row.id, cell.field);
        const currentStyle = normalizeCellStyle(currentState?.style) ?? {};
        const merged: DataSourceWorkbookCellStyle = { ...currentStyle };
        for (const [k, v] of Object.entries(patch) as Array<[keyof DataSourceWorkbookCellStyle, unknown]>) {
          if (v === false || v === undefined) {
            delete (merged as Record<string, unknown>)[k];
          } else {
            (merged as Record<string, unknown>)[k] = v;
          }
        }
        const nextStyle = normalizeCellStyle(merged);
        const nextState = normalizeCellState({
          ...(currentState?.formula ? { formula: currentState.formula } : {}),
          ...(nextStyle ? { style: nextStyle } : {}),
        });

        const rowState = { ...(nextWorkbookCells[cell.row.id] ?? {}) };
        if (nextState) {
          rowState[cell.field] = nextState;
          nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
        } else {
          delete rowState[cell.field];
          if (Object.keys(rowState).length > 0) {
            nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
          } else {
            const cloned = { ...nextWorkbookCells };
            delete cloned[cell.row.id];
            nextWorkbookCells = cloned;
          }
        }
      }

      setWorkbookCells(nextWorkbookCells);
    },
    [activeWorkflow, ensureEditingEnabled, getSelectionCells, pushHistory, selection, workbookCells],
  );

  const mergeSelection = useCallback(() => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const sel = normalizeSelection(selection);
    if (sel.startRow === sel.endRow && sel.startCol === sel.endCol) return;
    const topRow = visibleRows[sel.startRow];
    const topColumn = WORKBOOK_COLUMNS[sel.startCol];
    if (!topRow || !topColumn) return;
    const rowSpan = sel.endRow - sel.startRow + 1;
    const colSpan = sel.endCol - sel.startCol + 1;
    setCellMerges((prev) => {
      const workflowMap = { ...(prev[activeWorkflow] ?? {}) };
      // Drop any merge whose head is inside the new merge region.
      for (const key of Object.keys(workflowMap)) {
        const [headRowId, headField] = key.split(":");
        const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
        const headColIndex = WORKBOOK_COLUMNS.findIndex((column) => column.field === headField);
        if (headRowIndex < 0 || headColIndex < 0) continue;
        if (
          headRowIndex >= sel.startRow &&
          headRowIndex <= sel.endRow &&
          headColIndex >= sel.startCol &&
          headColIndex <= sel.endCol
        ) {
          delete workflowMap[key];
        }
      }
      workflowMap[`${topRow.id}:${topColumn.field}`] = { rowSpan, colSpan };
      return { ...prev, [activeWorkflow]: workflowMap };
    });
  }, [activeWorkflow, ensureEditingEnabled, selection, visibleRows]);

  const unmergeSelection = useCallback(() => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const sel = normalizeSelection(selection);
    setCellMerges((prev) => {
      const workflowMap = { ...(prev[activeWorkflow] ?? {}) };
      for (const key of Object.keys(workflowMap)) {
        const [headRowId, headField] = key.split(":");
        const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
        const headColIndex = WORKBOOK_COLUMNS.findIndex((column) => column.field === headField);
        if (headRowIndex < 0 || headColIndex < 0) continue;
        if (
          headRowIndex >= sel.startRow &&
          headRowIndex <= sel.endRow &&
          headColIndex >= sel.startCol &&
          headColIndex <= sel.endCol
        ) {
          delete workflowMap[key];
        }
      }
      return { ...prev, [activeWorkflow]: workflowMap };
    });
  }, [activeWorkflow, ensureEditingEnabled, selection, visibleRows]);

  const hiddenMergedCells = useMemo(() => {
    const hidden = new Set<string>();
    const merges = cellMerges[activeWorkflow] ?? {};
    for (const [key, span] of Object.entries(merges)) {
      const [headRowId, headField] = key.split(":");
      const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
      const headColIndex = WORKBOOK_COLUMNS.findIndex((column) => column.field === headField);
      if (headRowIndex < 0 || headColIndex < 0) continue;
      for (let r = 0; r < span.rowSpan; r += 1) {
        for (let c = 0; c < span.colSpan; c += 1) {
          if (r === 0 && c === 0) continue;
          const row = visibleRows[headRowIndex + r];
          const column = WORKBOOK_COLUMNS[headColIndex + c];
          if (!row || !column) continue;
          hidden.add(`${row.id}:${column.field}`);
        }
      }
    }
    return hidden;
  }, [cellMerges, activeWorkflow, visibleRows]);

  const selectionHasMerge = useMemo(() => {
    if (!selection) return false;
    const sel = normalizeSelection(selection);
    const merges = cellMerges[activeWorkflow] ?? {};
    for (const key of Object.keys(merges)) {
      const [headRowId, headField] = key.split(":");
      const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
      const headColIndex = WORKBOOK_COLUMNS.findIndex((column) => column.field === headField);
      if (headRowIndex < 0 || headColIndex < 0) continue;
      if (
        headRowIndex >= sel.startRow &&
        headRowIndex <= sel.endRow &&
        headColIndex >= sel.startCol &&
        headColIndex <= sel.endCol
      ) {
        return true;
      }
    }
    return false;
  }, [selection, cellMerges, activeWorkflow, visibleRows]);

  const canMergeSelection = useMemo(() => {
    if (!selection) return false;
    const sel = normalizeSelection(selection);
    return sel.startRow !== sel.endRow || sel.startCol !== sel.endCol;
  }, [selection]);

  const clearSelectionContent = useCallback(() => {
    const cells = getSelectionCells().filter((cell) => EDITABLE_WORKBOOK_FIELDS.has(cell.field) && cell.row.periodEnd !== "TTM");
    if (cells.length === 0) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;

    pushHistory();
    let nextOverrides = numericOverrides;
    let nextWorkbookCells = workbookCells;

    for (const cell of cells) {
      nextOverrides = updateNumericOverride(nextOverrides, cell.row.id, cell.field, null);
      const currentState = getWorkbookStateForCell(nextWorkbookCells, cell.row.id, cell.field);
      const nextState = normalizeCellState({
        ...(currentState?.style ? { style: currentState.style } : {}),
      });
      const rowState = { ...(nextWorkbookCells[cell.row.id] ?? {}) };

      if (nextState) {
        rowState[cell.field] = nextState;
        nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
      } else {
        delete rowState[cell.field];
        if (Object.keys(rowState).length > 0) {
          nextWorkbookCells = { ...nextWorkbookCells, [cell.row.id]: rowState };
        } else {
          const cloned = { ...nextWorkbookCells };
          delete cloned[cell.row.id];
          nextWorkbookCells = cloned;
        }
      }
    }

    setNumericOverrides(nextOverrides);
    setWorkbookCells(nextWorkbookCells);
  }, [activeWorkflow, ensureEditingEnabled, getSelectionCells, numericOverrides, pushHistory, workbookCells]);

  const copySelection = useCallback(async () => {
    if (!selection) return;
    const normalized = normalizeSelection(selection);
    const lines: string[] = [];

    for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
      const row = visibleRows[rowIndex];
      if (!row) continue;

      const values: string[] = [];
      for (let colIndex = normalized.startCol; colIndex <= normalized.endCol; colIndex += 1) {
        const field = WORKBOOK_COLUMNS[colIndex]?.field;
        if (!field) continue;
        const state = getWorkbookStateForCell(workbookCells, row.id, field);
        if (state?.formula && EDITABLE_WORKBOOK_FIELDS.has(field)) {
          values.push(state.formula);
        } else {
          const raw = getRowFieldValue(row, field);
          values.push(raw == null ? "" : String(raw));
        }
      }
      lines.push(values.join("\t"));
    }

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, [selection, visibleRows, workbookCells]);

  const applyPastedText = useCallback((text: string) => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;

    const normalized = normalizeSelection(selection);
    const pastedRows = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => line.length > 0);

    if (pastedRows.length === 0) return;

    pushHistory();
    let nextOverrides = numericOverrides;
    let nextWorkbookCells = workbookCells;

    pastedRows.forEach((line, rowOffset) => {
      const values = line.split("\t");
      values.forEach((value, colOffset) => {
        const row = visibleRows[normalized.startRow + rowOffset];
        const column = WORKBOOK_COLUMNS[normalized.startCol + colOffset];
        if (!row || !column) return;
        if (!column.editable || row.periodEnd === "TTM") return;

        const field = column.field;
        const currentState = getWorkbookStateForCell(nextWorkbookCells, row.id, field);
        const trimmed = value.trim();

        if (trimmed.startsWith("=") && trimmed.length > 1) {
          nextOverrides = updateNumericOverride(nextOverrides, row.id, field, null, true);
          const rowState = { ...(nextWorkbookCells[row.id] ?? {}) };
          rowState[field] = normalizeCellState({
            ...(currentState?.style ? { style: currentState.style } : {}),
            formula: trimmed,
          })!;
          nextWorkbookCells = { ...nextWorkbookCells, [row.id]: rowState };
          return;
        }

        const parsed = parseNumericInput(trimmed);
        nextOverrides = updateNumericOverride(nextOverrides, row.id, field, parsed);
        const rowState = { ...(nextWorkbookCells[row.id] ?? {}) };
        const nextState = normalizeCellState({
          ...(currentState?.style ? { style: currentState.style } : {}),
        });

        if (nextState) {
          rowState[field] = nextState;
          nextWorkbookCells = { ...nextWorkbookCells, [row.id]: rowState };
        } else {
          delete rowState[field];
          if (Object.keys(rowState).length > 0) {
            nextWorkbookCells = { ...nextWorkbookCells, [row.id]: rowState };
          } else {
            const cloned = { ...nextWorkbookCells };
            delete cloned[row.id];
            nextWorkbookCells = cloned;
          }
        }
      });
    });

    setNumericOverrides(nextOverrides);
    setWorkbookCells(nextWorkbookCells);
  }, [activeWorkflow, ensureEditingEnabled, numericOverrides, pushHistory, selection, visibleRows, workbookCells]);

  const pasteSelection = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      applyPastedText(text);
    } catch {
      window.alert("Clipboard paste was blocked. Use Ctrl/Cmd+V inside the workbook instead.");
    }
  }, [applyPastedText]);

  const cutSelection = useCallback(async () => {
    await copySelection();
    clearSelectionContent();
  }, [clearSelectionContent, copySelection]);

  const moveSelection = useCallback((nextRow: number, nextCol: number, extend = false) => {
    if (visibleRows.length === 0) return;
    const boundedRow = Math.max(0, Math.min(visibleRows.length - 1, nextRow));
    const boundedCol = Math.max(0, Math.min(WORKBOOK_COLUMNS.length - 1, nextCol));

    setSelection((prev) => {
      if (extend && prev) {
        return { ...prev, endRow: boundedRow, endCol: boundedCol };
      }

      return {
        startRow: boundedRow,
        endRow: boundedRow,
        startCol: boundedCol,
        endCol: boundedCol,
      };
    });
  }, [visibleRows.length]);

  const startInlineEdit = useCallback((seedText?: string) => {
    if (!selection) return;
    const normalized = normalizeSelection(selection);
    const row = visibleRows[normalized.endRow];
    const column = WORKBOOK_COLUMNS[normalized.endCol];
    if (!row || !column?.editable || row.periodEnd === "TTM") return;
    if (!ensureEditingEnabled(activeWorkflow)) return;

    const state = getWorkbookStateForCell(workbookCells, row.id, column.field);
    const currentValue = state?.formula
      ? state.formula
      : getRowFieldValue(row, column.field) == null
        ? ""
        : String(getRowFieldValue(row, column.field));

    setEditingCell({ rowId: row.id, field: column.field });
    setInlineDraft(seedText ?? currentValue);
    setContextMenu(null);
  }, [activeWorkflow, ensureEditingEnabled, selection, visibleRows, workbookCells]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;

    const withMeta = event.ctrlKey || event.metaKey;
    if (withMeta && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection();
      return;
    }
    if (withMeta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      handleUndo();
      return;
    }
    if (withMeta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      handleRedo();
      return;
    }

    if (!selection) return;

    const normalized = normalizeSelection(selection);
    const row = visibleRows[normalized.endRow];
    const column = WORKBOOK_COLUMNS[normalized.endCol];
    if (!row || !column) return;

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelectionContent();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(normalized.endRow + 1, normalized.endCol, event.shiftKey);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(normalized.endRow - 1, normalized.endCol, event.shiftKey);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(normalized.endRow, normalized.endCol - 1, event.shiftKey);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(normalized.endRow, normalized.endCol + 1, event.shiftKey);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      moveSelection(normalized.endRow, normalized.endCol + (event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      startInlineEdit();
      return;
    }

    if (
      !withMeta &&
      event.key.length === 1 &&
      !event.altKey &&
      EDITABLE_WORKBOOK_FIELDS.has(column.field) &&
      row.periodEnd !== "TTM"
    ) {
      event.preventDefault();
      startInlineEdit(event.key);
    }
  }, [clearSelectionContent, copySelection, handleRedo, handleUndo, moveSelection, selection, startInlineEdit, visibleRows]);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    if (hasFormulaErrors) {
      window.alert("Please fix formula errors before saving this workbook.");
      return;
    }

    setSaving(true);
    try {
      const workbookFormulaEdits = computedRows.flatMap((row) => {
        if (row.periodEnd === "TTM") return [];
        const rowState = workbookCells[row.id];
        if (!rowState) return [];

        return Object.entries(rowState)
          .filter(([field, state]) => Boolean(state?.formula) && EDITABLE_WORKBOOK_FIELDS.has(field))
          .map(([field]) => ({
            id: row.id,
            ticker: row.ticker,
            periodEnd: row.periodEnd,
            field,
            value: typeof getRowFieldValue(row, field) === "number" ? (getRowFieldValue(row, field) as number) : null,
          }));
      });

      const manualEdits = flattenNumericOverrides(numericOverrides, computedRows);
      const mergedEditsMap = new Map<string, { id: string; ticker: string; periodEnd: string; field: string; value: number | null }>();

      for (const edit of [...manualEdits, ...workbookFormulaEdits]) {
        mergedEditsMap.set(`${edit.id}:${edit.field}`, edit);
      }

      const response = await fetch("/api/data-source", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [...mergedEditsMap.values()],
          workbookCells: flattenWorkbookCellsForSave(baseRows, workbookCells),
          workbookTickers: [...new Set(baseRows.map((row) => row.ticker))],
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert((data as { error?: string }).error ?? `Save failed (HTTP ${response.status})`);
        return;
      }

      initialWorkbookCellsRef.current = serializeWorkbookRowCellStates(workbookCells);
      setNumericOverrides({});
      await fetchData();
    } finally {
      setSaving(false);
    }
  }, [baseRows, computedRows, fetchData, hasFormulaErrors, hasUnsavedChanges, numericOverrides, workbookCells]);

  const handleExportCsv = () => {
    const headers = ["#", ...WORKBOOK_COLUMNS.map((column) => column.label)];
    const lines = [headers.join(",")];

    visibleRows.forEach((row) => {
      const rowNumber = sheetRowNumbers[activeWorkflow][row.id] ?? "";
      const values = [
        String(rowNumber),
        ...WORKBOOK_COLUMNS.map((column) => {
          const value = getRowFieldValue(row, column.field);
          return typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : String(value ?? "");
        }),
      ];
      lines.push(values.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = activeWorkflow === "analyze" ? "quick-analyze-sheet.csv" : "competitor-analysis-sheet.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    for (const sheet of workbookSheets) {
      const rows = sheet.rows;
      const aoa = [
        ["#", ...WORKBOOK_COLUMNS.map((column) => column.label)],
        ...rows.map((row) => [
          sheetRowNumbers[sheet.key][row.id] ?? "",
          ...WORKBOOK_COLUMNS.map((column) => getRowFieldValue(row, column.field) ?? ""),
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet["!cols"] = [
        { wch: 8 },
        ...WORKBOOK_COLUMNS.map((column) => {
          switch (column.field) {
            case "ticker":
              return { wch: 10 };
            case "companyName":
              return { wch: 24 };
            case "quarterLabel":
              return { wch: 18 };
            case "periodEnd":
              return { wch: 14 };
            default:
              return { wch: 14 };
          }
        }),
      ];

      for (let colIndex = 0; colIndex <= WORKBOOK_COLUMNS.length; colIndex += 1) {
        const address = XLSX.utils.encode_cell({ r: 0, c: colIndex });
        if (!worksheet[address]) continue;
        worksheet[address].s = {
          fill: { fgColor: { rgb: "0F172A" } },
          font: { color: { rgb: "FFFFFF" }, bold: true },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }

      rows.forEach((row, rowIndex) => {
        WORKBOOK_COLUMNS.forEach((column, columnIndex) => {
          const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex + 1 });
          const cellState = getWorkbookStateForCell(workbookCells, row.id, column.field);
          const style = buildXlsxStyle(cellState?.style ?? null, column.align);

          if (!worksheet[address]) {
            worksheet[address] = { t: "s", v: "" };
          }

          worksheet[address].s = style;
          if (cellState?.formula && column.editable) {
            worksheet[address].f = cellState.formula.replace(/^=/, "");
          }
          const numFormatCode = getXlsxNumberFormatCode(cellState?.style?.numberFormat ?? null);
          if (numFormatCode) {
            worksheet[address].z = numFormatCode;
          }
        });
      });

      const sheetMerges = cellMerges[sheet.key] ?? {};
      const xlsxMerges: XLSX.Range[] = [];
      for (const [mergeKey, span] of Object.entries(sheetMerges)) {
        const [headRowId, headField] = mergeKey.split(":");
        const headRowIdx = rows.findIndex((row) => row.id === headRowId);
        const headColIdx = WORKBOOK_COLUMNS.findIndex((column) => column.field === headField);
        if (headRowIdx < 0 || headColIdx < 0) continue;
        xlsxMerges.push({
          s: { r: headRowIdx + 1, c: headColIdx + 1 },
          e: { r: headRowIdx + span.rowSpan, c: headColIdx + span.colSpan },
        });
      }
      if (xlsxMerges.length > 0) worksheet["!merges"] = xlsxMerges;

      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.title.slice(0, 31));
    }

    XLSX.writeFile(workbook, "data-source-workbook.xlsx");
  };

  const toggleSort = (field: string) => {
    setSortByWorkflow((prev) => {
      const current = prev[activeWorkflow];
      const nextDirection: SortDirection =
        current?.field === field && current.direction === "asc" ? "desc" : "asc";

      return {
        ...prev,
        [activeWorkflow]: { field, direction: nextDirection },
      };
    });
  };

  const fieldLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const column of WORKBOOK_COLUMNS) map.set(column.field, column.label);
    return map;
  }, []);

  const formatHistoryValue = (value: number | string | null) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return String(value);
  };

  const formatHistoryTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const renderHistoryView = () => {
    const allPastRows = [...pastRowsByWorkflow.analyze, ...pastRowsByWorkflow.competitor].filter(
      (row) => row.periodEnd !== "TTM",
    );
    allPastRows.sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));

    return (
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Past filings</h3>
            <span className="text-[11px] text-slate-500">{allPastRows.length} filing(s)</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Older uploads not currently shown in the workbook. Re-upload the same filing in Quick Analyze or Competitor
            Analysis to make it the current PDF.
          </p>
          {allPastRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
              No past filings yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Workflow</th>
                    <th className="px-3 py-2 font-semibold">Ticker</th>
                    <th className="px-3 py-2 font-semibold">Quarter</th>
                    <th className="px-3 py-2 font-semibold">Period End</th>
                    <th className="px-3 py-2 font-semibold">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {allPastRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 capitalize text-slate-600">{row.workflowOrigin}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.ticker}</td>
                      <td className="px-3 py-2 text-slate-700">{row.quarterLabel}</td>
                      <td className="px-3 py-2 text-slate-700">{row.periodEnd}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {row.savedAt ? formatHistoryTimestamp(row.savedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Edit audit log</h3>
            <span className="text-[11px] text-slate-500">{editLog.length} entr{editLog.length === 1 ? "y" : "ies"}</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Every saved value change to the workbook, capped at the 500 most recent entries per ticker.
          </p>
          {editLog.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
              No edits saved yet.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-x-auto overflow-y-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Ticker</th>
                    <th className="px-3 py-2 font-semibold">Period</th>
                    <th className="px-3 py-2 font-semibold">Field</th>
                    <th className="px-3 py-2 text-right font-semibold">Previous</th>
                    <th className="px-3 py-2 text-right font-semibold">New</th>
                  </tr>
                </thead>
                <tbody>
                  {editLog.map((entry, idx) => (
                    <tr key={`${entry.at}-${entry.ticker}-${entry.field}-${idx}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatHistoryTimestamp(entry.at)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{entry.ticker}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{entry.periodEnd}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {entry.fieldLabel ?? fieldLabelByKey.get(entry.field) ?? entry.field}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-500">
                        {formatHistoryValue(entry.prevValue)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-800">
                        {formatHistoryValue(entry.nextValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  };

  return (
    <RequireAuth>
      <div className="mx-auto max-w-[99vw] px-4 py-6">
        {editConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-source-edit-enable-title"
          >
            <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
              <button
                type="button"
                onClick={() => setEditConfirm(null)}
                className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex gap-3">
                <AlertTriangle className="h-8 w-8 shrink-0 text-amber-500" aria-hidden />
                <div className="min-w-0">
                  <h2 id="data-source-edit-enable-title" className="text-sm font-bold text-slate-900">
                    Heads up before you edit
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Edits in this workbook will change the values shown in Quick Analyze and Competitor Analysis. Verify
                    any changed values against the original filing PDF or SEC source before saving.
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    This message only appears once.
                  </p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditConfirm(null)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmEnableEditing}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Got it, enable editing
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Centralized Data Source Workbook</h1>
            <p className="text-xs text-slate-500">
              {baseRows.length} records · Excel-like workbook with formulas, formatting, keyboard navigation, copy/paste,
              and persisted manual overrides.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                className="rounded-md border border-slate-200 bg-white py-2 pl-7 pr-3 text-xs shadow-sm outline-none focus:ring-1 focus:ring-primary/40"
                placeholder="Filter ticker, company, quarter..."
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            {hasUnsavedChanges && (
              <button
                onClick={handleSave}
                disabled={saving || hasFormulaErrors}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save workbook
              </button>
            )}
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-3 w-3" /> Excel
            </button>
            <button
              onClick={() => void fetchData()}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="Refresh"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-slate-500">Loading workbook…</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-100 p-3 shadow-lg shadow-slate-200/60">
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                {activeSheet === "history" ? renderHistoryView() : (<>
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${activeSheetConfig.accentClass}`}>
                        {activeSheetConfig.rows.length} row(s)
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          editingEnabled[activeWorkflow]
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {editingEnabled[activeWorkflow] ? "Editing enabled" : "Read-only"}
                      </span>
                      {hasFormulaErrors && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                          Fix formula errors before save
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-base font-semibold text-slate-900">{activeSheetConfig.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{activeSheetConfig.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleEditMode(activeWorkflow)}
                      className={`inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-semibold transition ${
                        editingEnabled[activeWorkflow]
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {editingEnabled[activeWorkflow] ? "Lock sheet" : "Edit data"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!ensureEditingEnabled(activeWorkflow)) return;
                        clearSelectionContent();
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Eraser className="h-3 w-3" />
                      Clear selected
                    </button>
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                      <ToolbarButton title="Undo" disabled={undoStack.length === 0} onClick={handleUndo}>
                        <Undo2 className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton title="Redo" disabled={redoStack.length === 0} onClick={handleRedo}>
                        <Redo2 className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Bold"
                        active={Boolean(selectedStyle?.bold)}
                        onClick={() => applyStylePatch({ bold: !selectedStyle?.bold })}
                      >
                        <Bold className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Italic"
                        active={Boolean(selectedStyle?.italic)}
                        onClick={() => applyStylePatch({ italic: !selectedStyle?.italic })}
                      >
                        <Italic className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Underline"
                        active={Boolean(selectedStyle?.underline)}
                        onClick={() => applyStylePatch({ underline: !selectedStyle?.underline })}
                      >
                        <Underline className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Strikethrough"
                        active={Boolean(selectedStyle?.strikethrough)}
                        onClick={() => applyStylePatch({ strikethrough: !selectedStyle?.strikethrough })}
                      >
                        <Strikethrough className="h-4 w-4" />
                      </ToolbarButton>
                      <select
                        title="Border"
                        value=""
                        onChange={(event) => {
                          const value = event.target.value as
                            | ""
                            | "none"
                            | "all"
                            | "top"
                            | "bottom"
                            | "left"
                            | "right"
                            | "box";
                          if (value) applyBorderPreset(value);
                          event.target.value = "";
                        }}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="" disabled>
                          Border…
                        </option>
                        <option value="none">None</option>
                        <option value="all">All sides</option>
                        <option value="box">Outer box</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                      <ToolbarButton
                        title="Align left"
                        active={selectedStyle?.align === "left"}
                        onClick={() => applyStylePatch({ align: "left" })}
                      >
                        <AlignLeft className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Align center"
                        active={selectedStyle?.align === "center"}
                        onClick={() => applyStylePatch({ align: "center" })}
                      >
                        <AlignCenter className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton
                        title="Align right"
                        active={selectedStyle?.align === "right"}
                        onClick={() => applyStylePatch({ align: "right" })}
                      >
                        <AlignRight className="h-4 w-4" />
                      </ToolbarButton>
                      <button
                        type="button"
                        title={selectionHasMerge ? "Unmerge selection" : "Merge selected cells"}
                        disabled={!canMergeSelection && !selectionHasMerge}
                        onClick={() => (selectionHasMerge ? unmergeSelection() : mergeSelection())}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selectionHasMerge ? "Unmerge" : "Merge"}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Font
                        <select
                          value={selectedStyle?.fontFamily ?? "Calibri"}
                          onChange={(event) => applyStylePatch({ fontFamily: event.target.value })}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                          style={{ fontFamily: selectedStyle?.fontFamily ?? "Calibri" }}
                        >
                          {["Arial", "Calibri", "Times New Roman", "Courier New", "Georgia", "Verdana"].map((family) => (
                            <option key={family} value={family} style={{ fontFamily: family }}>
                              {family}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Size
                        <select
                          value={selectedStyle?.fontSize ?? 12}
                          onChange={(event) => applyStylePatch({ fontSize: Number(event.target.value) })}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48].map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Format
                        <select
                          value={selectedStyle?.numberFormat ?? "auto"}
                          onChange={(event) =>
                            applyStylePatch({
                              numberFormat: event.target.value as "auto" | DataSourceWorkbookNumberFormat,
                            })
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          {NUMBER_FORMAT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Text
                        <input
                          type="color"
                          value={selectedStyle?.textColor ?? "#0f172a"}
                          onChange={(event) => applyStylePatch({ textColor: event.target.value })}
                          className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Fill
                        <input
                          type="color"
                          value={selectedStyle?.fillColor ?? "#ffffff"}
                          onChange={(event) => applyStylePatch({ fillColor: event.target.value })}
                          className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 xl:grid-cols-[110px_minmax(0,1fr)]">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      {selection && selectedRow && selectedColumn
                        ? `${columnIndexToLetter(normalizeSelection(selection).endCol)}${sheetRowNumbers[activeWorkflow][selectedRow.id] ?? normalizeSelection(selection).endRow + 1}`
                        : "No cell"}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-xs font-semibold text-slate-500">fx</span>
                      <input
                        value={formulaDraft}
                        onChange={(event) => setFormulaDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || !selectedRow || !selectedField) return;
                          event.preventDefault();
                          if (EDITABLE_WORKBOOK_FIELDS.has(selectedField)) {
                            void commitCellInput(selectedRow, selectedField, formulaDraft);
                          }
                        }}
                        disabled={!selectedRow || !selectedField || !EDITABLE_WORKBOOK_FIELDS.has(selectedField)}
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                        placeholder="Type a number or formula, e.g. =E2*1.1"
                      />
                    </div>
                  </div>
                  {selectedCellError && (
                    <p className="mt-2 text-xs font-medium text-red-600">{selectedCellError}</p>
                  )}
                </div>

                <div
                  ref={workbookRef}
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  onPaste={(event) => {
                    event.preventDefault();
                    applyPastedText(event.clipboardData.getData("text/plain"));
                  }}
                  className="max-h-[62vh] overflow-auto rounded-[22px] border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <table
                    className="border-separate border-spacing-0 text-xs"
                    style={{ tableLayout: "fixed", width: totalTableWidth }}
                  >
                    <colgroup>
                      <col style={{ width: getColumnWidth(ROW_NUMBER_COLUMN_KEY) }} />
                      {WORKBOOK_COLUMNS.map((column) => (
                        <col key={column.field} style={{ width: getColumnWidth(column.field) }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-slate-100 text-slate-500">
                        <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center font-semibold">
                          #
                        </th>
                        {WORKBOOK_COLUMNS.map((column, colIndex) => (
                          <th
                            key={`${column.field}-letter`}
                            className="border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-center font-semibold"
                          >
                            {columnIndexToLetter(colIndex)}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-slate-800 text-white">
                        <th className="sticky left-0 z-30 border-b border-r border-slate-700 bg-slate-800 px-3 py-2 text-center font-semibold">
                          Row
                        </th>
                        {WORKBOOK_COLUMNS.map((column) => {
                          const activeSort = sortByWorkflow[activeWorkflow];
                          const sortIndicator =
                            activeSort?.field === column.field
                              ? activeSort.direction === "asc"
                                ? " ▲"
                                : " ▼"
                              : "";

                          return (
                            <th
                              key={column.field}
                              className={`relative border-b border-r border-slate-700 bg-slate-800 px-3 py-2 font-semibold ${
                                column.align === "right"
                                  ? "text-right"
                                  : column.align === "center"
                                    ? "text-center"
                                    : "text-left"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(column.field)}
                                className="inline-flex w-full items-center gap-1 truncate text-left"
                              >
                                <span className="truncate">{column.label}</span>
                                <span className="text-[10px] text-slate-300">{sortIndicator}</span>
                              </button>
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${column.label} column`}
                                onMouseDown={(event) => handleColumnResizeStart(column.field, event)}
                                onClick={(event) => event.stopPropagation()}
                                className="absolute right-0 top-0 z-10 flex h-full w-1.5 cursor-col-resize select-none items-center justify-center bg-transparent transition hover:bg-blue-400/70 active:bg-blue-500"
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIndex) => {
                        const canonicalRowNumber = sheetRowNumbers[activeWorkflow][row.id] ?? rowIndex + 1;
                        return (
                          <tr key={row.id} className={rowIndex % 2 === 1 ? "bg-slate-50/40" : "bg-white"}>
                            <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-inherit px-3 py-2 text-center font-semibold text-slate-500">
                              {canonicalRowNumber}
                            </td>
                            {WORKBOOK_COLUMNS.map((column, colIndex) => {
                              const field = column.field;
                              const cellKey = `${row.id}:${field}`;
                              if (hiddenMergedCells.has(cellKey)) return null;
                              const mergeInfo = cellMerges[activeWorkflow]?.[cellKey];
                              const cellState = getWorkbookStateForCell(workbookCells, row.id, field);
                              const cellStyle = normalizeCellStyle(cellState?.style);
                              const isSelected = isCellInSelection(selection, rowIndex, colIndex);
                              const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                              const formulaError = formulaErrors[`${row.id}:${field}`];
                              const rawValue = getRowFieldValue(row, field);
                              const displayValue = formulaError
                                ? "#ERR"
                                : fmtCellWithOverride(rawValue ?? null, column.format, cellStyle?.numberFormat);

                              return (
                                <td
                                  key={cellKey}
                                  {...(mergeInfo?.rowSpan && mergeInfo.rowSpan > 1 ? { rowSpan: mergeInfo.rowSpan } : {})}
                                  {...(mergeInfo?.colSpan && mergeInfo.colSpan > 1 ? { colSpan: mergeInfo.colSpan } : {})}
                                  onMouseDown={(event) => {
                                    focusWorkbook();
                                    if (event.button === 2) return;
                                    setContextMenu(null);
                                    selectGridCell(rowIndex, colIndex, {
                                      extend: event.shiftKey,
                                      mergeInfo,
                                    });
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    focusWorkbook();
                                    if (!isSelected) {
                                      selectGridCell(rowIndex, colIndex, { mergeInfo });
                                    }
                                    setEditingCell(null);
                                    setContextMenu({
                                      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 224)),
                                      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 312)),
                                    });
                                  }}
                                  onDoubleClick={() => {
                                    setContextMenu(null);
                                    selectGridCell(rowIndex, colIndex, {
                                      mergeInfo,
                                    });
                                    if (column.editable && row.periodEnd !== "TTM") {
                                      startInlineEdit();
                                    }
                                  }}
                                  className={`border-b border-r border-slate-200 px-0 py-0 ${
                                    isSelected ? "ring-2 ring-inset ring-primary/50" : ""
                                  }`}
                                >
                                  <div
                                    className={`min-h-[38px] px-3 py-2 ${
                                      column.align === "right"
                                        ? "text-right"
                                        : column.align === "center"
                                          ? "text-center"
                                          : "text-left"
                                    } ${
                                      formulaError ? "font-semibold text-red-600" : "text-slate-700"
                                    }`}
                                    style={{
                                      backgroundColor: cellStyle?.fillColor ?? (isSelected ? "rgba(59,130,246,0.08)" : undefined),
                                      color: formulaError ? undefined : cellStyle?.textColor ?? undefined,
                                      fontWeight: cellStyle?.bold ? 700 : undefined,
                                      fontStyle: cellStyle?.italic ? "italic" : undefined,
                                      textDecoration: [
                                        cellStyle?.underline ? "underline" : null,
                                        cellStyle?.strikethrough ? "line-through" : null,
                                      ]
                                        .filter(Boolean)
                                        .join(" ") || undefined,
                                      textAlign: cellStyle?.align ?? column.align,
                                      borderTop: cellStyle?.borderTop ? "1px solid #94a3b8" : undefined,
                                      borderBottom: cellStyle?.borderBottom ? "1px solid #94a3b8" : undefined,
                                      borderLeft: cellStyle?.borderLeft ? "1px solid #94a3b8" : undefined,
                                      borderRight: cellStyle?.borderRight ? "1px solid #94a3b8" : undefined,
                                      fontSize: cellStyle?.fontSize ? `${cellStyle.fontSize}px` : undefined,
                                      fontFamily: cellStyle?.fontFamily ?? undefined,
                                    }}
                                  >
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        value={inlineDraft}
                                        onChange={(event) => setInlineDraft(event.target.value)}
                                        onBlur={() => {
                                          void commitCellInput(row, field, inlineDraft);
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void commitCellInput(row, field, inlineDraft);
                                          }
                                          if (event.key === "Escape") {
                                            event.preventDefault();
                                            setEditingCell(null);
                                          }
                                        }}
                                        className="w-full bg-transparent text-right outline-none"
                                      />
                                    ) : (
                                      <span className="block truncate" title={typeof displayValue === "string" ? displayValue : undefined}>
                                        {displayValue}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {visibleRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={WORKBOOK_COLUMNS.length + 1}
                            className="px-4 py-10 text-center text-sm text-slate-400"
                          >
                            No rows match the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {contextMenu ? (
                  <div
                    ref={menuRef}
                    className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void cutSelection();
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Scissors className="h-4 w-4" />
                      Cut
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void copySelection();
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void pasteSelection();
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <ClipboardPaste className="h-4 w-4" />
                      Paste
                    </button>
                    <div className="my-1 h-px bg-slate-200" />
                    <button
                      type="button"
                      onClick={() => {
                        clearSelectionContent();
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Eraser className="h-4 w-4" />
                      Clear contents
                    </button>
                    <div className="my-1 h-px bg-slate-200" />
                    <button
                      type="button"
                      onClick={() => {
                        applyStylePatch({ bold: !selectedStyle?.bold });
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Bold className="h-4 w-4" />
                      Toggle bold
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyStylePatch({ numberFormat: "currency" });
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <DollarSign className="h-4 w-4" />
                      Format as currency
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyStylePatch({ numberFormat: "percent" });
                        setContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Percent className="h-4 w-4" />
                      Format as percent
                    </button>
                  </div>
                ) : null}
                </>)}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-[20px] border border-slate-200/80 bg-slate-100/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    type="button"
                    disabled
                    className="rounded-md p-1 transition disabled:cursor-default disabled:opacity-70"
                    aria-label="Workbook navigation disabled"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-md p-1 transition disabled:cursor-default disabled:opacity-70"
                    aria-label="Workbook navigation disabled"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="h-5 w-px bg-slate-200" />

                <div className="flex min-w-0 flex-1 items-end gap-2 overflow-x-auto pb-1">
                  {workbookSheets.map((sheet) => {
                    const isActive = sheet.key === activeSheet;
                    return (
                      <button
                        key={sheet.key}
                        type="button"
                        onClick={() => {
                          setActiveSheet(sheet.key);
                          workbookRef.current?.focus();
                        }}
                        className={`inline-flex min-w-fit items-center gap-2 rounded-t-xl border px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "border-slate-300 border-b-white bg-white text-slate-900 shadow-sm"
                            : "border-transparent bg-slate-200/80 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                        }`}
                      >
                        <span>{sheet.title}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isActive ? "bg-slate-100 text-slate-600" : "bg-white/70 text-slate-500"
                          }`}
                        >
                          {sheet.rows.length}
                        </span>
                      </button>
                    );
                  })}

                  {(() => {
                    const isActive = activeSheet === "history";
                    const totalPast = pastRowsByWorkflow.analyze.length + pastRowsByWorkflow.competitor.length;
                    return (
                      <button
                        type="button"
                        onClick={() => setActiveSheet("history")}
                        className={`inline-flex min-w-fit items-center gap-2 rounded-t-xl border px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? "border-slate-300 border-b-white bg-white text-slate-900 shadow-sm"
                            : "border-transparent bg-slate-200/80 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                        }`}
                      >
                        <span>History</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isActive ? "bg-slate-100 text-slate-600" : "bg-white/70 text-slate-500"
                          }`}
                        >
                          {totalPast + editLog.length}
                        </span>
                      </button>
                    );
                  })()}

                  <button
                    type="button"
                    disabled
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-80"
                    title="Additional workbook sheets can be added in a later iteration."
                    aria-label="Add sheet disabled"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <AnalysisCalculationsExplainer />
        </div>
      </div>
    </RequireAuth>
  );
}
