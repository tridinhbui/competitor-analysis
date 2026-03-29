/**
 * Tests for competitorService — domain mapping and readiness logic.
 *
 * Run with: npx tsx --test tests/competitorService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveQuarter,
  checkModuleReadiness,
  computeWorkspaceReadiness,
  filingToSummary,
} from "../src/lib/competitorService";
import type { FullAnalysis } from "../src/types/analysis";
import type { Company, Filing } from "../src/types/competitor";

// ---------------------------------------------------------------------------
// Helpers — minimal valid FullAnalysis for testing
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
      items: [],
    },
    debtStructure: {
      shortTermDebt: 200,
      longTermDebt: 3000,
      totalDebt: 3200,
      netDebt: 2700,
      items: [],
    },
    cashFlow: {
      operatingCashFlow: 800,
      capitalExpenditures: 200,
      freeCashFlow: 600,
      dividendsPaid: 100,
      netIncome: 500,
    },
    ratios: {
      debtToEquity: 0.8,
      debtToCapital: 44.4,
      netDebtToEbitda: 4.0,
      interestCoverage: 5.0,
      currentRatio: 1.5,
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

function makeFiling(
  ticker: string,
  periodEnd: string,
  analysisOverrides?: Partial<FullAnalysis["meta"]>
): Filing {
  return {
    ticker,
    periodEnd,
    source: "sec",
    savedAt: new Date().toISOString(),
    analysis: makeAnalysis({ ticker, periodEnd, ...analysisOverrides }),
  };
}

function makeCompany(
  ticker: string,
  name: string,
  peerType: Company["peerType"] = "diversified-protein"
): Company {
  return {
    ticker,
    name,
    peerType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deriveQuarter", () => {
  it("maps January-March to Q1", () => {
    const q = deriveQuarter("2024-03-31");
    assert.equal(q.fiscalQuarter, 1);
    assert.equal(q.fiscalYear, 2024);
    assert.equal(q.label, "Q1 2024");
  });

  it("maps April-June to Q2", () => {
    const q = deriveQuarter("2024-06-29");
    assert.equal(q.fiscalQuarter, 2);
    assert.equal(q.fiscalYear, 2024);
  });

  it("maps July-September to Q3", () => {
    const q = deriveQuarter("2024-09-30");
    assert.equal(q.fiscalQuarter, 3);
    assert.equal(q.fiscalYear, 2024);
  });

  it("maps October-December to Q4", () => {
    const q = deriveQuarter("2024-12-28");
    assert.equal(q.fiscalQuarter, 4);
    assert.equal(q.fiscalYear, 2024);
    assert.equal(q.label, "Q4 2024");
  });
});

describe("checkModuleReadiness", () => {
  const filing = makeFiling("TST", "2024-09-30");

  it("benchmark-table is ready with 1 quarter and 1 peer", () => {
    const r = checkModuleReadiness("benchmark-table", 1, 1, filing);
    assert.equal(r.ready, true);
    assert.equal(r.reasons.length, 0);
  });

  it("benchmark-table is NOT ready with 0 peers", () => {
    const r = checkModuleReadiness("benchmark-table", 1, 0, filing);
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((s) => s.includes("peer")));
  });

  it("sequential-comparison needs 2 quarters", () => {
    const r1 = checkModuleReadiness("sequential-comparison", 1, 0, filing);
    assert.equal(r1.ready, false);

    const r2 = checkModuleReadiness("sequential-comparison", 2, 0, filing);
    assert.equal(r2.ready, true);
  });

  it("yoy-comparison needs 5 quarters", () => {
    const r = checkModuleReadiness("yoy-comparison", 4, 0, filing);
    assert.equal(r.ready, false);
    assert.ok(r.reasons.some((s) => s.includes("5")));
  });

  it("ttm-comparison needs 4 quarters", () => {
    const r1 = checkModuleReadiness("ttm-comparison", 3, 0, filing);
    assert.equal(r1.ready, false);

    const r2 = checkModuleReadiness("ttm-comparison", 4, 0, filing);
    assert.equal(r2.ready, true);
  });

  it("unknown module is not ready", () => {
    const r = checkModuleReadiness(
      "nonexistent" as any,
      10,
      10,
      filing
    );
    assert.equal(r.ready, false);
  });
});

describe("computeWorkspaceReadiness", () => {
  it("reports canBeginAnalysis=false when no filings", () => {
    const company = makeCompany("TST", "Test Corp", "subject");
    const r = computeWorkspaceReadiness(company, [], []);
    assert.equal(r.canBeginAnalysis, false);
    assert.equal(r.quarterCount, 0);
    assert.equal(r.latestQuarter, null);
  });

  it("reports correct counts and readiness with data", () => {
    const company = makeCompany("SFD", "Smithfield", "subject");
    const filings = [
      makeFiling("SFD", "2024-09-30"),
      makeFiling("SFD", "2024-06-30"),
    ];
    const peers = [
      { company: makeCompany("TSN", "Tyson", "diversified-protein"), quarterCount: 3 },
      { company: makeCompany("HRL", "Hormel", "packaged-meats"), quarterCount: 0 },
    ];

    const r = computeWorkspaceReadiness(company, filings, peers);

    assert.equal(r.quarterCount, 2);
    assert.equal(r.peerCount, 1); // Only TSN has data
    assert.equal(r.latestQuarter?.periodEnd, "2024-09-30");
    assert.equal(r.canBeginAnalysis, true);

    // benchmark-table should be ready (1 quarter + 1 peer)
    const benchmark = r.modules.find((m) => m.moduleId === "benchmark-table");
    assert.equal(benchmark?.ready, true);

    // sequential should be ready (2 quarters)
    const seq = r.modules.find((m) => m.moduleId === "sequential-comparison");
    assert.equal(seq?.ready, true);

    // yoy should not be ready (need 5 quarters)
    const yoy = r.modules.find((m) => m.moduleId === "yoy-comparison");
    assert.equal(yoy?.ready, false);
  });
});

describe("filingToSummary", () => {
  it("extracts correct summary fields", () => {
    const filing = makeFiling("TST", "2024-09-30");
    filing.analysis.cfItems = [
      { tag: "Revenues", label: "Revenue", value: 12000, period: "2024-09-30", source: "XBRL" },
    ];

    const s = filingToSummary(filing);
    assert.equal(s.periodEnd, "2024-09-30");
    assert.equal(s.totalAssets, 10000);
    assert.equal(s.totalDebt, 3200);
    assert.equal(s.freeCashFlow, 600);
    assert.equal(s.debtToEquity, 0.8);
    assert.equal(s.totalRevenue, 12000);
    assert.equal(s.quarter.label, "Q3 2024");
    assert.equal(s.source, "sec");
  });

  it("handles missing revenue gracefully", () => {
    const filing = makeFiling("TST", "2024-09-30");
    const s = filingToSummary(filing);
    assert.equal(s.totalRevenue, null);
  });
});
