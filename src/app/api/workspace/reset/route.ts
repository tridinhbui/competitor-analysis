import { setWorkspaceResetAt } from "@/lib/workspaceReset";

export const runtime = "nodejs";

interface ResetWorkspaceBody {
  ticker?: string;
}

export async function POST(request: Request) {
  let body: ResetWorkspaceBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  try {
    const resetAt = await setWorkspaceResetAt(ticker);
    return Response.json({ ok: true, ticker, resetAt });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
