import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAuthedUser } from "@/lib/serverAuth";
import type { CompanyAdjustments } from "@/types/adjustments";
import { emptyAdjustments } from "@/types/adjustments";

/**
 * GET /api/adjustments?ticker=XYZ
 * Returns the CompanyAdjustments for a given ticker.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuthedUser(req);
  if (authResult instanceof NextResponse) return authResult;

  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("adjustments")
    .select("data")
    .eq("ticker", ticker)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(emptyAdjustments(ticker));
  }

  return NextResponse.json(data.data as CompanyAdjustments);
}

/**
 * PUT /api/adjustments
 * Body: CompanyAdjustments
 * Upserts the full adjustment set for a company.
 */
export async function PUT(req: NextRequest) {
  const authResult = await requireAuthedUser(req);
  if (authResult instanceof NextResponse) return authResult;

  const body: CompanyAdjustments = await req.json();
  if (!body.ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const ticker = body.ticker.toUpperCase();
  body.ticker = ticker;
  body.updatedAt = new Date().toISOString();

  const { error } = await supabase
    .from("adjustments")
    .upsert({ ticker, data: body, updated_at: new Date().toISOString() }, { onConflict: "ticker" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticker });
}
