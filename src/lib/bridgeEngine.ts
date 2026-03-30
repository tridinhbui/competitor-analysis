/**
 * Bridge Engine — decomposes operating profit changes into component drivers.
 *
 * Used for QoQ, YoY, and TTM waterfall charts showing how revenue, COGS,
 * SG&A, and other items contributed to the change in operating income.
 */

import type { QuarterMetrics } from "./analysisModules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeComponent {
  /** Display label, e.g. "Revenue Change" */
  label: string;
  /** Value in $MM (positive = helped OP, negative = hurt OP) */
  value: number;
  /** Accumulated running total after this component */
  runningTotal: number;
  /** Whether this is a starting/ending total or a delta */
  type: "start" | "delta" | "end";
}

export interface BridgeResult {
  /** Description, e.g. "Q4 2024 → Q4 2025 YoY" */
  description: string;
  /** Starting OP */
  startOP: number;
  /** Ending OP */
  endOP: number;
  /** Total change */
  totalChange: number;
  /** Component breakdown */
  components: BridgeComponent[];
  /** Start period label */
  startLabel: string;
  /** End period label */
  endLabel: string;
}

// ---------------------------------------------------------------------------
// Core bridge computation
// ---------------------------------------------------------------------------

function computeBridge(
  start: QuarterMetrics,
  end: QuarterMetrics,
  startLabel: string,
  endLabel: string,
  description: string
): BridgeResult | null {
  const startOP = start.operatingIncome;
  const endOP = end.operatingIncome;
  if (startOP == null || endOP == null) return null;

  const totalChange = endOP - startOP;

  // Revenue impact: revenue change * prior margin
  const revChange = (end.revenue ?? 0) - (start.revenue ?? 0);
  const priorMargin = start.revenue && start.revenue > 0
    ? (start.operatingIncome ?? 0) / start.revenue
    : 0;
  const revenueImpact = revChange * priorMargin;

  // COGS impact (inverted: lower COGS = positive impact on OP)
  const startCOGS = start.costOfRevenue ?? 0;
  const endCOGS = end.costOfRevenue ?? 0;
  const cogsImpact = -(endCOGS - startCOGS) - (-revChange * (1 - priorMargin));
  // Simplified: COGS impact = how much COGS changed beyond what revenue growth would imply

  // SG&A impact (inverted: lower SG&A = positive)
  const startSGA = start.sgaExpense ?? 0;
  const endSGA = end.sgaExpense ?? 0;
  const sgaImpact = -(endSGA - startSGA);

  // "Other" = residual to make it tie
  const otherImpact = totalChange - revenueImpact - cogsImpact - sgaImpact;

  let running = startOP;
  const components: BridgeComponent[] = [
    { label: `${startLabel} OP`, value: startOP, runningTotal: startOP, type: "start" },
  ];

  const addDelta = (label: string, value: number) => {
    if (Math.abs(value) < 0.01) return; // skip negligible
    running += value;
    components.push({ label, value: Math.round(value), runningTotal: Math.round(running), type: "delta" });
  };

  addDelta("Revenue Mix", Math.round(revenueImpact));
  addDelta("Cost of Sales", Math.round(cogsImpact));
  addDelta("SG&A", Math.round(sgaImpact));
  if (Math.abs(otherImpact) >= 0.5) {
    addDelta("Other / D&A", Math.round(otherImpact));
  }

  components.push({ label: `${endLabel} OP`, value: endOP, runningTotal: endOP, type: "end" });

  return {
    description,
    startOP,
    endOP,
    totalChange,
    components,
    startLabel,
    endLabel,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** QoQ bridge: latest quarter vs prior quarter */
export function buildQoQBridge(metrics: QuarterMetrics[]): BridgeResult | null {
  if (metrics.length < 2) return null;
  const current = metrics[0];
  const prior = metrics[1];
  return computeBridge(
    prior, current,
    prior.quarterLabel, current.quarterLabel,
    `${prior.quarterLabel} → ${current.quarterLabel} QoQ`
  );
}

/** YoY bridge: latest quarter vs same quarter prior year */
export function buildYoYBridge(metrics: QuarterMetrics[]): BridgeResult | null {
  if (metrics.length < 5) return null;
  const current = metrics[0];
  // Find same fiscal quarter from prior year (match "Q4" part of "Q4 2025")
  const currentQ = current.quarterLabel.split(" ")[0]; // e.g. "Q4"
  const priorYear = metrics.find((m, i) => i >= 3 && m.quarterLabel.startsWith(currentQ));
  if (!priorYear) return null;
  return computeBridge(
    priorYear, current,
    priorYear.quarterLabel, current.quarterLabel,
    `${priorYear.quarterLabel} → ${current.quarterLabel} YoY`
  );
}

/** TTM bridge: trailing 4 quarters vs prior trailing 4 quarters */
export function buildTTMBridge(metrics: QuarterMetrics[]): BridgeResult | null {
  if (metrics.length < 8) return null;

  // Sum trailing 4 quarters
  const sumMetrics = (slice: QuarterMetrics[]): QuarterMetrics => ({
    ...slice[0],
    revenue: slice.reduce((s, m) => s + (m.revenue ?? 0), 0),
    costOfRevenue: slice.reduce((s, m) => s + (m.costOfRevenue ?? 0), 0),
    grossProfit: slice.reduce((s, m) => s + (m.grossProfit ?? 0), 0),
    sgaExpense: slice.reduce((s, m) => s + (m.sgaExpense ?? 0), 0),
    operatingIncome: slice.reduce((s, m) => s + (m.operatingIncome ?? 0), 0),
    netIncome: slice.reduce((s, m) => s + (m.netIncome ?? 0), 0),
    quarterLabel: `TTM ${slice[0].quarterLabel}`,
  });

  const currentTTM = sumMetrics(metrics.slice(0, 4));
  const priorTTM = sumMetrics(metrics.slice(4, 8));

  return computeBridge(
    priorTTM, currentTTM,
    `TTM ${metrics[3].quarterLabel}`, `TTM ${metrics[0].quarterLabel}`,
    `TTM OP Bridge`
  );
}
