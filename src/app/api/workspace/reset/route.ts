import { supabase } from "@/lib/supabase";
import { requireAdminUser } from "@/lib/serverAuth";

export const runtime = "nodejs";

interface ResetWorkspaceBody {
  ticker?: string;
}

export async function POST(request: Request) {
  const adminResult = await requireAdminUser(request);
  if (adminResult instanceof Response) return adminResult;

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
    const [{ data: filings, error: filingsReadError }, { data: company, error: companyReadError }] = await Promise.all([
      supabase.from("filings").select("id").eq("ticker", ticker),
      supabase.from("companies").select("ticker").eq("ticker", ticker).maybeSingle(),
    ]);

    if (filingsReadError) {
      return Response.json({ error: filingsReadError.message }, { status: 500 });
    }
    if (companyReadError) {
      return Response.json({ error: companyReadError.message }, { status: 500 });
    }
    if (!company) {
      return Response.json({ error: `Company ${ticker} not found` }, { status: 404 });
    }

    const filingIds = (filings ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (filingIds.length > 0) {
      const { error: deleteFilingsError } = await supabase.from("filings").delete().in("id", filingIds);
      if (deleteFilingsError) {
        return Response.json({ error: deleteFilingsError.message }, { status: 500 });
      }
    }

    // Optional table in some environments; ignore if unavailable.
    const { data: maybeAdjustment } = await supabase.from("adjustments").select("ticker").eq("ticker", ticker).limit(1);
    if (maybeAdjustment !== null) {
      await supabase.from("adjustments").delete().eq("ticker", ticker);
    }

    const { error: deleteCompanyError } = await supabase.from("companies").delete().eq("ticker", ticker);
    if (deleteCompanyError) {
      return Response.json({ error: deleteCompanyError.message }, { status: 500 });
    }

    return Response.json({ ok: true, ticker, deletedFilings: filingIds.length, deletedCompany: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
