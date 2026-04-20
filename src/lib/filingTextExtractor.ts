/**
 * Fetches the actual 10-Q/10-K HTML filing from SEC EDGAR,
 * then uses OpenAI to extract notable footnotes and non-GAAP adjusted metrics.
 */

import type { FootnoteItem, AdjustedMetric, EarningsNarrative, NonRecurringItem } from "@/types/analysis";
import type { SegmentData, VolumeUnitType } from "@/types/segments";
import { callChatCompletion, safeJsonParse } from "@/lib/openai/chatJsonRunner";
import { debugLog, warnLog } from "@/lib/debugLogger";

const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT ??
  "DividendAnalyzer/1.0 (your-email@example.com)";

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
    // Remove style and script blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    // Preserve table structure: add delimiters around cells/rows
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/th\s*>/gi, " | ")
    .replace(/<\/td\s*>/gi, " | ")
    .replace(/<tr[^>]*>/gi, "")
    .replace(/<th[^>]*>/gi, "")
    .replace(/<td[^>]*>/gi, "")
    // Preserve line breaks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    // Remove all remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#8212;/g, "—")
    .replace(/&#8211;/g, "–")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Clean up whitespace but preserve table pipe delimiters
    .replace(/[ \t]+/g, " ")
    .replace(/ *\| */g, " | ")
    .replace(/\n{4,}/g, "\n\n\n")
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
    const call = await callChatCompletion({
      step: "filing:footnotes-adjusted",
      apiKey,
      model,
      userContent: prompt,
      temperature: 0.1,
      maxTokens: 2500,
      timeoutMs: 45_000,
    });
    if (call.error || !call.content) return { footnotes: [], adjustedMetrics: [] };

    const parsed = safeJsonParse(call.content, {} as { footnotes?: FootnoteItem[]; adjustedMetrics?: AdjustedMetric[] });

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
    const call = await callChatCompletion({
      step: "filing:earnings-narrative",
      apiKey,
      model,
      userContent: prompt,
      temperature: 0.2,
      maxTokens: 1500,
      timeoutMs: 45_000,
    });
    if (call.error || !call.content) return null;

    const parsed = safeJsonParse(call.content, {} as Partial<EarningsNarrative>);

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
  const sections: string[] = [];

  // Pattern 1: Explicit segment section headers
  const segPatterns = [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
  ];
  for (const re of segPatterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      sections.push(text.slice(Math.max(0, idx - 200), idx + 20_000));
      break;
    }
  }

  // Pattern 2: Note about segments in financial statements
  const noteIdx = text.search(/note\s+\d+[^\n]*segment/i);
  if (noteIdx !== -1) {
    sections.push(text.slice(noteIdx, noteIdx + 15_000));
  }

  // Pattern 3: Tables with segment names (Beef, Pork, Chicken, Prepared)
  const segTableIdx = text.search(/(?:beef|pork|chicken|prepared\s+foods?|international)[^\n]*\|[^\n]*\d/i);
  if (segTableIdx !== -1) {
    // Go back to find the table header
    const startIdx = Math.max(0, segTableIdx - 500);
    sections.push(text.slice(startIdx, segTableIdx + 10_000));
  }

  // Pattern 4: MD&A with segment breakdowns
  const mdaIdx = text.search(/(?:management[^\n]{0,20}discussion|results\s+of\s+operations)/i);
  if (mdaIdx !== -1 && sections.length === 0) {
    sections.push(text.slice(mdaIdx, mdaIdx + 25_000));
  }

  if (sections.length === 0) return "";

  // Combine all found sections, deduplicated by taking unique chunks
  const combined = sections.join("\n\n---SECTION BREAK---\n\n");
  // Limit total length to avoid token limits
  return combined.slice(0, 40_000);
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

The text may contain pipe-delimited tables like:
  Beef | 5,234 | 123 | 2.3%
  Pork | 1,456 | (89) | (6.1%)

Or plain text tables with spaces. Read the COLUMN HEADERS to determine which numbers are revenue vs operating income vs other metrics.

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

CRITICAL RULES:
- ALL values in USD millions. If filing uses "in thousands" or "(in thousands)", divide by 1000. If billions, multiply by 1000.
- Parenthesized numbers like (1,234) = NEGATIVE values.
- Remove commas from numbers: "5,234" → 5234.
- Tables may have multiple periods (columns). Extract the MOST RECENT period only (usually the first data column or the column for "Three Months Ended [most recent date]").
- segmentType: "business" for product/division segments (Beef, Pork, Chicken, Prepared Foods), "channel" for distribution (Retail, Foodservice), "geography" for regions.
- volumeUnitType: "head" for animals slaughtered, "cwt" for hundredweight, "lbs" for pounds, "cases" for cases. null if not available.
- volumeUnits: in thousands. "8.1 million head" → 8100.
- Look for: "Sales" or "Net Sales" or "Revenue" → revenue field. "Operating Income" or "Segment Profit" or "Income from Operations" → operatingIncome field.
- Include intersegment eliminations and corporate/other if shown.
- Do NOT invent segments or numbers. Only extract what exists in the text.
- If no segment data is found, return {"segments": []}.
- IMPORTANT: If you see segment names but CANNOT find their financial data, still return {"segments": []} rather than segments with all null values.`;

export async function extractSegments(
  text: string,
  apiKey: string,
  model: string
): Promise<SegmentData[]> {
  const segText = extractSegmentSection(text);

  if (!segText || segText.length < 200) {
    debugLog("[extractSegments] No segment section found or too short:", segText.length);
    return [];
  }

  debugLog("[extractSegments] segment text chars:", segText.length);

  try {
    // Truncate to fit token limits (~4 chars/token, 40k chars ≈ 10k tokens)
    const truncated = segText.slice(0, 35_000);

    const call = await callChatCompletion({
      step: "filing:segments",
      apiKey,
      model,
      systemPrompt: SEGMENT_EXTRACT_PROMPT,
      userContent: `Extract segment financial data from this SEC filing text. Pay attention to pipe-delimited tables (|) and column headers.\n\n${truncated}`,
      temperature: 0.1,
      maxTokens: 3000,
      timeoutMs: 45_000,
    });

    if (call.error || !call.content) {
      debugLog("[extractSegments] OpenAI call failed:", call.status, call.error);
      return [];
    }

    const content = call.content;
    debugLog("[extractSegments] AI response length:", content.length);
    const parsed = safeJsonParse(content, {} as SegmentExtractionResult);

    if (!parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      return [];
    }

    const validVolumeTypes = new Set<string>(["head", "cwt", "lbs", "cases"]);

    const results = parsed.segments
      .map((seg) => {
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
      })
      // Filter out segments with NO financial data at all (just names with all nulls)
      .filter(seg => seg.revenue != null || seg.operatingIncome != null);

    debugLog("[extractSegments] Extracted", results.length, "segments with data");
    return results;
  } catch (e) {
    warnLog("[extractSegments] Error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 6. Extract non-recurring / special items for comparability adjustments
// ---------------------------------------------------------------------------

function extractAdjustmentSections(text: string): string {
  const sections: string[] = [];

  // Notes to financial statements — all of them (contains legal, restructuring, impairment)
  const noteRegex = /(?:^|\n)\s*(?:NOTE|Note)\s+\d+[\s\-\u2014]+[^\n]{5,80}/gm;
  const noteMatches: Array<{ index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = noteRegex.exec(text)) !== null) {
    noteMatches.push({ index: m.index });
  }
  for (let i = 0; i < Math.min(15, noteMatches.length); i++) {
    const start = noteMatches[i].index;
    const end = noteMatches[i + 1]?.index ?? start + 3000;
    sections.push(text.slice(start, Math.min(end, start + 3000)));
  }

  // Non-GAAP reconciliation tables
  const nonGaapPatterns = [
    /non[\s-]?gaap.*reconcil/i,
    /adjusted\s+(?:ebitda|operating|income|eps|earnings)/i,
    /reconciliation\s+of\s+(?:gaap|non)/i,
  ];
  for (const re of nonGaapPatterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      sections.push(text.slice(Math.max(0, idx - 200), idx + 8_000));
      break;
    }
  }

  // Special charges / restructuring / impairment sections
  const specialPatterns = [
    /(?:restructuring|impairment|legal|litigation|settlement|antitrust)/i,
    /(?:employee\s+retention\s+credit|erc)/i,
    /(?:gain|loss)\s+on\s+(?:sale|disposal|divestiture)/i,
    /(?:acquisition|merger)[\s-]related/i,
    /(?:insurance|recovery|proceeds)/i,
  ];
  for (const re of specialPatterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      // Get surrounding context
      const start = Math.max(0, idx - 300);
      sections.push(text.slice(start, idx + 3000));
    }
  }

  // MD&A section often discusses non-recurring items
  const mdaIdx = text.search(/management[^\n]{0,20}discussion/i);
  if (mdaIdx !== -1) {
    sections.push(text.slice(mdaIdx, mdaIdx + 15_000));
  }

  return sections.join("\n\n---SECTION---\n\n").slice(0, 50_000);
}

const NON_RECURRING_PROMPT = `You are a forensic financial analyst. Your job is to identify ALL non-recurring, special, or unusual items in this SEC filing that impact comparability of financial results.

These items should be EXCLUDED or ADJUSTED when doing quarter-over-quarter or peer-to-peer comparison.

Return ONLY valid JSON (no markdown):
{
  "items": [
    {
      "label": "Short descriptive label (e.g. 'Antitrust settlement charge')",
      "description": "2-3 sentence description: what happened, which note/section references it, and its P&L impact",
      "amount": 200,
      "impactedLine": "operatingIncome",
      "category": "legal",
      "companyAdjusts": true,
      "adjustDirection": "add-back",
      "confidence": "high",
      "sourceRef": "Note 15 — Commitments and Contingencies"
    }
  ]
}

CATEGORIES TO LOOK FOR:
1. "legal" — Antitrust settlements, litigation charges, legal accruals/reversals
2. "restructuring" — Plant closures, severance, consolidation charges
3. "impairment" — Goodwill/asset impairments, write-downs
4. "gain-loss-disposal" — Gains/losses on sale of businesses, plants, assets
5. "tax-adjustment" — One-time tax benefits/charges (valuation allowance changes, tax reform impacts)
6. "insurance" — Insurance recoveries, fire/flood losses
7. "erc" — Employee Retention Credits (COVID-era, often multi-quarter)
8. "acquisition" — M&A-related costs, integration expenses, purchase accounting adjustments
9. "other" — Any other non-recurring item

RULES:
- amount: In USD millions. POSITIVE = expense/charge (reduces income). NEGATIVE = gain/benefit (increases income).
- impactedLine: Which P&L line is impacted:
  - "operatingIncome" for charges above the operating line (most common)
  - "netIncome" for below-the-line items (tax, interest-related)
  - "revenue" for revenue-related adjustments
  - "cogs" for cost of goods adjustments
  - "sga" for SG&A adjustments
  - "other" if unclear
- adjustDirection: "add-back" means this charge should be ADDED BACK to get comparable operating income (most charges). "subtract" means it should be SUBTRACTED (gains/benefits that inflate income).
- companyAdjusts: true if the company already excludes this in their own non-GAAP measures. false if they include it.
- confidence: "high" if explicit $ amount in filing, "medium" if estimated from context, "low" if inferred.
- sourceRef: The note number or section where you found this item.

IMPORTANT:
- Look at EVERY note for potential items, especially: Commitments/Contingencies, Restructuring, Goodwill, Segment info, Income Taxes, Other Income/Expense.
- Look at the non-GAAP reconciliation table — it lists exactly what the company adjusts.
- Look at MD&A for discussion of unusual items.
- Include ALL items with $amount, even small ones ($1M+).
- Do NOT include recurring items (regular D&A, stock-based comp unless it's unusual).
- If no non-recurring items found, return {"items": []}.`;

export async function extractNonRecurringItems(
  text: string,
  apiKey: string,
  model: string
): Promise<NonRecurringItem[]> {
  const adjustmentText = extractAdjustmentSections(text);

  if (!adjustmentText || adjustmentText.length < 500) {
    return [];
  }

  try {
    const truncated = adjustmentText.slice(0, 45_000);

    const call = await callChatCompletion({
      step: "filing:non-recurring",
      apiKey,
      model,
      systemPrompt: NON_RECURRING_PROMPT,
      userContent: `Identify all non-recurring and special items in this SEC filing:\n\n${truncated}`,
      temperature: 0.1,
      maxTokens: 4000,
      timeoutMs: 60_000,
    });

    if (call.error || !call.content) return [];

    const parsed = safeJsonParse(call.content, {} as {
      items?: Array<{
        label: string;
        description: string;
        amount: number;
        impactedLine?: string;
        category?: string;
        companyAdjusts?: boolean;
        adjustDirection?: string;
        confidence?: string;
        sourceRef?: string;
      }>;
    });

    if (!parsed.items || !Array.isArray(parsed.items)) return [];

    const validLines = new Set(["operatingIncome", "netIncome", "revenue", "cogs", "sga", "other"]);
    const validCategories = new Set(["legal", "restructuring", "impairment", "gain-loss-disposal", "tax-adjustment", "insurance", "erc", "acquisition", "other"]);
    const validDirections = new Set(["add-back", "subtract"]);
    const validConfidence = new Set(["high", "medium", "low"]);

    return parsed.items
      .filter(item => item.label && item.amount != null && Math.abs(item.amount) >= 1)
      .map((item, i) => ({
        id: `nr-${i + 1}-${item.category ?? "other"}`,
        label: item.label,
        description: item.description || "",
        amount: Math.round(Number(item.amount)),
        impactedLine: (validLines.has(item.impactedLine ?? "") ? item.impactedLine : "operatingIncome") as NonRecurringItem["impactedLine"],
        category: (validCategories.has(item.category ?? "") ? item.category : "other") as NonRecurringItem["category"],
        companyAdjusts: item.companyAdjusts ?? false,
        adjustDirection: (validDirections.has(item.adjustDirection ?? "") ? item.adjustDirection : "add-back") as NonRecurringItem["adjustDirection"],
        confidence: (validConfidence.has(item.confidence ?? "") ? item.confidence : "medium") as NonRecurringItem["confidence"],
        sourceRef: item.sourceRef || "",
      }));
  } catch {
    return [];
  }
}
