"use client";

import { useEffect, useMemo, useState } from "react";
import type { FullAnalysis } from "@/types/analysis";
import type { DataSourceRow } from "@/types/dataSource";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";

export function useInsightsTabModel(result: FullAnalysis) {
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, incomeStatement: inc } = result;
  const cfItems = result.cfItems ?? [];

  // ── Fetch ALL data source rows for trend charts + peer comparison
  const [allRows, setAllRows] = useState<DataSourceRow[]>([]);
  useEffect(() => {
    fetch("/api/data-source")
      .then(r => r.json())
      .then((d: { rows?: DataSourceRow[] }) => setAllRows(d.rows ?? []))
      .catch(() => {});
  }, []);

  const ticker = result.meta.ticker;

  // Current ticker's historical rows (sorted chronologically, exclude TTM)
  const historyRows = useMemo(() =>
    allRows.filter(r => r.ticker === ticker && r.periodEnd !== "TTM").sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)),
    [allRows, ticker]
  );

  // ── Fetch segment history for trend charts
  interface SegmentQuarter {
    periodEnd: string;
    quarterLabel: string;
    segments: Array<{
      segmentName: string;
      revenue: number | null;
      operatingIncome: number | null;
      operatingMargin: number | null;
      revenuePerUnit: number | null;
      operatingIncomePerUnit: number | null;
    }>;
  }
  const [segmentHistory, setSegmentHistory] = useState<SegmentQuarter[]>([]);
  useEffect(() => {
    if (!ticker || ticker === "UNKNOWN") return;
    fetch(`/api/segment-history?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { quarters?: SegmentQuarter[] } | null) => {
        if (d?.quarters) setSegmentHistory(d.quarters);
      })
      .catch(() => {});
  }, [ticker]);

  // ── TTM computation: sum last 4 quarters for flow metrics, latest for stock metrics
  const ttm = useMemo(() => {
    if (historyRows.length < 4) return null;
    const last4 = historyRows.slice(-4);
    const sumN = (fn: (r: DataSourceRow) => number | null) => {
      const vals = last4.map(fn).filter((v): v is number => v != null);
      return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) : null;
    };
    const latest = last4[last4.length - 1];
    const rev = sumN(r => r.revenue);
    const gp = sumN(r => r.grossProfit);
    const op = sumN(r => r.operatingIncome);
    const ni = sumN(r => r.netIncome);
    const ebitda = sumN(r => r.ebitda);
    const ocf = sumN(r => r.operatingCashFlow);
    const fcf = sumN(r => r.freeCashFlow);
    const capex = sumN(r => r.capex);
    const divPaid = sumN(r => r.dividendsPaid);
    return {
      label: `TTM (${last4[0].quarterLabel}–${last4[3].quarterLabel})`,
      revenue: rev,
      grossProfit: gp,
      operatingIncome: op,
      netIncome: ni,
      ebitda,
      operatingCashFlow: ocf,
      freeCashFlow: fcf,
      capex,
      dividendsPaid: divPaid,
      grossMargin: rev && gp ? Math.round((gp / rev) * 1000) / 10 : null,
      operatingMargin: rev && op ? Math.round((op / rev) * 1000) / 10 : null,
      netMargin: rev && ni ? Math.round((ni / rev) * 1000) / 10 : null,
      ebitdaMargin: rev && ebitda ? Math.round((ebitda / rev) * 1000) / 10 : null,
      fcfMargin: rev && fcf ? Math.round((fcf / rev) * 1000) / 10 : null,
      // Stock metrics from latest quarter
      totalAssets: latest.totalAssets,
      totalEquity: latest.totalEquity,
      totalDebt: latest.totalDebt,
      cashAndEquivalents: latest.cashAndEquivalents,
      debtToEquity: latest.debtToEquity,
      currentRatio: latest.currentRatio,
      roe: ni != null && latest.totalEquity ? Math.round((ni / latest.totalEquity) * 1000) / 10 : null,
      roa: ni != null && latest.totalAssets ? Math.round((ni / latest.totalAssets) * 1000) / 10 : null,
    };
  }, [historyRows]);

  const ttmTraceExtra = useMemo((): Record<string, MetricTraceSpec> | undefined => {
    if (!ttm) return undefined;
    return {
      "Revenue TTM": { value: ttm.revenue, tags: ["Revenues", "NetRevenues"] },
      "EBITDA TTM": { value: ttm.ebitda, tags: ["EBITDA"] },
      "Net Income TTM": { value: ttm.netIncome, tags: ["NetIncome"] },
      "OCF TTM": { value: ttm.operatingCashFlow, tags: ["OperatingCashFlow"] },
      "FCF TTM": { value: ttm.freeCashFlow, tags: ["FreeCashFlow"] },
      "CapEx TTM": { value: ttm.capex, tags: ["CapitalExpenditure"] },
      "Gross Margin": { value: ttm.grossMargin, tags: ["GrossProfit", "Revenues"] },
      "OP Margin": { value: ttm.operatingMargin, tags: ["OperatingIncome", "Revenues"] },
      "EBITDA Margin": { value: ttm.ebitdaMargin, tags: ["EBITDA", "Revenues"] },
      "Net Margin": { value: ttm.netMargin, tags: ["NetIncome", "Revenues"] },
      "ROE (TTM)": { value: ttm.roe, tags: ["NetIncome", "StockholdersEquity"] },
      "ROA (TTM)": { value: ttm.roa, tags: ["NetIncome", "Assets"] },
      "FCF Margin": { value: ttm.fcfMargin, tags: ["FreeCashFlow", "Revenues"] },
    };
  }, [ttm]);

  // ── Peer comparison: compute latest-quarter metrics per company
  interface PeerSummary {
    ticker: string;
    companyName: string;
    revenue: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    ebitdaMargin: number | null;
    roe: number | null;
    roa: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    fcfMargin: number | null;
    totalDebt: number | null;
    totalEquity: number | null;
    netIncome: number | null;
    ebitda: number | null;
    freeCashFlow: number | null;
  }

  const peers = useMemo((): PeerSummary[] => {
    // Group by ticker, take most recent quarter. Filter out UNKNOWN, TTM rows.
    const byTicker = new Map<string, DataSourceRow>();
    for (const r of allRows) {
      if (r.ticker === "UNKNOWN" || r.periodEnd === "TTM") continue;
      const existing = byTicker.get(r.ticker);
      if (!existing || r.periodEnd > existing.periodEnd) byTicker.set(r.ticker, r);
    }
    return [...byTicker.values()]
      .map(r => ({
        ticker: r.ticker,
        companyName: r.companyName,
        revenue: r.revenue,
        grossMargin: r.grossMargin,
        operatingMargin: r.operatingMargin,
        netMargin: r.netMargin,
        ebitdaMargin: r.ebitdaMargin ?? null,
        roe: r.roe ?? null,
        roa: r.roa ?? null,
        debtToEquity: r.debtToEquity,
        currentRatio: r.currentRatio,
        fcfMargin: r.fcfMargin ?? null,
        totalDebt: r.totalDebt,
        totalEquity: r.totalEquity,
        netIncome: r.netIncome,
        ebitda: r.ebitda,
        freeCashFlow: r.freeCashFlow,
      }))
      .sort((a, b) => (a.ticker === ticker ? -1 : b.ticker === ticker ? 1 : a.ticker.localeCompare(b.ticker)));
  }, [allRows, ticker]);

  // ── DuPont 3-Factor: ROE = Net Margin × Asset Turnover × Equity Multiplier
  const dupont = useMemo(() => {
    const netMargin = inc.revenue && inc.netIncome ? inc.netIncome / inc.revenue : null;
    const assetTurnover = inc.revenue && bs.totalAssets ? inc.revenue / bs.totalAssets : null;
    const equityMultiplier = bs.totalAssets && bs.totalEquity ? bs.totalAssets / bs.totalEquity : null;
    const computed = netMargin && assetTurnover && equityMultiplier
      ? netMargin * assetTurnover * equityMultiplier * 100 : null;

    // 5-factor: ROE = (EBT/EBIT) × (EBIT/Revenue) × (Revenue/Assets) × (Assets/Equity) × (NI/EBT)
    const ebit = inc.operatingIncome;
    const ebt = inc.netIncome != null && inc.incomeTax != null ? inc.netIncome + inc.incomeTax : null;
    const taxBurden = inc.netIncome != null && ebt != null && ebt !== 0 ? inc.netIncome / ebt : null;
    const interestBurden = ebt != null && ebit != null && ebit !== 0 ? ebt / ebit : null;
    const opMarginFactor = ebit != null && inc.revenue ? ebit / inc.revenue : null;

    return { netMargin, assetTurnover, equityMultiplier, computed, taxBurden, interestBurden, opMarginFactor };
  }, [inc, bs]);

  // ── Altman Z-Score (manufacturing model)
  const zScore = useMemo(() => {
    if (!bs.totalAssets) return null;
    const ta = bs.totalAssets;
    const wc = ratios.workingCapital ?? 0;
    const re = bs.retainedEarnings;
    const ebit = inc.operatingIncome ?? 0;
    const equity = bs.totalEquity;
    const totalLiab = bs.totalLiabilities;
    const revenue = inc.revenue ?? 0;

    const x1 = wc / ta;
    const x2 = re / ta;
    const x3 = ebit / ta;
    const x4 = totalLiab > 0 ? equity / totalLiab : 0;
    const x5 = revenue / ta;

    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    const zone: "safe" | "grey" | "distress" = z > 2.99 ? "safe" : z > 1.81 ? "grey" : "distress";
    return { z: Math.round(z * 100) / 100, zone, x1, x2, x3, x4, x5 };
  }, [bs, inc, ratios]);

  // ── Piotroski F-Score (0-9)
  const piotroski = useMemo(() => {
    const signals: { name: string; pass: boolean | null; desc: string }[] = [];
    // Profitability
    signals.push({ name: "ROA > 0", pass: inc.netIncome != null && bs.totalAssets ? (inc.netIncome / bs.totalAssets) > 0 : null, desc: "Positive return on assets" });
    signals.push({ name: "OCF > 0", pass: cf.operatingCashFlow != null ? cf.operatingCashFlow > 0 : null, desc: "Positive operating cash flow" });
    signals.push({ name: "Accruals < 0", pass: cf.operatingCashFlow != null && inc.netIncome != null ? (cf.operatingCashFlow - inc.netIncome) > 0 : null, desc: "OCF exceeds net income (quality earnings)" });
    // Leverage & Liquidity
    const ltDebtRatio = bs.totalAssets ? debt.longTermDebt / bs.totalAssets : null;
    signals.push({ name: "LT Debt ↓", pass: ltDebtRatio != null ? ltDebtRatio < 0.4 : null, desc: "LT debt/assets < 40% (lower is better)" });
    signals.push({ name: "Current Ratio > 1", pass: ratios.currentRatio != null ? ratios.currentRatio > 1 : null, desc: "Sufficient liquidity" });
    // Operating efficiency
    signals.push({ name: "Gross Margin ↑", pass: inc.grossMargin != null ? inc.grossMargin > 0 : null, desc: "Positive gross margins" });
    signals.push({ name: "Asset Turnover", pass: ratios.assetTurnover != null ? ratios.assetTurnover > 0.5 : null, desc: "Efficient asset utilization" });
    // Equity
    signals.push({ name: "No Dilution", pass: true, desc: "Not issuing excessive new shares (assumed)" });
    signals.push({ name: "Positive Equity", pass: bs.totalEquity > 0, desc: "Positive shareholders' equity" });

    const score = signals.filter(s => s.pass === true).length;
    return { score, signals };
  }, [inc, cf, bs, debt, ratios]);

  // ── Earnings Quality
  const earningsQuality = useMemo(() => {
    const accruals = cf.operatingCashFlow != null && inc.netIncome != null
      ? cf.operatingCashFlow - inc.netIncome : null;
    const accrualRatio = accruals != null && bs.totalAssets
      ? Math.round((accruals / bs.totalAssets) * 1000) / 10 : null;
    const ocfToNI = cf.operatingCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? Math.round((cf.operatingCashFlow / inc.netIncome) * 100) / 100 : null;
    const fcfToNI = cf.freeCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? Math.round((cf.freeCashFlow / inc.netIncome) * 100) / 100 : null;
    const quality: "high" | "moderate" | "low" | "unknown" =
      ocfToNI == null ? "unknown" :
      ocfToNI >= 1.0 ? "high" :
      ocfToNI >= 0.7 ? "moderate" : "low";
    return { accruals, accrualRatio, ocfToNI, fcfToNI, quality };
  }, [cf, inc, bs]);

  // ── Cash Conversion Cycle
  const ccc = useMemo(() => {
    const rev = inc.revenue;
    const cogs = inc.costOfRevenue;
    const ar = cfItems.find(i => i.tag === "AccountsReceivableNetCurrent")?.value ?? bs.items.find(i => i.tag === "AccountsReceivableNetCurrent")?.value ?? null;
    const inv = cfItems.find(i => i.tag === "InventoryNet")?.value ?? bs.items.find(i => i.tag === "InventoryNet")?.value ?? null;
    const ap = cfItems.find(i => i.tag === "AccountsPayableCurrent")?.value ?? bs.items.find(i => i.tag === "AccountsPayableCurrent")?.value ?? null;

    const dso = ar != null && rev ? Math.round((ar / rev) * 365) : null;
    const dio = inv != null && cogs ? Math.round((inv / cogs) * 365) : null;
    const dpo = ap != null && cogs ? Math.round((ap / cogs) * 365) : null;
    const cycle = dso != null && dio != null && dpo != null ? dso + dio - dpo : null;
    return { dso, dio, dpo, cycle };
  }, [inc, cfItems, bs]);

  // ── Capital Allocation
  const capAlloc = useMemo(() => {
    const buyback = cfItems.find(i => i.tag === "PaymentsForRepurchaseOfCommonStock")?.value ?? null;
    const sbc = cfItems.find(i => i.tag === "ShareBasedCompensation")?.value ?? null;
    const capex = cf.capitalExpenditures;
    const ocf = cf.operatingCashFlow;
    const divPaid = cf.dividendsPaid;
    const reinvestmentRate = ocf && capex ? Math.round((Math.abs(capex) / ocf) * 1000) / 10 : null;
    const totalReturn = (divPaid ?? 0) + (buyback ?? 0);
    const returnYieldOnEquity = totalReturn && bs.totalEquity ? Math.round((totalReturn / bs.totalEquity) * 1000) / 10 : null;
    return { buyback, sbc, reinvestmentRate, totalReturn, returnYieldOnEquity };
  }, [cf, cfItems, bs]);

  // ── Overall Financial Health
  const healthScore = useMemo(() => {
    let score = 0; let max = 0;
    // Profitability (3 pts)
    if (inc.operatingMargin != null) { max += 3; if (inc.operatingMargin > 15) score += 3; else if (inc.operatingMargin > 5) score += 2; else if (inc.operatingMargin > 0) score += 1; }
    // Leverage (3 pts)
    if (ratios.debtToEquity != null) { max += 3; if (ratios.debtToEquity < 0.5) score += 3; else if (ratios.debtToEquity < 1.5) score += 2; else if (ratios.debtToEquity < 3) score += 1; }
    // Liquidity (2 pts)
    if (ratios.currentRatio != null) { max += 2; if (ratios.currentRatio > 2) score += 2; else if (ratios.currentRatio > 1) score += 1; }
    // Cash generation (3 pts)
    if (earningsQuality.ocfToNI != null) { max += 3; if (earningsQuality.ocfToNI >= 1.2) score += 3; else if (earningsQuality.ocfToNI >= 0.8) score += 2; else if (earningsQuality.ocfToNI > 0) score += 1; }
    // Returns (3 pts)
    if (ratios.returnOnEquity != null) { max += 3; if (ratios.returnOnEquity > 20) score += 3; else if (ratios.returnOnEquity > 10) score += 2; else if (ratios.returnOnEquity > 0) score += 1; }
    // FCF (2 pts)
    if (ratios.fcfYield != null) { max += 2; if (ratios.fcfYield > 8) score += 2; else if (ratios.fcfYield > 3) score += 1; }
    // Interest coverage (2 pts)
    if (ratios.interestCoverage != null) { max += 2; if (ratios.interestCoverage > 5) score += 2; else if (ratios.interestCoverage > 2) score += 1; }
    const pctScore = max > 0 ? Math.round((score / max) * 100) : 0;
    const grade: string = pctScore >= 80 ? "A" : pctScore >= 65 ? "B" : pctScore >= 45 ? "C" : pctScore >= 25 ? "D" : "F";
    return { score, max, pctScore, grade };
  }, [inc, ratios, earningsQuality]);

  const footnotes = result.footnotes ?? [];
  const adjustedMetrics = result.adjustedMetrics ?? [];
  const narrative = result.earningsNarrative;

  // ── Valuation Multiples (auto-fetch or manual market cap)
  const [marketCapInput, setMarketCapInput] = useState("");
  const [marketCapLoading, setMarketCapLoading] = useState(false);
  const [stockPrice, setStockPrice] = useState<number | null>(null);

  // Auto-fetch market cap on mount
  useEffect(() => {
    if (!ticker || ticker === "UNKNOWN") return;
    setMarketCapLoading(true);
    fetch(`/api/market-cap?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { marketCapM?: number; price?: number } | null) => {
        if (d?.marketCapM) {
          setMarketCapInput(String(d.marketCapM));
          setStockPrice(d.price ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setMarketCapLoading(false));
  }, [ticker]);

  const marketCap = useMemo(() => {
    const v = parseFloat(marketCapInput);
    return isNaN(v) || v <= 0 ? null : v;
  }, [marketCapInput]);

  const valuation = useMemo(() => {
    if (!marketCap) return null;
    const netDebt = (debt.longTermDebt + (debt.shortTermDebt ?? 0)) - (bs.cashAndEquivalents);
    const ev = marketCap + netDebt;
    const ebitdaVal = ttm?.ebitda ?? (inc.operatingIncome != null && cfItems.find(i => i.tag === "DepreciationDepletionAndAmortization" || i.tag === "DepreciationAndAmortization")?.value != null
      ? inc.operatingIncome + Math.abs(cfItems.find(i => i.tag === "DepreciationDepletionAndAmortization" || i.tag === "DepreciationAndAmortization")!.value)
      : null);
    const niVal = ttm?.netIncome ?? inc.netIncome;
    const fcfVal = ttm?.freeCashFlow ?? cf.freeCashFlow;
    const revVal = ttm?.revenue ?? inc.revenue;

    const evToEbitda = ebitdaVal && ebitdaVal > 0 ? Math.round((ev / ebitdaVal) * 10) / 10 : null;
    const evToRev = revVal && revVal > 0 ? Math.round((ev / revVal) * 10) / 10 : null;
    const pe = niVal && niVal > 0 ? Math.round((marketCap / niVal) * 10) / 10 : null;
    const pFcf = fcfVal && fcfVal > 0 ? Math.round((marketCap / fcfVal) * 10) / 10 : null;
    const fcfYield = fcfVal && marketCap > 0 ? Math.round((fcfVal / marketCap) * 1000) / 10 : null;
    const divYield = cf.dividendsPaid && marketCap > 0 ? Math.round((Math.abs(cf.dividendsPaid) / marketCap) * 1000) / 10 : null;

    return { ev, netDebt, evToEbitda, evToRev, pe, pFcf, fcfYield, divYield };
  }, [marketCap, debt, bs, inc, cf, cfItems, ttm]);

  // ── AI Commentary state ──
  interface Commentary {
    dupont: string | null;
    zScore: string | null;
    piotroski: string | null;
    earningsQuality: string | null;
    ccc: string | null;
    peerPositioning: string | null;
    ttmOutlook: string | null;
    overallAssessment: string;
  }
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);

  const generateCommentary = async () => {
    setCommentaryLoading(true);
    try {
      const resp = await fetch("/api/insights-commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          companyName: result.meta.companyName,
          dupont: {
            netMargin: dupont.netMargin != null ? Math.round(dupont.netMargin * 1000) / 10 : null,
            assetTurnover: dupont.assetTurnover != null ? Math.round(dupont.assetTurnover * 100) / 100 : null,
            equityMultiplier: dupont.equityMultiplier != null ? Math.round(dupont.equityMultiplier * 100) / 100 : null,
            roe: dupont.computed,
          },
          zScore: zScore ? { score: zScore.z, zone: zScore.zone } : undefined,
          piotroski: { score: piotroski.score, maxScore: 9 },
          earningsQuality: {
            accrualRatio: earningsQuality.accrualRatio,
            cashConversion: earningsQuality.ocfToNI,
          },
          ccc: { dso: ccc.dso, dio: ccc.dio, dpo: ccc.dpo, ccc: ccc.cycle },
          peerMetrics: peers.slice(0, 6).map(p => ({
            ticker: p.ticker,
            operatingMargin: p.operatingMargin,
            roe: p.roe,
            debtToEquity: p.debtToEquity,
          })),
          ttm: ttm ? {
            revenue: ttm.revenue,
            operatingMargin: ttm.operatingMargin,
            netMargin: ttm.netMargin,
            fcfMargin: ttm.fcfMargin,
          } : undefined,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setCommentary(data);
      }
    } catch (e) {
      console.error("Commentary generation failed:", e);
    } finally {
      setCommentaryLoading(false);
    }
  };

  const [deckLoading, setDeckLoading] = useState(false);
  const exportInsightsDeck = async () => {
    setDeckLoading(true);
    try {
      const resp = await fetch("/api/export/insights-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: result.meta.ticker, analysis: result }),
      });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.meta.ticker ?? "Insights"}_Deck_${new Date().toISOString().slice(0, 10)}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Deck export failed:", e);
    } finally {
      setDeckLoading(false);
    }
  };

  return {
    result,
    bs,
    debt,
    cf,
    inc,
    ratios,
    cfItems,
    ticker,
    historyRows,
    segmentHistory,
    ttm,
    ttmTraceExtra,
    peers,
    dupont,
    zScore,
    piotroski,
    earningsQuality,
    ccc,
    capAlloc,
    healthScore,
    footnotes,
    adjustedMetrics,
    narrative,
    marketCapInput,
    setMarketCapInput,
    marketCapLoading,
    stockPrice,
    marketCap,
    valuation,
    commentary,
    commentaryLoading,
    generateCommentary,
    deckLoading,
    exportInsightsDeck,
  };
}


export type InsightsTabModel = ReturnType<typeof useInsightsTabModel>;

