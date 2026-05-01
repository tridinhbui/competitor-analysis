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

type WorkflowOrigin = "analyze" | "competitor";

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
    .select("id, ticker, company_name, source, period_end, quarter_label, title, created_at, analysis")
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
    workflowOrigin: d.analysis?.meta?.workflowOrigin === "competitor" ? "competitor" : "analyze",
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
  const workflowOrigin: WorkflowOrigin = body.workflowOrigin === "competitor" ? "competitor" : "analyze";
  const analysisMeta = body.analysis?.meta ?? {};
  const analysisForSave = body.analysis
    ? { ...body.analysis, meta: { ...analysisMeta, workflowOrigin } }
    : body.analysis;

  const aiTitle = await generateHistoryTitle({
    ticker: body.ticker ?? null,
    companyName: body.companyName ?? null,
    source: body.source ?? "sec",
    quarterLabel: body.quarterLabel ?? null,
    periodEnd: body.periodEnd ?? null,
    workflowOrigin,
  });
  const fallbackTitle = buildFallbackTitle({
    ticker: body.ticker ?? null,
    companyName: body.companyName ?? null,
    source: body.source ?? "sec",
    quarterLabel: body.quarterLabel ?? null,
    periodEnd: body.periodEnd ?? null,
    workflowOrigin,
  });
  const resolvedTitle =
    typeof aiTitle === "string" && aiTitle.trim() ? aiTitle.trim().slice(0, 140) : fallbackTitle;

  const { error } = await db.from("analysis_history").insert({
    user_id: userId,
    ticker: body.ticker ?? null,
    company_name: body.companyName ?? null,
    source: body.source ?? "sec",
    period_end: body.periodEnd ?? null,
    quarter_label: body.quarterLabel ?? null,
    title: resolvedTitle,
    analysis: analysisForSave,
    events: body.events ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function buildFallbackTitle(input: {
  ticker: string | null;
  companyName: string | null;
  source: "sec" | "pdf";
  quarterLabel: string | null;
  periodEnd: string | null;
  workflowOrigin: WorkflowOrigin;
}): string {
  const name = input.companyName?.trim() || input.ticker?.trim() || "Company";
  const period = input.quarterLabel?.trim() || input.periodEnd?.slice(0, 7) || "Latest Period";
  if (input.workflowOrigin === "competitor") {
    return `${name} Peer Benchmark Review (${period})`;
  }
  return input.source === "pdf"
    ? `${name} Quick Analyze Brief (${period}, PDF)`
    : `${name} Quick Analyze Brief (${period})`;
}

async function generateHistoryTitle(input: {
  ticker: string | null;
  companyName: string | null;
  source: "sec" | "pdf";
  quarterLabel: string | null;
  periodEnd: string | null;
  workflowOrigin: WorkflowOrigin;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const systemPrompt =
    "You create concise, professional titles for finance analysis history logs. Return ONLY plain text title (no quotes), 6-12 words, include company/ticker and period when possible.";

  const userPrompt = [
    `Workflow: ${input.workflowOrigin === "competitor" ? "Competitor Analysis" : "Quick Analyze"}`,
    `Company: ${input.companyName ?? "Unknown"}`,
    `Ticker: ${input.ticker ?? "N/A"}`,
    `Source: ${input.source.toUpperCase()}`,
    `Quarter label: ${input.quarterLabel ?? "N/A"}`,
    `Period end: ${input.periodEnd ?? "N/A"}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 48,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return text.replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}
