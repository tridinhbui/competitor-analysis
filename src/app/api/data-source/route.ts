import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractMetrics } from "@/lib/analysisModules";
import type { DataSourceRow } from "@/types/dataSource";
import type { Filing } from "@/types/competitor";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

/** GET /api/data-source — returns all filings as flat editable rows */
export async function GET() {
  const { data: filings, error } = await supabase
    .from("filings")
    .select("id, ticker, period_end, source, analysis")
    .order("ticker")
    .order("period_end", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Load company names
  const { data: companies } = await supabase
    .from("companies")
    .select("ticker, name, peer_type");

  const companyMap = new Map<string, { name: string; peerType: string }>();
  for (const c of companies ?? []) {
    companyMap.set(c.ticker, { name: c.name, peerType: c.peer_type ?? "diversified-protein" });
  }

  // Load adjustments (overrides)
  const { data: adjustments } = await supabase
    .from("adjustments")
    .select("ticker, data");

  const overrideMap = new Map<string, Record<string, Record<string, number | null>>>();
  for (const adj of adjustments ?? []) {
    const d = adj.data as { dataSourceOverrides?: Record<string, Record<string, number | null>> };
    if (d?.dataSourceOverrides) {
      overrideMap.set(adj.ticker, d.dataSourceOverrides);
    }
  }

  const rows: DataSourceRow[] = [];

  for (const f of filings ?? []) {
    const analysis = f.analysis as FullAnalysis;
    if (!analysis) continue;

    const company = companyMap.get(f.ticker);
    const peerType = (company?.peerType ?? "diversified-protein") as import("@/types/competitor").PeerType;

    const filing: Filing = {
      ticker: f.ticker,
      periodEnd: f.period_end,
      source: f.source ?? "sec",
      filingType: "10-Q",
      filingDate: "",
      savedAt: "",
      analysis,
    };

    const m = extractMetrics(filing, peerType);

    // Find depreciation from raw items
    const cfItems = analysis.cfItems ?? [];
    const depItem = cfItems.find((i) =>
      i.tag === "DepreciationDepletionAndAmortization" ||
      i.tag === "DepreciationAndAmortization" ||
      i.tag === "Depreciation"
    );

    const ebit = m.operatingIncome;
    const ebitda = ebit != null && depItem?.value != null ? ebit + Math.abs(depItem.value) : null;

    // Apply overrides
    const overrides = overrideMap.get(f.ticker)?.[f.period_end] ?? {};

    // Compute volume-derived per-unit metrics
    const rawSga = overrides.sgaExpense ?? m.sgaExpense;
    const rawRevenue = overrides.revenue ?? m.revenue;
    const rawOp = overrides.operatingIncome ?? m.operatingIncome;
    const volumeHeads = (overrides.volumeHeads ?? null) as number | null;
    const volumeLbs = (overrides.volumeLbs ?? null) as number | null;
    // cwt = lbs / 100 (but stored as millions of cwt = volumeLbs / 100)
    const volumeCwt = (overrides.volumeCwt ?? (volumeLbs != null ? volumeLbs / 100 : null)) as number | null;
    // OP/Head = operatingIncome ($M) * 1,000,000 / (volumeHeads * 1000) = OP * 1000 / volumeHeads
    const opPerHead = volumeHeads != null && rawOp != null && volumeHeads > 0
      ? parseFloat(((rawOp * 1000) / volumeHeads).toFixed(2))
      : null;
    // OP/cwt = operatingIncome ($M) / volumeCwt (M cwt) = $/cwt
    const opPerCwt = volumeCwt != null && rawOp != null && volumeCwt > 0
      ? parseFloat((rawOp / volumeCwt).toFixed(2))
      : null;
    const ercAdjustment = (overrides.ercAdjustment ?? null) as number | null;
    const legalChargeAdjustment = (overrides.legalChargeAdjustment ?? null) as number | null;
    const transferValueAdjustment = (overrides.transferValueAdjustment ?? null) as number | null;
    const corporateAllocationAdjustment = (overrides.corporateAllocationAdjustment ?? null) as number | null;
    // Adjusted OP = OP - ERC (remove favorable ERC) + legalCharge (add back excluded charges)
    //   - transferValue (remove intercompany transfer pricing impact)
    //   - corporateAllocation (add back corporate overhead reallocation)
    const adjustedOperatingIncome = rawOp != null
      ? rawOp - (ercAdjustment ?? 0) + (legalChargeAdjustment ?? 0) - (transferValueAdjustment ?? 0) + (corporateAllocationAdjustment ?? 0)
      : null;
    const adjustedOperatingMargin = adjustedOperatingIncome != null && rawRevenue != null && rawRevenue > 0
      ? parseFloat((adjustedOperatingIncome / rawRevenue).toFixed(4))
      : null;
    // Adjusted per-unit metrics using adjustedOperatingIncome
    const adjustedOpPerHead = volumeHeads != null && adjustedOperatingIncome != null && volumeHeads > 0
      ? parseFloat(((adjustedOperatingIncome * 1000) / volumeHeads).toFixed(2))
      : null;
    const adjustedOpPerCwt = volumeCwt != null && adjustedOperatingIncome != null && volumeCwt > 0
      ? parseFloat((adjustedOperatingIncome / volumeCwt).toFixed(2))
      : null;
    const sgaAsPercent = rawSga != null && rawRevenue != null && rawRevenue > 0
      ? parseFloat((Math.abs(rawSga) / rawRevenue).toFixed(4))
      : null;

    const row: DataSourceRow = {
      id: f.id,
      ticker: f.ticker,
      companyName: company?.name ?? f.ticker,
      periodEnd: f.period_end,
      quarterLabel: m.quarterLabel,
      revenue: rawRevenue,
      grossProfit: overrides.grossProfit ?? m.grossProfit,
      operatingIncome: rawOp,
      netIncome: overrides.netIncome ?? m.netIncome,
      totalAssets: overrides.totalAssets ?? m.totalAssets,
      totalLiabilities: overrides.totalLiabilities ?? m.totalLiabilities,
      totalEquity: overrides.totalEquity ?? m.totalEquity,
      totalDebt: overrides.totalDebt ?? m.totalDebt,
      cashAndEquivalents: overrides.cashAndEquivalents ?? m.cash,
      operatingCashFlow: overrides.operatingCashFlow ?? m.operatingCashFlow,
      capex: overrides.capex ?? m.capex,
      freeCashFlow: overrides.freeCashFlow ?? m.freeCashFlow,
      grossMargin: overrides.grossMargin ?? m.grossMargin,
      operatingMargin: overrides.operatingMargin ?? m.operatingMargin,
      netMargin: overrides.netMargin ?? m.netMargin,
      debtToEquity: overrides.debtToEquity ?? m.debtToEquity,
      currentRatio: overrides.currentRatio ?? m.currentRatio,
      sgaExpense: rawSga,
      depreciation: overrides.depreciation ?? depItem?.value ?? null,
      ebit: overrides.ebit ?? ebit,
      ebitda: overrides.ebitda ?? ebitda,
      // Volume & per-unit
      volumeHeads,
      volumeLbs,
      volumeCwt,
      opPerHead,
      opPerCwt,
      // Non-GAAP adjustments
      ercAdjustment,
      legalChargeAdjustment,
      transferValueAdjustment,
      corporateAllocationAdjustment,
      adjustedOperatingIncome,
      adjustedOperatingMargin,
      adjustedOpPerHead,
      adjustedOpPerCwt,
      sgaAsPercent,
    };

    rows.push(row);
  }

  return NextResponse.json({ rows, updatedAt: new Date().toISOString() });
}

/** PATCH /api/data-source — save cell overrides */
export async function PATCH(req: NextRequest) {
  const body = await req.json() as { edits: Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }> };

  if (!body.edits?.length) {
    return NextResponse.json({ error: "No edits provided" }, { status: 400 });
  }

  // Group edits by ticker
  const byTicker = new Map<string, Array<{ periodEnd: string; field: string; value: number | null }>>();
  for (const edit of body.edits) {
    if (!byTicker.has(edit.ticker)) byTicker.set(edit.ticker, []);
    byTicker.get(edit.ticker)!.push(edit);
  }

  for (const [ticker, edits] of byTicker) {
    // Load existing adjustments
    const { data } = await supabase
      .from("adjustments")
      .select("data")
      .eq("ticker", ticker)
      .maybeSingle();

    const existing = (data?.data ?? { ticker, insights: [], cells: [], footnotes: [], blocks: [], updatedAt: "" }) as Record<string, unknown>;
    const overrides = (existing.dataSourceOverrides ?? {}) as Record<string, Record<string, number | null>>;

    for (const edit of edits) {
      if (!overrides[edit.periodEnd]) overrides[edit.periodEnd] = {};
      overrides[edit.periodEnd][edit.field] = edit.value;
    }

    existing.dataSourceOverrides = overrides;
    existing.updatedAt = new Date().toISOString();

    await supabase
      .from("adjustments")
      .upsert({ ticker, data: existing, updated_at: new Date().toISOString() }, { onConflict: "ticker" });
  }

  return NextResponse.json({ ok: true });
}
