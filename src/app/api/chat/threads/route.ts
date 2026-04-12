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

async function requireUserId(
  req: NextRequest
): Promise<{ userId: string; token: string } | NextResponse> {
  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: data.user.id, token };
}

/** GET /api/chat/threads - list threads for the signed-in user */
export async function GET(req: NextRequest) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId, token } = result;
  const db = createAuthedClient(token);

  const { data, error } = await db
    .from("chat_threads")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threads: data ?? [] });
}

/** POST /api/chat/threads - create a new thread */
export async function POST(req: NextRequest) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId, token } = result;
  const db = createAuthedClient(token);

  const body = await req.json().catch(() => ({}));
  const title: string = body.title?.trim() || "New chat";

  const { data, error } = await db
    .from("chat_threads")
    .insert({ user_id: userId, title })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thread: data }, { status: 201 });
}
