/**
 * Tests for appendService — duplicate detection, gap detection,
 * out-of-sequence detection, completeness checks.
 *
 * Run with: npx tsx --test tests/appendService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectAppendStatus,
  detectQuarterGaps,
  buildCompletenessChecks,
  generateWarnings,
  buildAppendReview,
  buildCoverageTimeline,
  generateExpectedQuarters,
} from "../src/lib/appendService";
import type { FullAnalysis } from "../src/types/analysis";
import type { Filing } from "../src/types/competitor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalysis(overrides?: Partial<FullAnalysis["meta"]>): FullAnalysis {
  return {
    meta: {
      source: "sec",
      ticker: "TST",
      companyName: "Test Corp",
      periodEnd: "2024-09-30",
      confidence: "high",
      ...overrides,
    },
    balanceSheet: {
      totalAssets: 10000,
      totalLiabilities: 6000,
      totalEquity: 4000,
      cashAndEquivalents: 500,
      retainedEarnings: 2000,
      items: [
        { tag: "Assets", label: "Total assets", value: 10000, period: "2024-09-30", source: "XBRL" },
      ],
    },
    debtStructure: {
      shortTermDebt: 200,
      longTermDebt: 3000,
      totalDebt: 3200,
      netDebt: 2700,
      items: [],
    },
    incomeStatement: {
      revenue: null, costOfRevenue: null, grossProfit: null, grossMargin: null,
      sgaExpense: null, rdExpense: null, operatingExpenses: null, operatingIncome: null,
      operatingMargin: null, ebit: null, ebitMargin: null, depreciation: null,
      amortization: null, ebitda: null, ebitdaMargin: null, interestExpense: null,
      incomeTax: null, netIncome: null, netMargin: null, epsBasic: null, epsDiluted: null,
    },
    cashFlow: {
      operatingCashFlow: 800,
      capitalExpenditures: 200,
      freeCashFlow: 600,
      dividendsPaid: 100,
      netIncome: 500,
      shareRepurchases: null,
      investingCashFlow: null,
      financingCashFlow: null,
    },
    ratios: {
      debtToEquity: 0.8,
      debtToCapital: 44.4,
      netDebtToEbitda: 4.0,
      interestCoverage: 5.0,
      currentRatio: 1.5,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      ebitdaMargin: null,
      returnOnEquity: null,
      returnOnAssets: null,
      returnOnInvestedCapital: null,
      assetTurnover: null,
      inventoryTurnover: null,
      receivablesTurnover: null,
      fcfYield: null,
      fcfConversion: null,
      workingCapital: null,
      workingCapitalRatio: null,
    },
    dividendAnalysis: {
      verdict: "strong",
      headline: "Test",
      bullets: [],
      payoutRatioNI: 20,
      payoutRatioFCF: 16.7,
      fcfCoverageYears: 6.0,
      cashCoverageYears: 5.0,
    },
    cfItems: [
      { tag: "Revenues", label: "Revenue", value: 12000, period: "2024-09-30", source: "XBRL" },
      { tag: "NetIncomeLoss", label: "Net income", value: 500, period: "2024-09-30", source: "XBRL" },
    ],
    validation: { passed: true, checks: [] },
    reconcile: {
      gapPct: 0,
      gapM: 0,
      withinTolerance: true,
      status: "ok",
      lhs: 10000,
      rhs: 10000,
    },
  };
}

function makeFiling(ticker: string, periodEnd: string): Filing {
  return {
    ticker,
    periodEnd,
    source: "sec",
    savedAt: new Date().toISOString(),
    analysis: makeAnalysis({ ticker, periodEnd }),
  };
}

// ---------------------------------------------------------------------------
// detectAppendStatus
// ---------------------------------------------------------------------------

describe("detectAppendStatus", () => {
  it("returns 'new' when no existing quarters", () => {
    assert.equal(detectAppendStatus("2024-09-30", []), "new");
  });

  it("returns 'new' when quarter is next in sequence", () => {
    assert.equal(
      detectAppendStatus("2024-09-30", ["2024-06-30"]),
      "new"
    );
  });

  it("returns 'duplicate' when same period-end exists", () => {
    assert.equal(
      detectAppendStatus("2024-09-30", ["2024-06-30", "2024-09-30"]),
      "duplicate"
    );
  });

  it("returns 'replacement' when same fiscal quarter with different date", () => {
    // Both map to Q3 2024
    assert.equal(
      detectAppendStatus("2024-09-28", ["2024-09-30"]),
      "replacement"
    );
  });

  it("returns 'out-of-sequence' when quarter is skipped ahead", () => {
    // Have Q2, uploading Q4 (skipping Q3)
    assert.equal(
      detectAppendStatus("2024-12-31", ["2024-06-30"]),
      "out-of-sequence"
    );
  });

  it("returns 'out-of-sequence' when uploading older quarter", () => {
    // Have Q3, uploading Q1
    assert.equal(
      detectAppendStatus("2024-03-31", ["2024-09-30"]),
      "out-of-sequence"
    );
  });

  it("returns 'new' when quarter is next across year boundary", () => {
    assert.equal(
      detectAppendStatus("2025-03-31", ["2024-12-31"]),
      "new"
    );
  });
});

// ---------------------------------------------------------------------------
// detectQuarterGaps
// ---------------------------------------------------------------------------

describe("detectQuarterGaps", () => {
  it("returns no gaps when history is complete", () => {
    const existing = [
      "2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31",
    ];
    const gaps = detectQuarterGaps(existing, "2024-03-31");
    assert.equal(gaps.length, 0);
  });

  it("detects single gap", () => {
    // Have Q1 and Q3 2023, uploading Q4 2023 → Q2 2023 is missing
    const existing = ["2023-03-31", "2023-09-30"];
    const gaps = detectQuarterGaps(existing, "2023-12-31");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].expected, "Q2 2023");
  });

  it("detects multiple gaps", () => {
    // Only have Q1 2023, uploading Q1 2024 → Q2-Q4 2023 missing
    const existing = ["2023-03-31"];
    const gaps = detectQuarterGaps(existing, "2024-03-31");
    assert.equal(gaps.length, 3);
    assert.equal(gaps[0].expected, "Q2 2023");
    assert.equal(gaps[1].expected, "Q3 2023");
    assert.equal(gaps[2].expected, "Q4 2023");
  });

  it("returns no gaps when no history and uploading Q1 2023", () => {
    const gaps = detectQuarterGaps([], "2023-03-31");
    assert.equal(gaps.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildCompletenessChecks
// ---------------------------------------------------------------------------

describe("buildCompletenessChecks", () => {
  it("marks all fields present for complete analysis", () => {
    const analysis = makeAnalysis();
    const checks = buildCompletenessChecks(analysis);
    const presentCount = checks.filter((c) => c.present).length;
    assert.equal(presentCount, 8); // All 8 fields
  });

  it("marks missing fields correctly", () => {
    const analysis = makeAnalysis();
    analysis.cashFlow.netIncome = null;
    analysis.cashFlow.operatingCashFlow = null;
    analysis.cfItems = []; // No revenue
    const checks = buildCompletenessChecks(analysis);
    const missing = checks.filter((c) => !c.present);
    assert.ok(missing.some((m) => m.field === "netIncome"));
    assert.ok(missing.some((m) => m.field === "operatingCashFlow"));
    assert.ok(missing.some((m) => m.field === "revenue"));
  });
});

// ---------------------------------------------------------------------------
// generateWarnings
// ---------------------------------------------------------------------------

describe("generateWarnings", () => {
  it("generates duplicate warning", () => {
    const completeness = buildCompletenessChecks(makeAnalysis());
    const warnings = generateWarnings(
      makeAnalysis(),
      "duplicate",
      completeness,
      []
    );
    assert.ok(warnings.some((w) => w.severity === "error" && w.message.includes("overwrite")));
  });

  it("generates out-of-sequence warning", () => {
    const completeness = buildCompletenessChecks(makeAnalysis());
    const warnings = generateWarnings(
      makeAnalysis(),
      "out-of-sequence",
      completeness,
      []
    );
    assert.ok(warnings.some((w) => w.message.includes("out of sequence")));
  });

  it("generates missing fields warning", () => {
    const analysis = makeAnalysis();
    analysis.cashFlow.netIncome = null;
    analysis.cashFlow.freeCashFlow = null;
    analysis.cfItems = [];
    const completeness = buildCompletenessChecks(analysis);
    const warnings = generateWarnings(analysis, "new", completeness, []);
    assert.ok(warnings.some((w) => w.message.includes("Missing")));
  });

  it("generates low confidence warning", () => {
    const analysis = makeAnalysis({ confidence: "low" });
    const completeness = buildCompletenessChecks(analysis);
    const warnings = generateWarnings(analysis, "new", completeness, []);
    assert.ok(warnings.some((w) => w.message.includes("heuristic")));
  });

  it("generates gap info warning", () => {
    const completeness = buildCompletenessChecks(makeAnalysis());
    const gaps = [{ expected: "Q2 2023", expectedPeriodEnd: "2023-06-30" }];
    const warnings = generateWarnings(makeAnalysis(), "new", completeness, gaps);
    assert.ok(warnings.some((w) => w.severity === "info" && w.message.includes("gap")));
  });
});

// ---------------------------------------------------------------------------
// buildAppendReview (integration)
// ---------------------------------------------------------------------------

describe("buildAppendReview", () => {
  it("produces a valid review for new quarter", () => {
    const analysis = makeAnalysis({ periodEnd: "2024-09-30" });
    const existing = [makeFiling("TST", "2024-06-30")];
    const review = buildAppendReview("TST", analysis, existing);

    assert.equal(review.status, "new");
    assert.equal(review.quarter.label, "Q3 2024");
    assert.equal(review.canAppend, true);
    assert.equal(review.ticker, "TST");
    assert.ok(review.lineItemCount > 0);
  });

  it("detects duplicate correctly", () => {
    const analysis = makeAnalysis({ periodEnd: "2024-06-30" });
    const existing = [makeFiling("TST", "2024-06-30")];
    const review = buildAppendReview("TST", analysis, existing);

    assert.equal(review.status, "duplicate");
    assert.ok(review.warnings.some((w) => w.severity === "error"));
    assert.equal(review.canAppend, true); // Can still overwrite
  });

  it("marks canAppend=false when all fields missing", () => {
    const analysis = makeAnalysis({ periodEnd: "2024-09-30" });
    // Zero out everything
    analysis.balanceSheet.totalAssets = 0;
    analysis.balanceSheet.totalLiabilities = 0;
    analysis.balanceSheet.totalEquity = 0;
    analysis.debtStructure.totalDebt = 0;
    analysis.cashFlow.netIncome = null;
    analysis.cashFlow.operatingCashFlow = null;
    analysis.cashFlow.freeCashFlow = null;
    analysis.cfItems = [];

    const review = buildAppendReview("TST", analysis, []);
    assert.equal(review.canAppend, false);
  });
});

// ---------------------------------------------------------------------------
// buildCoverageTimeline
// ---------------------------------------------------------------------------

describe("buildCoverageTimeline", () => {
  it("marks present quarters and missing ones", () => {
    const filings = [
      makeFiling("TST", "2023-03-31"),
      makeFiling("TST", "2023-09-30"),
    ];
    const timeline = buildCoverageTimeline(filings);

    // Should start at Q1 2023
    assert.equal(timeline[0].label, "Q1 2023");
    assert.equal(timeline[0].present, true);

    // Q2 2023 should be missing
    assert.equal(timeline[1].label, "Q2 2023");
    assert.equal(timeline[1].present, false);

    // Q3 2023 should be present
    assert.equal(timeline[2].label, "Q3 2023");
    assert.equal(timeline[2].present, true);
  });

  it("returns empty timeline for no filings", () => {
    const timeline = buildCoverageTimeline([]);
    // Should still have slots from Q1 2023 to current
    assert.ok(timeline.length > 0);
    assert.ok(timeline.every((s) => !s.present));
  });
});

// ---------------------------------------------------------------------------
// generateExpectedQuarters
// ---------------------------------------------------------------------------

describe("generateExpectedQuarters", () => {
  it("generates correct range", () => {
    const quarters = generateExpectedQuarters(2023, 4);
    assert.equal(quarters.length, 4);
    assert.equal(quarters[0].label, "Q1 2023");
    assert.equal(quarters[3].label, "Q4 2023");
  });

  it("spans across years", () => {
    const quarters = generateExpectedQuarters(2024, 2);
    assert.equal(quarters.length, 6); // Q1-Q4 2023 + Q1-Q2 2024
    assert.equal(quarters[0].label, "Q1 2023");
    assert.equal(quarters[5].label, "Q2 2024");
  });
});
