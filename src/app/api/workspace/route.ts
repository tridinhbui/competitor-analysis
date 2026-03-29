/**
 * GET /api/workspace?ticker=SFD
 *
 * Returns the full WorkspaceReadiness for a company, including:
 * - company info, latest quarter, quarter coverage
 * - peer coverage
 * - module-by-module readiness
 */

import {
  loadRegistry,
  loadAllFilings,
  listQuarters,
} from "@/lib/filingStorage";
import { computeWorkspaceReadiness } from "@/lib/competitorService";
import { buildCoverageTimeline } from "@/lib/appendService";

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
        { error: `Company ${ticker} not found. Upload a filing first.` },
        { status: 404 }
      );
    }

    // Load all filings for the subject company
    const filings = await loadAllFilings(ticker);

    // Find all peer companies (everything that isn't this company)
    const peers = await Promise.all(
      registry.companies
        .filter((c) => c.ticker !== ticker)
        .map(async (c) => {
          const quarters = await listQuarters(c.ticker);
          return { company: c, quarterCount: quarters.length };
        })
    );

    const readiness = computeWorkspaceReadiness(company, filings, peers);
    const timeline = buildCoverageTimeline(filings);

    return Response.json({ ...readiness, timeline });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
