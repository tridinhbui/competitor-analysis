/**
 * POST /api/export/insights-deck
 *
 * Generates a standalone PPTX deck from Insights data:
 * - Financial Overview slide
 * - Segment breakdown
 * - Peer margin comparison
 * - Peer radar profile
 * - Peer comparison table
 * - Quarterly trends (margins, revenue, CF)
 * - TTM summary
 * - DuPont analysis
 * - Financial health scores
 */

import PptxGenJS from "pptxgenjs";
import { supabase } from "@/lib/supabase";
import { extractMetrics } from "@/lib/analysisModules";
import { COLORS, FONTS, LAYOUT, TABLE_STYLE } from "@/lib/pptxTemplates";
import type { DataSourceRow } from "@/types/dataSource";
import type { FullAnalysis } from "@/types/analysis";
import type { Filing } from "@/types/competitor";

export const runtime = "nodejs";

// Chart colors
const CHART_PALETTE = ["3B82F6", "10B981", "8B5CF6", "F59E0B", "EF4444", "06B6D4"];

// Helpers
const fmtM = (v: number | null | undefined) => v != null ? `$${v.toLocaleString()}M` : "—";
const fmtPct = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : "—";
const fmtX = (v: number | null | undefined) => v != null ? `${v.toFixed(2)}x` : "—";

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function addFooter(slide: Slide, text: string) {
  slide.addText(text, {
    x: LAYOUT.marginX, y: LAYOUT.footerY, w: LAYOUT.contentW, h: 0.3,
    fontSize: 6, fontFace: FONTS.body, color: COLORS.slate500, align: "left",
  });
}

function addTitle(slide: Slide, title: string, subtitle?: string) {
  slide.addText(title, {
    x: LAYOUT.marginX, y: LAYOUT.marginY, w: LAYOUT.contentW, h: 0.5,
    fontSize: 18, fontFace: FONTS.title, color: COLORS.slate900, bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: LAYOUT.marginX, y: LAYOUT.marginY + 0.5, w: LAYOUT.contentW, h: 0.3,
      fontSize: 10, fontFace: FONTS.body, color: COLORS.slate500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      ticker?: string;
      analysis?: FullAnalysis;
    };

    const ticker = body.ticker?.toUpperCase();
    const analysis = body.analysis;

    if (!analysis) {
      return Response.json({ error: "Missing analysis" }, { status: 400 });
    }

    // Fetch all data source rows for peer comparison + trends
    const { data: filings } = await supabase
      .from("filings")
      .select("id, ticker, period_end, source, analysis")
      .order("ticker")
      .order("period_end", { ascending: false });

    const { data: companies } = await supabase
      .from("companies")
      .select("ticker, name, peer_type");

    const companyMap = new Map<string, { name: string; peerType: string }>();
    for (const c of companies ?? []) companyMap.set(c.ticker, { name: c.name, peerType: c.peer_type ?? "diversified-protein" });

    // Build DataSourceRow-like objects
    const allRows: DataSourceRow[] = [];
    for (const f of filings ?? []) {
      const a = f.analysis as FullAnalysis;
      if (!a) continue;
      const company = companyMap.get(f.ticker);
      const filing: Filing = { ticker: f.ticker, periodEnd: f.period_end, source: f.source ?? "sec", filingType: "10-Q", filingDate: "", savedAt: "", analysis: a };
      const m = extractMetrics(filing, (company?.peerType ?? "diversified-protein") as import("@/types/competitor").PeerType);
      const cfItems = a.cfItems ?? [];
      const depItem = cfItems.find(i => ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"].includes(i.tag));
      const ebit = m.operatingIncome;
      const ebitda = ebit != null && depItem?.value != null ? ebit + Math.abs(depItem.value) : null;

      allRows.push({
        id: f.id, ticker: f.ticker, companyName: company?.name ?? f.ticker,
        periodEnd: f.period_end, quarterLabel: m.quarterLabel,
        revenue: m.revenue, grossProfit: m.grossProfit, operatingIncome: m.operatingIncome,
        netIncome: m.netIncome, totalAssets: m.totalAssets, totalLiabilities: m.totalLiabilities,
        totalEquity: m.totalEquity, totalDebt: m.totalDebt, cashAndEquivalents: m.cash,
        operatingCashFlow: m.operatingCashFlow, capex: m.capex, freeCashFlow: m.freeCashFlow,
        grossMargin: m.grossMargin, operatingMargin: m.operatingMargin, netMargin: m.netMargin,
        debtToEquity: m.debtToEquity, currentRatio: m.currentRatio,
        sgaExpense: m.sgaExpense, depreciation: depItem?.value ?? null,
        ebit, ebitda,
        ebitdaMargin: ebitda != null && m.revenue ? parseFloat(((ebitda / m.revenue) * 100).toFixed(1)) : null,
        interestExpense: a.incomeStatement?.interestExpense ?? null,
        epsBasic: a.incomeStatement?.epsBasic ?? null,
        epsDiluted: a.incomeStatement?.epsDiluted ?? null,
        shareBasedComp: cfItems.find(i => i.tag === "ShareBasedCompensation")?.value ?? null,
        dividendsPaid: m.dividendsPaid, roe: m.roe, roa: m.roa,
        fcfMargin: m.fcfMargin,
        volumeHeads: null, volumeLbs: null, volumeCwt: null, opPerHead: null, opPerCwt: null,
        ercAdjustment: null, legalChargeAdjustment: null, transferValueAdjustment: null,
        corporateAllocationAdjustment: null, adjustedOperatingIncome: null,
        adjustedOperatingMargin: null, adjustedOpPerHead: null, adjustedOpPerCwt: null,
        sgaAsPercent: null,
      });
    }

    // Build peer list (latest quarter per company)
    const peerMap = new Map<string, DataSourceRow>();
    for (const r of allRows) {
      const existing = peerMap.get(r.ticker);
      if (!existing || r.periodEnd > existing.periodEnd) peerMap.set(r.ticker, r);
    }
    const peers = [...peerMap.values()].sort((a, b) => a.ticker === ticker ? -1 : b.ticker === ticker ? 1 : a.ticker.localeCompare(b.ticker));

    // Historical rows for this ticker
    const history = allRows
      .filter(r => r.ticker === ticker)
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

    // TTM
    let ttm: { revenue: number | null; ebitda: number | null; netIncome: number | null; fcf: number | null; label: string } | null = null;
    if (history.length >= 4) {
      const last4 = history.slice(-4);
      const sumN = (fn: (r: DataSourceRow) => number | null) => {
        const vals = last4.map(fn).filter((v): v is number => v != null);
        return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) : null;
      };
      ttm = {
        revenue: sumN(r => r.revenue), ebitda: sumN(r => r.ebitda),
        netIncome: sumN(r => r.netIncome), fcf: sumN(r => r.freeCashFlow),
        label: `TTM (${last4[0].quarterLabel}–${last4[3].quarterLabel})`,
      };
    }

    const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, incomeStatement: inc, dividendAnalysis: div } = analysis;
    const companyName = analysis.meta.companyName ?? ticker ?? "Company";

    // ── Build PPTX ──
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE";
    pres.author = "Dividend IQ";
    pres.title = `${companyName} — Insights Deck`;

    // ═══ SLIDE 1: Title ═══
    const s1 = pres.addSlide();
    s1.background = { fill: COLORS.navy };
    s1.addText(`${companyName}${ticker ? ` (${ticker})` : ""}`, {
      x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW, h: 1,
      fontSize: 32, fontFace: FONTS.title, color: COLORS.white, bold: true,
    });
    s1.addText("Financial Insights Deck", {
      x: LAYOUT.marginX, y: 2.3, w: LAYOUT.contentW, h: 0.5,
      fontSize: 16, fontFace: FONTS.body, color: COLORS.ice,
    });
    s1.addText(`Period: ${analysis.meta.periodEnd ?? "N/A"} | Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, {
      x: LAYOUT.marginX, y: 3, w: LAYOUT.contentW, h: 0.4,
      fontSize: 10, fontFace: FONTS.body, color: COLORS.slate500,
    });
    s1.addShape("rect" as PptxGenJS.ShapeType, { x: LAYOUT.marginX, y: 4.5, w: 2, h: 0.04, fill: { color: COLORS.primary } });

    // ═══ SLIDE 2: Financial Overview ═══
    const s2 = pres.addSlide();
    addTitle(s2, "Financial Overview", `${companyName} — ${analysis.meta.periodEnd ?? ""}`);

    const overviewRows: PptxGenJS.TableRow[] = [
      [{ text: "Metric", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize } },
       { text: "Value", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } },
       { text: "Metric", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize } },
       { text: "Value", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } }],
      [{ text: "Revenue" }, { text: fmtM(inc.revenue), options: { align: "right" as const } }, { text: "Total Assets" }, { text: fmtM(bs.totalAssets), options: { align: "right" as const } }],
      [{ text: "Gross Profit" }, { text: fmtM(inc.grossProfit), options: { align: "right" as const } }, { text: "Total Equity" }, { text: fmtM(bs.totalEquity), options: { align: "right" as const } }],
      [{ text: "Operating Income" }, { text: fmtM(inc.operatingIncome), options: { align: "right" as const } }, { text: "Total Debt" }, { text: fmtM(debt.totalDebt), options: { align: "right" as const } }],
      [{ text: "Net Income" }, { text: fmtM(inc.netIncome), options: { align: "right" as const } }, { text: "Net Debt" }, { text: fmtM(debt.netDebt), options: { align: "right" as const } }],
      [{ text: "EBITDA" }, { text: fmtM(inc.ebitda), options: { align: "right" as const } }, { text: "Operating CF" }, { text: fmtM(cf.operatingCashFlow), options: { align: "right" as const } }],
      [{ text: "Gross Margin" }, { text: fmtPct(inc.grossMargin), options: { align: "right" as const } }, { text: "Free Cash Flow" }, { text: fmtM(cf.freeCashFlow), options: { align: "right" as const } }],
      [{ text: "Operating Margin" }, { text: fmtPct(inc.operatingMargin), options: { align: "right" as const } }, { text: "D/E Ratio" }, { text: fmtX(ratios.debtToEquity), options: { align: "right" as const } }],
      [{ text: "Net Margin" }, { text: fmtPct(inc.netMargin), options: { align: "right" as const } }, { text: "Current Ratio" }, { text: fmtX(ratios.currentRatio), options: { align: "right" as const } }],
    ];

    s2.addTable(overviewRows, {
      x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW,
      fontSize: TABLE_STYLE.rowFontSize, fontFace: FONTS.body,
      border: { color: COLORS.slate300, pt: TABLE_STYLE.borderWidth },
      colW: [2.25, 2.25, 2.25, 2.25],
      rowH: 0.35, margin: TABLE_STYLE.cellPadding,
      autoPage: false,
    });
    addFooter(s2, `Source: ${analysis.meta.source === "sec" ? "SEC EDGAR XBRL" : "PDF extraction"} | Dividend IQ`);

    // ═══ SLIDE 3: Financial Health Scores ═══
    const s3 = pres.addSlide();
    addTitle(s3, "Financial Health Scores", companyName);

    // Compute scores inline
    const ebit3 = inc.operatingIncome ?? 0;
    const ta3 = bs.totalAssets || 1;
    const wc3 = ratios.workingCapital ?? 0;
    const re3 = bs.retainedEarnings;
    const tl3 = bs.totalLiabilities || 1;
    const zVal = 1.2 * (wc3 / ta3) + 1.4 * (re3 / ta3) + 3.3 * (ebit3 / ta3) + 0.6 * (bs.totalEquity / tl3) + 1.0 * ((inc.revenue ?? 0) / ta3);
    const zZone = zVal > 2.99 ? "Safe" : zVal > 1.81 ? "Grey" : "Distress";
    const zColor = zVal > 2.99 ? COLORS.emerald : zVal > 1.81 ? COLORS.amber : COLORS.red;

    const scoreCards = [
      { label: "Altman Z-Score", value: zVal.toFixed(2), sub: `${zZone} Zone`, color: zColor },
      { label: "ROE", value: fmtPct(ratios.returnOnEquity), sub: "Return on Equity", color: COLORS.primary },
      { label: "D/E Ratio", value: fmtX(ratios.debtToEquity), sub: "Leverage", color: COLORS.slate700 },
      { label: "FCF Yield", value: fmtPct(ratios.fcfYield), sub: "Cash Generation", color: COLORS.emerald },
      { label: "Verdict", value: div.verdict.toUpperCase(), sub: div.headline.slice(0, 40), color: div.verdict === "strong" ? COLORS.emerald : div.verdict === "adequate" ? COLORS.primary : COLORS.amber },
    ];

    scoreCards.forEach((card, i) => {
      const col = i % 5;
      const x = LAYOUT.marginX + col * 1.8;
      s3.addShape("roundRect" as PptxGenJS.ShapeType, { x, y: 1.3, w: 1.6, h: 1.4, fill: { color: COLORS.slate100 }, rectRadius: 0.1 });
      s3.addText(card.label, { x, y: 1.35, w: 1.6, h: 0.3, fontSize: 7, fontFace: FONTS.body, color: COLORS.slate500, align: "center" });
      s3.addText(card.value, { x, y: 1.65, w: 1.6, h: 0.5, fontSize: 20, fontFace: FONTS.title, color: card.color, bold: true, align: "center" });
      s3.addText(card.sub, { x, y: 2.2, w: 1.6, h: 0.3, fontSize: 6, fontFace: FONTS.body, color: COLORS.slate500, align: "center" });
    });

    // DuPont row
    const nm = inc.revenue && inc.netIncome ? inc.netIncome / inc.revenue : null;
    const at = inc.revenue && bs.totalAssets ? inc.revenue / bs.totalAssets : null;
    const em = bs.totalAssets && bs.totalEquity ? bs.totalAssets / bs.totalEquity : null;
    s3.addText("DuPont ROE = Net Margin × Asset Turnover × Equity Multiplier", {
      x: LAYOUT.marginX, y: 3, w: LAYOUT.contentW, h: 0.3, fontSize: 10, fontFace: FONTS.body, color: COLORS.slate700, bold: true,
    });
    s3.addText(
      `${nm != null ? (nm * 100).toFixed(1) + "%" : "—"}  ×  ${at != null ? at.toFixed(2) + "x" : "—"}  ×  ${em != null ? em.toFixed(2) + "x" : "—"}  =  ${ratios.returnOnEquity != null ? fmtPct(ratios.returnOnEquity) : "—"}`,
      { x: LAYOUT.marginX, y: 3.35, w: LAYOUT.contentW, h: 0.4, fontSize: 14, fontFace: FONTS.mono, color: COLORS.primary, bold: true }
    );
    addFooter(s3, "Dividend IQ — Financial Health Analysis");

    // ═══ SLIDE 4: Segments (if available) ═══
    const segments = analysis.segments ?? [];
    if (segments.length > 0) {
      const s4 = pres.addSlide();
      addTitle(s4, "Segment Breakdown", companyName);

      const segHeaders: PptxGenJS.TableRow[] = [[
        { text: "Segment", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize } },
        { text: "Revenue ($M)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } },
        { text: "OP Income ($M)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } },
        { text: "OP Margin", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } },
        { text: "Volume", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } },
      ]];

      const segDataRows: PptxGenJS.TableRow[] = segments.map((seg) => [
        { text: seg.segmentName },
        { text: fmtM(seg.revenue), options: { align: "right" as const } },
        { text: fmtM(seg.operatingIncome), options: { align: "right", color: seg.operatingIncome != null && seg.operatingIncome < 0 ? COLORS.red : COLORS.slate900 } },
        { text: fmtPct(seg.operatingMargin), options: { align: "right" as const } },
        { text: seg.volumeUnits != null ? `${seg.volumeUnits.toLocaleString()} ${seg.volumeUnitType ?? ""}` : "—", options: { align: "right" as const } },
      ]);

      s4.addTable([...segHeaders, ...segDataRows], {
        x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW,
        fontSize: TABLE_STYLE.rowFontSize, fontFace: FONTS.body,
        border: { color: COLORS.slate300, pt: TABLE_STYLE.borderWidth },
        colW: [2.5, 1.5, 1.5, 1.5, 2], rowH: 0.35, margin: TABLE_STYLE.cellPadding, autoPage: false,
      });

      // Segment revenue pie chart
      if (segments.filter(s => s.revenue != null && s.revenue > 0).length >= 2) {
        const pieData = segments
          .filter(s => s.revenue != null && s.revenue > 0)
          .map(s => ({ name: s.segmentName, value: s.revenue! }));

        s4.addChart(pres.ChartType.pie, [{
          name: "Revenue",
          labels: pieData.map(d => d.name),
          values: pieData.map(d => d.value),
        }], {
          x: 6, y: 2.5, w: 3.5, h: 2.5,
          showTitle: false, showLegend: true, legendFontSize: 7, legendPos: "b",
          chartColors: CHART_PALETTE,
          dataLabelPosition: "outEnd", dataLabelFontSize: 7,
          showPercent: true, showValue: false,
        });
      }
      addFooter(s4, `Source: ${analysis.meta.source === "sec" ? "SEC EDGAR" : "PDF"} | Dividend IQ`);
    }

    // ═══ SLIDE 5: Peer Comparison Table ═══
    if (peers.length >= 2) {
      const s5 = pres.addSlide();
      addTitle(s5, "Peer Comparison", `${peers.length} companies — Latest Quarter`);

      const peerHeaders: PptxGenJS.TableRow[] = [[
        { text: "Company", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7 } },
        { text: "Rev ($M)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "EBITDA", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "NI ($M)", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "GM %", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "OP %", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "NM %", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "ROE %", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
        { text: "D/E", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: 7, align: "right" as const } },
      ]];

      const peerRows: PptxGenJS.TableRow[] = peers.slice(0, 10).map((p) => {
        const isSubject = p.ticker === ticker;
        const rowFill = isSubject ? { color: "E8EDFF" } : undefined;
        return [
          { text: `${p.ticker} ${p.companyName.slice(0, 20)}`, options: { bold: isSubject, fill: rowFill } },
          { text: fmtM(p.revenue), options: { align: "right", fill: rowFill } },
          { text: fmtM(p.ebitda), options: { align: "right", fill: rowFill } },
          { text: fmtM(p.netIncome), options: { align: "right", fill: rowFill, color: p.netIncome != null && p.netIncome < 0 ? COLORS.red : COLORS.slate900 } },
          { text: fmtPct(p.grossMargin), options: { align: "right", fill: rowFill } },
          { text: fmtPct(p.operatingMargin), options: { align: "right", fill: rowFill } },
          { text: fmtPct(p.netMargin), options: { align: "right", fill: rowFill } },
          { text: fmtPct(p.roe), options: { align: "right", fill: rowFill } },
          { text: fmtX(p.debtToEquity), options: { align: "right", fill: rowFill } },
        ];
      });

      s5.addTable([...peerHeaders, ...peerRows], {
        x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW,
        fontSize: 7, fontFace: FONTS.body,
        border: { color: COLORS.slate300, pt: TABLE_STYLE.borderWidth },
        colW: [2, 1, 1, 1, 0.7, 0.7, 0.7, 0.7, 0.7],
        rowH: 0.32, margin: TABLE_STYLE.cellPadding, autoPage: false,
      });
      addFooter(s5, "Dividend IQ — Peer Comparison");

      // ═══ SLIDE 6: Peer Margin Chart ═══
      const s6 = pres.addSlide();
      addTitle(s6, "Peer Margin Comparison", "Gross / Operating / Net Margins (%)");

      const marginSeries = [
        { name: "Gross Margin", labels: peers.slice(0, 8).map(p => p.ticker), values: peers.slice(0, 8).map(p => p.grossMargin ?? 0) },
        { name: "Operating Margin", labels: peers.slice(0, 8).map(p => p.ticker), values: peers.slice(0, 8).map(p => p.operatingMargin ?? 0) },
        { name: "Net Margin", labels: peers.slice(0, 8).map(p => p.ticker), values: peers.slice(0, 8).map(p => p.netMargin ?? 0) },
      ];

      s6.addChart(pres.ChartType.bar, marginSeries, {
        x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW, h: 3.5,
        showTitle: false, barGrouping: "clustered", barDir: "bar",
        catAxisLabelFontSize: 8, valAxisLabelFontSize: 7,
        showLegend: true, legendFontSize: 8, legendPos: "b",
        chartColors: ["3B82F6", "10B981", "8B5CF6"],
        valGridLine: { color: COLORS.slate300, size: 0.5 },
      });
      addFooter(s6, "Dividend IQ — Peer Comparison");
    }

    // ═══ SLIDE 7: Quarterly Trends (if history) ═══
    if (history.length >= 3) {
      const s7 = pres.addSlide();
      addTitle(s7, "Quarterly Revenue & Margins", `${companyName} — ${history.length} quarters`);

      // Revenue bar + margin line combo
      const revSeries = [{ name: "Revenue ($M)", labels: history.map(r => r.quarterLabel || r.periodEnd.slice(0, 7)), values: history.map(r => r.revenue ?? 0) }];
      const marginLine = [{ name: "OP Margin (%)", labels: history.map(r => r.quarterLabel || r.periodEnd.slice(0, 7)), values: history.map(r => r.operatingMargin ?? 0) }];

      s7.addChart([
        { type: pres.ChartType.bar, data: revSeries, options: { chartColors: ["3B82F6"], barGrouping: "clustered" } as PptxGenJS.IChartOpts },
        { type: pres.ChartType.line, data: marginLine, options: { chartColors: ["10B981"], lineDataSymbolSize: 6, secondaryValAxis: true, secondaryCatAxis: false } as PptxGenJS.IChartOpts },
      ], [], {
        x: LAYOUT.marginX, y: 1.2, w: LAYOUT.contentW, h: 3.5,
        showTitle: false, catAxisLabelFontSize: 7, valAxisLabelFontSize: 7,
        showLegend: true, legendFontSize: 7, legendPos: "b",
        valGridLine: { color: COLORS.slate300, size: 0.5 },
      });
      addFooter(s7, `${companyName} — ${history[0].quarterLabel} to ${history[history.length - 1].quarterLabel}`);
    }

    // ═══ SLIDE 8: TTM Summary ═══
    if (ttm) {
      const s8 = pres.addSlide();
      addTitle(s8, "Trailing 12-Month Summary", ttm.label);

      const ttmRows: PptxGenJS.TableRow[] = [
        [{ text: "Metric", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize } },
         { text: "TTM Value", options: { bold: true, color: COLORS.white, fill: { color: COLORS.navy }, fontSize: TABLE_STYLE.headerFontSize, align: "right" as const } }],
        [{ text: "Revenue" }, { text: fmtM(ttm.revenue), options: { align: "right" as const } }],
        [{ text: "EBITDA" }, { text: fmtM(ttm.ebitda), options: { align: "right" as const } }],
        [{ text: "Net Income" }, { text: fmtM(ttm.netIncome), options: { align: "right" as const } }],
        [{ text: "Free Cash Flow" }, { text: fmtM(ttm.fcf), options: { align: "right" as const } }],
      ];

      s8.addTable(ttmRows, {
        x: LAYOUT.marginX, y: 1.2, w: 4.5,
        fontSize: TABLE_STYLE.rowFontSize, fontFace: FONTS.body,
        border: { color: COLORS.slate300, pt: TABLE_STYLE.borderWidth },
        colW: [2.5, 2], rowH: 0.4, margin: TABLE_STYLE.cellPadding, autoPage: false,
      });
      addFooter(s8, "Dividend IQ — TTM Analysis");
    }

    // ═══ CLOSING SLIDE ═══
    const sLast = pres.addSlide();
    sLast.background = { fill: COLORS.navy };
    sLast.addText("Thank You", {
      x: LAYOUT.marginX, y: 1.5, w: LAYOUT.contentW, h: 1,
      fontSize: 36, fontFace: FONTS.title, color: COLORS.white, bold: true, align: "center",
    });
    sLast.addText("Generated by Dividend IQ", {
      x: LAYOUT.marginX, y: 3, w: LAYOUT.contentW, h: 0.5,
      fontSize: 14, fontFace: FONTS.body, color: COLORS.ice, align: "center",
    });

    // ── Generate buffer ──
    const buffer = await pres.write({ outputType: "nodebuffer" }) as Buffer;
    const filename = `${ticker ?? "Insights"}_Deck_${new Date().toISOString().slice(0, 10)}.pptx`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
