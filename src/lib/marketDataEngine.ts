/**
 * Market Data Engine — builds slide blocks from Circana/IRI
 * scanner data (volume shares, channel distribution, competitive overlap).
 *
 * All data comes from manual entry since Circana/IRI data is proprietary.
 */

import type {
  SlideBlock,
  SlideTable,
  SlideTableRow,
  SlideColumn,
  SlideCell,
  ChartSeries,
} from "@/types/slideBlocks";

// ---------------------------------------------------------------------------
// Market data types (from manual entry)
// ---------------------------------------------------------------------------

export interface MarketDataEntry {
  /** Category, e.g. "Fresh Pork", "Packaged Meats" */
  category: string;
  /** Time period, e.g. "52 Weeks Ending 2025-12-28" */
  period: string;
  /** Source, e.g. "Circana" or "IRI" */
  source: string;
  /** Volume data by brand/company */
  volumeShares: Array<{
    brand: string;
    volumeShare: number | null;
    dollarShare: number | null;
    volumeChange: number | null;
    dollarChange: number | null;
  }>;
  /** Channel distribution data */
  channelData?: Array<{
    channel: string;
    volumeShare: number | null;
    dollarShare: number | null;
  }>;
  /** Overlap metrics */
  competitiveOverlap?: Array<{
    competitor: string;
    overlapPct: number | null;
    switchingRate: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtPctChange(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function cell(display: string, raw: number | null, change?: string, direction?: "positive" | "negative" | "neutral"): SlideCell {
  return { display, raw, change, direction: direction ?? undefined };
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

export function buildMarketVolumeBlock(
  entry: MarketDataEntry,
  subjectTicker: string
): SlideBlock {
  const blockId = `market-volume-${entry.category.replace(/\s/g, "-").toLowerCase()}`;

  const columns: SlideColumn[] = [
    { header: "Brand / Company", align: "left" },
    { header: "Volume Share", align: "right" },
    { header: "Dollar Share", align: "right" },
    { header: "Vol Change", align: "right" },
    { header: "$ Change", align: "right" },
  ];

  const rows: SlideTableRow[] = entry.volumeShares.map((vs) => ({
    label: vs.brand,
    rowType: "metric" as const,
    cells: [
      cell(fmtPct(vs.volumeShare), vs.volumeShare),
      cell(fmtPct(vs.dollarShare), vs.dollarShare),
      cell(
        fmtPctChange(vs.volumeChange),
        vs.volumeChange,
        undefined,
        vs.volumeChange != null
          ? vs.volumeChange > 0 ? "positive" : vs.volumeChange < 0 ? "negative" : "neutral"
          : undefined
      ),
      cell(
        fmtPctChange(vs.dollarChange),
        vs.dollarChange,
        undefined,
        vs.dollarChange != null
          ? vs.dollarChange > 0 ? "positive" : vs.dollarChange < 0 ? "negative" : "neutral"
          : undefined
      ),
    ],
  }));

  const chartSeries: ChartSeries[] = [
    {
      name: "Volume Share",
      data: entry.volumeShares.map((vs) => ({ label: vs.brand, value: vs.volumeShare })),
    },
    {
      name: "Dollar Share",
      data: entry.volumeShares.map((vs) => ({ label: vs.brand, value: vs.dollarShare })),
    },
  ];

  return {
    blockId,
    blockType: "market-data-volume",
    title: `${entry.category} — Market Share (${entry.source})`,
    subtitle: entry.period,
    headlines: entry.volumeShares.slice(0, 3).map((vs) => ({
      label: vs.brand,
      value: fmtPct(vs.volumeShare),
      comparison: "volume share",
    })),
    table: { columns, rows },
    chartSeries,
    footnotes: [`Source: ${entry.source}. ${entry.period}.`],
    assumptions: ["Market data from scanner/POS sources. Private label included."],
    metadata: {
      sourceModule: "market-data-volume",
      subjectTicker,
      peerTickers: [],
      quarterRange: { from: entry.period, to: entry.period },
      generatedAt: new Date().toISOString(),
      completeness: "full",
      missingData: [],
    },
  };
}

export function buildMarketChannelBlock(
  entry: MarketDataEntry,
  subjectTicker: string
): SlideBlock | null {
  if (!entry.channelData || entry.channelData.length === 0) return null;

  const blockId = `market-channel-${entry.category.replace(/\s/g, "-").toLowerCase()}`;

  const columns: SlideColumn[] = [
    { header: "Channel", align: "left" },
    { header: "Volume Share", align: "right" },
    { header: "Dollar Share", align: "right" },
  ];

  const rows: SlideTableRow[] = entry.channelData.map((ch) => ({
    label: ch.channel,
    rowType: "metric" as const,
    cells: [
      cell(fmtPct(ch.volumeShare), ch.volumeShare),
      cell(fmtPct(ch.dollarShare), ch.dollarShare),
    ],
  }));

  const chartSeries: ChartSeries[] = [{
    name: "Volume Share by Channel",
    data: entry.channelData.map((ch) => ({ label: ch.channel, value: ch.volumeShare })),
  }];

  return {
    blockId,
    blockType: "market-data-channel",
    title: `${entry.category} — Channel Distribution (${entry.source})`,
    subtitle: entry.period,
    headlines: [],
    table: { columns, rows },
    chartSeries,
    footnotes: [`Source: ${entry.source}. ${entry.period}.`],
    assumptions: [],
    metadata: {
      sourceModule: "market-data-channel",
      subjectTicker,
      peerTickers: [],
      quarterRange: { from: entry.period, to: entry.period },
      generatedAt: new Date().toISOString(),
      completeness: "full",
      missingData: [],
    },
  };
}

export function buildCompetitiveOverlapBlock(
  entry: MarketDataEntry,
  subjectTicker: string
): SlideBlock | null {
  if (!entry.competitiveOverlap || entry.competitiveOverlap.length === 0) return null;

  const blockId = `competitive-overlap-${entry.category.replace(/\s/g, "-").toLowerCase()}`;

  const columns: SlideColumn[] = [
    { header: "Competitor", align: "left" },
    { header: "Overlap %", align: "right" },
    { header: "Switching Rate", align: "right" },
  ];

  const rows: SlideTableRow[] = entry.competitiveOverlap.map((co) => ({
    label: co.competitor,
    rowType: "metric" as const,
    cells: [
      cell(fmtPct(co.overlapPct), co.overlapPct),
      cell(fmtPct(co.switchingRate), co.switchingRate),
    ],
  }));

  return {
    blockId,
    blockType: "competitive-overlap",
    title: `${entry.category} — Competitive Overlap (${entry.source})`,
    subtitle: entry.period,
    headlines: [],
    table: { columns, rows },
    chartSeries: [],
    footnotes: [`Source: ${entry.source}. ${entry.period}.`],
    assumptions: ["Overlap = % of buyers who also purchase competitor brand."],
    metadata: {
      sourceModule: "competitive-overlap",
      subjectTicker,
      peerTickers: entry.competitiveOverlap.map((co) => co.competitor),
      quarterRange: { from: entry.period, to: entry.period },
      generatedAt: new Date().toISOString(),
      completeness: "full",
      missingData: [],
    },
  };
}
