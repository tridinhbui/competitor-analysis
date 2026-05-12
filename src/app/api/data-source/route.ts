import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractMetrics } from "@/lib/analysisModules";
import { normalizeCompanyName } from "@/lib/filingIdentity";
import type { DataSourceRow } from "@/types/dataSource";
import type { Filing } from "@/types/competitor";
import type { FullAnalysis } from "@/types/analysis";
import { applyDataSourceOverridesToAnalysis } from "@/lib/dataSourceOverrides";
import type {
  DataSourceEditLogEntry,
  DataSourceWorkbookCellPayload,
  DataSourceWorkbookCellState,
  DataSourceWorkbookTickerState,
} from "@/types/dataSourceWorkbook";
import { groupWorkbookCellsByTicker, normalizeCellState } from "@/lib/dataSourceWorkbook";

export const runtime = "nodejs";

/** GET /api/data-source — returns all filings as flat editable rows */
export async function GET() {
  const { data: filings, error } = await supabase
    .from("filings")
    .select("id, ticker, period_end, fiscal_year, fiscal_quarter, quarter_label, source, analysis, saved_at")
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
  const workbookStateMap = new Map<string, DataSourceWorkbookTickerState>();
  const editLog: DataSourceEditLogEntry[] = [];
  for (const adj of adjustments ?? []) {
    const d = adj.data as {
      dataSourceOverrides?: Record<string, Record<string, number | null>>;
      dataSourceWorkbook?: DataSourceWorkbookTickerState;
      dataSourceEditLog?: DataSourceEditLogEntry[];
    };
    if (d?.dataSourceOverrides) {
      overrideMap.set(adj.ticker, d.dataSourceOverrides);
    }
    if (d?.dataSourceWorkbook) {
      workbookStateMap.set(adj.ticker, d.dataSourceWorkbook);
    }
    if (Array.isArray(d?.dataSourceEditLog)) {
      for (const entry of d.dataSourceEditLog) {
        if (
          entry &&
          typeof entry === "object" &&
          typeof entry.at === "string" &&
          typeof entry.field === "string" &&
          typeof entry.periodEnd === "string"
        ) {
          editLog.push({
            ...entry,
            ticker: entry.ticker ?? adj.ticker,
          });
        }
      }
    }
  }
  editLog.sort((a, b) => b.at.localeCompare(a.at));

  const rows: DataSourceRow[] = [];
  const workbookCells: Record<string, Record<string, DataSourceWorkbookCellState>> = {};

  for (const f of filings ?? []) {
    const analysis = f.analysis as FullAnalysis;
    if (!analysis) continue;

    const company = companyMap.get(f.ticker);
    const displayName = normalizeCompanyName({
      candidate: analysis.meta.companyName ?? company?.name ?? f.ticker,
      fileName: analysis.meta.fileName,
      ticker: f.ticker,
    });
    const peerType = (company?.peerType ?? "diversified-protein") as import("@/types/competitor").PeerType;

    const filing: Filing = {
      ticker: f.ticker,
      periodEnd: f.period_end,
      source: f.source ?? "sec",
      filingType: "10-Q",
      filingDate: "",
      savedAt: "",
      analysis,
      quarter:
        typeof f.fiscal_year === "number" && typeof f.fiscal_quarter === "number"
          ? {
              periodEnd: f.period_end,
              fiscalYear: f.fiscal_year,
              fiscalQuarter: f.fiscal_quarter,
              label:
                typeof f.quarter_label === "string" && f.quarter_label.trim()
                  ? f.quarter_label
                  : `Q${f.fiscal_quarter} ${f.fiscal_year}`,
            }
          : undefined,
    };

    const m = extractMetrics(filing, peerType);

    // Find depreciation and other items from raw items
    const cfItems = analysis.cfItems ?? [];
    const depItem = cfItems.find((i) =>
      i.tag === "DepreciationDepletionAndAmortization" ||
      i.tag === "DepreciationAndAmortization" ||
      i.tag === "Depreciation"
    );
    const sbcItem = cfItems.find((i) => i.tag === "ShareBasedCompensation");

    const ebit = m.operatingIncome;
    const ebitda = ebit != null && depItem?.value != null ? ebit + Math.abs(depItem.value) : null;
    const ebitdaMargin = ebitda != null && m.revenue != null && m.revenue > 0
      ? parseFloat(((ebitda / m.revenue) * 100).toFixed(1)) : null;

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

    const workflowOrigin = analysis.meta.workflowOrigin === "competitor" ? "competitor" : "analyze";

    const row: DataSourceRow = {
      id: f.id,
      workflowOrigin,
      ticker: f.ticker,
      companyName: displayName,
      periodEnd: f.period_end,
      quarterLabel: m.quarterLabel,
      savedAt: typeof f.saved_at === "string" ? f.saved_at : null,
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
      ebitdaMargin: overrides.ebitdaMargin ?? ebitdaMargin,
      interestExpense: overrides.interestExpense ?? analysis.incomeStatement?.interestExpense ?? null,
      epsBasic: overrides.epsBasic ?? analysis.incomeStatement?.epsBasic ?? null,
      epsDiluted: overrides.epsDiluted ?? analysis.incomeStatement?.epsDiluted ?? null,
      shareBasedComp: overrides.shareBasedComp ?? sbcItem?.value ?? null,
      dividendsPaid: overrides.dividendsPaid ?? m.dividendsPaid ?? null,
      roe: overrides.roe ?? m.roe ?? null,
      roa: overrides.roa ?? m.roa ?? null,
      fcfMargin: overrides.fcfMargin ?? m.fcfMargin ?? null,
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

    const workbookPeriodState = workbookStateMap.get(f.ticker)?.[f.period_end];
    if (workbookPeriodState) {
      const normalizedFields = Object.entries(workbookPeriodState).reduce<Record<string, DataSourceWorkbookCellState>>(
        (acc, [field, state]) => {
          const normalized = normalizeCellState(state);
          if (normalized) acc[field] = normalized;
          return acc;
        },
        {},
      );

      if (Object.keys(normalizedFields).length > 0) {
        workbookCells[f.id] = normalizedFields;
      }
    }
  }

  // ── Compute TTM rows: sum last 4 quarters per ticker for flow metrics
  const byTicker = new Map<string, DataSourceRow[]>();
  for (const r of rows) {
    const key = `${r.workflowOrigin}:${r.ticker}`;
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key)!.push(r);
  }

  const ttmRows: DataSourceRow[] = [];
  for (const [groupKey, tickerRows] of byTicker) {
    const [workflowOrigin, tk] = groupKey.split(":") as ["analyze" | "competitor", string];
    const sorted = tickerRows.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    if (sorted.length < 4) continue;
    const last4 = sorted.slice(-4);
    const latest = last4[3];
    const sumN = (fn: (r: DataSourceRow) => number | null) => {
      const vals = last4.map(fn).filter((v): v is number => v != null);
      return vals.length === 4 ? Math.round(vals.reduce((a, b) => a + b, 0)) : null;
    };
    const rev = sumN(r => r.revenue);
    const gp = sumN(r => r.grossProfit);
    const op = sumN(r => r.operatingIncome);
    const ni = sumN(r => r.netIncome);
    const ebitdaVal = sumN(r => r.ebitda);
    const ocf = sumN(r => r.operatingCashFlow);
    const fcfVal = sumN(r => r.freeCashFlow);
    const capexVal = sumN(r => r.capex);
    const divPaid = sumN(r => r.dividendsPaid);
    const sgaVal = sumN(r => r.sgaExpense);
    const depVal = sumN(r => r.depreciation);

    const pctCalc = (a: number | null, b: number | null) =>
      a != null && b != null && b > 0 ? parseFloat(((a / b) * 100).toFixed(1)) : null;

    ttmRows.push({
      id: `${workflowOrigin}:${tk}_TTM`,
      workflowOrigin,
      ticker: tk,
      companyName: latest.companyName,
      periodEnd: "TTM",
      quarterLabel: `TTM (${last4[0].quarterLabel}–${last4[3].quarterLabel})`,
      savedAt: latest.savedAt ?? null,
      revenue: rev,
      grossProfit: gp,
      operatingIncome: op,
      netIncome: ni,
      totalAssets: latest.totalAssets,
      totalLiabilities: latest.totalLiabilities,
      totalEquity: latest.totalEquity,
      totalDebt: latest.totalDebt,
      cashAndEquivalents: latest.cashAndEquivalents,
      operatingCashFlow: ocf,
      capex: capexVal,
      freeCashFlow: fcfVal,
      grossMargin: pctCalc(gp, rev),
      operatingMargin: pctCalc(op, rev),
      netMargin: pctCalc(ni, rev),
      debtToEquity: latest.debtToEquity,
      currentRatio: latest.currentRatio,
      sgaExpense: sgaVal,
      depreciation: depVal,
      ebit: op,
      ebitda: ebitdaVal,
      ebitdaMargin: pctCalc(ebitdaVal, rev),
      interestExpense: sumN(r => r.interestExpense),
      epsBasic: null, // TTM EPS not simple sum
      epsDiluted: null,
      shareBasedComp: sumN(r => r.shareBasedComp),
      dividendsPaid: divPaid,
      roe: pctCalc(ni, latest.totalEquity),
      roa: pctCalc(ni, latest.totalAssets),
      fcfMargin: pctCalc(fcfVal, rev),
      volumeHeads: null,
      volumeLbs: null,
      volumeCwt: null,
      opPerHead: null,
      opPerCwt: null,
      ercAdjustment: null,
      legalChargeAdjustment: null,
      transferValueAdjustment: null,
      corporateAllocationAdjustment: null,
      adjustedOperatingIncome: null,
      adjustedOperatingMargin: null,
      adjustedOpPerHead: null,
      adjustedOpPerCwt: null,
      sgaAsPercent: pctCalc(sgaVal != null ? Math.abs(sgaVal) : null, rev),
    });
  }

  return NextResponse.json({
    rows: [...rows, ...ttmRows],
    workbookCells,
    editLog,
    updatedAt: new Date().toISOString(),
  });
}

/** PATCH /api/data-source — save cell overrides */
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    edits: Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }>;
    workbookCells?: DataSourceWorkbookCellPayload[];
    workbookTickers?: string[];
  };
  const editsPayload = body.edits ?? [];

  if (!editsPayload.length && !body.workbookCells?.length) {
    return NextResponse.json({ error: "No workbook changes provided" }, { status: 400 });
  }

  // Group edits by ticker
  const byTicker = new Map<string, Array<{ periodEnd: string; field: string; value: number | null }>>();
  for (const edit of editsPayload) {
    if (!byTicker.has(edit.ticker)) byTicker.set(edit.ticker, []);
    byTicker.get(edit.ticker)!.push(edit);
  }

  const workbookCellsByTicker = groupWorkbookCellsByTicker(body.workbookCells ?? []);
  const workbookTickers = new Set(
    (body.workbookTickers ?? []).map((ticker) => ticker.toUpperCase()).filter((ticker) => ticker.length > 0),
  );
  for (const ticker of Object.keys(workbookCellsByTicker)) {
    workbookTickers.add(ticker.toUpperCase());
  }
  for (const ticker of byTicker.keys()) {
    workbookTickers.add(ticker.toUpperCase());
  }

  for (const ticker of workbookTickers) {
    const edits = byTicker.get(ticker) ?? [];
    // Load existing adjustments
    const { data } = await supabase
      .from("adjustments")
      .select("data")
      .eq("ticker", ticker)
      .maybeSingle();

    const existing = (data?.data ?? { ticker, insights: [], cells: [], footnotes: [], blocks: [], updatedAt: "" }) as Record<string, unknown>;
    const overrides = (existing.dataSourceOverrides ?? {}) as Record<string, Record<string, number | null>>;
    const tickerLog = Array.isArray(existing.dataSourceEditLog)
      ? ((existing.dataSourceEditLog as unknown[]).filter(
          (entry): entry is DataSourceEditLogEntry =>
            !!entry && typeof entry === "object" && "at" in entry && "field" in entry,
        ))
      : [];
    const now = new Date().toISOString();

    for (const edit of edits) {
      if (!overrides[edit.periodEnd]) overrides[edit.periodEnd] = {};
      const prev = overrides[edit.periodEnd][edit.field] ?? null;
      if (prev !== edit.value) {
        tickerLog.push({
          at: now,
          ticker,
          periodEnd: edit.periodEnd,
          field: edit.field,
          prevValue: prev,
          nextValue: edit.value,
          kind: "value",
        });
      }
      overrides[edit.periodEnd][edit.field] = edit.value;
    }

    existing.dataSourceOverrides = overrides;
    // Cap log at 500 most recent entries to bound JSONB row size.
    existing.dataSourceEditLog = tickerLog.slice(-500);
    const tickerWorkbookState = workbookCellsByTicker[ticker];
    if (tickerWorkbookState && Object.keys(tickerWorkbookState).length > 0) {
      existing.dataSourceWorkbook = tickerWorkbookState;
    } else {
      delete existing.dataSourceWorkbook;
    }
    existing.updatedAt = new Date().toISOString();

    await supabase
      .from("adjustments")
      .upsert({ ticker, data: existing, updated_at: new Date().toISOString() }, { onConflict: "ticker" });
  }

  const filingIds = [
    ...new Set(
      editsPayload
        .map((e) => e.id)
        .filter((id) => typeof id === "string" && id.length > 0 && !id.endsWith("_TTM")),
    ),
  ];

  for (const filingId of filingIds) {
    const { data: filing, error: loadErr } = await supabase
      .from("filings")
      .select("id, ticker, period_end, analysis")
      .eq("id", filingId)
      .maybeSingle();

    if (loadErr || !filing?.analysis || !filing.ticker || !filing.period_end) continue;

    const { data: adjRow } = await supabase
      .from("adjustments")
      .select("data")
      .eq("ticker", filing.ticker)
      .maybeSingle();

    const payload = adjRow?.data as { dataSourceOverrides?: Record<string, Record<string, number | null>> } | undefined;
    const periodOverrides = payload?.dataSourceOverrides?.[filing.period_end] ?? {};

    const updatedAnalysis = applyDataSourceOverridesToAnalysis(
      filing.analysis as FullAnalysis,
      periodOverrides,
      "data-source-override",
    );

    await supabase.from("filings").update({ analysis: updatedAnalysis }).eq("id", filingId);
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/data-source — clear all filings for one workflow table */
export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    workflowOrigin?: "analyze" | "competitor";
    confirmationText?: string;
  };

  const workflowOrigin = body.workflowOrigin;
  if (workflowOrigin !== "analyze" && workflowOrigin !== "competitor") {
    return NextResponse.json({ error: "workflowOrigin must be 'analyze' or 'competitor'" }, { status: 400 });
  }

  const expectedConfirmationText =
    workflowOrigin === "analyze"
      ? "Delete Quick Analyze Records"
      : "Delete Competitor Analyze Records";

  if ((body.confirmationText ?? "").trim() !== expectedConfirmationText) {
    return NextResponse.json(
      { error: `You must type "${expectedConfirmationText}" exactly to confirm deletion.` },
      { status: 400 }
    );
  }

  const { data: filings, error } = await supabase
    .from("filings")
    .select("id, analysis");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const idsToDelete = (filings ?? [])
    .filter((f) => {
      const analysis = f.analysis as FullAnalysis | null;
      const origin = analysis?.meta?.workflowOrigin === "competitor" ? "competitor" : "analyze";
      return origin === workflowOrigin;
    })
    .map((f) => f.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (idsToDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error: deleteError } = await supabase
    .from("filings")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: idsToDelete.length });
}
