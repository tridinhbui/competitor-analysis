import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/insights-commentary
 * Takes analysis metrics and generates AI commentary for each Insights section.
 */

interface CommentaryRequest {
  ticker: string;
  companyName?: string;
  // DuPont
  dupont?: {
    netMargin: number | null;
    assetTurnover: number | null;
    equityMultiplier: number | null;
    roe: number | null;
  };
  // Altman Z-Score
  zScore?: {
    score: number | null;
    zone: string;
  };
  // Piotroski F-Score
  piotroski?: {
    score: number;
    maxScore: number;
  };
  // Earnings Quality
  earningsQuality?: {
    accrualRatio: number | null;
    cashConversion: number | null;
  };
  // Cash Conversion Cycle
  ccc?: {
    dso: number | null;
    dio: number | null;
    dpo: number | null;
    ccc: number | null;
  };
  // Peer comparison summary
  peerMetrics?: Array<{
    ticker: string;
    operatingMargin: number | null;
    roe: number | null;
    debtToEquity: number | null;
  }>;
  // TTM summary
  ttm?: {
    revenue: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    fcfMargin: number | null;
  };
}

export interface CommentaryResponse {
  dupont: string | null;
  zScore: string | null;
  piotroski: string | null;
  earningsQuality: string | null;
  ccc: string | null;
  peerPositioning: string | null;
  ttmOutlook: string | null;
  overallAssessment: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 503 });
  }

  let body: CommentaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const prompt = `You are a senior financial analyst writing concise, actionable commentary for ${body.ticker}${body.companyName ? ` (${body.companyName})` : ""}.

Given these financial metrics, write short analyst commentary (1-2 sentences each) for each section. Be specific about what the numbers mean, flag any concerns or strengths, and avoid generic language.

METRICS:
${JSON.stringify({
  dupont: body.dupont,
  zScore: body.zScore,
  piotroski: body.piotroski,
  earningsQuality: body.earningsQuality,
  cashConversionCycle: body.ccc,
  peerComparison: body.peerMetrics,
  ttm: body.ttm,
}, null, 2)}

Return ONLY valid JSON (no markdown):
{
  "dupont": "1-2 sentence commentary on DuPont decomposition. What's driving ROE - margins, efficiency, or leverage? Any red flags?",
  "zScore": "1-2 sentence interpretation of Z-Score. Solvency risk assessment.",
  "piotroski": "1-2 sentence interpretation of F-Score. Financial strength signals.",
  "earningsQuality": "1-2 sentence on earnings quality. Are earnings cash-backed or accrual-heavy?",
  "ccc": "1-2 sentence on working capital efficiency. Is the cash cycle getting better/worse?",
  "peerPositioning": "1-2 sentence on competitive position vs peers. Where does this company stand?",
  "ttmOutlook": "1-2 sentence on TTM trajectory. Revenue/margin trends.",
  "overallAssessment": "2-3 sentence overall financial health assessment. Key strengths and risks."
}

Rules:
- Use specific numbers from the data. Don't be vague.
- If a metric is null or missing, say so briefly and skip that section (return null).
- Be direct: "Strong" / "Weak" / "Concerning" / "Improving" — no hedging.
- For peer comparison, name specific tickers if available.
- For Z-Score zones: >2.99 = safe, 1.81-2.99 = grey zone, <1.81 = distress.
- For Piotroski: 8-9 = strong, 5-7 = moderate, 0-4 = weak.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "OpenAI call failed" }, { status: 502 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as CommentaryResponse;

    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Commentary generation failed" }, { status: 502 });
  }
}
