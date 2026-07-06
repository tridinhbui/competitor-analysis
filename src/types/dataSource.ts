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
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  rdExpense: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  incomeTax: number | null;
  // -- Balance Sheet --
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  netDebt: number | null;
  cashAndEquivalents: number | null;
  shortTermInvestments: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  workingCapital: number | null;
  inventory: number | null;
  accountsReceivable: number | null;
  accountsPayable: number | null;
  accruedLiabilities: number | null;
  deferredRevenue: number | null;
  propertyPlantEquipment: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  operatingLeaseLiabilities: number | null;
  financeLeaseLiabilities: number | null;
  leaseAdjustedDebt: number | null;
  leaseAdjustedNetDebt: number | null;
  // -- Cash Flow --
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  shareRepurchases: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  debtIssued: number | null;
  debtRepaid: number | null;
  // -- Margins --
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  // -- Ratios --
  debtToEquity: number | null;
  debtToCapital: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  roic: number | null;
  assetTurnover: number | null;
  inventoryTurnover: number | null;
  receivablesTurnover: number | null;
  daysSalesOutstanding: number | null;
  daysInventoryOutstanding: number | null;
  daysPayableOutstanding: number | null;
  cashConversionCycle: number | null;
  fcfConversion: number | null;
  workingCapitalRatio: number | null;
  effectiveTaxRate: number | null;
  capexAsPercentRevenue: number | null;
  dividendPayoutRatio: number | null;
  buybackPayoutRatio: number | null;
  totalPayoutRatio: number | null;
  leaseAdjustedDebtToEbitda: number | null;
  leaseAdjustedNetDebtToEbitda: number | null;
  // -- Other --
  sgaExpense: number | null;
  depreciation: number | null;
  ebit: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  interestExpense: number | null;
  epsBasic: number | null;
  epsDiluted: number | null;
  weightedAverageSharesBasic: number | null;
  weightedAverageSharesDiluted: number | null;
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
  { key: "costOfRevenue", label: "Cost of Revenue", format: "currency" },
  { key: "grossProfit", label: "Gross Profit", format: "currency" },
  { key: "operatingExpenses", label: "Operating Expenses", format: "currency" },
  { key: "rdExpense", label: "R&D Expense", format: "currency" },
  { key: "operatingIncome", label: "Operating Income", format: "currency" },
  { key: "netIncome", label: "Net Income", format: "currency" },
  { key: "incomeTax", label: "Income Tax", format: "currency" },
  { key: "totalAssets", label: "Total Assets", format: "currency" },
  { key: "totalLiabilities", label: "Total Liabilities", format: "currency" },
  { key: "totalEquity", label: "Total Equity", format: "currency" },
  { key: "totalDebt", label: "Total Debt", format: "currency" },
  { key: "shortTermDebt", label: "Short-Term Debt", format: "currency" },
  { key: "longTermDebt", label: "Long-Term Debt", format: "currency" },
  { key: "netDebt", label: "Net Debt", format: "currency" },
  { key: "cashAndEquivalents", label: "Cash & Equiv.", format: "currency" },
  { key: "shortTermInvestments", label: "Short-Term Inv.", format: "currency" },
  { key: "currentAssets", label: "Current Assets", format: "currency" },
  { key: "currentLiabilities", label: "Current Liab.", format: "currency" },
  { key: "workingCapital", label: "Working Capital", format: "currency" },
  { key: "inventory", label: "Inventory", format: "currency" },
  { key: "accountsReceivable", label: "A/R", format: "currency" },
  { key: "accountsPayable", label: "A/P", format: "currency" },
  { key: "accruedLiabilities", label: "Accrued Liab.", format: "currency" },
  { key: "deferredRevenue", label: "Deferred Revenue", format: "currency" },
  { key: "propertyPlantEquipment", label: "PP&E", format: "currency" },
  { key: "goodwill", label: "Goodwill", format: "currency" },
  { key: "intangibleAssets", label: "Intangibles", format: "currency" },
  { key: "operatingLeaseLiabilities", label: "Operating Leases", format: "currency" },
  { key: "financeLeaseLiabilities", label: "Finance Leases", format: "currency" },
  { key: "leaseAdjustedDebt", label: "Lease-Adj. Debt", format: "currency" },
  { key: "leaseAdjustedNetDebt", label: "Lease-Adj. Net Debt", format: "currency" },
  { key: "operatingCashFlow", label: "Operating CF", format: "currency" },
  { key: "capex", label: "CapEx", format: "currency" },
  { key: "freeCashFlow", label: "Free Cash Flow", format: "currency" },
  { key: "shareRepurchases", label: "Buybacks", format: "currency" },
  { key: "investingCashFlow", label: "Investing CF", format: "currency" },
  { key: "financingCashFlow", label: "Financing CF", format: "currency" },
  { key: "debtIssued", label: "Debt Issued", format: "currency" },
  { key: "debtRepaid", label: "Debt Repaid", format: "currency" },
  { key: "grossMargin", label: "Gross Margin", format: "percent" },
  { key: "operatingMargin", label: "Operating Margin", format: "percent" },
  { key: "netMargin", label: "Net Margin", format: "percent" },
  { key: "debtToEquity", label: "Debt / Equity", format: "ratio" },
  { key: "debtToCapital", label: "Debt / Capital", format: "percent" },
  { key: "netDebtToEbitda", label: "Net Debt / EBITDA", format: "ratio" },
  { key: "interestCoverage", label: "Interest Coverage", format: "ratio" },
  { key: "currentRatio", label: "Current Ratio", format: "ratio" },
  { key: "roic", label: "ROIC", format: "percent" },
  { key: "assetTurnover", label: "Asset Turnover", format: "ratio" },
  { key: "inventoryTurnover", label: "Inventory Turns", format: "ratio" },
  { key: "receivablesTurnover", label: "A/R Turns", format: "ratio" },
  { key: "daysSalesOutstanding", label: "DSO", format: "number" },
  { key: "daysInventoryOutstanding", label: "DIO", format: "number" },
  { key: "daysPayableOutstanding", label: "DPO", format: "number" },
  { key: "cashConversionCycle", label: "Cash Conv. Cycle", format: "number" },
  { key: "fcfConversion", label: "FCF Conversion", format: "percent" },
  { key: "workingCapitalRatio", label: "Working Cap. / Revenue", format: "percent" },
  { key: "effectiveTaxRate", label: "Effective Tax Rate", format: "percent" },
  { key: "capexAsPercentRevenue", label: "CapEx % Revenue", format: "percent" },
  { key: "dividendPayoutRatio", label: "Dividend Payout", format: "percent" },
  { key: "buybackPayoutRatio", label: "Buyback Payout", format: "percent" },
  { key: "totalPayoutRatio", label: "Total Payout", format: "percent" },
  { key: "leaseAdjustedDebtToEbitda", label: "Lease-Adj Debt/EBITDA", format: "ratio" },
  { key: "leaseAdjustedNetDebtToEbitda", label: "Lease-Adj Net Debt/EBITDA", format: "ratio" },
  { key: "sgaExpense", label: "SG&A", format: "currency" },
  { key: "depreciation", label: "Depreciation", format: "currency" },
  { key: "ebit", label: "EBIT", format: "currency" },
  { key: "ebitda", label: "EBITDA", format: "currency" },
  { key: "ebitdaMargin", label: "EBITDA Margin", format: "percent" },
  { key: "interestExpense", label: "Interest Exp.", format: "currency" },
  { key: "epsBasic", label: "EPS (Basic)", format: "ratio" },
  { key: "epsDiluted", label: "EPS (Diluted)", format: "ratio" },
  { key: "weightedAverageSharesBasic", label: "WA Shares Basic", format: "number" },
  { key: "weightedAverageSharesDiluted", label: "WA Shares Diluted", format: "number" },
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
