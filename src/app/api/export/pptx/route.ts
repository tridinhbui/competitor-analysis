/**
 * GET /api/export/pptx?ticker=SFD&mode=deck
 *
 * Generates and downloads a PPTX presentation.
 * mode=blocks (default) — flat list of slide blocks
 * mode=deck — organized into deck sections with dividers
 */

import { loadRegistry, loadAllFilings } from "@/lib/filingStorage";
import { generateAllSlideBlocks, type ManualDataForBlocks } from "@/lib/slideBlockEngine";
import { assembleDeckSections } from "@/lib/deepDiveEngine";
import { generatePptxFromBlocks, generatePptxFromDeck } from "@/lib/pptxExport";
import { listManualData } from "@/lib/manualDataStorage";
import type { PeerType } from "@/types/competitor";
import type { NarrativeEntry, GuidanceEntry, IndustryLandscapeEntry, MarketDataEntry } from "@/types/manualData";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const mode = searchParams.get("mode") ?? "blocks";

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

    // Generate blocks
    const blocks = generateAllSlideBlocks({
      subjectTicker: ticker,
      subjectFilings,
      subjectPeerType: company.peerType,
      peerFilings,
      manualData,
    });

    const title = `${company.name} (${ticker}) — Competitor Analysis`;
    const subtitle = `Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;

    let buffer: Buffer;

    if (mode === "deck") {
      const sections = assembleDeckSections(blocks, ticker, company.name);
      buffer = await generatePptxFromDeck(sections, title, subtitle);
    } else {
      buffer = await generatePptxFromBlocks(blocks, title, subtitle);
    }

    const filename = `${ticker}_Competitor_Analysis_${new Date().toISOString().slice(0, 10)}.pptx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
