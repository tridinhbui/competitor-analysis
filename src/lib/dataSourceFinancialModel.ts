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

function writeCategorySectionsHorizontal(
  ws: XLSX.WorkSheet,
  startRow: number,
  sections: FilingCategorySection[],
  styles: {
    headerStyle: XLSX.CellObject["s"];
    bodyStyle: XLSX.CellObject["s"];
    numStyle: XLSX.CellObject["s"];
    sectionStyle: XLSX.CellObject["s"];
  },
  panelsPerRow = 2,
  gapBetweenPanels = 0,
): { endRow: number; colCount: number } {
  let r = startRow;
  let maxColCount = 0;
  const { headerStyle, bodyStyle, numStyle, sectionStyle } = styles;

  const panelWidth = (section: FilingCategorySection) => Math.max(1, section.columnHeaders.length);

  for (let bandIndex = 0; bandIndex < sections.length; bandIndex += panelsPerRow) {
    const panels = sections.slice(bandIndex, bandIndex + panelsPerRow);
    const bandColCount = panels.reduce(
      (sum, panel, index) =>
        sum + panelWidth(panel) + (index < panels.length - 1 ? gapBetweenPanels : 0),
      0,
    );
    maxColCount = Math.max(maxColCount, bandColCount);

    let c = 0;
    panels.forEach((panel, index) => {
      const w = panelWidth(panel);
      setCell(ws, r, c, panel.title, sectionStyle);
      merge(ws, r, c, r, c + w - 1);
      c += w;
      if (index < panels.length - 1) c += gapBetweenPanels;
    });
    r += 1;

    c = 0;
    panels.forEach((panel, index) => {
      const w = panelWidth(panel);
      panel.columnHeaders.forEach((header, colIndex) => {
        setCell(ws, r, c + colIndex, header, headerStyle);
      });
      c += w;
      if (index < panels.length - 1) c += gapBetweenPanels;
    });
    r += 1;

    const maxDataRows = Math.max(1, ...panels.map((panel) => panel.rows.length));
    for (let rowIndex = 0; rowIndex < maxDataRows; rowIndex += 1) {
      c = 0;
      panels.forEach((panel, index) => {
        const w = panelWidth(panel);
        const metricRow = panel.rows[rowIndex];
        if (metricRow) {
          filingMetricRowToCells(metricRow).forEach((cell, colIndex) => {
            setCell(ws, r, c + colIndex, cell, colIndex === 0 ? bodyStyle : numStyle);
          });
        }
        c += w;
        if (index < panels.length - 1) c += gapBetweenPanels;
      });
      r += 1;
    }
  }

  return { endRow: r, colCount: maxColCount };
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
  const { derived } = ctx;
  const titleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 14 });
  const subtitleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 11 });
  const navySubStyle = styleCell(NAVY, { color: WHITE, sz: 10 }, { wrapText: true, vertical: "top" });
  const headerStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE });
  const sectionStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE, sz: 11 });
  const bodyStyle = styleCell(WHITE, undefined, { horizontal: "left" }, true);
  const numStyle = styleCell(WHITE, undefined, { horizontal: "right" }, true);
  const metricLabelStyle = styleCell(undefined, { bold: true, color: NAVY_DARK });
  const shortcutStyle = styleCell("3B82F6", { bold: true, color: WHITE }, { horizontal: "center" });
  const wrapBodyStyle = styleCell(WHITE, { sz: 9 }, { horizontal: "left", vertical: "top", wrapText: true }, true);

  const dataColCount = Math.max(
    3,
    ...derived.categorySections.map((section) => section.columnHeaders.length),
  );
  const colCount = Math.max(10, dataColCount);
  let paramsW = Math.max(3, Math.floor(colCount * 0.3));
  let shortcutsW = Math.max(3, Math.floor(colCount * 0.34));
  let metricsW = colCount - paramsW - shortcutsW;
  if (metricsW < 2) {
    metricsW = 2;
    shortcutsW = Math.max(3, Math.floor((colCount - paramsW - metricsW) / 2));
    metricsW = colCount - paramsW - shortcutsW;
  }
  const paramsStart = 0;
  const shortcutsStart = paramsStart + paramsW;
  const metricsStart = shortcutsStart + shortcutsW;

  setCell(ws, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", titleStyle);
  merge(ws, 0, 0, 0, colCount - 1);
  setCell(ws, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, subtitleStyle);
  merge(ws, 1, 0, 1, colCount - 1);
  setCell(ws, 2, 0, derived.sourceLabel, navySubStyle);
  merge(ws, 2, 0, 2, colCount - 1);

  const yieldOnCost =
    ctx.operatingIncomeM != null && ctx.totalAssetsM != null && ctx.totalAssetsM > 0
      ? `${((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)}%`
      : "—";
  const keyMetrics: Array<[string, string]> = [
    ["Equity Multiple", derived.equityMultipleDisplay || "—"],
    ["Yield on Cost", yieldOnCost],
    ["Market Cap Rate", derived.marketCapRateDisplay || "—"],
    [
      "Dev. Spread",
      yieldOnCost && derived.marketCapRateDisplay
        ? `${(parseFloat(yieldOnCost) - parseFloat(derived.marketCapRateDisplay)).toFixed(2)}%`
        : "—",
    ],
    [`Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : "—"],
    [`CapEx`, ctx.capexM != null ? `$${fmtM(Math.abs(ctx.capexM))}M` : "—"],
    ["EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : "—"],
  ];
  const shortcuts = [
    "Investment Description",
    "Investment Cash Flow",
    "Operating Cash Flow",
    "Reversion Cash Flow",
    "Returns",
  ];

  let r = 4;
  setCell(ws, r, paramsStart, "Project parameters", sectionStyle);
  merge(ws, r, paramsStart, r, paramsStart + paramsW - 1);
  setCell(ws, r, shortcutsStart, "Shortcuts to sections", sectionStyle);
  merge(ws, r, shortcutsStart, r, shortcutsStart + shortcutsW - 1);
  setCell(ws, r, metricsStart, "Key metrics", sectionStyle);
  merge(ws, r, metricsStart, r, metricsStart + metricsW - 1);
  r += 1;

  const maxBandRows = Math.max(derived.projectParams.length, shortcuts.length, keyMetrics.length);
  for (let index = 0; index < maxBandRows; index += 1) {
    const param = derived.projectParams[index];
    if (param) {
      setCell(ws, r, paramsStart, param.label, metricLabelStyle);
      setCell(
        ws,
        r,
        paramsStart + 1,
        param.value,
        param.label === "Categories in model" ? wrapBodyStyle : bodyStyle,
      );
      if (paramsW > 2) merge(ws, r, paramsStart + 1, r, paramsStart + paramsW - 1);
    }
    const shortcut = shortcuts[index];
    if (shortcut) {
      setCell(ws, r, shortcutsStart, shortcut, shortcutStyle);
      merge(ws, r, shortcutsStart, r, shortcutsStart + shortcutsW - 1);
    }
    const metric = keyMetrics[index];
    if (metric) {
      const [label, value] = metric;
      if (metricsW >= 2) {
        setCell(ws, r, metricsStart, label, metricLabelStyle);
        setCell(ws, r, metricsStart + 1, value, numStyle);
        if (metricsW > 2) merge(ws, r, metricsStart + 1, r, metricsStart + metricsW - 1);
      } else {
        setCell(ws, r, metricsStart, `${label}: ${value}`, numStyle);
      }
    }
    r += 1;
  }

  const { endRow, colCount: bandCols } = writeCategorySectionsHorizontal(ws, r, derived.categorySections, {
    headerStyle,
    bodyStyle,
    numStyle,
    sectionStyle,
  });
  const maxCols = Math.max(colCount, bandCols);

  setCell(ws, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", titleStyle);
  merge(ws, 0, 0, 0, maxCols - 1);
  setCell(ws, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, subtitleStyle);
  merge(ws, 1, 0, 1, maxCols - 1);
  setCell(ws, 2, 0, derived.sourceLabel, navySubStyle);
  merge(ws, 2, 0, 2, maxCols - 1);

  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 34 : 12 }));
  ws["!rows"] = Array.from({ length: endRow + 1 }, (_, i) => ({
    hpt: i <= 2 ? 20 : 15,
  }));

  return ws;
}

export function buildAnnualCfWorksheet(ctx: FinancialModelContext): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const titleStyle = styleCell(NAVY, { bold: true, color: WHITE, sz: 13 });
  const headerStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE });
  const sectionStyle = styleCell(BLUE_HEADER, { bold: true, color: WHITE, sz: 10 });
  const bodyStyle = styleCell(WHITE, undefined, { horizontal: "left" }, true);
  const numStyle = styleCell(WHITE, undefined, { horizontal: "right" }, true);

  const { endRow, colCount } = writeCategorySectionsHorizontal(
    ws,
    3,
    ctx.derived.categorySections,
    {
      headerStyle,
      bodyStyle,
      numStyle,
      sectionStyle,
    },
    2,
    1,
  );
  const maxCols = Math.max(12, colCount);

  setCell(ws, 0, 0, `${ctx.companyName.toUpperCase()} — ANNUAL CASH FLOW`, titleStyle);
  merge(ws, 0, 0, 0, maxCols - 1);
  setCell(ws, 1, 0, ctx.derived.sourceLabel, styleCell(NAVY, { color: WHITE, sz: 9 }));
  merge(ws, 1, 0, 1, maxCols - 1);

  ws["!cols"] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 34 : 12 }));
  ws["!rows"] = Array.from({ length: endRow + 1 }, (_, i) => ({
    hpt: i <= 1 ? 20 : 15,
  }));
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
