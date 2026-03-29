import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured. Add it to .env.local." },
      { status: 503 }
    );
  }

  let body: { messages?: ChatMessage[]; context?: string; autoSummary?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (body.autoSummary && body.context) {
    return handleAutoSummary(apiKey, model, body.context);
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing messages[]" }, { status: 400 });
  }

  const systemContent = `You are a senior equity research analyst assistant. The user is viewing a structured financial analysis (balance sheet, cash flow, dividend sustainability, leverage ratios) extracted from SEC XBRL filings or 10-Q PDF uploads.

CITATION RULES (critical):
- When stating a number, cite its source using inline format [Source]. Examples: "$352,583M [XBRL:Assets]", "D/E 0.8x [computed]", "Net income $12B [AI:NetIncomeLoss]".
- The context includes a "sources" object: for each metric it shows { value, source }. Use that source string in your citation.
- Line items have "_src" or "source" field — use it when referring to that line.
- If data is missing or estimated, say "Not found in extract" or "Estimated".

ANALYSIS DEPTH:
- Provide detailed, thorough analysis — 2–4 sentences per insight when relevant. Avoid one-line answers.
- Include industry benchmarks: D/E (tech 0.3–1, utilities 1–1.5, financials 2–4); payout (<60% NI conservative, >80% stretched); interest coverage (>8x strong, <2x concern); net debt/EBITDA (<1x low, >4x stressed).
- For market/peer comparison: Suggest that the user run the same analysis on competitor tickers (e.g., MSFT, GOOGL for AAPL) to compare ratios side-by-side. If sector is inferrable, mention typical peer ranges. Note that full sector aggregates require external data (e.g., Bloomberg, S&P).
- Structure answers with headers (##) and bullet points for readability.
- If asked about risks or opportunities, cover: leverage, refinancing, FCF sustainability, payout trajectory, capital allocation, working capital, and sector-specific factors.

${body.context ? `Current analysis (JSON, values in USD millions; "sources" has provenance for each metric):\n${body.context.slice(0, 28000)}` : "No structured analysis attached yet (user may ask general questions)."}`;

  const openaiMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messages.filter((m) => m.role === "user" || m.role === "assistant"),
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        temperature: 0.35,
        max_tokens: 3500,
      }),
    });

    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? res.statusText },
        { status: res.status }
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ message: text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Model provider error" },
      { status: 502 }
    );
  }
}

async function handleAutoSummary(apiKey: string, model: string, context: string) {
  const systemPrompt = `You are a senior equity research analyst. Given structured financial data extracted from a 10-Q/10-K filing, produce a comprehensive, detailed analysis report. Be thorough — each section should provide meaningful insight, not generic filler.

Format your response EXACTLY as follows (use markdown):

## Quick Take
2–3 sentences: verdict on financial health and dividend sustainability, plus one standout strength or concern.

## Key Metrics at a Glance
| Metric | Value | Source | vs. Sector Typical | Assessment |
|--------|-------|--------|--------------------|------------|
Include: Total Assets, Net Debt, D/E Ratio, FCF, Payout Ratio, Interest Coverage. For "vs. Sector Typical" use qualitative context (e.g., "low for tech", "typical for utilities"). Cite source.

## Strengths
- 3–5 bullet points, each 1–2 sentences. Cite numbers with [Source]. Explain why each matters (e.g., liquidity, flexibility, capital allocation).

## Risks & Concerns
- 3–5 bullet points, each 1–2 sentences. Cite numbers. Connect to refinancing, earnings quality, leverage, or sector headwinds.

## Dividend Assessment
3–4 sentences. Reference payout vs NI, payout vs FCF, coverage multiples, and cash reserves. Compare conceptually to sustainable ranges (payout <60% NI conservative; FCF cover >2x comfortable). Cite [Source].

## Capital Structure Summary
3–4 sentences. Discuss D/E, net debt, maturity profile, and how the company is financed. Use industry benchmarks: D/E tech 0.3–1, utilities 1–1.5, financials 2–4. Cite [Source].

## Industry & Peer Context
2–3 sentences. Note that for formal peer comparison, the user can run this analysis on competitor tickers (e.g., MSFT, GOOGL for a tech name). Sector aggregates require external data. Suggest 2–3 comparable tickers if the company name/ticker is clear from context.

## References
List each key metric and its source (e.g., Total assets: XBRL:Assets). Enables verification of data provenance.

Rules:
- ALWAYS cite source for every number using [Source].
- Be detailed and analytical — aim for 600–800 words total.
- No generic filler. Every sentence should add value.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this financial data:\n${context.slice(0, 28000)}` },
        ],
        temperature: 0.3,
        max_tokens: 3500,
      }),
    });

    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? res.statusText },
        { status: res.status }
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ message: text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Model provider error" },
      { status: 502 }
    );
  }
}
