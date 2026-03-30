import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET /api/history — list all analysis threads */
export async function GET() {
  // Note: analysis_history table must be created in Supabase dashboard.
  // See supabase-schema.sql for the CREATE TABLE statement.

  const { data, error } = await supabase
    .from("analysis_history")
    .select("id, ticker, company_name, source, period_end, quarter_label, title, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // Table might not exist yet
    if (error.message.includes("does not exist")) {
      return NextResponse.json({ threads: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads = (data ?? []).map((d) => ({
    id: d.id,
    ticker: d.ticker,
    companyName: d.company_name,
    source: d.source,
    periodEnd: d.period_end,
    quarterLabel: d.quarter_label,
    title: d.title,
    createdAt: d.created_at,
  }));

  return NextResponse.json({ threads });
}

/** POST /api/history — save a new analysis thread */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const { error } = await supabase.from("analysis_history").insert({
    ticker: body.ticker ?? null,
    company_name: body.companyName ?? null,
    source: body.source ?? "sec",
    period_end: body.periodEnd ?? null,
    quarter_label: body.quarterLabel ?? null,
    title: body.title ?? "Untitled Analysis",
    analysis: body.analysis,
    events: body.events ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
