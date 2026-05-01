import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractionResult = {
  sessionTitle: string;
  companyFocus: string;
  quarter: string;
  summary: string;
  executiveTakeaway: string;
  growth: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  profitability: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  investment: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  riskAnalysis: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  demandSignals: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  keySignals: Array<{
    theme: string;
    insight: string;
    investorRelevance: string;
    confidence: "high" | "medium" | "low";
  }>;
  macroSignals: string[];
  competitorMentions: string[];
  risks: Array<{ risk: string; severity: "high" | "medium" | "low"; why: string }>;
  opportunities: Array<{ opportunity: string; timeHorizon: "near-term" | "mid-term" | "long-term"; why: string }>;
  managementTone: {
    tone: "confident" | "defensive" | "mixed" | "uncertain";
    specificity: "high" | "medium" | "low";
    evidence: string[];
  };
  changeDetection: {
    newThisQuarter: string[];
    stoppedTalkingAbout: string[];
    priorityShift: string;
  };
  investorBrain: {
    biggestWorry: string;
    bearCase30Drawdown: string[];
    bullCaseDouble: string[];
    growthCycleStage: "early" | "mid" | "late" | "uncertain";
    storyVsMachine: "story" | "proven-machine" | "mixed";
  };
  watchList: string[];
  extractedMetrics: Array<{ metric: string; value: string; context: string }>;
  generatedAt: string;
  source: "yahoo-finance-script" | "earnings-call-transcript" | "user-input";
  rawScriptPreview: string;
  slides?: {
    resultsVsExpectations?: {
      chartData: Array<{ metric: string; actual: number | null; estimate: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    growthBreakdown?: {
      companyAverageGrowthPct: number | null;
      chartData: Array<{ metric: string; growthPct: number | null; prevQuarterGrowthPct: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    profitabilityAndCash?: {
      chartData: Array<{ step: string; value: number | null }>;
      capex: { value: number | null; label: string };
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    risksAndSentiment?: {
      insight: string;
      bullets: string[];
      managementTone: "confident" | "defensive" | "cautious" | "mixed" | "uncertain";
      supportingQuotes?: string[];
    };
    forwardView?: {
      chartData: Array<{ metric: string; low: number | null; high: number | null; priorGuidanceMid: number | null; actual: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
      finalSentence?: string;
      bullCase?: string[];
      bearCase?: string[];
    };
  };
};

const EXTRACTION_PROMPT = `You are a senior equity research analyst and data visualization strategist.
Analyze an earnings script and produce insight-driven output in EXACTLY 5 sections.
Do NOT summarize the call. Focus on business drivers, financial implications, and investment meaning.

Required JSON shape:
{
  "sessionTitle": "string",
  "companyFocus": "string",
  "quarter": "string",
  "summary": "string",
  "executiveTakeaway": "string",
  "growth": [{"finding":"string","metric":"string","context":"string","investorImplication":"string"}],
  "profitability": [{"finding":"string","metric":"string","context":"string","investorImplication":"string"}],
  "investment": [{"finding":"string","metric":"string","context":"string","investorImplication":"string"}],
  "riskAnalysis": [{"finding":"string","metric":"string","context":"string","investorImplication":"string"}],
  "demandSignals": [{"finding":"string","metric":"string","context":"string","investorImplication":"string"}],
  "keySignals": [{"theme":"string","insight":"string","investorRelevance":"string","confidence":"high|medium|low"}],
  "macroSignals": ["string"],
  "competitorMentions": ["string"],
  "risks": [{"risk":"string","severity":"high|medium|low","why":"string"}],
  "opportunities": [{"opportunity":"string","timeHorizon":"near-term|mid-term|long-term","why":"string"}],
  "managementTone": {
    "tone":"confident|defensive|mixed|uncertain",
    "specificity":"high|medium|low",
    "evidence":["string"]
  },
  "changeDetection": {
    "newThisQuarter":["string"],
    "stoppedTalkingAbout":["string"],
    "priorityShift":"string"
  },
  "investorBrain": {
    "biggestWorry":"string",
    "bearCase30Drawdown":["string"],
    "bullCaseDouble":["string"],
    "growthCycleStage":"early|mid|late|uncertain",
    "storyVsMachine":"story|proven-machine|mixed"
  },
  "watchList": ["string"],
  "extractedMetrics": [{"metric":"string","value":"string","context":"string"}],
  "slides": {
    "resultsVsExpectations": {
      "chartData": [{"metric":"Revenue|EPS|Cloud Revenue|Operating Income","actual":"number|null","estimate":"number|null"}],
      "insight":"string",
      "bullets":["string","string","string"],
      "supportingQuotes":["string","string","string"]
    },
    "growthBreakdown": {
      "companyAverageGrowthPct":"number|null",
      "chartData":[{"metric":"Cloud|Productivity|Copilot seats|Fabric|Azure","growthPct":"number|null","prevQuarterGrowthPct":"number|null"}],
      "insight":"string",
      "bullets":["string","string","string"],
      "supportingQuotes":["string","string","string"]
    },
    "profitabilityAndCash": {
      "chartData":[{"step":"Revenue|Gross Profit|Operating Income|Net Income|FCF","value":"number|null"}],
      "capex":{"value":"number|null","label":"string"},
      "insight":"string",
      "bullets":["string","string","string"],
      "supportingQuotes":["string","string","string"]
    },
    "risksAndSentiment": {
      "insight":"string",
      "bullets":["string","string","string"],
      "managementTone":"confident|defensive|cautious|mixed|uncertain",
      "supportingQuotes":["string","string","string"]
    },
    "forwardView": {
      "chartData":[{"metric":"Revenue|COGS|OpEx","low":"number|null","high":"number|null","priorGuidanceMid":"number|null","actual":"number|null"}],
      "insight":"string",
      "bullets":["string","string","string"],
      "supportingQuotes":["string","string","string"],
      "finalSentence":"[Company] is [strategic action], driven by [key growth drivers], while facing [key risks/tradeoffs].",
      "bullCase":["string","string","string"],
      "bearCase":["string","string","string"]
    }
  }
}

Rules:
- Tone: top-tier sell-side analyst.
- Every sentence must include causality (driven by / reflecting / due to / supported by) or financial implication (margins, growth sustainability, valuation, risk, capital efficiency).
- Prohibit generic phrases ("strong performance", "solid growth", "positive results") unless followed by a causal/financial explanation.
- Each tab must be concise and analytical:
  - Results & Expectations: 2-4 sentences + one takeaway.
  - Growth Breakdown: 3-4 sentences.
  - Profitability & Cash: 3-4 sentences.
  - Risks & Sentiment: 3-4 sentences.
  - Forward View: 3-4 sentences + finalSentence.
- For bullCase and bearCase: 2-3 bullets each, and each bullet must include both driver and financial implication.
- Each tab must include 2-3 short supportingQuotes sourced from transcript phrasing when available.
- Use numbers whenever possible; if unavailable set null/empty arrays and do not hallucinate.
- Output JSON only, no markdown.`;

function parseJsonLoose(content: string): ExtractionResult | null {
  try {
    return JSON.parse(content) as ExtractionResult;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ExtractionResult;
    } catch {
      return null;
    }
  }
}

function deriveCompanyAndQuarter(script: string): { company: string; quarter: string } {
  const compact = script.replace(/\s+/g, " ").trim();
  const companyMatch =
    compact.match(/\b([A-Z][A-Za-z&.\- ]{2,40})\s*\((?:NASDAQ|NYSE)?\s*:?([A-Z]{1,6})\)/) ??
    compact.match(/\b([A-Z][A-Za-z&.\- ]{2,40})\s+(?:Q[1-4]|FY)\s*\d{2,4}\b/) ??
    compact.match(/\b([A-Z][A-Za-z&.\- ]{2,40})\s+(?:Corporation|Inc\.?|Ltd\.?|Company)\b/);
  const quarterMatch =
    compact.match(/\bQ([1-4])\s*(?:FY)?\s*(20\d{2}|\d{2})\b/i) ??
    compact.match(/\b(FY)\s*(20\d{2}|\d{2})\b/i) ??
    compact.match(/\b(First|Second|Third|Fourth)\s+Quarter\s+(20\d{2})\b/i);

  const company = companyMatch?.[1]?.trim() || "Unknown company";
  let quarter = "Unspecified period";
  if (quarterMatch) {
    if (/^q/i.test(quarterMatch[0])) {
      const y = quarterMatch[2]?.length === 2 ? `20${quarterMatch[2]}` : quarterMatch[2];
      quarter = `Q${quarterMatch[1]} ${y}`;
    } else if (/^fy/i.test(quarterMatch[1] ?? "")) {
      const y = quarterMatch[2]?.length === 2 ? `20${quarterMatch[2]}` : quarterMatch[2];
      quarter = `FY ${y}`;
    } else {
      const map: Record<string, string> = { first: "Q1", second: "Q2", third: "Q3", fourth: "Q4" };
      const q = map[(quarterMatch[1] || "").toLowerCase()] ?? "Quarter";
      quarter = `${q} ${quarterMatch[2]}`;
    }
  }
  return { company, quarter };
}

function synthTakeaway(result: Partial<ExtractionResult>): string {
  const g = result.growth?.[0]?.finding;
  const p = result.profitability?.[0]?.finding;
  const r = result.riskAnalysis?.[0]?.finding ?? result.risks?.[0]?.risk;
  const parts = [g, p, r ? `Key risk remains ${r.toLowerCase()}` : null].filter(Boolean);
  if (parts.length) return parts.join(", reflecting a mixed but investable setup.");
  return "Performance trajectory is driven by disclosed operating trends, implying selective upside with execution-dependent risk.";
}

function normalizeScript(script: string): string {
  return script.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function firstMatch(script: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = script.match(p);
    if (m) return m;
  }
  return null;
}

function extractHeuristicMetrics(script: string): Array<{ metric: string; value: string; context: string }> {
  const text = normalizeScript(script);
  const defs: Array<{ metric: string; patterns: RegExp[] }> = [
    {
      metric: "Revenue",
      patterns: [
        /\brevenue(?:\s+\w+){0,6}?\s(?:was|of|at|to)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m)?/i,
        /\bnet sales(?:\s+\w+){0,6}?\s(?:was|of|at|to)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m)?/i,
      ],
    },
    {
      metric: "EPS",
      patterns: [
        /\bearnings per share(?:\s+\w+){0,4}?\s(?:was|of|at|to)\s*\$?\s?([\d.,]+)/i,
        /\bEPS(?:\s+\w+){0,4}?\s(?:was|of|at|to)\s*\$?\s?([\d.,]+)/i,
      ],
    },
    {
      metric: "Operating Income",
      patterns: [
        /\boperating income(?:\s+\w+){0,5}?\s(?:was|of|at|to|rose)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m|%)?/i,
      ],
    },
    {
      metric: "Cloud Revenue",
      patterns: [
        /\bcloud revenue(?:\s+\w+){0,6}?\s(?:was|of|at|to|surpassed)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m)?/i,
      ],
    },
    {
      metric: "CapEx",
      patterns: [
        /\b(?:capex|capital expenditures?)(?:\s+\w+){0,6}?\s(?:was|of|at|to|reached)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m)?/i,
      ],
    },
    {
      metric: "Bookings Growth",
      patterns: [/\bbookings(?:\s+\w+){0,4}?\s(?:up|grew|growth)\s*([\d.,]+)\s*%/i],
    },
    {
      metric: "RPO / Backlog",
      patterns: [/\b(?:RPO|backlog)(?:\s+\w+){0,6}?\s(?:was|of|at|to)\s*\$?\s?([\d.,]+)\s*(billion|million|bn|m)?/i],
    },
    {
      metric: "Guidance Revenue Low",
      patterns: [/\b(?:expects?|guidance|outlook)(?:\s+\w+){0,20}?\$?\s?([\d.,]+)\s*(billion|million|bn|m)\s+to\s+\$?\s?([\d.,]+)\s*(billion|million|bn|m)/i],
    },
  ];

  const out: Array<{ metric: string; value: string; context: string }> = [];
  for (const def of defs) {
    const m = firstMatch(text, def.patterns);
    if (!m) continue;
    if (def.metric === "Guidance Revenue Low") {
      out.push({ metric: "Guidance Revenue Low", value: `${m[1]} ${m[2] ?? ""}`.trim(), context: m[0].slice(0, 160) });
      out.push({ metric: "Guidance Revenue High", value: `${m[3]} ${m[4] ?? m[2] ?? ""}`.trim(), context: m[0].slice(0, 160) });
      continue;
    }
    const val = `${m[1]} ${m[2] ?? ""}`.trim();
    out.push({ metric: def.metric, value: val, context: m[0].slice(0, 160) });
  }
  return out;
}

function mergeWithHeuristics(result: Partial<ExtractionResult>, script: string): Partial<ExtractionResult> {
  const heurMetrics = extractHeuristicMetrics(script);
  const mergedMetrics = (result.extractedMetrics && result.extractedMetrics.length > 0)
    ? result.extractedMetrics
    : heurMetrics;

  const getMetric = (name: string) => mergedMetrics.find((m) => m.metric.toLowerCase() === name.toLowerCase())?.value ?? "";
  const revenue = getMetric("Revenue");
  const eps = getMetric("EPS");
  const opIncome = getMetric("Operating Income");
  const capex = getMetric("CapEx");
  const bookings = getMetric("Bookings Growth");
  const backlog = getMetric("RPO / Backlog");
  const guideLow = getMetric("Guidance Revenue Low");
  const guideHigh = getMetric("Guidance Revenue High");

  const growth =
    result.growth && result.growth.length > 0
      ? result.growth
      : revenue
        ? [{
            finding: `Revenue trajectory remains supported by reported top-line scale of ${revenue}.`,
            metric: `Revenue ${revenue}`,
            context: "Heuristic fallback extraction",
            investorImplication: "Sustained top-line scale supports forward revenue visibility if demand persists.",
          }]
        : [];

  const profitability =
    result.profitability && result.profitability.length > 0
      ? result.profitability
      : (eps || opIncome)
        ? [{
            finding: `Profit conversion remains linked to EPS ${eps || "N/A"} and operating income ${opIncome || "N/A"}.`,
            metric: `EPS ${eps || "N/A"} | Op Income ${opIncome || "N/A"}`,
            context: "Heuristic fallback extraction",
            investorImplication: "Profit trajectory influences valuation durability through margin conversion quality.",
          }]
        : [];

  const investment =
    result.investment && result.investment.length > 0
      ? result.investment
      : capex
        ? [{
            finding: `Investment intensity is driven by capex of ${capex}, implying ongoing infrastructure commitment.`,
            metric: `CapEx ${capex}`,
            context: "Heuristic fallback extraction",
            investorImplication: "Higher capex can support long-term growth while pressuring near-term free cash flow.",
          }]
        : [];

  const demandSignals =
    result.demandSignals && result.demandSignals.length > 0
      ? result.demandSignals
      : (bookings || backlog)
        ? [{
            finding: `Demand visibility is supported by bookings ${bookings || "N/A"} and backlog/RPO ${backlog || "N/A"}.`,
            metric: `Bookings ${bookings || "N/A"} | Backlog ${backlog || "N/A"}`,
            context: "Heuristic fallback extraction",
            investorImplication: "Demand backlog supports near-term revenue conversion if execution remains consistent.",
          }]
        : [];

  const riskAnalysis =
    result.riskAnalysis && result.riskAnalysis.length > 0
      ? result.riskAnalysis
      : [{
          finding: "Risk profile remains sensitive to execution and investment payback timing due to uneven disclosure detail.",
          metric: "Disclosure variance",
          context: "Heuristic fallback risk synthesis",
          investorImplication: "Lower disclosure consistency can widen estimate dispersion and valuation uncertainty.",
        }];

  const slides = {
    ...result.slides,
    resultsVsExpectations: {
      chartData: result.slides?.resultsVsExpectations?.chartData?.length
        ? result.slides.resultsVsExpectations.chartData
        : [
            { metric: "Revenue", actual: revenue ? Number.parseFloat(revenue.replace(/[^\d.-]/g, "")) || null : null, estimate: null },
            { metric: "EPS", actual: eps ? Number.parseFloat(eps.replace(/[^\d.-]/g, "")) || null : null, estimate: null },
            { metric: "Operating Income", actual: opIncome ? Number.parseFloat(opIncome.replace(/[^\d.-]/g, "")) || null : null, estimate: null },
          ],
      insight: result.slides?.resultsVsExpectations?.insight ?? "",
      bullets: result.slides?.resultsVsExpectations?.bullets ?? [],
    },
    forwardView: {
      chartData: result.slides?.forwardView?.chartData?.length
        ? result.slides.forwardView.chartData
        : [
            {
              metric: "Revenue",
              low: guideLow ? Number.parseFloat(guideLow.replace(/[^\d.-]/g, "")) || null : null,
              high: guideHigh ? Number.parseFloat(guideHigh.replace(/[^\d.-]/g, "")) || null : null,
              priorGuidanceMid: null,
              actual: revenue ? Number.parseFloat(revenue.replace(/[^\d.-]/g, "")) || null : null,
            },
          ],
      insight: result.slides?.forwardView?.insight ?? "",
      bullets: result.slides?.forwardView?.bullets ?? [],
      finalSentence: result.slides?.forwardView?.finalSentence,
      bullCase: result.slides?.forwardView?.bullCase ?? [],
      bearCase: result.slides?.forwardView?.bearCase ?? [],
    },
  };

  return {
    ...result,
    extractedMetrics: mergedMetrics,
    growth,
    profitability,
    investment,
    demandSignals,
    riskAnalysis,
    slides,
  };
}

function withFallback(result: Partial<ExtractionResult>, script: string): ExtractionResult {
  const inferred = deriveCompanyAndQuarter(script);
  const executive = result.executiveTakeaway?.trim() || synthTakeaway(result);
  const summary = result.summary?.trim() || executive;
  return {
    sessionTitle: result.sessionTitle?.trim() || "Earnings Script Analysis",
    companyFocus: result.companyFocus?.trim() || inferred.company,
    quarter: result.quarter?.trim() || inferred.quarter,
    summary,
    executiveTakeaway: executive,
    growth: Array.isArray(result.growth) ? result.growth : [],
    profitability: Array.isArray(result.profitability) ? result.profitability : [],
    investment: Array.isArray(result.investment) ? result.investment : [],
    riskAnalysis: Array.isArray(result.riskAnalysis) ? result.riskAnalysis : [],
    demandSignals: Array.isArray(result.demandSignals) ? result.demandSignals : [],
    keySignals: Array.isArray(result.keySignals) ? result.keySignals : [],
    macroSignals: Array.isArray(result.macroSignals) ? result.macroSignals : [],
    competitorMentions: Array.isArray(result.competitorMentions) ? result.competitorMentions : [],
    risks: Array.isArray(result.risks) ? result.risks : [],
    opportunities: Array.isArray(result.opportunities) ? result.opportunities : [],
    managementTone: result.managementTone ?? { tone: "uncertain", specificity: "low", evidence: [] },
    changeDetection: result.changeDetection ?? { newThisQuarter: [], stoppedTalkingAbout: [], priorityShift: "" },
    investorBrain: result.investorBrain ?? {
      biggestWorry: "",
      bearCase30Drawdown: [],
      bullCaseDouble: [],
      growthCycleStage: "uncertain",
      storyVsMachine: "mixed",
    },
    watchList: Array.isArray(result.watchList) ? result.watchList : [],
    extractedMetrics: Array.isArray(result.extractedMetrics) ? result.extractedMetrics : [],
    generatedAt: new Date().toISOString(),
    source: "user-input",
    rawScriptPreview: script.slice(0, 12000),
    slides: {
      resultsVsExpectations: {
        chartData: result.slides?.resultsVsExpectations?.chartData ?? [],
        insight: result.slides?.resultsVsExpectations?.insight?.trim() || summary,
        bullets: result.slides?.resultsVsExpectations?.bullets ?? [],
        supportingQuotes: result.slides?.resultsVsExpectations?.supportingQuotes ?? [],
      },
      growthBreakdown: {
        companyAverageGrowthPct: result.slides?.growthBreakdown?.companyAverageGrowthPct ?? null,
        chartData: result.slides?.growthBreakdown?.chartData ?? [],
        insight: result.slides?.growthBreakdown?.insight?.trim() || result.growth?.[0]?.investorImplication || summary,
        bullets: result.slides?.growthBreakdown?.bullets ?? [],
        supportingQuotes: result.slides?.growthBreakdown?.supportingQuotes ?? [],
      },
      profitabilityAndCash: {
        chartData: result.slides?.profitabilityAndCash?.chartData ?? [],
        capex: result.slides?.profitabilityAndCash?.capex ?? { value: null, label: "CapEx" },
        insight: result.slides?.profitabilityAndCash?.insight?.trim() || result.profitability?.[0]?.investorImplication || summary,
        bullets: result.slides?.profitabilityAndCash?.bullets ?? [],
        supportingQuotes: result.slides?.profitabilityAndCash?.supportingQuotes ?? [],
      },
      risksAndSentiment: {
        insight: result.slides?.risksAndSentiment?.insight?.trim() || result.riskAnalysis?.[0]?.investorImplication || summary,
        bullets: result.slides?.risksAndSentiment?.bullets ?? [],
        managementTone: result.slides?.risksAndSentiment?.managementTone ?? "uncertain",
        supportingQuotes: result.slides?.risksAndSentiment?.supportingQuotes ?? [],
      },
      forwardView: {
        chartData: result.slides?.forwardView?.chartData ?? [],
        insight: result.slides?.forwardView?.insight?.trim() || result.changeDetection?.priorityShift || summary,
        bullets: result.slides?.forwardView?.bullets ?? [],
        supportingQuotes: result.slides?.forwardView?.supportingQuotes ?? [],
        finalSentence:
          result.slides?.forwardView?.finalSentence?.trim() ||
          `${inferred.company} is prioritizing strategic execution, driven by operating momentum, while facing margin and concentration tradeoffs.`,
        bullCase: result.slides?.forwardView?.bullCase ?? [],
        bearCase: result.slides?.forwardView?.bearCase ?? [],
      },
    },
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured." }, { status: 503 });
  }

  let body: { script?: string; text?: string; sourceHint?: ExtractionResult["source"] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const script = (body.script?.trim() || body.text?.trim() || "");
  if (script.length < 120) {
    return NextResponse.json({ error: "Script is too short. Please paste a fuller transcript." }, { status: 400 });
  }

  try {
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: `Analyze this earnings script:\n\n${script.slice(0, 45000)}` },
        ],
      }),
    });

    const data = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message ?? `HTTP ${response.status}` }, { status: response.status });
    }

    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseJsonLoose(content);
    if (!parsed) {
      const fallback = withFallback(mergeWithHeuristics({}, script), script);
      if (body.sourceHint) fallback.source = body.sourceHint;
      return NextResponse.json({ analysis: fallback });
    }

    const merged = withFallback(mergeWithHeuristics(parsed, script), script);
    if (body.sourceHint) merged.source = body.sourceHint;
    return NextResponse.json({ analysis: merged });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze earnings script." },
      { status: 502 }
    );
  }
}

