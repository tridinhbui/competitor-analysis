/**
 * Analysis Modules — computation engine for all 9 competitor analysis modules.
 *
 * Pure functions. No I/O — callers provide filings data.
 * Every module works with partial data, producing results even if
 * some quarters or metrics are missing.
 */

import type { FullAnalysis, BSItem } from "@/types/analysis";
import type { Filing, PeerType, AnalysisModuleId } from "@/types/competitor";
import { deriveQuarter } from "./competitorService";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CellValue {
  value: number | string | null;
  format: "currency" | "percent" | "ratio" | "number" | "text";
  delta?: number | null;
  deltaType?: "positive-good" | "negative-good";
}

export interface TableRow {
  label: string;
  highlight?: boolean;
  cells: CellValue[];
}

export interface AnalysisTable {
  title: string;
  headers: string[];
  rows: TableRow[];
  footnotes?: string[];
}

export interface ModuleOutput {
  moduleId: AnalysisModuleId;
  title: string;
  description: string;
  available: boolean;
  partial: boolean;
  message?: string;
  tables: AnalysisTable[];
}

// ---------------------------------------------------------------------------
// Metric extraction from a single filing
// ---------------------------------------------------------------------------

export interface QuarterMetrics {
  ticker: string;
  companyName: string;
  peerType: PeerType;
  periodEnd: string;
  quarterLabel: string;
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  sgaExpense: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  cash: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  // Computed
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  roe: number | null;
  roa: number | null;
  // Segment-level data (from filing or manual entry)
  segments: import("@/types/segments").SegmentData[];
  // Methodology variants (for companies with allocation changes)
  methodologyVariants?: import("@/types/segments").MethodologyVariant[];
}

function findCfItem(items: BSItem[], ...tags: string[]): number | null {
  for (const tag of tags) {
    const item = items.find((i) => i.tag === tag);
    if (item && item.value != null) return item.value;
  }
  return null;
}

function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function extractMetrics(
  filing: Filing,
  peerType: PeerType = "diversified-protein"
): QuarterMetrics {
  const a = filing.analysis;
  const q = deriveQuarter(filing.periodEnd);
  const cf = a.cfItems ?? [];

  const revenue = findCfItem(cf, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet");
  const costOfRevenue = findCfItem(cf, "CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold");
  const grossProfit = findCfItem(cf, "GrossProfit");
  const sgaExpense = findCfItem(cf, "SellingGeneralAndAdministrativeExpense");
  const operatingIncome = findCfItem(cf, "OperatingIncomeLoss");
  const netIncome = a.cashFlow.netIncome;

  const computedGross = grossProfit ?? (revenue != null && costOfRevenue != null ? revenue - costOfRevenue : null);

  return {
    ticker: filing.ticker,
    companyName: a.meta.companyName ?? filing.ticker,
    peerType,
    periodEnd: filing.periodEnd,
    quarterLabel: q.label,
    revenue,
    costOfRevenue,
    grossProfit: computedGross,
    sgaExpense,
    operatingIncome,
    netIncome,
    totalAssets: a.balanceSheet.totalAssets || null,
    totalLiabilities: a.balanceSheet.totalLiabilities || null,
    totalEquity: a.balanceSheet.totalEquity || null,
    totalDebt: a.debtStructure.totalDebt || null,
    netDebt: a.debtStructure.netDebt || null,
    cash: a.balanceSheet.cashAndEquivalents || null,
    operatingCashFlow: a.cashFlow.operatingCashFlow,
    capex: a.cashFlow.capitalExpenditures,
    freeCashFlow: a.cashFlow.freeCashFlow,
    dividendsPaid: a.cashFlow.dividendsPaid,
    debtToEquity: a.ratios.debtToEquity,
    currentRatio: a.ratios.currentRatio,
    interestCoverage: a.ratios.interestCoverage,
    grossMargin: pct(computedGross, revenue),
    operatingMargin: pct(operatingIncome, revenue),
    netMargin: pct(netIncome, revenue),
    fcfMargin: pct(a.cashFlow.freeCashFlow, revenue),
    roe: pct(netIncome, a.balanceSheet.totalEquity || null),
    roa: pct(netIncome, a.balanceSheet.totalAssets || null),
    segments: a.segments ?? [],
    methodologyVariants: a.methodologyVariants,
  };
}

// ---------------------------------------------------------------------------
// Cell formatting helpers
// ---------------------------------------------------------------------------

function curr(v: number | null): CellValue {
  return { value: v, format: "currency" };
}

function pcell(v: number | null): CellValue {
  return { value: v, format: "percent" };
}

function rat(v: number | null): CellValue {
  return { value: v, format: "ratio" };
}

function num(v: number | null): CellValue {
  return { value: v, format: "number" };
}

function txt(v: string | null): CellValue {
  return { value: v, format: "text" };
}

function deltaCurr(
  current: number | null,
  previous: number | null,
  positiveGood = true
): CellValue {
  const delta = current != null && previous != null ? current - previous : null;
  return {
    value: current,
    format: "currency",
    delta,
    deltaType: positiveGood ? "positive-good" : "negative-good",
  };
}

function deltaPct(
  current: number | null,
  previous: number | null,
  positiveGood = true
): CellValue {
  const delta = current != null && previous != null ? current - previous : null;
  return {
    value: current,
    format: "percent",
    delta,
    deltaType: positiveGood ? "positive-good" : "negative-good",
  };
}

// ---------------------------------------------------------------------------
// Module 1: Benchmark Table
// ---------------------------------------------------------------------------

function computeBenchmarkTable(
  subjectMetrics: QuarterMetrics[],
  peerMetrics: Map<string, QuarterMetrics[]>
): ModuleOutput {
  // Use the latest quarter available for each company
  const latestSubject = subjectMetrics[0];
  if (!latestSubject) {
    return {
      moduleId: "benchmark-table",
      title: "Benchmark Table",
      description: "Side-by-side key metrics for subject vs. peers",
      available: false,
      partial: false,
      message: "No subject company data available.",
      tables: [],
    };
  }

  // Get latest quarter for each peer
  const allLatest: QuarterMetrics[] = [latestSubject];
  for (const [, metrics] of peerMetrics) {
    if (metrics.length > 0) allLatest.push(metrics[0]);
  }

  const headers = ["Metric", ...allLatest.map((m) => m.ticker)];

  type MetricDef = { label: string; key: keyof QuarterMetrics; fmt: (v: number | null) => CellValue };
  const metricDefs: MetricDef[] = [
    { label: "Revenue ($M)", key: "revenue", fmt: curr },
    { label: "Net Income ($M)", key: "netIncome", fmt: curr },
    { label: "Total Assets ($M)", key: "totalAssets", fmt: curr },
    { label: "Total Equity ($M)", key: "totalEquity", fmt: curr },
    { label: "Total Debt ($M)", key: "totalDebt", fmt: curr },
    { label: "Net Debt ($M)", key: "netDebt", fmt: curr },
    { label: "Cash ($M)", key: "cash", fmt: curr },
    { label: "Operating CF ($M)", key: "operatingCashFlow", fmt: curr },
    { label: "Free Cash Flow ($M)", key: "freeCashFlow", fmt: curr },
    { label: "Gross Margin %", key: "grossMargin", fmt: pcell },
    { label: "Operating Margin %", key: "operatingMargin", fmt: pcell },
    { label: "Net Margin %", key: "netMargin", fmt: pcell },
    { label: "FCF Margin %", key: "fcfMargin", fmt: pcell },
    { label: "Debt/Equity", key: "debtToEquity", fmt: rat },
    { label: "Current Ratio", key: "currentRatio", fmt: rat },
    { label: "Interest Coverage", key: "interestCoverage", fmt: rat },
    { label: "ROE %", key: "roe", fmt: pcell },
    { label: "ROA %", key: "roa", fmt: pcell },
  ];

  const rows: TableRow[] = metricDefs.map((def) => ({
    label: def.label,
    cells: allLatest.map((m, i) => ({
      ...def.fmt(m[def.key] as number | null),
      ...(i === 0 ? {} : {}),
    })),
  }));

  // Add quarter label row at top
  const quarterRow: TableRow = {
    label: "Quarter",
    cells: allLatest.map((m) => txt(m.quarterLabel)),
  };

  return {
    moduleId: "benchmark-table",
    title: "Benchmark Table",
    description: `Latest quarter comparison across ${allLatest.length} companies`,
    available: true,
    partial: allLatest.length < 2,
    message: allLatest.length < 2 ? "Add peer companies for full comparison." : undefined,
    tables: [
      {
        title: "Key Metrics Comparison",
        headers,
        rows: [quarterRow, ...rows],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Module 2: Sequential (QoQ) Comparison
// ---------------------------------------------------------------------------

function computeSequentialComparison(
  subjectMetrics: QuarterMetrics[]
): ModuleOutput {
  if (subjectMetrics.length < 2) {
    return {
      moduleId: "sequential-comparison",
      title: "Sequential (QoQ) Comparison",
      description: "Quarter-over-quarter changes",
      available: subjectMetrics.length >= 1,
      partial: true,
      message: subjectMetrics.length === 0
        ? "No data available."
        : "Need 2+ quarters for QoQ comparison. Showing latest quarter only.",
      tables: subjectMetrics.length === 1
        ? [buildSingleQuarterTable(subjectMetrics[0])]
        : [],
    };
  }

  // Sort oldest to newest
  const sorted = [...subjectMetrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const headers = ["Metric", ...sorted.map((m) => m.quarterLabel)];

  type SeqDef = { label: string; key: keyof QuarterMetrics; fmt: (c: number | null, p: number | null) => CellValue; positiveGood?: boolean };
  const defs: SeqDef[] = [
    { label: "Revenue ($M)", key: "revenue", fmt: deltaCurr },
    { label: "Net Income ($M)", key: "netIncome", fmt: deltaCurr },
    { label: "Gross Margin %", key: "grossMargin", fmt: deltaPct },
    { label: "Operating Margin %", key: "operatingMargin", fmt: deltaPct },
    { label: "Net Margin %", key: "netMargin", fmt: deltaPct },
    { label: "Total Assets ($M)", key: "totalAssets", fmt: deltaCurr },
    { label: "Total Debt ($M)", key: "totalDebt", fmt: (c, p) => deltaCurr(c, p, false), positiveGood: false },
    { label: "Operating CF ($M)", key: "operatingCashFlow", fmt: deltaCurr },
    { label: "Free Cash Flow ($M)", key: "freeCashFlow", fmt: deltaCurr },
    { label: "Debt/Equity", key: "debtToEquity", fmt: (c, p) => {
      const delta = c != null && p != null ? c - p : null;
      return { value: c, format: "ratio" as const, delta, deltaType: "negative-good" as const };
    }},
    { label: "Current Ratio", key: "currentRatio", fmt: (c, p) => {
      const delta = c != null && p != null ? c - p : null;
      return { value: c, format: "ratio" as const, delta, deltaType: "positive-good" as const };
    }},
  ];

  const rows: TableRow[] = defs.map((def) => ({
    label: def.label,
    cells: sorted.map((m, i) => {
      const prev = i > 0 ? sorted[i - 1] : null;
      return def.fmt(m[def.key] as number | null, prev ? (prev[def.key] as number | null) : null);
    }),
  }));

  return {
    moduleId: "sequential-comparison",
    title: "Sequential (QoQ) Comparison",
    description: `${sorted.length} quarters, ${sorted[0].quarterLabel} → ${sorted[sorted.length - 1].quarterLabel}`,
    available: true,
    partial: sorted.length < 4,
    message: sorted.length < 4 ? `Showing ${sorted.length} quarters. Add more for fuller trend.` : undefined,
    tables: [{ title: "Quarter-over-Quarter Trends", headers, rows }],
  };
}

function buildSingleQuarterTable(m: QuarterMetrics): AnalysisTable {
  return {
    title: `${m.quarterLabel} Snapshot`,
    headers: ["Metric", "Value"],
    rows: [
      { label: "Revenue ($M)", cells: [curr(m.revenue)] },
      { label: "Net Income ($M)", cells: [curr(m.netIncome)] },
      { label: "Total Assets ($M)", cells: [curr(m.totalAssets)] },
      { label: "Total Debt ($M)", cells: [curr(m.totalDebt)] },
      { label: "Free Cash Flow ($M)", cells: [curr(m.freeCashFlow)] },
      { label: "Net Margin %", cells: [pcell(m.netMargin)] },
      { label: "Debt/Equity", cells: [rat(m.debtToEquity)] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Module 3: YoY Comparison
// ---------------------------------------------------------------------------

function computeYoYComparison(
  subjectMetrics: QuarterMetrics[]
): ModuleOutput {
  // Group by fiscal quarter
  const byFQ = new Map<number, QuarterMetrics[]>();
  for (const m of subjectMetrics) {
    const q = deriveQuarter(m.periodEnd);
    const arr = byFQ.get(q.fiscalQuarter) ?? [];
    arr.push(m);
    byFQ.set(q.fiscalQuarter, arr);
  }

  // Find quarters that have 2+ years
  const yoyPairs: Array<{ label: string; current: QuarterMetrics; prior: QuarterMetrics }> = [];
  for (const [fq, metrics] of byFQ) {
    const sorted = [...metrics].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    for (let i = 0; i < sorted.length - 1; i++) {
      yoyPairs.push({
        label: `Q${fq}`,
        current: sorted[i],
        prior: sorted[i + 1],
      });
    }
  }

  if (yoyPairs.length === 0) {
    return {
      moduleId: "yoy-comparison",
      title: "Year-over-Year Comparison",
      description: "Same quarter prior year comparison",
      available: subjectMetrics.length >= 1,
      partial: true,
      message: "Need same quarter from 2 different years. Keep adding quarters.",
      tables: subjectMetrics.length >= 1 ? [buildSingleQuarterTable(subjectMetrics[0])] : [],
    };
  }

  const tables: AnalysisTable[] = yoyPairs.map((pair) => {
    const currentYear = deriveQuarter(pair.current.periodEnd).fiscalYear;
    const priorYear = deriveQuarter(pair.prior.periodEnd).fiscalYear;

    type YoyDef = { label: string; key: keyof QuarterMetrics; fmt: (c: number | null, p: number | null) => CellValue };
    const defs: YoyDef[] = [
      { label: "Revenue ($M)", key: "revenue", fmt: deltaCurr },
      { label: "Net Income ($M)", key: "netIncome", fmt: deltaCurr },
      { label: "Gross Margin %", key: "grossMargin", fmt: deltaPct },
      { label: "Net Margin %", key: "netMargin", fmt: deltaPct },
      { label: "Total Assets ($M)", key: "totalAssets", fmt: deltaCurr },
      { label: "Total Debt ($M)", key: "totalDebt", fmt: (c, p) => deltaCurr(c, p, false) },
      { label: "Free Cash Flow ($M)", key: "freeCashFlow", fmt: deltaCurr },
      { label: "Debt/Equity", key: "debtToEquity", fmt: (c, p) => {
        const delta = c != null && p != null ? c - p : null;
        return { value: c, format: "ratio" as const, delta, deltaType: "negative-good" as const };
      }},
    ];

    return {
      title: `${pair.label}: ${currentYear} vs ${priorYear}`,
      headers: ["Metric", `${pair.label} ${priorYear}`, `${pair.label} ${currentYear}`, "Change"],
      rows: defs.map((def) => {
        const priorVal = pair.prior[def.key] as number | null;
        const currentVal = pair.current[def.key] as number | null;
        const change = currentVal != null && priorVal != null ? currentVal - priorVal : null;
        const changePct = currentVal != null && priorVal != null && priorVal !== 0
          ? Math.round(((currentVal - priorVal) / Math.abs(priorVal)) * 1000) / 10
          : null;
        return {
          label: def.label,
          cells: [
            def.fmt(priorVal, null),
            def.fmt(currentVal, priorVal),
            { value: changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}%` : null, format: "text" as const },
          ],
        };
      }),
    };
  });

  return {
    moduleId: "yoy-comparison",
    title: "Year-over-Year Comparison",
    description: `${yoyPairs.length} YoY comparison(s) available`,
    available: true,
    partial: yoyPairs.length < 4,
    tables,
  };
}

// ---------------------------------------------------------------------------
// Module 4: TTM Comparison
// ---------------------------------------------------------------------------

function computeTTM(subjectMetrics: QuarterMetrics[]): ModuleOutput {
  const sorted = [...subjectMetrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  if (sorted.length < 4) {
    return {
      moduleId: "ttm-comparison",
      title: "Trailing Twelve Months",
      description: "Rolling 4-quarter aggregation",
      available: sorted.length >= 1,
      partial: true,
      message: `Need 4 quarters for TTM. Have ${sorted.length}.`,
      tables: sorted.length >= 1 ? [buildSingleQuarterTable(sorted[sorted.length - 1])] : [],
    };
  }

  // Compute TTM windows
  const ttmWindows: Array<{ label: string; metrics: QuarterMetrics[] }> = [];
  for (let i = 3; i < sorted.length; i++) {
    ttmWindows.push({
      label: `TTM ending ${sorted[i].quarterLabel}`,
      metrics: sorted.slice(i - 3, i + 1),
    });
  }

  function sumField(metrics: QuarterMetrics[], key: keyof QuarterMetrics): number | null {
    const vals = metrics.map((m) => m[key] as number | null).filter((v) => v != null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b!, 0) * 10) / 10;
  }

  const headers = ["Metric", ...ttmWindows.map((w) => w.label)];

  type TtmDef = { label: string; key: keyof QuarterMetrics };
  const defs: TtmDef[] = [
    { label: "Revenue ($M)", key: "revenue" },
    { label: "Net Income ($M)", key: "netIncome" },
    { label: "Operating CF ($M)", key: "operatingCashFlow" },
    { label: "Free Cash Flow ($M)", key: "freeCashFlow" },
    { label: "CapEx ($M)", key: "capex" },
    { label: "Dividends ($M)", key: "dividendsPaid" },
  ];

  const rows: TableRow[] = defs.map((def) => ({
    label: def.label,
    cells: ttmWindows.map((w, wi) => {
      const val = sumField(w.metrics, def.key);
      const prev = wi > 0 ? sumField(ttmWindows[wi - 1].metrics, def.key) : null;
      return deltaCurr(val, prev);
    }),
  }));

  // Add computed margins for TTM
  const marginRows: TableRow[] = [
    {
      label: "TTM Net Margin %",
      cells: ttmWindows.map((w) => {
        const rev = sumField(w.metrics, "revenue");
        const ni = sumField(w.metrics, "netIncome");
        return pcell(pct(ni, rev));
      }),
    },
    {
      label: "TTM FCF Margin %",
      cells: ttmWindows.map((w) => {
        const rev = sumField(w.metrics, "revenue");
        const fcf = sumField(w.metrics, "freeCashFlow");
        return pcell(pct(fcf, rev));
      }),
    },
  ];

  return {
    moduleId: "ttm-comparison",
    title: "Trailing Twelve Months",
    description: `${ttmWindows.length} TTM window(s)`,
    available: true,
    partial: false,
    tables: [{ title: "TTM Aggregated Metrics", headers, rows: [...rows, ...marginRows] }],
  };
}

// ---------------------------------------------------------------------------
// Module 5: Margin Gap Analysis
// ---------------------------------------------------------------------------

function computeMarginGap(
  subjectMetrics: QuarterMetrics[],
  peerMetrics: Map<string, QuarterMetrics[]>
): ModuleOutput {
  const latestSubject = subjectMetrics[0];
  if (!latestSubject) {
    return {
      moduleId: "margin-gap-analysis",
      title: "Margin Gap Analysis",
      description: "Margin comparison vs. peers",
      available: false,
      partial: false,
      message: "No subject company data.",
      tables: [],
    };
  }

  // Collect latest metrics from each peer
  const peerLatest: QuarterMetrics[] = [];
  for (const [, metrics] of peerMetrics) {
    if (metrics.length > 0) peerLatest.push(metrics[0]);
  }

  function avg(values: (number | null)[]): number | null {
    const valid = values.filter((v) => v != null) as number[];
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
  }

  type MarginDef = { label: string; key: keyof QuarterMetrics };
  const marginDefs: MarginDef[] = [
    { label: "Gross Margin %", key: "grossMargin" },
    { label: "Operating Margin %", key: "operatingMargin" },
    { label: "Net Margin %", key: "netMargin" },
    { label: "FCF Margin %", key: "fcfMargin" },
    { label: "ROE %", key: "roe" },
    { label: "ROA %", key: "roa" },
  ];

  const hasPeers = peerLatest.length > 0;
  const headers = hasPeers
    ? ["Metric", latestSubject.ticker, "Peer Avg", "Gap (bps)", ...peerLatest.map((p) => p.ticker)]
    : ["Metric", latestSubject.ticker];

  const rows: TableRow[] = marginDefs.map((def) => {
    const subjectVal = latestSubject[def.key] as number | null;
    if (!hasPeers) {
      return { label: def.label, cells: [pcell(subjectVal)] };
    }

    const peerVals = peerLatest.map((p) => p[def.key] as number | null);
    const peerAvg = avg(peerVals);
    const gap = subjectVal != null && peerAvg != null
      ? Math.round((subjectVal - peerAvg) * 10)
      : null;

    return {
      label: def.label,
      cells: [
        pcell(subjectVal),
        pcell(peerAvg),
        { value: gap, format: "number" as const, delta: gap, deltaType: "positive-good" as const },
        ...peerLatest.map((p) => pcell(p[def.key] as number | null)),
      ],
    };
  });

  return {
    moduleId: "margin-gap-analysis",
    title: "Margin Gap Analysis",
    description: hasPeers
      ? `Subject vs. ${peerLatest.length} peer(s)`
      : "Subject company margins (add peers for gap analysis)",
    available: true,
    partial: !hasPeers,
    message: !hasPeers ? "Add peer companies to see margin gaps." : undefined,
    tables: [{ title: "Margin Comparison", headers, rows }],
  };
}

// ---------------------------------------------------------------------------
// Module 6: Unit Economics
// ---------------------------------------------------------------------------

function computeUnitEconomics(subjectMetrics: QuarterMetrics[]): ModuleOutput {
  if (subjectMetrics.length === 0) {
    return {
      moduleId: "unit-economics",
      title: "Unit Economics",
      description: "Revenue, cost, and margin analysis",
      available: false,
      partial: false,
      message: "No data available.",
      tables: [],
    };
  }

  const sorted = [...subjectMetrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const headers = ["Metric", ...sorted.map((m) => m.quarterLabel)];

  const rows: TableRow[] = [
    {
      label: "Revenue ($M)",
      cells: sorted.map((m) => curr(m.revenue)),
    },
    {
      label: "Cost of Revenue ($M)",
      cells: sorted.map((m) => curr(m.costOfRevenue)),
    },
    {
      label: "Gross Profit ($M)",
      cells: sorted.map((m) => curr(m.grossProfit)),
    },
    {
      label: "SG&A ($M)",
      cells: sorted.map((m) => curr(m.sgaExpense)),
    },
    {
      label: "Operating Income ($M)",
      cells: sorted.map((m) => curr(m.operatingIncome)),
    },
    {
      label: "Gross Margin %",
      cells: sorted.map((m) => pcell(m.grossMargin)),
    },
    {
      label: "SG&A / Revenue %",
      cells: sorted.map((m) => pcell(pct(m.sgaExpense, m.revenue))),
    },
    {
      label: "Operating Margin %",
      cells: sorted.map((m) => pcell(m.operatingMargin)),
    },
    {
      label: "CapEx ($M)",
      cells: sorted.map((m) => curr(m.capex)),
    },
    {
      label: "CapEx / Revenue %",
      cells: sorted.map((m) => pcell(pct(m.capex, m.revenue))),
    },
  ];

  return {
    moduleId: "unit-economics",
    title: "Unit Economics",
    description: `Cost structure across ${sorted.length} quarter(s)`,
    available: true,
    partial: sorted.length < 4,
    tables: [{ title: "Cost & Margin Breakdown", headers, rows }],
  };
}

// ---------------------------------------------------------------------------
// Module 7: SG&A Comparison
// ---------------------------------------------------------------------------

function computeSGAComparison(
  subjectMetrics: QuarterMetrics[],
  peerMetrics: Map<string, QuarterMetrics[]>
): ModuleOutput {
  const latestSubject = subjectMetrics[0];
  if (!latestSubject) {
    return {
      moduleId: "sga-comparison",
      title: "SG&A Comparison",
      description: "SG&A expense benchmarking",
      available: false,
      partial: false,
      message: "No data available.",
      tables: [],
    };
  }

  const allLatest: QuarterMetrics[] = [latestSubject];
  for (const [, metrics] of peerMetrics) {
    if (metrics.length > 0) allLatest.push(metrics[0]);
  }

  const headers = ["Metric", ...allLatest.map((m) => m.ticker)];

  const rows: TableRow[] = [
    {
      label: "Revenue ($M)",
      cells: allLatest.map((m) => curr(m.revenue)),
    },
    {
      label: "SG&A ($M)",
      cells: allLatest.map((m) => curr(m.sgaExpense)),
    },
    {
      label: "SG&A / Revenue %",
      cells: allLatest.map((m) => pcell(pct(m.sgaExpense, m.revenue))),
    },
    {
      label: "Gross Profit ($M)",
      cells: allLatest.map((m) => curr(m.grossProfit)),
    },
    {
      label: "SG&A / Gross Profit %",
      cells: allLatest.map((m) => pcell(pct(m.sgaExpense, m.grossProfit))),
    },
    {
      label: "Operating Income ($M)",
      cells: allLatest.map((m) => curr(m.operatingIncome)),
    },
    {
      label: "Operating Margin %",
      cells: allLatest.map((m) => pcell(m.operatingMargin)),
    },
  ];

  return {
    moduleId: "sga-comparison",
    title: "SG&A Comparison",
    description: allLatest.length > 1
      ? `SG&A benchmarking across ${allLatest.length} companies`
      : "Subject company SG&A (add peers for comparison)",
    available: true,
    partial: allLatest.length < 2,
    message: allLatest.length < 2 ? "Add peer companies for SG&A benchmarking." : undefined,
    tables: [{ title: "SG&A Benchmarking", headers, rows }],
  };
}

// ---------------------------------------------------------------------------
// Module 8: Appendix Tables
// ---------------------------------------------------------------------------

function computeAppendixTables(subjectMetrics: QuarterMetrics[]): ModuleOutput {
  if (subjectMetrics.length === 0) {
    return {
      moduleId: "appendix-tables",
      title: "Appendix Tables",
      description: "Full financial statement extracts",
      available: false,
      partial: false,
      message: "No data available.",
      tables: [],
    };
  }

  const sorted = [...subjectMetrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const headers = ["Item", ...sorted.map((m) => m.quarterLabel)];

  // Balance Sheet
  const bsRows: TableRow[] = [
    { label: "Total Assets", cells: sorted.map((m) => curr(m.totalAssets)) },
    { label: "Total Liabilities", cells: sorted.map((m) => curr(m.totalLiabilities)) },
    { label: "Total Equity", cells: sorted.map((m) => curr(m.totalEquity)) },
    { label: "Cash & Equivalents", cells: sorted.map((m) => curr(m.cash)) },
    { label: "Total Debt", cells: sorted.map((m) => curr(m.totalDebt)) },
    { label: "Net Debt", cells: sorted.map((m) => curr(m.netDebt)) },
  ];

  // Income Statement
  const isRows: TableRow[] = [
    { label: "Revenue", cells: sorted.map((m) => curr(m.revenue)) },
    { label: "Cost of Revenue", cells: sorted.map((m) => curr(m.costOfRevenue)) },
    { label: "Gross Profit", cells: sorted.map((m) => curr(m.grossProfit)) },
    { label: "SG&A", cells: sorted.map((m) => curr(m.sgaExpense)) },
    { label: "Operating Income", cells: sorted.map((m) => curr(m.operatingIncome)) },
    { label: "Net Income", cells: sorted.map((m) => curr(m.netIncome)) },
  ];

  // Cash Flow
  const cfRows: TableRow[] = [
    { label: "Operating Cash Flow", cells: sorted.map((m) => curr(m.operatingCashFlow)) },
    { label: "Capital Expenditures", cells: sorted.map((m) => curr(m.capex)) },
    { label: "Free Cash Flow", cells: sorted.map((m) => curr(m.freeCashFlow)) },
    { label: "Dividends Paid", cells: sorted.map((m) => curr(m.dividendsPaid)) },
  ];

  // Ratios
  const ratioRows: TableRow[] = [
    { label: "Debt/Equity", cells: sorted.map((m) => rat(m.debtToEquity)) },
    { label: "Current Ratio", cells: sorted.map((m) => rat(m.currentRatio)) },
    { label: "Interest Coverage", cells: sorted.map((m) => rat(m.interestCoverage)) },
    { label: "Gross Margin %", cells: sorted.map((m) => pcell(m.grossMargin)) },
    { label: "Net Margin %", cells: sorted.map((m) => pcell(m.netMargin)) },
    { label: "ROE %", cells: sorted.map((m) => pcell(m.roe)) },
    { label: "ROA %", cells: sorted.map((m) => pcell(m.roa)) },
  ];

  return {
    moduleId: "appendix-tables",
    title: "Appendix Tables",
    description: `Full financials across ${sorted.length} quarter(s)`,
    available: true,
    partial: false,
    tables: [
      { title: "Balance Sheet ($M)", headers, rows: bsRows },
      { title: "Income Statement ($M)", headers, rows: isRows },
      { title: "Cash Flow Statement ($M)", headers, rows: cfRows },
      { title: "Key Ratios", headers, rows: ratioRows },
    ],
  };
}

// ---------------------------------------------------------------------------
// Module 9: Peer-Specific
// ---------------------------------------------------------------------------

function computePeerSpecific(
  subjectMetrics: QuarterMetrics[],
  peerMetrics: Map<string, QuarterMetrics[]>
): ModuleOutput {
  if (subjectMetrics.length === 0 || peerMetrics.size === 0) {
    return {
      moduleId: "peer-specific",
      title: "Peer-Specific Analysis",
      description: "Deep-dive comparison vs. individual peers",
      available: subjectMetrics.length >= 1,
      partial: true,
      message: peerMetrics.size === 0 ? "Add peer companies for peer analysis." : "No subject data.",
      tables: subjectMetrics.length >= 1 ? [buildSingleQuarterTable(subjectMetrics[0])] : [],
    };
  }

  const latestSubject = subjectMetrics[0];
  const tables: AnalysisTable[] = [];

  for (const [peerTicker, metrics] of peerMetrics) {
    if (metrics.length === 0) continue;
    const latestPeer = metrics[0];

    type PeerDef = { label: string; key: keyof QuarterMetrics; fmt: (v: number | null) => CellValue };
    const defs: PeerDef[] = [
      { label: "Revenue ($M)", key: "revenue", fmt: curr },
      { label: "Net Income ($M)", key: "netIncome", fmt: curr },
      { label: "Total Assets ($M)", key: "totalAssets", fmt: curr },
      { label: "Total Debt ($M)", key: "totalDebt", fmt: curr },
      { label: "Free Cash Flow ($M)", key: "freeCashFlow", fmt: curr },
      { label: "Gross Margin %", key: "grossMargin", fmt: pcell },
      { label: "Net Margin %", key: "netMargin", fmt: pcell },
      { label: "Debt/Equity", key: "debtToEquity", fmt: rat },
      { label: "Current Ratio", key: "currentRatio", fmt: rat },
      { label: "ROE %", key: "roe", fmt: pcell },
    ];

    tables.push({
      title: `${latestSubject.ticker} vs ${peerTicker} (${latestPeer.companyName})`,
      headers: ["Metric", latestSubject.ticker, peerTicker, "Difference"],
      rows: defs.map((def) => {
        const sv = latestSubject[def.key] as number | null;
        const pv = latestPeer[def.key] as number | null;
        const diff = sv != null && pv != null ? Math.round((sv - pv) * 10) / 10 : null;
        return {
          label: def.label,
          cells: [def.fmt(sv), def.fmt(pv), num(diff)],
        };
      }),
    });
  }

  return {
    moduleId: "peer-specific",
    title: "Peer-Specific Analysis",
    description: `Head-to-head comparison with ${tables.length} peer(s)`,
    available: true,
    partial: false,
    tables,
  };
}

// ---------------------------------------------------------------------------
// Main: compute all modules
// ---------------------------------------------------------------------------

export interface AnalysisInput {
  subjectTicker: string;
  subjectFilings: Filing[];
  subjectPeerType: PeerType;
  peerFilings: Map<string, { filings: Filing[]; peerType: PeerType }>;
}

export function computeAllModules(input: AnalysisInput): ModuleOutput[] {
  // Extract metrics for subject
  const subjectMetrics = input.subjectFilings
    .map((f) => extractMetrics(f, input.subjectPeerType))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)); // latest first

  // Extract metrics for peers
  const peerMetrics = new Map<string, QuarterMetrics[]>();
  for (const [ticker, data] of input.peerFilings) {
    const metrics = data.filings
      .map((f) => extractMetrics(f, data.peerType))
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    peerMetrics.set(ticker, metrics);
  }

  return [
    computeBenchmarkTable(subjectMetrics, peerMetrics),
    computeSequentialComparison(subjectMetrics),
    computeYoYComparison(subjectMetrics),
    computeTTM(subjectMetrics),
    computeMarginGap(subjectMetrics, peerMetrics),
    computeUnitEconomics(subjectMetrics),
    computeSGAComparison(subjectMetrics, peerMetrics),
    computeAppendixTables(subjectMetrics),
    computePeerSpecific(subjectMetrics, peerMetrics),
  ];
}
