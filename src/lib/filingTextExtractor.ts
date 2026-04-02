/**
 * Fetches the actual 10-Q/10-K HTML filing from SEC EDGAR,
 * then uses OpenAI to extract notable footnotes and non-GAAP adjusted metrics.
 */

import type { FootnoteItem, AdjustedMetric, EarningsNarrative } from "@/types/analysis";
import type { SegmentData, VolumeUnitType } from "@/types/segments";

const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT ??
  "DividendAnalyzer/1.0 (your-email@example.com)";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";

// ---------------------------------------------------------------------------
// 1. Fetch the actual filing document from SEC EDGAR
// ---------------------------------------------------------------------------

interface SubmissionsRecent {
  accessionNumber: string[];
  primaryDocument: string[];
  form: string[];
  reportDate: string[];
}

export interface FilingDocResult {
  text: string;
  accessionNumber: string;
  primaryDocument: string;
  reportDate: string;
  form: string;
}

export async function fetchLatestFilingText(
  cik: string
): Promise<FilingDocResult | null> {
  try {
    // Get submissions list
    const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const subResp = await fetch(subUrl, {
      headers: { "User-Agent": SEC_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!subResp.ok) return null;

    const sub = (await subResp.json()) as {
      filings: { recent: SubmissionsRecent };
    };
    const recent = sub.filings?.recent;
    if (!recent) return null;

    // Find latest 10-Q (prefer 10-Q over 10-K)
    const idx10Q = recent.form.findIndex((f) => f === "10-Q");
    const idx10K = recent.form.findIndex((f) => f === "10-K");
    const idx = idx10Q !== -1 ? idx10Q : idx10K;
    if (idx === -1) return null;

    const accessionNumber = recent.accessionNumber[idx];
    const primaryDocument = recent.primaryDocument[idx];
    const reportDate = recent.reportDate[idx] ?? "";
    const form = recent.form[idx];

    if (!accessionNumber || !primaryDocument) return null;

    // Build EDGAR document URL
    const cikInt = parseInt(cik, 10);
    const accPath = accessionNumber.replace(/-/g, "");
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accPath}/${primaryDocument}`;

    const docResp = await fetch(docUrl, {
      headers: { "User-Agent": SEC_UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!docResp.ok) return null;

    const html = await docResp.text();
    const text = stripHtml(html);

    return { text, accessionNumber, primaryDocument, reportDate, form };
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// 2. Extract targeted sections (footnotes + non-GAAP) from plain text
// ---------------------------------------------------------------------------

interface TargetedSections {
  noteSections: string;
  nonGaapSection: string;
}

function extractTargetedSections(text: string): TargetedSections {
  // Find "Note X —" style headers throughout the document
  const noteRegex =
    /(?:^|\n)\s*(?:NOTE|Note)\s+\d+[\s\-\u2014]+[^\n]{5,80}/gm;
  const noteMatches: Array<{ index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = noteRegex.exec(text)) !== null) {
    noteMatches.push({ index: m.index });
  }

  // Extract up to 10 note sections, 1,200 chars each
  let noteSections = "";
  for (let i = 0; i < Math.min(10, noteMatches.length); i++) {
    const start = noteMatches[i].index;
    const end = noteMatches[i + 1]?.index ?? start + 1500;
    const chunk = text.slice(start, Math.min(end, start + 1500));
    noteSections += chunk + "\n\n---\n\n";
  }

  // Find non-GAAP reconciliation section
  const nonGaapIdx = text.search(
    /non[\s-]?gaap|adjusted\s+(?:ebitda|operating|income|eps|earnings)/i
  );
  const nonGaapSection =
    nonGaapIdx !== -1 ? text.slice(nonGaapIdx, nonGaapIdx + 5000) : "";

  return {
    noteSections: noteSections.slice(0, 9000),
    nonGaapSection,
  };
}

// ---------------------------------------------------------------------------
// 3. AI extraction of footnotes + adjusted metrics
// ---------------------------------------------------------------------------

export async function extractFootnotesAndAdjusted(
  text: string,
  apiKey: string,
  model: string
): Promise<{ footnotes: FootnoteItem[]; adjustedMetrics: AdjustedMetric[] }> {
  const { noteSections, nonGaapSection } = extractTargetedSections(text);

  if (!noteSections && !nonGaapSection) {
    return { footnotes: [], adjustedMetrics: [] };
  }

  const prompt = `You are a financial analyst reading SEC 10-Q/10-K filing excerpts. Extract structured data.

=== FOOTNOTE / NOTES TO FINANCIAL STATEMENTS ===
${noteSections || "(not found)"}

=== NON-GAAP / ADJUSTED METRICS SECTION ===
${nonGaapSection || "(not found)"}

Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "footnotes": [
    {
      "id": "note-1",
      "title": "Short title (max 6 words)",
      "summary": "1-2 sentence summary of key disclosure and why it matters financially",
      "significance": "high",
      "type": "debt"
    }
  ],
  "adjustedMetrics": [
    {
      "name": "Adjusted EBITDA",
      "gaapValue": 1234,
      "adjustments": [
        {"label": "Stock-based compensation", "value": 45},
        {"label": "Restructuring charges", "value": 30}
      ],
      "adjustedValue": 1309,
      "unit": "million",
      "period": "Q3 2024"
    }
  ]
}

Rules:
- footnotes: select 4–7 most important notes. significance="high" for debt covenants, material contingencies, major accounting changes, or segment restructuring. significance="low" for routine disclosures.
- type must be one of: "debt" | "contingency" | "segment" | "accounting-policy" | "tax" | "revenue" | "other"
- adjustedMetrics: include ALL non-GAAP metrics found in reconciliation tables. Values in USD millions. If per-share, use unit="per-share".
- Do NOT hallucinate numbers. If no adjusted metrics are found, return [].
- Return empty arrays if section content is unclear.`;

  try {
    const res = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return { footnotes: [], adjustedMetrics: [] };

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      footnotes?: FootnoteItem[];
      adjustedMetrics?: AdjustedMetric[];
    };

    return {
      footnotes: Array.isArray(parsed.footnotes) ? parsed.footnotes : [],
      adjustedMetrics: Array.isArray(parsed.adjustedMetrics)
        ? parsed.adjustedMetrics
        : [],
    };
  } catch {
    return { footnotes: [], adjustedMetrics: [] };
  }
}

// ---------------------------------------------------------------------------
// 4. Extract earnings narrative from MD&A section
// ---------------------------------------------------------------------------

function extractMdaSection(text: string): string {
  // Find "Management's Discussion and Analysis" or "MD&A" section
  const mdaIdx = text.search(/(?:management[^\n]{0,20}discussion|MD&A|md&a)/i);
  if (mdaIdx === -1) {
    // Fallback: use first 5000 chars if MD&A not found
    return text.slice(0, 5000);
  }
  // Extract up to 8000 chars from MD&A start
  const mdaText = text.slice(mdaIdx, mdaIdx + 8000);
  // Find end of MD&A section (usually marked by next Item number)
  const itemIdx = mdaText.search(/(?:^|\n)\s*Item\s+\d+/i);
  return itemIdx !== -1 ? mdaText.slice(0, itemIdx) : mdaText;
}

export async function extractEarningsNarrative(
  text: string,
  ticker: string,
  apiKey: string,
  model: string
): Promise<EarningsNarrative | null> {
  const mdaText = extractMdaSection(text);

  if (!mdaText || mdaText.length < 500) {
    return null;
  }

  const prompt = `You are a financial analyst extracting earnings insights from an SEC filing MD&A section.

FILING EXCERPT (MD&A):
${mdaText}

Analyze and extract earnings narrative. Return ONLY valid JSON (no markdown):
{
  "result": "Beat expectations|Missed expectations|In line|N/A",
  "summary": "One sentence: if beat/miss, by how much vs consensus. Otherwise, key earnings metric change.",
  "priorGuidance": "Prior quarter/year guidance if mentioned, or null",
  "currentGuidance": "Current guidance for next quarter/year if mentioned, or null",
  "keyThemes": ["Theme 1 (e.g. 'Strong volume growth in pork segment')", "Theme 2", "Theme 3"],
  "tone": "bullish|neutral|cautious|unknown",
  "source": "sec-text"
}

Rules:
- result: Only use "Beat expectations" if explicitly stated or strongly implied (actual > consensus)
- summary: Extract from Results of Operations or Results section. If no beat/miss info, mention key revenue/margin/segment change.
- priorGuidance: Extract from prior quarter discussion if referenced
- currentGuidance: Extract forward-looking guidance for next quarter or full year
- keyThemes: 3–5 bullet points from MD&A describing operational changes, market conditions, or strategic updates relevant to profitability
- tone: bullish (optimistic, growing demand, strong pricing) | cautious (headwinds, margin pressure, weak guidance) | neutral (mixed) | unknown
- Return null fields if information is not available in the text.`;

  try {
    const res = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<EarningsNarrative>;

    if (
      !parsed.result ||
      !parsed.summary ||
      !parsed.keyThemes ||
      !Array.isArray(parsed.keyThemes)
    ) {
      return null;
    }

    return {
      result: parsed.result || "N/A",
      summary: parsed.summary || "",
      priorGuidance: parsed.priorGuidance ?? null,
      currentGuidance: parsed.currentGuidance ?? null,
      keyThemes: parsed.keyThemes.slice(0, 5),
      tone: (parsed.tone as EarningsNarrative["tone"]) || "unknown",
      source: "sec-text",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. Extract segment-level data from SEC filing text
// ---------------------------------------------------------------------------

function extractSegmentSection(text: string): string {
  const patterns = [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
  ];

  for (const re of patterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      return text.slice(idx, idx + 15_000);
    }
  }

  // Fallback: try MD&A which often contains segment breakdowns
  const mdaIdx = text.search(/(?:management[^\n]{0,20}discussion|results\s+of\s+operations)/i);
  if (mdaIdx !== -1) {
    return text.slice(mdaIdx, mdaIdx + 15_000);
  }

  return "";
}

interface SegmentExtractionResult {
  segments: Array<{
    segmentName: string;
    segmentType?: "business" | "channel" | "geography";
    revenue: number | null;
    operatingIncome: number | null;
    depreciation?: number | null;
    capitalExpenditures?: number | null;
    totalAssets?: number | null;
    volumeUnits?: number | null;
    volumeUnitType?: VolumeUnitType | null;
  }>;
  intercompanyEliminations?: { revenue?: number | null; operatingIncome?: number | null };
  corporateAndOther?: { operatingIncome?: number | null };
}

const SEGMENT_EXTRACT_PROMPT = `You are a financial data extraction engine. Extract SEGMENT-LEVEL financial data from this SEC 10-Q/10-K filing text.

Return ONLY valid JSON (no markdown):
{
  "segments": [
    {
      "segmentName": "Beef",
      "segmentType": "business",
      "revenue": 5234,
      "operatingIncome": 123,
      "depreciation": null,
      "capitalExpenditures": null,
      "totalAssets": null,
      "volumeUnits": null,
      "volumeUnitType": null
    }
  ],
  "intercompanyEliminations": {
    "revenue": -500,
    "operatingIncome": -10
  },
  "corporateAndOther": {
    "operatingIncome": -200
  }
}

RULES:
- ALL values in USD millions. If filing uses thousands, divide by 1000.
- Parenthesized numbers (1,234) = NEGATIVE.
- segmentType: "business" for product/division segments (Beef, Pork, Chicken, Prepared Foods), "channel" for distribution channels (Retail, Foodservice), "geography" for regions.
- volumeUnitType: "head" for animals processed/slaughtered, "cwt" for hundredweight, "lbs" for pounds, "cases" for product cases. Set to null if not available.
- volumeUnits: in thousands. E.g. if filing says "8.1 million head", put 8100.
- Include intersegment eliminations and corporate/other if shown as separate line items.
- Extract ALL segments shown in the filing's segment disclosure tables.
- Look for segment data in: "Segment Results", "Operating Segments", "Results of Operations by Segment", notes to financial statements.
- Operating income may be called "segment profit", "segment income", "operating profit", or "income from operations".
- Do NOT invent segments or numbers. Only extract what exists.
- If no segment data is found, return {"segments": []}.`;

export async function extractSegments(
  text: string,
  apiKey: string,
  model: string
): Promise<SegmentData[]> {
  const segText = extractSegmentSection(text);

  if (!segText || segText.length < 300) {
    return [];
  }

  try {
    const res = await fetch(OPENAI_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SEGMENT_EXTRACT_PROMPT },
          { role: "user", content: `Extract segment data:\n\n${segText}` },
        ],
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as SegmentExtractionResult;

    if (!parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      return [];
    }

    const validVolumeTypes = new Set<string>(["head", "cwt", "lbs", "cases"]);

    return parsed.segments.map((seg) => {
      const revenue = seg.revenue != null ? Math.round(Number(seg.revenue)) : null;
      const operatingIncome = seg.operatingIncome != null ? Math.round(Number(seg.operatingIncome)) : null;
      const opMargin = revenue && operatingIncome
        ? Math.round((operatingIncome / revenue) * 1000) / 10
        : null;
      const volType = seg.volumeUnitType && validVolumeTypes.has(seg.volumeUnitType)
        ? seg.volumeUnitType as VolumeUnitType
        : null;
      const volUnits = seg.volumeUnits != null ? Number(seg.volumeUnits) : null;
      const revPerUnit = volUnits && volUnits > 0 && revenue
        ? Math.round((revenue / volUnits) * 100) / 100
        : null;
      const opPerUnit = volUnits && volUnits > 0 && operatingIncome
        ? Math.round((operatingIncome / volUnits) * 100) / 100
        : null;

      return {
        segmentName: seg.segmentName || "Unknown Segment",
        segmentType: (seg.segmentType === "business" || seg.segmentType === "channel" || seg.segmentType === "geography")
          ? seg.segmentType
          : "business" as const,
        revenue,
        costOfRevenue: null,
        grossProfit: null,
        sgaExpense: null,
        operatingIncome,
        operatingMargin: opMargin,
        depreciation: seg.depreciation != null ? Math.round(Number(seg.depreciation)) : null,
        capitalExpenditures: seg.capitalExpenditures != null ? Math.round(Number(seg.capitalExpenditures)) : null,
        totalAssets: seg.totalAssets != null ? Math.round(Number(seg.totalAssets)) : null,
        intercompanyEliminations: null,
        volumeUnits: volUnits,
        volumeUnitType: volType,
        revenuePerUnit: revPerUnit,
        operatingIncomePerUnit: opPerUnit,
      } satisfies SegmentData;
    });
  } catch {
    return [];
  }
}
