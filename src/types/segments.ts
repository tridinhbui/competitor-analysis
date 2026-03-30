/**
 * Segment-level data types for competitor analysis.
 *
 * Segments represent business divisions, channels, or geographies
 * within a company. Each filing can have multiple segments.
 */

// ---------------------------------------------------------------------------
// Segment data
// ---------------------------------------------------------------------------

/** How the segment is classified. */
export type SegmentType = "business" | "channel" | "geography";

/** Unit type for volume-based per-unit metrics. */
export type VolumeUnitType = "head" | "cwt" | "lbs" | "cases";

/** A single segment's financial data for one quarter. */
export interface SegmentData {
  /** Segment name, e.g. "US Pork", "Prepared Foods", "Retail" */
  segmentName: string;
  /** How this segment is classified */
  segmentType: SegmentType;
  /** Revenue in $MM */
  revenue: number | null;
  /** Cost of revenue in $MM */
  costOfRevenue: number | null;
  /** Gross profit in $MM */
  grossProfit: number | null;
  /** SG&A expense in $MM */
  sgaExpense: number | null;
  /** Operating income / segment profit in $MM */
  operatingIncome: number | null;
  /** Operating margin (derived or stored) */
  operatingMargin: number | null;
  /** Depreciation & amortization in $MM */
  depreciation: number | null;
  /** Capital expenditures in $MM */
  capitalExpenditures: number | null;
  /** Total assets in $MM */
  totalAssets: number | null;
  /** Intercompany eliminations in $MM */
  intercompanyEliminations: number | null;
  /** Volume in units (populated from manual entry or calculation) */
  volumeUnits: number | null;
  /** Unit type for volume */
  volumeUnitType: VolumeUnitType | null;
  /** Revenue per unit (derived) */
  revenuePerUnit: number | null;
  /** Operating income per unit (derived) */
  operatingIncomePerUnit: number | null;
}

// ---------------------------------------------------------------------------
// Methodology variants — for companies that change allocation methods
// ---------------------------------------------------------------------------

/**
 * When a company changes how corporate overhead is allocated to segments,
 * we store parallel data sets under different methodology labels.
 *
 * Example: Tyson "old" (with corporate allocation) vs "new" (without).
 */
export interface MethodologyVariant {
  /** Unique variant ID, e.g. "old-with-corp-alloc", "new-without-corp-alloc" */
  variantId: string;
  /** Display label */
  label: string;
  /** Description of the methodology */
  description: string;
  /** Segment data under this methodology */
  segments: SegmentData[];
  /** Corporate allocation amount in $MM (if broken out) */
  corporateAllocation: number | null;
  /** Corporate expense as % of revenue */
  corporateAsPercentOfRevenue: number | null;
  /** Amortization expense in $MM (if broken out) */
  amortizationExpense: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an empty segment with a name and type. */
export function emptySegment(
  segmentName: string,
  segmentType: SegmentType = "business"
): SegmentData {
  return {
    segmentName,
    segmentType,
    revenue: null,
    costOfRevenue: null,
    grossProfit: null,
    sgaExpense: null,
    operatingIncome: null,
    operatingMargin: null,
    depreciation: null,
    capitalExpenditures: null,
    totalAssets: null,
    intercompanyEliminations: null,
    volumeUnits: null,
    volumeUnitType: null,
    revenuePerUnit: null,
    operatingIncomePerUnit: null,
  };
}

/**
 * Derive per-unit metrics for a segment.
 * Mutates the segment in place for convenience.
 */
export function derivePerUnitMetrics(segment: SegmentData): SegmentData {
  if (segment.volumeUnits != null && segment.volumeUnits > 0) {
    if (segment.revenue != null) {
      segment.revenuePerUnit =
        Math.round((segment.revenue / segment.volumeUnits) * 100) / 100;
    }
    if (segment.operatingIncome != null) {
      segment.operatingIncomePerUnit =
        Math.round((segment.operatingIncome / segment.volumeUnits) * 100) / 100;
    }
  }
  if (segment.revenue != null && segment.revenue !== 0 && segment.operatingIncome != null) {
    segment.operatingMargin =
      Math.round((segment.operatingIncome / segment.revenue) * 1000) / 10;
  }
  return segment;
}
