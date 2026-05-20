import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildWorkbookSnapshotFromAdjustments, normalizeWorkbookSnapshot } from "@/lib/dataSourceWorkbookSnapshot";
import { supabase } from "@/lib/supabase";
import type { ChatThreadKind, DataSourceWorkbookSnapshot } from "@/types/chatThread";

export const runtime = "nodejs";

function isMissingWorkbookThreadSchema(message: string | undefined): boolean {
  if (!message) return false;
  return [
    "company_name",
    "company_ticker",
    "source_thread_id",
    "workbook_snapshot",
    "data-source-workbook",
    "kind",
  ].some((token) => message.includes(token));
}

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
  const searchParams = new URL(req.url).searchParams;
  const kind = (searchParams.get("kind")?.trim() ?? "") as ChatThreadKind | "";
  const companyTicker = searchParams.get("companyTicker")?.trim().toUpperCase() ?? "";

  let query = db
    .from("chat_threads")
    .select("id, title, created_at, updated_at, kind, company_ticker, company_name, source_thread_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (kind === "general" || kind === "data-source-workbook") {
    query = query.eq("kind", kind);
  }
  if (companyTicker) {
    query = query.eq("company_ticker", companyTicker);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingWorkbookThreadSchema(error.message)) {
      if (kind === "data-source-workbook") {
        return NextResponse.json({
          threads: [],
          schemaReady: false,
          migrationRequired: true,
          migrationFile: "supabase-chat-schema.sql",
          error: error.message,
        });
      }

      const { data: legacyData, error: legacyError } = await db
        .from("chat_threads")
        .select("id, title, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
      return NextResponse.json({
        threads: (legacyData ?? []).map((thread) => ({
          id: thread.id,
          title: thread.title,
          createdAt: thread.created_at,
          updatedAt: thread.updated_at,
          kind: "general" as ChatThreadKind,
          companyTicker: null,
          companyName: null,
          sourceThreadId: null,
        })),
        schemaReady: false,
        migrationRequired: true,
        migrationFile: "supabase-chat-schema.sql",
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const threads = (data ?? []).map((thread) => ({
    id: thread.id,
    title: thread.title,
    createdAt: thread.created_at,
    updatedAt: thread.updated_at,
    kind: (thread.kind ?? "general") as ChatThreadKind,
    companyTicker: thread.company_ticker ?? null,
    companyName: thread.company_name ?? null,
    sourceThreadId: thread.source_thread_id ?? null,
  }));

  return NextResponse.json({ threads });
}

/** POST /api/chat/threads - create a new thread */
export async function POST(req: NextRequest) {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;
  const { userId, token } = result;
  const db = createAuthedClient(token);

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "data-source-workbook" ? "data-source-workbook" : "general";
  const companyTicker =
    typeof body.companyTicker === "string" && body.companyTicker.trim().length > 0
      ? body.companyTicker.trim().toUpperCase()
      : null;
  const companyName =
    typeof body.companyName === "string" && body.companyName.trim().length > 0
      ? body.companyName.trim()
      : null;
  const cloneLatestWorkbook = body.cloneLatestWorkbook !== false;
  const sourceThreadId =
    typeof body.sourceThreadId === "string" && body.sourceThreadId.trim().length > 0
      ? body.sourceThreadId.trim()
      : null;
  const title: string = body.title?.trim() || buildDefaultTitle(kind, companyTicker, companyName);
  let workbookSnapshot: DataSourceWorkbookSnapshot = {};

  if (kind === "data-source-workbook" && companyTicker && cloneLatestWorkbook) {
    workbookSnapshot = await cloneLatestWorkbookSnapshot({
      db,
      userId,
      companyTicker,
      sourceThreadId,
    });
  }

  const { data, error } = await db
    .from("chat_threads")
    .insert({
      user_id: userId,
      kind,
      title,
      company_ticker: companyTicker,
      company_name: companyName,
      source_thread_id: sourceThreadId,
      workbook_snapshot: workbookSnapshot,
    })
    .select("id, title, created_at, updated_at, kind, company_ticker, company_name, source_thread_id")
    .single();

  if (error) {
    if (isMissingWorkbookThreadSchema(error.message)) {
      if (kind === "data-source-workbook") {
        return NextResponse.json({
          error: "Workbook threads need the latest chat schema. Run supabase-chat-schema.sql in Supabase SQL Editor, then refresh.",
          migrationRequired: true,
          migrationFile: "supabase-chat-schema.sql",
          schemaReady: false,
        }, { status: 409 });
      }

      const { data: legacyData, error: legacyError } = await db
        .from("chat_threads")
        .insert({ user_id: userId, title })
        .select("id, title, created_at, updated_at")
        .single();

      if (legacyError) return NextResponse.json({ error: legacyError.message }, { status: 500 });
      return NextResponse.json({
        thread: {
          id: legacyData.id,
          title: legacyData.title,
          createdAt: legacyData.created_at,
          updatedAt: legacyData.updated_at,
          kind: "general" as ChatThreadKind,
          companyTicker: null,
          companyName: null,
          sourceThreadId: null,
        },
        schemaReady: false,
        migrationRequired: true,
        migrationFile: "supabase-chat-schema.sql",
      }, { status: 201 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    thread: {
      id: data.id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      kind: (data.kind ?? "general") as ChatThreadKind,
      companyTicker: data.company_ticker ?? null,
      companyName: data.company_name ?? null,
      sourceThreadId: data.source_thread_id ?? null,
    },
  }, { status: 201 });
}

function buildDefaultTitle(kind: ChatThreadKind, companyTicker: string | null, companyName: string | null): string {
  if (kind !== "data-source-workbook") return "New chat";
  const label = companyTicker ?? companyName ?? "Workbook";
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `${label} workbook ${timestamp}`;
}

async function cloneLatestWorkbookSnapshot({
  db,
  userId,
  companyTicker,
  sourceThreadId,
}: {
  db: ReturnType<typeof createAuthedClient>;
  userId: string;
  companyTicker: string;
  sourceThreadId: string | null;
}): Promise<DataSourceWorkbookSnapshot> {
  if (sourceThreadId) {
    const { data } = await db
      .from("chat_threads")
      .select("workbook_snapshot")
      .eq("id", sourceThreadId)
      .eq("user_id", userId)
      .eq("kind", "data-source-workbook")
      .maybeSingle();

    if (data?.workbook_snapshot) {
      return normalizeWorkbookSnapshot(data.workbook_snapshot);
    }
  }

  const { data: latestThread } = await db
    .from("chat_threads")
    .select("workbook_snapshot")
    .eq("user_id", userId)
    .eq("kind", "data-source-workbook")
    .eq("company_ticker", companyTicker)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestThread?.workbook_snapshot) {
    return normalizeWorkbookSnapshot(latestThread.workbook_snapshot);
  }

  const { data: adjustmentRow } = await supabase
    .from("adjustments")
    .select("data")
    .eq("ticker", companyTicker)
    .maybeSingle();

  return buildWorkbookSnapshotFromAdjustments(adjustmentRow?.data as {
    dataSourceOverrides?: Record<string, Record<string, number | null>>;
    dataSourceWorkbook?: import("@/types/dataSourceWorkbook").DataSourceWorkbookTickerState;
    dataSourceEditLog?: import("@/types/dataSourceWorkbook").DataSourceEditLogEntry[];
  } | undefined);
}
