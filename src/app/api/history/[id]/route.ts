import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** Phase 2 strict: require a valid Bearer token. Returns user id or 401 response. */
async function requireUserId(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
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

  return { userId: data.user.id };
}

/** GET /api/history/[id] — load a specific thread (owner only) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId } = result;

  const { id } = await params;

  const { data, error } = await supabase
    .from("analysis_history")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    ticker: data.ticker,
    companyName: data.company_name,
    source: data.source,
    periodEnd: data.period_end,
    quarterLabel: data.quarter_label,
    title: data.title,
    createdAt: data.created_at,
    analysis: data.analysis,
    events: data.events,
  });
}

/** DELETE /api/history/[id] — remove a thread (owner only) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId } = result;

  const { id } = await params;

  const { error } = await supabase
    .from("analysis_history")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
