/**
 * POST /api/filings/save
 * Body: { ticker: string, periodEnd: string, source: "sec"|"pdf", analysis: FullAnalysis }
 *
 * Save a filing from client-side analysis (e.g. PDF upload).
 */

import { saveFiling } from "@/lib/filingStorage";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ticker, periodEnd, source, analysis } = body as {
      ticker?: string;
      periodEnd?: string;
      source?: "sec" | "pdf";
      analysis?: FullAnalysis;
    };

    if (!analysis) {
      return Response.json({ error: "Missing analysis" }, { status: 400 });
    }

    const resolvedTicker = (
      ticker ||
      analysis.meta.ticker ||
      "UNKNOWN"
    ).toUpperCase();
    const resolvedPeriod =
      periodEnd ||
      analysis.meta.periodEnd ||
      new Date().toISOString().split("T")[0];
    const resolvedSource = source || analysis.meta.source || "pdf";

    const filing = await saveFiling(
      resolvedTicker,
      resolvedPeriod,
      resolvedSource,
      analysis
    );

    return Response.json({
      ok: true,
      ticker: filing.ticker,
      periodEnd: filing.periodEnd,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
