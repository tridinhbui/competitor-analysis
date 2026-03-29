/**
 * GET /api/filings?ticker=SFD          — list quarters for a company
 * GET /api/filings?ticker=SFD&q=2024-12-28 — get a specific filing
 * GET /api/filings                      — list all companies in registry
 */

import {
  loadRegistry,
  listQuarters,
  loadFiling,
} from "@/lib/filingStorage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const quarter = searchParams.get("q")?.trim();

  try {
    // Specific filing
    if (ticker && quarter) {
      const filing = await loadFiling(ticker, quarter);
      if (!filing) {
        return Response.json(
          { error: `No filing found for ${ticker} ${quarter}` },
          { status: 404 }
        );
      }
      return Response.json(filing);
    }

    // Quarters for a company
    if (ticker) {
      const quarters = await listQuarters(ticker);
      return Response.json({ ticker, quarters });
    }

    // All companies
    const registry = await loadRegistry();
    return Response.json(registry);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
