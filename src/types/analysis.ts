/** A single balance-sheet / cash-flow line with provenance. */
export interface BSItem {
  tag: string;
  label: string;
  value: number; // USD millions
  period: string; // "2024-09-30"
  source: string; // "XBRL:us-gaap:Assets" or "PDF:page12"
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
}

export interface Ratios {
  debtToEquity: number | null;
  debtToCapital: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  currentRatio: number | null;
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
    extractionMethod?: "sec" | "pdf-ai" | "pdf-heuristic";
  };
  balanceSheet: BalanceSheet;
  debtStructure: DebtStructure;
  cashFlow: CashFlowData;
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
}

/** The step definitions for the agent workflow UI. */
export const PIPELINE_STEPS = [
  { id: "ingest", label: "Ingest request" },
  { id: "resolve", label: "Resolve CIK / read PDF" },
  { id: "fetch_xbrl", label: "Fetch XBRL (SEC)" },
  { id: "extract_bs", label: "Extract balance sheet" },
  { id: "extract_cf", label: "Extract cash flow & P&L" },
  { id: "compute_capital", label: "Compute capital structure" },
  { id: "compute_debt", label: "Analyze debt structure" },
  { id: "compute_ratios", label: "Calculate financial ratios" },
  { id: "dividend_assessment", label: "Assess dividend sustainability" },
  { id: "validate", label: "Validation checks" },
  { id: "complete", label: "Complete" },
] as const;
