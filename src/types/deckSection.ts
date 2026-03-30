/**
 * Deck section types — groups slide blocks into logical sections
 * for full deck generation (e.g., per-peer deep dives).
 */

import type { SlideBlock, SlideBlockType } from "./slideBlocks";

/** A logical section of a presentation deck. */
export interface DeckSection {
  /** Unique section ID */
  sectionId: string;
  /** Section title, e.g. "SFD vs HRL Deep Dive" */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Section type for ordering */
  sectionType: DeckSectionType;
  /** Ordered slide blocks in this section */
  blocks: SlideBlock[];
}

export type DeckSectionType =
  | "title"
  | "landscape"
  | "earnings-narrative"
  | "guidance"
  | "peer-deep-dive"
  | "methodology"
  | "market-data"
  | "sga-trend"
  | "appendix";

/** Full deck structure returned by the deck API. */
export interface DeckResponse {
  ticker: string;
  companyName: string;
  generatedAt: string;
  sections: DeckSection[];
  totalBlocks: number;
}
