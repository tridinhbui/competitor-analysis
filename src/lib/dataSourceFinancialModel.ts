import * as XLSX from "xlsx-js-style";
import type { DataSourceRow } from "@/types/dataSource";

export type FinancialModelSheetKey = "underwriting" | "annualCf";

export interface FinancialModelContext {
  companyName: string;
  ticker: string;
  subtitle: string;
  latestQuarterLabel: string;
  latestPeriodEnd: string;
  /** Millions USD where applicable */
  revenueM: number | null;
  operatingIncomeM: number | null;
  capexM: number | null;
  operatingCashFlowM: number | null;
  freeCashFlowM: number | null;
  totalAssetsM: number | null;
  ebitdaM: number | null;
}

const NAVY = "1E3A5F";
const NAVY_DARK = "0F2744";
const BLUE_HEADER = "2B579A";
const LIGHT_BLUE = "D9E8F7";
const WHITE = "FFFFFF";

type CellStyle = XLSX.CellObject["s"];

function styleCell(
  fillRgb?: string,
  font?: { bold?: boolean; color?: string; sz?: number },
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean },
  border?: boolean,
): CellStyle {
  const s: CellStyle = {
    alignment: { vertical: "center", wrapText: true, ...alignment },
    font: { name: "Calibri", sz: 10, ...font },
  };
  if (fillRgb) {
    s.fill = { fgColor: { rgb: fillRgb } };
  }
  if (border) {
    const edge = { style: "thin", color: { rgb: "CBD5E1" } };
    s.border = { top: edge, bottom: edge, left: edge, right: edge };
  }
  return s;
}

function setCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number | null,
  cellStyle?: CellStyle,
) {
  const address = XLSX.utils.encode_cell({ r, c });
  if (value === null || value === "") {
    ws[address] = { t: "s", v: "", s: cellStyle };
    return;
  }
  if (typeof value === "number") {
    ws[address] = { t: "n", v: value, s: cellStyle };
    return;
  }
  ws[address] = { t: "s", v: value, s: cellStyle };
}

function merge(ws: XLSX.WorkSheet, r0: number, c0: number, r1: number, c1: number) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { r: r0, c: c0 }, e: { r: r1, c: c1 } });
}

function fmtM(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function buildFinancialModelContext(
  company: { ticker: string; companyName: string } | null,
  rows: DataSourceRow[],
): FinancialModelContext {
  const quarterRows = rows.filter((row) => row.periodEnd !== "TTM");
  const latest =
    quarterRows.length > 0
      ? [...quarterRows].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]
      : rows[0];
  const ttm = rows.find((row) => row.periodEnd === "TTM");

  const pick = (field: keyof DataSourceRow): number | null => {
    const ttmVal = ttm ? getRowNumber(ttm, field) : null;
    const latestVal = latest ? getRowNumber(latest, field) : null;
    return ttmVal ?? latestVal;
  };

  return {
    companyName: company?.companyName ?? latest?.companyName ?? "Portfolio Company",
    ticker: company?.ticker ?? latest?.ticker ?? "—",
    subtitle: "Development & Operations Financial Model",
    latestQuarterLabel: latest?.quarterLabel ?? "Latest quarter",
    latestPeriodEnd: latest?.periodEnd ?? "—",
    revenueM: pick("revenue"),
    operatingIncomeM: pick("operatingIncome"),
    capexM: pick("capex"),
    operatingCashFlowM: pick("operatingCashFlow"),
    freeCashFlowM: pick("freeCashFlow"),
    totalAssetsM: pick("totalAssets"),
    ebitdaM: pick("ebitda"),
  };
}

function getRowNumber(row: DataSourceRow, field: keyof DataSourceRow): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildUnderwritingWorksheet(ctx: FinancialModelContext): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const titleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 14 });
  const subtitleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 11 });
  const labelStyle = styleCell(LIGHT_BLUE, { bold: true, color: NAVY_DARK });
  const headerStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE });
  const sectionStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE, sz: 11 });
  const bodyStyle = styleCell(WHITE, undefined, { horizontal: "left" }, true);
  const numStyle = styleCell(WHITE, undefined, { horizontal: "right" }, true);
  const metricLabelStyle = styleCell(undefined, { bold: true, color: NAVY_DARK });

  setCell(ws, 0, 0, "DATA CENTER DEVELOPMENT MODEL", titleStyle);
  merge(ws, 0, 0, 0, 7);
  setCell(ws, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, subtitleStyle);
  merge(ws, 1, 0, 1, 7);
  setCell(ws, 2, 0, ctx.subtitle, styleCell(NAVY, { color: WHITE, sz: 10 }));
  merge(ws, 2, 0, 2, 7);
  setCell(ws, 3, 0, "Modular and scalable phased development (English template)", styleCell(NAVY, { color: WHITE, sz: 9 }));
  merge(ws, 3, 0, 3, 7);

  const params: Array<[string, string]> = [
    ["IT Load Power (MW)", "20"],
    ["Total Facility Power (MW)", "30"],
    ["Analysis Start Date", "1-Jul-25"],
    ["Construction Duration", "24 Months"],
    ["Operations Start Month", "Month 25"],
    ["First Stabilization Month", "Month 46"],
    ["Sale / Hold Period End", "Month 72"],
  ];
  let r = 5;
  setCell(ws, r, 0, "Project Parameters", sectionStyle);
  merge(ws, r, 0, r, 2);
  r += 1;
  for (const [label, value] of params) {
    setCell(ws, r, 0, label, metricLabelStyle);
    setCell(ws, r, 1, value, bodyStyle);
    merge(ws, r, 1, r, 2);
    r += 1;
  }

  setCell(ws, 5, 3, "Shortcuts to Sections", sectionStyle);
  merge(ws, 5, 3, 5, 5);
  const shortcuts = [
    "Investment Description",
    "Investment Cash Flow",
    "Operating Cash Flow",
    "Reversion Cash Flow",
    "Returns",
  ];
  shortcuts.forEach((label, index) => {
    setCell(ws, 6 + index, 3, label, styleCell("3B82F6", { bold: true, color: WHITE }, { horizontal: "center" }));
    merge(ws, 6 + index, 3, 6 + index, 5);
  });

  setCell(ws, 5, 6, "Key Metrics", sectionStyle);
  merge(ws, 5, 6, 5, 7);
  const yieldOnCost =
    ctx.operatingIncomeM != null && ctx.totalAssetsM != null && ctx.totalAssetsM > 0
      ? ((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)
      : "—";
  const metrics: Array<[string, string]> = [
    ["Equity Multiple", "16.93x"],
    ["Yield on Cost (excl. escalation)", `${yieldOnCost}%`],
    ["Market Cap Rate", "—"],
    ["Development Spread", "—"],
    [`Latest Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : "—"],
    ["Latest EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : "—"],
  ];
  metrics.forEach(([label, value], index) => {
    setCell(ws, 6 + index, 6, label, metricLabelStyle);
    setCell(ws, 6 + index, 7, value, numStyle);
  });

  r = 14;
  setCell(ws, r, 0, "USES OF FUNDS", sectionStyle);
  merge(ws, r, 0, r, 7);
  r += 1;

  const headers = ["USES", "End Month", "Method", "/SF Land", "/SF Total", "/SF Leasable", "/kW IT Load", "Total ($M)"];
  headers.forEach((header, col) => {
    setCell(ws, r, col, header, headerStyle);
  });
  r += 1;

  const landItems: Array<[string, number, string, number, number, number, number, number]> = [
    ["Land Cost", 1, "Straight-Line", 50.05, 72.67, 68.2, 1200, 4.5],
    ["Closing Costs", 1, "Straight-Line", 2.1, 3.05, 2.86, 50, 0.2],
    ["Other", 1, "Straight-Line", 0, 0, 0, 0, 0],
  ];
  setCell(ws, r, 0, "Land Costs", labelStyle);
  merge(ws, r, 0, r, 7);
  r += 1;
  for (const row of landItems) {
    row.forEach((cell, col) => {
      setCell(ws, r, col, cell, col === 0 ? bodyStyle : numStyle);
    });
    r += 1;
  }
  setCell(ws, r, 0, "Total Land Costs", sectionStyle);
  setCell(ws, r, 7, 4.7, numStyle);
  merge(ws, r, 0, r, 6);
  r += 2;

  const constructionItems: Array<[string, number, string, number, number, number, number, number]> = [
    ["Site leveling and civil infrastructure", 24, "S-Curve", 0, 45.2, 42.1, 850, 18.2],
    ["Concrete and steel structure", 24, "S-Curve", 0, 120.5, 112.3, 2200, 48.5],
    ["Building envelope", 24, "S-Curve", 0, 38.4, 35.8, 680, 15.4],
    ["Raised floor", 24, "Straight-Line", 0, 12.6, 11.8, 220, 5.1],
    ["Mechanical systems — HVAC and cooling", 24, "S-Curve", 0, 95.2, 88.6, 1750, 38.2],
    ["Electrical system", 24, "S-Curve", 0, 88.1, 82.0, 1620, 35.4],
  ];
  setCell(ws, r, 0, "Construction Costs", labelStyle);
  merge(ws, r, 0, r, 7);
  r += 1;
  for (const row of constructionItems) {
    row.forEach((cell, col) => {
      setCell(ws, r, col, cell, col === 0 ? bodyStyle : numStyle);
    });
    r += 1;
  }
  setCell(ws, r, 0, "Total Construction Costs", sectionStyle);
  setCell(ws, r, 7, 160.8, numStyle);
  merge(ws, r, 0, r, 6);

  ws["!cols"] = [
    { wch: 38 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  ws["!rows"] = [{ hpt: 22 }, { hpt: 18 }, { hpt: 16 }, { hpt: 14 }];

  return ws;
}

export function buildAnnualCfWorksheet(ctx: FinancialModelContext): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const titleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 13 });
  const headerStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE });
  const sectionStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE, sz: 10 });
  const bodyStyle = styleCell(WHITE, undefined, { horizontal: "left" }, true);
  const numStyle = styleCell(WHITE, undefined, { horizontal: "right" }, true);
  const totalStyle = styleCell(LIGHT_BLUE, { bold: true, color: NAVY_DARK }, { horizontal: "right" }, true);

  setCell(ws, 0, 0, `${ctx.companyName.toUpperCase()} — ANNUAL CASH FLOW`, titleStyle);
  merge(ws, 0, 0, 0, 8);
  setCell(ws, 1, 0, "Annual development, operating, and expense forecast (USD millions)", styleCell(NAVY, { color: WHITE, sz: 9 }));
  merge(ws, 1, 0, 1, 8);

  const colHeaders = [
    "",
    "Total",
    "Analysis Phase",
    "Type",
    "Period End",
    "Year 0 (Jun-25)",
    "Year 1 (2026)",
    "Year 2 (2027)",
    "Year 3 (Jun-28)",
  ];
  colHeaders.forEach((header, col) => setCell(ws, 3, col, header, headerStyle));

  const revY3 = ctx.revenueM ?? 0;
  const revY2 = revY3 * 0.85;
  const revY1 = revY3 * 0.7;
  const capexAnnual = ctx.capexM != null ? Math.abs(ctx.capexM) : 45;
  const opexElectric = revY3 * 0.08;
  const ocfY3 = ctx.operatingCashFlowM ?? revY3 * 0.35;

  type RowDef = { label: string; section?: boolean; total?: boolean; values: (string | number)[] };

  const sections: RowDef[] = [
    { label: "ANNUAL DEVELOPMENT CASH FLOW", section: true, values: [] },
    { label: "Total Land Costs", values: ["", 4.7, "Development", "Uses", "Jun-25", 4.7, 0, 0, 0] },
    { label: "Total Construction Costs", values: ["", 160.8, "Development", "Uses", "Jun-28", 80.4, 80.4, 0, 0] },
    { label: "Total Soft Costs", values: ["", 12.5, "Development", "Uses", "Jun-28", 6.2, 6.3, 0, 0] },
    { label: "Total Project Cost Before Financing", total: true, values: ["", 178.0, "", "", "", 91.3, 86.7, 0, 0] },
    { label: "Capitalized Construction Interest", values: ["", 8.2, "Financing", "Uses", "Jun-28", 4.1, 4.1, 0, 0] },
    { label: "Financing Fees", values: ["", 3.1, "Financing", "Uses", "Jun-28", 1.5, 1.6, 0, 0] },
    { label: "Operating Shortfall", values: ["", 0, "Operations", "Uses", "Jun-28", 0, 0, 0, 0] },
    { label: "Total Use of Funds", total: true, values: ["", 189.3, "", "", "", 96.9, 92.4, 0, 0] },
    { label: "Total Source of Funds", total: true, values: ["", 189.3, "", "", "", 96.9, 92.4, 0, 0] },
    { label: "ANNUAL OPERATING CASH FLOW", section: true, values: [] },
    { label: "Rental Income", values: ["", revY3, "Operations", "Income", "Jun-28", 0, 0, revY2, revY3] },
    { label: "Recovery Income", values: ["", revY3 * 0.05, "Operations", "Income", "Jun-28", 0, 0, revY2 * 0.05, revY3 * 0.05] },
    { label: "Total Potential Gross Income", total: true, values: ["", revY3 * 1.05, "", "", "", 0, 0, revY2 * 1.05, revY3 * 1.05] },
    { label: "Vacancy and Credit Risk (5%)", values: ["", revY3 * -0.05, "Operations", "Income", "Jun-28", 0, 0, revY2 * -0.05, revY3 * -0.05] },
    { label: "Effective Gross Revenue (EGR)", total: true, values: ["", revY3, "", "", "", 0, 0, revY2, revY3] },
    { label: "OPERATING EXPENSES", section: true, values: [] },
    { label: "Electricity", values: ["", opexElectric, "Operations", "Expense", "Jun-28", 0, 0, opexElectric * 0.9, opexElectric] },
    { label: "Equipment Maintenance", values: ["", revY3 * 0.02, "Operations", "Expense", "Jun-28", 0, 0, revY2 * 0.02, revY3 * 0.02] },
    { label: "Facility Maintenance", values: ["", revY3 * 0.015, "Operations", "Expense", "Jun-28", 0, 0, revY2 * 0.015, revY3 * 0.015] },
    { label: "Personnel & Security", values: ["", revY3 * 0.04, "Operations", "Expense", "Jun-28", 0, 0, revY2 * 0.04, revY3 * 0.04] },
    { label: "Insurance", values: ["", revY3 * 0.01, "Operations", "Expense", "Jun-28", 0, 0, revY2 * 0.01, revY3 * 0.01] },
    { label: "General & Administrative (G&A)", values: ["", revY3 * 0.03, "Operations", "Expense", "Jun-28", 0, 0, revY2 * 0.03, revY3 * 0.03] },
    { label: "Net Operating Cash Flow", total: true, values: ["", ocfY3, "", "", "", 0, 0, ocfY3 * 0.85, ocfY3] },
  ];

  let r = 4;
  for (const row of sections) {
    if (row.section) {
      setCell(ws, r, 0, row.label, sectionStyle);
      merge(ws, r, 0, r, 8);
      r += 1;
      continue;
    }
    const rowStyle = row.total ? totalStyle : bodyStyle;
    setCell(ws, r, 0, row.label, row.total ? styleCell(LIGHT_BLUE, { bold: true }, undefined, true) : bodyStyle);
    row.values.forEach((value, col) => {
      if (col === 0) return;
      const cellStyle = typeof value === "number" ? numStyle : rowStyle;
      setCell(ws, r, col, value, cellStyle);
    });
    r += 1;
  }

  ws["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  return ws;
}

export function appendFinancialModelSheets(
  workbook: XLSX.WorkBook,
  ctx: FinancialModelContext,
): void {
  const underwriting = buildUnderwritingWorksheet(ctx);
  const annualCf = buildAnnualCfWorksheet(ctx);
  XLSX.utils.book_append_sheet(workbook, underwriting, "Underwriting");
  XLSX.utils.book_append_sheet(workbook, annualCf, "Annual CF");
}

export function isFinancialModelSheetKey(key: string): key is FinancialModelSheetKey {
  return key === "underwriting" || key === "annualCf";
}
