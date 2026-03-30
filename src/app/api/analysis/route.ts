/**
 * GET /api/analysis?ticker=SFD
 *
 * Computes and returns all 9 analysis modules for a company.
 * Works with partial data — modules that can't run return available=false.
 */

import { loadRegistry, loadAllFilings } from "@/lib/filingStorage";
import { computeAllModules } from "@/lib/analysisModules";
import type { PeerType } from "@/types/competitor";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return Response.json(
      { error: "Missing ?ticker= parameter" },
      { status: 400 }
    );
  }

  try {
    const registry = await loadRegistry();
    const company = registry.companies.find((c) => c.ticker === ticker);

    if (!company) {
      return Response.json(
        { error: `Company ${ticker} not found.` },
        { status: 404 }
      );
    }

    // Load subject filings
    const subjectFilings = await loadAllFilings(ticker);

    // Load peer filings
    const peers = registry.companies.filter((c) => c.ticker !== ticker);
    const peerFilings = new Map<string, { filings: typeof subjectFilings; peerType: PeerType }>();

    for (const peer of peers) {
      const filings = await loadAllFilings(peer.ticker);
      if (filings.length > 0) {
        peerFilings.set(peer.ticker, {
          filings,
          peerType: peer.peerType,
        });
      }
    }

    const modules = computeAllModules({
      subjectTicker: ticker,
      subjectFilings,
      subjectPeerType: company.peerType,
      peerFilings,
    });

    return Response.json({
      ticker,
      companyName: company.name,
      quarterCount: subjectFilings.length,
      peerCount: peerFilings.size,
      modules,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
