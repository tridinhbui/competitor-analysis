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
import { normalizeCompanyName, resolveTicker } from "@/lib/filingIdentity";
import {
  filterFilingsForWorkspace,
  getWorkspaceResetAt,
} from "@/lib/workspaceReset";
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

  const upper = resolveTicker({
    inputTicker: ticker,
    metaTicker: analysis.meta.ticker,
    fileName: analysis.meta.fileName,
    companyName: analysis.meta.companyName,
  });
  const normalizedAnalysis: FullAnalysis = {
    ...analysis,
    meta: {
      ...analysis.meta,
      ticker: upper,
      companyName: normalizeCompanyName({
        candidate: analysis.meta.companyName,
        fileName: analysis.meta.fileName,
        ticker: upper,
      }),
    },
  };

  try {
    const resetAt = await getWorkspaceResetAt(upper);
    const allExistingFilings = await loadAllFilings(upper);
    const existingFilings = filterFilingsForWorkspace(allExistingFilings, resetAt);

    if (action === "review") {
      const review = buildAppendReview(upper, normalizedAnalysis, existingFilings);
      return Response.json(review);
    }

    // action === "confirm"
    const periodEnd =
      normalizedAnalysis.meta.periodEnd ?? new Date().toISOString().split("T")[0];
    const quarter = deriveQuarter(periodEnd);

    const filing = await saveFiling(
      upper,
      periodEnd,
      normalizedAnalysis.meta.source,
      normalizedAnalysis,
      null
    );

    // Enrich the saved filing with quarter metadata
    // (saveFiling writes the base filing; we update it here)
    filing.filingType = "10-Q";
    filing.filingDate =
      normalizedAnalysis.meta.filingDate ?? new Date().toISOString().split("T")[0];
    filing.quarter = quarter;

    // Rebuild timeline
    const updatedAllFilings = await loadAllFilings(upper);
    const updatedFilings = filterFilingsForWorkspace(updatedAllFilings, resetAt);
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
