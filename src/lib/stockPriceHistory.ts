export interface StockPriceHistoryPoint {
  date: string;
  close: number;
}

export interface StockPriceHistoryResult {
  ticker: string;
  points: StockPriceHistoryPoint[];
  latestPrice: number | null;
  percentChange: number | null;
  week52High: number | null;
  week52Low: number | null;
}

export async function fetchStockPriceHistory(params: {
  ticker: string;
  range?: "1Y" | "YTD" | "6M" | "3M";
}): Promise<StockPriceHistoryResult> {
  const rangeMap: Record<NonNullable<typeof params.range>, string> = {
    "1Y": "1y",
    "YTD": "ytd",
    "6M": "6mo",
    "3M": "3mo",
  };
  const range = params.range ?? "1Y";
  const yahooRange = rangeMap[range];
  const ticker = params.ticker.toUpperCase();

  const empty: StockPriceHistoryResult = {
    ticker,
    points: [],
    latestPrice: null,
    percentChange: null,
    week52High: null,
    week52Low: null,
  };

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yahooRange}&interval=1wk`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!response.ok) return empty;

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    const points: StockPriceHistoryPoint[] = timestamps
      .map((ts, idx) => ({
        date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        close: closes[idx] ?? null,
      }))
      .filter((p): p is StockPriceHistoryPoint => typeof p.close === "number" && Number.isFinite(p.close));

    if (points.length === 0) return empty;
    const latestPrice = points[points.length - 1].close;
    const first = points[0].close;
    const percentChange = first !== 0 ? ((latestPrice - first) / first) * 100 : null;
    const week52High = Math.max(...points.map((p) => p.close));
    const week52Low = Math.min(...points.map((p) => p.close));

    return {
      ticker,
      points,
      latestPrice,
      percentChange,
      week52High,
      week52Low,
    };
  } catch {
    return empty;
  }
}

