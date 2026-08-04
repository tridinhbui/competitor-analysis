import { NextResponse } from "next/server";
import { requireAuthedUser } from "@/lib/serverAuth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { languageInstruction, normalizeResponseLanguage } from "@/lib/responseLanguage";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

interface PageContext {
  title?: string;
  cfoGoal?: string;
  keyQuestions?: string[];
  expectedOutputs?: string[];
}

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const CFO_PAGE_FRAMING: Record<string, string> = {
  "/analyze": `You are acting as a strategic CFO copilot reviewing a financial filing analysis. Prioritize:
- Debt and leverage risk (flag anything outside safe sector range)
- Free cash flow vs. dividend sustainability
- Anomalies or red flags worth escalating to the board
- Output: a clear green/yellow/red signal with a concise decision memo`,

  "/workspace": `You are acting as a strategic CFO copilot in the analysis workspace. Prioritize:
- Peer comparison and how this company ranks on key metrics
- Narrative consistency across quarters (is the investment thesis holding?)
- Top 3 investment implications for capital allocation decisions
- Output: board-ready investment implications and items to verify`,

  "/data-source": `You are acting as a strategic CFO copilot reviewing data quality. Prioritize:
- Recency and reliability of the extracted financial data
- Missing critical fields that could skew analysis conclusions
- Confidence level of extraction (high/medium/low)
- Output: data quality verdict and gap-fill checklist before proceeding`,

  "/history": `You are acting as a strategic CFO copilot reviewing historical analysis runs. Prioritize:
- What changed materially between the most recent and prior runs
- Whether the investment thesis is drifting, stable, or reversing
- Directional trends on key metrics (margins, leverage, FCF)
- Output: delta summary and thesis stability rating`,

  "/overview": `You are acting as a strategic CFO copilot reviewing the financial overview. Prioritize:
- Overall financial health signal (green/yellow/red)
- Outlier metrics that deviate from sector norms
- The single most urgent area requiring deeper investigation
- Output: executive snapshot with prioritized next steps`,

  "/profile": `You are acting as a strategic CFO copilot advising on tool preferences. Prioritize:
- Analysis depth and output style settings appropriate for board-level decisions
- Modules most relevant for CFO strategic workflow
- Recommended configuration for fast, reliable, exec-quality outputs
- Output: specific preference recommendations for a CFO power-user`,
};

export async function POST(request: Request) {
  const authResult = await requireAuthedUser(request);
  if (authResult instanceof NextResponse) return authResult;

  const rl = checkRateLimit(`chat:${authResult.userId}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured. Add it to .env.local." },
      { status: 503 }
    );
  }

  let body: {
    messages?: ChatMessage[];
    context?: string;
    autoSummary?: boolean;
    pathname?: string;
    pageContext?: PageContext;
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const language = normalizeResponseLanguage(body.language);
  const langRule = languageInstruction(language);

  if (body.autoSummary && body.context) {
    return handleAutoSummary(apiKey, model, body.context, langRule);
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing messages[]" }, { status: 400 });
  }

  const pathname = body.pathname ?? "";
  const pageContext = body.pageContext;
  const cfoFraming = CFO_PAGE_FRAMING[pathname] ?? null;

  const cfoSection = cfoFraming
    ? `\n\nCFO COPILOT FRAMING FOR THIS PAGE (${pageContext?.title ?? pathname}):\n${cfoFraming}${
        pageContext?.cfoGoal ? `\n\nPage CFO goal: ${pageContext.cfoGoal}` : ""
      }${
        pageContext?.keyQuestions?.length
          ? `\nKey questions the user wants answered:\n${pageContext.keyQuestions.map((q) => `- ${q}`).join("\n")}`
          : ""
      }${
        pageContext?.expectedOutputs?.length
          ? `\nExpected outputs for this page:\n${pageContext.expectedOutputs.map((o) => `- ${o}`).join("\n")}`
          : ""
      }\n\nAlways frame answers in terms of actionable insight, risk, or next decision. Be concise and board-ready.`
    : "";

  const systemContent = `You are a senior strategic CFO copilot and equity research analyst. The user is viewing a structured analysis workspace page that provides financial analysis.${cfoSection}

CITATION RULES (critical):
- When stating a number, cite its source using inline format [Source]. Examples: "$352,583M [XBRL:Assets]", "D/E 0.8x [computed]".
- If data is missing or estimated, say "Not found in extract" or "Estimated".

ANALYSIS DEPTH:
- Provide thorough, actionable analysis — 2–4 sentences per insight. Avoid one-line answers.
- Include industry benchmarks: D/E (tech 0.3–1, utilities 1–1.5, financials 2–4); payout (<60% NI conservative, >80% stretched); interest coverage (>8x strong, <2x concern); net debt/EBITDA (<1x low, >4x stressed).
- Structure answers with headers (##) and bullet points for readability.
- Always close with a recommended next action or decision.

${body.context ? `Current analysis (JSON, values in USD millions):\n${body.context.slice(0, 28000)}` : "No structured analysis attached yet (user may ask general questions)."}${langRule}`;

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
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? res.statusText },
        { status: res.status }
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;
    return NextResponse.json({ message: text, usage });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Model provider error" },
      { status: 502 }
    );
  }
}

async function handleAutoSummary(apiKey: string, model: string, context: string, langRule: string) {
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
- No generic filler. Every sentence should add value.${langRule}${langRule ? "\n- Keep the same section order and markdown structure above, but translate the section headings themselves." : ""}`;

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
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? res.statusText },
        { status: res.status }
      );
    }

    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    const usage: TokenUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;
    return NextResponse.json({ message: text, usage });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Model provider error" },
      { status: 502 }
    );
  }
}
