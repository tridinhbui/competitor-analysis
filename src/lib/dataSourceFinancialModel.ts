import * as XLSX from "xlsx-js-style";
import {
  deriveFinancialModelFromRows,
  filingMetricRowToCells,
  type FilingCategorySection,
  type FilingDerivedFinancialModel,
} from "@/lib/financialModelFromFiling";
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
  /** Populated from PDF-derived workbook rows (per company). */
  derived: FilingDerivedFinancialModel;
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
  options?: {
    categorySections?: FilingCategorySection[];
    boardHeadline?: string;
  },
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

  const derived = deriveFinancialModelFromRows(rows, company, options);

  return {
    companyName: company?.companyName ?? latest?.companyName ?? "Portfolio Company",
    ticker: company?.ticker ?? latest?.ticker ?? "—",
    subtitle: derived.sourceLabel,
    latestQuarterLabel: latest?.quarterLabel ?? "Latest quarter",
    latestPeriodEnd: latest?.periodEnd ?? "—",
    revenueM: pick("revenue"),
    operatingIncomeM: pick("operatingIncome"),
    capexM: pick("capex"),
    operatingCashFlowM: pick("operatingCashFlow"),
    freeCashFlowM: pick("freeCashFlow"),
    totalAssetsM: pick("totalAssets"),
    ebitdaM: pick("ebitda"),
    derived,
  };
}

function writeCategorySections(
  ws: XLSX.WorkSheet,
  startRow: number,
  sections: FilingCategorySection[],
  styles: {
    headerStyle: XLSX.CellObject["s"];
    bodyStyle: XLSX.CellObject["s"];
    numStyle: XLSX.CellObject["s"];
    sectionStyle: XLSX.CellObject["s"];
  },
): number {
  let r = startRow;
  const { headerStyle, bodyStyle, numStyle, sectionStyle } = styles;

  for (const section of sections) {
    const lastCol = Math.max(section.columnHeaders.length - 1, 0);
    setCell(ws, r, 0, section.title, sectionStyle);
    merge(ws, r, 0, r, lastCol);
    r += 1;

    section.columnHeaders.forEach((header, col) => {
      setCell(ws, r, col, header, headerStyle);
    });
    r += 1;

    for (const row of section.rows) {
      filingMetricRowToCells(row).forEach((cell, col) => {
        setCell(ws, r, col, cell, col === 0 ? bodyStyle : numStyle);
      });
      r += 1;
    }
    r += 1;
  }

  return r;
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

  setCell(ws, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", titleStyle);
  merge(ws, 0, 0, 0, 7);
  setCell(ws, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, subtitleStyle);
  merge(ws, 1, 0, 1, 7);
  setCell(ws, 2, 0, ctx.subtitle, styleCell(NAVY, { color: WHITE, sz: 10 }));
  merge(ws, 2, 0, 2, 7);
  setCell(ws, 3, 0, ctx.derived.sourceLabel, styleCell(NAVY, { color: WHITE, sz: 9 }));
  merge(ws, 3, 0, 3, 7);

  const { derived } = ctx;
  let r = 5;
  setCell(ws, r, 0, "Project Parameters", sectionStyle);
  merge(ws, r, 0, r, 2);
  r += 1;
  const wrapBodyStyle = styleCell(WHITE, { sz: 9 }, { horizontal: "left", vertical: "top", wrapText: true }, true);
  for (const { label, value } of derived.projectParams) {
    setCell(ws, r, 0, label, metricLabelStyle);
    setCell(ws, r, 1, value, label === "Categories in model" ? wrapBodyStyle : bodyStyle);
    merge(ws, r, 1, r, 2);
    if (label === "Categories in model" && value.includes("\n")) {
      if (!ws["!rows"]) ws["!rows"] = [];
      ws["!rows"][r] = { hpt: Math.max(48, value.split("\n").length * 14) };
    }
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
      ? `${((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)}%`
      : "—";
  const metrics: Array<[string, string]> = [
    ["Equity Multiple", derived.equityMultipleDisplay || "—"],
    ["Yield on Cost (excl. escalation)", yieldOnCost],
    ["Market Cap Rate", derived.marketCapRateDisplay || "—"],
    [
      "Development Spread",
      yieldOnCost && derived.marketCapRateDisplay
        ? `${(parseFloat(yieldOnCost) - parseFloat(derived.marketCapRateDisplay)).toFixed(2)}%`
        : "—",
    ],
    [`Latest Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : "—"],
    [`Latest CapEx (TTM / 4Q, $M)`, ctx.capexM != null ? `$${fmtM(Math.abs(ctx.capexM))}M` : "—"],
    ["Latest EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : "—"],
  ];
  metrics.forEach(([label, value], index) => {
    setCell(ws, 6 + index, 6, label, metricLabelStyle);
    setCell(ws, 6 + index, 7, value, numStyle);
  });

  writeCategorySections(ws, 14, derived.categorySections, {
    headerStyle,
    bodyStyle,
    numStyle,
    sectionStyle,
  });

  const maxCols = Math.max(3, ...derived.categorySections.map((s) => s.columnHeaders.length));
  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 38 : i === 1 ? 8 : 14 }));
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
  const maxCols = Math.max(3, ...ctx.derived.categorySections.map((s) => s.columnHeaders.length));

  setCell(ws, 0, 0, `${ctx.companyName.toUpperCase()} — FILING METRICS BY PERIOD`, titleStyle);
  merge(ws, 0, 0, 0, maxCols - 1);
  setCell(ws, 1, 0, ctx.derived.sourceLabel, styleCell(NAVY, { color: WHITE, sz: 9 }));
  merge(ws, 1, 0, 1, maxCols - 1);

  writeCategorySections(ws, 3, ctx.derived.categorySections, {
    headerStyle,
    bodyStyle,
    numStyle,
    sectionStyle,
  });

  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 34 : i === 1 ? 8 : 14 }));
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
