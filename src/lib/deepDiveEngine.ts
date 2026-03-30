/**
 * Deep Dive Engine — orchestrates per-peer block sequences into
 * structured deck sections matching reference deck formats.
 *
 * Takes the full set of generated slide blocks and organizes them
 * into presentation-ready deck sections.
 */

import type { SlideBlock } from "@/types/slideBlocks";
import type { DeckSection, DeckSectionType } from "@/types/deckSection";

// ---------------------------------------------------------------------------
// Section ordering
// ---------------------------------------------------------------------------

const SECTION_ORDER: DeckSectionType[] = [
  "title",
  "landscape",
  "earnings-narrative",
  "guidance",
  "peer-deep-dive",
  "methodology",
  "market-data",
  "sga-trend",
  "appendix",
];

// ---------------------------------------------------------------------------
// Block-to-section mapping
// ---------------------------------------------------------------------------

function classifyBlock(block: SlideBlock): DeckSectionType {
  switch (block.blockType) {
    case "industry-landscape":
      return "landscape";
    case "narrative-block":
      return "earnings-narrative";
    case "guidance-table":
      return "guidance";
    case "methodology-comparison":
      return "methodology";
    case "sga-trend":
    case "sga-comparison":
      return "sga-trend";
    case "appendix-historical":
      return "appendix";
    default:
      return "peer-deep-dive";
  }
}

// ---------------------------------------------------------------------------
// Per-peer deep dive block sequence
// ---------------------------------------------------------------------------

/** The ideal block order within a peer deep-dive section. */
const DEEP_DIVE_ORDER = [
  "benchmark-table",
  "segment-margin-comparison",
  "segment-revenue-composition",
  "margin-gap-trend",
  "per-unit-comparison",
  "unit-economics-trend",
  "margin-gap-per-unit",
  "yoy-comparison",
  "sequential-comparison",
  "quarterly-trend",
  "ttm-comparison",
  "op-bridge-qoq",
  "op-bridge-yoy",
  "op-bridge-ttm",
  "peer-qoq-comparison",
  "peer-yoy-comparison",
  "peer-ttm-comparison",
];

function sortDeepDiveBlocks(blocks: SlideBlock[]): SlideBlock[] {
  return [...blocks].sort((a, b) => {
    const ai = DEEP_DIVE_ORDER.indexOf(a.blockType);
    const bi = DEEP_DIVE_ORDER.indexOf(b.blockType);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

// ---------------------------------------------------------------------------
// Main: assemble deck sections
// ---------------------------------------------------------------------------

export function assembleDeckSections(
  blocks: SlideBlock[],
  subjectTicker: string,
  companyName: string
): DeckSection[] {
  const sections: DeckSection[] = [];

  // 1. Title section (synthetic)
  sections.push({
    sectionId: "title",
    title: `${companyName} (${subjectTicker}) — Competitor Analysis`,
    sectionType: "title",
    blocks: [],
  });

  // 2. Group blocks by section type
  const grouped = new Map<DeckSectionType, SlideBlock[]>();
  for (const block of blocks) {
    const sType = classifyBlock(block);
    if (!grouped.has(sType)) grouped.set(sType, []);
    grouped.get(sType)!.push(block);
  }

  // 3. Build sections in order
  for (const sType of SECTION_ORDER) {
    if (sType === "title") continue; // already added
    const sectionBlocks = grouped.get(sType);
    if (!sectionBlocks || sectionBlocks.length === 0) continue;

    if (sType === "peer-deep-dive") {
      // Group peer-deep-dive blocks by peer ticker
      const byPeer = new Map<string, SlideBlock[]>();
      // Also include blocks without specific peers (subject-only blocks)
      const subjectOnly: SlideBlock[] = [];

      for (const block of sectionBlocks) {
        const peerTickers = block.metadata.peerTickers;
        if (peerTickers.length === 0) {
          subjectOnly.push(block);
        } else {
          // Add to each peer's group
          for (const pt of peerTickers) {
            if (!byPeer.has(pt)) byPeer.set(pt, []);
            byPeer.get(pt)!.push(block);
          }
          // Also add to a "multi-peer" group if it spans multiple peers
          if (peerTickers.length > 1) {
            const key = peerTickers.sort().join(",");
            if (!byPeer.has(key)) byPeer.set(key, []);
          }
        }
      }

      // Subject-only analysis section
      if (subjectOnly.length > 0) {
        sections.push({
          sectionId: `deep-dive-${subjectTicker}`,
          title: `${subjectTicker} — Financial Analysis`,
          sectionType: "peer-deep-dive",
          blocks: sortDeepDiveBlocks(subjectOnly),
        });
      }

      // Per-peer sections
      for (const [peerKey, peerBlocks] of byPeer) {
        if (peerBlocks.length === 0) continue;
        sections.push({
          sectionId: `deep-dive-${peerKey}`,
          title: `${subjectTicker} vs ${peerKey}`,
          subtitle: `${peerBlocks.length} slides`,
          sectionType: "peer-deep-dive",
          blocks: sortDeepDiveBlocks(peerBlocks),
        });
      }
    } else {
      // Non-peer sections
      const sectionTitle = {
        landscape: "Industry Landscape",
        "earnings-narrative": "Earnings Narratives",
        guidance: "Guidance Progression",
        methodology: "Methodology Change Analysis",
        "market-data": "Market Data (Circana/IRI)",
        "sga-trend": "SG&A Analysis",
        appendix: "Appendix — Historical Data",
      }[sType] ?? sType;

      sections.push({
        sectionId: `section-${sType}`,
        title: sectionTitle,
        sectionType: sType,
        blocks: sectionBlocks,
      });
    }
  }

  return sections;
}
