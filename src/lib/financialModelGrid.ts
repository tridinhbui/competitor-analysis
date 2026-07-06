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
  /** Annual CF uses side-by-side section bands (scroll horizontally). */
  preferHorizontalScroll?: boolean;
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

function fmtCurrency(value: number | null): string {
  return value != null ? `$${fmtM(value)}M` : "";
}

function fmtPercent(value: number | null): string {
  return value != null ? `${value.toFixed(1)}%` : "";
}

function fmtRatio(value: number | null): string {
  return value != null ? `${value.toFixed(2)}x` : "";
}

function maxCategoryColumnCount(sections: FilingCategorySection[]): number {
  return Math.max(3, ...sections.map((s) => s.columnHeaders.length));
}

function sectionPanelWidth(section: FilingCategorySection): number {
  return Math.max(1, section.columnHeaders.length);
}

/** Place category tables side-by-side (2 per row) to limit vertical scroll. */
function appendCategorySectionsHorizontalBands(
  cells: Map<string, FinancialGridCell>,
  sectionRanges: FinancialSectionRange[],
  sections: FilingCategorySection[],
  startRow: number,
  panelsPerRow = 2,
  gapBetweenPanels = 0,
): { endRow: number; colCount: number } {
  let r = startRow;
  let maxColCount = 0;

  for (let bandIndex = 0; bandIndex < sections.length; bandIndex += panelsPerRow) {
    const panels = sections.slice(bandIndex, bandIndex + panelsPerRow);
    const bandStartRow = r;
    const bandColCount = panels.reduce(
      (sum, panel, index) =>
        sum + sectionPanelWidth(panel) + (index < panels.length - 1 ? gapBetweenPanels : 0),
      0,
    );
    maxColCount = Math.max(maxColCount, bandColCount);

    const bandMeta: Array<{
      sectionId?: FinancialShortcutId;
      startCol: number;
      endCol: number;
    }> = [];

    let c = 0;
    panels.forEach((panel, index) => {
      const w = sectionPanelWidth(panel);
      put(cells, r, c, panel.title, "sectionHeader", {
        colspan: w,
        sectionId: panel.sectionId as FinancialShortcutId | undefined,
        readOnly: true,
      });
      bandMeta.push({
        sectionId: panel.sectionId as FinancialShortcutId | undefined,
        startCol: c,
        endCol: c + w - 1,
      });
      c += w;
      if (index < panels.length - 1) c += gapBetweenPanels;
    });
    r += 1;

    c = 0;
    panels.forEach((panel, index) => {
      const w = sectionPanelWidth(panel);
      panel.columnHeaders.forEach((header, colIndex) => {
        put(cells, r, c + colIndex, header, "tableHeader", { readOnly: true });
      });
      c += w;
      if (index < panels.length - 1) c += gapBetweenPanels;
    });
    r += 1;

    const maxDataRows = Math.max(1, ...panels.map((panel) => panel.rows.length));
    for (let rowIndex = 0; rowIndex < maxDataRows; rowIndex += 1) {
      c = 0;
      panels.forEach((panel, index) => {
        const w = sectionPanelWidth(panel);
        const metricRow = panel.rows[rowIndex];
        if (metricRow) {
          filingMetricRowToCells(metricRow).forEach((cell, colIndex) => {
            put(cells, r, c + colIndex, cell, colIndex === 0 ? "text" : "number");
          });
        }
        c += w;
        if (index < panels.length - 1) c += gapBetweenPanels;
      });
      r += 1;
    }

    for (const meta of bandMeta) {
      if (!meta.sectionId) continue;
      sectionRanges.push({
        sectionId: meta.sectionId,
        startRow: bandStartRow,
        endRow: r - 1,
        startCol: meta.startCol,
        endCol: meta.endCol,
      });
    }
  }

  return { endRow: r, colCount: maxColCount };
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
  if (sheetKey === "underwriting") return buildUnderwritingGrid(ctx);
  if (sheetKey === "annualCf") return buildAnnualCfGrid(ctx);
  if (sheetKey === "credit") return buildCreditGrid(ctx);
  if (sheetKey === "quality") return buildQualityGrid(ctx);
  if (sheetKey === "scenario") return buildScenarioGrid(ctx);
  if (sheetKey === "boardMemo") return buildBoardMemoGrid(ctx);
  return buildReturnsGrid(ctx);
}

function splitUnderwritingTopColumns(colCount: number): {
  paramsStart: number;
  paramsW: number;
  shortcutsStart: number;
  shortcutsW: number;
  metricsStart: number;
  metricsW: number;
} {
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
  return { paramsStart, paramsW, shortcutsStart, shortcutsW, metricsStart, metricsW };
}

function appendUnderwritingTopBand(
  cells: Map<string, FinancialGridCell>,
  sectionRanges: FinancialSectionRange[],
  ctx: FinancialModelContext,
  derived: FinancialModelContext["derived"],
  colCount: number,
  startRow: number,
): number {
  const { paramsStart, paramsW, shortcutsStart, shortcutsW, metricsStart, metricsW } =
    splitUnderwritingTopColumns(colCount);

  const yieldOnCost =
    ctx.operatingIncomeM != null && ctx.totalAssetsM != null && ctx.totalAssetsM > 0
      ? `${((ctx.operatingIncomeM / ctx.totalAssetsM) * 100).toFixed(2)}%`
      : "";

  const keyMetrics: Array<[string, string]> = [
    ["Equity Multiple", derived.equityMultipleDisplay || ""],
    ["Yield on Cost", yieldOnCost],
    ["Market Cap Rate", derived.marketCapRateDisplay || ""],
    [
      "Dev. Spread",
      yieldOnCost && derived.marketCapRateDisplay
        ? `${(parseFloat(yieldOnCost) - parseFloat(derived.marketCapRateDisplay)).toFixed(2)}%`
        : "",
    ],
    [`Revenue (${ctx.latestQuarterLabel})`, ctx.revenueM != null ? `$${fmtM(ctx.revenueM)}M` : ""],
    [`CapEx`, ctx.capexM != null ? `$${fmtM(Math.abs(ctx.capexM))}M` : ""],
    ["EBITDA", ctx.ebitdaM != null ? `$${fmtM(ctx.ebitdaM)}M` : ""],
  ];

  const bandStart = startRow;
  put(cells, bandStart, paramsStart, "Project parameters", "sectionHeader", {
    colspan: paramsW,
    sectionId: "investment-description",
    readOnly: true,
  });
  put(cells, bandStart, shortcutsStart, "Shortcuts to sections", "sectionHeader", {
    colspan: shortcutsW,
    readOnly: true,
  });
  put(cells, bandStart, metricsStart, "Key metrics", "sectionHeader", {
    colspan: metricsW,
    sectionId: "returns",
    readOnly: true,
  });

  const maxRows = Math.max(
    derived.projectParams.length,
    FINANCIAL_SHORTCUTS.length,
    keyMetrics.length,
  );

  for (let index = 0; index < maxRows; index += 1) {
    const r = bandStart + 1 + index;

    const param = derived.projectParams[index];
    if (param) {
      const wraps = param.label === "Categories in model" && param.value.includes("\n");
      put(cells, r, paramsStart, param.label, "metricLabel", { readOnly: true });
      put(cells, r, paramsStart + 1, param.value, "text", {
        colspan: Math.max(1, paramsW - 1),
        wrapText: wraps,
      });
    }

    const shortcut = FINANCIAL_SHORTCUTS[index];
    if (shortcut) {
      put(cells, r, shortcutsStart, shortcut.label, "shortcutBtn", {
        colspan: shortcutsW,
        readOnly: true,
        shortcutTarget: shortcut.target,
      });
    }

    const metric = keyMetrics[index];
    if (metric) {
      const [label, value] = metric;
      if (metricsW >= 2) {
        put(cells, r, metricsStart, label, "metricLabel", { readOnly: true });
        put(cells, r, metricsStart + 1, value, "number", { colspan: metricsW - 1 });
      } else {
        put(cells, r, metricsStart, `${label}: ${value}`, "number", { colspan: metricsW });
      }
    }
  }

  const bandEnd = bandStart + maxRows;
  sectionRanges.push({
    sectionId: "investment-description",
    startRow: bandStart,
    endRow: bandEnd,
    startCol: paramsStart,
    endCol: paramsStart + paramsW - 1,
  });
  sectionRanges.push({
    sectionId: "returns",
    startRow: bandStart,
    endRow: bandEnd,
    startCol: metricsStart,
    endCol: metricsStart + metricsW - 1,
  });

  return bandEnd + 1;
}

function buildUnderwritingGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const { derived } = ctx;
  const topColCount = (() => {
    const { paramsW, shortcutsW, metricsW } = splitUnderwritingTopColumns(10);
    return paramsW + shortcutsW + metricsW;
  })();
  const dataColCount = maxCategoryColumnCount(derived.categorySections);
  const colCount = Math.max(topColCount, dataColCount, 10);
  const colWidths = Array.from({ length: colCount }, (_, i) =>
    i === 0 ? 168 : i < 3 ? 88 : 96,
  );
  const sectionRanges: FinancialSectionRange[] = [];
  const fullSpan = colCount;

  put(cells, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", "navyTitle", { colspan: fullSpan, readOnly: true });
  put(cells, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, "navyTitle", { colspan: fullSpan, readOnly: true });
  put(cells, 2, 0, derived.sourceLabel, "navySub", { colspan: fullSpan, readOnly: true, wrapText: true });

  const dataStartRow = appendUnderwritingTopBand(cells, sectionRanges, ctx, derived, colCount, 4);

  const { endRow, colCount: bandColCount } = appendCategorySectionsHorizontalBands(
    cells,
    sectionRanges,
    derived.categorySections,
    dataStartRow,
    2,
  );
  const resolvedColCount = Math.max(colCount, bandColCount);
  const rowCount = Math.max(28, endRow + 2);

  put(cells, 0, 0, "FILING FINANCIAL EXTRACT — UNDERWRITING", "navyTitle", {
    colspan: resolvedColCount,
    readOnly: true,
  });
  put(cells, 1, 0, `${ctx.companyName.toUpperCase()} — ${ctx.ticker}`, "navyTitle", {
    colspan: resolvedColCount,
    readOnly: true,
  });
  put(cells, 2, 0, derived.sourceLabel, "navySub", { colspan: resolvedColCount, readOnly: true, wrapText: true });

  return {
    sheetKey: "underwriting",
    rowCount,
    colCount: resolvedColCount,
    colWidths: Array.from({ length: resolvedColCount }, (_, i) =>
      i === 0 ? 168 : i < 3 ? 88 : 96,
    ),
    cells,
    sectionRanges,
    preferHorizontalScroll: true,
  };
}

function buildAnnualCfGrid(ctx: FinancialModelContext): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const { derived } = ctx;
  const sectionRanges: FinancialSectionRange[] = [];

  const shortcutTargets = FINANCIAL_SHORTCUTS.filter((s) => s.target.sheet === "annualCf");
  const shortcutGap = 1;
  let shortcutCol = 0;
  for (const shortcut of shortcutTargets) {
    put(cells, 2, shortcutCol, shortcut.label, "shortcutBtn", {
      colspan: 2,
      readOnly: true,
      shortcutTarget: shortcut.target,
    });
    shortcutCol += 2 + shortcutGap;
  }

  const { endRow, colCount } = appendCategorySectionsHorizontalBands(
    cells,
    sectionRanges,
    derived.categorySections,
    3,
    2,
    1,
  );
  const resolvedColCount = Math.max(12, colCount);
  const colWidths = Array.from({ length: resolvedColCount }, (_, i) =>
    i === 0 ? 200 : 92,
  );
  const rowCount = Math.max(18, endRow + 1);

  put(cells, 0, 0, `${ctx.companyName.toUpperCase()} — ANNUAL CASH FLOW`, "navyTitle", {
    colspan: resolvedColCount,
    readOnly: true,
  });
  put(cells, 1, 0, derived.sourceLabel, "navySub", { colspan: resolvedColCount, readOnly: true });

  return {
    sheetKey: "annualCf",
    rowCount,
    colCount: resolvedColCount,
    colWidths,
    cells,
    sectionRanges,
    preferHorizontalScroll: true,
  };
}

function buildAnalystScheduleGrid(
  sheetKey: FinancialModelSheetKey,
  title: string,
  ctx: FinancialModelContext,
  sections: Array<{
    title: string;
    rows: Array<[string, string, string]>;
  }>,
): FinancialGridModel {
  const cells = new Map<string, FinancialGridCell>();
  const sectionRanges: FinancialSectionRange[] = [];
  const colCount = 6;
  let r = 0;

  put(cells, r, 0, `${ctx.companyName.toUpperCase()} — ${title}`, "navyTitle", {
    colspan: colCount,
    readOnly: true,
  });
  r += 1;
  put(cells, r, 0, ctx.subtitle, "navySub", { colspan: colCount, readOnly: true, wrapText: true });
  r += 2;

  for (const section of sections) {
    put(cells, r, 0, section.title, "sectionHeader", { colspan: colCount, readOnly: true });
    r += 1;
    put(cells, r, 0, "Metric", "tableHeader", { readOnly: true });
    put(cells, r, 1, "Value", "tableHeader", { readOnly: true });
    put(cells, r, 2, "Analyst read-through", "tableHeader", { colspan: 4, readOnly: true });
    r += 1;

    for (const [label, value, readThrough] of section.rows) {
      put(cells, r, 0, label, "metricLabel", { readOnly: true });
      put(cells, r, 1, value, "number");
      put(cells, r, 2, readThrough, "text", { colspan: 4, wrapText: true });
      r += 1;
    }
    r += 1;
  }

  return {
    sheetKey,
    rowCount: Math.max(24, r + 2),
    colCount,
    colWidths: [190, 120, 160, 160, 160, 160],
    cells,
    sectionRanges,
    preferHorizontalScroll: false,
  };
}

function buildCreditGrid(ctx: FinancialModelContext): FinancialGridModel {
  return buildAnalystScheduleGrid("credit", "CREDIT & LIQUIDITY MODEL", ctx, [
    {
      title: "Liquidity",
      rows: [
        ["Cash & equivalents", fmtCurrency(ctx.cashM), "Immediate liquidity buffer before working-capital needs."],
        ["Short-term investments", fmtCurrency(ctx.shortTermInvestmentsM), "Near-cash liquidity that can supplement cash coverage."],
        ["Current ratio", fmtRatio(ctx.currentRatio), "Short-term asset coverage versus current liabilities."],
        ["Working capital", fmtCurrency(ctx.workingCapitalM), "Operating liquidity available after current obligations."],
        ["Working capital / revenue", fmtPercent(ctx.workingCapitalRatioPct), "Scale of working capital relative to sales."],
        ["Deferred revenue", fmtCurrency(ctx.deferredRevenueM), "Customer funding / future revenue obligation embedded in current liabilities."],
        ["Accrued liabilities", fmtCurrency(ctx.accruedLiabilitiesM), "Near-term obligations that may pressure cash conversion."],
      ],
    },
    {
      title: "Leverage",
      rows: [
        ["Total debt", fmtCurrency(ctx.totalDebtM), "Gross debt load before cash offsets."],
        ["Net debt", fmtCurrency(ctx.netDebtM), "Debt after cash; primary balance-sheet risk metric."],
        ["Operating lease liabilities", fmtCurrency(ctx.operatingLeaseLiabilitiesM), "Off-balance-sheet-like operating obligation now capitalized for credit review."],
        ["Finance lease liabilities", fmtCurrency(ctx.financeLeaseLiabilitiesM), "Lease debt component with debt-like repayment burden."],
        ["Lease-adjusted debt", fmtCurrency(ctx.leaseAdjustedDebtM), "Debt plus lease obligations for fuller creditor view."],
        ["Debt / capital", fmtPercent(ctx.debtToCapitalPct), "Capital structure leverage mix."],
        ["Net debt / EBITDA", fmtRatio(ctx.netDebtToEbitda), "Debt paydown burden versus recurring earnings power."],
        ["Lease-adjusted net debt / EBITDA", fmtRatio(ctx.leaseAdjustedNetDebtToEbitda), "Credit risk after operating lease obligations."],
        ["Interest coverage", fmtRatio(ctx.interestCoverage), "Ability to cover interest from operating earnings."],
      ],
    },
  ]);
}

function buildQualityGrid(ctx: FinancialModelContext): FinancialGridModel {
  return buildAnalystScheduleGrid("quality", "QUALITY OF EARNINGS MODEL", ctx, [
    {
      title: "Earnings quality",
      rows: [
        ["Revenue", fmtCurrency(ctx.revenueM), "Top-line base for margin and conversion analysis."],
        ["EBITDA", fmtCurrency(ctx.ebitdaM), "Operating earnings proxy before D&A and capital intensity."],
        ["EBITDA margin", fmtPercent(ctx.ebitdaMarginPct), "Profitability quality after operating cost structure."],
        ["Net margin", fmtPercent(ctx.netMarginPct), "Bottom-line capture after interest and tax."],
      ],
    },
    {
      title: "Cash conversion",
      rows: [
        ["Operating cash flow", fmtCurrency(ctx.operatingCashFlowM), "Cash generated by operations."],
        ["Capital expenditures", fmtCurrency(ctx.capexM != null ? Math.abs(ctx.capexM) : null), "Reinvestment requirement to sustain operations."],
        ["Free cash flow", fmtCurrency(ctx.freeCashFlowM), "Cash available after reinvestment."],
        ["FCF conversion", fmtPercent(ctx.fcfConversionPct), "Free cash flow as a percentage of net income."],
        ["CapEx / revenue", fmtPercent(ctx.capexAsPercentRevenuePct), "Capital intensity required to support the revenue base."],
        ["Effective tax rate", fmtPercent(ctx.effectiveTaxRatePct), "Tax drag on pretax earnings and NOPAT quality."],
        ["Dividends paid", fmtCurrency(ctx.dividendsPaidM), "Recurring capital return to shareholders."],
        ["Share repurchases", fmtCurrency(ctx.shareRepurchasesM), "Discretionary capital return and EPS support."],
        ["Total payout ratio", fmtPercent(ctx.totalPayoutRatioPct), "Dividends plus buybacks relative to earnings power."],
      ],
    },
  ]);
}

function buildReturnsGrid(ctx: FinancialModelContext): FinancialGridModel {
  return buildAnalystScheduleGrid("returns", "RETURNS & EFFICIENCY MODEL", ctx, [
    {
      title: "Returns",
      rows: [
        ["ROIC", fmtPercent(ctx.roicPct), "Best proxy for economic value creation versus invested capital."],
        ["ROE", fmtPercent(ctx.roePct), "Equity return, influenced by leverage and margins."],
        ["ROA", fmtPercent(ctx.roaPct), "Asset productivity after all expenses."],
      ],
    },
    {
      title: "Efficiency",
      rows: [
        ["Asset turnover", fmtRatio(ctx.assetTurnover), "Revenue generated per dollar of assets."],
        ["Inventory turns", fmtRatio(ctx.inventoryTurnover), "Inventory velocity and operating efficiency."],
        ["A/R turns", fmtRatio(ctx.receivablesTurnover), "Collection speed and customer credit discipline."],
        ["DSO", ctx.daysSalesOutstanding != null ? `${ctx.daysSalesOutstanding.toFixed(1)} days` : "", "Receivable collection speed in days."],
        ["DIO", ctx.daysInventoryOutstanding != null ? `${ctx.daysInventoryOutstanding.toFixed(1)} days` : "", "Inventory cash tied up in days."],
        ["DPO", ctx.daysPayableOutstanding != null ? `${ctx.daysPayableOutstanding.toFixed(1)} days` : "", "Supplier financing / payable timing in days."],
        ["Cash conversion cycle", ctx.cashConversionCycle != null ? `${ctx.cashConversionCycle.toFixed(1)} days` : "", "Net working-capital days required to convert spend into cash."],
        ["Gross margin", fmtPercent(ctx.grossMarginPct), "Pricing power and production efficiency."],
        ["Operating margin", fmtPercent(ctx.operatingMarginPct), "Core operating leverage after overhead."],
      ],
    },
  ]);
}

function buildScenarioGrid(ctx: FinancialModelContext): FinancialGridModel {
  return buildAnalystScheduleGrid("scenario", "SCENARIO & SENSITIVITY MODEL", ctx, [
    {
      title: "Revenue and EBITDA cases",
      rows: [
        ["Base revenue", fmtCurrency(ctx.revenueM), "Latest extracted revenue baseline used as the operating case anchor."],
        [
          "Downside revenue (-5%)",
          fmtCurrency(ctx.revenueM != null ? ctx.revenueM * 0.95 : null),
          "Stress case for softer demand, price compression, or delayed customer orders.",
        ],
        [
          "Upside revenue (+5%)",
          fmtCurrency(ctx.revenueM != null ? ctx.revenueM * 1.05 : null),
          "Upside case for volume recovery, price realization, or share gain.",
        ],
        ["Base EBITDA", fmtCurrency(ctx.ebitdaM), "Current EBITDA baseline before sensitivity adjustments."],
        [
          "Downside EBITDA (-10%)",
          fmtCurrency(ctx.ebitdaM != null ? ctx.ebitdaM * 0.9 : null),
          "Stress case for operating deleverage or gross margin pressure.",
        ],
        [
          "Upside EBITDA (+10%)",
          fmtCurrency(ctx.ebitdaM != null ? ctx.ebitdaM * 1.1 : null),
          "Upside case for operating leverage and SG&A absorption.",
        ],
      ],
    },
    {
      title: "Cash and credit sensitivity",
      rows: [
        ["Base free cash flow", fmtCurrency(ctx.freeCashFlowM), "Extracted free cash flow baseline after capital expenditures."],
        [
          "Downside FCF (-15%)",
          fmtCurrency(ctx.freeCashFlowM != null ? ctx.freeCashFlowM * 0.85 : null),
          "Stress case for lower cash conversion, higher working capital, or higher capex.",
        ],
        [
          "Upside FCF (+15%)",
          fmtCurrency(ctx.freeCashFlowM != null ? ctx.freeCashFlowM * 1.15 : null),
          "Upside case for stronger collections, lower capex, or margin flow-through.",
        ],
        ["Net debt / EBITDA", fmtRatio(ctx.netDebtToEbitda), "Baseline balance-sheet pressure versus earnings power."],
        ["Lease-adjusted net debt / EBITDA", fmtRatio(ctx.leaseAdjustedNetDebtToEbitda), "Stress view after lease obligations."],
        [
          "Stress net debt / EBITDA",
          ctx.netDebtM != null && ctx.ebitdaM != null && ctx.ebitdaM !== 0
            ? fmtRatio(ctx.netDebtM / (ctx.ebitdaM * 0.9))
            : "",
          "Leverage if EBITDA falls 10% while net debt remains unchanged.",
        ],
        ["Interest coverage", fmtRatio(ctx.interestCoverage), "Ability to absorb rate pressure or earnings volatility."],
        ["Cash conversion cycle", ctx.cashConversionCycle != null ? `${ctx.cashConversionCycle.toFixed(1)} days` : "", "Working-capital sensitivity that can absorb or release cash."],
      ],
    },
  ]);
}

function buildBoardMemoGrid(ctx: FinancialModelContext): FinancialGridModel {
  return buildAnalystScheduleGrid("boardMemo", "BOARD MEMO & INVESTOR Q&A", ctx, [
    {
      title: "Board memo bullets",
      rows: [
        ["Scale", fmtCurrency(ctx.revenueM), "Frame the size of the business and whether the quarter changes the growth narrative."],
        ["Profitability", fmtPercent(ctx.ebitdaMarginPct), "Explain whether margin performance reflects structural improvement or temporary mix/cost effects."],
        ["Cash generation", fmtPercent(ctx.fcfConversionPct), "Assess whether reported earnings are backed by free cash flow."],
        ["Balance-sheet risk", fmtRatio(ctx.netDebtToEbitda), "Summarize leverage risk, lender sensitivity, and capacity for buybacks or M&A."],
        ["Lease-adjusted leverage", fmtRatio(ctx.leaseAdjustedNetDebtToEbitda), "Address creditor view after lease obligations."],
        ["Capital efficiency", fmtPercent(ctx.roicPct), "Evaluate whether incremental capital is creating value above the cost of capital."],
        ["Cash cycle", ctx.cashConversionCycle != null ? `${ctx.cashConversionCycle.toFixed(1)} days` : "", "Explain whether growth is consuming or releasing working capital."],
      ],
    },
    {
      title: "Investor Q&A prompts",
      rows: [
        ["Growth bridge", fmtCurrency(ctx.revenueM), "What portion of growth came from price, volume, mix, acquisitions, and FX?"],
        ["Margin bridge", fmtPercent(ctx.operatingMarginPct), "Which cost lines drove margin change, and how much is sustainable next quarter?"],
        ["Cash bridge", fmtCurrency(ctx.operatingCashFlowM), "What working-capital items explain the gap between earnings and cash flow?"],
        ["Capex intensity", fmtCurrency(ctx.capexM != null ? Math.abs(ctx.capexM) : null), "Is capex maintenance, growth, compliance, or capacity expansion?"],
        ["Capital allocation", fmtCurrency(ctx.dividendsPaidM), "How should management rank dividends, repurchases, debt reduction, and M&A?"],
        ["Share count", ctx.weightedAverageSharesDilutedM != null ? `${ctx.weightedAverageSharesDilutedM.toFixed(1)}M` : "", "How much do buybacks offset dilution or support EPS?"],
      ],
    },
  ]);
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
