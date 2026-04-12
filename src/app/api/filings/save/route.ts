/**
 * POST /api/filings/save
 * Body: { ticker: string, periodEnd: string, source: "sec"|"pdf", analysis: FullAnalysis }
 *
 * Save a filing from client-side analysis (e.g. PDF upload).
 */

import { saveFiling } from "@/lib/filingStorage";
import {
  extractFiscalQuarterHint,
  normalizeCompanyName,
  resolveTicker,
} from "@/lib/filingIdentity";
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

    const resolvedTicker = resolveTicker({
      inputTicker: ticker,
      metaTicker: analysis.meta.ticker,
      fileName: analysis.meta.fileName,
      companyName: analysis.meta.companyName,
    });
    const resolvedCompanyName = normalizeCompanyName({
      candidate: analysis.meta.companyName,
      fileName: analysis.meta.fileName,
      ticker: resolvedTicker,
    });
    const quarterHint = extractFiscalQuarterHint(
      analysis.meta.fileName,
      analysis.meta.companyName
    );

    const normalizedAnalysis: FullAnalysis = {
      ...analysis,
      meta: {
        ...analysis.meta,
        ticker: resolvedTicker,
        companyName: resolvedCompanyName,
      },
    };

    const resolvedPeriod =
      periodEnd ||
      analysis.meta.periodEnd ||
      new Date().toISOString().split("T")[0];
    const resolvedSource = source || analysis.meta.source || "pdf";

    const filing = await saveFiling(
      resolvedTicker,
      resolvedPeriod,
      resolvedSource,
      normalizedAnalysis,
      quarterHint
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
