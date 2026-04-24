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
  quarter?: string;
  metrics: Record<string, unknown>;
  footnotes?: unknown[];
  nonRecurringItems?: unknown[];
}

export interface CommentaryResponse {
  overallAssessment: string;
  dupont: string | null;
  zScore: string | null;
  piotroski: string | null;
  earningsQuality: string | null;
  ccc: string | null;
  ttmOutlook: string | null;
  capitalStructure: string | null;
  operationalEfficiency: string | null;
  footnoteInsight: string | null;
  valuationComment: string | null;
  keyRisks: string[];
  keyStrengths: string[];
  contradictions: string[];
  forwardImplications: string[];
}

function buildFallbackCommentary(reason?: string): CommentaryResponse {
  const msg = reason
    ? `AI commentary is temporarily unavailable (${reason}). Review the score strip and ratio sections for this quarter while the model connection recovers.`
    : "AI commentary is temporarily unavailable. Review the score strip and ratio sections for this quarter.";
  return {
    overallAssessment: msg,
    dupont: null,
    zScore: null,
    piotroski: null,
    earningsQuality: null,
    ccc: null,
    ttmOutlook: null,
    capitalStructure: null,
    operationalEfficiency: null,
    footnoteInsight: null,
    valuationComment: null,
    keyRisks: [],
    keyStrengths: [],
    contradictions: [],
    forwardImplications: [],
  };
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

  const systemPrompt = `You are a CFO-level financial analyst. You have been given quarterly financial metrics for a company. Your job is to write a structured analysis report that a CFO or senior investor would find immediately useful.

You do not summarize numbers. You interpret what the numbers mean together, find where they conflict, and state the business consequences.

STRICT RULES:
1. Never restate a number without explaining what it means
   BAD: "The Z-Score is 1.77 which is in the distress zone"
   GOOD: "Leverage is the sole driver of distress risk — the underlying business is operationally sound but the capital structure is stretched beyond safe bounds"

2. Find contradictions between metrics and explain the business reason
   Example: Z-Score distress (1.77) + F-Score strong (8/9) = the business generates cash and earns profit, but accumulated debt is the single threat — this is a leverage problem, not an operational one

3. Cross-reference at least 3 metrics before drawing any conclusion
   Example: Low ROE (1.4%) explained by: low net margin (2.0%) + low asset turnover (0.35x) + moderate leverage (2.06x) — the margin and efficiency issues compound each other

4. Flag only material issues — ignore anything below 5% impact threshold

5. State business consequences, not observations
   BAD: "FCF conversion is 212%"
   GOOD: "FCF significantly exceeds net income, suggesting non-cash charges are masking underlying cash generation strength — the business is more cash-generative than GAAP earnings imply"

6. Use QoQ (quarter-over-quarter) when referencing trends — never MoM

7. For forward implications, always attach a number or timeframe
   BAD: "Debt paydown will take a long time"
   GOOD: "At current FCF of $556M, full gross debt retirement would take approximately 19 years absent refinancing — interest coverage of 2.07x leaves minimal buffer against any EBITDA compression"

8. Tone: direct, precise, zero filler words. No "it is worth noting", no "it is important to consider"

9. Each section comment must be 1-2 sentences maximum

10. keyRisks and keyStrengths: 2-4 bullets each. Each bullet must contain a specific number

11. contradictions: 0-3 bullets only. Only include real conflicts where two metrics tell genuinely different stories. If no real contradictions exist, return []

12. forwardImplications: 2-4 bullets. Each must contain a number, ratio, or timeframe derived from the actual metrics

13. If a metric is null or missing, return null for that field — do not invent data

14. Return ONLY valid JSON — absolutely no markdown, no code fences, no preamble, no explanation outside the JSON object`;

  const userPrompt = `Company: ${body.ticker} ${body.companyName ?? ""}
Quarter: ${body.quarter ?? "N/A"}

FINANCIAL METRICS:
${JSON.stringify(body.metrics ?? {}, null, 2)}

FOOTNOTES (high and medium significance only):
${JSON.stringify(body.footnotes ?? [], null, 2)}

NON-RECURRING ITEMS (material only, >5% revenue impact):
${JSON.stringify(body.nonRecurringItems ?? [], null, 2)}

Return this exact JSON structure with no extra fields and no missing fields:
{
  "overallAssessment": "2-3 sentences. Lead with the single biggest finding. Connect the top risk to the top strength. End with what the CFO should watch most closely this quarter.",
  "dupont": "What is driving ROE — is it margins, asset efficiency, or leverage? Which factor is the primary drag and why does it matter operationally?",
  "zScore": "What is causing the Z-Score result — which of the 5 components is the main driver? Is this an operational risk or a structural/leverage risk?",
  "piotroski": "What does this F-Score mean in practice — which signal failed and is that failure improving or worsening? Is the score directionally improving?",
  "earningsQuality": "Are reported earnings backed by real cash or driven by accruals? What does the OCF/NI ratio imply about earnings sustainability?",
  "ccc": "Is working capital management efficient? Is the cash cycle a source of cash or a use of cash? Any red flags in DSO or DIO trends?",
  "ttmOutlook": "What is the TTM trajectory — are margins expanding or compressing QoQ? Is revenue growth outpacing or lagging cost growth?",
  "capitalStructure": "What is the debt situation — is coverage adequate, is there refinancing risk, and is leverage trending up or down? State the business consequence of the current leverage level.",
  "operationalEfficiency": "What does asset turnover tell us about how hard the asset base is working? Is working capital a drag on returns? Connect efficiency to the DuPont result.",
  "footnoteInsight": "What is the single most material risk disclosed in the footnotes that does not appear in the headline numbers? What should the CFO monitor? Return null if no footnotes provided.",
  "valuationComment": "Given the fundamentals — margins, FCF yield, leverage — do the current valuation multiples look stretched, fair, or cheap? What would need to change to justify the current multiple? Return null if no market cap data available.",
  "keyRisks": ["specific risk with the actual number that supports it"],
  "keyStrengths": ["specific strength with the actual number that supports it"],
  "contradictions": ["Metric A (value) conflicts with Metric B (value) — the business reason is X"],
  "forwardImplications": ["implication with specific number or timeframe derived from the metrics"]
}`;

  try {
    const models = ["gpt-4o", "gpt-4o-mini"];
    let res: Response | null = null;

    for (const model of models) {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      // On quota/rate-limit, try the next model.
      if (res.status === 429) continue;
      break;
    }

    if (!res) {
      return NextResponse.json(buildFallbackCommentary("no response from OpenAI"), { status: 200 });
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let detail = "OpenAI call failed";
      try {
        const parsed = JSON.parse(raw) as { error?: { message?: string } };
        detail = parsed.error?.message || detail;
      } catch {
        if (raw) detail = raw.slice(0, 300);
      }
      return NextResponse.json(buildFallbackCommentary(detail), { status: 200 });
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<CommentaryResponse>;
    const normalized: CommentaryResponse = {
      overallAssessment: parsed.overallAssessment ?? "",
      dupont: parsed.dupont ?? null,
      zScore: parsed.zScore ?? null,
      piotroski: parsed.piotroski ?? null,
      earningsQuality: parsed.earningsQuality ?? null,
      ccc: parsed.ccc ?? null,
      ttmOutlook: parsed.ttmOutlook ?? null,
      capitalStructure: parsed.capitalStructure ?? null,
      operationalEfficiency: parsed.operationalEfficiency ?? null,
      footnoteInsight: parsed.footnoteInsight ?? null,
      valuationComment: parsed.valuationComment ?? null,
      keyRisks: Array.isArray(parsed.keyRisks) ? parsed.keyRisks : [],
      keyStrengths: Array.isArray(parsed.keyStrengths) ? parsed.keyStrengths : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      forwardImplications: Array.isArray(parsed.forwardImplications) ? parsed.forwardImplications : [],
    };

    return NextResponse.json(normalized);
  } catch (e) {
    return NextResponse.json(buildFallbackCommentary(e instanceof Error ? e.message : "unknown error"), { status: 200 });
  }
}
