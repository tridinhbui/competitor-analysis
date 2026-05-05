import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRebuiltAnalysisWithSupplementals } from "../src/lib/analysisMerge";
import type { FullAnalysis } from "../src/types/analysis";

function makeAnalysis(overrides?: Partial<FullAnalysis>): FullAnalysis {
  return {
    meta: {
      source: "pdf",
      ticker: "TSN",
      companyName: "Tyson Foods",
      periodEnd: "2025-06-28",
      confidence: "medium",
      extractionMethod: "pdf-ai",
      extractionRepairs: ["base-repair"],
      ...(overrides?.meta ?? {}),
    },
    balanceSheet: {
      totalAssets: 10000,
      totalLiabilities: 6000,
      totalEquity: 4000,
      cashAndEquivalents: 500,
      retainedEarnings: 2000,
      items: [],
      ...(overrides?.balanceSheet ?? {}),
    },
    debtStructure: {
      shortTermDebt: 200,
      longTermDebt: 3000,
      totalDebt: 3200,
      netDebt: 2700,
      items: [],
      ...(overrides?.debtStructure ?? {}),
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
      ...(overrides?.cashFlow ?? {}),
    },
    incomeStatement: {
      revenue: 12000,
      costOfRevenue: 10000,
      grossProfit: 2000,
      grossMargin: 16.7,
      sgaExpense: null,
      rdExpense: null,
      operatingExpenses: null,
      operatingIncome: 500,
      operatingMargin: 4.2,
      ebit: null,
      ebitMargin: null,
      depreciation: null,
      amortization: null,
      ebitda: null,
      ebitdaMargin: null,
      interestExpense: null,
      incomeTax: null,
      netIncome: 500,
      netMargin: 4.2,
      epsBasic: null,
      epsDiluted: null,
      ...(overrides?.incomeStatement ?? {}),
    },
    ratios: {
      debtToEquity: 0.8,
      debtToCapital: 44.4,
      netDebtToEbitda: 4,
      interestCoverage: 5,
      currentRatio: 1.5,
      grossMargin: 16.7,
      operatingMargin: 4.2,
      netMargin: 4.2,
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
      ...(overrides?.ratios ?? {}),
    },
    dividendAnalysis: {
      verdict: "adequate",
      headline: "Adequate",
      bullets: [],
      payoutRatioNI: null,
      payoutRatioFCF: null,
      fcfCoverageYears: null,
      cashCoverageYears: null,
      ...(overrides?.dividendAnalysis ?? {}),
    },
    cfItems: [],
    validation: {
      passed: true,
      checks: [],
      ...(overrides?.validation ?? {}),
    },
    reconcile: {
      gapPct: 0,
      gapM: 0,
      withinTolerance: true,
      status: "ok",
      lhs: 10000,
      rhs: 10000,
      ...(overrides?.reconcile ?? {}),
    },
    segments: [
      {
        segmentName: "Beef",
        segmentType: "business",
        revenue: 5603,
        costOfRevenue: null,
        grossProfit: null,
        sgaExpense: null,
        operatingIncome: -494,
        operatingMargin: -8.8,
        depreciation: null,
        capitalExpenditures: null,
        totalAssets: null,
        intercompanyEliminations: null,
        volumeUnits: null,
        volumeUnitType: null,
        revenuePerUnit: null,
        operatingIncomePerUnit: null,
      },
    ],
    footnotes: [
      {
        id: "note-1",
        title: "Segment reporting",
        summary: "Tyson reports Beef, Pork, Chicken, and Prepared Foods.",
        significance: "medium",
        type: "segment",
      },
    ],
    adjustedMetrics: [
      {
        name: "Adjusted operating income",
        gaapValue: 260,
        adjustments: [{ label: "Goodwill impairment", value: 343 }],
        adjustedValue: 603,
        unit: "million",
        period: "Q3 2025",
      },
    ],
    earningsNarrative: {
      result: "N/A",
      summary: "Segment mix remains important.",
      priorGuidance: null,
      currentGuidance: null,
      keyThemes: ["Protein mix"],
      tone: "neutral",
      source: "pdf-text",
    },
    nonRecurringItems: [
      {
        id: "nr-1",
        label: "Goodwill impairment",
        description: "Beef goodwill impairment.",
        amount: 343,
        impactedLine: "operatingIncome",
        category: "impairment",
        companyAdjusts: false,
        adjustDirection: "add-back",
        confidence: "high",
        sourceRef: "Note 13",
      },
    ],
    ...(overrides ?? {}),
  };
}

describe("mergeRebuiltAnalysisWithSupplementals", () => {
  it("preserves supplemental analysis fields while replacing rebuilt financial sections", () => {
    const base = makeAnalysis();
    const rebuilt = makeAnalysis({
      meta: {
        source: "pdf",
        ticker: "TSN",
        companyName: "Tyson Foods",
        periodEnd: "2025-06-28",
        confidence: "low",
        extractionMethod: "pdf-ai+heuristic",
        extractionRepairs: ["rebuilt-repair"],
      },
      balanceSheet: {
        totalAssets: 11000,
        totalLiabilities: 6500,
        totalEquity: 4500,
        cashAndEquivalents: 700,
        retainedEarnings: 2100,
        items: [{ tag: "Assets", label: "Total assets", value: 11000, period: "2025-06-28", source: "PDF" }],
      },
      segments: undefined,
      footnotes: undefined,
      adjustedMetrics: undefined,
      earningsNarrative: undefined,
      nonRecurringItems: undefined,
    });

    const merged = mergeRebuiltAnalysisWithSupplementals(base, rebuilt);

    assert.equal(merged.balanceSheet.totalAssets, 11000);
    assert.equal(merged.meta.extractionMethod, "pdf-ai+heuristic");
    assert.deepEqual(merged.meta.extractionRepairs, ["base-repair", "rebuilt-repair"]);
    assert.equal(merged.segments?.[0]?.segmentName, "Beef");
    assert.equal(merged.footnotes?.[0]?.type, "segment");
    assert.equal(merged.adjustedMetrics?.[0]?.name, "Adjusted operating income");
    assert.equal(merged.earningsNarrative?.summary, "Segment mix remains important.");
    assert.equal(merged.nonRecurringItems?.[0]?.label, "Goodwill impairment");
  });
});
