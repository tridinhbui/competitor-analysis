import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
import { shouldRunExtraction } from "@/lib/llmExtractionGuards";
import { extractPdfFinancialValue, type PdfFinancialMetric } from "@/lib/pdfFinancialValueExtractor";
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
- Assets â†’ Total assets
- AssetsCurrent â†’ Total current assets
- AssetsNoncurrent â†’ Total non-current assets
- CashAndCashEquivalentsAtCarryingValue â†’ Cash and cash equivalents
- ShortTermInvestments â†’ Short-term investments / marketable securities
- AccountsReceivableNet â†’ Accounts receivable, net (trade receivables)
- AccountsReceivableNetCurrent â†’ Accounts receivable current
- InventoryNet â†’ Inventories
- PrepaidExpenseAndOtherAssetsCurrent â†’ Prepaid expenses & other current assets
- PropertyPlantAndEquipmentNet â†’ Property, plant & equipment, net
- Goodwill â†’ Goodwill
- IntangibleAssetsNet â†’ Intangible assets, net
- OtherAssetsNoncurrent â†’ Other non-current assets
- DeferredIncomeTaxAssetsNet â†’ Deferred income tax assets
- Liabilities â†’ Total liabilities
- LiabilitiesCurrent â†’ Total current liabilities
- LiabilitiesNoncurrent â†’ Total non-current / long-term liabilities
- AccountsPayable â†’ Accounts payable (trade payables)
- AccruedLiabilitiesCurrent â†’ Accrued expenses / accrued liabilities
- DeferredRevenueCurrent â†’ Deferred revenue (current)
- DebtCurrent â†’ Current portion of long-term debt / short-term borrowings / notes payable current
- LongTermDebtNoncurrent â†’ Long-term debt (non-current portion)
- LongTermDebt â†’ Long-term debt (if only one debt line is shown)
- ShortTermBorrowings â†’ Short-term borrowings / revolving credit (if separate from current portion of LT debt)
- LongTermDebtCurrent â†’ Current maturities of long-term debt (if shown as separate line from DebtCurrent)
- OperatingLeaseLiabilityNoncurrent â†’ Operating lease liabilities (non-current)
- FinanceLeaseLiabilityNoncurrent â†’ Finance lease obligations (non-current portion)
- PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent â†’ Pension obligations / defined benefit plan liabilities / OPEB liabilities (non-current). Also matches "Pension benefit obligations", "Postretirement benefit obligations".
- RedeemableNoncontrollingInterestEquityCarryingAmount â†’ Redeemable noncontrolling interests. This is a MEZZANINE item that appears between Total Liabilities and Shareholders' Equity sections â€” it is neither a standard liability nor equity. Extract it if it exists.
- StockholdersEquity â†’ Total stockholders' equity / total shareholders' equity / total shareholders' investment / total equity / shareholders' investment (the net subtotal AFTER deducting treasury stock and including AOCI)
- CommonStockValue â†’ Common stock
- AdditionalPaidInCapital â†’ Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit â†’ Retained earnings (or accumulated deficit if negative)
- TreasuryStockValue â†’ Treasury stock (NEGATIVE â€” shown in parentheses in filings). Must be extracted as a negative number.
- AccumulatedOtherComprehensiveIncomeLoss â†’ Accumulated other comprehensive income/loss (AOCI â€” can be positive or negative)
- LiabilitiesAndStockholdersEquity â†’ Total liabilities and stockholders' equity
- MinorityInterest â†’ Noncontrolling interests / minority interest (the portion already inside Total Equity)

RULES:
- If a line item matches multiple tags, pick the most specific one.
- ALL parenthesized values (1,234) are NEGATIVE. This applies especially to TreasuryStockValue and AccumulatedOtherComprehensiveIncomeLoss.
- TreasuryStockValue MUST be negative. If you see a large parenthesized number on the Treasury stock line, record it as a negative value (e.g., (4,949) â†’ -4949).
- StockholdersEquity is the NET total line â€” it already reflects the deduction of treasury stock. Do not add treasury stock back in.
- For StockholdersEquity, ALWAYS prioritize the FINAL total line in the equity section.
- Equity aliases to treat as equivalent: "Total Shareholders' Equity", "Total Shareholders' Investment", "Total Stockholders' Equity", "Total Equity", "Shareholders' Investment".
- If both "Company Shareholders' Equity" and "Total Shareholders' Equity" exist, ALWAYS choose the TOTAL line (includes noncontrolling interest).
- Equity section is usually after liabilities and before the final total. Prefer that final subtotal line over component lines.
- Validation: confirm Assets is approximately equal to Liabilities + Equity. If mismatch, re-check StockholdersEquity and choose the line that best reconciles.
- RedeemableNoncontrollingInterestEquityCarryingAmount appears between Liabilities and Equity sections. Always extract it when present.
- If "Total liabilities and equity" exists, include it as LiabilitiesAndStockholdersEquity.
- Ignore standalone superscript/footnote markers (e.g., 1, 2, 3) after labels. They are not dollar values.
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
- Revenues â†’ Total revenue / net revenues / net sales / sales / net revenue. NOTE: many filings (especially food/meat companies) label this simply "Sales" â€” treat "Sales" as revenue.
- CostOfGoodsSold â†’ Cost of goods sold / cost of sales / cost of products sold / cost of products
- CostOfGoodsAndServicesSold â†’ Cost of goods and services sold (use this tag if "goods and services" appears)
- CostOfRevenue â†’ Cost of revenue (use this if "cost of revenue" is the exact label)
- GrossProfit â†’ Gross profit (Revenue minus COGS). If not shown, compute as Revenues minus CostOfGoodsSold.
- SellingGeneralAndAdministrativeExpense â†’ SG&A / selling, general & administrative / selling, general and administrative expenses
- ResearchAndDevelopmentExpense â†’ R&D / research and development expense
- OperatingExpenses â†’ Total operating expenses (if shown as a total)
- OperatingIncomeLoss â†’ Operating income (loss) / income from operations / operating profit / operating earnings. NOTE: "Operating profit" is a common synonym â€” extract it as OperatingIncomeLoss.
- InterestExpense â†’ Interest expense (absolute value, positive number)
- InterestIncome â†’ Interest income
- IncomeTaxExpenseBenefit â†’ Income tax expense / provision for income taxes / income taxes
- NetIncomeLoss â†’ Net income (loss) / net earnings / net income attributable to parent / net earnings attributable to shareholders
- EarningsPerShareBasic â†’ Basic earnings per share (this is a per-share number, NOT millions)
- EarningsPerShareDiluted â†’ Diluted earnings per share (per-share number, NOT millions)
- WeightedAverageSharesBasic â†’ Weighted average shares outstanding, basic (in millions)
- WeightedAverageSharesDiluted â†’ Weighted average shares outstanding, diluted (in millions)

CASH FLOW STATEMENT TAGS:
- DepreciationDepletionAndAmortization â†’ Depreciation and amortization (D&A) / depreciation, depletion and amortization
- DepreciationAndAmortization â†’ (alternative D&A tag)
- Depreciation â†’ Depreciation only (if shown separately)
- AmortizationOfIntangibleAssets â†’ Amortization of intangibles (if shown separately)
- ShareBasedCompensation â†’ Stock-based compensation / share-based compensation / stock compensation expense. NOTE: some filers (especially recently-IPO'd companies) show SBC in the Shareholders' Equity statement rather than the Cash Flow Statement â€” look in both sections.
- NetCashProvidedByOperatingActivities â†’ Net cash from operating activities / net cash provided by operating activities / net cash flows from operating activities / net cash flows from operating activities of continuing operations. NOTE: if the filing separates "continuing" and "discontinued" operations, use the "continuing operations" value.
- PaymentsToAcquirePropertyPlantAndEquipment â†’ Capital expenditures / purchases of property / purchases of property and equipment / payments for property, plant and equipment / capital additions / additions to property, plant and equipment (POSITIVE number)
- NetCashProvidedByInvestingActivities â†’ Net cash from investing activities / net cash used in investing activities / net cash flows from investing activities
- ProceedsFromIssuanceOfLongTermDebt â†’ Proceeds from issuance of long-term debt / borrowings / proceeds from debt (POSITIVE number)
- RepaymentsOfLongTermDebt â†’ Repayments of long-term debt ONLY when the label explicitly names long-term debt, term loan, or non-current notes (e.g., "Repayment of term loan", "Principal payments on long-term debt"). Do NOT use this tag for "Payments on debt" or any label that does not explicitly say "long-term". (POSITIVE number)
- RepaymentsOfShortTermDebt â†’ Repayments of short-term borrowings / short-term debt / revolving credit borrowings (POSITIVE number)
- RepaymentsOfDebt â†’ Use this tag when the label is ambiguous mixed debt repayment such as "Payments on debt", "Repayment of debt", or "Debt payments" â€” i.e., when the filing does NOT specify long-term vs short-term. (POSITIVE number)
- RepaymentsOfCommercialPaper â†’ Repayments of commercial paper / repayments of short-term borrowings when labeled as commercial paper. (POSITIVE number)
- PaymentsOfDividends â†’ Dividends paid / payment of dividends / payments of dividends / dividends paid to shareholders (POSITIVE number, even if shown as negative in filing)
- PaymentsOfDividendsCommonStock â†’ Dividends paid to common stockholders (use if "common" is specified)
- PaymentsForRepurchaseOfCommonStock â†’ Share repurchases / stock buybacks. Matches any of these labels: "repurchase of common stock", "purchases of common stock", "purchases of [any company name] Class A common stock", "purchases of [any company name] Class B common stock", "total share repurchases", "share repurchase program", "repurchase program". SEARCH PRIORITY: (1) financing section of Cash Flow Statement â€” preferred; (2) equity rollforward table or share repurchase note â€” use DOLLAR value column only, not shares column. If the filing is quarterly (10-Q), use the Three Months column; if YTD, use the Nine Months / Year-to-Date column. (POSITIVE number)
- NetCashProvidedByFinancingActivities â†’ Net cash from financing activities / net cash used in financing activities / net cash flows from financing activities

RULES:
- EPS values are per-share (e.g., 2.45), NOT in millions. Do not multiply by 1,000,000.
- CapEx, debt repayments, dividends, and buybacks should be POSITIVE even if the filing shows them as negative outflows.
- Interest expense should be POSITIVE.
- If both "Cost of goods sold" and "Cost of revenue" appear, use CostOfGoodsSold for the former and CostOfRevenue for the latter.
- Operating income can be negative (a loss). Keep the sign.
- Net income can be negative (a loss). Keep the sign.
- "Sales" at the top of the income statement = Revenue (Revenues tag). Do not confuse with "Sales" as a cost-center in SG&A breakdowns.
- Free Cash Flow (FCF) is NOT a required tag â€” it is computed downstream as (NetCashProvidedByOperatingActivities minus PaymentsToAcquirePropertyPlantAndEquipment). Just extract those two values accurately.
- For debt repayment: "Payments on debt" â†’ RepaymentsOfDebt (mixed). "Repayments of long-term debt" â†’ RepaymentsOfLongTermDebt. "Repayments of commercial paper" â†’ RepaymentsOfCommercialPaper. Do NOT use RepaymentsOfLongTermDebt for ambiguous labels.
- For share repurchases: do NOT require the exact phrase "share repurchases" â€” any stock purchase line in the financing section qualifies. Check equity notes if not in cash flow.
- Ignore standalone superscript/footnote markers (e.g., 1, 2, 3) after labels. They are not dollar values.
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
  items?: { tag: string; label: string; value: number | string | null }[];
}

interface IsCfExtraction {
  items?: { tag: string; label: string; value: number | string | null }[];
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
// Section detection â€” find the right text for each AI call
// ---------------------------------------------------------------------------

/**
 * Find ALL occurrences of section patterns and combine them.
 * This ensures we don't miss segment data that appears in multiple places
 * (e.g., segment note + MD&A segment discussion).
 */
function findSection(text: string, patterns: RegExp[], maxLen: number): string {
  const chunks: string[] = [];
  let totalLen = 0;
  const usedOffsets = new Set<number>(); // avoid overlapping slices

  for (const re of patterns) {
    // Use a global version of the regex to find ALL matches
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = globalRe.exec(text)) !== null) {
      const idx = match.index;
      // Skip if this offset is within an already-captured range
      const rounded = Math.floor(idx / 1000) * 1000;
      if (usedOffsets.has(rounded)) continue;
      usedOffsets.add(rounded);

      const chunkLen = Math.min(maxLen, Math.max(maxLen, 15_000));
      const slice = text.slice(idx, idx + chunkLen);
      chunks.push(slice);
      totalLen += slice.length;
      if (totalLen >= maxLen * 2) break; // cap total to avoid massive payloads
    }
    if (totalLen >= maxLen * 2) break;
  }

  return chunks.join("\n\n---\n\n");
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
  ], 22_000);

  const isText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(?:operations?|income|earnings)/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?(?:income|earnings)/i,
  ], 18_000);

  const cfText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+cash\s+flow/i,
    /(?:condensed\s+)?(?:consolidated\s+)?cash\s+flow/i,
  ], 18_000);

  const mdaText = findSection(text, [
    /management.?s?\s+discussion\s+and\s+analysis/i,
    /results\s+of\s+operations/i,
  ], 30_000);

  const notesText = findSection(text, [
    /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements/i,
  ], 30_000);

  const segText = findSection(text, [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
    /(?:beef|pork|chicken|prepared\s+foods?|packaged\s+meats?|international)\s+segment/i,
    /note\s+\d+[\.\:\-\s]+(?:segment|business\s+segment|operating\s+segment)/i,
  ], 25_000);

  // Equity statement â€” SBC is sometimes only shown here (e.g. recently-IPO'd companies)
  const equityText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders).?\s+equity/i,
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+equity/i,
  ], 8_000);

  // Combine IS + CF + equity for the income/cashflow call
  const isCfText = [isText, cfText, equityText].filter(Boolean).join("\n\n---\n\n");

  // Combine MD&A + Notes for qualitative call
  const qualText = [mdaText, notesText].filter(Boolean).join("\n\n---\n\n");

  // Segment text â€” combine segment section + MD&A (often has segment breakdowns)
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
): Promise<{ content: string | null; error: string | null; status: number | null }> {
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

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const compactErr = errBody.replace(/\s+/g, " ").trim().slice(0, 220);
      return {
        content: null,
        error: `OpenAI ${res.status}${compactErr ? `: ${compactErr}` : ""}`,
        status: res.status,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? null;
    if (!content) {
      return {
        content: null,
        error: "OpenAI returned empty content",
        status: res.status,
      };
    }
    return { content, error: null, status: res.status };
  } catch (err) {
    return {
      content: null,
      error: err instanceof Error ? err.message : "OpenAI request failed",
      status: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Convert AI value to number
// ---------------------------------------------------------------------------

function toNumOrNull(v: number | string | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed === "\u2013" ||
      trimmed === "\u2014" ||
      trimmed === "\u00e2\u20ac\u201c" ||
      trimmed === "\u00e2\u20ac\u201d" ||
      /^n\/?a$/i.test(trimmed)
    ) {
      return null;
    }

    let normalized = trimmed.replace(/[,$\s]/g, "");
    let negative = false;
    if (normalized.startsWith("(") && normalized.endsWith(")")) {
      normalized = normalized.slice(1, -1);
      negative = true;
    }

    const n = Number(normalized);
    if (Number.isNaN(n)) return null;
    return Math.round(negative ? -n : n);
  }
  return Number.isFinite(v) ? Math.round(v) : null;
}

function toBsItems(
  items: { tag: string; label: string; value: number | string | null }[] | undefined,
  period: string,
  sourcePrefix: string
): BSItem[] {
  const out: BSItem[] = [];
  for (const item of items ?? []) {
    const value = toNumOrNull(item.value);
    if (value == null) continue;
    out.push({
      tag: item.tag,
      label: item.label,
      value,
      period,
      source: `${sourcePrefix}:${item.tag}`,
    });
  }
  return out;
}

function repairCriticalFinancialValue(
  items: BSItem[],
  metric: PdfFinancialMetric,
  text: string,
  scaleNote: string | undefined,
  period: string
): void {
  const repaired = extractPdfFinancialValue(text, metric, scaleNote);
  if (!repaired || Math.abs(repaired.value) <= 1) return;

  const existing = items.find((item) => item.tag === repaired.tag);
  const existingValue = existing?.value ?? null;
  if (existingValue != null && Math.abs(existingValue) > 1) return;

  if (existing) {
    console.log("[analyze-pdf:repair]", {
      metric,
      previous: existing.value,
      repaired: repaired.value,
      confidence: repaired.confidence,
      raw: repaired.raw,
    });
    existing.value = repaired.value;
    existing.label = repaired.label;
    existing.source = repaired.source;
  } else {
    console.log("[analyze-pdf:repair]", {
      metric,
      previous: null,
      repaired: repaired.value,
      confidence: repaired.confidence,
      raw: repaired.raw,
    });
    items.push({
      tag: repaired.tag,
      label: repaired.label,
      value: repaired.value,
      period,
      source: repaired.source,
    });
  }
}

type RdMethod =
  | "extracted"
  | "derived_from_rd_tax_or_capitalization"
  | "estimated_from_revenue_ratio";

interface RdResolution {
  rAndDExpense: number | null;
  method: RdMethod | null;
  rAndDPercentUsed: number | null;
  rAndDPeriodBasis: "quarterly" | "ytd" | "annual" | null;
}

function resolveRnDExpense(opts: {
  text: string;
  scaleNote: string | undefined;
  companyName: string | null | undefined;
  existingRd: number | null;
  currentRevenue: number | null;
}): RdResolution {
  const { text, scaleNote, companyName, existingRd, currentRevenue } = opts;

  if (existingRd != null && Math.abs(existingRd) > 0) {
    return {
      rAndDExpense: Math.abs(existingRd),
      method: "extracted",
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  const toMillions = (v: number): number => Math.round(v * scale * 100) / 100;
  const isYearLike = (n: number): boolean => n >= 1900 && n <= 2100;

  function numsFrom(s: string): number[] {
    const out: number[] = [];
    const re = /\(?([\d,]+(?:\.\d+)?)\)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n) && !isYearLike(n)) out.push(n);
    }
    return out;
  }

  function window(arr: string[], i: number, ahead = 3): string {
    return arr.slice(i, i + 1 + ahead).join(" ");
  }

  function detectBasis(s: string): "quarterly" | "ytd" | "annual" {
    const hasYtd =
      /(?:nine|six)\s+months?\s+ended|year[-\s]*to[-\s]*date|ytd/i.test(s);
    const hasQuarter =
      /three\s+months?\s+ended|quarter(?:ly)?\s+(?:period|ended)?/i.test(s);
    if (hasYtd) return "ytd";
    if (hasQuarter) return "quarterly";
    return "annual";
  }

  function selectByBasis(
    nums: number[],
    basis: "quarterly" | "ytd" | "annual"
  ): number | null {
    if (nums.length === 0) return null;
    if (basis === "ytd") {
      if (nums.length >= 3) return nums[2];
      if (nums.length >= 2) return nums[1];
      return nums[0];
    }
    if (basis === "quarterly") {
      if (nums.length >= 1) return nums[0];
      return null;
    }
    if (nums.length >= 1) return nums[0];
    return null;
  }

  function selectPriorByBasis(
    nums: number[],
    basis: "quarterly" | "ytd" | "annual"
  ): number | null {
    if (nums.length < 2) return null;
    if (basis === "ytd") {
      if (nums.length >= 4) return nums[3];
      return nums[1];
    }
    return nums[1];
  }

  function findRowValues(
    chunk: string,
    rowPattern: RegExp,
    excludePattern?: RegExp
  ): number[] {
    const lines = chunk.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!rowPattern.test(lines[i])) continue;
      const candidate = window(lines, i, 2);
      if (excludePattern && excludePattern.test(candidate)) continue;
      const tailMatch = candidate.match(
        /(?:research\s+and\s+development(?:\s+expense)?|r&d(?:\s+expense)?|product\s+development(?:\s+expense)?|revenues?|sales)(.*)/i
      );
      const tail = tailMatch ? tailMatch[1] : candidate;
      const nums = numsFrom(tail).filter((n) => Math.abs(n) >= 0.1);
      if (nums.length > 0) return nums;
    }
    return [];
  }

  const incomeSlice =
    text.match(
      /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(?:operations?|income|earnings)[\s\S]{0,18000}/i
    )?.[0] ?? "";
  const notesSlice =
    text.match(
      /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements[\s\S]{0,24000}/i
    )?.[0] ?? "";

  // Step 1: explicit R&D extraction (highest priority)
  const directRowPattern =
    /(?:research\s+and\s+development(?:\s+expense)?|r&d(?:\s+expense)?|product\s+development(?:\s+expense)?)/i;
  const cluePattern =
    /(capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit|capitalized)/i;

  for (const chunk of [incomeSlice, notesSlice, text]) {
    if (!chunk) continue;
    const nums = findRowValues(chunk, directRowPattern, cluePattern);
    if (nums.length > 0) {
      return {
        rAndDExpense: toMillions(Math.abs(nums[0])),
        method: "extracted",
        rAndDPercentUsed: null,
        rAndDPeriodBasis: null,
      };
    }
  }

  // Step 2: capitalization / tax clue-derived proxy
  const derivedPattern =
    /(?:(?:research\s+and\s+development|r&d).*(?:capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit))|(?:(?:capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit).*(?:research\s+and\s+development|r&d))/i;
  for (const chunk of [notesSlice, text]) {
    if (!chunk) continue;
    const nums = findRowValues(chunk, derivedPattern);
    if (nums.length > 0) {
      return {
        rAndDExpense: toMillions(Math.abs(nums[0])),
        method: "derived_from_rd_tax_or_capitalization",
        rAndDPercentUsed: null,
        rAndDPeriodBasis: null,
      };
    }
  }

  // Step 3: estimate from revenue ratio fallback
  const basis = detectBasis(text);
  // Only trust injected currentRevenue when basis is not YTD.
  let revenue =
    basis !== "ytd" && currentRevenue != null && currentRevenue > 0
      ? currentRevenue
      : null;
  if (revenue == null) {
    const revenueNums = findRowValues(
      incomeSlice || text,
      /^(?:\s*)(?:total\s+)?(?:net\s+)?(?:revenues?|sales)\b/i
    );
    const selectedRevenue = selectByBasis(revenueNums, basis);
    if (selectedRevenue != null && selectedRevenue > 0) {
      revenue = toMillions(Math.abs(selectedRevenue));
    }
  }

  if (revenue == null || revenue <= 0) {
    return {
      rAndDExpense: null,
      method: null,
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  // Try historical intensity (prior period R&D / prior period revenue)
  let pctUsed = 0;
  const rdSeries = findRowValues(incomeSlice || text, directRowPattern, cluePattern);
  const revSeries = findRowValues(
    incomeSlice || text,
    /(?:total\s+)?(?:net\s+)?(?:revenues?|sales)\b/i
  );
  const rdPrior = selectPriorByBasis(rdSeries, basis);
  const revPrior = selectPriorByBasis(revSeries, basis);
  if (rdPrior != null && revPrior != null && Math.abs(revPrior) > 0) {
    pctUsed = (Math.abs(rdPrior) / Math.abs(revPrior)) * 100;
  } else {
    const name = (companyName ?? "").toLowerCase();
    if (name.includes("tyson")) pctUsed = 0.2;
    else if (name.includes("smithfield")) pctUsed = 1.0;
    else pctUsed = 0.6;
  }

  const estimated = Math.round((revenue * (pctUsed / 100)) * 100) / 100;
  if (estimated <= 0) {
    return {
      rAndDExpense: null,
      method: null,
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  return {
    rAndDExpense: estimated,
    method: "estimated_from_revenue_ratio",
    rAndDPercentUsed: Math.round(pctUsed * 1000) / 1000,
    rAndDPeriodBasis: basis,
  };
}

// ---------------------------------------------------------------------------
// Heuristic: extract share repurchases from the cash flow statement, equity
// statement, or equity notes when the AI extraction missed or zeroed the value.
// ---------------------------------------------------------------------------

function extractShareRepurchasesHeuristic(
  text: string,
  scaleNote: string | undefined
): number | null {
  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  // All positive decimal/integer values from a string.
  // Parenthesised values ("(26)") are treated as positive outflows.
  function numsFrom(s: string): number[] {
    const out: number[] = [];
    const re = /\(?([\d,]+(?:\.\d+)?)\)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }

  // First parenthesised amount: "(26)" â†’ 26
  function parseParen(s: string): number | null {
    const m = s.match(/\(([\d,]+(?:\.\d+)?)\)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }

  // Build a lookahead window: the matched line plus up to `ahead` following lines.
  // PDF table rows are frequently split so the label and value land on different lines.
  function window(arr: string[], i: number, ahead = 3): string {
    return arr.slice(i, i + 1 + ahead).join(" ");
  }

  const lines = text.split(/\n/);

  // --- Priority 1: Cash flow financing section ---
  // Label: "Purchases of Tyson Class A common stock", "Repurchases of common stock", etc.
  const cfSectionMatch = text.match(
    /(?:cash\s+flows?\s+(?:from|used\s+in)\s+financing|financing\s+activities)[\s\S]{0,5000}/i
  );
  if (cfSectionMatch) {
    const cfLines = cfSectionMatch[0].split(/\n/);
    const cfPattern =
      /(?:purchases?|repurchases?)\s+of\s+(?:[\w\s]*?\s+)?(?:class\s+[a-z]\s+)?common\s+stock|treasury\s+stock\s+purchase/i;
    for (let i = 0; i < cfLines.length; i++) {
      if (cfPattern.test(cfLines[i])) {
        const candidate = window(cfLines, i);
        console.log("[repurchase:cf-stmt] label line:", cfLines[i].trim());
        console.log("[repurchase:cf-stmt] candidate window:", candidate.trim());
        const amt = parseParen(candidate);
        if (amt != null && amt >= 1) {
          console.log("[repurchase:cf-stmt] parsed (paren):", amt);
          return Math.round(amt * scale * 100) / 100;
        }
        const nums = numsFrom(candidate).filter(n => n >= 1);
        console.log("[repurchase:cf-stmt] nums:", nums);
        if (nums.length > 0) {
          return Math.round(nums[0] * scale * 100) / 100;
        }
      }
    }
  }

  // --- Priority 2: Equity statement "Purchase of Class A common stock  (26)" ---
  // The amount may be on the same line or on the next 1â€“3 lines.
  const equityPattern = /purchase\s+of\s+(?:class\s+[a-z]\s+)?common\s+stock/i;
  for (let i = 0; i < lines.length; i++) {
    if (equityPattern.test(lines[i])) {
      const candidate = window(lines, i);
      console.log("[repurchase:equity-stmt] label line:", lines[i].trim());
      console.log("[repurchase:equity-stmt] candidate window:", candidate.trim());
      const amt = parseParen(candidate);
      console.log("[repurchase:equity-stmt] parsed (paren):", amt);
      if (amt != null && amt >= 1) {
        return Math.round(amt * scale * 100) / 100;
      }
    }
  }

  // --- Priority 3: Note table "Total share repurchases  0.4  26  0.2  13" ---
  // Table layout: [shares_recent, dollars_recent, shares_prior, dollars_prior]
  // We want dollars_recent = nums[1] after the label.
  // The numeric row may be on the next line when the PDF wraps.
  const noteSliceMatch =
    text.match(/note\s+\d+[^a-z]*equity[\s\S]{0,12000}/i) ??
    text.match(/share\s+repurchase\s+program[\s\S]{0,6000}/i) ??
    text.match(/repurchase\s+program[\s\S]{0,6000}/i);
  const searchText = noteSliceMatch ? noteSliceMatch[0] : text;
  const searchLines = searchText.split(/\n/);

  const totalRowPattern = /total\s+(?:share\s+)?repurchases?/i;
  for (let i = 0; i < searchLines.length; i++) {
    if (totalRowPattern.test(searchLines[i])) {
      const candidate = window(searchLines, i);
      console.log("[repurchase:note-table] label line:", searchLines[i].trim());
      console.log("[repurchase:note-table] candidate window:", candidate.trim());
      // Extract numbers only from the portion after the matched label
      const labelMatch = candidate.match(/total\s+(?:share\s+)?repurchases?(.*)/i);
      const tail = labelMatch ? labelMatch[1] : candidate;
      const nums = numsFrom(tail);
      console.log("[repurchase:note-table] nums after label:", nums);
      // nums[0] = share count (e.g. 0.4), nums[1] = dollar amount (e.g. 26)
      if (nums.length >= 2 && nums[1] >= 1) {
        return Math.round(nums[1] * scale * 100) / 100;
      }
      if (nums.length === 1 && nums[0] >= 1) {
        return Math.round(nums[0] * scale * 100) / 100;
      }
    }
  }

  return null;
}

type EquityConfidence = "high" | "medium" | "low";

interface EquityExtractionResult {
  totalEquity: number | null;
  labelUsed: string | null;
  confidence: EquityConfidence;
}

function extractTotalEquityHeuristic(
  text: string,
  scaleNote: string | undefined
): EquityExtractionResult {
  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  const lines = text
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const liabilitiesAndEquityPattern =
    /total\s+liabilities\s+(and|&)\s+((stock|share)holders?['\u2019]?\s+equity|equity)/i;
  const totalLiabilitiesPattern = /^total\s+liabilities\b/i;
  const companySpecificPattern =
    /^company\s+shareholders?['\u2019]?\s+equity\b/i;

  const equityPatterns: Array<{
    pattern: RegExp;
    confidence: EquityConfidence;
    isTotal: boolean;
  }> = [
    {
      pattern: /^total\s+shareholders?['\u2019]?\s+equity\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+stockholders?['\u2019]?\s+equity\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+shareholders?['\u2019]?\s+investment\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+stockholders?['\u2019]?\s+investment\b/i,
      confidence: "high",
      isTotal: true,
    },
    {
      pattern: /^total\s+equity\b/i,
      confidence: "medium",
      isTotal: true,
    },
    {
      pattern: /^shareholders?['\u2019]?\s+investment\b/i,
      confidence: "medium",
      isTotal: false,
    },
  ];

  function parseNumbers(input: string): number[] {
    const out: number[] = [];
    const re = /\(([\d,]+(?:\.\d+)?)\)|(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      const raw = m[1] ?? m[2];
      if (!raw) continue;
      const parsed = parseFloat(raw.replace(/,/g, ""));
      if (Number.isNaN(parsed)) continue;
      const value = m[1] ? -parsed : parsed;
      // Filter likely year headers (e.g. 2025) from OCR/table text.
      if (
        value >= 1900 &&
        value <= 2100 &&
        !raw.includes(",") &&
        !raw.includes(".")
      ) {
        continue;
      }
      out.push(value);
    }
    return out;
  }

  interface Candidate {
    idx: number;
    label: string;
    valueRaw: number;
    confidence: EquityConfidence;
    isTotal: boolean;
    isCompanySpecific: boolean;
  }

  let finalLiabilitiesAndEquityIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (liabilitiesAndEquityPattern.test(lines[i])) {
      finalLiabilitiesAndEquityIdx = i;
      break;
    }
  }

  let startIdx = 0;
  let endIdx = lines.length - 1;
  if (finalLiabilitiesAndEquityIdx !== -1) {
    startIdx = Math.max(0, finalLiabilitiesAndEquityIdx - 160);
    endIdx = finalLiabilitiesAndEquityIdx;
    for (let i = finalLiabilitiesAndEquityIdx; i >= startIdx; i--) {
      if (totalLiabilitiesPattern.test(lines[i])) {
        startIdx = i;
        break;
      }
    }
  }

  const candidates: Candidate[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const label = lines[i];
    const matchedPattern = equityPatterns.find((p) => p.pattern.test(label));
    const isCompanySpecific = companySpecificPattern.test(label);
    if (!matchedPattern && !isCompanySpecific) continue;

    const context = lines.slice(i, Math.min(lines.length, i + 3)).join(" ");
    const tail = context.slice(label.length).trim();
    const values = parseNumbers(tail);
    const valuesFallback = values.length > 0 ? values : parseNumbers(context);
    if (valuesFallback.length === 0) continue;

    candidates.push({
      idx: i,
      label,
      valueRaw: valuesFallback[0],
      confidence: matchedPattern?.confidence ?? "low",
      isTotal: matchedPattern?.isTotal ?? false,
      isCompanySpecific,
    });
  }

  if (candidates.length === 0) {
    return { totalEquity: null, labelUsed: null, confidence: "low" };
  }

  const nonCompanyTotalCandidates = candidates.filter(
    (c) => c.isTotal && !c.isCompanySpecific
  );
  const nonCompanyCandidates = candidates.filter((c) => !c.isCompanySpecific);

  const selected =
    nonCompanyTotalCandidates[nonCompanyTotalCandidates.length - 1] ??
    nonCompanyCandidates[nonCompanyCandidates.length - 1] ??
    candidates[candidates.length - 1];

  const totalEquity = Math.round(selected.valueRaw * scale * 100) / 100;
  return {
    totalEquity,
    labelUsed: selected.label,
    confidence: selected.confidence,
  };
}

function computeBalanceGapPct(
  assets: number | null,
  liabilities: number | null,
  equity: number | null
): number {
  if (
    assets == null ||
    liabilities == null ||
    equity == null ||
    assets === 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(assets - (liabilities + equity)) / Math.abs(assets);
}

// ---------------------------------------------------------------------------
// POST handler â€” 3 parallel AI calls
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

  const filingText = body.text?.trim() ?? "";
  if (!shouldRunExtraction(filingText)) {
    return NextResponse.json({ error: "NO_VALID_FILING_TEXT" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  // Split text into sections (≥500 chars, financial keywords passed guard)
  const { bsText, isCfText, qualText, segmentText } = extractSections(filingText);

  // Fallback: if section detection found nothing, use the full text (truncated)
  const bsInput = bsText.length > 500 ? bsText : filingText.slice(0, 80_000);
  const isCfInput = isCfText.length > 500 ? isCfText : filingText.slice(0, 80_000);
  const qualInput = qualText.length > 500 ? qualText : filingText.slice(0, 60_000);
  const segInput = segmentText.length > 300 ? segmentText : filingText.slice(0, 60_000);

  try {
    // Run 5 AI calls in parallel (4 extraction + 1 non-recurring)
    const [bsCall, isCfCall, qualCall, segCall, nonRecurringItems] = await Promise.all([
      callOpenAI(apiKey, model, BS_PROMPT, `Extract balance sheet data:\n\n${bsInput}`, 4000),
      callOpenAI(apiKey, model, IS_CF_PROMPT, `Extract income statement and cash flow data:\n\n${isCfInput}`, 4000),
      callOpenAI(apiKey, model, QUALITATIVE_PROMPT, `Extract qualitative insights:\n\n${qualInput}`, 4000),
      callOpenAI(apiKey, model, SEGMENT_PROMPT, `Extract segment data:\n\n${segInput}`, 3000),
      extractNonRecurringItems(filingText, apiKey, model),
    ]);

    const aiErrors = [bsCall, isCfCall, qualCall, segCall]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));

    if (aiErrors.length > 0) {
      console.warn("[analyze-pdf] OpenAI extraction warnings:", aiErrors);
    }

    // Parse BS
    let bsExtraction: BsExtraction = {};
    if (bsCall.content) {
      try { bsExtraction = JSON.parse(bsCall.content); } catch { /* ignore */ }
    }

    // Parse IS/CF
    let isCfExtraction: IsCfExtraction = {};
    if (isCfCall.content) {
      try { isCfExtraction = JSON.parse(isCfCall.content); } catch { /* ignore */ }
    }

    // Parse Qualitative
    let qualExtraction: QualExtraction = {};
    if (qualCall.content) {
      try { qualExtraction = JSON.parse(qualCall.content); } catch { /* ignore */ }
    }

    // Parse Segments
    let segExtraction: SegmentExtraction = {};
    if (segCall.content) {
      try { segExtraction = JSON.parse(segCall.content); } catch { /* ignore */ }
    }

    const period = bsExtraction.periodEnd ?? new Date().toISOString().slice(0, 10);

    // Build BSItem arrays with exact tags
    const bsItems: BSItem[] = toBsItems(bsExtraction.items, period, "AI:bs");
    repairCriticalFinancialValue(
      bsItems,
      "totalAssets",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      bsItems,
      "cashAndEquivalents",
      filingText,
      bsExtraction.scaleNote,
      period
    );

    const equityCandidate = extractTotalEquityHeuristic(
      filingText,
      bsExtraction.scaleNote
    );
    if (equityCandidate.totalEquity != null) {
      const assetsValue =
        bsItems.find((item) => item.tag === "Assets")?.value ?? null;
      const liabilitiesValue =
        bsItems.find((item) => item.tag === "Liabilities")?.value ?? null;
      const existingEquityItem = bsItems.find(
        (item) => item.tag === "StockholdersEquity"
      );
      const existingEquityValue = existingEquityItem?.value ?? null;
      const existingEquityLooksCompanySpecific = existingEquityItem
        ? /^company\s+shareholders?['\u2019]?\s+equity/i.test(
            existingEquityItem.label
          )
        : false;

      const currentGap = computeBalanceGapPct(
        assetsValue,
        liabilitiesValue,
        existingEquityValue
      );
      const candidateGap = computeBalanceGapPct(
        assetsValue,
        liabilitiesValue,
        equityCandidate.totalEquity
      );

      const shouldUseCandidate =
        existingEquityItem == null ||
        existingEquityValue === 0 ||
        existingEquityLooksCompanySpecific ||
        (Number.isFinite(candidateGap) &&
          (!Number.isFinite(currentGap) || candidateGap < currentGap)) ||
        (equityCandidate.confidence === "high" && !Number.isFinite(currentGap));

      if (shouldUseCandidate) {
        if (existingEquityItem) {
          existingEquityItem.value = equityCandidate.totalEquity;
          existingEquityItem.label =
            equityCandidate.labelUsed ?? existingEquityItem.label;
          existingEquityItem.source = `heuristic:equity:${equityCandidate.confidence}`;
        } else {
          bsItems.push({
            tag: "StockholdersEquity",
            label: equityCandidate.labelUsed ?? "Total equity",
            value: equityCandidate.totalEquity,
            period,
            source: `heuristic:equity:${equityCandidate.confidence}`,
          });
        }
      }

      console.log("[equity:heuristic-candidate]", {
        selectedLabel: equityCandidate.labelUsed,
        selectedValue: equityCandidate.totalEquity,
        confidence: equityCandidate.confidence,
        shouldUseCandidate,
        currentGap,
        candidateGap,
      });
    }

    const cfItems: BSItem[] = toBsItems(isCfExtraction.items, period, "AI:cf");
    repairCriticalFinancialValue(
      cfItems,
      "revenue",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "costOfRevenue",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "grossProfit",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "operatingIncome",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "netIncome",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "operatingCashFlow",
      filingText,
      bsExtraction.scaleNote,
      period
    );
    repairCriticalFinancialValue(
      cfItems,
      "capitalExpenditures",
      filingText,
      bsExtraction.scaleNote,
      period
    );

    // Heuristic fallback: run when the AI either missed repurchases entirely or
    // extracted a zero/invalid value (e.g. model returned 0 for a non-zero buyback).
    const existingRepurchase = cfItems.find(
      (i) => i.tag === "PaymentsForRepurchaseOfCommonStock"
    );
    const hasValidRepurchase =
      existingRepurchase != null && Math.abs(existingRepurchase.value) > 0;
    console.log(
      "[repurchase:guard] hasValidRepurchase:", hasValidRepurchase,
      "existing value:", existingRepurchase?.value ?? "none"
    );
    if (!hasValidRepurchase) {
      const heuristicValue = extractShareRepurchasesHeuristic(
        filingText,
        bsExtraction.scaleNote
      );
      console.log("[repurchase:heuristic] heuristicValue:", heuristicValue);
      if (heuristicValue != null && heuristicValue > 0) {
        if (existingRepurchase) {
          // Overwrite the zero AI value in place so deduplication is not needed downstream
          existingRepurchase.value = heuristicValue;
          existingRepurchase.label = "Share repurchases (heuristic)";
          existingRepurchase.source = "heuristic:repurchase_overwrite";
        } else {
          cfItems.push({
            tag: "PaymentsForRepurchaseOfCommonStock",
            label: "Share repurchases (heuristic)",
            value: heuristicValue,
            period,
            source: "heuristic:repurchase",
          });
        }
      }
    }
    const finalRepurchaseItem = cfItems.find(
      (i) => i.tag === "PaymentsForRepurchaseOfCommonStock"
    );
    console.log("[repurchase:final-cfItem]", finalRepurchaseItem ?? null);
    console.log(
      "[repurchase:cfItems-after-heuristic]",
      cfItems.map((i) => ({
        tag: i.tag,
        label: i.label,
        value: i.value,
        source: i.source,
      }))
    );

    // Debt repayment classification:
    // 1) direct LT repayment line wins
    // 2) "Payments on debt" can proxy LT only if there are no short-term repayment lines
    //    and no conflicting repayment breakdown
    // 3) otherwise keep as mixed debt repayment (do NOT label as LT specifically)
    const directLtDebtRepayItem = cfItems.find(
      (i) => i.tag === "RepaymentsOfLongTermDebt" && Math.abs(i.value) > 0
    );
    const paymentsOnDebtItem = cfItems.find(
      (i) => i.tag === "RepaymentsOfDebt" && Math.abs(i.value) > 0
    );
    const hasShortTermRepayments =
      cfItems.some(
        (i) =>
          i.tag === "RepaymentsOfCommercialPaper" &&
          Math.abs(i.value) > 0
      ) ||
      cfItems.some(
        (i) => i.tag === "RepaymentsOfShortTermDebt" && Math.abs(i.value) > 0
      );
    const hasConflictingDebtBreakdown =
      hasShortTermRepayments ||
      cfItems.some(
        (i) =>
          i.tag === "RepaymentsOfLongTermDebt" &&
          i !== directLtDebtRepayItem &&
          Math.abs(i.value) > 0
      );

    let debtRepaymentLabel = "unknown";
    if (directLtDebtRepayItem) {
      debtRepaymentLabel = "direct";
      directLtDebtRepayItem.source =
        directLtDebtRepayItem.source || "direct";
    } else if (
      paymentsOnDebtItem &&
      !hasShortTermRepayments &&
      !hasConflictingDebtBreakdown
    ) {
      debtRepaymentLabel = "proxy_from_payments_on_debt";
      cfItems.push({
        tag: "RepaymentsOfLongTermDebt",
        label: "LT debt repayments (proxy from payments on debt)",
        value: Math.abs(paymentsOnDebtItem.value),
        period,
        source: "proxy_from_payments_on_debt",
      });
    } else if (paymentsOnDebtItem) {
      debtRepaymentLabel = "mixed_debt_repayment";
      paymentsOnDebtItem.label = "Total debt repayments (mixed)";
      paymentsOnDebtItem.source = "mixed_debt_repayment";
    }
    console.log("[debt-repay:classification]", {
      label: debtRepaymentLabel,
      directLt: directLtDebtRepayItem?.value ?? null,
      paymentsOnDebt: paymentsOnDebtItem?.value ?? null,
      hasShortTermRepayments,
      hasConflictingDebtBreakdown,
    });

    // R&D fallback chain:
    // We only auto-fill when an explicit R&D line is found in the PDF text.
    // If not explicit, leave missing so UI shows "â€”" instead of forced estimates.
    const existingRdItem = cfItems.find(
      (i) => i.tag === "ResearchAndDevelopmentExpense"
    );
    const hasValidRd = existingRdItem != null && Math.abs(existingRdItem.value) > 0;
    const revenueItem = cfItems.find((i) =>
      [
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
      ].includes(i.tag)
    );
    const rdResolution = resolveRnDExpense({
      text: filingText,
      scaleNote: bsExtraction.scaleNote,
      companyName: bsExtraction.companyName,
      existingRd: hasValidRd ? existingRdItem!.value : null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    console.log("[rd:resolution]", rdResolution);

    const rdExpense = rdResolution.rAndDExpense;
    const shouldBackfillRd =
      !hasValidRd &&
      rdExpense != null &&
      rdExpense > 0 &&
      rdResolution.method === "extracted";

    if (shouldBackfillRd) {
      const basisPart = rdResolution.rAndDPeriodBasis
        ? `:basis=${rdResolution.rAndDPeriodBasis}`
        : "";
      const source = `heuristic:rd:extracted${basisPart}`;

      if (existingRdItem) {
        existingRdItem.value = rdExpense;
        existingRdItem.label = "R&D expense";
        existingRdItem.source = source;
      } else {
        cfItems.push({
          tag: "ResearchAndDevelopmentExpense",
          label: "R&D expense",
          value: rdExpense,
          period,
          source,
        });
      }
    } else if (!hasValidRd) {
      console.log("[rd:skip-backfill]", {
        reason: "non-explicit or unavailable R&D value",
        method: rdResolution.method,
        candidate: rdResolution.rAndDExpense,
      });
    }
    console.log(
      "[rd:final-cfItem]",
      cfItems.find((i) => i.tag === "ResearchAndDevelopmentExpense") ?? null
    );

    // If AI extraction is weak, return an error so the client can trigger
    // its deterministic heuristic fallback instead of rendering mostly empty UI.
    const hasCoreBalanceSheet = bsItems.some((i) =>
      ["Assets", "Liabilities", "StockholdersEquity", "LiabilitiesAndStockholdersEquity"].includes(i.tag)
    );
    const hasCoreIncomeOrCashFlow = cfItems.some((i) =>
      ["Revenues", "NetIncomeLoss", "OperatingIncomeLoss", "NetCashProvidedByOperatingActivities"].includes(i.tag)
    );
    const totalFinancialLineItems = bsItems.length + cfItems.length;

    if (totalFinancialLineItems < 6 || !hasCoreBalanceSheet || !hasCoreIncomeOrCashFlow) {
      const reasons: string[] = [];
      if (totalFinancialLineItems < 6) {
        reasons.push(`only ${totalFinancialLineItems} financial lines extracted`);
      }
      if (!hasCoreBalanceSheet) {
        reasons.push("missing core balance sheet lines");
      }
      if (!hasCoreIncomeOrCashFlow) {
        reasons.push("missing core income/cash flow lines");
      }
      if (aiErrors.length > 0) {
        reasons.push(`upstream AI errors: ${aiErrors.join(" | ")}`);
      }

      return NextResponse.json(
        {
          error: `AI extraction coverage too low (${reasons.join("; ")}). Falling back to heuristic parser.`,
        },
        { status: 502 }
      );
    }

    // Assemble full analysis
    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: bsExtraction.companyName ?? undefined,
      fileName: body.fileName,
      pagesRead: body.pages,
      charsExtracted: body.chars ?? filingText.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });
    console.log(
      "[repurchase:final-render-value]",
      analysis.cashFlow.shareRepurchases
    );

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

    // Attach non-recurring items
    if (nonRecurringItems.length > 0) {
      analysis.nonRecurringItems = nonRecurringItems;
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

