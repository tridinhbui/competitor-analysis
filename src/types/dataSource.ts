/**
 * Types for the centralized Data Source grid page.
 *
 * DataSourceRow is a flat, editable representation of key metrics
 * extracted from a Filing's FullAnalysis object.
 */

export interface DataSourceRow {
  /** Filing UUID (ticker + periodEnd composite key) */
  id: string;
  workflowOrigin: "analyze" | "competitor";
  ticker: string;
  companyName: string;
  periodEnd: string;
  quarterLabel: string;
  /** When the filing was saved (ISO timestamp). TTM rows borrow latest quarter's value. */
  savedAt?: string | null;
  // -- Income / P&L --
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  // -- Balance Sheet --
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  cashAndEquivalents: number | null;
  // -- Cash Flow --
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  // -- Margins --
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  // -- Ratios --
  debtToEquity: number | null;
  currentRatio: number | null;
  // -- Other --
  sgaExpense: number | null;
  depreciation: number | null;
  ebit: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  interestExpense: number | null;
  epsBasic: number | null;
  epsDiluted: number | null;
  shareBasedComp: number | null;
  dividendsPaid: number | null;
  roe: number | null;
  roa: number | null;
  fcfMargin: number | null;
  // -- Volume & Per-Unit Metrics (for pork/packaged comparison) --
  /** Heads processed / slaughtered (thousands) — for pork segments */
  volumeHeads: number | null;
  /** Volume in millions of lbs — for packaged meats segments */
  volumeLbs: number | null;
  /** Volume in hundredweight (cwt = lbs/100), millions — for packaged meats */
  volumeCwt: number | null;
  /** Operating Income per head ($) = operatingIncome × 1000 / volumeHeads */
  opPerHead: number | null;
  /** Operating Income per cwt ($/cwt) = operatingIncome / volumeCwt */
  opPerCwt: number | null;
  // -- Non-GAAP Adjustments --
  /** Employee Retention Credit favorability (back out for comparability) */
  ercAdjustment: number | null;
  /** Legal / antitrust charge exclusion (e.g. Tyson antitrust) */
  legalChargeAdjustment: number | null;
  /** Intercompany transfer value adjustment (SFD hog production → packaged meats) */
  transferValueAdjustment: number | null;
  /** Corporate allocation adjustment (e.g. TSN corporate overhead reallocation) */
  corporateAllocationAdjustment: number | null;
  /** Adjusted operating income (after removing non-comparable items) */
  adjustedOperatingIncome: number | null;
  /** Adjusted operating margin */
  adjustedOperatingMargin: number | null;
  /** Adjusted OP per head (using adjustedOperatingIncome) */
  adjustedOpPerHead: number | null;
  /** Adjusted OP per cwt (using adjustedOperatingIncome) */
  adjustedOpPerCwt: number | null;
  /** SG&A as % of revenue */
  sgaAsPercent: number | null;
  /** Optional per-metric provenance used by the workbook detail drawer. */
  _metricTrace?: Record<string, DataSourceMetricTrace>;
}

export interface DataSourceMetricTrace {
  label: string;
  value: number | string | null;
  source: string;
  confidence: "high" | "medium" | "low";
  statement: string;
  originalText: string;
  normalizedCalculation: string;
}

/** The list of metric columns displayed in the grid, in order. */
export interface MetricColumn {
  key: keyof DataSourceRow;
  label: string;
  format: "currency" | "percent" | "ratio" | "number";
}

export const METRIC_COLUMNS: MetricColumn[] = [
  { key: "revenue", label: "Revenue", format: "currency" },
  { key: "grossProfit", label: "Gross Profit", format: "currency" },
  { key: "operatingIncome", label: "Operating Income", format: "currency" },
  { key: "netIncome", label: "Net Income", format: "currency" },
  { key: "totalAssets", label: "Total Assets", format: "currency" },
  { key: "totalLiabilities", label: "Total Liabilities", format: "currency" },
  { key: "totalEquity", label: "Total Equity", format: "currency" },
  { key: "totalDebt", label: "Total Debt", format: "currency" },
  { key: "cashAndEquivalents", label: "Cash & Equiv.", format: "currency" },
  { key: "operatingCashFlow", label: "Operating CF", format: "currency" },
  { key: "capex", label: "CapEx", format: "currency" },
  { key: "freeCashFlow", label: "Free Cash Flow", format: "currency" },
  { key: "grossMargin", label: "Gross Margin", format: "percent" },
  { key: "operatingMargin", label: "Operating Margin", format: "percent" },
  { key: "netMargin", label: "Net Margin", format: "percent" },
  { key: "debtToEquity", label: "Debt / Equity", format: "ratio" },
  { key: "currentRatio", label: "Current Ratio", format: "ratio" },
  { key: "sgaExpense", label: "SG&A", format: "currency" },
  { key: "depreciation", label: "Depreciation", format: "currency" },
  { key: "ebit", label: "EBIT", format: "currency" },
  { key: "ebitda", label: "EBITDA", format: "currency" },
  { key: "ebitdaMargin", label: "EBITDA Margin", format: "percent" },
  { key: "interestExpense", label: "Interest Exp.", format: "currency" },
  { key: "epsBasic", label: "EPS (Basic)", format: "ratio" },
  { key: "epsDiluted", label: "EPS (Diluted)", format: "ratio" },
  { key: "shareBasedComp", label: "SBC", format: "currency" },
  { key: "dividendsPaid", label: "Dividends Paid", format: "currency" },
  { key: "roe", label: "ROE", format: "percent" },
  { key: "roa", label: "ROA", format: "percent" },
  { key: "fcfMargin", label: "FCF Margin", format: "percent" },
  // Volume & per-unit
  { key: "volumeHeads", label: "Volume (000 Hd)", format: "number" },
  { key: "volumeLbs", label: "Volume (M lbs)", format: "number" },
  { key: "volumeCwt", label: "Volume (M cwt)", format: "number" },
  { key: "opPerHead", label: "OP / Head ($)", format: "ratio" },
  { key: "opPerCwt", label: "OP / cwt ($)", format: "ratio" },
  // Adjustments
  { key: "ercAdjustment", label: "ERC Adjustment", format: "currency" },
  { key: "legalChargeAdjustment", label: "Legal Charges Excl.", format: "currency" },
  { key: "transferValueAdjustment", label: "Transfer Value Adj.", format: "currency" },
  { key: "corporateAllocationAdjustment", label: "Corp. Alloc. Adj.", format: "currency" },
  { key: "adjustedOperatingIncome", label: "Adj. OP Income", format: "currency" },
  { key: "adjustedOperatingMargin", label: "Adj. OP Margin", format: "percent" },
  { key: "adjustedOpPerHead", label: "Adj. OP/Head ($)", format: "ratio" },
  { key: "adjustedOpPerCwt", label: "Adj. OP/cwt ($)", format: "ratio" },
  { key: "sgaAsPercent", label: "SG&A %", format: "percent" },
];

/** Payload for a single cell edit sent to PATCH /api/data-source */
export interface DataSourcePatch {
  id: string;
  field: string;
  value: number | null;
}
