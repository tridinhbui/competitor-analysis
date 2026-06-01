import type { FinancialModelContext, FinancialModelSheetKey } from "@/lib/dataSourceFinancialModel";

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

export function buildFinancialGrid(sheetKey: FinancialModelSheetKey, ctx: FinancialModelContext): FinancialGridModel {
  return sheetKey === "underwriting" ? buildUnderwritingGrid(ctx) : buildAnnualCfGrid(ctx);
}

function buildUnderwritingGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const rowCount = 48;
  const colCount = 10;
  const colWidths = [220, 88, 100, 168, 48, 48, 100, 100, 48, 48];
  const sectionRanges: FinancialSectionRange[] = [];

  const yieldOnCost =
    ctx.operatingIncomeM != null && ctx.totalAssetsM != null && ctx.totalAssetsM > 0
      ? `${((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)}%`
      : "";

  put(cells, 0, 0, "DATA CENTER DEVELOPMENT MODEL", "navyTitle", { colspan: 8, readOnly: true });
  put(cells, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, "navyTitle", { colspan: 8, readOnly: true });
  put(cells, 2, 0, ctx.subtitle, "navySub", { colspan: 8, readOnly: true });
  put(cells, 3, 0, "Modular and scalable phased development · English template", "navySub", { colspan: 8, readOnly: true });

  put(cells, 5, 0, "Project Parameters", "sectionHeader", { colspan: 3, sectionId: "investment-description" });
  put(cells, 5, 3, "Shortcuts to Sections", "sectionHeader", { colspan: 3, readOnly: true });
  put(cells, 5, 6, "Key Metrics", "sectionHeader", { colspan: 2, sectionId: "returns" });
  sectionRanges.push({ sectionId: "investment-description", startRow: 5, endRow: 12, startCol: 0, endCol: 2 });
  sectionRanges.push({ sectionId: "returns", startRow: 5, endRow: 12, startCol: 6, endCol: 7 });

  const params: Array<[string, string]> = [
    ["IT Load Power (MW)", "20"],
    ["Total Facility Power (MW)", "30"],
    ["Analysis Start Date", "1-Jul-25"],
    ["Construction Duration", "24 Months"],
    ["Operations Start Month", "Month 25"],
    ["First Stabilization Month", "Month 46"],
    ["Sale / Hold Period End", "Month 72"],
  ];
  params.forEach(([label, value], index) => {
    const r = 6 + index;
    put(cells, r, 0, label, "metricLabel", { readOnly: true });
    put(cells, r, 1, value, "text", { colspan: 2 });
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
    ["Equity Multiple", "16.93x"],
    ["Yield on Cost (excl. escalation)", yieldOnCost],
    ["Market Cap Rate", ""],
    ["Development Spread", ""],
    [`Latest Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : ""],
    ["Latest EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : ""],
  ];
  metrics.forEach(([label, value], index) => {
    const r = 6 + index;
    put(cells, r, 6, label, "metricLabel", { readOnly: true });
    put(cells, r, 7, value, "number");
  });

  const usesRow = 14;
  put(cells, usesRow, 0, "USES OF FUNDS", "sectionHeader", { colspan: 8, sectionId: "investment-cash-flow" });
  const headers = ["USES", "End Month", "Method", "/SF Land", "/SF Total", "/SF Leasable", "/kW IT Load", "Total ($M)"];
  headers.forEach((header, col) => put(cells, usesRow + 1, col, header, "tableHeader", { readOnly: true }));

  const landItems = [
    ["Land Cost", "1", "Straight-Line", "50.05", "72.67", "68.20", "1200", "4.5"],
    ["Closing Costs", "1", "Straight-Line", "2.10", "3.05", "2.86", "50", "0.2"],
    ["Other", "1", "Straight-Line", "", "", "", "", "0"],
  ];
  let r = usesRow + 2;
  put(cells, r, 0, "Land Costs", "label", { colspan: 8, readOnly: true });
  r += 1;
  for (const row of landItems) {
    row.forEach((cell, col) => put(cells, r, col, cell, col === 0 ? "text" : "number"));
    r += 1;
  }
  put(cells, r, 0, "Total Land Costs", "total", { colspan: 7, readOnly: true });
  put(cells, r, 7, "4.7", "total");
  r += 2;

  const constructionItems = [
    ["Site leveling and civil infrastructure", "24", "S-Curve", "", "45.2", "42.1", "850", "18.2"],
    ["Concrete and steel structure", "24", "S-Curve", "", "120.5", "112.3", "2200", "48.5"],
    ["Building envelope", "24", "S-Curve", "", "38.4", "35.8", "680", "15.4"],
    ["Raised floor", "24", "Straight-Line", "", "12.6", "11.8", "220", "5.1"],
    ["Mechanical systems — HVAC and cooling", "24", "S-Curve", "", "95.2", "88.6", "1750", "38.2"],
    ["Electrical system", "24", "S-Curve", "", "88.1", "82.0", "1620", "35.4"],
  ];
  put(cells, r, 0, "Construction Costs", "label", { colspan: 8, readOnly: true });
  r += 1;
  for (const row of constructionItems) {
    row.forEach((cell, col) => put(cells, r, col, cell, col === 0 ? "text" : "number"));
    r += 1;
  }
  put(cells, r, 0, "Total Construction Costs", "total", { colspan: 7, readOnly: true });
  put(cells, r, 7, "160.8", "total");
  sectionRanges.push({ sectionId: "investment-cash-flow", startRow: usesRow, endRow: r, startCol: 0, endCol: 7 });

  return { sheetKey: "underwriting", rowCount, colCount, colWidths, cells, sectionRanges };
}

function buildAnnualCfGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const rowCount = 42;
  const colCount = 10;
  const colWidths = [240, 72, 100, 72, 88, 100, 88, 88, 88, 48];
  const sectionRanges: FinancialSectionRange[] = [];
  let activeSection: FinancialShortcutId | null = null;
  let activeSectionStartRow = 0;

  const revY3 = ctx.revenueM ?? 0;
  const revY2 = revY3 * 0.85;
  const ocfY3 = ctx.operatingCashFlowM ?? revY3 * 0.35;

  put(cells, 0, 0, `${ctx.companyName.toUpperCase()} — ANNUAL CASH FLOW`, "navyTitle", { colspan: 9, readOnly: true });
  put(cells, 1, 0, "Annual development, operating, and expense forecast (USD millions)", "navySub", {
    colspan: 9,
    readOnly: true,
  });

  const colHeaders = ["", "Total", "Phase", "Type", "Period End", "Year 0", "Year 1", "Year 2", "Year 3"];
  colHeaders.forEach((header, col) => put(cells, 3, col, header, "tableHeader", { readOnly: true }));

  type RowDef = {
    label: string;
    section?: boolean;
    total?: boolean;
    sectionId?: FinancialShortcutId;
    values: string[];
  };

  const rows: RowDef[] = [
    { label: "ANNUAL DEVELOPMENT CASH FLOW", section: true, sectionId: "investment-cash-flow", values: [] },
    { label: "Total Land Costs", values: ["4.7", "Development", "Uses", "Jun-25", "4.7", "0", "0", "0"] },
    { label: "Total Construction Costs", values: ["160.8", "Development", "Uses", "Jun-28", "80.4", "80.4", "0", "0"] },
    { label: "Total Soft Costs", values: ["12.5", "Development", "Uses", "Jun-28", "6.2", "6.3", "0", "0"] },
    { label: "Total Project Cost Before Financing", total: true, values: ["178.0", "", "", "", "91.3", "86.7", "0", "0"] },
    { label: "Capitalized Construction Interest", values: ["8.2", "Financing", "Uses", "Jun-28", "4.1", "4.1", "0", "0"] },
    { label: "Financing Fees", values: ["3.1", "Financing", "Uses", "Jun-28", "1.5", "1.6", "0", "0"] },
    { label: "Total Use of Funds", total: true, values: ["189.3", "", "", "", "96.9", "92.4", "0", "0"] },
    { label: "Total Source of Funds", total: true, values: ["189.3", "", "", "", "96.9", "92.4", "0", "0"] },
    { label: "ANNUAL OPERATING CASH FLOW", section: true, sectionId: "operating-cash-flow", values: [] },
    { label: "Rental Income", values: [fmtM(revY3), "Operations", "Income", "Jun-28", "", "", fmtM(revY2), fmtM(revY3)] },
    { label: "Recovery Income", values: [fmtM(revY3 * 0.05), "Operations", "Income", "Jun-28", "", "", fmtM(revY2 * 0.05), fmtM(revY3 * 0.05)] },
    { label: "Effective Gross Revenue (EGR)", total: true, values: [fmtM(revY3), "", "", "", "", "", fmtM(revY2), fmtM(revY3)] },
    { label: "OPERATING EXPENSES", section: true, values: [] },
    { label: "Electricity", values: [fmtM(revY3 * 0.08), "Operations", "Expense", "Jun-28", "", "", fmtM(revY2 * 0.08), fmtM(revY3 * 0.08)] },
    { label: "Equipment Maintenance", values: [fmtM(revY3 * 0.02), "Operations", "Expense", "Jun-28", "", "", fmtM(revY2 * 0.02), fmtM(revY3 * 0.02)] },
    { label: "General & Administrative (G&A)", values: [fmtM(revY3 * 0.03), "Operations", "Expense", "Jun-28", "", "", fmtM(revY2 * 0.03), fmtM(revY3 * 0.03)] },
    { label: "Net Operating Cash Flow", total: true, values: [fmtM(ocfY3), "", "", "", "", "", fmtM(ocfY3 * 0.85), fmtM(ocfY3)] },
    { label: "REVERSION & EXIT CASH FLOW", section: true, sectionId: "reversion-cash-flow", values: [] },
    { label: "Net Sale Proceeds", values: ["", "Exit", "Income", "Month 72", "", "", "", ""] },
    { label: "Reversion Cash Flow", total: true, values: ["", "", "", "", "", "", "", ""] },
  ];

  const closeActiveSection = (endRow: number) => {
    if (!activeSection) return;
    sectionRanges.push({
      sectionId: activeSection,
      startRow: activeSectionStartRow,
      endRow: endRow,
      startCol: 0,
      endCol: 8,
    });
    activeSection = null;
  };

  let r = 4;
  for (const row of rows) {
    if (row.section) {
      closeActiveSection(r - 1);
      put(cells, r, 0, row.label, "sectionHeader", { colspan: 9, sectionId: row.sectionId, readOnly: true });
      if (row.sectionId) {
        activeSection = row.sectionId;
        activeSectionStartRow = r;
      }
      r += 1;
      continue;
    }
    put(cells, r, 0, row.label, row.total ? "total" : "text", { readOnly: true });
    row.values.forEach((value, colIndex) => {
      put(cells, r, colIndex + 1, value, row.total ? "total" : "number");
    });
    r += 1;
  }
  closeActiveSection(r - 1);

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
