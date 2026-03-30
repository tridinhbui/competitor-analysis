/**
 * Slide Block Schema — structured, presentation-ready data blocks
 * for competitor analysis decks.
 *
 * Each SlideBlock is a self-contained unit that can be placed
 * directly into a slide. Blocks are generic across peer types
 * and traceable back to the metrics engine.
 */

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export type SlideBlockType =
  | "benchmark-table"
  | "quarterly-trend"
  | "sequential-comparison"
  | "yoy-comparison"
  | "ttm-comparison"
  | "sga-comparison"
  | "appendix-historical"
  | "narrative-block"
  | "guidance-table"
  | "segment-margin-comparison"
  | "segment-revenue-composition"
  | "margin-gap-trend"
  | "per-unit-comparison"
  | "op-bridge-qoq"
  | "op-bridge-yoy"
  | "op-bridge-ttm"
  | "industry-landscape"
  | "sga-trend"
  | "methodology-comparison"
  | "market-data-volume"
  | "market-data-channel"
  | "competitive-overlap"
  | "peer-qoq-comparison"
  | "peer-yoy-comparison"
  | "peer-ttm-comparison"
  | "unit-economics-trend"
  | "margin-gap-per-unit";

// ---------------------------------------------------------------------------
// Table structure — presentation-ready
// ---------------------------------------------------------------------------

/** A single cell in a slide table. Values are pre-formatted strings. */
export interface SlideCell {
  /** Display value, ready for slide placement. E.g. "$42,097" or "29.3%" */
  display: string;
  /** Raw numeric value for sorting/charting, null if N/A */
  raw: number | null;
  /** Optional change indicator string, e.g. "+$252" or "-1.2pp" */
  change?: string;
  /** Semantic direction: positive, negative, neutral, or null */
  direction?: "positive" | "negative" | "neutral" | null;
}

/** A row in a slide table. */
export interface SlideTableRow {
  /** Row label, e.g. "Revenue ($M)" */
  label: string;
  /** CSS-style hint: "metric", "subtotal", "total", "spacer" */
  rowType: "metric" | "subtotal" | "total" | "spacer" | "header";
  /** Cell values, one per column */
  cells: SlideCell[];
}

/** Column definition for a slide table. */
export interface SlideColumn {
  /** Column header text */
  header: string;
  /** Optional sub-header, e.g. "Period ending 2025-12-27" */
  subHeader?: string;
  /** Alignment hint */
  align: "left" | "right" | "center";
}

/** A complete slide-ready table. */
export interface SlideTable {
  columns: SlideColumn[];
  rows: SlideTableRow[];
}

// ---------------------------------------------------------------------------
// Chart series — for future chart rendering
// ---------------------------------------------------------------------------

export interface ChartDataPoint {
  label: string;
  value: number | null;
}

export interface ChartSeries {
  name: string;
  color?: string;
  data: ChartDataPoint[];
}

// ---------------------------------------------------------------------------
// Headline metrics — key callouts for the slide
// ---------------------------------------------------------------------------

export interface HeadlineMetric {
  label: string;
  value: string;
  /** Optional comparison, e.g. "vs $13,623M prior year" */
  comparison?: string;
  direction?: "positive" | "negative" | "neutral";
}

// ---------------------------------------------------------------------------
// The slide block itself
// ---------------------------------------------------------------------------

export interface SlideBlock {
  /** Unique block ID, e.g. "benchmark-table-UNKNOWN-Q4-2025" */
  blockId: string;
  /** Block type */
  blockType: SlideBlockType;
  /** Presentation-ready title */
  title: string;
  /** Optional subtitle / context line */
  subtitle?: string;
  /** Key headline metrics (max 3-4) for the top of the slide */
  headlines: HeadlineMetric[];
  /** The main data table */
  table: SlideTable;
  /** Optional chart-ready series */
  chartSeries: ChartSeries[];
  /** Footnotes for the bottom of the slide */
  footnotes: string[];
  /** Assumptions underlying the data */
  assumptions: string[];
  /** Traceability metadata */
  metadata: SlideBlockMetadata;
  /** Narrative body (markdown) — for narrative-block type */
  narrativeBody?: string;
  /** Segment highlights — for narrative-block type */
  segmentHighlights?: Array<{
    segmentName: string;
    operatingIncome: number | null;
    yoyChange: string;
  }>;
  /** Source links — for narrative-block type */
  sourceLinks?: Array<{ label: string; url: string }>;
  /** Bridge components — for op-bridge-* types (waterfall chart data) */
  bridgeComponents?: Array<{
    label: string;
    value: number;
    runningTotal: number;
    type: "start" | "delta" | "end";
  }>;
}

export interface SlideBlockMetadata {
  /** Which analysis module produced this */
  sourceModule: string;
  /** Subject company ticker */
  subjectTicker: string;
  /** Peer tickers included (if any) */
  peerTickers: string[];
  /** Quarter range covered */
  quarterRange: { from: string; to: string };
  /** When this block was generated */
  generatedAt: string;
  /** Data completeness: full, partial */
  completeness: "full" | "partial";
  /** Missing data points, if any */
  missingData: string[];
}

// ---------------------------------------------------------------------------
// Response from the slide blocks API
// ---------------------------------------------------------------------------

export interface SlideBlocksResponse {
  ticker: string;
  companyName: string;
  generatedAt: string;
  blocks: SlideBlock[];
}
