/**
 * Domain types for the Competitor Analysis Workspace.
 *
 * These types layer on top of the existing FullAnalysis model.
 * They introduce first-class Company, Quarter, and Filing entities,
 * peer classification, and analysis-module eligibility.
 */

import type { FullAnalysis } from "./analysis";

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

/** A company tracked in the competitor analysis workspace. */
export interface Company {
  /** Uppercase ticker symbol, e.g. "SFD" */
  ticker: string;
  /** Official company name from SEC or user input */
  name: string;
  /** Optional SIC / NAICS industry label */
  industry?: string;
  /** The peer type assigned for Smithfield-centric analysis */
  peerType: PeerType;
  /** ISO timestamp of when this company was first added */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Peer types — Smithfield competitor classification
// ---------------------------------------------------------------------------

/**
 * Peer types for competitor grouping.
 *
 * - subject: the company being analyzed (Smithfield)
 * - packaged-meats: direct packaged meats competitors (e.g. Hormel, Tyson branded)
 * - pork-fresh: pork/fresh protein peers (e.g. Seaboard)
 * - diversified-protein: large diversified protein companies (e.g. Tyson, JBS USA)
 * - methodology-change: companies with recent accounting or reporting changes
 * - spinoff-structural: companies affected by spin-offs or structural reorganization
 */
export type PeerType =
  | "subject"
  | "packaged-meats"
  | "pork-fresh"
  | "diversified-protein"
  | "methodology-change"
  | "spinoff-structural";

export const PEER_TYPE_LABELS: Record<PeerType, string> = {
  subject: "Subject Company",
  "packaged-meats": "Packaged Meats Peer",
  "pork-fresh": "Pork / Fresh Peer",
  "diversified-protein": "Diversified Protein Peer",
  "methodology-change": "Methodology Change Peer",
  "spinoff-structural": "Spin-off / Structural Change Peer",
};

// ---------------------------------------------------------------------------
// Quarter
// ---------------------------------------------------------------------------

/**
 * Fiscal quarter identifier.
 * periodEnd is the balance-sheet date (e.g. "2024-12-28" for Smithfield's Q2 FY2025).
 */
export interface Quarter {
  /** ISO date string of the period end, e.g. "2024-12-28" */
  periodEnd: string;
  /** Fiscal year, e.g. 2025 */
  fiscalYear: number;
  /** Fiscal quarter 1-4 */
  fiscalQuarter: number;
  /** Label for display, e.g. "Q2 FY2025" */
  label: string;
}

// ---------------------------------------------------------------------------
// Filing — a stored quarterly analysis
// ---------------------------------------------------------------------------

/** A single quarterly filing stored on disk. Wraps the existing FullAnalysis. */
export interface Filing {
  /** Uppercase ticker */
  ticker: string;
  /** ISO period-end date */
  periodEnd: string;
  /** How the data was ingested */
  source: "sec" | "pdf";
  /** ISO timestamp of when this filing was saved */
  savedAt: string;
  /** The full analysis result from the existing engine */
  analysis: FullAnalysis;
  /** Filing type: 10-Q or 10-K */
  filingType?: "10-Q" | "10-K";
  /** Filing date from SEC or upload date */
  filingDate?: string;
  /** Derived quarter info */
  quarter?: Quarter;
}

// ---------------------------------------------------------------------------
// Analysis Modules — what the workspace can generate
// ---------------------------------------------------------------------------

/**
 * Analysis modules represent the building blocks of a competitor analysis deck.
 * Each module has prerequisites (minimum quarters, required data fields).
 * Sprint 1 defines the catalog; future sprints implement calculations.
 */
export type AnalysisModuleId =
  | "benchmark-table"
  | "sequential-comparison"
  | "yoy-comparison"
  | "ttm-comparison"
  | "margin-gap-analysis"
  | "unit-economics"
  | "sga-comparison"
  | "appendix-tables"
  | "peer-specific";

export interface AnalysisModule {
  id: AnalysisModuleId;
  name: string;
  description: string;
  /** Minimum number of quarters needed for the subject company */
  minQuarters: number;
  /** Minimum number of peer companies with data needed */
  minPeers: number;
  /** Which FullAnalysis fields must be non-null */
  requiredFields: (keyof FullAnalysis)[];
}

/** The full catalog of analysis modules. */
export const ANALYSIS_MODULES: AnalysisModule[] = [
  {
    id: "benchmark-table",
    name: "Benchmark Table",
    description: "Side-by-side key metrics for subject vs. peers for a single quarter",
    minQuarters: 1,
    minPeers: 1,
    requiredFields: ["balanceSheet", "cashFlow", "ratios"],
  },
  {
    id: "sequential-comparison",
    name: "Sequential (QoQ) Comparison",
    description: "Quarter-over-quarter changes in key metrics",
    minQuarters: 2,
    minPeers: 0,
    requiredFields: ["balanceSheet", "cashFlow"],
  },
  {
    id: "yoy-comparison",
    name: "Year-over-Year Comparison",
    description: "Same quarter prior year comparison",
    minQuarters: 5,
    minPeers: 0,
    requiredFields: ["balanceSheet", "cashFlow"],
  },
  {
    id: "ttm-comparison",
    name: "Trailing Twelve Months",
    description: "Rolling 4-quarter aggregation for income/cash flow metrics",
    minQuarters: 4,
    minPeers: 0,
    requiredFields: ["cashFlow"],
  },
  {
    id: "margin-gap-analysis",
    name: "Margin Gap Analysis",
    description: "Gross/operating/net margin gaps between subject and peers",
    minQuarters: 1,
    minPeers: 1,
    requiredFields: ["cashFlow", "ratios"],
  },
  {
    id: "unit-economics",
    name: "Unit Economics",
    description: "Revenue, COGS, and margin per unit or per segment",
    minQuarters: 1,
    minPeers: 0,
    requiredFields: ["cashFlow"],
  },
  {
    id: "sga-comparison",
    name: "SG&A Comparison",
    description: "Selling, general & administrative expense benchmarking",
    minQuarters: 1,
    minPeers: 1,
    requiredFields: ["cashFlow"],
  },
  {
    id: "appendix-tables",
    name: "Appendix Tables",
    description: "Full financial statement extracts formatted for deck appendix",
    minQuarters: 1,
    minPeers: 0,
    requiredFields: ["balanceSheet", "cashFlow"],
  },
  {
    id: "peer-specific",
    name: "Peer-Specific Module",
    description: "Deep-dive analysis for a single peer company",
    minQuarters: 2,
    minPeers: 1,
    requiredFields: ["balanceSheet", "cashFlow", "ratios"],
  },
];

// ---------------------------------------------------------------------------
// Workspace state — the readiness view for a company
// ---------------------------------------------------------------------------

/** Module eligibility result */
export interface ModuleReadiness {
  moduleId: AnalysisModuleId;
  moduleName: string;
  ready: boolean;
  /** Why it's not ready, if applicable */
  reasons: string[];
}

/** Overall workspace readiness for a company */
export interface WorkspaceReadiness {
  company: Company;
  /** Latest quarter on file, or null if none */
  latestQuarter: Quarter | null;
  /** Total quarters on file */
  quarterCount: number;
  /** List of period-end dates on file, sorted descending */
  quartersOnFile: string[];
  /** Number of peer companies with at least 1 quarter */
  peerCount: number;
  /** Per-peer quarter counts */
  peerCoverage: Array<{ ticker: string; name: string; peerType: PeerType; quarterCount: number }>;
  /** Module-by-module readiness */
  modules: ModuleReadiness[];
  /** Overall: can at least one module run? */
  canBeginAnalysis: boolean;
}

// ---------------------------------------------------------------------------
// Registry — stored on disk as companies.json
// ---------------------------------------------------------------------------

export interface CompanyRegistry {
  version: "1.0";
  companies: Company[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Quarter Append — validation and review types
// ---------------------------------------------------------------------------

/** Status of the incoming quarter relative to history. */
export type AppendStatus = "new" | "duplicate" | "out-of-sequence" | "replacement";

/** A single data completeness check. */
export interface CompletenessCheck {
  field: string;
  label: string;
  present: boolean;
  value?: number | string | null;
}

/** Severity of a validation warning. */
export type WarningSeverity = "info" | "warning" | "error";

/** A validation warning for the review screen. */
export interface AppendWarning {
  severity: WarningSeverity;
  message: string;
}

/** Quarter gap in the timeline. */
export interface QuarterGap {
  /** The expected quarter label, e.g. "Q3 2024" */
  expected: string;
  /** Expected period-end date (approximate) */
  expectedPeriodEnd: string;
}

/**
 * Full review result returned by the append validation service.
 * Shown to the user before they confirm the append.
 */
export interface AppendReview {
  /** The ticker being appended to */
  ticker: string;
  /** Company name */
  companyName: string;
  /** Derived quarter metadata */
  quarter: Quarter;
  /** Filing type detected */
  filingType: "10-Q" | "10-K";
  /** Filing date */
  filingDate: string;
  /** Source of the data */
  source: "sec" | "pdf";
  /** Whether this is new, duplicate, out-of-sequence, or replacement */
  status: AppendStatus;
  /** Data completeness checks */
  completeness: CompletenessCheck[];
  /** Count of line items extracted */
  lineItemCount: number;
  /** Segment labels found (if any, from balance sheet items) */
  segmentLabels: string[];
  /** Validation warnings */
  warnings: AppendWarning[];
  /** Quarter gaps in the company's history */
  gaps: QuarterGap[];
  /** Existing quarters on file (sorted descending) */
  existingQuarters: string[];
  /** Overall: is it safe to append? */
  canAppend: boolean;
  /** The FullAnalysis to be stored (passed through for confirm step) */
  analysis: FullAnalysis;
}

/** Timeline slot for coverage visualization. */
export interface TimelineSlot {
  /** e.g. "Q1 2023" */
  label: string;
  /** Period-end date if on file, else approximate expected date */
  periodEnd: string;
  /** Whether this quarter has a filing on file */
  present: boolean;
  /** The source if present */
  source?: "sec" | "pdf";
}

