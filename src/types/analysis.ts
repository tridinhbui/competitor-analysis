/** A notable footnote extracted from the filing text */
export interface FootnoteItem {
  id: string;
  title: string;
  summary: string;
  significance: "high" | "medium" | "low";
  type: "debt" | "contingency" | "segment" | "accounting-policy" | "tax" | "revenue" | "other";
}

/** A non-GAAP adjusted metric with reconciliation */
export interface AdjustedMetric {
  name: string;
  gaapValue: number | null;
  adjustments: Array<{ label: string; value: number }>;
  adjustedValue: number | null;
  unit: "million" | "per-share";
  period: string;
}

/** A non-recurring or special item that impacts comparability */
export interface NonRecurringItem {
  id: string;
  /** Short label, e.g. "Antitrust settlement charge" */
  label: string;
  /** Detailed description from filing */
  description: string;
  /** Amount in $M (positive = expense/charge, negative = gain/income) */
  amount: number;
  /** Which line item it impacts */
  impactedLine: "operatingIncome" | "netIncome" | "revenue" | "cogs" | "sga" | "other";
  /** Type of non-recurring event */
  category: "legal" | "restructuring" | "impairment" | "gain-loss-disposal" | "tax-adjustment" | "insurance" | "erc" | "acquisition" | "other";
  /** Whether the company already adjusts this in their non-GAAP */
  companyAdjusts: boolean;
  /** Recommended adjustment direction: "add-back" to OP or "subtract" from OP */
  adjustDirection: "add-back" | "subtract";
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Source reference (note number, page, etc.) */
  sourceRef: string;
}

/** A single balance-sheet / cash-flow line with provenance. */
export interface BSItem {
  tag: string;
  label: string;
  value: number; // USD millions
  period: string; // "2024-09-30"
  source: string; // "XBRL:us-gaap:Assets" or "PDF:page12"
  /** Whether this value covers a quarter, year-to-date period, full year, or is a point-in-time balance */
  period_type?: "quarter" | "ytd" | "annual" | "balance_sheet";
  /** Extraction confidence: high = from table, medium = from MD&A, low = estimated */
  confidence?: "high" | "medium" | "low";
}

/** SSE event streamed from the analysis pipeline. */
export interface StepEvent {
  step: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  message: string;
  durationMs?: number;
  detail?: Record<string, unknown>;
}

export interface BalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashAndEquivalents: number;
  retainedEarnings: number;
  items: BSItem[];
}

export interface DebtStructure {
  shortTermDebt: number;
  longTermDebt: number;
  totalDebt: number;
  netDebt: number;
  items: BSItem[];
}

export interface CashFlowData {
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  netIncome: number | null;
  shareRepurchases: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
}

/** Income statement summary (derived from cfItems) */
export interface IncomeStatement {
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  sgaExpense: number | null;
  rdExpense: number | null;
  operatingExpenses: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  ebit: number | null;
  ebitMargin: number | null;
  depreciation: number | null;
  amortization: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  interestExpense: number | null;
  incomeTax: number | null;
  netIncome: number | null;
  netMargin: number | null;
  epsBasic: number | null;
  epsDiluted: number | null;
}

/** Enhanced financial ratios */
export interface Ratios {
  debtToEquity: number | null;
  debtToCapital: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
  // Profitability
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  ebitdaMargin: number | null;
  // Returns
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  returnOnInvestedCapital: number | null;
  // Efficiency
  assetTurnover: number | null;
  inventoryTurnover: number | null;
  receivablesTurnover: number | null;
  // Cash
  fcfYield: number | null;
  fcfConversion: number | null;
  // Working capital
  workingCapital: number | null;
  workingCapitalRatio: number | null;
}

export interface EarningsNarrative {
  /** Headline: "Beat expectations" | "Missed expectations" | "In line" | "N/A" */
  result: string;
  /** Q4 2024 beat EPS consensus by 5% | etc. */
  summary: string;
  /** Prior year guidance (if disclosed) */
  priorGuidance: string | null;
  /** Current guidance (if disclosed) */
  currentGuidance: string | null;
  /** Key themes from MD&A or earnings call summary */
  keyThemes: string[];
  /** Management tone / confidence */
  tone: "bullish" | "neutral" | "cautious" | "unknown";
  /** Source: "sec-text" (from 10-Q/10-K MD&A) or "call-transcript" */
  source: string;
}

export interface DividendAnalysis {
  verdict: "strong" | "adequate" | "stretched" | "unknown";
  headline: string;
  bullets: string[];
  payoutRatioNI: number | null;
  payoutRatioFCF: number | null;
  fcfCoverageYears: number | null;
  cashCoverageYears: number | null;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  note: string;
}

export type DataConfidence = "high" | "medium" | "low";

export type ReconcileStatus = "ok" | "warning" | "fail";

export interface ReconcileResult {
  gapPct: number;
  gapM: number;
  withinTolerance: boolean;
  status: ReconcileStatus;
  lhs: number;
  rhs: number;
}

export interface FullAnalysis {
  meta: {
    source: "sec" | "pdf";
    ticker?: string;
    cik?: string;
    companyName?: string;
    filingDate?: string;
    periodEnd?: string;
    fileName?: string;
    pagesRead?: number;
    charsExtracted?: number;
    /** Data quality: SEC=high, PDF+AI=medium, PDF+heuristic=low */
    confidence?: DataConfidence;
    /** How extraction was done (for transparency) */
    extractionMethod?:
      | "sec"
      | "pdf-ai"
      | "pdf-ai-partial"
      | "pdf-ai+heuristic"
      | "pdf-ai-section-split"
      | "pdf-vision"
      | "pdf-heuristic";
  };
  balanceSheet: BalanceSheet;
  debtStructure: DebtStructure;
  cashFlow: CashFlowData;
  incomeStatement: IncomeStatement;
  ratios: Ratios;
  dividendAnalysis: DividendAnalysis;
  /** Raw CF / income items for display in the dashboard */
  cfItems?: BSItem[];
  validation: {
    passed: boolean;
    checks: ValidationCheck[];
  };
  /** Balance sheet identity check: Assets vs Liabilities + Equity */
  reconcile?: ReconcileResult;
  /** Segment-level financials (populated from XBRL or manual entry) */
  segments?: import("./segments").SegmentData[];
  /** Methodology variants for companies that changed allocation methods */
  methodologyVariants?: import("./segments").MethodologyVariant[];
  /** Notable footnotes extracted from the filing text */
  footnotes?: FootnoteItem[];
  /** Non-GAAP adjusted metrics with reconciliation */
  adjustedMetrics?: AdjustedMetric[];
  /** Earnings narrative: beat/miss, guidance, key themes */
  earningsNarrative?: EarningsNarrative;
  /** Non-recurring / special items extracted for comparability adjustments */
  nonRecurringItems?: NonRecurringItem[];
}

/** The step definitions for the agent workflow UI. */
export const PIPELINE_STEPS = [
  { id: "ingest", label: "Ingest request" },
  { id: "resolve", label: "Resolve CIK / read PDF" },
  { id: "extract_bs", label: "Extract balance sheet" },
  { id: "extract_cf", label: "Extract cash flow & P&L" },
  { id: "compute_capital", label: "Compute capital structure" },
  { id: "compute_debt", label: "Analyze debt structure" },
  { id: "compute_ratios", label: "Calculate financial ratios" },
  { id: "dividend_assessment", label: "Assess dividend sustainability" },
  { id: "validate", label: "Validation checks" },
  { id: "extract_footnotes", label: "Extract footnotes & adjusted metrics" },
  { id: "complete", label: "Complete" },
] as const;
