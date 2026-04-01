/**
 * GET /api/peer-comparison?subject=SFD&peers=TSN,HRL&periodEnd=2025-12-31
 *
 * Returns a PeerComparisonResult with side-by-side metrics,
 * margin gaps, and trend data for up to 8 quarters.
 */

import { loadAllFilings, loadRegistry } from "@/lib/filingStorage";
import { buildPeerComparison } from "@/lib/peerComparisonService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get("subject")?.trim().toUpperCase();
  const peersParam = searchParams.get("peers")?.trim().toUpperCase();
  const periodEnd = searchParams.get("periodEnd")?.trim() || undefined;

  if (!subject) {
    return Response.json({ error: "Missing ?subject= parameter" }, { status: 400 });
  }

  // If no peers specified, auto-detect from registry
  let peerTickers: string[] = [];
  if (peersParam) {
    peerTickers = peersParam.split(",").map(t => t.trim()).filter(Boolean);
  } else {
    const registry = await loadRegistry();
    peerTickers = registry.companies
      .filter(c => c.ticker !== subject && c.peerType !== "subject")
      .map(c => c.ticker);
  }

  // Load filings
  const subjectFilings = await loadAllFilings(subject);
  if (subjectFilings.length === 0) {
    return Response.json({ error: `No filings found for ${subject}` }, { status: 404 });
  }

  const peerFilingsMap = new Map<string, typeof subjectFilings>();
  for (const ticker of peerTickers) {
    const filings = await loadAllFilings(ticker);
    if (filings.length > 0) {
      peerFilingsMap.set(ticker, filings);
    }
  }

  const result = buildPeerComparison(subjectFilings, peerFilingsMap, periodEnd);
  if (!result) {
    return Response.json({ error: "Could not build comparison" }, { status: 500 });
  }

  return Response.json(result);
}
