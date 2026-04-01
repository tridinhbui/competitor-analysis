/**
 * GET /api/web-search?q=Smithfield+pork+earnings
 *
 * Fetches industry news and generates an AI-powered insight summary.
 * Uses Google News RSS + OpenAI for summarization.
 */

import { fetchWebSearchInsight, fetchIndustryNews } from "@/lib/externalDataService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return Response.json({ error: "Missing ?q= parameter" }, { status: 400 });
  }

  // Try to generate AI insight from news
  const insight = await fetchWebSearchInsight(query);

  if (insight) {
    return Response.json(insight);
  }

  // Fallback: return raw news without AI summary
  const news = await fetchIndustryNews(query);
  return Response.json({
    query,
    summary: null,
    sources: news.map(n => ({ title: n.title, url: n.url })),
    news,
    generatedAt: new Date().toISOString(),
  });
}
