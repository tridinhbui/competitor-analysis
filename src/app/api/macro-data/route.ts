/**
 * GET /api/macro-data?query=pork+industry
 *
 * Returns commodity prices, macro indicators, and industry news.
 * Commodity prices from Yahoo Finance, macro from FRED, news from Google News RSS.
 */

import { fetchMacroData } from "@/lib/externalDataService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() || "pork industry meat protein";

  const result = await fetchMacroData(query);
  return Response.json(result);
}
