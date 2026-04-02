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

    const rawTicker = ticker || analysis.meta.ticker || "";
    if (!rawTicker.trim()) {
      return Response.json(
        { error: "A valid ticker is required. Please provide ticker in the request body or ensure analysis.meta.ticker is set." },
        { status: 400 }
      );
    }
    const resolvedTicker = rawTicker.toUpperCase();
    // Reject placeholder tickers
    if (resolvedTicker === "UNKNOWN" || resolvedTicker === "N/A" || resolvedTicker === "UNDEFINED") {
      return Response.json(
        { error: `Invalid ticker "${resolvedTicker}". Please provide a real stock ticker before saving.` },
        { status: 400 }
      );
    }
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
