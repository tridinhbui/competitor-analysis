import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface ClearAllBody {
  confirmationText?: string;
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ClearAllBody;

  if ((body.confirmationText ?? "").trim().toLowerCase() !== "delete all") {
    return Response.json(
      { error: 'You must type "delete all" exactly to confirm deletion.' },
      { status: 400 }
    );
  }

  const [{ data: filings, error: filingsError }, { data: companies, error: companiesError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
    supabase.from("filings").select("id"),
    supabase.from("companies").select("ticker"),
    supabase.from("adjustments").select("ticker"),
  ]);

  if (filingsError) return Response.json({ error: filingsError.message }, { status: 500 });
  if (companiesError) return Response.json({ error: companiesError.message }, { status: 500 });
  if (adjustmentsError) return Response.json({ error: adjustmentsError.message }, { status: 500 });

  const filingIds = (filings ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const companyTickers = (companies ?? [])
    .map((row) => row.ticker)
    .filter((ticker): ticker is string => typeof ticker === "string" && ticker.length > 0);
  const adjustmentTickers = (adjustments ?? [])
    .map((row) => row.ticker)
    .filter((ticker): ticker is string => typeof ticker === "string" && ticker.length > 0);

  if (filingIds.length > 0) {
    const { error } = await supabase.from("filings").delete().in("id", filingIds);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (adjustmentTickers.length > 0) {
    const { error } = await supabase.from("adjustments").delete().in("ticker", adjustmentTickers);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  if (companyTickers.length > 0) {
    const { error } = await supabase.from("companies").delete().in("ticker", companyTickers);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    deletedFilings: filingIds.length,
    deletedCompanies: companyTickers.length,
    deletedAdjustments: adjustmentTickers.length,
    historyPreserved: true,
  });
}