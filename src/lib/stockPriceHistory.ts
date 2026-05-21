export interface StockPriceHistoryPoint {
  date: string;
  close: number;
}

export interface StockPriceHistoryResult {
  ticker: string;
  longName: string | null;
  currency: string | null;
  exchange: string | null;
  marketTimeIso: string | null;
  points: StockPriceHistoryPoint[];
  latestPrice: number | null;
  percentChange: number | null;
  absoluteChange: number | null;
  week52High: number | null;
  week52Low: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayVolume: number | null;
  dayOpen: number | null;
  previousClose: number | null;
}

export interface StockReactionWindowResult {
  eventDate: string;
  previousClose: number | null;
  previousCloseDate: string | null;
  reactionClose: number | null;
  reactionCloseDate: string | null;
  fiveDayClose: number | null;
  fiveDayCloseDate: string | null;
  oneDayChangePct: number | null;
  fiveDayChangePct: number | null;
}

interface DailyStockPoint {
  date: string;
  close: number;
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
    longName: null,
    currency: null,
    exchange: null,
    marketTimeIso: null,
    points: [],
    latestPrice: null,
    percentChange: null,
    absoluteChange: null,
    week52High: null,
    week52Low: null,
    dayHigh: null,
    dayLow: null,
    dayVolume: null,
    dayOpen: null,
    previousClose: null,
  };

  const headers = { "User-Agent": "Mozilla/5.0" };

  try {
    const [weeklyResp, dailyResp] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${yahooRange}&interval=1wk`,
        { headers, signal: AbortSignal.timeout(7000) }
      ),
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
        { headers, signal: AbortSignal.timeout(7000) }
      ).catch(() => null),
    ]);

    if (!weeklyResp.ok) return empty;

    const payload = await weeklyResp.json();
    const result = payload?.chart?.result?.[0];
    const meta = result?.meta;
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    const points: StockPriceHistoryPoint[] = timestamps
      .map((ts, idx) => ({
        date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        close: closes[idx] ?? null,
      }))
      .filter((p): p is StockPriceHistoryPoint => typeof p.close === "number" && Number.isFinite(p.close));

    if (points.length === 0) return empty;
    const latestPrice =
      typeof meta?.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice)
        ? meta.regularMarketPrice
        : points[points.length - 1].close;
    const first = points[0].close;
    const percentChange = first !== 0 ? ((latestPrice - first) / first) * 100 : null;
    const absoluteChange = Number.isFinite(latestPrice - first) ? latestPrice - first : null;
    const week52High =
      typeof meta?.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh : Math.max(...points.map((p) => p.close));
    const week52Low =
      typeof meta?.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow : Math.min(...points.map((p) => p.close));

    let dayOpen: number | null = null;
    let previousClose: number | null = null;
    if (dailyResp && dailyResp.ok) {
      try {
        const dailyPayload = await dailyResp.json();
        const dailyResult = dailyPayload?.chart?.result?.[0];
        const dailyTs: number[] = dailyResult?.timestamp ?? [];
        const dailyOpens: Array<number | null> = dailyResult?.indicators?.quote?.[0]?.open ?? [];
        const dailyCloses: Array<number | null> = dailyResult?.indicators?.quote?.[0]?.close ?? [];
        if (dailyTs.length > 0) {
          const lastIdx = dailyTs.length - 1;
          const openVal = dailyOpens[lastIdx];
          if (typeof openVal === "number" && Number.isFinite(openVal)) dayOpen = openVal;
          if (lastIdx > 0) {
            const prev = dailyCloses[lastIdx - 1];
            if (typeof prev === "number" && Number.isFinite(prev)) previousClose = prev;
          }
        }
        if (previousClose == null && typeof dailyResult?.meta?.chartPreviousClose === "number") {
          previousClose = dailyResult.meta.chartPreviousClose;
        }
      } catch {
        // ignore daily fetch parse errors — fall through with nulls
      }
    }

    const marketTimeIso =
      typeof meta?.regularMarketTime === "number"
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null;

    return {
      ticker,
      longName: meta?.longName ?? meta?.shortName ?? null,
      currency: meta?.currency ?? null,
      exchange: meta?.fullExchangeName ?? meta?.exchangeName ?? null,
      marketTimeIso,
      points,
      latestPrice,
      percentChange,
      absoluteChange,
      week52High,
      week52Low,
      dayHigh: typeof meta?.regularMarketDayHigh === "number" ? meta.regularMarketDayHigh : null,
      dayLow: typeof meta?.regularMarketDayLow === "number" ? meta.regularMarketDayLow : null,
      dayVolume: typeof meta?.regularMarketVolume === "number" ? meta.regularMarketVolume : null,
      dayOpen,
      previousClose,
    };
  } catch {
    return empty;
  }
}

function toDailyIso(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function normalizeIsoDate(value: string): string | null {
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export async function fetchStockReactionWindow(params: {
  ticker: string;
  eventDate: string;
  lookbackDays?: number;
  forwardTradingDays?: number;
}): Promise<StockReactionWindowResult | null> {
  const ticker = params.ticker.toUpperCase();
  const eventDate = normalizeIsoDate(params.eventDate);
  if (!eventDate) return null;

  const lookbackDays = params.lookbackDays ?? 7;
  const forwardTradingDays = params.forwardTradingDays ?? 5;
  const event = new Date(`${eventDate}T00:00:00Z`);
  const start = new Date(event);
  start.setUTCDate(start.getUTCDate() - lookbackDays);
  const end = new Date(event);
  end.setUTCDate(end.getUTCDate() + forwardTradingDays + 10);

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${Math.floor(
        start.getTime() / 1000
      )}&period2=${Math.floor(end.getTime() / 1000)}&interval=1d&includePrePost=false`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
    const points: DailyStockPoint[] = timestamps
      .map((ts, idx) => ({
        date: toDailyIso(ts),
        close: closes[idx] ?? null,
      }))
      .filter((point): point is DailyStockPoint => typeof point.close === "number" && Number.isFinite(point.close));

    const reactionIndex = points.findIndex((point) => point.date >= eventDate);
    if (reactionIndex <= 0) return null;

    const previous = points[reactionIndex - 1] ?? null;
    const reaction = points[reactionIndex] ?? null;
    const fiveDay = points[Math.min(reactionIndex + forwardTradingDays, points.length - 1)] ?? null;

    if (!previous || !reaction) return null;

    return {
      eventDate,
      previousClose: previous.close,
      previousCloseDate: previous.date,
      reactionClose: reaction.close,
      reactionCloseDate: reaction.date,
      fiveDayClose: fiveDay?.close ?? null,
      fiveDayCloseDate: fiveDay?.date ?? null,
      oneDayChangePct:
        previous.close !== 0 ? ((reaction.close - previous.close) / previous.close) * 100 : null,
      fiveDayChangePct:
        previous.close !== 0 && fiveDay ? ((fiveDay.close - previous.close) / previous.close) * 100 : null,
    };
  } catch {
    return null;
  }
}

