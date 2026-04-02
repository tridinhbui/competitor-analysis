import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import type { BSItem, FootnoteItem, EarningsNarrative } from "@/types/analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Exact XBRL tags that assembleAnalysis actually uses via find()/findOrNull()
// ---------------------------------------------------------------------------

const BS_PROMPT = `You are a financial data extraction engine. Extract BALANCE SHEET data from this 10-Q/10-K text.

Return ONLY valid JSON (no markdown):
{
  "companyName": "string or null",
  "periodEnd": "YYYY-MM-DD or null",
  "scaleNote": "millions|thousands|billions",
  "items": [
    {"tag": "EXACT_TAG", "label": "Human label", "value": 1234}
  ]
}

You MUST use these EXACT tags. Extract the MOST RECENT period (leftmost or first data column).
ALL values MUST be in USD millions. If filing uses thousands, divide by 1000. If billions, multiply by 1000.
Parenthesized numbers (1,234) = NEGATIVE.

REQUIRED TAGS (extract ALL that exist in the text):
- Assets → Total assets
- AssetsCurrent → Total current assets
- AssetsNoncurrent → Total non-current assets
- CashAndCashEquivalentsAtCarryingValue → Cash and cash equivalents
- ShortTermInvestments → Short-term investments / marketable securities
- AccountsReceivableNet → Accounts receivable, net (trade receivables)
- AccountsReceivableNetCurrent → Accounts receivable current
- InventoryNet → Inventories
- PrepaidExpenseAndOtherAssetsCurrent → Prepaid expenses & other current assets
- PropertyPlantAndEquipmentNet → Property, plant & equipment, net
- Goodwill → Goodwill
- IntangibleAssetsNet → Intangible assets, net
- OtherAssetsNoncurrent → Other non-current assets
- DeferredIncomeTaxAssetsNet → Deferred income tax assets
- Liabilities → Total liabilities
- LiabilitiesCurrent → Total current liabilities
- LiabilitiesNoncurrent → Total non-current / long-term liabilities
- AccountsPayable → Accounts payable (trade payables)
- AccruedLiabilitiesCurrent → Accrued expenses / accrued liabilities
- DeferredRevenueCurrent → Deferred revenue (current)
- DebtCurrent → Current portion of long-term debt / short-term borrowings / notes payable current
- LongTermDebtNoncurrent → Long-term debt (non-current portion)
- LongTermDebt → Long-term debt (if only one debt line is shown)
- ShortTermBorrowings → Short-term borrowings / revolving credit (if separate from current portion of LT debt)
- LongTermDebtCurrent → Current maturities of long-term debt (if shown as separate line from DebtCurrent)
- OperatingLeaseLiabilityNoncurrent → Operating lease liabilities (non-current)
- StockholdersEquity → Total stockholders' equity / total equity
- CommonStockValue → Common stock
- AdditionalPaidInCapital → Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit → Retained earnings (or accumulated deficit if negative)
- TreasuryStockValue → Treasury stock (usually negative)
- AccumulatedOtherComprehensiveIncomeLoss → Accumulated other comprehensive income/loss (AOCI)
- LiabilitiesAndStockholdersEquity → Total liabilities and stockholders' equity
- MinorityInterest → Noncontrolling interests / minority interest

RULES:
- If a line item matches multiple tags, pick the most specific one.
- Treasury stock is typically NEGATIVE (shown in parentheses).
- AOCI can be positive or negative.
- If "Total liabilities and equity" exists, include it as LiabilitiesAndStockholdersEquity.
- Do NOT invent numbers. Only extract what is in the text.`;

const IS_CF_PROMPT = `You are a financial data extraction engine. Extract INCOME STATEMENT and CASH FLOW STATEMENT data from this 10-Q/10-K text.

Return ONLY valid JSON (no markdown):
{
  "items": [
    {"tag": "EXACT_TAG", "label": "Human label", "value": 1234}
  ]
}

You MUST use these EXACT tags. Extract the MOST RECENT period (leftmost or first data column, typically "Three months ended" for quarterly, or annual if 10-K).
ALL values MUST be in USD millions. If filing uses thousands, divide by 1000. If billions, multiply by 1000.
Parenthesized numbers (1,234) = NEGATIVE.

INCOME STATEMENT TAGS:
- Revenues → Total revenue / net sales / net revenue
- CostOfGoodsSold → Cost of goods sold / cost of sales
- CostOfGoodsAndServicesSold → Cost of goods and services sold (use this tag if "goods and services" appears)
- CostOfRevenue → Cost of revenue (use this if "cost of revenue" is the exact label)
- GrossProfit → Gross profit (Revenue minus COGS)
- SellingGeneralAndAdministrativeExpense → SG&A / selling, general & administrative
- ResearchAndDevelopmentExpense → R&D / research and development expense
- OperatingExpenses → Total operating expenses (if shown as a total)
- OperatingIncomeLoss → Operating income (loss) / income from operations
- InterestExpense → Interest expense (absolute value, positive number)
- InterestIncome → Interest income
- IncomeTaxExpenseBenefit → Income tax expense (provision for income taxes)
- NetIncomeLoss → Net income (loss) / net earnings
- EarningsPerShareBasic → Basic earnings per share (this is a per-share number, NOT millions)
- EarningsPerShareDiluted → Diluted earnings per share (per-share number, NOT millions)
- WeightedAverageSharesBasic → Weighted average shares outstanding, basic (in millions)
- WeightedAverageSharesDiluted → Weighted average shares outstanding, diluted (in millions)

CASH FLOW STATEMENT TAGS:
- DepreciationDepletionAndAmortization → Depreciation and amortization (D&A)
- DepreciationAndAmortization → (alternative D&A tag)
- Depreciation → Depreciation only (if shown separately)
- AmortizationOfIntangibleAssets → Amortization of intangibles (if shown separately)
- ShareBasedCompensation → Stock-based compensation / share-based compensation
- NetCashProvidedByOperatingActivities → Net cash from operating activities
- PaymentsToAcquirePropertyPlantAndEquipment → Capital expenditures / purchases of property (POSITIVE number)
- NetCashProvidedByInvestingActivities → Net cash from investing activities
- ProceedsFromDebt → Proceeds from issuance of debt / borrowings
- RepaymentsOfDebt → Repayments of debt / principal payments (POSITIVE number)
- PaymentsOfDividends → Dividends paid (POSITIVE number, even if shown as negative in filing)
- PaymentsOfDividendsCommonStock → Dividends paid to common stockholders (use if "common" is specified)
- PaymentsForRepurchaseOfCommonStock → Share repurchases / stock buybacks (POSITIVE number)
- NetCashProvidedByFinancingActivities → Net cash from financing activities

RULES:
- EPS values are per-share (e.g., 2.45), NOT in millions. Do not multiply by 1,000,000.
- CapEx, debt repayments, dividends, and buybacks should be POSITIVE even if the filing shows them as negative outflows.
- Interest expense should be POSITIVE.
- If both "Cost of goods sold" and "Cost of revenue" appear, use CostOfGoodsSold for the former and CostOfRevenue for the latter.
- Operating income can be negative (a loss). Keep the sign.
- Net income can be negative (a loss). Keep the sign.
- Do NOT invent numbers. Only extract what is in the text.`;

const QUALITATIVE_PROMPT = `You are a financial analyst reading an SEC filing. Extract qualitative insights.

Return ONLY valid JSON (no markdown):
{
  "footnotes": [
    {
      "id": "note-1",
      "title": "Short title (max 6 words)",
      "summary": "1-2 sentence summary of key disclosure",
      "significance": "high|medium|low",
      "type": "debt|contingency|segment|accounting-policy|tax|revenue|other"
    }
  ],
  "earningsNarrative": {
    "result": "Beat expectations|Missed expectations|In line|N/A",
    "summary": "One sentence on key metric change or beat/miss",
    "priorGuidance": "string or null",
    "currentGuidance": "string or null",
    "keyThemes": ["Theme 1", "Theme 2", "Theme 3"],
    "tone": "bullish|neutral|cautious|unknown"
  },
  "adjustedMetrics": [
    {
      "name": "Adjusted EBITDA",
      "gaapValue": 1234,
      "adjustments": [{"label": "Stock-based compensation", "value": 45}],
      "adjustedValue": 1279,
      "unit": "million",
      "period": "Q3 2024"
    }
  ]
}

FOOTNOTES: Select 4-7 most significant notes.
- significance="high" for: debt covenants, material contingencies, major accounting changes, segment restructuring, goodwill impairment
- significance="low" for: routine disclosures, minor policy changes

EARNINGS NARRATIVE (from MD&A / Results of Operations):
- result: Only "Beat expectations" if explicitly stated or strongly implied
- keyThemes: 3-5 bullets on operational changes, market conditions, strategic moves
- tone: bullish (growth, strong demand) | cautious (headwinds, margin pressure) | neutral (mixed)

ADJUSTED METRICS: Include ALL non-GAAP reconciliations found. Values in USD millions unless per-share.

Return empty arrays if no relevant content found. Do NOT hallucinate.`;

const SEGMENT_PROMPT = `You are a financial data extraction engine. Extract SEGMENT-LEVEL financial data from this 10-Q/10-K text.

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


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BsExtraction {
  companyName?: string | null;
  periodEnd?: string | null;
  scaleNote?: string;
  items?: { tag: string; label: string; value: number | string }[];
}

interface IsCfExtraction {
  items?: { tag: string; label: string; value: number | string }[];
}

interface QualExtraction {
  footnotes?: FootnoteItem[];
  earningsNarrative?: Partial<EarningsNarrative>;
  adjustedMetrics?: Array<{
    name: string;
    gaapValue: number | null;
    adjustments: Array<{ label: string; value: number }>;
    adjustedValue: number | null;
    unit: "million" | "per-share";
    period: string;
  }>;
}

interface SegmentExtraction {
  segments?: Array<{
    segmentName: string;
    segmentType?: "business" | "channel" | "geography";
    revenue: number | null;
    operatingIncome: number | null;
    depreciation?: number | null;
    capitalExpenditures?: number | null;
    totalAssets?: number | null;
    volumeUnits?: number | null;
    volumeUnitType?: "head" | "cwt" | "lbs" | "cases" | null;
  }>;
  intercompanyEliminations?: { revenue?: number | null; operatingIncome?: number | null };
  corporateAndOther?: { operatingIncome?: number | null };
}

// ---------------------------------------------------------------------------
// Section detection — find the right text for each AI call
// ---------------------------------------------------------------------------

function findSection(text: string, patterns: RegExp[], maxLen: number): string {
  for (const re of patterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      // Find a reasonable end — next major section header or maxLen
      const slice = text.slice(idx, idx + maxLen);
      return slice;
    }
  }
  return "";
}

function extractSections(text: string): {
  bsText: string;
  isCfText: string;
  qualText: string;
  segmentText: string;
} {
  const bsText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?balance\s+sheet/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?financial\s+position/i,
  ], 15_000);

  const isText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(?:operations?|income|earnings)/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?(?:income|earnings)/i,
  ], 12_000);

  const cfText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+cash\s+flow/i,
    /(?:condensed\s+)?(?:consolidated\s+)?cash\s+flow/i,
  ], 12_000);

  const mdaText = findSection(text, [
    /management.?s?\s+discussion\s+and\s+analysis/i,
    /results\s+of\s+operations/i,
  ], 20_000);

  const notesText = findSection(text, [
    /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements/i,
  ], 20_000);

  const segText = findSection(text, [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
  ], 15_000);

  // Combine IS + CF for the income/cashflow call
  const isCfText = [isText, cfText].filter(Boolean).join("\n\n---\n\n");

  // Combine MD&A + Notes for qualitative call
  const qualText = [mdaText, notesText].filter(Boolean).join("\n\n---\n\n");

  // Segment text — combine segment section + MD&A (often has segment breakdowns)
  const segmentText = [segText, mdaText].filter(Boolean).join("\n\n---\n\n");

  return { bsText, isCfText, qualText, segmentText };
}

// ---------------------------------------------------------------------------
// OpenAI call helper
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): Promise<string | null> {
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
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Convert AI value to number
// ---------------------------------------------------------------------------

function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "string") {
    if (v === "–" || v === "—" || v === "-" || v === "N/A" || v === "n/a") return 0;
    const n = Number(v.replace(/[,$\s]/g, ""));
    return isNaN(n) ? 0 : Math.round(n);
  }
  return Math.round(v);
}

// ---------------------------------------------------------------------------
// POST handler — 3 parallel AI calls
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured on server." },
      { status: 503 }
    );
  }

  let body: { text?: string; fileName?: string; pages?: number; chars?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length < 200) {
    return NextResponse.json(
      { error: "Extracted text too short or empty" },
      { status: 400 }
    );
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  // Split text into sections
  const { bsText, isCfText, qualText, segmentText } = extractSections(text);

  // Fallback: if section detection found nothing, use the full text (truncated)
  const bsInput = bsText.length > 500 ? bsText : text.slice(0, 60_000);
  const isCfInput = isCfText.length > 500 ? isCfText : text.slice(0, 60_000);
  const qualInput = qualText.length > 500 ? qualText : text.slice(0, 40_000);
  const segInput = segmentText.length > 300 ? segmentText : text.slice(0, 40_000);

  try {
    // Run 4 AI calls in parallel
    const [bsRaw, isCfRaw, qualRaw, segRaw] = await Promise.all([
      callOpenAI(apiKey, model, BS_PROMPT, `Extract balance sheet data:\n\n${bsInput}`, 4000),
      callOpenAI(apiKey, model, IS_CF_PROMPT, `Extract income statement and cash flow data:\n\n${isCfInput}`, 4000),
      callOpenAI(apiKey, model, QUALITATIVE_PROMPT, `Extract qualitative insights:\n\n${qualInput}`, 4000),
      callOpenAI(apiKey, model, SEGMENT_PROMPT, `Extract segment data:\n\n${segInput}`, 3000),
    ]);

    // Parse BS
    let bsExtraction: BsExtraction = {};
    if (bsRaw) {
      try { bsExtraction = JSON.parse(bsRaw); } catch { /* ignore */ }
    }

    // Parse IS/CF
    let isCfExtraction: IsCfExtraction = {};
    if (isCfRaw) {
      try { isCfExtraction = JSON.parse(isCfRaw); } catch { /* ignore */ }
    }

    // Parse Qualitative
    let qualExtraction: QualExtraction = {};
    if (qualRaw) {
      try { qualExtraction = JSON.parse(qualRaw); } catch { /* ignore */ }
    }

    // Parse Segments
    let segExtraction: SegmentExtraction = {};
    if (segRaw) {
      try { segExtraction = JSON.parse(segRaw); } catch { /* ignore */ }
    }

    const period = bsExtraction.periodEnd ?? new Date().toISOString().slice(0, 10);

    // Build BSItem arrays with exact tags
    const bsItems: BSItem[] = (bsExtraction.items ?? []).map((item) => ({
      tag: item.tag,
      label: item.label,
      value: toNum(item.value),
      period,
      source: `AI:bs:${item.tag}`,
    }));

    const cfItems: BSItem[] = (isCfExtraction.items ?? []).map((item) => ({
      tag: item.tag,
      label: item.label,
      value: toNum(item.value),
      period,
      source: `AI:cf:${item.tag}`,
    }));

    // Assemble full analysis
    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: bsExtraction.companyName ?? undefined,
      fileName: body.fileName,
      pagesRead: body.pages,
      charsExtracted: body.chars ?? text.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });

    // Attach qualitative data
    if (qualExtraction.footnotes && Array.isArray(qualExtraction.footnotes)) {
      const validTypes = new Set(["debt", "contingency", "segment", "accounting-policy", "tax", "revenue", "other"]);
      analysis.footnotes = qualExtraction.footnotes.map((fn) => ({
        id: fn.id || `note-${Math.random().toString(36).slice(2, 8)}`,
        title: fn.title || "Note",
        summary: fn.summary || "",
        significance: (["high", "medium", "low"].includes(fn.significance) ? fn.significance : "medium") as "high" | "medium" | "low",
        type: (validTypes.has(fn.type) ? fn.type : "other") as FootnoteItem["type"],
      }));
    }

    if (qualExtraction.earningsNarrative) {
      const en = qualExtraction.earningsNarrative;
      if (en.summary || en.keyThemes?.length) {
        analysis.earningsNarrative = {
          result: en.result || "N/A",
          summary: en.summary || "",
          priorGuidance: en.priorGuidance ?? null,
          currentGuidance: en.currentGuidance ?? null,
          keyThemes: Array.isArray(en.keyThemes) ? en.keyThemes.slice(0, 5) : [],
          tone: (["bullish", "neutral", "cautious", "unknown"].includes(en.tone ?? "")
            ? en.tone
            : "unknown") as EarningsNarrative["tone"],
          source: "pdf-text",
        };
      }
    }

    if (qualExtraction.adjustedMetrics && Array.isArray(qualExtraction.adjustedMetrics)) {
      analysis.adjustedMetrics = qualExtraction.adjustedMetrics;
    }

    // Attach segments
    if (segExtraction.segments && Array.isArray(segExtraction.segments) && segExtraction.segments.length > 0) {
      const validVolumeTypes = new Set(["head", "cwt", "lbs", "cases"]);
      analysis.segments = segExtraction.segments.map((seg) => {
        const revenue = seg.revenue != null ? Math.round(Number(seg.revenue)) : null;
        const operatingIncome = seg.operatingIncome != null ? Math.round(Number(seg.operatingIncome)) : null;
        const opMargin = revenue && operatingIncome ? Math.round((operatingIncome / revenue) * 1000) / 10 : null;
        const volType = seg.volumeUnitType && validVolumeTypes.has(seg.volumeUnitType) ? seg.volumeUnitType : null;
        const volUnits = seg.volumeUnits != null ? Number(seg.volumeUnits) : null;
        const revPerUnit = volUnits && volUnits > 0 && revenue ? Math.round((revenue / volUnits) * 100) / 100 : null;
        const opPerUnit = volUnits && volUnits > 0 && operatingIncome ? Math.round((operatingIncome / volUnits) * 100) / 100 : null;

        return {
          segmentName: seg.segmentName || "Unknown Segment",
          segmentType: (seg.segmentType === "business" || seg.segmentType === "channel" || seg.segmentType === "geography") ? seg.segmentType : "business" as const,
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
          volumeUnitType: volType as import("@/types/segments").VolumeUnitType | null,
          revenuePerUnit: revPerUnit,
          operatingIncomePerUnit: opPerUnit,
        };
      });
    }

    return NextResponse.json({ analysis });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OpenAI call failed" },
      { status: 502 }
    );
  }
}
