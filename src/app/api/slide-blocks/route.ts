/**
 * GET /api/slide-blocks?ticker=SFD
 *
 * Generates all slide-ready blocks for a company.
 * Returns structured JSON that future export layers can consume.
 */

import { loadRegistry, loadAllFilings } from "@/lib/filingStorage";
import { generateAllSlideBlocks, type ManualDataForBlocks } from "@/lib/slideBlockEngine";
import { listManualData } from "@/lib/manualDataStorage";
import type { PeerType } from "@/types/competitor";
import type { SlideBlocksResponse } from "@/types/slideBlocks";
import type {
  NarrativeEntry,
  GuidanceEntry,
  IndustryLandscapeEntry,
  MarketDataEntry,
  ComparisonBlueprintEntry,
  SegmentMappingEntry,
  QuarterAlignmentEntry,
} from "@/types/manualData";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return Response.json({ error: "Missing ?ticker= parameter" }, { status: 400 });
  }

  try {
    const registry = await loadRegistry();
    const company = registry.companies.find((c) => c.ticker === ticker);
    if (!company) {
      return Response.json({ error: `Company ${ticker} not found.` }, { status: 404 });
    }

    const subjectFilings = await loadAllFilings(ticker);
    const peers = registry.companies.filter((c) => c.ticker !== ticker);
    const peerFilings = new Map<string, { filings: Awaited<ReturnType<typeof loadAllFilings>>; peerType: PeerType }>();

    for (const peer of peers) {
      const filings = await loadAllFilings(peer.ticker);
      if (filings.length > 0) {
        peerFilings.set(peer.ticker, { filings, peerType: peer.peerType });
      }
    }

    // Load manual data for narrative and guidance blocks
    const manualData: ManualDataForBlocks = {};
    try {
      const narrativeRecords = await listManualData(ticker, "narrative");
      manualData.narratives = narrativeRecords.map((r) => r.data as NarrativeEntry);

      const guidanceRecords = await listManualData(ticker, "guidance");
      manualData.guidanceEntries = guidanceRecords.map((r) => r.data as GuidanceEntry);

      // Load landscape data for all companies
      const landscapeRecords = await listManualData(ticker, "industry-landscape");
      if (landscapeRecords.length > 0) {
        manualData.landscapeData = landscapeRecords.map((r) => r.data as IndustryLandscapeEntry as unknown as import("@/lib/landscapeEngine").LandscapeManualData);
      }

      const marketRecords = await listManualData(ticker, "market-data");
      if (marketRecords.length > 0) {
        manualData.marketData = marketRecords.map((r) => r.data as MarketDataEntry as unknown as import("@/lib/marketDataEngine").MarketDataEntry);
      }

      const blueprintRecords = await listManualData(ticker, "comparison-blueprint");
      if (blueprintRecords.length > 0) {
        manualData.comparisonBlueprints = blueprintRecords.map(
          (r) => r.data as ComparisonBlueprintEntry
        );
      }

      const mappingRecords = await listManualData(ticker, "segment-mapping");
      if (mappingRecords.length > 0) {
        manualData.segmentMappings = mappingRecords.map(
          (r) => r.data as SegmentMappingEntry
        );
      }

      const alignmentRecords = await listManualData(ticker, "quarter-alignment");
      if (alignmentRecords.length > 0) {
        manualData.quarterAlignments = alignmentRecords.map(
          (r) => r.data as QuarterAlignmentEntry
        );
      }
    } catch {
      // Manual data is optional; continue without it
    }

    const blocks = generateAllSlideBlocks({
      subjectTicker: ticker,
      subjectFilings,
      subjectPeerType: company.peerType,
      peerFilings,
      manualData,
    });

    const response: SlideBlocksResponse = {
      ticker,
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      blocks,
    };

    return Response.json(response);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
