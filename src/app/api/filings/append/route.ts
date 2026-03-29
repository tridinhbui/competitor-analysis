/**
 * POST /api/filings/append — two-phase endpoint
 *
 * Phase 1 (review): Body { ticker, analysis, action: "review" }
 *   Returns AppendReview with status, completeness, warnings.
 *
 * Phase 2 (confirm): Body { ticker, analysis, action: "confirm" }
 *   Saves the filing to disk and returns the updated timeline.
 */

import { loadAllFilings, saveFiling } from "@/lib/filingStorage";
import { buildAppendReview, buildCoverageTimeline } from "@/lib/appendService";
import { deriveQuarter } from "@/lib/competitorService";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

interface AppendBody {
  ticker: string;
  analysis: FullAnalysis;
  action: "review" | "confirm";
}

export async function POST(request: Request) {
  let body: AppendBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ticker, analysis, action } = body;

  if (!ticker || !analysis) {
    return Response.json(
      { error: "Missing ticker or analysis" },
      { status: 400 }
    );
  }

  if (action !== "review" && action !== "confirm") {
    return Response.json(
      { error: 'action must be "review" or "confirm"' },
      { status: 400 }
    );
  }

  const upper = ticker.toUpperCase();

  try {
    const existingFilings = await loadAllFilings(upper);

    if (action === "review") {
      const review = buildAppendReview(upper, analysis, existingFilings);
      return Response.json(review);
    }

    // action === "confirm"
    const periodEnd =
      analysis.meta.periodEnd ?? new Date().toISOString().split("T")[0];
    const quarter = deriveQuarter(periodEnd);

    const filing = await saveFiling(
      upper,
      periodEnd,
      analysis.meta.source,
      analysis
    );

    // Enrich the saved filing with quarter metadata
    // (saveFiling writes the base filing; we update it here)
    filing.filingType = "10-Q";
    filing.filingDate =
      analysis.meta.filingDate ?? new Date().toISOString().split("T")[0];
    filing.quarter = quarter;

    // Rebuild timeline
    const updatedFilings = await loadAllFilings(upper);
    const timeline = buildCoverageTimeline(updatedFilings);

    return Response.json({
      ok: true,
      filing: {
        ticker: filing.ticker,
        periodEnd: filing.periodEnd,
        quarter,
        source: filing.source,
      },
      timeline,
      quarterCount: updatedFilings.length,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
