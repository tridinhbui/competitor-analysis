/**
 * Manual data types — for data that cannot be auto-extracted from SEC filings.
 *
 * Covers: industry landscape stats, guidance, narratives (earnings summaries,
 * analyst Q&A), unit volume, market data (Circana/IRI), and segment overrides.
 */

import type { SegmentData, VolumeUnitType } from "./segments";

// ---------------------------------------------------------------------------
// Data type discriminator
// ---------------------------------------------------------------------------

export type ManualDataType =
  | "industry-landscape"
  | "guidance"
  | "narrative"
  | "unit-volume"
  | "market-data"
  | "segment-override";

// ---------------------------------------------------------------------------
// Industry Landscape — company-level stats not in SEC filings
// ---------------------------------------------------------------------------

export interface IndustryLandscapeEntry {
  plantCount: number | null;
  plantDetail?: string; // e.g. "8 Harvest Plants, 2 Value Add"
  sowCount: number | null;
  annualHogRaised: number | null;
  slaughterCapacityAnnual: number | null;
  farmCount: number | null;
  farmDetail?: string; // e.g. "259 CO, 1,381 Contract"
  ttmVolumeLbs: number | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Guidance — management guidance entries
// ---------------------------------------------------------------------------

export interface GuidanceEntry {
  fiscalYear: number;
  metric: string; // "net-sales", "adj-operating-income", "adj-eps", etc.
  metricLabel: string; // Display label
  low: number | null;
  high: number | null;
  midpoint: number | null;
  unit: "dollars-mm" | "dollars-b" | "eps" | "percent";
  asOfDate: string; // ISO date when guidance was issued
  source: string; // "Q4 earnings call", "press release", "8-K"
  /** Optional: consensus estimate for comparison */
  consensus?: number | null;
  /** Optional: actual result (once known) */
  actual?: number | null;
}

// ---------------------------------------------------------------------------
// Narrative — earnings summaries, analyst Q&A, methodology notes
// ---------------------------------------------------------------------------

export type NarrativeType =
  | "earnings-summary"
  | "analyst-qa"
  | "methodology-note"
  | "general";

export interface NarrativeEntry {
  type: NarrativeType;
  title: string;
  body: string; // Markdown
  /** Stock price reaction, e.g. "+0.6% on day" */
  stockPriceReaction?: string;
  /** Date of the event */
  date: string;
  /** Segment-level results summary (structured) */
  segmentHighlights?: Array<{
    segmentName: string;
    operatingIncome: number | null;
    yoyChange: string; // e.g. "+52%", "->200%"
  }>;
  /** Source links */
  sourceLinks?: Array<{
    label: string;
    url: string;
  }>;
}

// ---------------------------------------------------------------------------
// Unit Volume — for per-unit metric calculations
// ---------------------------------------------------------------------------

export interface UnitVolumeEntry {
  segmentName: string;
  volumeUnits: number;
  unitType: VolumeUnitType;
  periodType: "quarterly" | "ttm" | "annual";
}

// ---------------------------------------------------------------------------
// Market Data — Circana/IRI scanner data
// ---------------------------------------------------------------------------

export type MarketDataSource = "circana" | "iri" | "usda" | "other";

export interface MarketDataEntry {
  source: MarketDataSource;
  /** Product category, e.g. "Bacon", "Hot Dogs", "Deli Meat" */
  category: string;
  /** Channel, e.g. "Retail Branded", "Foodservice", "Private Label" */
  channel: string;
  /** Company ticker for company-specific data */
  companyTicker?: string;
  volumeLbs: number | null;
  revenueDollars: number | null;
  periodType: "qtd" | "ttm" | "annual";
  periodEnd: string; // ISO date
}

// ---------------------------------------------------------------------------
// Segment Override — manually entered segment financials
// ---------------------------------------------------------------------------

export interface SegmentOverrideEntry {
  /** The segment data to upsert (overrides auto-extracted) */
  segment: SegmentData;
  /** Reason for the override */
  reason: string;
}

// ---------------------------------------------------------------------------
// Wrapper: a single manual_data record as stored in Supabase
// ---------------------------------------------------------------------------

export interface ManualDataRecord {
  id?: string;
  ticker: string;
  periodEnd: string | null; // null for static company-level data
  dataType: ManualDataType;
  data:
    | IndustryLandscapeEntry
    | GuidanceEntry
    | NarrativeEntry
    | UnitVolumeEntry
    | MarketDataEntry
    | SegmentOverrideEntry;
  sourceNote: string;
  createdAt?: string;
  updatedAt?: string;
}
