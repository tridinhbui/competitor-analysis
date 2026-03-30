/**
 * Insight Engine — deterministic, finance-oriented insight generation.
 *
 * Generates structured insight statements for each slide block type.
 * Every insight is numerically grounded and tied to metrics.
 * Low-confidence situations are explicitly flagged.
 *
 * Combined Sprint 7 (insights) + Sprint 8 (commentary style engine).
 *
 * Commentary pattern:
 *   [Observation] + [Numerical comparison] + [Driver explanation] + [Context]
 *
 * Tone: concise, analytical, neutral, executive-level.
 */

import type { QuarterMetrics } from "./analysisModules";
import type { SlideBlockType } from "@/types/slideBlocks";

// ---------------------------------------------------------------------------
// Insight types
// ---------------------------------------------------------------------------

export type InsightConfidence = "high" | "medium" | "low";

export interface Insight {
  /** The slide block this insight belongs to */
  blockType: SlideBlockType;
  /** Block-level ID for correlation */
  blockId: string;
  /** The main insight statement (1-3 sentences) */
  statement: string;
  /** Confidence in the driver attribution */
  confidence: InsightConfidence;
  /** Why this confidence level */
  confidenceReason: string;
  /** Driver category if identified */
  driver?: "volume" | "pricing" | "cost" | "mix" | "leverage" | "structure" | "unknown";
  /** Key metrics referenced */
  referencedMetrics: Array<{ label: string; value: string }>;
  /** Whether this insight has been user-edited */
  edited: boolean;
  /** Whether this insight is locked from regeneration */
  locked: boolean;
  /** Original statement (if edited) */
  originalStatement?: string;
}

// ---------------------------------------------------------------------------
// Driver detection
// ---------------------------------------------------------------------------

interface DriverResult {
  driver: Insight["driver"];
  confidence: InsightConfidence;
  reason: string;
}

function detectDriver(
  current: QuarterMetrics,
  prior: QuarterMetrics
): DriverResult {
  const revChange = safePctChange(current.revenue, prior.revenue);
  const opChange = safePctChange(current.operatingIncome, prior.operatingIncome);
  const niChange = safePctChange(current.netIncome, prior.netIncome);
  const marginChange = safeDiff(current.netMargin, prior.netMargin);
  const grossMarginChange = safeDiff(current.grossMargin, prior.grossMargin);

  // If Sales ↑ and OP ↑ but Margin flat → volume-driven
  if (revChange != null && opChange != null && marginChange != null) {
    if (revChange > 5 && opChange > 5 && Math.abs(marginChange) < 1.5) {
      return { driver: "volume", confidence: "high", reason: "Revenue and operating income grew proportionally with stable margins" };
    }
  }

  // If Sales ↑ but OP ↓ → cost pressure
  if (revChange != null && opChange != null) {
    if (revChange > 3 && opChange < -3) {
      return { driver: "cost", confidence: "high", reason: "Revenue grew but operating income declined, indicating cost pressure" };
    }
  }

  // If Margin ↑ significantly → mix or pricing
  if (grossMarginChange != null && grossMarginChange > 2) {
    return { driver: "mix", confidence: "medium", reason: "Gross margin expanded significantly, suggesting favorable mix or pricing" };
  }

  // If OP change >> Sales change → cost leverage or inefficiency
  if (revChange != null && opChange != null) {
    if (Math.abs(opChange) > Math.abs(revChange) * 2 && opChange > 0) {
      return { driver: "leverage", confidence: "medium", reason: "Operating income change exceeded revenue change, indicating operating leverage" };
    }
    if (Math.abs(opChange) > Math.abs(revChange) * 2 && opChange < 0) {
      return { driver: "cost", confidence: "medium", reason: "Operating income decline exceeded revenue change, indicating cost inefficiency" };
    }
  }

  // If we have revenue change but nothing else clear
  if (revChange != null && Math.abs(revChange) > 3) {
    return { driver: "volume", confidence: "low", reason: "Revenue changed but cannot confidently determine underlying driver" };
  }

  return { driver: "unknown", confidence: "low", reason: "Insufficient data to determine performance driver" };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function safePctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function safeDiff(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  return current - prior;
}

function fmtM(v: number | null): string {
  if (v == null) return "N/A";
  return v < 0 ? `($${Math.abs(v).toLocaleString()}M)` : `$${v.toLocaleString()}M`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "N/A";
  return `${v.toFixed(1)}%`;
}

function fmtChg(v: number | null): string {
  if (v == null) return "N/A";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function fmtBps(v: number | null): string {
  if (v == null) return "N/A";
  const bps = Math.round(v * 10);
  return `${bps > 0 ? "+" : ""}${bps}bps`;
}

function direction(v: number | null): string {
  if (v == null) return "was unchanged";
  if (v > 0.5) return "improved";
  if (v < -0.5) return "compressed";
  return "remained stable";
}

function changeVerb(v: number | null): string {
  if (v == null) return "was flat";
  if (v > 5) return "increased significantly";
  if (v > 0) return "increased";
  if (v < -5) return "declined significantly";
  if (v < 0) return "declined";
  return "was flat";
}

// ---------------------------------------------------------------------------
// Insight generators by block type
// ---------------------------------------------------------------------------

function generateBenchmarkInsight(
  subject: QuarterMetrics,
  peers: QuarterMetrics[],
  blockId: string
): Insight {
  const refs: Insight["referencedMetrics"] = [];

  if (subject.revenue != null) refs.push({ label: "Revenue", value: fmtM(subject.revenue) });
  if (subject.netMargin != null) refs.push({ label: "Net Margin", value: fmtPct(subject.netMargin) });

  if (peers.length === 0) {
    return {
      blockType: "benchmark-table",
      blockId,
      statement: `${subject.companyName} reported revenue of ${fmtM(subject.revenue)} with a net margin of ${fmtPct(subject.netMargin)} in ${subject.quarterLabel}. No peer data available for benchmarking.`,
      confidence: "medium",
      confidenceReason: "Subject metrics available but no peer comparison possible",
      referencedMetrics: refs,
      edited: false,
      locked: false,
    };
  }

  // Compare subject margin to peer average
  const peerMargins = peers.map((p) => p.netMargin).filter((v) => v != null) as number[];
  const avgPeerMargin = peerMargins.length > 0 ? peerMargins.reduce((a, b) => a + b, 0) / peerMargins.length : null;

  let comparison = "";
  if (subject.netMargin != null && avgPeerMargin != null) {
    const gap = subject.netMargin - avgPeerMargin;
    refs.push({ label: "Peer Avg Margin", value: fmtPct(avgPeerMargin) });
    if (gap > 1) {
      comparison = `, outperforming the peer average margin of ${fmtPct(avgPeerMargin)} by ${fmtBps(gap)}`;
    } else if (gap < -1) {
      comparison = `, lagging the peer average margin of ${fmtPct(avgPeerMargin)} by ${fmtBps(Math.abs(gap))}`;
    } else {
      comparison = `, in line with the peer average margin of ${fmtPct(avgPeerMargin)}`;
    }
  }

  return {
    blockType: "benchmark-table",
    blockId,
    statement: `${subject.companyName} reported revenue of ${fmtM(subject.revenue)} with a net margin of ${fmtPct(subject.netMargin)} in ${subject.quarterLabel}${comparison}.`,
    confidence: peerMargins.length > 0 ? "high" : "medium",
    confidenceReason: peerMargins.length > 0 ? "Full peer comparison available" : "Limited peer data",
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

function generateSequentialInsight(
  current: QuarterMetrics,
  prior: QuarterMetrics,
  blockId: string
): Insight {
  const revChange = safePctChange(current.revenue, prior.revenue);
  const niChange = safePctChange(current.netIncome, prior.netIncome);
  const marginChange = safeDiff(current.netMargin, prior.netMargin);
  const driverResult = detectDriver(current, prior);

  const refs: Insight["referencedMetrics"] = [];
  if (current.revenue != null) refs.push({ label: "Revenue", value: fmtM(current.revenue) });
  if (revChange != null) refs.push({ label: "Revenue Chg", value: fmtChg(revChange) });
  if (current.netMargin != null) refs.push({ label: "Net Margin", value: fmtPct(current.netMargin) });

  const parts: string[] = [];

  // Observation
  parts.push(`Revenue ${changeVerb(revChange)} to ${fmtM(current.revenue)} in ${current.quarterLabel} from ${fmtM(prior.revenue)} in ${prior.quarterLabel}`);

  // Numerical comparison
  if (revChange != null) parts.push(`(${fmtChg(revChange)} QoQ)`);

  // Margin direction
  if (marginChange != null) {
    parts.push(`. Net margin ${direction(marginChange)} at ${fmtPct(current.netMargin)} (${fmtBps(marginChange)} QoQ)`);
  }

  // Driver
  if (driverResult.driver !== "unknown") {
    const driverText: Record<string, string> = {
      volume: ", driven by volume growth",
      pricing: ", driven by pricing improvements",
      cost: ", reflecting cost pressure",
      mix: ", driven by favorable product mix",
      leverage: ", benefiting from operating leverage",
      structure: ", reflecting structural changes",
    };
    parts.push(driverResult.driver ? (driverText[driverResult.driver] ?? "") : "");
  }

  return {
    blockType: "sequential-comparison",
    blockId,
    statement: parts.join("") + ".",
    confidence: driverResult.confidence,
    confidenceReason: driverResult.reason,
    driver: driverResult.driver,
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

function generateYoYInsight(
  current: QuarterMetrics,
  yearAgo: QuarterMetrics,
  blockId: string
): Insight {
  const revChange = safePctChange(current.revenue, yearAgo.revenue);
  const niChange = safePctChange(current.netIncome, yearAgo.netIncome);
  const marginChange = safeDiff(current.netMargin, yearAgo.netMargin);
  const driverResult = detectDriver(current, yearAgo);

  const refs: Insight["referencedMetrics"] = [];
  if (current.revenue != null) refs.push({ label: "Revenue", value: fmtM(current.revenue) });
  if (revChange != null) refs.push({ label: "YoY Revenue Chg", value: fmtChg(revChange) });
  if (marginChange != null) refs.push({ label: "Margin Chg", value: fmtBps(marginChange) });

  let statement = `Year-over-year, revenue ${changeVerb(revChange)} (${fmtChg(revChange)}) to ${fmtM(current.revenue)}.`;

  if (marginChange != null) {
    statement += ` Net margin ${direction(marginChange)} from ${fmtPct(yearAgo.netMargin)} to ${fmtPct(current.netMargin)} (${fmtBps(marginChange)}).`;
  }

  if (niChange != null && Math.abs(niChange) > 10) {
    statement += ` Net income ${changeVerb(niChange)} (${fmtChg(niChange)}), ${niChange > 0 ? "reflecting improved profitability" : "indicating earnings pressure"}.`;
  }

  return {
    blockType: "yoy-comparison",
    blockId,
    statement,
    confidence: driverResult.confidence,
    confidenceReason: driverResult.reason,
    driver: driverResult.driver,
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

function generateTTMInsight(
  metrics: QuarterMetrics[],
  blockId: string
): Insight {
  if (metrics.length < 4) {
    return {
      blockType: "ttm-comparison",
      blockId,
      statement: "Insufficient quarters for TTM analysis.",
      confidence: "low",
      confidenceReason: "Need 4 quarters for TTM calculation",
      referencedMetrics: [],
      edited: false,
      locked: false,
    };
  }

  const sorted = [...metrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const latest4 = sorted.slice(-4);

  function sum(key: keyof QuarterMetrics): number | null {
    const vals = latest4.map((m) => m[key] as number | null).filter((v) => v != null) as number[];
    return vals.length === 0 ? null : Math.round(vals.reduce((a, b) => a + b, 0));
  }

  const ttmRevenue = sum("revenue");
  const ttmNI = sum("netIncome");
  const ttmFCF = sum("freeCashFlow");
  const ttmMargin = ttmRevenue && ttmNI ? Math.round((ttmNI / ttmRevenue) * 1000) / 10 : null;

  const refs: Insight["referencedMetrics"] = [];
  if (ttmRevenue != null) refs.push({ label: "TTM Revenue", value: fmtM(ttmRevenue) });
  if (ttmNI != null) refs.push({ label: "TTM Net Income", value: fmtM(ttmNI) });
  if (ttmMargin != null) refs.push({ label: "TTM Net Margin", value: fmtPct(ttmMargin) });

  let statement = `On a trailing twelve-month basis, ${latest4[0].companyName} generated revenue of ${fmtM(ttmRevenue)} and net income of ${fmtM(ttmNI)}`;
  if (ttmMargin != null) statement += `, yielding a TTM net margin of ${fmtPct(ttmMargin)}`;
  if (ttmFCF != null) statement += `. Free cash flow totaled ${fmtM(ttmFCF)} over the period`;
  statement += ".";

  return {
    blockType: "ttm-comparison",
    blockId,
    statement,
    confidence: "high",
    confidenceReason: "TTM calculations based on complete 4-quarter data",
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

function generateMarginGapInsight(
  subject: QuarterMetrics,
  peers: QuarterMetrics[],
  blockId: string
): Insight {
  const refs: Insight["referencedMetrics"] = [];
  if (subject.grossMargin != null) refs.push({ label: "Gross Margin", value: fmtPct(subject.grossMargin) });
  if (subject.netMargin != null) refs.push({ label: "Net Margin", value: fmtPct(subject.netMargin) });

  if (peers.length === 0) {
    return {
      blockType: "benchmark-table",
      blockId,
      statement: `${subject.companyName} posted a gross margin of ${fmtPct(subject.grossMargin)} and net margin of ${fmtPct(subject.netMargin)} in ${subject.quarterLabel}. Peer comparison not available.`,
      confidence: "medium",
      confidenceReason: "No peer data for gap analysis",
      referencedMetrics: refs,
      edited: false,
      locked: false,
    };
  }

  const peerGross = peers.map((p) => p.grossMargin).filter((v) => v != null) as number[];
  const peerNet = peers.map((p) => p.netMargin).filter((v) => v != null) as number[];
  const avgGross = peerGross.length > 0 ? peerGross.reduce((a, b) => a + b, 0) / peerGross.length : null;
  const avgNet = peerNet.length > 0 ? peerNet.reduce((a, b) => a + b, 0) / peerNet.length : null;

  let statement = "";
  if (subject.grossMargin != null && avgGross != null) {
    const gap = subject.grossMargin - avgGross;
    refs.push({ label: "Gross Gap", value: fmtBps(gap) });
    statement += `Gross margin of ${fmtPct(subject.grossMargin)} is ${Math.abs(gap) < 1 ? "in line with" : gap > 0 ? "above" : "below"} the peer average of ${fmtPct(avgGross)} (${fmtBps(gap)}).`;
  }
  if (subject.netMargin != null && avgNet != null) {
    const gap = subject.netMargin - avgNet;
    refs.push({ label: "Net Gap", value: fmtBps(gap) });
    statement += ` Net margin of ${fmtPct(subject.netMargin)} ${Math.abs(gap) < 1 ? "tracks" : gap > 0 ? "exceeds" : "lags"} the peer average of ${fmtPct(avgNet)} by ${fmtBps(Math.abs(gap))}.`;
  }

  return {
    blockType: "benchmark-table",
    blockId,
    statement: statement || "Margin data insufficient for gap analysis.",
    confidence: peerGross.length > 0 ? "high" : "low",
    confidenceReason: peerGross.length > 0 ? "Peer margin data available" : "Insufficient peer data",
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

function generateSGAInsight(
  subject: QuarterMetrics,
  peers: QuarterMetrics[],
  blockId: string
): Insight {
  const refs: Insight["referencedMetrics"] = [];
  const sgaRatio = subject.sgaExpense != null && subject.revenue != null && subject.revenue !== 0
    ? Math.round((subject.sgaExpense / subject.revenue) * 1000) / 10
    : null;

  if (sgaRatio != null) refs.push({ label: "SG&A/Revenue", value: fmtPct(sgaRatio) });
  if (subject.sgaExpense != null) refs.push({ label: "SG&A", value: fmtM(subject.sgaExpense) });

  if (sgaRatio == null) {
    return {
      blockType: "sga-comparison",
      blockId,
      statement: "SG&A data not available for this company.",
      confidence: "low",
      confidenceReason: "SG&A expense not reported or not extracted",
      referencedMetrics: refs,
      edited: false,
      locked: false,
    };
  }

  let statement = `SG&A expense of ${fmtM(subject.sgaExpense)} represents ${fmtPct(sgaRatio)} of revenue.`;

  if (peers.length > 0) {
    const peerRatios = peers
      .map((p) => p.sgaExpense != null && p.revenue != null && p.revenue !== 0 ? (p.sgaExpense / p.revenue) * 100 : null)
      .filter((v) => v != null) as number[];

    if (peerRatios.length > 0) {
      const avgPeer = Math.round((peerRatios.reduce((a, b) => a + b, 0) / peerRatios.length) * 10) / 10;
      const gap = sgaRatio - avgPeer;
      refs.push({ label: "Peer Avg SG&A/Rev", value: fmtPct(avgPeer) });
      statement += ` This ${Math.abs(gap) < 0.5 ? "is comparable to" : gap < 0 ? "is below" : "exceeds"} the peer average of ${fmtPct(avgPeer)} (${fmtBps(gap)}).`;
    }
  }

  return {
    blockType: "sga-comparison",
    blockId,
    statement,
    confidence: "high",
    confidenceReason: "SG&A metrics directly available",
    referencedMetrics: refs,
    edited: false,
    locked: false,
  };
}

// ---------------------------------------------------------------------------
// Main: generate all insights
// ---------------------------------------------------------------------------

export interface InsightInput {
  subjectMetrics: QuarterMetrics[];
  peerMetrics: Map<string, QuarterMetrics[]>;
}

export function generateAllInsights(input: InsightInput): Insight[] {
  const { subjectMetrics, peerMetrics } = input;
  const insights: Insight[] = [];

  if (subjectMetrics.length === 0) return insights;

  const latest = subjectMetrics[0];
  const allPeerLatest = [...peerMetrics.values()]
    .filter((m) => m.length > 0)
    .map((m) => m[0]);

  // Benchmark insight
  insights.push(
    generateBenchmarkInsight(latest, allPeerLatest, `benchmark-${latest.ticker}`)
  );

  // Sequential insight
  if (subjectMetrics.length >= 2) {
    const sorted = [...subjectMetrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    insights.push(
      generateSequentialInsight(sorted[sorted.length - 1], sorted[sorted.length - 2], `sequential-${latest.ticker}`)
    );
  }

  // YoY insight
  const sorted = [...subjectMetrics].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latestQ = (() => { const d = new Date(latest.periodEnd); return Math.ceil((d.getMonth() + 1) / 3); })();
  const yearAgo = sorted.find((m) => {
    const d = new Date(m.periodEnd);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return q === latestQ && d.getFullYear() < new Date(latest.periodEnd).getFullYear();
  });
  if (yearAgo) {
    insights.push(generateYoYInsight(latest, yearAgo, `yoy-${latest.ticker}`));
  }

  // TTM insight
  insights.push(generateTTMInsight(subjectMetrics, `ttm-${latest.ticker}`));

  // Margin gap insight
  insights.push(generateMarginGapInsight(latest, allPeerLatest, `margin-gap-${latest.ticker}`));

  // SG&A insight
  insights.push(generateSGAInsight(latest, allPeerLatest, `sga-${latest.ticker}`));

  return insights;
}
