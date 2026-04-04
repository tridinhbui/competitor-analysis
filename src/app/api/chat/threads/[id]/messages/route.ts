import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function requireUserId(req: NextRequest): Promise<{ userId: string } | NextResponse> {
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
  return { userId: data.user.id };
}

/** Verify that the thread belongs to the user */
async function requireThreadOwner(
  threadId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  return data != null;
}

/** GET /api/chat/threads/[id]/messages — list messages for a thread */
export async function GET(req: NextRequest, { params }: Params) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId } = result;

  const { id: threadId } = await params;
  const owns = await requireThreadOwner(threadId, userId);
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

/** POST /api/chat/threads/[id]/messages — save a pair of user+assistant messages */
export async function POST(req: NextRequest, { params }: Params) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId } = result;

  const { id: threadId } = await params;
  const owns = await requireThreadOwner(threadId, userId);
  if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> =
    body.messages ?? [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] required" }, { status: 400 });
  }

  const rows = messages.map((m) => ({
    thread_id: threadId,
    user_id: userId,
    role: m.role,
    content: m.content,
  }));

  const { error: insertErr } = await supabase.from("chat_messages").insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update thread.updated_at
  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);

  return NextResponse.json({ ok: true });
}
