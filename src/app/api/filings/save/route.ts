/**
 * POST /api/filings/save
 * Body: { ticker: string, periodEnd: string, source: "sec"|"pdf", analysis: FullAnalysis, workflowOrigin?: "analyze"|"competitor" }
 *
 * Save a filing from client-side analysis (e.g. PDF upload).
 */

import { saveFiling } from "@/lib/filingStorage";
import { applyDataSourceOverridesToAnalysis } from "@/lib/dataSourceOverrides";
import {
  extractFiscalQuarterHint,
  normalizeCompanyName,
  resolveTicker,
} from "@/lib/filingIdentity";
import { supabase } from "@/lib/supabase";
import { requireAuthedUser } from "@/lib/serverAuth";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

async function loadDataSourceOverrides(
  ticker: string,
  periodEnd: string
): Promise<Record<string, number | null>> {
  const { data, error } = await supabase
    .from("adjustments")
    .select("data")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error || !data?.data) return {};

  const payload = data.data as {
    dataSourceOverrides?: Record<string, Record<string, number | null>>;
  };
  return payload.dataSourceOverrides?.[periodEnd] ?? {};
}

export async function POST(request: Request) {
  const authResult = await requireAuthedUser(request);
  if (authResult instanceof Response) return authResult;

  try {
    const body = await request.json();
    const { ticker, periodEnd, source, analysis } = body as {
      ticker?: string;
      periodEnd?: string;
      source?: "sec" | "pdf";
      analysis?: FullAnalysis;
      workflowOrigin?: "analyze" | "competitor";
      filingText?: string;
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

    const baseAnalysis: FullAnalysis = {
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
    const resolvedWorkflowOrigin = body.workflowOrigin || analysis.meta.workflowOrigin || "analyze";
    const dataSourceOverrides = await loadDataSourceOverrides(
      resolvedTicker,
      resolvedPeriod
    );
    const withRawText: FullAnalysis = body.filingText && body.filingText.trim().length > 0
      ? {
          ...baseAnalysis,
          meta: {
            ...baseAnalysis.meta,
            rawFilingText: body.filingText,
          },
        }
      : baseAnalysis;

    const normalizedAnalysis = applyDataSourceOverridesToAnalysis(
      {
        ...withRawText,
        meta: {
          ...withRawText.meta,
          periodEnd: resolvedPeriod,
        },
      },
      dataSourceOverrides,
      "data-source-override"
    );

    const filing = await saveFiling(
      resolvedTicker,
      resolvedPeriod,
      resolvedSource,
      normalizedAnalysis,
      quarterHint,
      resolvedWorkflowOrigin
    );

    const responseAnalysis: FullAnalysis = {
      ...filing.analysis,
      meta: {
        ...filing.analysis.meta,
        rawFilingText: undefined,
      },
    };

    return Response.json({
      ok: true,
      ticker: filing.ticker,
      periodEnd: filing.periodEnd,
      analysis: responseAnalysis,
      appliedOverrideCount: Object.keys(dataSourceOverrides).length,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
