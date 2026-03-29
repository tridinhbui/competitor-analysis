/**
 * Quarter Append Service — pure validation logic.
 *
 * Given a FullAnalysis and existing filing history, produces an AppendReview
 * with duplicate detection, gap detection, completeness checks, and warnings.
 *
 * No I/O — callers provide existing data.
 */

import type { FullAnalysis, BSItem } from "@/types/analysis";
import type {
  Filing,
  Quarter,
  AppendReview,
  AppendStatus,
  AppendWarning,
  CompletenessCheck,
  QuarterGap,
  TimelineSlot,
} from "@/types/competitor";
import { deriveQuarter } from "./competitorService";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Required fields for a quarter to be considered complete. */
const REQUIRED_FIELDS: Array<{ field: string; label: string }> = [
  { field: "totalAssets", label: "Total Assets" },
  { field: "totalLiabilities", label: "Total Liabilities" },
  { field: "totalEquity", label: "Total Equity" },
  { field: "totalDebt", label: "Total Debt" },
  { field: "netIncome", label: "Net Income" },
  { field: "operatingCashFlow", label: "Operating Cash Flow" },
  { field: "freeCashFlow", label: "Free Cash Flow" },
  { field: "revenue", label: "Revenue" },
];

/** The analysis coverage window: Q1 2023 through current. */
const COVERAGE_START_YEAR = 2023;
const COVERAGE_START_QUARTER = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate all expected (year, quarter) pairs from Q1 2023 to the given
 * target quarter (inclusive).
 */
export function generateExpectedQuarters(
  upToYear: number,
  upToQuarter: number
): Array<{ year: number; quarter: number; label: string; approxPeriodEnd: string }> {
  const result: Array<{
    year: number;
    quarter: number;
    label: string;
    approxPeriodEnd: string;
  }> = [];

  let y = COVERAGE_START_YEAR;
  let q = COVERAGE_START_QUARTER;

  while (y < upToYear || (y === upToYear && q <= upToQuarter)) {
    const monthEnd = q === 1 ? "03-31" : q === 2 ? "06-30" : q === 3 ? "09-30" : "12-31";
    result.push({
      year: y,
      quarter: q,
      label: `Q${q} ${y}`,
      approxPeriodEnd: `${y}-${monthEnd}`,
    });

    q++;
    if (q > 4) {
      q = 1;
      y++;
    }
  }

  return result;
}

/**
 * Map an existing quarter's period-end date to a (year, quarter) key.
 */
function periodEndToKey(periodEnd: string): string {
  const q = deriveQuarter(periodEnd);
  return `${q.fiscalYear}-Q${q.fiscalQuarter}`;
}

// ---------------------------------------------------------------------------
// Completeness checking
// ---------------------------------------------------------------------------

function extractFieldValue(
  analysis: FullAnalysis,
  field: string
): number | string | null | undefined {
  switch (field) {
    case "totalAssets":
      return analysis.balanceSheet.totalAssets || undefined;
    case "totalLiabilities":
      return analysis.balanceSheet.totalLiabilities || undefined;
    case "totalEquity":
      return analysis.balanceSheet.totalEquity || undefined;
    case "totalDebt":
      return analysis.debtStructure.totalDebt || undefined;
    case "netIncome":
      return analysis.cashFlow.netIncome;
    case "operatingCashFlow":
      return analysis.cashFlow.operatingCashFlow;
    case "freeCashFlow":
      return analysis.cashFlow.freeCashFlow;
    case "revenue": {
      const rev = (analysis.cfItems ?? []).find(
        (i) =>
          i.tag === "Revenues" ||
          i.tag === "RevenueFromContractWithCustomerExcludingAssessedTax"
      );
      return rev?.value ?? null;
    }
    default:
      return undefined;
  }
}

export function buildCompletenessChecks(
  analysis: FullAnalysis
): CompletenessCheck[] {
  return REQUIRED_FIELDS.map(({ field, label }) => {
    const value = extractFieldValue(analysis, field);
    return {
      field,
      label,
      present: value != null && value !== 0,
      value: value ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Segment label extraction
// ---------------------------------------------------------------------------

export function extractSegmentLabels(analysis: FullAnalysis): string[] {
  const allItems: BSItem[] = [
    ...analysis.balanceSheet.items,
    ...(analysis.cfItems ?? []),
  ];

  // Unique labels, sorted
  const labels = [...new Set(allItems.map((i) => i.label))];
  return labels.sort();
}

// ---------------------------------------------------------------------------
// Duplicate & sequence detection
// ---------------------------------------------------------------------------

export function detectAppendStatus(
  incomingPeriodEnd: string,
  existingPeriodEnds: string[]
): AppendStatus {
  // Check exact duplicate
  if (existingPeriodEnds.includes(incomingPeriodEnd)) {
    return "duplicate";
  }

  // Check if it maps to the same fiscal quarter as an existing one
  const incomingKey = periodEndToKey(incomingPeriodEnd);
  for (const existing of existingPeriodEnds) {
    if (periodEndToKey(existing) === incomingKey) {
      return "replacement";
    }
  }

  // Check if out-of-sequence (not the next expected quarter)
  if (existingPeriodEnds.length > 0) {
    const sorted = [...existingPeriodEnds].sort();
    const latestExisting = sorted[sorted.length - 1];
    const latestQ = deriveQuarter(latestExisting);
    const incomingQ = deriveQuarter(incomingPeriodEnd);

    // Expected next quarter
    let expectedNextQ = latestQ.fiscalQuarter + 1;
    let expectedNextY = latestQ.fiscalYear;
    if (expectedNextQ > 4) {
      expectedNextQ = 1;
      expectedNextY++;
    }

    const isNext =
      incomingQ.fiscalYear === expectedNextY &&
      incomingQ.fiscalQuarter === expectedNextQ;

    // Also allow if it's in the future (skip ahead)
    const isAhead =
      incomingQ.fiscalYear > expectedNextY ||
      (incomingQ.fiscalYear === expectedNextY &&
        incomingQ.fiscalQuarter > expectedNextQ);

    if (!isNext && isAhead) {
      return "out-of-sequence";
    }

    // If it's before existing quarters, it's out of sequence
    if (incomingPeriodEnd < latestExisting) {
      return "out-of-sequence";
    }
  }

  return "new";
}

// ---------------------------------------------------------------------------
// Gap detection
// ---------------------------------------------------------------------------

export function detectQuarterGaps(
  existingPeriodEnds: string[],
  incomingPeriodEnd: string
): QuarterGap[] {
  // Build the set of all quarters we should have from Q1 2023 to the incoming quarter
  const incoming = deriveQuarter(incomingPeriodEnd);
  const expected = generateExpectedQuarters(
    incoming.fiscalYear,
    incoming.fiscalQuarter
  );

  // Map existing to keys
  const existingKeys = new Set(existingPeriodEnds.map(periodEndToKey));
  // Also add the incoming quarter
  existingKeys.add(`${incoming.fiscalYear}-Q${incoming.fiscalQuarter}`);

  return expected
    .filter((e) => !existingKeys.has(`${e.year}-Q${e.quarter}`))
    .map((e) => ({
      expected: e.label,
      expectedPeriodEnd: e.approxPeriodEnd,
    }));
}

// ---------------------------------------------------------------------------
// Warning generation
// ---------------------------------------------------------------------------

export function generateWarnings(
  analysis: FullAnalysis,
  status: AppendStatus,
  completeness: CompletenessCheck[],
  gaps: QuarterGap[]
): AppendWarning[] {
  const warnings: AppendWarning[] = [];

  // Status-based warnings
  if (status === "duplicate") {
    warnings.push({
      severity: "error",
      message: "This quarter already exists on file. Appending will overwrite the existing data.",
    });
  }

  if (status === "replacement") {
    warnings.push({
      severity: "warning",
      message:
        "A different filing for this fiscal quarter already exists (different period-end date). Appending will add alongside it.",
    });
  }

  if (status === "out-of-sequence") {
    warnings.push({
      severity: "warning",
      message:
        "This quarter is out of sequence — there are gaps in the historical coverage.",
    });
  }

  // Completeness warnings
  const missingCount = completeness.filter((c) => !c.present).length;
  if (missingCount > 0) {
    const missingLabels = completeness
      .filter((c) => !c.present)
      .map((c) => c.label);
    warnings.push({
      severity: missingCount >= 4 ? "error" : "warning",
      message: `Missing ${missingCount} required field(s): ${missingLabels.join(", ")}`,
    });
  }

  // Confidence warnings
  if (analysis.meta.confidence === "low") {
    warnings.push({
      severity: "warning",
      message:
        "Data was extracted using heuristic methods (low confidence). Consider verifying against the original filing.",
    });
  }

  // Reconciliation warnings
  if (analysis.reconcile && analysis.reconcile.status === "fail") {
    warnings.push({
      severity: "warning",
      message: `Balance sheet identity check failed: ${analysis.reconcile.gapPct}% gap.`,
    });
  }

  // Validation warnings
  if (!analysis.validation.passed) {
    const failedChecks = analysis.validation.checks
      .filter((c) => !c.passed)
      .map((c) => c.name);
    warnings.push({
      severity: "warning",
      message: `Validation issues: ${failedChecks.join(", ")}`,
    });
  }

  // Gap warnings
  if (gaps.length > 0 && gaps.length <= 3) {
    warnings.push({
      severity: "info",
      message: `${gaps.length} quarter gap(s) in coverage: ${gaps.map((g) => g.expected).join(", ")}`,
    });
  } else if (gaps.length > 3) {
    warnings.push({
      severity: "info",
      message: `${gaps.length} quarter gaps in coverage from Q1 2023 to present.`,
    });
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Main: build the AppendReview
// ---------------------------------------------------------------------------

/**
 * Build a complete AppendReview given incoming analysis data and existing history.
 * Pure function — no I/O.
 */
export function buildAppendReview(
  ticker: string,
  analysis: FullAnalysis,
  existingFilings: Filing[]
): AppendReview {
  const periodEnd =
    analysis.meta.periodEnd ?? new Date().toISOString().split("T")[0];
  const quarter = deriveQuarter(periodEnd);
  const companyName = analysis.meta.companyName ?? ticker;
  const source = analysis.meta.source;
  const filingDate =
    analysis.meta.filingDate ?? new Date().toISOString().split("T")[0];

  const existingPeriodEnds = existingFilings.map((f) => f.periodEnd);

  const status = detectAppendStatus(periodEnd, existingPeriodEnds);
  const completeness = buildCompletenessChecks(analysis);
  const segmentLabels = extractSegmentLabels(analysis);
  const gaps = detectQuarterGaps(existingPeriodEnds, periodEnd);
  const warnings = generateWarnings(analysis, status, completeness, gaps);

  const lineItemCount =
    analysis.balanceSheet.items.length + (analysis.cfItems ?? []).length;

  // Can append if: no error-level warnings that block it
  // Duplicates CAN be appended (overwrite), but user is warned
  const hasBlockingError =
    completeness.filter((c) => !c.present).length >= REQUIRED_FIELDS.length;
  const canAppend = !hasBlockingError;

  return {
    ticker: ticker.toUpperCase(),
    companyName,
    quarter,
    filingType: "10-Q", // Default; 10-K detection can be added
    filingDate,
    source,
    status,
    completeness,
    lineItemCount,
    segmentLabels,
    warnings,
    gaps,
    existingQuarters: existingPeriodEnds.sort().reverse(),
    canAppend,
    analysis,
  };
}

// ---------------------------------------------------------------------------
// Timeline builder
// ---------------------------------------------------------------------------

/**
 * Build a timeline of quarterly slots from Q1 2023 through current quarter,
 * marking which ones have filings.
 */
export function buildCoverageTimeline(
  existingFilings: Filing[]
): TimelineSlot[] {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  const expected = generateExpectedQuarters(currentYear, currentQuarter);

  // Map existing filings to keys
  const filingMap = new Map<string, Filing>();
  for (const f of existingFilings) {
    const key = periodEndToKey(f.periodEnd);
    filingMap.set(key, f);
  }

  return expected.map((e) => {
    const key = `${e.year}-Q${e.quarter}`;
    const filing = filingMap.get(key);
    return {
      label: e.label,
      periodEnd: filing?.periodEnd ?? e.approxPeriodEnd,
      present: !!filing,
      source: filing?.source,
    };
  });
}
