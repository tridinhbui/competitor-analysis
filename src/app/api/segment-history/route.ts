import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { FullAnalysis } from "@/types/analysis";
import type { SegmentData } from "@/types/segments";

export const runtime = "nodejs";

/** Segment data for one quarter */
export interface SegmentQuarter {
  periodEnd: string;
  quarterLabel: string;
  segments: SegmentData[];
}

/**
 * GET /api/segment-history?ticker=TSN
 * Returns segment data across all quarters for a given ticker.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  const { data: filings, error } = await supabase
    .from("filings")
    .select("period_end, quarter_label, analysis")
    .eq("ticker", ticker)
    .order("period_end", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const quarters: SegmentQuarter[] = [];

  for (const f of filings ?? []) {
    const analysis = f.analysis as FullAnalysis;
    if (!analysis?.segments?.length) continue;

    quarters.push({
      periodEnd: f.period_end,
      quarterLabel: f.quarter_label ?? f.period_end,
      segments: analysis.segments,
    });
  }

  return NextResponse.json({ ticker, quarters });
}
