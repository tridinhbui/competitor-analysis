import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function createAuthedClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/** Phase 2 strict: require a valid Bearer token. Returns user id + token or 401 response. */
async function requireUserId(
  req: NextRequest
): Promise<{ userId: string; token: string } | NextResponse> {
  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { userId: data.user.id, token };
}

/** GET /api/history - list analysis threads for the signed-in user only */
export async function GET(req: NextRequest) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId, token } = result;
  const db = createAuthedClient(token);

  const { data, error } = await db
    .from("analysis_history")
    .select("id, ticker, company_name, source, period_end, quarter_label, title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
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

/** POST /api/history - save a new analysis thread for the signed-in user */
export async function POST(req: NextRequest) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId, token } = result;
  const db = createAuthedClient(token);

  const body = await req.json();

  const { error } = await db.from("analysis_history").insert({
    user_id: userId,
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
