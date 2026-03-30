/**
 * Fetches the actual 10-Q/10-K HTML filing from SEC EDGAR,
 * then uses OpenAI to extract notable footnotes and non-GAAP adjusted metrics.
 */

import type { FootnoteItem, AdjustedMetric } from "@/types/analysis";

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
