/**
 * GET /api/slide-blocks/deck?ticker=SFD
 *
 * Generates a full deck structure with sections for a company.
 * Returns organized DeckResponse with sections and blocks.
 */

import { loadRegistry, loadAllFilings } from "@/lib/filingStorage";
import { generateAllSlideBlocks, type ManualDataForBlocks } from "@/lib/slideBlockEngine";
import { assembleDeckSections } from "@/lib/deepDiveEngine";
import { listManualData } from "@/lib/manualDataStorage";
import type { PeerType } from "@/types/competitor";
import type { DeckResponse } from "@/types/deckSection";
import type { NarrativeEntry, GuidanceEntry, IndustryLandscapeEntry, MarketDataEntry } from "@/types/manualData";

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

    // Load manual data
    const manualData: ManualDataForBlocks = {};
    try {
      const narrativeRecords = await listManualData(ticker, "narrative");
      manualData.narratives = narrativeRecords.map((r) => r.data as NarrativeEntry);

      const guidanceRecords = await listManualData(ticker, "guidance");
      manualData.guidanceEntries = guidanceRecords.map((r) => r.data as GuidanceEntry);

      const landscapeRecords = await listManualData(ticker, "industry-landscape");
      if (landscapeRecords.length > 0) {
        manualData.landscapeData = landscapeRecords.map((r) => r.data as IndustryLandscapeEntry as unknown as import("@/lib/landscapeEngine").LandscapeManualData);
      }

      const marketRecords = await listManualData(ticker, "market-data");
      if (marketRecords.length > 0) {
        manualData.marketData = marketRecords.map((r) => r.data as MarketDataEntry as unknown as import("@/lib/marketDataEngine").MarketDataEntry);
      }
    } catch {
      // Optional
    }

    // Generate all blocks
    const blocks = generateAllSlideBlocks({
      subjectTicker: ticker,
      subjectFilings,
      subjectPeerType: company.peerType,
      peerFilings,
      manualData,
    });

    // Assemble into deck sections
    const sections = assembleDeckSections(blocks, ticker, company.name);

    const response: DeckResponse = {
      ticker,
      companyName: company.name,
      generatedAt: new Date().toISOString(),
      sections,
      totalBlocks: blocks.length,
    };

    return Response.json(response);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
