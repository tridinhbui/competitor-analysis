/**
 * Human-in-the-loop adjustment types.
 *
 * Adjustments allow analysts to override, edit, lock, or annotate
 * auto-generated insights, slide block cells, and footnotes.
 * All adjustments are stored per-company and keyed by block/insight ID.
 */

// ---------------------------------------------------------------------------
// Insight adjustments
// ---------------------------------------------------------------------------

/** An override applied to a single insight statement. */
export interface InsightAdjustment {
  /** The insight's blockId — must match an existing insight */
  blockId: string;
  /** Edited statement text (null = keep original) */
  editedStatement: string | null;
  /** Whether this insight is locked from regeneration */
  locked: boolean;
  /** Optional analyst note explaining the edit */
  analystNote?: string;
  /** ISO timestamp of last edit */
  editedAt: string;
}

// ---------------------------------------------------------------------------
// Cell adjustments — override individual table cells
// ---------------------------------------------------------------------------

/** An override applied to a single cell in a slide block table. */
export interface CellAdjustment {
  /** The slide block's blockId */
  blockId: string;
  /** Row index in the table */
  rowIndex: number;
  /** Cell index within the row */
  cellIndex: number;
  /** Override display value (null = keep computed) */
  overrideDisplay: string | null;
  /** Override raw value (null = keep computed) */
  overrideRaw: number | null;
  /** Reason for the override */
  reason: string;
  /** ISO timestamp */
  editedAt: string;
}

// ---------------------------------------------------------------------------
// Footnote adjustments
// ---------------------------------------------------------------------------

/** A custom footnote added by the analyst to a slide block. */
export interface FootnoteAdjustment {
  /** The slide block's blockId */
  blockId: string;
  /** "add" appends a new footnote, "remove" hides an existing one, "replace" swaps */
  action: "add" | "remove" | "replace";
  /** Index of the footnote to remove/replace (for "remove" and "replace") */
  footnoteIndex?: number;
  /** The footnote text (for "add" and "replace") */
  text?: string;
  /** ISO timestamp */
  editedAt: string;
}

// ---------------------------------------------------------------------------
// Block-level adjustments
// ---------------------------------------------------------------------------

/** Block-level overrides (title, subtitle, visibility). */
export interface BlockAdjustment {
  /** The slide block's blockId */
  blockId: string;
  /** Override the title (null = keep auto-generated) */
  overrideTitle: string | null;
  /** Override the subtitle (null = keep auto-generated) */
  overrideSubtitle: string | null;
  /** Hide the entire block from output */
  hidden: boolean;
  /** Pin block order position (null = keep default) */
  pinnedPosition: number | null;
  /** ISO timestamp */
  editedAt: string;
}

// ---------------------------------------------------------------------------
// Aggregate: all adjustments for a company
// ---------------------------------------------------------------------------

export interface CompanyAdjustments {
  /** Ticker this adjustment set belongs to */
  ticker: string;
  /** Insight-level adjustments, keyed by blockId */
  insights: InsightAdjustment[];
  /** Cell-level overrides */
  cells: CellAdjustment[];
  /** Footnote overrides */
  footnotes: FootnoteAdjustment[];
  /** Block-level overrides */
  blocks: BlockAdjustment[];
  /** ISO timestamp of last modification */
  updatedAt: string;
}

/** Empty starting state for a company with no adjustments. */
export function emptyAdjustments(ticker: string): CompanyAdjustments {
  return {
    ticker,
    insights: [],
    cells: [],
    footnotes: [],
    blocks: [],
    updatedAt: new Date().toISOString(),
  };
}
