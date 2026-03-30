import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractMetrics } from "@/lib/analysisModules";
import type { Filing } from "@/types/competitor";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  // Get company info
  const { data: company } = await supabase
    .from("companies")
    .select("ticker, name, peer_type, industry")
    .eq("ticker", ticker)
    .maybeSingle();

  // Get latest filing
  const { data: filings } = await supabase
    .from("filings")
    .select("ticker, period_end, source, analysis")
    .eq("ticker", ticker)
    .order("period_end", { ascending: false })
    .limit(1);

  const latestFiling = filings?.[0];
  const analysis = latestFiling?.analysis as FullAnalysis | undefined;

  // Extract metrics
  let financials = {
    revenue: null as number | null,
    netIncome: null as number | null,
    totalAssets: null as number | null,
    totalDebt: null as number | null,
    freeCashFlow: null as number | null,
    operatingMargin: null as number | null,
    netMargin: null as number | null,
    roe: null as number | null,
  };

  let segments: Array<{
    name: string;
    revenue: number | null;
    operatingIncome: number | null;
    operatingMargin: number | null;
    revenuePercent: number | null;
  }> = [];

  if (analysis && latestFiling) {
    const filing: Filing = {
      ticker: latestFiling.ticker,
      periodEnd: latestFiling.period_end,
      source: latestFiling.source ?? "sec",
      filingType: "10-Q",
      filingDate: "",
      savedAt: "",
      analysis,
    };
    const m = extractMetrics(filing);
    financials = {
      revenue: m.revenue,
      netIncome: m.netIncome,
      totalAssets: m.totalAssets,
      totalDebt: m.totalDebt,
      freeCashFlow: m.freeCashFlow,
      operatingMargin: m.operatingMargin,
      netMargin: m.netMargin,
      roe: m.roe,
    };

    if (analysis.segments?.length) {
      const totalRev = analysis.segments.reduce((s, seg) => s + (seg.revenue ?? 0), 0);
      segments = analysis.segments.map((seg) => ({
        name: seg.segmentName,
        revenue: seg.revenue ?? null,
        operatingIncome: seg.operatingIncome ?? null,
        operatingMargin: seg.operatingMargin ?? null,
        revenuePercent: totalRev > 0 && seg.revenue ? Math.round((seg.revenue / totalRev) * 1000) / 10 : null,
      }));
    }
  }

  // Try to get stock data from Yahoo Finance
  let stock = null;
  try {
    const yRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=5d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (yRes.ok) {
      const yData = await yRes.json();
      const result = yData?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const prices = result.indicators?.quote?.[0]?.close ?? [];
        const lastPrice = meta.regularMarketPrice ?? prices[prices.length - 1];
        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const change = lastPrice && prevClose ? lastPrice - prevClose : 0;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;

        stock = {
          price: lastPrice ?? 0,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePct * 100) / 100,
          marketCap: meta.marketCap ?? null,
          peRatio: null as number | null,
          dividendYield: null as number | null,
          week52High: meta.fiftyTwoWeekHigh ?? null,
          week52Low: meta.fiftyTwoWeekLow ?? null,
          avgVolume: meta.averageDailyVolume10Day ?? null,
        };
      }
    }
  } catch {
    // Yahoo blocked — stock stays null
  }

  // Try summary data for P/E
  try {
    const sRes = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,defaultKeyStatistics`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    if (sRes.ok) {
      const sData = await sRes.json();
      const detail = sData?.quoteSummary?.result?.[0]?.summaryDetail;
      const stats = sData?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
      if (stock) {
        stock.peRatio = detail?.trailingPE?.raw ?? stats?.trailingPE?.raw ?? null;
        stock.dividendYield = detail?.dividendYield?.raw ? Math.round(detail.dividendYield.raw * 10000) / 100 : null;
      }
    }
  } catch { /* ignore */ }

  // News (requires NEWSAPI_KEY)
  let news: Array<{ title: string; url: string; source: string; date: string }> = [];
  const newsKey = process.env.NEWSAPI_KEY;
  if (newsKey) {
    try {
      const nRes = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(ticker)}&sortBy=publishedAt&pageSize=5&apiKey=${newsKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (nRes.ok) {
        const nData = await nRes.json();
        news = (nData.articles ?? []).map((a: { title: string; url: string; source: { name: string }; publishedAt: string }) => ({
          title: a.title,
          url: a.url,
          source: a.source?.name ?? "",
          date: a.publishedAt,
        }));
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ticker,
    companyName: company?.name ?? analysis?.meta?.companyName ?? ticker,
    description: null,
    industry: company?.industry ?? null,
    stock,
    segments,
    financials,
    news,
  });
}
