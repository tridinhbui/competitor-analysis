import type { FinancialModelContext, FinancialModelSheetKey } from "@/lib/dataSourceFinancialModel";
import {
  filingMetricRowToCells,
  type FilingCategorySection,
} from "@/lib/financialModelFromFiling";

export type FinancialCellStyle =
  | "navyTitle"
  | "navySub"
  | "sectionHeader"
  | "tableHeader"
  | "label"
  | "metricLabel"
  | "number"
  | "text"
  | "total"
  | "shortcutBtn"
  | "empty";

export type FinancialShortcutId =
  | "investment-description"
  | "investment-cash-flow"
  | "operating-cash-flow"
  | "reversion-cash-flow"
  | "returns";

export type FinancialShortcutTarget = {
  sheet: FinancialModelSheetKey;
  sectionId: FinancialShortcutId;
};

export interface FinancialGridCell {
  value: string;
  style: FinancialCellStyle;
  readOnly?: boolean;
  colspan?: number;
  rowspan?: number;
  wrapText?: boolean;
  sectionId?: FinancialShortcutId;
  shortcutTarget?: FinancialShortcutTarget;
}

export interface FinancialSectionRange {
  sectionId: FinancialShortcutId;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface FinancialGridModel {
  sheetKey: FinancialModelSheetKey;
  rowCount: number;
  colCount: number;
  colWidths: number[];
  cells: Map<string, FinancialGridCell>;
  sectionRanges: FinancialSectionRange[];
}

const STORAGE_PREFIX = "data-source-financial-grid-v1";

export function financialGridStorageKey(ticker: string | null, sheet: FinancialModelSheetKey): string {
  return `${STORAGE_PREFIX}:${(ticker ?? "default").toUpperCase()}:${sheet}`;
}

export function loadFinancialGridOverrides(storageKey: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveFinancialGridOverrides(storageKey: string, overrides: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(overrides));
}

function key(r: number, c: number): string {
  return `${r},${c}`;
}

function put(
  cells: Map<string, FinancialGridCell>,
  r: number,
  c: number,
  value: string,
  style: FinancialCellStyle,
  options?: Partial<FinancialGridCell>,
): void {
  cells.set(key(r, c), { value, style, ...options });
}

function fmtM(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

export const FINANCIAL_SHORTCUTS: Array<{
  label: string;
  target: FinancialShortcutTarget;
}> = [
  { label: "Investment Description", target: { sheet: "underwriting", sectionId: "investment-description" } },
  { label: "Investment Cash Flow", target: { sheet: "underwriting", sectionId: "investment-cash-flow" } },
  { label: "Operating Cash Flow", target: { sheet: "annualCf", sectionId: "operating-cash-flow" } },
  { label: "Reversion Cash Flow", target: { sheet: "annualCf", sectionId: "reversion-cash-flow" } },
  { label: "Returns", target: { sheet: "underwriting", sectionId: "returns" } },
];

function maxCategoryColumnCount(sections: FilingCategorySection[]): number {
  return Math.max(3, ...sections.map((s) => s.columnHeaders.length));
}

function appendCategorySectionsToGrid(
  cells: Map<string, FinancialGridCell>,
  sectionRanges: FinancialSectionRange[],
  sections: FilingCategorySection[],
  startRow: number,
  colCount: number,
): number {
  let r = startRow;

  for (const section of sections) {
    const span = Math.min(colCount, Math.max(section.columnHeaders.length, 1));
    const sectionStart = r;
    put(cells, r, 0, section.title, "sectionHeader", {
      colspan: span,
      sectionId: section.sectionId as FinancialShortcutId | undefined,
      readOnly: true,
    });
    r += 1;

    section.columnHeaders.forEach((header, col) => {
      if (col >= colCount) return;
      put(cells, r, col, header, "tableHeader", { readOnly: true });
    });
    r += 1;

    for (const metricRow of section.rows) {
      const rowCells = filingMetricRowToCells(metricRow);
      rowCells.forEach((cell, col) => {
        if (col >= colCount) return;
        put(cells, r, col, cell, col === 0 ? "text" : "number");
      });
      r += 1;
    }

    if (section.sectionId) {
      sectionRanges.push({
        sectionId: section.sectionId as FinancialShortcutId,
        startRow: sectionStart,
        endRow: r - 1,
        startCol: 0,
        endCol: span - 1,
      });
    }
    r += 1;
  }

  return r;
}

export function buildFinancialGrid(sheetKey: FinancialModelSheetKey, ctx: FinancialModelContext): FinancialGridModel {
  return sheetKey === "underwriting" ? buildUnderwritingGrid(ctx) : buildAnnualCfGrid(ctx);
}

function buildUnderwritingGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const { derived } = ctx;
  const colCount = Math.max(10, maxCategoryColumnCount(derived.categorySections));
  const colWidths = Array.from({ length: colCount }, (_, i) =>
    i === 0 ? 220 : i === 1 ? 56 : 96,
  );
  const sectionRanges: FinancialSectionRange[] = [];

  const yieldOnCost =
    ctx.operatingIncomeM != null && ctx.totalAssetsM != null && ctx.totalAssetsM > 0
      ? `${((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)}%`
      : "";

  const headerSpan = Math.min(colCount, 8);
  put(cells, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", "navyTitle", { colspan: headerSpan, readOnly: true });
  put(cells, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, "navyTitle", { colspan: headerSpan, readOnly: true });
  put(cells, 2, 0, ctx.subtitle, "navySub", { colspan: headerSpan, readOnly: true });
  put(cells, 3, 0, derived.sourceLabel, "navySub", { colspan: headerSpan, readOnly: true });

  put(cells, 5, 0, "Project Parameters", "sectionHeader", { colspan: 3, sectionId: "investment-description" });
  put(cells, 5, 3, "Shortcuts to Sections", "sectionHeader", { colspan: 3, readOnly: true });
  put(cells, 5, 6, "Key Metrics", "sectionHeader", { colspan: 2, sectionId: "returns" });
  sectionRanges.push({ sectionId: "investment-description", startRow: 5, endRow: 12, startCol: 0, endCol: 2 });
  sectionRanges.push({ sectionId: "returns", startRow: 5, endRow: 12, startCol: 6, endCol: 7 });

  derived.projectParams.forEach(({ label, value }, index) => {
    const r = 6 + index;
    const wraps = label === "Categories in model" && value.includes("\n");
    put(cells, r, 0, label, "metricLabel", { readOnly: true });
    put(cells, r, 1, value, "text", { colspan: 2, wrapText: wraps });
  });

  FINANCIAL_SHORTCUTS.forEach((shortcut, index) => {
    const r = 6 + index;
    put(cells, r, 3, shortcut.label, "shortcutBtn", {
      colspan: 3,
      readOnly: true,
      shortcutTarget: shortcut.target,
    });
  });

  const metrics: Array<[string, string]> = [
    ["Equity Multiple", derived.equityMultipleDisplay || ""],
    ["Yield on Cost (excl. escalation)", yieldOnCost],
    ["Market Cap Rate", derived.marketCapRateDisplay || ""],
    [
      "Development Spread",
      yieldOnCost && derived.marketCapRateDisplay
        ? `${(parseFloat(yieldOnCost) - parseFloat(derived.marketCapRateDisplay)).toFixed(2)}%`
        : "",
    ],
    [`Latest Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : ""],
    [`Latest CapEx (TTM / 4Q)`, ctx.capexM != null ? `$${fmtM(Math.abs(ctx.capexM))}M` : ""],
    ["Latest EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : ""],
  ];
  metrics.forEach(([label, value], index) => {
    const r = 6 + index;
    put(cells, r, 6, label, "metricLabel", { readOnly: true });
    put(cells, r, 7, value, "number");
  });

  const endRow = appendCategorySectionsToGrid(
    cells,
    sectionRanges,
    derived.categorySections,
    14,
    colCount,
  );
  const rowCount = Math.max(48, endRow + 4);

  return { sheetKey: "underwriting", rowCount, colCount, colWidths, cells, sectionRanges };
}

function buildAnnualCfGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const { derived } = ctx;
  const colCount = Math.max(10, maxCategoryColumnCount(derived.categorySections));
  const colWidths = Array.from({ length: colCount }, (_, i) => (i === 0 ? 240 : i === 1 ? 56 : 96));
  const sectionRanges: FinancialSectionRange[] = [];

  put(cells, 0, 0, `${ctx.companyName.toUpperCase()} — FILING METRICS BY PERIOD`, "navyTitle", {
    colspan: colCount,
    readOnly: true,
  });
  put(cells, 1, 0, derived.sourceLabel, "navySub", { colspan: colCount, readOnly: true });

  const endRow = appendCategorySectionsToGrid(cells, sectionRanges, derived.categorySections, 3, colCount);
  const rowCount = Math.max(42, endRow + 4);

  return { sheetKey: "annualCf", rowCount, colCount, colWidths, cells, sectionRanges };
}

export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function getCellDisplayValue(
  model: FinancialGridModel,
  overrides: Record<string, string>,
  r: number,
  c: number,
): string {
  const override = overrides[key(r, c)];
  if (override !== undefined) return override;
  return model.cells.get(key(r, c))?.value ?? "";
}

export function getCellMeta(model: FinancialGridModel, r: number, c: number): FinancialGridCell | null {
  return model.cells.get(key(r, c)) ?? null;
}

export function isCellInSectionHighlight(
  model: FinancialGridModel,
  sectionId: FinancialShortcutId,
  r: number,
  c: number,
): boolean {
  return model.sectionRanges.some(
    (range) =>
      range.sectionId === sectionId &&
      r >= range.startRow &&
      r <= range.endRow &&
      c >= range.startCol &&
      c <= range.endCol,
  );
}

/** Cells covered by a merge starting at head cell */
export function isCellCovered(model: FinancialGridModel, r: number, c: number): boolean {
  for (const [headKey, cell] of model.cells) {
    const [hr, hc] = headKey.split(",").map(Number);
    const colspan = cell.colspan ?? 1;
    const rowspan = cell.rowspan ?? 1;
    if (r >= hr && r < hr + rowspan && c >= hc && c < hc + colspan && !(r === hr && c === hc)) {
      return true;
    }
  }
  return false;
}
