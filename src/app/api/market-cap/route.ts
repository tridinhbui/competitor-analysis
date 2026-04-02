import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/market-cap?ticker=TSN
 * Fetches market cap from Yahoo Finance v8 API (no key required).
 * Returns { marketCap, price, sharesOutstanding, currency, name }
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter required" }, { status: 400 });
  }

  // Try Yahoo Finance quoteSummary
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo API returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            previousClose?: number;
            shortName?: string;
            longName?: string;
            currency?: string;
            marketCap?: number;
          };
        }>;
      };
    };

    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) {
      return NextResponse.json({ error: "No data found for ticker" }, { status: 404 });
    }

    const price = meta.regularMarketPrice ?? meta.previousClose ?? null;

    // Yahoo chart API doesn't always include marketCap directly
    // Try the quote endpoint for market cap
    let marketCapM: number | null = null;
    let sharesOutstanding: number | null = null;

    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,price`;
      const quoteRes = await fetch(quoteUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json() as {
          quoteSummary?: {
            result?: Array<{
              defaultKeyStatistics?: { sharesOutstanding?: { raw?: number } };
              price?: { marketCap?: { raw?: number } };
            }>;
          };
        };
        const qResult = quoteData.quoteSummary?.result?.[0];
        const rawMCap = qResult?.price?.marketCap?.raw;
        if (rawMCap) {
          marketCapM = Math.round(rawMCap / 1_000_000); // Convert to $M
        }
        const rawShares = qResult?.defaultKeyStatistics?.sharesOutstanding?.raw;
        if (rawShares) {
          sharesOutstanding = Math.round(rawShares / 1_000_000); // Convert to M shares
        }
      }
    } catch {
      // Fall back to price × sharesOutstanding estimate
    }

    // If we still don't have market cap, try simple estimate
    if (!marketCapM && price && sharesOutstanding) {
      marketCapM = Math.round(price * sharesOutstanding);
    }

    return NextResponse.json({
      ticker,
      name: meta.longName ?? meta.shortName ?? ticker,
      price,
      marketCapM,
      sharesOutstandingM: sharesOutstanding,
      currency: meta.currency ?? "USD",
      source: "yahoo-finance",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch market data" },
      { status: 502 }
    );
  }
}
