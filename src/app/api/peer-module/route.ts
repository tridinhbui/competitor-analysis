/**
 * GET /api/peer-module?ticker=SFD
 *
 * Returns the peer module configuration and readiness for a company.
 */

import { loadRegistry, loadAllFilings } from "@/lib/filingStorage";
import { getPeerModuleConfig, checkPeerModuleReadiness } from "@/lib/peerModules";
import { extractMetrics } from "@/lib/analysisModules";

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

    const filings = await loadAllFilings(ticker);
    const metrics = filings
      .map((f) => extractMetrics(f, company.peerType))
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));

    const config = getPeerModuleConfig(company.peerType);
    const readiness = checkPeerModuleReadiness(config, metrics);

    return Response.json({
      ticker,
      companyName: company.name,
      peerType: company.peerType,
      readiness,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
