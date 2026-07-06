import type { DataSourceRow } from "@/types/dataSource";
import { METRIC_COLUMNS, type MetricColumn } from "@/types/dataSource";

export type FilingMetricUnit = "currency" | "percent" | "ratio" | "number";

export interface FilingMetricRow {
  label: string;
  sourceField?: keyof DataSourceRow;
  unit: FilingMetricUnit;
  values: Array<number | null>;
}

export interface FilingCategorySection {
  title: string;
  sectionId?: string;
  /** e.g. ["Line item", "Unit", "TTM", "Q2 FY25", …] — only periods with data in this section */
  columnHeaders: string[];
  rows: FilingMetricRow[];
}

export interface DerivedProjectParams {
  label: string;
  value: string;
}

export interface FilingDerivedFinancialModel {
  sourceLabel: string;
  projectParams: DerivedProjectParams[];
  /** One table per filing category; columns differ based on what was extracted. */
  categorySections: FilingCategorySection[];
  equityMultipleDisplay: string;
  marketCapRateDisplay: string;
}

/** @deprecated Use categorySections */
export interface UsesOfFundsLine {
  label: string;
  sourceField?: keyof DataSourceRow;
  section?: boolean;
}

/** @deprecated Use categorySections */
export interface UsesOfFundsBlock {
  lines: Array<{ label: string; section?: boolean }>;
}

/** @deprecated Use categorySections */
export interface AnnualCfLine {
  label: string;
  section?: boolean;
  sectionId?: string;
  total?: boolean;
}

type PeriodColumn = {
  label: string;
  row: DataSourceRow;
};

const FIELD_CATEGORIES: Array<{
  title: string;
  sectionId?: string;
  fields: Array<keyof DataSourceRow>;
}> = [
  {
    title: "Revenue & profitability",
    sectionId: "operating-cash-flow",
    fields: [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "grossMargin",
      "operatingExpenses",
      "rdExpense",
      "operatingIncome",
      "operatingMargin",
      "ebitda",
      "ebitdaMargin",
      "netIncome",
      "netMargin",
      "incomeTax",
      "ebit",
      "epsBasic",
      "epsDiluted",
    ],
  },
  {
    title: "Cost structure & operating leverage",
    fields: [
      "sgaExpense",
      "sgaAsPercent",
      "depreciation",
      "interestExpense",
      "shareBasedComp",
      "weightedAverageSharesBasic",
      "weightedAverageSharesDiluted",
    ],
  },
  {
    title: "Cash generation & capital deployment",
    sectionId: "investment-cash-flow",
    fields: [
      "operatingCashFlow",
      "capex",
      "freeCashFlow",
      "fcfMargin",
      "fcfConversion",
      "dividendsPaid",
      "shareRepurchases",
      "investingCashFlow",
      "financingCashFlow",
      "debtIssued",
      "debtRepaid",
    ],
  },
  {
    title: "Balance sheet & liquidity",
    sectionId: "reversion-cash-flow",
    fields: [
      "totalAssets",
      "totalLiabilities",
      "totalEquity",
      "totalDebt",
      "shortTermDebt",
      "longTermDebt",
      "netDebt",
      "cashAndEquivalents",
      "shortTermInvestments",
      "currentAssets",
      "currentLiabilities",
      "workingCapital",
      "workingCapitalRatio",
      "inventory",
      "accountsReceivable",
      "accountsPayable",
      "accruedLiabilities",
      "deferredRevenue",
      "propertyPlantEquipment",
      "goodwill",
      "intangibleAssets",
      "operatingLeaseLiabilities",
      "financeLeaseLiabilities",
      "leaseAdjustedDebt",
      "leaseAdjustedNetDebt",
      "debtToEquity",
      "debtToCapital",
      "netDebtToEbitda",
      "leaseAdjustedDebtToEbitda",
      "leaseAdjustedNetDebtToEbitda",
      "interestCoverage",
      "currentRatio",
    ],
  },
  {
    title: "Returns & efficiency",
    fields: [
      "roe",
      "roa",
      "roic",
      "assetTurnover",
      "inventoryTurnover",
      "receivablesTurnover",
      "daysSalesOutstanding",
      "daysInventoryOutstanding",
      "daysPayableOutstanding",
      "cashConversionCycle",
      "effectiveTaxRate",
      "capexAsPercentRevenue",
      "dividendPayoutRatio",
      "buybackPayoutRatio",
      "totalPayoutRatio",
    ],
  },
  {
    title: "Segment volume & adjustments",
    fields: [
      "volumeHeads",
      "volumeLbs",
      "volumeCwt",
      "opPerHead",
      "opPerCwt",
      "ercAdjustment",
      "legalChargeAdjustment",
      "transferValueAdjustment",
      "corporateAllocationAdjustment",
      "adjustedOperatingIncome",
      "adjustedOperatingMargin",
      "adjustedOpPerHead",
      "adjustedOpPerCwt",
      "sgaAsPercent",
    ],
  },
];

const METRIC_LABEL_BY_KEY = new Map<keyof DataSourceRow, string>(
  METRIC_COLUMNS.map((col) => [col.key, col.label]),
);

const METRIC_FORMAT_BY_KEY = new Map<keyof DataSourceRow, MetricColumn["format"]>(
  METRIC_COLUMNS.map((col) => [col.key, col.format]),
);

const SKIP_ROW_KEYS = new Set<keyof DataSourceRow>([
  "id",
  "workflowOrigin",
  "ticker",
  "companyName",
  "periodEnd",
  "quarterLabel",
  "savedAt",
]);

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtM(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return round1(n).toFixed(1);
}

function getRowNumber(row: DataSourceRow, field: keyof DataSourceRow): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricLabel(field: keyof DataSourceRow): string {
  return METRIC_LABEL_BY_KEY.get(field) ?? String(field);
}

export function unitForField(field: keyof DataSourceRow): FilingMetricUnit {
  const format = METRIC_FORMAT_BY_KEY.get(field);
  if (format === "percent") return "percent";
  if (format === "ratio") return "ratio";
  if (format === "number") return "number";
  return "currency";
}

export function formatValueWithUnit(unit: FilingMetricUnit, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (unit === "percent") return `${round2(value)}%`;
  if (unit === "ratio") return round2(value).toString();
  if (unit === "number") return round2(value).toString();
  return `$${fmtM(value)}M`;
}

export function formatMetricDisplay(field: keyof DataSourceRow, value: number | null): string {
  return formatValueWithUnit(unitForField(field), value);
}

function formatSectionTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatCategoriesList(titles: string[]): string {
  if (titles.length === 0) return "—";
  return titles.map((title) => formatSectionTitle(title)).join("\n");
}

function formatPeriodEnd(periodEnd: string): string {
  if (!periodEnd || periodEnd === "TTM") return "TTM";
  const d = new Date(periodEnd);
  if (Number.isNaN(d.getTime())) return periodEnd;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(",", "");
}

function pickLatestQuarter(rows: DataSourceRow[]): DataSourceRow | undefined {
  const quarters = rows.filter((r) => r.periodEnd !== "TTM");
  if (quarters.length === 0) return rows[0];
  return [...quarters].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
}

function orderedPeriodRows(rows: DataSourceRow[]): DataSourceRow[] {
  const ttm = rows.find((r) => r.periodEnd === "TTM");
  const quarters = rows
    .filter((r) => r.periodEnd !== "TTM")
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  return [...(ttm ? [ttm] : []), ...quarters];
}

function normalizeExtractedValue(field: keyof DataSourceRow, value: number | null): number | null {
  if (value == null) return null;
  if (field === "capex" || field === "dividendsPaid") return round1(Math.abs(value));
  const format = METRIC_FORMAT_BY_KEY.get(field);
  if (format === "percent" || format === "ratio" || format === "number") return round2(value);
  return round1(value);
}

export function valueFromRow(row: DataSourceRow, field: keyof DataSourceRow): number | null {
  return normalizeExtractedValue(field, getRowNumber(row, field));
}

export function metricLabelForField(field: keyof DataSourceRow): string {
  return metricLabel(field);
}

function fieldHasAnyValue(rows: DataSourceRow[], field: keyof DataSourceRow): boolean {
  return rows.some((row) => valueFromRow(row, field) != null);
}

function periodsForFields(rows: DataSourceRow[], fields: Array<keyof DataSourceRow>): PeriodColumn[] {
  const cols: PeriodColumn[] = [];
  for (const row of orderedPeriodRows(rows)) {
    const label =
      row.periodEnd === "TTM" ? "TTM" : row.quarterLabel?.trim() || formatPeriodEnd(row.periodEnd);
    const hasData = fields.some((field) => valueFromRow(row, field) != null);
    if (hasData) cols.push({ label, row });
  }
  return cols;
}

function discoverUncategorizedFields(rows: DataSourceRow[]): Array<keyof DataSourceRow> {
  const categorized = new Set(FIELD_CATEGORIES.flatMap((c) => c.fields));
  return METRIC_COLUMNS.map((col) => col.key).filter(
    (field) => !SKIP_ROW_KEYS.has(field) && !categorized.has(field) && fieldHasAnyValue(rows, field),
  );
}

export function buildCategorySections(rows: DataSourceRow[]): FilingCategorySection[] {
  const sections: FilingCategorySection[] = [];
  const usedFields = new Set<keyof DataSourceRow>();

  for (const category of FIELD_CATEGORIES) {
    const fields = category.fields.filter((field) => fieldHasAnyValue(rows, field));
    fields.forEach((f) => usedFields.add(f));
    if (fields.length === 0) continue;

    const periodCols = periodsForFields(rows, fields);
    if (periodCols.length === 0) continue;

    const columnHeaders = ["Line item", ...periodCols.map((p) => p.label)];
    const metricRows: FilingMetricRow[] = fields.map((field) => ({
      label: metricLabel(field),
      sourceField: field,
      unit: unitForField(field),
      values: periodCols.map((p) => valueFromRow(p.row, field)),
    }));

    sections.push({
      title: category.title.toUpperCase(),
      sectionId: category.sectionId,
      columnHeaders,
      rows: metricRows,
    });
  }

  const extra = discoverUncategorizedFields(rows).filter((f) => !usedFields.has(f));
  if (extra.length > 0) {
    const periodCols = periodsForFields(rows, extra);
    if (periodCols.length > 0) {
      sections.push({
        title: "Additional metrics",
        columnHeaders: ["Line item", ...periodCols.map((p) => p.label)],
        rows: extra.map((field) => ({
          label: metricLabel(field),
          sourceField: field,
          unit: unitForField(field),
          values: periodCols.map((p) => valueFromRow(p.row, field)),
        })),
      });
    }
  }

  if (sections.length === 0) {
    sections.push({
      title: "NO METRICS EXTRACTED YET",
      columnHeaders: ["Line item"],
      rows: [
        {
          label: "Analyze a 10-Q PDF to populate this workbook",
          unit: "currency",
          values: [],
        },
      ],
    });
  }

  return sections;
}

/** Build financial model from PDF-extracted workbook rows; columns adapt per category. */
export function deriveFinancialModelFromRows(
  rows: DataSourceRow[],
  company: { ticker: string; companyName: string } | null,
  options?: {
    categorySections?: FilingCategorySection[];
    boardHeadline?: string;
  },
): FilingDerivedFinancialModel {
  const latest = pickLatestQuarter(rows);
  const latestLabel = latest?.quarterLabel ?? (latest ? formatPeriodEnd(latest.periodEnd) : "—");
  const ticker = company?.ticker ?? latest?.ticker ?? "—";
  const categorySections =
    options?.categorySections && options.categorySections.length > 0
      ? options.categorySections
      : buildCategorySections(rows);

  const headline = options?.boardHeadline?.trim();
  const sourceLabel = headline
    ? `${ticker} — ${latestLabel}: ${headline}`
    : latest?.quarterLabel
      ? `${ticker} — ${latest.quarterLabel}: AI-grouped financial board from filing extract`
      : "AI-grouped financial board from filing extract";

  return {
    sourceLabel,
    projectParams: [
      { label: "Company", value: company?.companyName ?? latest?.companyName ?? "—" },
      { label: "Ticker", value: ticker },
      { label: "Latest filing quarter", value: latestLabel },
      { label: "Period end", value: latest ? formatPeriodEnd(latest.periodEnd) : "—" },
      {
        label: "Categories in model",
        value: formatCategoriesList(categorySections.map((s) => s.title)),
      },
    ],
    categorySections,
    equityMultipleDisplay: "",
    marketCapRateDisplay: "",
  };
}

export function filingMetricRowToCells(row: FilingMetricRow): string[] {
  return [
    row.label,
    ...row.values.map((v) =>
      row.sourceField ? formatMetricDisplay(row.sourceField, v) : formatValueWithUnit(row.unit, v),
    ),
  ];
}

/** @deprecated Use filingMetricRowToCells */
export function usesLineToCells(line: { label: string }): string[] {
  return [line.label];
}
