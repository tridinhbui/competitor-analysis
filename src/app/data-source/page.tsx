"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSourceMetricTrace, DataSourceRow } from "@/types/dataSource";
import type {
  DataSourceEditLogEntry,
  DataSourceWorkbookCellState,
  DataSourceWorkbookCellStyle,
  DataSourceWorkbookNumberFormat,
} from "@/types/dataSourceWorkbook";
import type { ChatThreadSummary } from "@/types/chatThread";
import { AnalysisCalculationsExplainer } from "@/components/data-source/AnalysisCalculationsExplainer";
import { FinancialModelSheetView } from "@/components/data-source/FinancialModelSheetView";
import { ExcelWorkbookEditor } from "@/components/workspace/ExcelWorkbookEditor";
import {
  appendFinancialModelSheets,
  buildFinancialModelContext,
  isFinancialModelSheetKey,
  type FinancialModelSheetKey,
} from "@/lib/dataSourceFinancialModel";
import {
  financialGridStorageKey,
  buildFinancialGrid,
  getCellDisplayValue,
  type FinancialCellStyle,
  type FinancialShortcutTarget,
} from "@/lib/financialModelGrid";
import type { FilingCategorySection } from "@/lib/financialModelFromFiling";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Baseline,
  Bold,
  Brush,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  DollarSign,
  Download,
  Eraser,
  Eye,
  FileSpreadsheet,
  Filter,
  Italic,
  Link,
  ListFilter,
  Loader2,
  MessageSquarePlus,
  Minus,
  MoreVertical,
  PaintBucket,
  Percent,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Search,
  Sigma,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import type { EditableWorkbook } from "@/lib/excelWorkbook";
import { cellStyleKey as excelCellStyleKey } from "@/lib/excelWorkbook";
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
  type WorkbookColumn,
  type WorkbookNumericOverrideMap,
  type WorkbookRowCellStateMap,
} from "@/lib/dataSourceWorkbook";

type WorkflowOrigin = "analyze" | "competitor";
type WorkbookSectionKey =
  | "underwriting"
  | "annualCf"
  | "credit"
  | "quality"
  | "returns"
  | "summary"
  | "segment"
  | "income"
  | "balance"
  | "cashflow"
  | "analysis";
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

interface CompanyWorkbookOption {
  ticker: string;
  companyName: string;
}

interface WorkbookSectionConfig {
  key: WorkbookSectionKey;
  title: string;
  description: string;
  accentClass: string;
  exportFields: string[];
  focusField?: string;
  /** Financial model template (Underwriting / Annual CF) — not the quarterly data grid */
  isFinancialTemplate?: boolean;
}

interface CachedWorkbookPayload {
  rows: DataSourceRow[];
  workbookCells: WorkbookRowCellStateMap;
  editLog: DataSourceEditLogEntry[];
  availableCompanies: CompanyWorkbookOption[];
  workbookThreads: ChatThreadSummary[];
  schemaReady: boolean;
  threadSchemaMessage: string | null;
  selectedCompanyTicker: string | null;
  selectedThreadId: string | null;
}

interface CachedWorkbookSnapshot {
  version: 1;
  selectionKey: string | null;
  cachedAt: string;
  viewState: {
    activeSheet: WorkbookSectionKey;
  };
  payload: CachedWorkbookPayload;
}

const ROW_NUMBER_COLUMN_KEY = "__row__";
const COLUMN_WIDTHS_STORAGE_KEY = "data-source-column-widths-v2";
const EDIT_WARNING_STORAGE_KEY = "data-source-edit-warning-acknowledged-v1";
const CELL_MERGES_STORAGE_KEY = "data-source-cell-merges-v1";
const WORKBOOK_SNAPSHOT_STORAGE_KEY = "data-source-last-workbook-snapshot-v1";
const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 640;
const DEFAULT_METRIC_COLUMN_WIDTH = 102;
const MIN_WORKBOOK_VISIBLE_ROWS = 10;
const WORKBOOK_FONT_FAMILY = "\"Aptos\", \"Calibri\", \"Segoe UI\", sans-serif";
const EXCEL_SELECTION_BORDER = "#217346";
const EXCEL_SELECTION_FILL = "rgba(33, 115, 70, 0.10)";
const FORMULA_REFERENCE_COLORS = [
  { border: "rgba(59, 130, 246, 0.95)", fill: "rgba(59, 130, 246, 0.12)" },
  { border: "rgba(249, 115, 22, 0.95)", fill: "rgba(249, 115, 22, 0.12)" },
  { border: "rgba(16, 185, 129, 0.95)", fill: "rgba(16, 185, 129, 0.12)" },
  { border: "rgba(244, 63, 94, 0.95)", fill: "rgba(244, 63, 94, 0.12)" },
] as const;
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  [ROW_NUMBER_COLUMN_KEY]: 44,
  ticker: 74,
  companyName: 170,
  quarterLabel: 112,
  periodEnd: 92,
};
const BASE_WORKBOOK_FIELDS = ["quarterLabel", "periodEnd"] as const;
const FINANCIAL_TEMPLATE_STYLES: Record<FinancialCellStyle, DataSourceWorkbookCellStyle> = {
  navyTitle: {
    bold: true,
    fillColor: "#1E3A5F",
    textColor: "#ffffff",
    fontSize: 13,
    align: "left",
  },
  navySub: {
    fillColor: "#1E3A5F",
    textColor: "#ffffff",
    fontSize: 10,
    align: "left",
  },
  sectionHeader: {
    bold: true,
    fillColor: "#2B579A",
    textColor: "#ffffff",
    fontSize: 10,
    align: "left",
  },
  tableHeader: {
    bold: true,
    fillColor: "#2B579A",
    textColor: "#ffffff",
    fontSize: 10,
    align: "center",
  },
  label: {
    bold: true,
    fillColor: "#D9E8F7",
    textColor: "#1E3A5F",
    align: "left",
  },
  metricLabel: {
    bold: true,
    fillColor: "#f8fafc",
    textColor: "#1E3A5F",
    align: "left",
  },
  number: {
    align: "right",
    textColor: "#0f172a",
  },
  text: {
    align: "left",
    textColor: "#0f172a",
  },
  total: {
    bold: true,
    fillColor: "#D9E8F7",
    textColor: "#1E3A5F",
    align: "right",
  },
  shortcutBtn: {
    bold: true,
    fillColor: "#3B82F6",
    textColor: "#ffffff",
    align: "center",
  },
  empty: {
    textColor: "#0f172a",
  },
};
const FINANCIAL_WORKBOOK_SECTIONS: readonly WorkbookSectionConfig[] = [
  {
    key: "underwriting",
    title: "Underwriting",
    description:
      "Development model summary, project parameters, uses of funds, and key return metrics (English financial template).",
    accentClass: "border-blue-300 bg-blue-50 text-blue-800",
    exportFields: [],
    isFinancialTemplate: true,
  },
  {
    key: "annualCf",
    title: "Annual CF",
    description:
      "Annual development, operating cash flow, and operating expense forecast by project year (English financial template).",
    accentClass: "border-indigo-300 bg-indigo-50 text-indigo-800",
    exportFields: [],
    isFinancialTemplate: true,
  },
  {
    key: "credit",
    title: "Credit",
    description: "Liquidity, leverage, net debt, and coverage model for lender-style review.",
    accentClass: "border-slate-300 bg-slate-50 text-slate-800",
    exportFields: [],
    isFinancialTemplate: true,
  },
  {
    key: "quality",
    title: "Quality",
    description: "Quality-of-earnings model focused on margins, cash conversion, capex, and capital return.",
    accentClass: "border-teal-300 bg-teal-50 text-teal-800",
    exportFields: [],
    isFinancialTemplate: true,
  },
  {
    key: "returns",
    title: "Returns",
    description: "ROIC, ROE, ROA, turnover, and operating efficiency model.",
    accentClass: "border-orange-300 bg-orange-50 text-orange-800",
    exportFields: [],
    isFinancialTemplate: true,
  },
] as const;
const DATA_WORKBOOK_SECTIONS: readonly WorkbookSectionConfig[] = [
  {
    key: "summary",
    title: "Executive Summary",
    description: "Core revenue, profit, and capital structure fields for the current company workbook.",
    accentClass: "border-emerald-300 bg-emerald-50 text-emerald-700",
    exportFields: [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "operatingIncome",
      "netIncome",
      "ebitda",
      "freeCashFlow",
      "totalAssets",
      "totalLiabilities",
      "totalEquity",
      "netDebt",
      "netDebtToEbitda",
      "fcfConversion",
      "roic",
    ],
  },
  {
    key: "segment",
    title: "Segment",
    description: "Volume and per-unit operating fields used for segment-style operating comparisons.",
    accentClass: "border-amber-300 bg-amber-50 text-amber-700",
    exportFields: [
      "volumeHeads",
      "volumeLbs",
      "volumeCwt",
      "opPerHead",
      "opPerCwt",
      "adjustedOpPerHead",
      "adjustedOpPerCwt",
    ],
    focusField: "volumeHeads",
  },
  {
    key: "income",
    title: "Income & Margins",
    description: "Income statement lines, earnings metrics, and profitability margins.",
    accentClass: "border-sky-300 bg-sky-50 text-sky-700",
    exportFields: [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "operatingIncome",
      "netIncome",
      "grossMargin",
      "operatingMargin",
      "netMargin",
      "operatingExpenses",
      "sgaExpense",
      "rdExpense",
      "depreciation",
      "ebit",
      "ebitda",
      "ebitdaMargin",
      "interestExpense",
      "incomeTax",
      "epsBasic",
      "epsDiluted",
      "shareBasedComp",
      "sgaAsPercent",
    ],
    focusField: "grossMargin",
  },
  {
    key: "balance",
    title: "Balance Sheet",
    description: "Balance sheet, leverage, liquidity, and returns on capital fields.",
    accentClass: "border-violet-300 bg-violet-50 text-violet-700",
    exportFields: [
      "totalAssets",
      "totalLiabilities",
      "totalEquity",
      "totalDebt",
      "shortTermDebt",
      "longTermDebt",
      "netDebt",
      "cashAndEquivalents",
      "currentAssets",
      "currentLiabilities",
      "workingCapital",
      "inventory",
      "accountsReceivable",
      "accountsPayable",
      "debtToEquity",
      "debtToCapital",
      "netDebtToEbitda",
      "interestCoverage",
      "currentRatio",
      "roe",
      "roa",
      "roic",
      "assetTurnover",
      "inventoryTurnover",
      "receivablesTurnover",
      "workingCapitalRatio",
    ],
    focusField: "totalAssets",
  },
  {
    key: "cashflow",
    title: "Cash Flow",
    description: "Operating cash flow, capital spending, dividends, and free cash flow metrics.",
    accentClass: "border-cyan-300 bg-cyan-50 text-cyan-700",
    exportFields: [
      "operatingCashFlow",
      "capex",
      "freeCashFlow",
      "fcfMargin",
      "fcfConversion",
      "dividendsPaid",
      "shareRepurchases",
      "investingCashFlow",
      "financingCashFlow",
      "cashAndEquivalents",
    ],
    focusField: "operatingCashFlow",
  },
  {
    key: "analysis",
    title: "Analysis",
    description: "Adjustments and analyst-only comparison fields for normalized operating views.",
    accentClass: "border-rose-300 bg-rose-50 text-rose-700",
    exportFields: [
      "ercAdjustment",
      "legalChargeAdjustment",
      "transferValueAdjustment",
      "corporateAllocationAdjustment",
      "adjustedOperatingIncome",
      "adjustedOperatingMargin",
      "adjustedOpPerHead",
      "adjustedOpPerCwt",
      "sgaAsPercent",
      "fcfConversion",
      "roic",
      "netDebtToEbitda",
      "interestCoverage",
      "workingCapitalRatio",
    ],
    focusField: "ercAdjustment",
  },
] as const;
const WORKBOOK_SECTIONS: readonly WorkbookSectionConfig[] = [
  ...FINANCIAL_WORKBOOK_SECTIONS,
  ...DATA_WORKBOOK_SECTIONS,
];
const WORKBOOK_COLUMN_INDEX_BY_FIELD = new Map(
  WORKBOOK_COLUMNS.map((column, index) => [column.field, index]),
);
const CUSTOM_WORKBOOK_FIELD_PREFIX = "__custom_col__";

function getWorkbookColumnsForSection(section: WorkbookSectionConfig) {
  const fieldSet = new Set<string>([...BASE_WORKBOOK_FIELDS, ...section.exportFields]);
  return WORKBOOK_COLUMNS.filter((column) => fieldSet.has(column.field));
}

function isEditableWorkbookField(field: string): boolean {
  return Boolean(field);
}

function getDefaultColumnWidth(field: string): number {
  return DEFAULT_COLUMN_WIDTHS[field] ?? DEFAULT_METRIC_COLUMN_WIDTH;
}

function isWorkbookSectionKey(value: string): value is WorkbookSectionKey {
  return WORKBOOK_SECTIONS.some((section) => section.key === value);
}

function financialGridToEditableWorkbook(
  sheetKey: FinancialModelSheetKey,
  sheetName: string,
  context: ReturnType<typeof buildFinancialModelContext>,
): EditableWorkbook {
  const model = buildFinancialGrid(sheetKey, context);
  const cells = Array.from({ length: model.rowCount }, (_, rowIndex) =>
    Array.from({ length: model.colCount }, (_, colIndex) =>
      getCellDisplayValue(model, {}, rowIndex, colIndex),
    ),
  );
  const styles: EditableWorkbook["styles"] = {};

  for (const [cellAddress, cell] of model.cells) {
    const [rowPart, colPart] = cellAddress.split(",").map(Number);
    if (!Number.isFinite(rowPart) || !Number.isFinite(colPart)) continue;

    const style = FINANCIAL_TEMPLATE_STYLES[cell.style] ?? FINANCIAL_TEMPLATE_STYLES.empty;
    const rowSpan = Math.max(1, cell.rowspan ?? 1);
    const colSpan = Math.max(1, cell.colspan ?? 1);

    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
        styles[excelCellStyleKey(0, rowPart + rowOffset, colPart + colOffset)] = style;
      }
    }
  }

  return {
    sheets: [
      {
        name: sheetName,
        cells,
      },
    ],
    styles,
  };
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

function getWorkbookFieldReference(field: string, rowNumber: number): string | null {
  const columnIndex = WORKBOOK_COLUMN_INDEX_BY_FIELD.get(field);
  if (typeof columnIndex !== "number" || rowNumber < 1) return null;
  return `${columnIndexToLetter(columnIndex)}${rowNumber}`;
}

function workbookColumnLetterToIndex(label: string): number {
  let value = 0;
  for (const ch of label.toUpperCase()) {
    value = value * 26 + (ch.charCodeAt(0) - 64);
  }
  return value - 1;
}

function parseWorkbookCellReference(reference: string): { rowIndex: number; colIndex: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(reference.trim());
  if (!match) return null;

  return {
    colIndex: workbookColumnLetterToIndex(match[1]),
    rowIndex: Number(match[2]) - 1,
  };
}

function getFormulaReferenceHighlights(formula: string): Map<string, number> {
  const highlights = new Map<string, number>();
  const matches = formula.matchAll(/\b([A-Z]+[0-9]+)(?::([A-Z]+[0-9]+))?\b/gi);
  let tokenIndex = 0;

  for (const match of matches) {
    const start = parseWorkbookCellReference(match[1]);
    const end = match[2] ? parseWorkbookCellReference(match[2]) : start;
    if (!start || !end) continue;

    const colorIndex = tokenIndex % FORMULA_REFERENCE_COLORS.length;
    tokenIndex += 1;

    const rowStart = Math.min(start.rowIndex, end.rowIndex);
    const rowEnd = Math.max(start.rowIndex, end.rowIndex);
    const colStart = Math.min(start.colIndex, end.colIndex);
    const colEnd = Math.max(start.colIndex, end.colIndex);

    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
      for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
        const key = `${rowIndex}:${colIndex}`;
        if (!highlights.has(key)) {
          highlights.set(key, colorIndex);
        }
      }
    }
  }

  return highlights;
}

function getWorkbookDerivedFormula(
  row: DataSourceRow,
  field: string,
  rowNumber: number,
): string | null {
  if (row.periodEnd === "TTM") return null;

  const ref = (targetField: string) => getWorkbookFieldReference(targetField, rowNumber);

  const revenueRef = ref("revenue");
  const grossProfitRef = ref("grossProfit");
  const operatingIncomeRef = ref("operatingIncome");
  const netIncomeRef = ref("netIncome");
  const totalAssetsRef = ref("totalAssets");
  const totalLiabilitiesRef = ref("totalLiabilities");
  const totalEquityRef = ref("totalEquity");
  const totalDebtRef = ref("totalDebt");
  const operatingCashFlowRef = ref("operatingCashFlow");
  const capexRef = ref("capex");
  const depreciationRef = ref("depreciation");
  const ebitdaRef = ref("ebitda");
  const freeCashFlowRef = ref("freeCashFlow");
  const volumeHeadsRef = ref("volumeHeads");
  const volumeLbsRef = ref("volumeLbs");
  const volumeCwtRef = ref("volumeCwt");
  const ercAdjustmentRef = ref("ercAdjustment");
  const legalChargeAdjustmentRef = ref("legalChargeAdjustment");
  const transferValueAdjustmentRef = ref("transferValueAdjustment");
  const corporateAllocationAdjustmentRef = ref("corporateAllocationAdjustment");
  const adjustedOperatingIncomeRef = ref("adjustedOperatingIncome");
  const sgaExpenseRef = ref("sgaExpense");

  switch (field) {
    case "totalAssets":
      return totalLiabilitiesRef && totalEquityRef ? `=${totalLiabilitiesRef}+${totalEquityRef}` : null;
    case "totalLiabilities":
      return totalAssetsRef && totalEquityRef ? `=${totalAssetsRef}-${totalEquityRef}` : null;
    case "totalEquity":
      return totalAssetsRef && totalLiabilitiesRef ? `=${totalAssetsRef}-${totalLiabilitiesRef}` : null;
    case "grossMargin":
      return revenueRef && grossProfitRef ? `=${grossProfitRef}/${revenueRef}*100` : null;
    case "operatingMargin":
      return revenueRef && operatingIncomeRef ? `=${operatingIncomeRef}/${revenueRef}*100` : null;
    case "netMargin":
      return revenueRef && netIncomeRef ? `=${netIncomeRef}/${revenueRef}*100` : null;
    case "ebit":
      return operatingIncomeRef ? `=${operatingIncomeRef}` : null;
    case "freeCashFlow":
      return operatingCashFlowRef && capexRef ? `=${operatingCashFlowRef}-${capexRef}` : null;
    case "ebitda":
      return operatingIncomeRef && depreciationRef ? `=${operatingIncomeRef}+${depreciationRef}` : null;
    case "ebitdaMargin":
      return revenueRef && ebitdaRef ? `=${ebitdaRef}/${revenueRef}*100` : null;
    case "debtToEquity":
      return totalDebtRef && totalEquityRef ? `=${totalDebtRef}/${totalEquityRef}` : null;
    case "roe":
      return netIncomeRef && totalEquityRef ? `=${netIncomeRef}/${totalEquityRef}*100` : null;
    case "roa":
      return netIncomeRef && totalAssetsRef ? `=${netIncomeRef}/${totalAssetsRef}*100` : null;
    case "fcfMargin":
      return revenueRef && freeCashFlowRef ? `=${freeCashFlowRef}/${revenueRef}*100` : null;
    case "volumeCwt":
      return volumeLbsRef ? `=${volumeLbsRef}/100` : null;
    case "opPerHead":
      return operatingIncomeRef && volumeHeadsRef ? `=${operatingIncomeRef}*1000/${volumeHeadsRef}` : null;
    case "opPerCwt":
      return operatingIncomeRef && volumeCwtRef ? `=${operatingIncomeRef}/${volumeCwtRef}` : null;
    case "adjustedOperatingIncome":
      return operatingIncomeRef && ercAdjustmentRef && legalChargeAdjustmentRef && transferValueAdjustmentRef && corporateAllocationAdjustmentRef
        ? `=${operatingIncomeRef}-${ercAdjustmentRef}+${legalChargeAdjustmentRef}-${transferValueAdjustmentRef}+${corporateAllocationAdjustmentRef}`
        : null;
    case "adjustedOperatingMargin":
      return adjustedOperatingIncomeRef && revenueRef ? `=${adjustedOperatingIncomeRef}/${revenueRef}*100` : null;
    case "adjustedOpPerHead":
      return adjustedOperatingIncomeRef && volumeHeadsRef ? `=${adjustedOperatingIncomeRef}*1000/${volumeHeadsRef}` : null;
    case "adjustedOpPerCwt":
      return adjustedOperatingIncomeRef && volumeCwtRef ? `=${adjustedOperatingIncomeRef}/${volumeCwtRef}` : null;
    case "sgaAsPercent":
      return sgaExpenseRef && revenueRef ? `=IF(${sgaExpenseRef}<0,-${sgaExpenseRef},${sgaExpenseRef})/${revenueRef}*100` : null;
    default:
      return null;
  }
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
  if (value == null || value === "") return "";
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
  if (value == null || value === "") return "";
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

function normalizeCompanyWorkbookOptions(payload: unknown): CompanyWorkbookOption[] {
  if (!Array.isArray(payload)) return [];

  const deduped = new Map<string, CompanyWorkbookOption>();
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;

    const ticker = typeof (entry as CompanyWorkbookOption).ticker === "string"
      ? (entry as CompanyWorkbookOption).ticker.trim().toUpperCase()
      : "";
    const companyName = typeof (entry as CompanyWorkbookOption).companyName === "string"
      ? (entry as CompanyWorkbookOption).companyName.trim()
      : "";

    if (!ticker || deduped.has(ticker)) continue;
    deduped.set(ticker, {
      ticker,
      companyName: companyName || ticker,
    });
  }

  return [...deduped.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function normalizeWorkbookThreadsPayload(payload: unknown): ChatThreadSummary[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const threadEntry = entry as ChatThreadSummary;
    const id = typeof threadEntry.id === "string"
      ? threadEntry.id.trim()
      : "";
    const title = typeof threadEntry.title === "string"
      ? threadEntry.title.trim()
      : "";
    const createdAt = typeof threadEntry.createdAt === "string"
      ? threadEntry.createdAt
      : "";
    const updatedAt = typeof threadEntry.updatedAt === "string"
      ? threadEntry.updatedAt
      : "";

    if (!id || !title || !createdAt || !updatedAt) return [];

    return [{
      id,
      title,
      createdAt,
      updatedAt,
      kind: threadEntry.kind === "data-source-workbook" ? "data-source-workbook" : "general",
      companyTicker:
        typeof threadEntry.companyTicker === "string"
          ? threadEntry.companyTicker.trim().toUpperCase() || null
          : null,
      companyName:
        typeof threadEntry.companyName === "string"
          ? threadEntry.companyName.trim() || null
          : null,
      sourceThreadId:
        typeof threadEntry.sourceThreadId === "string"
          ? threadEntry.sourceThreadId.trim() || null
          : null,
    }];
  });
}

function buildCachedWorkbookPayload(data: Record<string, unknown>): CachedWorkbookPayload {
  return {
    rows: Array.isArray(data.rows) ? (data.rows as DataSourceRow[]) : [],
    workbookCells: normalizeWorkbookCellsPayload(data.workbookCells),
    editLog: Array.isArray(data.editLog) ? (data.editLog as DataSourceEditLogEntry[]) : [],
    availableCompanies: normalizeCompanyWorkbookOptions((data as { availableCompanies?: unknown }).availableCompanies),
    workbookThreads: normalizeWorkbookThreadsPayload((data as { workbookThreads?: unknown }).workbookThreads),
    schemaReady: (data as { schemaReady?: boolean }).schemaReady !== false,
    threadSchemaMessage:
      typeof (data as { threadSchemaMessage?: unknown }).threadSchemaMessage === "string"
        ? ((data as { threadSchemaMessage: string }).threadSchemaMessage || null)
        : null,
    selectedCompanyTicker:
      typeof (data as { selectedCompanyTicker?: unknown }).selectedCompanyTicker === "string"
        ? ((data as { selectedCompanyTicker: string }).selectedCompanyTicker.trim().toUpperCase() || null)
        : null,
    selectedThreadId:
      typeof (data as { selectedThreadId?: unknown }).selectedThreadId === "string"
        ? ((data as { selectedThreadId: string }).selectedThreadId.trim() || null)
        : null,
  };
}

function getWorkbookSelectionKey(
  companyTicker: string | null | undefined,
  threadId: string | null | undefined,
): string | null {
  if (threadId?.trim()) return `thread:${threadId.trim()}`;
  if (companyTicker?.trim()) return `company:${companyTicker.trim().toUpperCase()}`;
  return null;
}

function buildNavigatorSignature(payload: CachedWorkbookPayload): string {
  return JSON.stringify({
    availableCompanies: payload.availableCompanies,
    workbookThreads: payload.workbookThreads,
    schemaReady: payload.schemaReady,
    threadSchemaMessage: payload.threadSchemaMessage,
    selectedCompanyTicker: payload.selectedCompanyTicker,
    selectedThreadId: payload.selectedThreadId,
  });
}

function buildWorkbookSignature(payload: CachedWorkbookPayload): string {
  return JSON.stringify({
    rows: payload.rows,
    workbookCells: payload.workbookCells,
    editLog: payload.editLog,
  });
}

function readCachedWorkbookSnapshot(): CachedWorkbookSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(WORKBOOK_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      version?: unknown;
      selectionKey?: unknown;
      cachedAt?: unknown;
      viewState?: { activeSheet?: unknown };
      payload?: unknown;
    };

    if (parsed.version !== 1 || !parsed.payload || typeof parsed.payload !== "object") {
      return null;
    }

    const activeSheet =
      typeof parsed.viewState?.activeSheet === "string" && isWorkbookSectionKey(parsed.viewState.activeSheet)
        ? parsed.viewState.activeSheet
        : "summary";

    return {
      version: 1,
      selectionKey: typeof parsed.selectionKey === "string" ? parsed.selectionKey : null,
      cachedAt: typeof parsed.cachedAt === "string" ? parsed.cachedAt : new Date(0).toISOString(),
      viewState: { activeSheet },
      payload: buildCachedWorkbookPayload(parsed.payload as Record<string, unknown>),
    };
  } catch {
    return null;
  }
}

function writeCachedWorkbookSnapshot(snapshot: CachedWorkbookSnapshot): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(WORKBOOK_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota errors
  }
}

function cachedSnapshotMatchesSelection(
  snapshot: CachedWorkbookSnapshot,
  companyTicker: string | null,
  threadId: string | null,
): boolean {
  if (threadId) {
    return snapshot.payload.selectedThreadId === threadId;
  }
  if (companyTicker) {
    return snapshot.payload.selectedCompanyTicker === companyTicker;
  }
  return true;
}

function parseNumericInput(input: string): number | null {
  const cleaned = input.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "--") return null;
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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${
        active
          ? "border-[#217346]/35 bg-[#217346]/10 text-[#217346]"
          : "border-[#d0d7de] bg-white text-slate-600 hover:bg-[#f7f7f7]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function RibbonCommand({
  active = false,
  disabled = false,
  icon,
  label,
  hint,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={hint ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold transition ${
        active
          ? "border-[#217346]/40 bg-[#e9f5ee] text-[#217346]"
          : "border-[#d0d7de] bg-white text-slate-700 hover:bg-[#f7f7f7]"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f3f6f4] text-[#217346]">
        {icon}
      </span>
      <span className="leading-4">{label}</span>
    </button>
  );
}

function CompactToolbarButton({
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
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-slate-700 transition ${
        active ? "bg-[#dcebe3] text-[#217346]" : "hover:bg-slate-200/80"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function SheetContextMenuItem({
  disabled = false,
  icon,
  label,
  shortcut,
  badge,
  submenu = false,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  badge?: string;
  submenu?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-full items-center gap-3 px-3 text-left text-sm text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-600 group-disabled:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      {shortcut ? <span className="text-xs text-slate-400">{shortcut}</span> : null}
      {submenu ? <ChevronRight className="h-4 w-4 text-slate-500" /> : null}
    </button>
  );
}

function confidenceBadgeClass(confidence: DataSourceMetricTrace["confidence"] | "edited" | "calculated") {
  switch (confidence) {
    case "high":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "calculated":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "edited":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function formatTraceValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "Blank";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value;
}

function MetricDetailDrawer({
  open,
  row,
  field,
  column,
  cellReference,
  displayValue,
  trace,
  cellState,
  derivedFormula,
  editEntries,
  onClose,
}: {
  open: boolean;
  row: DataSourceRow | null;
  field: string | null;
  column: WorkbookColumn | null;
  cellReference: string | null;
  displayValue: string;
  trace: DataSourceMetricTrace | null;
  cellState: DataSourceWorkbookCellState | null;
  derivedFormula: string | null;
  editEntries: DataSourceEditLogEntry[];
  onClose: () => void;
}) {
  if (!open) return null;

  const metricName = column?.label ?? field ?? "Selected cell";
  const formula = cellState?.formula ?? derivedFormula ?? null;
  const isEdited = editEntries.length > 0;
  const statusBadges: Array<{ label: string; tone: DataSourceMetricTrace["confidence"] | "edited" | "calculated" }> = [];
  if (trace) statusBadges.push({ label: "Extracted", tone: trace.confidence });
  if (formula) statusBadges.push({ label: "Calculated", tone: "calculated" });
  if (isEdited) statusBadges.push({ label: "Edited", tone: "edited" });
  if (statusBadges.length === 0) statusBadges.push({ label: "Manual / blank", tone: "medium" });

  const source = trace?.source ?? "Workbook value; no filing source attached yet.";
  const originalText = trace?.originalText ?? "No exact filing line stored for this cell yet.";
  const normalizedCalculation =
    formula ??
    trace?.normalizedCalculation ??
    "Direct workbook value. Add a formula or re-run extraction to attach a richer calculation trail.";
  const explanation = formula
    ? `${metricName} is calculated in the workbook from ${formula}. Validate referenced cells before using it in an investor memo.`
    : trace
      ? `${metricName} is tied to ${source}. The value should be read with ${trace.confidence} confidence and reconciled against nearby period trends before publication.`
      : `${metricName} is currently a workbook-only value. Treat it as analyst-maintained until it is connected to a filing source.`;
  const managementQuestion = `What drove ${metricName.toLowerCase()} for ${row?.ticker ?? "this company"} in ${row?.quarterLabel ?? "this period"}, and is the change recurring, timing-related, or one-time?`;

  const traceMarkdown = [
    `Metric: ${metricName}`,
    `Cell: ${cellReference ?? "N/A"}`,
    `Company: ${row?.ticker ?? "N/A"} (${row?.companyName ?? "N/A"})`,
    `Period: ${row?.quarterLabel ?? "N/A"} / ${row?.periodEnd ?? "N/A"}`,
    `Value: ${displayValue || formatTraceValue(trace?.value)}`,
    `Source: ${source}`,
    `Confidence: ${trace?.confidence ?? "workbook-only"}`,
    `Original line: ${originalText}`,
    `Calculation: ${normalizedCalculation}`,
    `AI explanation: ${explanation}`,
    `Management question: ${managementQuestion}`,
  ].join("\n");

  return (
    <aside className="fixed right-5 top-24 z-40 flex max-h-[calc(100vh-7rem)] w-[430px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-200">Metric detail</p>
            <h3 className="mt-2 truncate text-xl font-semibold">{metricName}</h3>
            <p className="mt-1 text-sm text-slate-300">
              {cellReference ?? "No cell"} · {row?.ticker ?? "No company"} · {row?.quarterLabel ?? "No period"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close metric detail"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/10 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Current value</p>
          <p className="mt-1 text-3xl font-semibold">{displayValue || formatTraceValue(trace?.value)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusBadges.map((badge) => (
              <span
                key={`${badge.label}-${badge.tone}`}
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${confidenceBadgeClass(badge.tone)}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm text-slate-700">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            Source
          </div>
          <p className="mt-2 leading-6">{source}</p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-600">
            {originalText}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Normalized calculation</p>
          <p className="mt-2 rounded-lg bg-slate-950 p-3 font-mono text-xs leading-5 text-emerald-100">
            {normalizedCalculation}
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">AI explanation</p>
          <p className="mt-2 leading-6">{explanation}</p>
        </section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">Management question</p>
          <p className="mt-2 leading-6 text-amber-900">{managementQuestion}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Edit history</p>
          {editEntries.length > 0 ? (
            <div className="mt-3 space-y-2">
              {editEntries.slice(0, 6).map((entry) => (
                <div key={`${entry.at}-${entry.field}-${entry.kind}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold uppercase tracking-[0.16em] text-slate-500">{entry.kind}</span>
                    <span className="text-slate-400">{new Date(entry.at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 font-mono text-xs text-slate-700">
                    {formatTraceValue(entry.prevValue)} → {formatTraceValue(entry.nextValue)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-slate-500">No saved edits for this cell yet.</p>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(traceMarkdown);
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          <Copy className="h-4 w-4" />
          Copy trace
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    </aside>
  );
}

export default function DataSourcePage({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const workbookRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initialWorkbookCellsRef = useRef<string>("{}");
  const initialThreadSelectionAppliedRef = useRef(false);
  const workbookSignatureRef = useRef<string>("");
  const navigatorSignatureRef = useRef<string>("");
  const hasUnsavedChangesRef = useRef(false);

  const [baseRows, setBaseRows] = useState<DataSourceRow[]>([]);
  const [aiFinancialBoard, setAiFinancialBoard] = useState<{
    sections: FilingCategorySection[];
    headline: string;
  } | null>(null);
  const [aiBoardLoading, setAiBoardLoading] = useState(false);
  const [workbookCells, setWorkbookCells] = useState<WorkbookRowCellStateMap>({});
  const [embeddedExcelStylesBySheet, setEmbeddedExcelStylesBySheet] = useState<
    Partial<Record<WorkbookSectionKey, Record<string, DataSourceWorkbookCellStyle | null>>>
  >({});
  const [numericOverrides, setNumericOverrides] = useState<WorkbookNumericOverrideMap>({});
  const [editLog, setEditLog] = useState<DataSourceEditLogEntry[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyWorkbookOption[]>([]);
  const [workbookThreads, setWorkbookThreads] = useState<ChatThreadSummary[]>([]);
  const [selectedCompanyTicker, setSelectedCompanyTicker] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadSchemaReady, setThreadSchemaReady] = useState(true);
  const [threadSchemaMessage, setThreadSchemaMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navigatorLoading, setNavigatorLoading] = useState(true);
  const [creatingThreadTicker, setCreatingThreadTicker] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<WorkbookSectionKey>("underwriting");
  const [financialScrollTarget, setFinancialScrollTarget] = useState<string | null>(null);
  const [ribbonTab, setRibbonTab] = useState<"home" | "insert" | "review" | "view">("home");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [freezeFirstColumn, setFreezeFirstColumn] = useState(true);
  const [showFormulas, setShowFormulas] = useState(false);
  const [sheetSearchQuery, setSheetSearchQuery] = useState("");
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [worksheetColumnsBySheet, setWorksheetColumnsBySheet] = useState<Partial<Record<WorkbookSectionKey, WorkbookColumn[]>>>({});
  const [sortByWorkflow, setSortByWorkflow] = useState<Record<WorkflowOrigin, SortState | null>>({
    analyze: null,
    competitor: null,
  });
  const [editingEnabled, setEditingEnabled] = useState<Record<WorkflowOrigin, boolean>>({
    analyze: true,
    competitor: true,
  });
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [inlineDraft, setInlineDraft] = useState("");
  const [formulaDraft, setFormulaDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [metricDetailOpen, setMetricDetailOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [editConfirm, setEditConfirm] = useState<EditConfirmState | null>(null);
  const [editWarningAcknowledged, setEditWarningAcknowledged] = useState(false);
  const [copiedCellStyle, setCopiedCellStyle] = useState<DataSourceWorkbookCellStyle | null>(null);
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

  const activeSheetConfig = useMemo(
    () => WORKBOOK_SECTIONS.find((section) => section.key === activeSheet) ?? WORKBOOK_SECTIONS[0],
    [activeSheet],
  );

  const baseVisibleColumns = useMemo(
    () => getWorkbookColumnsForSection(activeSheetConfig),
    [activeSheetConfig],
  );

  const visibleColumns = useMemo(
    () => worksheetColumnsBySheet[activeSheet] ?? baseVisibleColumns,
    [activeSheet, baseVisibleColumns, worksheetColumnsBySheet],
  );

  const totalTableWidth = useMemo(() => {
    let sum = getColumnWidth(ROW_NUMBER_COLUMN_KEY);
    for (const column of visibleColumns) sum += getColumnWidth(column.field);
    return sum;
  }, [getColumnWidth, visibleColumns]);

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

  const updateSelectionUrl = useCallback((companyTicker: string, threadId?: string | null) => {
    if (embedded) return;
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    params.set("company", companyTicker);
    if (threadId) {
      params.set("thread", threadId);
    } else {
      params.delete("thread");
    }
    router.replace(`/data-source?${params.toString()}`, { scroll: false });
  }, [embedded, router]);

  const applyNavigatorPayload = useCallback((
    payload: CachedWorkbookPayload,
    options?: { syncUrl?: boolean },
  ) => {
    setThreadSchemaReady(payload.schemaReady);
    setThreadSchemaMessage(payload.schemaReady ? null : payload.threadSchemaMessage);
    setCompanyOptions(payload.availableCompanies);
    setWorkbookThreads(payload.workbookThreads);
    setSelectedCompanyTicker(payload.selectedCompanyTicker);
    setSelectedThreadId(payload.selectedThreadId);

    if (options?.syncUrl && payload.selectedCompanyTicker) {
      updateSelectionUrl(payload.selectedCompanyTicker, payload.selectedThreadId);
    }

    navigatorSignatureRef.current = buildNavigatorSignature(payload);
  }, [updateSelectionUrl]);

  const applyWorkbookPayload = useCallback((
    payload: CachedWorkbookPayload,
    options?: {
      preserveSelection?: boolean;
      preserveActiveSheet?: boolean;
      activeSheetOverride?: WorkbookSectionKey;
    },
  ) => {
    setBaseRows(payload.rows);
    setAiFinancialBoard(null);
    setWorkbookCells(payload.workbookCells);
    setEditLog(payload.editLog);
    setNumericOverrides({});
    setUndoStack([]);
    setRedoStack([]);
    setEditingCell(null);
    setInlineDraft("");
    setContextMenu(null);
    setFormulaDraft("");
    if (!options?.preserveSelection) {
      setSelection(null);
    }
    if (options?.activeSheetOverride) {
      setActiveSheet(options.activeSheetOverride);
    } else if (!options?.preserveActiveSheet) {
      setActiveSheet("underwriting");
    }
    initialWorkbookCellsRef.current = serializeWorkbookRowCellStates(payload.workbookCells);
    workbookSignatureRef.current = buildWorkbookSignature(payload);
  }, []);

  const applyWorkbookContentPayload = useCallback((payload: CachedWorkbookPayload) => {
    startTransition(() => {
      setBaseRows(payload.rows);
      setAiFinancialBoard(null);
      setWorkbookCells(payload.workbookCells);
      setEditLog(payload.editLog);
      setNumericOverrides({});
      setUndoStack([]);
      setRedoStack([]);
      setEditingCell(null);
      setInlineDraft("");
      setContextMenu(null);
    });
    initialWorkbookCellsRef.current = serializeWorkbookRowCellStates(payload.workbookCells);
    workbookSignatureRef.current = buildWorkbookSignature(payload);
  }, []);

  const mergeWorkbookThread = useCallback((thread: ChatThreadSummary) => {
    setWorkbookThreads((current) => {
      const next = [thread, ...current.filter((entry) => entry.id !== thread.id)];
      next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return next;
    });
  }, []);

  const fetchData = useCallback(async (options?: {
    includeNavigator?: boolean;
    companyTicker?: string | null;
    threadId?: string | null;
    preserveVisibleState?: boolean;
    preserveNavigatorState?: boolean;
    resetWorkbookUi?: boolean;
  }) => {
    const includeNavigator = options?.includeNavigator ?? true;
    const nextCompanyTicker = options?.companyTicker ?? selectedCompanyTicker;
    const nextThreadId = options?.threadId ?? selectedThreadId;
    const preserveVisibleState =
      options?.preserveVisibleState ??
      (baseRows.length > 0 || Object.keys(workbookCells).length > 0);
    const preserveNavigatorState =
      options?.preserveNavigatorState ??
      (companyOptions.length > 0 || workbookThreads.length > 0);
    const resetWorkbookUi = options?.resetWorkbookUi ?? !preserveVisibleState;

    if (!nextThreadId && !nextCompanyTicker && !includeNavigator) {
      setLoading(false);
      setRevalidating(false);
      setBaseRows([]);
      setWorkbookCells({});
      setEditLog([]);
      setNumericOverrides({});
      initialWorkbookCellsRef.current = "{}";
      workbookSignatureRef.current = "";
      navigatorSignatureRef.current = "";
      return;
    }

    if (!preserveVisibleState) {
      setLoading(true);
    }
    if (includeNavigator && !preserveNavigatorState) {
      setNavigatorLoading(true);
    }
    if (preserveVisibleState || (includeNavigator && preserveNavigatorState)) {
      setRevalidating(true);
    }

    try {
      const params = new URLSearchParams();
      if (includeNavigator) params.set("includeNavigator", "1");
      if (nextThreadId) {
        params.set("threadId", nextThreadId);
      } else if (nextCompanyTicker) {
        params.set("companyTicker", nextCompanyTicker);
      }
      const endpoint = `/api/data-source${params.size > 0 ? `?${params.toString()}` : ""}`;
      const response = await fetchWithAuth(endpoint);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.alert((data as { error?: string }).error ?? `Failed to load workbook (HTTP ${response.status})`);
        return;
      }

      const payload = buildCachedWorkbookPayload(data as Record<string, unknown>);
      const nextNavigatorSignature = buildNavigatorSignature(payload);
      const nextWorkbookSignature = buildWorkbookSignature(payload);

      if (includeNavigator) {
        if (nextNavigatorSignature !== navigatorSignatureRef.current) {
          applyNavigatorPayload(payload, { syncUrl: !embedded });
        }
      }

      if (nextWorkbookSignature !== workbookSignatureRef.current && !hasUnsavedChangesRef.current) {
        if (resetWorkbookUi) {
          applyWorkbookPayload(payload, {
            preserveSelection: false,
            preserveActiveSheet: false,
          });
        } else {
          applyWorkbookContentPayload(payload);
        }
      }

      writeCachedWorkbookSnapshot({
        version: 1,
        selectionKey: getWorkbookSelectionKey(payload.selectedCompanyTicker, payload.selectedThreadId),
        cachedAt: new Date().toISOString(),
        viewState: {
          activeSheet: resetWorkbookUi ? "underwriting" : activeSheet,
        },
        payload,
      });
    } finally {
      setLoading(false);
      setRevalidating(false);
      if (includeNavigator) setNavigatorLoading(false);
    }
  }, [
    activeSheet,
    applyWorkbookContentPayload,
    applyNavigatorPayload,
    applyWorkbookPayload,
    embedded,
    baseRows.length,
    companyOptions.length,
    selectedCompanyTicker,
    selectedThreadId,
    workbookCells,
    workbookThreads.length,
  ]);

  useLayoutEffect(() => {
    const currentSearchParams = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    const requestedThreadId = currentSearchParams.get("thread")?.trim() ?? null;
    const requestedCompanyTicker = currentSearchParams.get("company")?.trim().toUpperCase() ?? null;
    const snapshot = readCachedWorkbookSnapshot();
    if (!snapshot || !cachedSnapshotMatchesSelection(snapshot, requestedCompanyTicker, requestedThreadId)) {
      return;
    }

    applyNavigatorPayload(snapshot.payload, {
      syncUrl: !embedded && !requestedCompanyTicker && !requestedThreadId,
    });
    applyWorkbookPayload(snapshot.payload, {
      activeSheetOverride: snapshot.viewState.activeSheet,
    });
    setLoading(false);
    setNavigatorLoading(false);
    setRevalidating(false);
  }, [applyNavigatorPayload, applyWorkbookPayload, embedded]);

  const threadsByCompany = useMemo(() => {
    const grouped = new Map<string, ChatThreadSummary[]>();
    for (const thread of workbookThreads) {
      if (!thread.companyTicker) continue;
      const ticker = thread.companyTicker.toUpperCase();
      if (!grouped.has(ticker)) grouped.set(ticker, []);
      grouped.get(ticker)!.push({
        ...thread,
        companyTicker: ticker,
      });
    }

    for (const threadList of grouped.values()) {
      threadList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    return grouped;
  }, [workbookThreads]);

  const companyRailOptions = useMemo(() => {
    const merged = new Map<string, CompanyWorkbookOption>();
    for (const company of companyOptions) {
      merged.set(company.ticker, company);
    }
    for (const thread of workbookThreads) {
      if (!thread.companyTicker) continue;
      const ticker = thread.companyTicker.toUpperCase();
      if (!merged.has(ticker)) {
        merged.set(ticker, {
          ticker,
          companyName: thread.companyName?.trim() || ticker,
        });
      }
    }

    return [...merged.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [companyOptions, workbookThreads]);

  const selectedCompany = useMemo(
    () => companyRailOptions.find((company) => company.ticker === selectedCompanyTicker) ?? null,
    [companyRailOptions, selectedCompanyTicker],
  );

  const selectedCompanyThreads = useMemo(
    () => (selectedCompanyTicker ? (threadsByCompany.get(selectedCompanyTicker) ?? []) : []),
    [selectedCompanyTicker, threadsByCompany],
  );

  const { rows: computedRows, formulaErrors } = useMemo(
    () => computeWorkbookRows(baseRows, numericOverrides, workbookCells),
    [baseRows, numericOverrides, workbookCells],
  );

  const activeWorkflow: WorkflowOrigin = "analyze";

  const currentWorkbookRows = useMemo(() => {
    if (!selectedCompanyTicker) return computedRows;
    return computedRows.filter((row) => row.ticker.toUpperCase() === selectedCompanyTicker);
  }, [computedRows, selectedCompanyTicker]);

  const isFinancialTemplateSheet = Boolean(activeSheetConfig.isFinancialTemplate);
  useEffect(() => {
    if (!selectedCompanyTicker || currentWorkbookRows.length === 0) {
      setAiFinancialBoard(null);
      setAiBoardLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setAiBoardLoading(true);
      try {
        const response = await fetchWithAuth("/api/data-source/financial-board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: currentWorkbookRows,
            company: selectedCompany,
          }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          categorySections?: FilingCategorySection[];
          headline?: string;
        };
        if (cancelled || !response.ok) return;
        setAiFinancialBoard({
          sections: Array.isArray(data.categorySections) ? data.categorySections : [],
          headline: typeof data.headline === "string" ? data.headline : "",
        });
      } catch {
        if (!cancelled) setAiFinancialBoard(null);
      } finally {
        if (!cancelled) setAiBoardLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedCompany, selectedCompanyTicker, currentWorkbookRows]);

  const financialModelContext = useMemo(
    () =>
      buildFinancialModelContext(
        selectedCompany,
        currentWorkbookRows,
        aiFinancialBoard
          ? {
              categorySections: aiFinancialBoard.sections,
              boardHeadline: aiBoardLoading
                ? "Updating AI financial board…"
                : aiFinancialBoard.headline,
            }
          : aiBoardLoading
            ? { boardHeadline: "Building AI financial board…" }
            : undefined,
      ),
    [selectedCompany, currentWorkbookRows, aiFinancialBoard, aiBoardLoading],
  );

  const handleFinancialShortcut = useCallback((target: FinancialShortcutTarget) => {
    if (target.sheet !== activeSheet) {
      setActiveSheet(target.sheet);
    }
    setFinancialScrollTarget(target.sectionId);
  }, [activeSheet]);

  const sheetRowNumbers = useMemo(
    () => Object.fromEntries(currentWorkbookRows.map((row, index) => [row.id, index + 1])),
    [currentWorkbookRows],
  );

  const visibleRows = useMemo(() => {
    return sortRows(currentWorkbookRows, sortByWorkflow[activeWorkflow]);
  }, [activeWorkflow, currentWorkbookRows, sortByWorkflow]);

  const shouldPadWorkbookRows = true;
  const workbookDisplayRowCount = shouldPadWorkbookRows
    ? Math.max(visibleRows.length, MIN_WORKBOOK_VISIBLE_ROWS)
    : visibleRows.length;
  const placeholderRowCount = Math.max(0, workbookDisplayRowCount - visibleRows.length);

  const normalizedSelection = selection ? normalizeSelection(selection) : null;
  const selectedRow = normalizedSelection ? visibleRows[normalizedSelection.endRow] : null;
  const selectedColumn = normalizedSelection ? visibleColumns[normalizedSelection.endCol] : null;
  const selectedField = selectedColumn?.field ?? null;
  const selectedRowNumber = normalizedSelection
    ? (selectedRow ? (sheetRowNumbers[selectedRow.id] ?? normalizedSelection.endRow + 1) : normalizedSelection.endRow + 1)
    : null;
  const selectedCellState = selectedRow && selectedField
    ? getWorkbookStateForCell(workbookCells, selectedRow.id, selectedField)
    : null;
  const selectedStyle = normalizeCellStyle(selectedCellState?.style);
  const copySelectedStyle = useCallback(() => {
    setCopiedCellStyle(selectedStyle ? { ...selectedStyle } : null);
  }, [selectedStyle]);
  const selectedCellError =
    selectedRow && selectedField ? formulaErrors[`${selectedRow.id}:${selectedField}`] ?? null : null;
  const canEditSelectedCell = Boolean(selectedRow && selectedField && isEditableWorkbookField(selectedField));
  const selectedDerivedFormula =
    selectedRow && selectedField && selectedRowNumber
      ? getWorkbookDerivedFormula(selectedRow, selectedField, selectedRowNumber)
      : null;
  const selectedCellReference =
    normalizedSelection && selectedColumn && selectedRowNumber
      ? `${columnIndexToLetter(WORKBOOK_COLUMN_INDEX_BY_FIELD.get(selectedColumn.field) ?? normalizedSelection.endCol)}${selectedRowNumber}`
      : null;
  const selectedMetricTrace = selectedRow && selectedField
    ? selectedRow._metricTrace?.[selectedField] ?? null
    : null;
  const selectedDisplayValue = selectedRow && selectedField
    ? fmtCellWithOverride(getRowFieldValue(selectedRow, selectedField), selectedColumn?.format, selectedStyle?.numberFormat)
    : "";
  const selectedEditEntries = useMemo(() => {
    if (!selectedRow || !selectedField) return [];
    return editLog
      .filter((entry) =>
        entry.field === selectedField &&
        entry.ticker === selectedRow.ticker &&
        entry.periodEnd === selectedRow.periodEnd,
      )
      .sort((left, right) => right.at.localeCompare(left.at));
  }, [editLog, selectedField, selectedRow]);
  const formulaReferenceHighlights = useMemo(() => {
    const draft = formulaDraft.trim();
    if (!draft.startsWith("=")) return new Map<string, number>();
    return getFormulaReferenceHighlights(draft);
  }, [formulaDraft]);

  const visibleSearchMatches = useMemo(() => {
    const query = sheetSearchQuery.trim().toLowerCase();
    if (!query) return [];
    const matches: Array<{ rowIndex: number; colIndex: number; key: string }> = [];

    visibleRows.forEach((row, rowIndex) => {
      visibleColumns.forEach((column, colIndex) => {
        const state = getWorkbookStateForCell(workbookCells, row.id, column.field);
        const raw = getRowFieldValue(row, column.field);
        const searchable = [
          column.label,
          state?.formula,
          raw == null ? "" : String(raw),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (searchable.includes(query)) {
          matches.push({ rowIndex, colIndex, key: `${rowIndex}:${colIndex}` });
        }
      });
    });

    return matches;
  }, [sheetSearchQuery, visibleColumns, visibleRows, workbookCells]);

  const searchMatchIndexByCell = useMemo(() => {
    return new Map(visibleSearchMatches.map((match, index) => [match.key, index]));
  }, [visibleSearchMatches]);

  useEffect(() => {
    setActiveSearchMatchIndex(0);
  }, [sheetSearchQuery, activeSheet]);

  const jumpToSearchMatch = useCallback((direction: "next" | "previous") => {
    if (visibleSearchMatches.length === 0) return;
    const nextIndex =
      direction === "next"
        ? (activeSearchMatchIndex + 1) % visibleSearchMatches.length
        : (activeSearchMatchIndex - 1 + visibleSearchMatches.length) % visibleSearchMatches.length;
    const match = visibleSearchMatches[nextIndex];
    setActiveSearchMatchIndex(nextIndex);
    setSelection({
      startRow: match.rowIndex,
      endRow: match.rowIndex,
      startCol: match.colIndex,
      endCol: match.colIndex,
    });
    workbookRef.current?.focus();
  }, [activeSearchMatchIndex, visibleSearchMatches]);

  const syncFormulaDraftFromSelection = useCallback(() => {
    if (!selectedRow || !selectedField) {
      setFormulaDraft("");
      return;
    }

    const currentState = getWorkbookStateForCell(workbookCells, selectedRow.id, selectedField);
    if (currentState?.formula && isEditableWorkbookField(selectedField)) {
      setFormulaDraft(currentState.formula);
      return;
    }

    if (selectedDerivedFormula && isEditableWorkbookField(selectedField)) {
      setFormulaDraft(selectedDerivedFormula);
      return;
    }

    const rawValue = getRowFieldValue(selectedRow, selectedField);
    setFormulaDraft(rawValue == null ? "" : String(rawValue));
  }, [selectedDerivedFormula, selectedField, selectedRow, workbookCells]);

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
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const snapshot = readCachedWorkbookSnapshot();
    const selectionKey = getWorkbookSelectionKey(selectedCompanyTicker, selectedThreadId);
    if (!snapshot || !selectionKey) return;
    if (snapshot.selectionKey !== selectionKey) return;
    if (snapshot.viewState.activeSheet === activeSheet) return;

    writeCachedWorkbookSnapshot({
      ...snapshot,
      viewState: {
        ...snapshot.viewState,
        activeSheet,
      },
    });
  }, [activeSheet, selectedCompanyTicker, selectedThreadId]);

  const createWorkbookThread = useCallback(async (
    company: CompanyWorkbookOption,
    sourceThreadId?: string | null,
  ) => {
    setCreatingThreadTicker(company.ticker);
    try {
      const response = await fetchWithAuth("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "data-source-workbook",
          companyTicker: company.ticker,
          companyName: company.companyName,
          cloneLatestWorkbook: true,
          sourceThreadId: sourceThreadId ?? undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !(data as { thread?: ChatThreadSummary }).thread) {
        window.alert((data as { error?: string }).error ?? `Failed to create workbook thread (HTTP ${response.status})`);
        return null;
      }

      const nextThread = (data as { thread: ChatThreadSummary }).thread;
      mergeWorkbookThread(nextThread);
      return nextThread;
    } finally {
      setCreatingThreadTicker((current) => (current === company.ticker ? null : current));
    }
  }, [mergeWorkbookThread]);

  const selectCompanyThread = useCallback(async (
    company: CompanyWorkbookOption,
    preferredThreadId?: string | null,
  ) => {
    if (!threadSchemaReady) {
      if (company.ticker !== selectedCompanyTicker && hasUnsavedChanges) {
        const confirmed = window.confirm(
          "You have unsaved workbook edits. Switch companies and discard those changes?",
        );
        if (!confirmed) return;
      }

      setSelectedCompanyTicker(company.ticker);
      setSelectedThreadId(null);
      updateSelectionUrl(company.ticker, null);
      void fetchData({
        includeNavigator: true,
        companyTicker: company.ticker,
        threadId: null,
        preserveVisibleState: false,
        preserveNavigatorState: true,
        resetWorkbookUi: true,
      });
      return;
    }

    const isThreadChange = preferredThreadId
      ? preferredThreadId !== selectedThreadId
      : company.ticker !== selectedCompanyTicker || !selectedThreadId;

    if (isThreadChange && hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved workbook edits. Switch threads and discard those changes?",
      );
      if (!confirmed) return;
    }

    setSelectedCompanyTicker(company.ticker);

    const existingThreads = threadsByCompany.get(company.ticker) ?? [];
    let nextThread: ChatThreadSummary | null =
      (preferredThreadId ? existingThreads.find((thread) => thread.id === preferredThreadId) : null) ??
      existingThreads[0] ??
      null;

    if (!nextThread) {
      const createdThread = await createWorkbookThread(company, null);
      if (!createdThread) return;
      nextThread = createdThread;
    }

    if (nextThread.id === selectedThreadId && company.ticker === selectedCompanyTicker) return;

    setSelectedThreadId(nextThread.id);
    updateSelectionUrl(company.ticker, nextThread.id);
    void fetchData({
      includeNavigator: true,
      companyTicker: company.ticker,
      threadId: nextThread.id,
      preserveVisibleState: false,
      preserveNavigatorState: true,
      resetWorkbookUi: true,
    });
  }, [
    createWorkbookThread,
    fetchData,
    hasUnsavedChanges,
    selectedCompanyTicker,
    selectedThreadId,
    threadSchemaReady,
    threadsByCompany,
    updateSelectionUrl,
  ]);

  const handleCreateThreadForSelectedCompany = useCallback(async () => {
    if (!selectedCompany) return;
    if (!threadSchemaReady) {
      window.alert("Workbook threads need the latest chat schema. Run supabase-chat-schema.sql in Supabase SQL Editor, then refresh.");
      return;
    }

    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "You have unsaved workbook edits. Create a new thread and discard those changes?",
      );
      if (!confirmed) return;
    }

    const nextThread = await createWorkbookThread(selectedCompany, selectedCompanyThreads[0]?.id ?? null);
    if (!nextThread) return;

    setSelectedCompanyTicker(selectedCompany.ticker);
    setSelectedThreadId(nextThread.id);
    updateSelectionUrl(selectedCompany.ticker, nextThread.id);
    void fetchData({
      includeNavigator: true,
      companyTicker: selectedCompany.ticker,
      threadId: nextThread.id,
      preserveVisibleState: false,
      preserveNavigatorState: true,
      resetWorkbookUi: true,
    });
  }, [
    createWorkbookThread,
    fetchData,
    hasUnsavedChanges,
    selectedCompany,
    selectedCompanyThreads,
    threadSchemaReady,
    updateSelectionUrl,
  ]);

  useEffect(() => {
    if (workbookDisplayRowCount === 0 || visibleColumns.length === 0) {
      setSelection(null);
      setEditingCell(null);
      return;
    }

    const defaultEditableCol = 0;
    const maxColIndex = visibleColumns.length - 1;

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
    const rowOutOfRange =
      normalized.endRow >= workbookDisplayRowCount || normalized.startRow >= workbookDisplayRowCount;
    const colOutOfRange =
      normalized.endCol > maxColIndex || normalized.startCol > maxColIndex;

    if (rowOutOfRange || colOutOfRange) {
      setSelection({
        startRow: rowOutOfRange ? 0 : normalized.startRow,
        endRow: rowOutOfRange ? 0 : normalized.endRow,
        startCol: Math.min(normalized.startCol, maxColIndex),
        endCol: Math.min(normalized.endCol, maxColIndex),
      });
    }
  }, [activeSheet, selection, visibleColumns, workbookDisplayRowCount]);

  useEffect(() => {
    syncFormulaDraftFromSelection();
  }, [syncFormulaDraftFromSelection]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (initialThreadSelectionAppliedRef.current) return;

    initialThreadSelectionAppliedRef.current = true;
    const currentSearchParams = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    const threadId = currentSearchParams.get("thread")?.trim() ?? null;
    const companyTickerFromQuery = currentSearchParams.get("company")?.trim().toUpperCase() ?? null;
    void fetchData({
      includeNavigator: true,
      threadId,
      companyTicker: companyTickerFromQuery,
    });
  }, [fetchData]);

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
    setEditingEnabled((prev) => ({ ...prev, [workflow]: true }));
    setEditWarningAcknowledged(true);
    persistEditWarningAcknowledged();
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
    setEditingEnabled((prev) => ({ ...prev, [workflow]: true }));
    setEditWarningAcknowledged(true);
    persistEditWarningAcknowledged();
    return true;
  }, [editingEnabled, persistEditWarningAcknowledged]);

  const createBlankWorksheetRow = useCallback((): DataSourceRow => {
    const row = Object.fromEntries(WORKBOOK_COLUMNS.map((column) => [column.field, null])) as Record<string, unknown>;
    for (const column of visibleColumns) {
      if (column.field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX)) row[column.field] = null;
    }
    const timestamp = Date.now();
    row.id = `local-row-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    row.workflowOrigin = activeWorkflow;
    row.ticker = selectedCompanyTicker ?? selectedCompany?.ticker ?? "LOCAL";
    row.companyName = selectedCompany?.companyName ?? "Local worksheet row";
    row.periodEnd = "";
    row.quarterLabel = "";
    row.savedAt = new Date().toISOString();
    return row as unknown as DataSourceRow;
  }, [activeWorkflow, selectedCompany, selectedCompanyTicker, visibleColumns]);

  useEffect(() => {
    if (loading || currentWorkbookRows.length > 0 || visibleColumns.length === 0) return;
    const blankRow = createBlankWorksheetRow();
    setBaseRows((rows) => {
      const targetTicker = selectedCompanyTicker ?? selectedCompany?.ticker ?? "LOCAL";
      const hasTargetRow = rows.some((row) => row.ticker?.toUpperCase() === targetTicker.toUpperCase());
      return hasTargetRow ? rows : [...rows, blankRow];
    });
  }, [createBlankWorksheetRow, currentWorkbookRows.length, loading, selectedCompany, selectedCompanyTicker, visibleColumns.length]);

  const materializeRowsThroughIndex = useCallback((targetRowIndex: number) => {
    const missingRows = targetRowIndex - visibleRows.length + 1;
    if (missingRows <= 0) return;
    setBaseRows((rows) => [
      ...rows,
      ...Array.from({ length: missingRows }, () => createBlankWorksheetRow()),
    ]);
  }, [createBlankWorksheetRow, visibleRows.length]);

  const getSelectionCells = useCallback(() => {
    if (!selection) return [];
    const normalized = normalizeSelection(selection);
    const cells: Array<{ row: DataSourceRow; rowIndex: number; field: string; colIndex: number }> = [];
    for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
      const row = visibleRows[rowIndex];
      if (!row) continue;
      for (let colIndex = normalized.startCol; colIndex <= normalized.endCol; colIndex += 1) {
        const field = visibleColumns[colIndex]?.field;
        if (!field) continue;
        cells.push({ row, rowIndex, field, colIndex });
      }
    }
    return cells;
  }, [selection, visibleColumns, visibleRows]);

  const selectionStats = useMemo(() => {
    const cells = getSelectionCells();
    let count = 0;
    let numericCount = 0;
    let sum = 0;

    for (const cell of cells) {
      const raw = getRowFieldValue(cell.row, cell.field);
      if (raw != null && raw !== "") count += 1;
      const numericValue =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? parseNumericInput(raw)
            : null;
      if (typeof numericValue === "number" && Number.isFinite(numericValue)) {
        numericCount += 1;
        sum += numericValue;
      }
    }

    return {
      count,
      numericCount,
      sum,
      average: numericCount > 0 ? sum / numericCount : null,
    };
  }, [getSelectionCells]);

  const canFillSelectionDown = Boolean(
    normalizedSelection && normalizedSelection.endRow > normalizedSelection.startRow,
  );
  const canFillSelectionRight = Boolean(
    normalizedSelection && normalizedSelection.endCol > normalizedSelection.startCol,
  );

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
      if (!isEditableWorkbookField(field) || row.periodEnd === "TTM") return false;
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
        const isNumericField = EDITABLE_WORKBOOK_FIELDS.has(field) || field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX);
        nextOverrides = isNumericField
          ? updateNumericOverride(nextOverrides, row.id, field, parsed)
          : nextOverrides;
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

      const shouldMirrorValueToRow =
        field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX) ||
        !EDITABLE_WORKBOOK_FIELDS.has(field);

      if (shouldMirrorValueToRow) {
        const customValue = trimmed.startsWith("=") && trimmed.length > 1
          ? trimmed
          : EDITABLE_WORKBOOK_FIELDS.has(field) || field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX)
            ? parseNumericInput(trimmed)
            : trimmed === ""
              ? null
              : trimmed;
        setBaseRows((rows) => rows.map((entry) => {
          if (entry.id !== row.id) return entry;
          return {
            ...(entry as unknown as Record<string, unknown>),
            [field]: customValue,
          } as unknown as DataSourceRow;
        }));
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

  const pasteCopiedStyle = useCallback(() => {
    if (!copiedCellStyle) return;
    applyStylePatch(copiedCellStyle);
  }, [applyStylePatch, copiedCellStyle]);

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
    const topColumn = visibleColumns[sel.startCol];
    if (!topRow || !topColumn) return;
    const rowSpan = sel.endRow - sel.startRow + 1;
    const colSpan = sel.endCol - sel.startCol + 1;
    setCellMerges((prev) => {
      const workflowMap = { ...(prev[activeWorkflow] ?? {}) };
      // Drop any merge whose head is inside the new merge region.
      for (const key of Object.keys(workflowMap)) {
        const [headRowId, headField] = key.split(":");
        const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
        const headColIndex = visibleColumns.findIndex((column) => column.field === headField);
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
  }, [activeWorkflow, ensureEditingEnabled, selection, visibleColumns, visibleRows]);

  const unmergeSelection = useCallback(() => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const sel = normalizeSelection(selection);
    setCellMerges((prev) => {
      const workflowMap = { ...(prev[activeWorkflow] ?? {}) };
      for (const key of Object.keys(workflowMap)) {
        const [headRowId, headField] = key.split(":");
        const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
        const headColIndex = visibleColumns.findIndex((column) => column.field === headField);
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
  }, [activeWorkflow, ensureEditingEnabled, selection, visibleColumns, visibleRows]);

  const hiddenMergedCells = useMemo(() => {
    const hidden = new Set<string>();
    const merges = cellMerges[activeWorkflow] ?? {};
    for (const [key, span] of Object.entries(merges)) {
      const [headRowId, headField] = key.split(":");
      const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
      const headColIndex = visibleColumns.findIndex((column) => column.field === headField);
      if (headRowIndex < 0 || headColIndex < 0) continue;
      for (let r = 0; r < span.rowSpan; r += 1) {
        for (let c = 0; c < span.colSpan; c += 1) {
          if (r === 0 && c === 0) continue;
          const row = visibleRows[headRowIndex + r];
          const column = visibleColumns[headColIndex + c];
          if (!row || !column) continue;
          hidden.add(`${row.id}:${column.field}`);
        }
      }
    }
    return hidden;
  }, [cellMerges, activeWorkflow, visibleColumns, visibleRows]);

  const selectionHasMerge = useMemo(() => {
    if (!selection) return false;
    const sel = normalizeSelection(selection);
    const merges = cellMerges[activeWorkflow] ?? {};
    for (const key of Object.keys(merges)) {
      const [headRowId, headField] = key.split(":");
      const headRowIndex = visibleRows.findIndex((row) => row.id === headRowId);
      const headColIndex = visibleColumns.findIndex((column) => column.field === headField);
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
  }, [selection, cellMerges, activeWorkflow, visibleColumns, visibleRows]);

  const canMergeSelection = useMemo(() => {
    if (!selection) return false;
    const sel = normalizeSelection(selection);
    return sel.startRow !== sel.endRow || sel.startCol !== sel.endCol;
  }, [selection]);

  const clearSelectionContent = useCallback(() => {
    const cells = getSelectionCells().filter((cell) => isEditableWorkbookField(cell.field) && cell.row.periodEnd !== "TTM");
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
        const field = visibleColumns[colIndex]?.field;
        if (!field) continue;
        const state = getWorkbookStateForCell(workbookCells, row.id, field);
        if (state?.formula && isEditableWorkbookField(field)) {
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
  }, [selection, visibleColumns, visibleRows, workbookCells]);

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
        const column = visibleColumns[normalized.startCol + colOffset];
        if (!row || !column) return;
        if (row.periodEnd === "TTM") return;

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
        const isNumericField = EDITABLE_WORKBOOK_FIELDS.has(field) || field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX);
        if (isNumericField) {
          nextOverrides = updateNumericOverride(nextOverrides, row.id, field, parsed);
        } else {
          setBaseRows((rows) => rows.map((entry) => {
            if (entry.id !== row.id) return entry;
            return {
              ...(entry as unknown as Record<string, unknown>),
              [field]: trimmed === "" ? null : trimmed,
            } as unknown as DataSourceRow;
          }));
        }
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
  }, [activeWorkflow, ensureEditingEnabled, numericOverrides, pushHistory, selection, visibleColumns, visibleRows, workbookCells]);

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

  const fillSelection = useCallback((direction: "down" | "right") => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const normalized = normalizeSelection(selection);
    const hasFillRange =
      direction === "down"
        ? normalized.endRow > normalized.startRow
        : normalized.endCol > normalized.startCol;
    if (!hasFillRange) return;

    pushHistory();
    let nextOverrides = numericOverrides;
    let nextWorkbookCells = workbookCells;

    const applySourceToTarget = (
      sourceRow: DataSourceRow,
      sourceField: string,
      targetRow: DataSourceRow,
      targetField: string,
    ) => {
      const targetColumn = visibleColumns.find((column) => column.field === targetField);
      if (!targetColumn?.editable || targetRow.periodEnd === "TTM") return;

      const sourceState = getWorkbookStateForCell(nextWorkbookCells, sourceRow.id, sourceField);
      const sourceStyle = normalizeCellStyle(sourceState?.style);
      const rowState = { ...(nextWorkbookCells[targetRow.id] ?? {}) };

      if (sourceState?.formula && isEditableWorkbookField(targetField)) {
        nextOverrides = updateNumericOverride(nextOverrides, targetRow.id, targetField, null, true);
        rowState[targetField] = normalizeCellState({
          formula: sourceState.formula,
          ...(sourceStyle ? { style: sourceStyle } : {}),
        })!;
        nextWorkbookCells = { ...nextWorkbookCells, [targetRow.id]: rowState };
        return;
      }

      const raw = getRowFieldValue(sourceRow, sourceField);
      const parsed =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? parseNumericInput(raw)
            : null;
      nextOverrides = updateNumericOverride(nextOverrides, targetRow.id, targetField, parsed);
      const nextState = normalizeCellState({
        ...(sourceStyle ? { style: sourceStyle } : {}),
      });

      if (nextState) {
        rowState[targetField] = nextState;
        nextWorkbookCells = { ...nextWorkbookCells, [targetRow.id]: rowState };
      } else {
        delete rowState[targetField];
        if (Object.keys(rowState).length > 0) {
          nextWorkbookCells = { ...nextWorkbookCells, [targetRow.id]: rowState };
        } else {
          const cloned = { ...nextWorkbookCells };
          delete cloned[targetRow.id];
          nextWorkbookCells = cloned;
        }
      }
    };

    if (direction === "down") {
      for (let colIndex = normalized.startCol; colIndex <= normalized.endCol; colIndex += 1) {
        const sourceRow = visibleRows[normalized.startRow];
        const sourceField = visibleColumns[colIndex]?.field;
        if (!sourceRow || !sourceField) continue;
        for (let rowIndex = normalized.startRow + 1; rowIndex <= normalized.endRow; rowIndex += 1) {
          const targetRow = visibleRows[rowIndex];
          if (targetRow) applySourceToTarget(sourceRow, sourceField, targetRow, sourceField);
        }
      }
    } else {
      for (let rowIndex = normalized.startRow; rowIndex <= normalized.endRow; rowIndex += 1) {
        const sourceRow = visibleRows[rowIndex];
        const sourceField = visibleColumns[normalized.startCol]?.field;
        if (!sourceRow || !sourceField) continue;
        for (let colIndex = normalized.startCol + 1; colIndex <= normalized.endCol; colIndex += 1) {
          const targetField = visibleColumns[colIndex]?.field;
          if (targetField) applySourceToTarget(sourceRow, sourceField, sourceRow, targetField);
        }
      }
    }

    setNumericOverrides(nextOverrides);
    setWorkbookCells(nextWorkbookCells);
  }, [
    activeWorkflow,
    ensureEditingEnabled,
    numericOverrides,
    pushHistory,
    selection,
    visibleColumns,
    visibleRows,
    workbookCells,
  ]);

  const autoFitSelectedColumns = useCallback(() => {
    const normalized = selection ? normalizeSelection(selection) : null;
    const startCol = normalized?.startCol ?? 0;
    const endCol = normalized?.endCol ?? Math.max(visibleColumns.length - 1, 0);
    const nextWidths: Record<string, number> = {};

    for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
      const column = visibleColumns[colIndex];
      if (!column) continue;
      let maxChars = column.label.length;
      for (const row of visibleRows.slice(0, 80)) {
        const raw = getRowFieldValue(row, column.field);
        const length = raw == null ? 0 : String(raw).length;
        maxChars = Math.max(maxChars, length);
      }
      nextWidths[column.field] = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, maxChars * 8 + 32));
    }

    if (Object.keys(nextWidths).length > 0) {
      setColumnWidths((prev) => ({ ...prev, ...nextWidths }));
    }
  }, [selection, visibleColumns, visibleRows]);

  const insertRowAbove = useCallback(() => {
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const normalized = selection ? normalizeSelection(selection) : null;
    const selectedVisibleRow = normalized ? visibleRows[normalized.startRow] : null;
    const blankRow = createBlankWorksheetRow();

    pushHistory();
    setBaseRows((rows) => {
      const index = selectedVisibleRow ? rows.findIndex((row) => row.id === selectedVisibleRow.id) : -1;
      if (index < 0) return [...rows, blankRow];
      return [...rows.slice(0, index), blankRow, ...rows.slice(index)];
    });
    setSelection({
      startRow: normalized?.startRow ?? Math.max(visibleRows.length, 0),
      endRow: normalized?.startRow ?? Math.max(visibleRows.length, 0),
      startCol: normalized?.startCol ?? 0,
      endCol: normalized?.startCol ?? 0,
    });
  }, [activeWorkflow, createBlankWorksheetRow, ensureEditingEnabled, pushHistory, selection, visibleRows]);

  const insertColumnLeft = useCallback(() => {
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const normalized = selection ? normalizeSelection(selection) : null;
    const insertAt = normalized?.startCol ?? visibleColumns.length;
    const field = `${CUSTOM_WORKBOOK_FIELD_PREFIX}_${activeSheet}_${Date.now()}`;
    const nextColumn: WorkbookColumn = {
      field,
      label: `Column ${visibleColumns.length + 1}`,
      editable: true,
      align: "right",
      format: "number",
    };

    setWorksheetColumnsBySheet((current) => {
      const existing = current[activeSheet] ?? visibleColumns;
      return {
        ...current,
        [activeSheet]: [
          ...existing.slice(0, insertAt),
          nextColumn,
          ...existing.slice(insertAt),
        ],
      };
    });
    setColumnWidths((current) => ({ ...current, [field]: DEFAULT_METRIC_COLUMN_WIDTH }));
    setBaseRows((rows) => rows.map((row) => ({ ...(row as unknown as Record<string, unknown>), [field]: null }) as unknown as DataSourceRow));
    setSelection({
      startRow: normalized?.startRow ?? 0,
      endRow: normalized?.startRow ?? 0,
      startCol: insertAt,
      endCol: insertAt,
    });
  }, [activeSheet, activeWorkflow, ensureEditingEnabled, selection, visibleColumns]);

  const deleteSelectedRows = useCallback(() => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const normalized = normalizeSelection(selection);
    const ids = new Set(
      visibleRows
        .slice(normalized.startRow, normalized.endRow + 1)
        .map((row) => row.id),
    );
    if (ids.size === 0) return;
    pushHistory();
    setBaseRows((rows) => rows.filter((row) => !ids.has(row.id)));
    setSelection(null);
  }, [activeWorkflow, ensureEditingEnabled, pushHistory, selection, visibleRows]);

  const deleteSelectedColumns = useCallback(() => {
    if (!selection) return;
    if (!ensureEditingEnabled(activeWorkflow)) return;
    const normalized = normalizeSelection(selection);
    const fields = new Set(
      visibleColumns
        .slice(normalized.startCol, normalized.endCol + 1)
        .filter((column) => column.editable || column.field.startsWith(CUSTOM_WORKBOOK_FIELD_PREFIX))
        .map((column) => column.field),
    );
    if (fields.size === 0) return;

    setWorksheetColumnsBySheet((current) => {
      const existing = current[activeSheet] ?? visibleColumns;
      return {
        ...current,
        [activeSheet]: existing.filter((column) => !fields.has(column.field)),
      };
    });
    setBaseRows((rows) => rows.map((row) => {
      const next = { ...(row as unknown as Record<string, unknown>) };
      for (const field of fields) delete next[field];
      return next as unknown as DataSourceRow;
    }));
    setWorkbookCells((rows) => {
      const next = deepClone(rows);
      for (const rowState of Object.values(next)) {
        for (const field of fields) delete rowState[field];
      }
      return next;
    });
    setSelection(null);
  }, [activeSheet, activeWorkflow, ensureEditingEnabled, selection, visibleColumns]);

  const moveSelection = useCallback((nextRow: number, nextCol: number, extend = false) => {
    if (workbookDisplayRowCount === 0 || visibleColumns.length === 0) return;
    const boundedRow = Math.max(0, Math.min(workbookDisplayRowCount - 1, nextRow));
    const boundedCol = Math.max(0, Math.min(visibleColumns.length - 1, nextCol));

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
  }, [visibleColumns.length, workbookDisplayRowCount]);

  const startInlineEdit = useCallback((rowIndexOrSeedText?: number | string, colIndex?: number, seedText?: string) => {
    const rowIndex = typeof rowIndexOrSeedText === "number" ? rowIndexOrSeedText : undefined;
    const initialSeedText = typeof rowIndexOrSeedText === "string" ? rowIndexOrSeedText : seedText;
    const targetRowIndex = typeof rowIndex === "number" ? rowIndex : selection?.endRow;
    const targetColIndex = typeof colIndex === "number" ? colIndex : selection?.endCol;
    if (targetRowIndex == null || targetColIndex == null) return;

    const row = visibleRows[targetRowIndex];
    const column = visibleColumns[targetColIndex];
    if (!row || !column || row.periodEnd === "TTM") return;
    if (!ensureEditingEnabled(activeWorkflow)) return;

    if (typeof rowIndex === "number" && typeof colIndex === "number") {
      selectGridCell(rowIndex, colIndex, {});
    }

    const state = getWorkbookStateForCell(workbookCells, row.id, column.field);
    const currentValue = state?.formula
      ? state.formula
      : getRowFieldValue(row, column.field) == null
        ? ""
        : String(getRowFieldValue(row, column.field));

    setEditingCell({ rowId: row.id, field: column.field });
    setInlineDraft(initialSeedText ?? currentValue);
    setContextMenu(null);
  }, [activeWorkflow, ensureEditingEnabled, selectGridCell, selection, visibleColumns, visibleRows, workbookCells]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;

    const withMeta = event.ctrlKey || event.metaKey;
    if (withMeta && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection();
      return;
    }
    if (withMeta && event.key.toLowerCase() === "f") {
      event.preventDefault();
      searchInputRef.current?.focus();
      return;
    }
    if (withMeta && event.key.toLowerCase() === "b") {
      event.preventDefault();
      applyStylePatch({ bold: !selectedStyle?.bold });
      return;
    }
    if (withMeta && event.key.toLowerCase() === "i") {
      event.preventDefault();
      applyStylePatch({ italic: !selectedStyle?.italic });
      return;
    }
    if (withMeta && event.key.toLowerCase() === "u") {
      event.preventDefault();
      applyStylePatch({ underline: !selectedStyle?.underline });
      return;
    }
    if (withMeta && event.shiftKey && event.key.toLowerCase() === "x") {
      event.preventDefault();
      applyStylePatch({ strikethrough: !selectedStyle?.strikethrough });
      return;
    }
    if (withMeta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      applyStylePatch({ textColor: "#1155cc", underline: true });
      return;
    }
    if (withMeta && event.shiftKey && event.key === "7") {
      event.preventDefault();
      applyBorderPreset("all");
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
    if (withMeta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      fillSelection("down");
      return;
    }
    if (withMeta && event.key.toLowerCase() === "r") {
      event.preventDefault();
      fillSelection("right");
      return;
    }

    if (!selection) return;

    const normalized = normalizeSelection(selection);
    const row = visibleRows[normalized.endRow];
    const column = visibleColumns[normalized.endCol];
    if (!column) return;

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
      row &&
      isEditableWorkbookField(column.field) &&
      row.periodEnd !== "TTM"
    ) {
      event.preventDefault();
      startInlineEdit(undefined, undefined, event.key);
    }
  }, [
    applyBorderPreset,
    applyStylePatch,
    clearSelectionContent,
    copySelection,
    fillSelection,
    handleRedo,
    handleUndo,
    moveSelection,
    selectedStyle,
    selection,
    startInlineEdit,
    visibleColumns,
    visibleRows,
  ]);

  useEffect(() => {
    if (!selection) return;

    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
    };

    const handleGlobalWorkbookShortcut = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const withMeta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (withMeta && key === "c") {
        event.preventDefault();
        void copySelection();
        return;
      }
      if (withMeta && key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (withMeta && key === "b") {
        event.preventDefault();
        applyStylePatch({ bold: !selectedStyle?.bold });
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && key === "i") {
        event.preventDefault();
        applyStylePatch({ italic: !selectedStyle?.italic });
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && key === "u") {
        event.preventDefault();
        applyStylePatch({ underline: !selectedStyle?.underline });
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && event.shiftKey && key === "x") {
        event.preventDefault();
        applyStylePatch({ strikethrough: !selectedStyle?.strikethrough });
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && key === "k") {
        event.preventDefault();
        applyStylePatch({ textColor: "#1155cc", underline: true });
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && event.shiftKey && event.key === "7") {
        event.preventDefault();
        applyBorderPreset("all");
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && key === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (withMeta && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (withMeta && key === "d") {
        event.preventDefault();
        fillSelection("down");
        workbookRef.current?.focus();
        return;
      }
      if (withMeta && key === "r") {
        event.preventDefault();
        fillSelection("right");
        workbookRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleGlobalWorkbookShortcut, true);
    return () => document.removeEventListener("keydown", handleGlobalWorkbookShortcut, true);
  }, [
    applyBorderPreset,
    applyStylePatch,
    copySelection,
    fillSelection,
    handleRedo,
    handleUndo,
    selectedStyle,
    selection,
  ]);

  useEffect(() => {
    const handleWorkbookContextMenu = (event: MouseEvent) => {
      const root = workbookRef.current;
      const target = event.target;
      if (!root || !(target instanceof Node) || !root.contains(target)) return;

      event.preventDefault();
      root.focus();
      setEditingCell(null);

      const element = target instanceof HTMLElement ? target : null;
      const indexedCell = element?.closest<HTMLElement>("[data-workbook-row][data-workbook-col]");
      const rowIndex = Number(indexedCell?.dataset.workbookRow);
      const colIndex = Number(indexedCell?.dataset.workbookCol);

      if (Number.isFinite(rowIndex) && Number.isFinite(colIndex) && rowIndex >= 0 && colIndex >= 0) {
        materializeRowsThroughIndex(rowIndex);
        setSelection({
          startRow: rowIndex,
          endRow: rowIndex,
          startCol: Math.min(colIndex, Math.max(visibleColumns.length - 1, 0)),
          endCol: Math.min(colIndex, Math.max(visibleColumns.length - 1, 0)),
        });
      } else if (!selection && workbookDisplayRowCount > 0 && visibleColumns.length > 0) {
        setSelection({
          startRow: 0,
          endRow: 0,
          startCol: 0,
          endCol: 0,
        });
      }

      setContextMenu({
        x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
        y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
      });
    };

    document.addEventListener("contextmenu", handleWorkbookContextMenu, true);
    return () => document.removeEventListener("contextmenu", handleWorkbookContextMenu, true);
  }, [materializeRowsThroughIndex, selection, visibleColumns.length, workbookDisplayRowCount]);

  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    if (!selectedThreadId && threadSchemaReady) return;
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
          .filter(([field, state]) => Boolean(state?.formula) && isEditableWorkbookField(field))
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

      const response = await fetchWithAuth("/api/data-source", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: [...mergedEditsMap.values()],
          workbookCells: flattenWorkbookCellsForSave(baseRows, workbookCells),
          workbookTickers: [...new Set(baseRows.map((row) => row.ticker))],
          threadId: selectedThreadId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert((data as { error?: string }).error ?? `Save failed (HTTP ${response.status})`);
        return;
      }

      initialWorkbookCellsRef.current = serializeWorkbookRowCellStates(workbookCells);
      setNumericOverrides({});
      await fetchData({
        preserveVisibleState: true,
        preserveNavigatorState: true,
        resetWorkbookUi: false,
      });
    } finally {
      setSaving(false);
    }
  }, [baseRows, computedRows, fetchData, hasFormulaErrors, hasUnsavedChanges, numericOverrides, selectedThreadId, threadSchemaReady, workbookCells]);

  const handleExportCsv = () => {
    const sectionColumns = getWorkbookColumnsForSection(activeSheetConfig);
    const headers = ["#", ...sectionColumns.map((column) => column.label)];
    const lines = [headers.join(",")];

    visibleRows.forEach((row) => {
      const rowNumber = sheetRowNumbers[row.id] ?? "";
      const values = [
        String(rowNumber),
        ...sectionColumns.map((column) => {
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
    link.download = `${activeSheetConfig.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workbook"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();
    appendFinancialModelSheets(workbook, financialModelContext);

    for (const sheet of WORKBOOK_SECTIONS) {
      if (sheet.isFinancialTemplate) continue;
      const sectionColumns = getWorkbookColumnsForSection(sheet);
      const rows = currentWorkbookRows;
      const aoa = [
        ["#", ...sectionColumns.map((column) => column.label)],
        ...rows.map((row) => [
          sheetRowNumbers[row.id] ?? "",
          ...sectionColumns.map((column) => getRowFieldValue(row, column.field) ?? ""),
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet["!cols"] = [
        { wch: 8 },
        ...sectionColumns.map((column) => {
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
        sectionColumns.forEach((column, columnIndex) => {
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

      const sheetMerges = cellMerges[activeWorkflow] ?? {};
      const xlsxMerges: XLSX.Range[] = [];
      for (const [mergeKey, span] of Object.entries(sheetMerges)) {
        const [headRowId, headField] = mergeKey.split(":");
        const headRowIdx = rows.findIndex((row) => row.id === headRowId);
        const headColIdx = sectionColumns.findIndex((column) => column.field === headField);
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

  const embeddedExcelWorkbook = useMemo<EditableWorkbook>(() => {
    const sheetStyles = embeddedExcelStylesBySheet[activeSheet] ?? {};
    if (isFinancialTemplateSheet && isFinancialModelSheetKey(activeSheet)) {
      const financialWorkbook = financialGridToEditableWorkbook(
        activeSheet,
        activeSheetConfig.title,
        financialModelContext,
      );

      return {
        ...financialWorkbook,
        styles: {
          ...financialWorkbook.styles,
          ...sheetStyles,
        },
      };
    }

    const headerRow = visibleColumns.map((column) => column.label);
    const dataRows = visibleRows.map((row) =>
      visibleColumns.map((column) => {
        const cellState = getWorkbookStateForCell(workbookCells, row.id, column.field);
        if (cellState?.formula) return cellState.formula;
        const value = getRowFieldValue(row, column.field);
        return value == null ? "" : String(value);
      }),
    );
    const headerStyles: Record<string, DataSourceWorkbookCellStyle | null> = {};
    visibleColumns.forEach((column, colIndex) => {
      headerStyles[excelCellStyleKey(0, 0, colIndex)] = {
        bold: true,
        fillColor: "#f8fafc",
        textColor: "#334155",
        align: column.align ?? "left",
      };
    });

    return {
      sheets: [
        {
          name: activeSheetConfig.title,
          cells: [headerRow, ...dataRows],
        },
      ],
      styles: {
        ...headerStyles,
        ...sheetStyles,
      },
    };
  }, [
    activeSheet,
    activeSheetConfig.title,
    embeddedExcelStylesBySheet,
    financialModelContext,
    isFinancialTemplateSheet,
    visibleColumns,
    visibleRows,
    workbookCells,
  ]);

  const handleEmbeddedExcelWorkbookChange = useCallback(
    (nextWorkbook: EditableWorkbook) => {
      setEmbeddedExcelStylesBySheet((current) => ({
        ...current,
        [activeSheet]: nextWorkbook.styles,
      }));

      if (isFinancialTemplateSheet) {
        return;
      }

      const previousCells = embeddedExcelWorkbook.sheets[0]?.cells ?? [];
      const nextCells = nextWorkbook.sheets[0]?.cells ?? [];
      let changeIndex = 0;

      for (let rowIndex = 1; rowIndex < nextCells.length; rowIndex += 1) {
        const sourceRow = visibleRows[rowIndex - 1];
        if (!sourceRow) continue;

        for (let colIndex = 0; colIndex < (nextCells[rowIndex]?.length ?? 0); colIndex += 1) {
          const column = visibleColumns[colIndex];
          if (!column) continue;

          const nextValue = nextCells[rowIndex]?.[colIndex] ?? "";
          const previousValue = previousCells[rowIndex]?.[colIndex] ?? "";
          if (nextValue === previousValue) continue;

          commitCellInput(sourceRow, column.field, nextValue, changeIndex === 0);
          changeIndex += 1;
        }
      }
    },
    [activeSheet, commitCellInput, embeddedExcelWorkbook, isFinancialTemplateSheet, visibleColumns, visibleRows],
  );

  const embeddedActiveSheet = embeddedExcelWorkbook.sheets[0];
  const embeddedColumnCount = embeddedActiveSheet
    ? Math.max(0, ...embeddedActiveSheet.cells.map((row) => row.length))
    : 0;
  const embeddedRowCount = embeddedActiveSheet?.cells.length ?? 0;
  const embeddedModelLabel = isFinancialTemplateSheet ? "Financial model" : "Extracted data";

  const editConfirmDialog = editConfirm ? (
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
              Edits in this workbook are saved to the current company thread only. Verify any changed values
              against the original filing PDF or SEC source before saving.
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
  ) : null;

  if (embedded) {
    return (
      <RequireAuth>
        <div className="w-full px-0 py-0">
          {editConfirmDialog}
          <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#cc521d]">
                  Analyze workbook
                </p>
                <h2 className="mt-1 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                  {selectedCompany ? `${selectedCompany.ticker} workbook` : "Workbook"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Numbers come from Extract/Data Source. Edit cells here with the same Excel-style component used in Excel Analysis.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeSheet}
                  onChange={(event) => setActiveSheet(event.target.value as WorkbookSectionKey)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                  aria-label="Workbook sheet"
                >
                  {WORKBOOK_SECTIONS.map((sheet) => (
                    <option key={sheet.key} value={sheet.key}>
                      {sheet.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void fetchData({ includeNavigator: true, preserveVisibleState: false, resetWorkbookUi: true })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || saving || hasFormulaErrors || !threadSchemaReady}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#217346] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#1b5d38] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save workbook
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e7c7b7]/70 bg-[#fffaf6] px-3 py-2 text-[11px] font-semibold text-[#5a6065]">
              <span className="rounded-full bg-[#cc521d] px-2.5 py-1 text-white">
                {embeddedModelLabel}
              </span>
              <span>
                Source: {selectedCompanyTicker ?? selectedCompany?.ticker ?? "latest extract"}
              </span>
              <span className="text-slate-300">/</span>
              <span>{visibleRows.length} extracted rows</span>
              <span className="text-slate-300">/</span>
              <span>{embeddedRowCount} model rows</span>
              <span className="text-slate-300">/</span>
              <span>{embeddedColumnCount} columns</span>
              {hasUnsavedChanges ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">
                  Unsaved edits
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                  Synced
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex min-h-[22rem] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading extracted workbook...
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
                <p className="text-sm font-semibold text-slate-900">No extracted numbers yet.</p>
                <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
                  Upload a 10-Q in Extract first. Once the filing saves, the rows will appear here automatically.
                </p>
              </div>
            ) : (
              <ExcelWorkbookEditor
                workbook={embeddedExcelWorkbook}
                onChange={handleEmbeddedExcelWorkbookChange}
                className="overflow-hidden rounded-[20px]"
                gridClassName="max-h-[calc(100dvh-27rem)] min-h-[20rem]"
                onError={(message) => {
                  if (message) window.alert(message);
                }}
              />
            )}
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className={embedded ? "w-full px-0 py-0" : "mx-auto max-w-[99vw] px-4 py-6"}>
        {editConfirmDialog}

        <div className={`mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between ${embedded ? "pt-2" : ""}`}>
          <div>
            <h1 className={`${embedded ? "text-xl" : "text-lg"} font-bold text-slate-900`}>
              Centralized Data Source Workbook
            </h1>
            <p className={`text-xs text-slate-500 ${embedded ? "max-w-3xl" : ""}`}>
              {!threadSchemaReady && selectedCompany
                ? `${selectedCompany.ticker} company workbook loaded in compatibility mode until the workbook-thread migration is applied.`
                : `${baseRows.length} records - Financial model tabs (Underwriting, Annual CF) plus quarterly data sheets with formulas, formatting, and persisted overrides.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => void fetchData({
                preserveVisibleState: true,
                preserveNavigatorState: true,
                resetWorkbookUi: false,
              })}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="Refresh"
            >
              {revalidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {!threadSchemaReady && threadSchemaMessage && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Migration needed:</span> {threadSchemaMessage}. Run <span className="font-mono">supabase-chat-schema.sql</span> in Supabase SQL Editor, then refresh.
          </div>
        )}

        {companyRailOptions.length === 0 && !navigatorLoading && !loading ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-900">No company workbooks available yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Upload or analyze filings first, then each company will appear here with its own workbook thread.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Companies</p>
                  {navigatorLoading && (
                    <div className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Syncing...
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {companyRailOptions.map((company) => {
                    const threadCount = threadsByCompany.get(company.ticker)?.length ?? 0;
                    const isActive = company.ticker === selectedCompanyTicker;

                    return (
                      <button
                        key={company.ticker}
                        type="button"
                        onClick={() => void selectCompanyThread(company)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? "border-[#217346]/30 bg-[#eef6f0] shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{company.ticker}</p>
                          <p className="truncate text-xs text-slate-500">{company.companyName}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          {threadCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {selectedCompany?.ticker ?? "No company"}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedCompany?.companyName ?? "Select a company"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCreateThreadForSelectedCompany()}
                    disabled={!threadSchemaReady || !selectedCompany || creatingThreadTicker === selectedCompany.ticker}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingThreadTicker === selectedCompany?.ticker ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    New thread
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {!threadSchemaReady ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-xs leading-relaxed text-amber-800">
                      <p className="font-semibold">Workbook threads are waiting on a Supabase migration.</p>
                      <p className="mt-1">
                        Run <span className="font-mono">supabase-chat-schema.sql</span> in Supabase SQL Editor, then refresh this page.
                      </p>
                    </div>
                  ) : selectedCompanyThreads.length === 0 || !selectedCompany ? null : (
                    selectedCompanyThreads.map((thread, index) => {
                      const isActive = thread.id === selectedThreadId;
                      return (
                        <button
                          key={thread.id}
                          type="button"
                          onClick={() => void selectCompanyThread(selectedCompany, thread.id)}
                          className={`block w-full rounded-xl border px-3 py-3 text-left transition ${
                            isActive
                              ? "border-[#217346]/30 bg-[#eef6f0] shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{thread.title}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              {index + 1}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Updated {formatHistoryTimestamp(thread.updatedAt)}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            <div className="space-y-6">
              <div
                className="relative overflow-hidden rounded-none border border-[#d6dbe1] bg-white shadow-sm"
                style={{ fontFamily: WORKBOOK_FONT_FAMILY }}
              >
                {loading && (
                  <div className="pointer-events-none absolute inset-0 z-20 bg-white/45 backdrop-blur-[1px]">
                    <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      Refreshing workbook content...
                    </div>
                  </div>
                )}
              <div className="sticky top-0 z-30 border-b border-[#d6dbe1] bg-white">
                <>
                <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[#e0e3e7] bg-white px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#0f9d58] text-white">
                      <FileSpreadsheet className="h-4 w-4" />
                    </span>
                    <div className="hidden items-center gap-2 lg:flex">
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${activeSheetConfig.accentClass}`}>
                        {isFinancialTemplateSheet
                          ? "Financial model template"
                          : `${currentWorkbookRows.length} row(s)`}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          editingEnabled[activeWorkflow]
                            ? "border-[#217346]/30 bg-[#217346]/10 text-[#217346]"
                            : "border-[#d7dce3] bg-white text-slate-600"
                        }`}
                      >
                        {editingEnabled[activeWorkflow] ? "Editing enabled" : "Read-only"}
                      </span>
                      {hasFormulaErrors && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                          Fix formula errors before save
                        </span>
                      )}
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        {editLog.length} saved edit{editLog.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <h2 className="truncate text-sm font-semibold text-slate-900">
                      {selectedCompany
                        ? `${selectedCompany.companyName} (${selectedCompany.ticker})`
                        : activeSheetConfig.title}
                    </h2>
                  </div>

                  {!isFinancialTemplateSheet ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleEditMode(activeWorkflow)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                          editingEnabled[activeWorkflow]
                            ? "border-[#217346]/35 bg-[#217346]/10 text-[#217346]"
                            : "border-[#d0d7de] bg-white text-slate-700 hover:bg-[#f7f7f7]"
                        }`}
                      >
                        Editing on
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!ensureEditingEnabled(activeWorkflow)) return;
                          clearSelectionContent();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#d0d7de] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-[#f7f7f7]"
                      >
                        <Eraser className="h-3 w-3" />
                        Clear selected
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="hidden">
                  <div className="flex flex-wrap items-center gap-1 bg-[#217346] px-3 py-1.5 text-white">
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded bg-white/15">
                      <FileSpreadsheet className="h-4 w-4" />
                    </span>
                    {[
                      ["file", "File"],
                      ["home", "Home"],
                      ["insert", "Insert"],
                      ["review", "Review"],
                      ["view", "View"],
                    ].map(([key, label]) => {
                      const active = ribbonTab === key || (key === "file" && ribbonTab === "home");
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setRibbonTab(key === "file" ? "home" : (key as typeof ribbonTab))}
                          className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                            active ? "bg-white text-[#217346]" : "text-white/90 hover:bg-white/12 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        title="Export Excel"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-white/90 hover:bg-white/12 hover:text-white"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void fetchData({
                          preserveVisibleState: true,
                          preserveNavigatorState: true,
                          resetWorkbookUi: false,
                        })}
                        title="Refresh workbook"
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-white/90 hover:bg-white/12 hover:text-white"
                      >
                        {revalidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 bg-[#f6f8f7] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RibbonCommand icon={<Copy className="h-4 w-4" />} label="Copy" hint="Copy selected cells" onClick={() => void copySelection()} />
                      <RibbonCommand icon={<ClipboardPaste className="h-4 w-4" />} label="Paste" hint="Paste clipboard into selection" onClick={() => void pasteSelection()} />
                      <RibbonCommand icon={<ChevronRight className="h-4 w-4 rotate-90" />} label="Fill Down" hint="Copy top row values through the selected range" disabled={!canFillSelectionDown} onClick={() => fillSelection("down")} />
                      <RibbonCommand icon={<ChevronRight className="h-4 w-4" />} label="Fill Right" hint="Copy left column values through the selected range" disabled={!canFillSelectionRight} onClick={() => fillSelection("right")} />
                      <RibbonCommand icon={<Brush className="h-4 w-4" />} label="Copy Format" hint="Copy selected cell style" onClick={copySelectedStyle} />
                      <RibbonCommand icon={<Brush className="h-4 w-4" />} label="Apply Format" hint="Apply copied format to selection" disabled={!copiedCellStyle} onClick={pasteCopiedStyle} />
                      <RibbonCommand icon={<AlignLeft className="h-4 w-4" />} label="AutoFit" hint="Resize selected columns to fit visible values" onClick={autoFitSelectedColumns} />
                      <RibbonCommand icon={<Sigma className="h-4 w-4" />} label="Formula" hint="Use the formula bar below" onClick={() => workbookRef.current?.focus()} />
                      <RibbonCommand icon={<Table2 className="h-4 w-4" />} label={selectionHasMerge ? "Unmerge" : "Merge"} hint="Merge or unmerge selected cells" disabled={!canMergeSelection && !selectionHasMerge} onClick={() => (selectionHasMerge ? unmergeSelection() : mergeSelection())} />
                      <RibbonCommand icon={<ListFilter className="h-4 w-4" />} label="Sort" hint="Click column headers to sort" onClick={() => workbookRef.current?.focus()} />
                      <RibbonCommand icon={<Eye className="h-4 w-4" />} label={freezeFirstColumn ? "Unfreeze" : "Freeze"} hint="Freeze or unfreeze row numbers" active={freezeFirstColumn} onClick={() => setFreezeFirstColumn((current) => !current)} />
                      <RibbonCommand icon={<Sigma className="h-4 w-4" />} label="Show Formulas" hint="Toggle formula display in cells" active={showFormulas} onClick={() => setShowFormulas((current) => !current)} />
                      <RibbonCommand icon={<Eye className="h-4 w-4" />} label="Reset Zoom" hint="Reset workbook zoom" onClick={() => setZoomLevel(100)} />
                    </div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-slate-600">
                      <div className="flex h-9 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
                        <span className="flex h-full w-9 items-center justify-center border-r border-slate-200 text-slate-400">
                          <Search className="h-4 w-4" />
                        </span>
                        <input
                          ref={searchInputRef}
                          value={sheetSearchQuery}
                          onChange={(event) => setSheetSearchQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              jumpToSearchMatch(event.shiftKey ? "previous" : "next");
                            }
                            if (event.key === "Escape") {
                              setSheetSearchQuery("");
                              workbookRef.current?.focus();
                            }
                          }}
                          className="h-full w-44 bg-transparent px-2 text-sm outline-none"
                          placeholder="Find in sheet"
                        />
                        <button
                          type="button"
                          onClick={() => jumpToSearchMatch("previous")}
                          disabled={visibleSearchMatches.length === 0}
                          className="flex h-full w-8 items-center justify-center border-l border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Previous match"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => jumpToSearchMatch("next")}
                          disabled={visibleSearchMatches.length === 0}
                          className="flex h-full w-8 items-center justify-center border-l border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Next match"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      {sheetSearchQuery.trim() && (
                        <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                          {visibleSearchMatches.length === 0
                            ? "0"
                            : `${Math.min(activeSearchMatchIndex + 1, visibleSearchMatches.length)}/${visibleSearchMatches.length}`}
                        </span>
                      )}
                      <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                        {zoomLevel}%
                      </span>
                      <input
                        aria-label="Zoom workbook"
                        type="range"
                        min={75}
                        max={140}
                        step={5}
                        value={zoomLevel}
                        onChange={(event) => setZoomLevel(Number(event.target.value))}
                        className="h-1.5 w-36 cursor-pointer accent-[#217346]"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-b border-slate-200 bg-slate-50">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void fetchData({
                          preserveVisibleState: true,
                          preserveNavigatorState: true,
                          resetWorkbookUi: false,
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      {revalidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFormulas((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Sigma className="h-4 w-4" />
                      {showFormulas ? "Hide formulas" : "Show formulas"}
                    </button>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <Search className="h-4 w-4 text-slate-500" />
                      <input
                        ref={searchInputRef}
                        value={sheetSearchQuery}
                        onChange={(event) => setSheetSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            jumpToSearchMatch(event.shiftKey ? "previous" : "next");
                          }
                          if (event.key === "Escape") {
                            setSheetSearchQuery("");
                            workbookRef.current?.focus();
                          }
                        }}
                        className="w-36 bg-transparent text-sm outline-none"
                        placeholder="Find in sheet"
                      />
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
                      <span>Zoom</span>
                      <span className="rounded border border-slate-200 bg-white px-2 py-1">{zoomLevel}%</span>
                      <input
                        aria-label="Zoom workbook"
                        type="range"
                        min={75}
                        max={140}
                        step={5}
                        value={zoomLevel}
                        onChange={(event) => setZoomLevel(Number(event.target.value))}
                        className="h-1.5 w-28 cursor-pointer accent-slate-700"
                      />
                    </div>
                  </div>
                </div>
                {isFinancialTemplateSheet && isFinancialModelSheetKey(activeSheet) ? (
                  <FinancialModelSheetView
                    variant={activeSheet}
                    context={financialModelContext}
                    storageKey={financialGridStorageKey(selectedCompanyTicker, activeSheet)}
                    scrollToSectionId={financialScrollTarget}
                    onScrolledToSection={() => setFinancialScrollTarget(null)}
                    onShortcut={handleFinancialShortcut}
                  />
                ) : (
                  <>
                <div className="border-b border-[#d6dbe1] bg-white">
                  <div className="hidden">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-[#d6dbe1] bg-white p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Clipboard</p>
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
                        className="h-9 rounded-md border border-[#d0d7de] bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-[#217346]/30"
                      >
                        <option value="" disabled>
                          Border...
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
                        className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#d0d7de] bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                        {selectionHasMerge ? "Unmerge" : "Merge"}
                      </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#d6dbe1] bg-white p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Font</p>
                        <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Font
                        <select
                          value={selectedStyle?.fontFamily ?? "Calibri"}
                          onChange={(event) => applyStylePatch({ fontFamily: event.target.value })}
                        className="h-10 rounded-lg border border-[#d0d7de] bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-[#217346]/30"
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
                          className="h-10 rounded-lg border border-[#d0d7de] bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-[#217346]/30"
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
                          className="h-10 rounded-lg border border-[#d0d7de] bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-[#217346]/30"
                        >
                          {NUMBER_FORMAT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#d6dbe1] bg-white p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Color</p>
                        <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Text
                        <input
                          type="color"
                          value={selectedStyle?.textColor ?? "#0f172a"}
                          onChange={(event) => applyStylePatch({ textColor: event.target.value })}
                          className="h-10 w-10 cursor-pointer rounded-lg border border-[#d0d7de] bg-white p-1"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        Fill
                        <input
                          type="color"
                          value={selectedStyle?.fillColor ?? "#ffffff"}
                          onChange={(event) => applyStylePatch({ fillColor: event.target.value })}
                          className="h-10 w-10 cursor-pointer rounded-lg border border-[#d0d7de] bg-white p-1"
                        />
                      </label>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#d6dbe1] bg-white p-3 shadow-sm">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Alignment</p>
                        <div className="flex flex-wrap items-center gap-2">
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
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid h-9 grid-cols-[92px_32px_minmax(0,1fr)] items-center border-t border-[#eef1f4] bg-white">
                      <div className="flex h-full items-center border-r border-[#d6dbe1] bg-white px-3 text-xs font-medium text-slate-700">
                      {selectedCellReference ?? "F10"}
                    </div>
                    <button
                      type="button"
                      onClick={syncFormulaDraftFromSelection}
                      disabled={!selectedRow || !selectedField}
                      className="inline-flex h-full w-8 items-center justify-center border-r border-[#d6dbe1] bg-white text-slate-500 transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-40"
                      title="Revert formula bar to selected cell value"
                    >
                      <span className="font-serif text-base italic text-slate-400">fx</span>
                    </button>
                    <div className="flex h-full items-center bg-white pr-2">
                      <input
                        value={formulaDraft}
                        onChange={(event) => setFormulaDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || !selectedRow || !selectedField) return;
                          event.preventDefault();
                          if (canEditSelectedCell) {
                            void commitCellInput(selectedRow, selectedField, formulaDraft);
                          }
                        }}
                        disabled={!selectedRow || !selectedField || !canEditSelectedCell}
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-700 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                      placeholder=""
                    />
                      <button
                        type="button"
                        disabled={!selectedRow || !selectedField}
                        onClick={() => setMetricDetailOpen(true)}
                        className="ml-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Open metric detail"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                        Details
                      </button>
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
                  onMouseDownCapture={(event) => {
                    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
                    workbookRef.current?.focus();
                  }}
                  onContextMenu={(event) => {
                    const target = event.target;
                    if (target instanceof HTMLElement && target.closest("td,th")) return;

                    event.preventDefault();
                    workbookRef.current?.focus();
                    setEditingCell(null);
                    if (!selection && workbookDisplayRowCount > 0 && visibleColumns.length > 0) {
                      setSelection({
                        startRow: 0,
                        endRow: 0,
                        startCol: 0,
                        endCol: 0,
                      });
                    }
                    setContextMenu({
                      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                    });
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    applyPastedText(event.clipboardData.getData("text/plain"));
                  }}
                  className="max-h-[82vh] overflow-auto border border-[#d6dbe1] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-none focus:ring-2 focus:ring-[#217346]/20"
                >
                  <div
                    style={{
                      transform: `scale(${zoomLevel / 100})`,
                      transformOrigin: "top left",
                      width: `${100 / (zoomLevel / 100)}%`,
                    }}
                  >
                    <table
                      className="border-separate border-spacing-0 text-[12px]"
                      style={{ tableLayout: "fixed", width: "100%", minWidth: totalTableWidth }}
                    >
                    <colgroup>
                      <col style={{ width: getColumnWidth(ROW_NUMBER_COLUMN_KEY) }} />
                      {visibleColumns.map((column) => (
                        <col key={column.field} style={{ width: getColumnWidth(column.field) }} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-[#f3f3f3] text-[#59636f]">
                        <th
                          data-workbook-row={0}
                          data-workbook-col={0}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            focusWorkbook();
                            setEditingCell(null);
                            setSelection({
                              startRow: 0,
                              endRow: Math.max(workbookDisplayRowCount - 1, 0),
                              startCol: 0,
                              endCol: Math.max(visibleColumns.length - 1, 0),
                            });
                            setContextMenu({
                              x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                              y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                            });
                          }}
                          className={`${freezeFirstColumn ? "sticky left-0 z-30" : ""} border-b border-r border-[#d6dbe1] bg-[#f3f3f3] px-3 py-2 text-center font-semibold`}
                        >
                          #
                        </th>
                        {visibleColumns.map((column, colIndex) => {
                          const globalIndex = WORKBOOK_COLUMN_INDEX_BY_FIELD.get(column.field) ?? 0;
                          return (
                            <th
                              key={`${column.field}-letter`}
                              data-workbook-row={0}
                              data-workbook-col={colIndex}
                              onMouseDown={(event) => {
                                if (event.button === 2) return;
                                event.preventDefault();
                                focusWorkbook();
                                setContextMenu(null);
                                setEditingCell(null);
                                setSelection({
                                  startRow: 0,
                                  endRow: Math.max(workbookDisplayRowCount - 1, 0),
                                  startCol: colIndex,
                                  endCol: colIndex,
                                });
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                focusWorkbook();
                                setEditingCell(null);
                                setSelection({
                                  startRow: 0,
                                  endRow: Math.max(workbookDisplayRowCount - 1, 0),
                                  startCol: colIndex,
                                  endCol: colIndex,
                                });
                                setContextMenu({
                                  x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                                  y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                                });
                              }}
                              className="cursor-pointer select-none border-b border-r border-[#d6dbe1] bg-[#f3f3f3] px-3 py-2 text-center font-semibold hover:bg-[#e9edf1]"
                            >
                              {columnIndexToLetter(globalIndex)}
                            </th>
                          );
                        })}
                      </tr>
                      <tr className="bg-[#fafafa] text-slate-700">
                        <th
                          data-workbook-row={0}
                          data-workbook-col={0}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            focusWorkbook();
                            setEditingCell(null);
                            setSelection({
                              startRow: 0,
                              endRow: Math.max(workbookDisplayRowCount - 1, 0),
                              startCol: 0,
                              endCol: Math.max(visibleColumns.length - 1, 0),
                            });
                            setContextMenu({
                              x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                              y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                            });
                          }}
                          className={`${freezeFirstColumn ? "sticky left-0 z-30" : ""} border-b border-r border-[#d6dbe1] bg-[#f8f8f8] px-3 py-2 text-center font-semibold text-slate-500`}
                        >
                          Row
                        </th>
                        {visibleColumns.map((column, colIndex) => {
                          const activeSort = sortByWorkflow[activeWorkflow];
                          const sortIndicator =
                            activeSort?.field === column.field
                              ? activeSort.direction === "asc"
                                ? " ^"
                                : " v"
                              : "";

                          return (
                            <th
                              key={column.field}
                              data-workbook-row={0}
                              data-workbook-col={colIndex}
                              className={`relative border-b border-r border-[#d6dbe1] bg-[#fafafa] px-3 py-2 font-semibold ${
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
                                className="inline-flex w-full items-center gap-1 truncate text-left hover:text-slate-900"
                              >
                                <span className="truncate">{column.label}</span>
                                <span className="text-[10px] text-slate-400">{sortIndicator}</span>
                              </button>
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${column.label} column`}
                                onMouseDown={(event) => handleColumnResizeStart(column.field, event)}
                                onClick={(event) => event.stopPropagation()}
                                className="absolute right-0 top-0 z-10 flex h-full w-1.5 cursor-col-resize select-none items-center justify-center bg-transparent transition hover:bg-[#217346]/35 active:bg-[#217346]/60"
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, rowIndex) => {
                        const canonicalRowNumber = sheetRowNumbers[row.id] ?? rowIndex + 1;
                        return (
                          <tr key={row.id} className="bg-white">
                            <td
                              data-workbook-row={rowIndex}
                              data-workbook-col={-1}
                              onMouseDown={(event) => {
                                if (event.button === 2) return;
                                event.preventDefault();
                                focusWorkbook();
                                setContextMenu(null);
                                setEditingCell(null);
                                setSelection({
                                  startRow: rowIndex,
                                  endRow: rowIndex,
                                  startCol: 0,
                                  endCol: Math.max(visibleColumns.length - 1, 0),
                                });
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                focusWorkbook();
                                setEditingCell(null);
                                setSelection({
                                  startRow: rowIndex,
                                  endRow: rowIndex,
                                  startCol: 0,
                                  endCol: Math.max(visibleColumns.length - 1, 0),
                                });
                                setContextMenu({
                                  x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                                  y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                                });
                              }}
                              className={`${freezeFirstColumn ? "sticky left-0 z-10" : ""} cursor-pointer select-none border-b border-r border-[#dfe4ea] bg-[#f8f8f8] px-3 py-2 text-center font-semibold text-slate-500 hover:bg-[#eef2f5]`}
                            >
                              {canonicalRowNumber}
                            </td>
                            {visibleColumns.map((column, colIndex) => {
                              const field = column.field;
                              const cellKey = `${row.id}:${field}`;
                              if (hiddenMergedCells.has(cellKey)) return null;
                              const mergeInfo = cellMerges[activeWorkflow]?.[cellKey];
                              const cellState = getWorkbookStateForCell(workbookCells, row.id, field);
                              const cellStyle = normalizeCellStyle(cellState?.style);
                              const isSelected = isCellInSelection(selection, rowIndex, colIndex);
                              const globalColIndex = WORKBOOK_COLUMN_INDEX_BY_FIELD.get(field) ?? colIndex;
                              const referenceHighlightIndex = formulaReferenceHighlights.get(`${rowIndex}:${globalColIndex}`);
                              const referenceHighlight =
                                typeof referenceHighlightIndex === "number"
                                  ? FORMULA_REFERENCE_COLORS[referenceHighlightIndex]
                                  : null;
                              const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                              const isActiveCell =
                                normalizedSelection?.endRow === rowIndex && normalizedSelection?.endCol === colIndex;
                              const formulaError = formulaErrors[`${row.id}:${field}`];
                              const rawValue = getRowFieldValue(row, field);
                              const searchMatchIndex = searchMatchIndexByCell.get(`${rowIndex}:${colIndex}`);
                              const isSearchMatch = typeof searchMatchIndex === "number";
                              const isActiveSearchMatch = searchMatchIndex === activeSearchMatchIndex;
                              const displayValue = showFormulas && cellState?.formula
                                ? cellState.formula
                                : formulaError
                                ? "#ERR"
                                : fmtCellWithOverride(rawValue ?? null, column.format, cellStyle?.numberFormat);

                              return (
                                <td
                                  key={cellKey}
                                  data-workbook-row={rowIndex}
                                  data-workbook-col={colIndex}
                                  {...(mergeInfo?.rowSpan && mergeInfo.rowSpan > 1 ? { rowSpan: mergeInfo.rowSpan } : {})}
                                  {...(mergeInfo?.colSpan && mergeInfo.colSpan > 1 ? { colSpan: mergeInfo.colSpan } : {})}
                                  onMouseDown={(event) => {
                                    focusWorkbook();
                                    if (event.button === 2) return;
                                    setContextMenu(null);
                                    setMetricDetailOpen(true);
                                    selectGridCell(rowIndex, colIndex, {
                                      extend: event.shiftKey,
                                      mergeInfo,
                                    });
                                  }}
                                  onClick={() => {
                                    if (!selection || !isCellInSelection(selection, rowIndex, colIndex)) {
                                      selectGridCell(rowIndex, colIndex, { mergeInfo });
                                    }
                                  }}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    focusWorkbook();
                                    if (!isSelected) {
                                      selectGridCell(rowIndex, colIndex, { mergeInfo });
                                    }
                                    setEditingCell(null);
                                    setContextMenu({
                                      x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                                      y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                                    });
                                  }}
                                  onDoubleClick={() => {
                                    setContextMenu(null);
                                    selectGridCell(rowIndex, colIndex, {
                                      mergeInfo,
                                    });
                                    if (row.periodEnd !== "TTM") {
                                      startInlineEdit(rowIndex, colIndex);
                                    }
                                  }}
                                className="cursor-pointer border-b border-r border-[#dfe4ea] bg-white px-0 py-0"
                              >
                                  <div
                                    className={`relative min-h-[32px] px-3 py-1.5 ${
                                      column.align === "right"
                                        ? "text-right"
                                        : column.align === "center"
                                          ? "text-center"
                                          : "text-left"
                                    } ${
                                      formulaError ? "font-semibold text-red-600" : "text-slate-700"
                                    }`}
                                    style={{
                                      backgroundColor:
                                        cellStyle?.fillColor ??
                                        (isSelected
                                          ? EXCEL_SELECTION_FILL
                                          : isActiveSearchMatch
                                            ? "rgba(245, 158, 11, 0.20)"
                                            : isSearchMatch
                                              ? "rgba(250, 204, 21, 0.18)"
                                              : referenceHighlight?.fill),
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
                                      boxShadow: [
                                        isActiveCell ? `inset 0 0 0 2px ${EXCEL_SELECTION_BORDER}` : null,
                                        isActiveSearchMatch ? "inset 0 0 0 2px rgba(245, 158, 11, 0.95)" : null,
                                        referenceHighlight ? `inset 0 0 0 2px ${referenceHighlight.border}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(", ") || undefined,
                                    }}
                                  >
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        value={inlineDraft}
                                        onChange={(event) => setInlineDraft(event.target.value)}
                                        onBlur={(event) => {
                                          void commitCellInput(row, field, event.currentTarget.value);
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void commitCellInput(row, field, event.currentTarget.value);
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
                                    {isActiveCell && !isEditing && (
                                      <span
                                        className="pointer-events-none absolute bottom-0 right-0 h-1.5 w-1.5 translate-x-1/2 translate-y-1/2 rounded-[1px]"
                                        style={{ backgroundColor: EXCEL_SELECTION_BORDER }}
                                      />
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {Array.from({ length: placeholderRowCount }, (_, placeholderOffset) => {
                        const rowIndex = visibleRows.length + placeholderOffset;
                        const rowNumber = rowIndex + 1;
                        return (
                          <tr
                            key={`placeholder-row-${activeSheet}-${rowNumber}`}
                            className="bg-white"
                          >
                            <td
                              data-workbook-row={rowIndex}
                              data-workbook-col={-1}
                              onMouseDown={(event) => {
                                if (event.button === 2) return;
                                event.preventDefault();
                                focusWorkbook();
                                materializeRowsThroughIndex(rowIndex);
                                setContextMenu(null);
                                setEditingCell(null);
                                setSelection({
                                  startRow: rowIndex,
                                  endRow: rowIndex,
                                  startCol: 0,
                                  endCol: Math.max(visibleColumns.length - 1, 0),
                                });
                              }}
                              className={`${freezeFirstColumn ? "sticky left-0 z-10" : ""} cursor-pointer select-none border-b border-r border-[#dfe4ea] bg-[#f8f8f8] px-3 py-2 text-center font-semibold text-slate-300 hover:bg-[#eef2f5]`}
                            >
                              {rowNumber}
                            </td>
                            {visibleColumns.map((column, colIndex) => {
                              const isSelected = isCellInSelection(selection, rowIndex, colIndex);
                              const isActiveCell =
                                normalizedSelection?.endRow === rowIndex && normalizedSelection?.endCol === colIndex;

                              return (
                              <td
                                key={`placeholder-row-${activeSheet}-${rowNumber}-${column.field}`}
                                data-workbook-row={rowIndex}
                                data-workbook-col={colIndex}
                                onMouseDown={(event) => {
                                  if (event.button === 2) return;
                                  event.preventDefault();
                                  focusWorkbook();
                                  materializeRowsThroughIndex(rowIndex);
                                  setContextMenu(null);
                                  setMetricDetailOpen(true);
                                  setEditingCell(null);
                                  setSelection({
                                    startRow: rowIndex,
                                    endRow: rowIndex,
                                    startCol: colIndex,
                                    endCol: colIndex,
                                  });
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  focusWorkbook();
                                  materializeRowsThroughIndex(rowIndex);
                                  setEditingCell(null);
                                  setSelection({
                                    startRow: rowIndex,
                                    endRow: rowIndex,
                                    startCol: colIndex,
                                    endCol: colIndex,
                                  });
                                  setContextMenu({
                                    x: Math.max(12, Math.min(event.clientX, window.innerWidth - 340)),
                                    y: Math.max(12, Math.min(event.clientY, window.innerHeight - 620)),
                                  });
                                }}
                                className="cursor-pointer border-b border-r border-[#dfe4ea] bg-white px-0 py-0"
                              >
                                <div
                                  className={`relative min-h-[32px] px-3 py-1.5 text-slate-300 ${
                                    column.align === "right"
                                      ? "text-right"
                                      : column.align === "center"
                                        ? "text-center"
                                        : "text-left"
                                  }`}
                                  style={{
                                    backgroundColor: isSelected ? EXCEL_SELECTION_FILL : undefined,
                                    boxShadow: isActiveCell ? `inset 0 0 0 2px ${EXCEL_SELECTION_BORDER}` : undefined,
                                  }}
                                >
                                  <span className="block select-none">&nbsp;</span>
                                  {isActiveCell && (
                                    <span
                                      className="pointer-events-none absolute bottom-0 right-0 h-1.5 w-1.5 translate-x-1/2 translate-y-1/2 rounded-[1px]"
                                      style={{ backgroundColor: EXCEL_SELECTION_BORDER }}
                                    />
                                  )}
                                </div>
                              </td>
                            );
                            })}
                          </tr>
                        );
                      })}
                      {visibleRows.length === 0 && !shouldPadWorkbookRows && (
                        <tr>
                          <td
                            colSpan={visibleColumns.length + 1}
                            className="px-4 py-10 text-center text-sm text-slate-400"
                          >
                            No rows match the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    </table>
                  </div>
                </div>
                {contextMenu ? (
                  <div
                    ref={menuRef}
                    className="fixed z-50 w-80 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-2xl"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                  >
                    <SheetContextMenuItem
                      icon={<Scissors className="h-4 w-4" />}
                      label="Cut"
                      shortcut="⌘X"
                      onClick={() => {
                        void cutSelection();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Copy className="h-4 w-4" />}
                      label="Copy"
                      shortcut="⌘C"
                      onClick={() => {
                        void copySelection();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<ClipboardPaste className="h-4 w-4" />}
                      label="Paste"
                      shortcut="⌘V"
                      onClick={() => {
                        void pasteSelection();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<ClipboardPaste className="h-4 w-4" />}
                      label="Paste special"
                      submenu
                      onClick={() => {
                        pasteCopiedStyle();
                        setContextMenu(null);
                      }}
                    />
                    <div className="my-1 h-px bg-slate-200" />
                    <SheetContextMenuItem
                      icon={<Plus className="h-4 w-4" />}
                      label="Insert 1 row above"
                      onClick={() => {
                        insertRowAbove();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Plus className="h-4 w-4" />}
                      label="Insert 1 column left"
                      onClick={() => {
                        insertColumnLeft();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Plus className="h-4 w-4" />}
                      label="Insert cells"
                      submenu
                      onClick={() => {
                        insertRowAbove();
                        setContextMenu(null);
                      }}
                    />
                    <div className="my-1 h-px bg-slate-200" />
                    <SheetContextMenuItem
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Delete row"
                      onClick={() => {
                        deleteSelectedRows();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Delete column"
                      onClick={() => {
                        deleteSelectedColumns();
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Delete cells"
                      submenu
                      onClick={() => {
                        clearSelectionContent();
                        setContextMenu(null);
                      }}
                    />
                    <div className="my-1 h-px bg-slate-200" />
                    <SheetContextMenuItem
                      icon={<Table2 className="h-4 w-4" />}
                      label="Convert to table"
                      badge="New"
                      onClick={() => {
                        applyBorderPreset("all");
                        applyStylePatch({ bold: true, fillColor: "#f3f6f4" });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Filter className="h-4 w-4" />}
                      label="Create filter"
                      onClick={() => {
                        workbookRef.current?.focus();
                        setContextMenu(null);
                      }}
                    />
                    <div className="my-1 h-px bg-slate-200" />
                    <SheetContextMenuItem
                      icon={<Link className="h-4 w-4" />}
                      label="Insert link"
                      onClick={() => {
                        applyStylePatch({ textColor: "#1155cc", underline: true });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<MessageSquarePlus className="h-4 w-4" />}
                      label="Comment"
                      shortcut="⌘+Option+M"
                      onClick={() => {
                        applyStylePatch({ fillColor: "#fff7cc" });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<MessageSquarePlus className="h-4 w-4" />}
                      label="Insert note"
                      onClick={() => {
                        applyStylePatch({ fillColor: "#fff2cc", borderTop: true });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Table2 className="h-4 w-4" />}
                      label="Table template"
                      onClick={() => {
                        applyBorderPreset("all");
                        applyStylePatch({ bold: true, fillColor: "#f3f6f4" });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<ChevronRight className="h-4 w-4 rotate-90" />}
                      label="Dropdown"
                      onClick={() => {
                        applyStylePatch({ fillColor: "#eef6ff" });
                        setContextMenu(null);
                      }}
                    />
                    <SheetContextMenuItem
                      icon={<Sigma className="h-4 w-4" />}
                      label="Smart chip"
                      submenu
                      onClick={() => {
                        setShowFormulas((current) => !current);
                        setContextMenu(null);
                      }}
                    />
                    <div className="my-1 h-px bg-slate-200" />
                    <SheetContextMenuItem
                      icon={<MoreVertical className="h-4 w-4" />}
                      label="View more cell actions"
                      submenu
                      onClick={() => {
                        startInlineEdit();
                        setContextMenu(null);
                      }}
                    />
                  </div>
                ) : null}
                <MetricDetailDrawer
                  open={metricDetailOpen}
                  row={selectedRow}
                  field={selectedField}
                  column={selectedColumn}
                  cellReference={selectedCellReference}
                  displayValue={selectedDisplayValue}
                  trace={selectedMetricTrace}
                  cellState={selectedCellState}
                  derivedFormula={selectedDerivedFormula}
                  editEntries={selectedEditEntries}
                  onClose={() => setMetricDetailOpen(false)}
                />
                  </>
                )}
                </>
                <div className="flex items-center gap-3 border-t border-[#d6dbe1] bg-[#f3f3f3] px-4 py-2.5">
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
                    {WORKBOOK_SECTIONS.map((sheet) => {
                      const isActive = sheet.key === activeSheet;
                      return (
                        <button
                          key={sheet.key}
                          type="button"
                          onClick={() => {
                            setActiveSheet(sheet.key);
                            workbookRef.current?.focus();
                          }}
                          className={`inline-flex min-w-fit items-center rounded-t-md border px-4 py-2 text-sm font-semibold transition ${
                            isActive
                              ? "border-[#d6dbe1] border-b-white bg-white text-slate-900 shadow-[inset_0_-2px_0_0_#217346]"
                              : "border-transparent bg-transparent text-slate-600 hover:bg-white/70 hover:text-slate-800"
                          }`}
                        >
                          <span>{sheet.title}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    {sheetSearchQuery.trim() && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
                        Find {visibleSearchMatches.length}
                      </span>
                    )}
                    {showFormulas && (
                      <span className="rounded-full border border-[#217346]/20 bg-[#e9f5ee] px-2.5 py-1 font-semibold text-[#217346]">
                        Formulas
                      </span>
                    )}
                    {selectionStats.numericCount > 0 && (
                      <>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                          Avg {selectionStats.average?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                          Sum {selectionStats.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                      Count {selectionStats.count}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                      {normalizedSelection
                        ? `${normalizedSelection.endRow - normalizedSelection.startRow + 1} row${normalizedSelection.endRow - normalizedSelection.startRow + 1 === 1 ? "" : "s"} selected`
                        : `${currentWorkbookRows.length} rows in view`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(100)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Reset zoom
                    </button>
                  </div>
                </div>
              </div>

            </div>
        </div>
      </div>
    )}

        <div className={embedded ? "mt-6 space-y-4" : "mt-4 space-y-4"}>
          <AnalysisCalculationsExplainer />
        </div>
      </div>
    </RequireAuth>
  );
}
