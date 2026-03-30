/**
 * Types for the centralized Data Source grid page.
 *
 * DataSourceRow is a flat, editable representation of key metrics
 * extracted from a Filing's FullAnalysis object.
 */

export interface DataSourceRow {
  /** Filing UUID (ticker + periodEnd composite key) */
  id: string;
  ticker: string;
  companyName: string;
  periodEnd: string;
  quarterLabel: string;
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
];

/** Payload for a single cell edit sent to PATCH /api/data-source */
export interface DataSourcePatch {
  id: string;
  field: string;
  value: number | null;
}
