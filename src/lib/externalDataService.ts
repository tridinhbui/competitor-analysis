/**
 * External Data Service — fetches commodity prices, macro indicators,
 * and industry news from public APIs.
 *
 * Data sources:
 * - Yahoo Finance: Commodity futures (lean hogs, corn, soybeans)
 * - FRED API: Macro indicators (CPI, PPI, GDP, unemployment, fed funds)
 * - NewsAPI / Google News RSS: Industry news
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommodityPrice {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  unit: string;
  asOf: string | null;
}

export interface MacroIndicator {
  id: string;
  name: string;
  value: number | null;
  previousValue: number | null;
  change: number | null;
  unit: string;
  date: string | null;
  source: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  date: string;
  snippet: string;
}

export interface MacroDataResult {
  commodities: CommodityPrice[];
  indicators: MacroIndicator[];
  news: NewsItem[];
  fetchedAt: string;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Commodity futures via Yahoo Finance
// ---------------------------------------------------------------------------

const COMMODITY_SYMBOLS: Array<{ symbol: string; name: string; unit: string }> = [
  { symbol: "HE=F", name: "Lean Hogs Futures", unit: "¢/lb" },
  { symbol: "ZC=F", name: "Corn Futures", unit: "¢/bu" },
  { symbol: "ZM=F", name: "Soybean Meal Futures", unit: "$/ton" },
  { symbol: "ZS=F", name: "Soybeans Futures", unit: "¢/bu" },
  { symbol: "LE=F", name: "Live Cattle Futures", unit: "¢/lb" },
  { symbol: "GF=F", name: "Feeder Cattle Futures", unit: "¢/lb" },
];

async function fetchCommodityPrices(): Promise<CommodityPrice[]> {
  const results: CommodityPrice[] = [];

  for (const { symbol, name, unit } of COMMODITY_SYMBOLS) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) {
        results.push({ symbol, name, price: null, change: null, changePercent: null, unit, asOf: null });
        continue;
      }
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const prices = result.indicators?.quote?.[0]?.close ?? [];
        const lastPrice = meta.regularMarketPrice ?? prices[prices.length - 1];
        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const change = lastPrice && prevClose ? Math.round((lastPrice - prevClose) * 100) / 100 : null;
        const changePct = prevClose && change != null ? Math.round((change / prevClose) * 10000) / 100 : null;

        results.push({
          symbol,
          name,
          price: lastPrice != null ? Math.round(lastPrice * 100) / 100 : null,
          change,
          changePercent: changePct,
          unit,
          asOf: new Date().toISOString(),
        });
      }
    } catch {
      results.push({ symbol, name, price: null, change: null, changePercent: null, unit, asOf: null });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// FRED API — macro indicators
// ---------------------------------------------------------------------------

const FRED_SERIES: Array<{ id: string; name: string; unit: string }> = [
  { id: "CPIAUCSL", name: "CPI (All Urban)", unit: "Index" },
  { id: "PPIFIS", name: "PPI (Final Demand)", unit: "Index" },
  { id: "UNRATE", name: "Unemployment Rate", unit: "%" },
  { id: "FEDFUNDS", name: "Fed Funds Rate", unit: "%" },
  { id: "GDP", name: "Real GDP", unit: "$B" },
  { id: "DCOILWTICO", name: "WTI Crude Oil", unit: "$/bbl" },
  { id: "T10Y2Y", name: "10Y-2Y Spread", unit: "%" },
  { id: "WPU0223", name: "PPI Pork", unit: "Index" },
];

async function fetchFredIndicators(): Promise<MacroIndicator[]> {
  const fredKey = process.env.FRED_API_KEY;
  if (!fredKey) {
    return FRED_SERIES.map(({ id, name, unit }) => ({
      id, name, value: null, previousValue: null, change: null, unit, date: null,
      source: "FRED (no API key configured)",
    }));
  }

  const results: MacroIndicator[] = [];

  for (const { id, name, unit } of FRED_SERIES) {
    try {
      const res = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&sort_order=desc&limit=2&api_key=${fredKey}&file_type=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) {
        results.push({ id, name, value: null, previousValue: null, change: null, unit, date: null, source: "FRED" });
        continue;
      }
      const data = await res.json();
      const obs = data?.observations ?? [];
      const latest = obs[0];
      const prev = obs[1];
      const value = latest?.value !== "." ? parseFloat(latest?.value) : null;
      const previousValue = prev?.value !== "." ? parseFloat(prev?.value) : null;
      const change = value != null && previousValue != null ? Math.round((value - previousValue) * 1000) / 1000 : null;

      results.push({
        id, name,
        value: value != null && !isNaN(value) ? value : null,
        previousValue: previousValue != null && !isNaN(previousValue) ? previousValue : null,
        change,
        unit,
        date: latest?.date ?? null,
        source: "FRED",
      });
    } catch {
      results.push({ id, name, value: null, previousValue: null, change: null, unit, date: null, source: "FRED" });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// News via Google News RSS (no API key required)
// ---------------------------------------------------------------------------

async function fetchIndustryNews(query: string): Promise<NewsItem[]> {
  const items: NewsItem[] = [];

  // Try NewsAPI first if key is available
  const newsKey = process.env.NEWSAPI_KEY;
  if (newsKey) {
    try {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${newsKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = await res.json();
        for (const a of data.articles ?? []) {
          items.push({
            title: a.title ?? "",
            url: a.url ?? "",
            source: a.source?.name ?? "",
            date: a.publishedAt ?? "",
            snippet: a.description ?? "",
          });
        }
        return items;
      }
    } catch { /* fall through to RSS */ }
  }

  // Fallback: Google News RSS
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const xml = await res.text();
      // Simple XML parsing for RSS items
      const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
      for (const itemXml of itemMatches.slice(0, 10)) {
        const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1") ?? "";
        const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
        const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
        const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1") ?? "";
        const description = itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1]
          ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          ?.replace(/&lt;[^&]*&gt;/g, "")
          ?.replace(/<[^>]+>/g, "")
          ?.replace(/&amp;/g, "&")
          ?.replace(/&quot;/g, '"')
          ?.replace(/&#39;/g, "'")
          ?.replace(/&lt;/g, "<")
          ?.replace(/&gt;/g, ">")
          ?.replace(/&nbsp;/g, " ")
          ?.replace(/\s+/g, " ")
          ?.trim()
          ?.slice(0, 200) ?? "";

        if (title) {
          items.push({ title, url: link, source, date: pubDate, snippet: description });
        }
      }
    }
  } catch { /* ignore */ }

  return items;
}

// ---------------------------------------------------------------------------
// USDA Pork Cutout Report (public, no key)
// ---------------------------------------------------------------------------

export interface PorkCutoutData {
  date: string | null;
  compositeCutout: number | null;
  loinPrice: number | null;
  buttPrice: number | null;
  hamPrice: number | null;
  bellyPrice: number | null;
  ribPrice: number | null;
}

async function fetchPorkCutout(): Promise<PorkCutoutData> {
  const empty: PorkCutoutData = {
    date: null, compositeCutout: null, loinPrice: null,
    buttPrice: null, hamPrice: null, bellyPrice: null, ribPrice: null,
  };

  try {
    // USDA MARS API for pork cutout values
    const res = await fetch(
      "https://mpr.datamart.ams.usda.gov/services/v1.1/reports/2511/LM_PK602?filter=%7B%22filters%22:%5B%5D%7D",
      { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } }
    );
    if (!res.ok) return empty;
    const data = await res.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return empty;
    const latest = results[0];
    return {
      date: latest.report_date ?? null,
      compositeCutout: latest.pork_carcass != null ? parseFloat(latest.pork_carcass) : null,
      loinPrice: latest.pork_loin != null ? parseFloat(latest.pork_loin) : null,
      buttPrice: latest.pork_butt != null ? parseFloat(latest.pork_butt) : null,
      hamPrice: latest.pork_ham != null ? parseFloat(latest.pork_ham) : null,
      bellyPrice: latest.pork_belly != null ? parseFloat(latest.pork_belly) : null,
      ribPrice: latest.pork_rib != null ? parseFloat(latest.pork_rib) : null,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Web Search (using OpenAI for insight generation from context)
// ---------------------------------------------------------------------------

export interface SearchInsight {
  query: string;
  summary: string;
  sources: Array<{ title: string; url: string }>;
  generatedAt: string;
}

async function generateSearchInsight(query: string, newsItems: NewsItem[]): Promise<SearchInsight | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || newsItems.length === 0) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const newsContext = newsItems.slice(0, 8).map((n, i) =>
    `[${i + 1}] ${n.title} (${n.source}, ${n.date})\n${n.snippet}`
  ).join("\n\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: "You are a financial analyst assistant. Summarize the key themes from these news articles in 3-5 bullet points. Focus on: commodity price trends, supply/demand shifts, regulatory changes, and competitive dynamics relevant to the protein/meat industry. Be concise and factual.",
          },
          {
            role: "user",
            content: `Search query: "${query}"\n\nRecent news:\n${newsContext}\n\nProvide a brief market intelligence summary.`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content ?? "";

    return {
      query,
      summary,
      sources: newsItems.slice(0, 8).map(n => ({ title: n.title, url: n.url })),
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchMacroData(newsQuery?: string): Promise<MacroDataResult> {
  const errors: string[] = [];

  const [commodities, indicators, porkCutout, news] = await Promise.all([
    fetchCommodityPrices().catch((e) => { errors.push(`Commodities: ${e.message}`); return [] as CommodityPrice[]; }),
    fetchFredIndicators().catch((e) => { errors.push(`FRED: ${e.message}`); return [] as MacroIndicator[]; }),
    fetchPorkCutout().catch(() => null),
    fetchIndustryNews(newsQuery ?? "pork industry meat protein").catch((e) => { errors.push(`News: ${e.message}`); return [] as NewsItem[]; }),
  ]);

  // Add pork cutout as a commodity entry if available
  if (porkCutout?.compositeCutout != null) {
    commodities.push({
      symbol: "PORK_CUTOUT",
      name: "USDA Pork Cutout (Composite)",
      price: porkCutout.compositeCutout,
      change: null,
      changePercent: null,
      unit: "$/cwt",
      asOf: porkCutout.date,
    });
  }

  return {
    commodities,
    indicators,
    news,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}

export async function fetchWebSearchInsight(query: string): Promise<SearchInsight | null> {
  const news = await fetchIndustryNews(query);
  return generateSearchInsight(query, news);
}

export { fetchPorkCutout, fetchCommodityPrices, fetchFredIndicators, fetchIndustryNews };
