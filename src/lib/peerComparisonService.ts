/**
 * Peer Comparison Service — pure logic, no I/O.
 *
 * Takes filings from multiple companies and produces:
 * - Side-by-side metric tables
 * - Margin gap analysis
 * - Per-unit comparison ($/head, $/cwt)
 * - Trend comparison across quarters
 */

import type { FullAnalysis, IncomeStatement, Ratios } from "@/types/analysis";
import type { Filing } from "@/types/competitor";
import { deriveQuarter } from "./competitorService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyQuarterMetrics {
  ticker: string;
  companyName: string;
  periodEnd: string;
  quarterLabel: string;
  // Income
  revenue: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  netIncome: number | null;
  netMargin: number | null;
  sgaExpense: number | null;
  sgaPctRevenue: number | null;
  rdExpense: number | null;
  depreciation: number | null;
  // Balance sheet
  totalAssets: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  cashAndEquivalents: number | null;
  // Cash flow
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  // Ratios
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  fcfYield: number | null;
  // Per-unit (if available from segments)
  volumeHeads: number | null;
  volumeCwt: number | null;
  opPerHead: number | null;
  opPerCwt: number | null;
  revenuePerHead: number | null;
  revenuePerCwt: number | null;
  // Adjustments
  adjustedOperatingIncome: number | null;
  adjustedOperatingMargin: number | null;
  adjustedOpPerHead: number | null;
  adjustedOpPerCwt: number | null;
}

export interface MarginGap {
  metric: string;
  subjectValue: number | null;
  peerValue: number | null;
  gap: number | null;
  subjectBetter: boolean | null;
}

export interface PeerComparisonResult {
  /** Subject company ticker */
  subject: string;
  /** Peer tickers */
  peers: string[];
  /** Quarter being compared */
  periodEnd: string;
  quarterLabel: string;
  /** Per-company metrics for this quarter */
  companies: CompanyQuarterMetrics[];
  /** Margin gaps (subject vs each peer) */
  marginGaps: MarginGap[];
  /** Trend data: multiple quarters per company */
  trendData: Array<{
    ticker: string;
    companyName: string;
    quarters: CompanyQuarterMetrics[];
  }>;
}

// ---------------------------------------------------------------------------
// Extract metrics from a filing
// ---------------------------------------------------------------------------

export function filingToMetrics(filing: Filing): CompanyQuarterMetrics {
  const a = filing.analysis;
  const inc = a.incomeStatement ?? ({} as Partial<IncomeStatement>);
  const r = a.ratios ?? ({} as Partial<Ratios>);
  const q = deriveQuarter(filing.periodEnd);

  // Try to extract volume from segments
  let volumeHeads: number | null = null;
  let volumeCwt: number | null = null;
  let opPerHead: number | null = null;
  let opPerCwt: number | null = null;
  let revenuePerHead: number | null = null;
  let revenuePerCwt: number | null = null;

  if (a.segments) {
    for (const seg of a.segments) {
      if (seg.volumeUnits != null && seg.volumeUnitType === "head") {
        volumeHeads = (volumeHeads ?? 0) + seg.volumeUnits;
        if (seg.operatingIncomePerUnit != null) opPerHead = seg.operatingIncomePerUnit;
        if (seg.revenuePerUnit != null) revenuePerHead = seg.revenuePerUnit;
      }
      if (seg.volumeUnits != null && seg.volumeUnitType === "cwt") {
        volumeCwt = (volumeCwt ?? 0) + seg.volumeUnits;
        if (seg.operatingIncomePerUnit != null) opPerCwt = seg.operatingIncomePerUnit;
        if (seg.revenuePerUnit != null) revenuePerCwt = seg.revenuePerUnit;
      }
    }
  }

  const sgaPct = inc.sgaExpense != null && inc.revenue != null && inc.revenue > 0
    ? Math.round((inc.sgaExpense / inc.revenue) * 1000) / 10
    : null;

  return {
    ticker: filing.ticker,
    companyName: a.meta.companyName ?? filing.ticker,
    periodEnd: filing.periodEnd,
    quarterLabel: q.label,
    revenue: inc.revenue ?? null,
    grossProfit: inc.grossProfit ?? null,
    grossMargin: inc.grossMargin ?? null,
    operatingIncome: inc.operatingIncome ?? null,
    operatingMargin: inc.operatingMargin ?? null,
    ebitda: inc.ebitda ?? null,
    ebitdaMargin: inc.ebitdaMargin ?? null,
    netIncome: inc.netIncome ?? null,
    netMargin: inc.netMargin ?? null,
    sgaExpense: inc.sgaExpense ?? null,
    sgaPctRevenue: sgaPct,
    rdExpense: inc.rdExpense ?? null,
    depreciation: inc.depreciation ?? null,
    totalAssets: a.balanceSheet.totalAssets,
    totalEquity: a.balanceSheet.totalEquity,
    totalDebt: a.debtStructure.totalDebt,
    netDebt: a.debtStructure.netDebt,
    cashAndEquivalents: a.balanceSheet.cashAndEquivalents,
    operatingCashFlow: a.cashFlow.operatingCashFlow,
    capitalExpenditures: a.cashFlow.capitalExpenditures,
    freeCashFlow: a.cashFlow.freeCashFlow,
    dividendsPaid: a.cashFlow.dividendsPaid,
    debtToEquity: r.debtToEquity ?? null,
    currentRatio: r.currentRatio ?? null,
    interestCoverage: r.interestCoverage ?? null,
    returnOnEquity: r.returnOnEquity ?? null,
    returnOnAssets: r.returnOnAssets ?? null,
    fcfYield: r.fcfYield ?? null,
    volumeHeads,
    volumeCwt,
    opPerHead,
    opPerCwt,
    revenuePerHead,
    revenuePerCwt,
    // Adjustments default to unadjusted values (overrides applied at DataSource level)
    adjustedOperatingIncome: inc.operatingIncome ?? null,
    adjustedOperatingMargin: inc.operatingMargin ?? null,
    adjustedOpPerHead: opPerHead,
    adjustedOpPerCwt: opPerCwt,
  };
}

// ---------------------------------------------------------------------------
// Compute margin gaps
// ---------------------------------------------------------------------------

function computeMarginGaps(
  subject: CompanyQuarterMetrics,
  peers: CompanyQuarterMetrics[]
): MarginGap[] {
  const metrics: Array<{ metric: string; key: keyof CompanyQuarterMetrics }> = [
    { metric: "Gross Margin (%)", key: "grossMargin" },
    { metric: "Operating Margin (%)", key: "operatingMargin" },
    { metric: "EBITDA Margin (%)", key: "ebitdaMargin" },
    { metric: "Net Margin (%)", key: "netMargin" },
    { metric: "SG&A % Revenue", key: "sgaPctRevenue" },
    { metric: "ROE (%)", key: "returnOnEquity" },
    { metric: "ROA (%)", key: "returnOnAssets" },
    { metric: "D/E Ratio", key: "debtToEquity" },
    { metric: "Current Ratio", key: "currentRatio" },
    { metric: "FCF Yield (%)", key: "fcfYield" },
    { metric: "Adj. OP Margin (%)", key: "adjustedOperatingMargin" },
    { metric: "Adj. OP/Head ($)", key: "adjustedOpPerHead" },
    { metric: "Adj. OP/cwt ($)", key: "adjustedOpPerCwt" },
  ];

  const gaps: MarginGap[] = [];

  for (const peer of peers) {
    for (const { metric, key } of metrics) {
      const sv = subject[key] as number | null;
      const pv = peer[key] as number | null;
      const gap = sv != null && pv != null ? Math.round((sv - pv) * 10) / 10 : null;
      // For D/E and SG&A, lower is better
      const lowerBetter = key === "debtToEquity" || key === "sgaPctRevenue";
      const subjectBetter = gap != null ? (lowerBetter ? gap < 0 : gap > 0) : null;

      gaps.push({
        metric: `${metric} (vs ${peer.ticker})`,
        subjectValue: sv,
        peerValue: pv,
        gap,
        subjectBetter,
      });
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Build full comparison
// ---------------------------------------------------------------------------

/**
 * Build a peer comparison result from subject + peer filings.
 *
 * @param subjectFilings - All filings for the subject company (sorted desc)
 * @param peerFilingsMap - Map of peer ticker → filings (sorted desc)
 * @param targetPeriodEnd - Optional: which quarter to compare. Defaults to latest.
 */
export function buildPeerComparison(
  subjectFilings: Filing[],
  peerFilingsMap: Map<string, Filing[]>,
  targetPeriodEnd?: string
): PeerComparisonResult | null {
  if (subjectFilings.length === 0) return null;

  const subject = subjectFilings[0];
  const periodEnd = targetPeriodEnd ?? subject.periodEnd;
  const q = deriveQuarter(periodEnd);

  // Find closest filing to target period for each company
  function findClosest(filings: Filing[], target: string): Filing | null {
    // Exact match first
    const exact = filings.find(f => f.periodEnd === target);
    if (exact) return exact;
    // Within 45 days
    const targetMs = new Date(target).getTime();
    let best: Filing | null = null;
    let bestDiff = Infinity;
    for (const f of filings) {
      const diff = Math.abs(new Date(f.periodEnd).getTime() - targetMs);
      if (diff < bestDiff && diff < 45 * 86400000) {
        bestDiff = diff;
        best = f;
      }
    }
    return best;
  }

  const subjectFiling = findClosest(subjectFilings, periodEnd);
  if (!subjectFiling) return null;

  const subjectMetrics = filingToMetrics(subjectFiling);
  const companies: CompanyQuarterMetrics[] = [subjectMetrics];
  const peerMetrics: CompanyQuarterMetrics[] = [];

  for (const [, peerFilings] of peerFilingsMap) {
    const peerFiling = findClosest(peerFilings, periodEnd);
    if (peerFiling) {
      const m = filingToMetrics(peerFiling);
      companies.push(m);
      peerMetrics.push(m);
    }
  }

  // Margin gaps
  const marginGaps = computeMarginGaps(subjectMetrics, peerMetrics);

  // Trend data: last 8 quarters for each company
  const trendData: PeerComparisonResult["trendData"] = [];

  const allFilingsSets = [
    { ticker: subject.ticker, filings: subjectFilings },
    ...[...peerFilingsMap.entries()].map(([ticker, filings]) => ({ ticker, filings })),
  ];

  for (const { ticker, filings } of allFilingsSets) {
    const quarters = filings
      .slice(0, 8)
      .map(filingToMetrics)
      .reverse(); // chronological order
    if (quarters.length > 0) {
      trendData.push({
        ticker,
        companyName: quarters[0].companyName,
        quarters,
      });
    }
  }

  return {
    subject: subject.ticker,
    peers: [...peerFilingsMap.keys()],
    periodEnd,
    quarterLabel: q.label,
    companies,
    marginGaps,
    trendData,
  };
}
