import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
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
- FinanceLeaseLiabilityNoncurrent → Finance lease obligations (non-current portion)
- PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent → Pension obligations / defined benefit plan liabilities / OPEB liabilities (non-current). Also matches "Pension benefit obligations", "Postretirement benefit obligations".
- RedeemableNoncontrollingInterestEquityCarryingAmount → Redeemable noncontrolling interests. This is a MEZZANINE item that appears between Total Liabilities and Shareholders' Equity sections — it is neither a standard liability nor equity. Extract it if it exists.
- StockholdersEquity → Total stockholders' equity / total equity (the net subtotal AFTER deducting treasury stock and including AOCI)
- CommonStockValue → Common stock
- AdditionalPaidInCapital → Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit → Retained earnings (or accumulated deficit if negative)
- TreasuryStockValue → Treasury stock (NEGATIVE — shown in parentheses in filings). Must be extracted as a negative number.
- AccumulatedOtherComprehensiveIncomeLoss → Accumulated other comprehensive income/loss (AOCI — can be positive or negative)
- LiabilitiesAndStockholdersEquity → Total liabilities and stockholders' equity
- MinorityInterest → Noncontrolling interests / minority interest (the portion already inside Total Equity)

RULES:
- If a line item matches multiple tags, pick the most specific one.
- ALL parenthesized values (1,234) are NEGATIVE. This applies especially to TreasuryStockValue and AccumulatedOtherComprehensiveIncomeLoss.
- TreasuryStockValue MUST be negative. If you see a large parenthesized number on the Treasury stock line, record it as a negative value (e.g., (4,949) → -4949).
- StockholdersEquity is the NET total line — it already reflects the deduction of treasury stock. Do not add treasury stock back in.
- RedeemableNoncontrollingInterestEquityCarryingAmount appears between Liabilities and Equity sections. Always extract it when present.
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
- Revenues → Total revenue / net revenues / net sales / sales / net revenue. NOTE: many filings (especially food/meat companies) label this simply "Sales" — treat "Sales" as revenue.
- CostOfGoodsSold → Cost of goods sold / cost of sales / cost of products sold / cost of products
- CostOfGoodsAndServicesSold → Cost of goods and services sold (use this tag if "goods and services" appears)
- CostOfRevenue → Cost of revenue (use this if "cost of revenue" is the exact label)
- GrossProfit → Gross profit (Revenue minus COGS). If not shown, compute as Revenues minus CostOfGoodsSold.
- SellingGeneralAndAdministrativeExpense → SG&A / selling, general & administrative / selling, general and administrative expenses
- ResearchAndDevelopmentExpense → R&D / research and development expense
- OperatingExpenses → Total operating expenses (if shown as a total)
- OperatingIncomeLoss → Operating income (loss) / income from operations / operating profit / operating earnings. NOTE: "Operating profit" is a common synonym — extract it as OperatingIncomeLoss.
- InterestExpense → Interest expense (absolute value, positive number)
- InterestIncome → Interest income
- IncomeTaxExpenseBenefit → Income tax expense / provision for income taxes / income taxes
- NetIncomeLoss → Net income (loss) / net earnings / net income attributable to parent / net earnings attributable to shareholders
- EarningsPerShareBasic → Basic earnings per share (this is a per-share number, NOT millions)
- EarningsPerShareDiluted → Diluted earnings per share (per-share number, NOT millions)
- WeightedAverageSharesBasic → Weighted average shares outstanding, basic (in millions)
- WeightedAverageSharesDiluted → Weighted average shares outstanding, diluted (in millions)

CASH FLOW STATEMENT TAGS:
- DepreciationDepletionAndAmortization → Depreciation and amortization (D&A) / depreciation, depletion and amortization
- DepreciationAndAmortization → (alternative D&A tag)
- Depreciation → Depreciation only (if shown separately)
- AmortizationOfIntangibleAssets → Amortization of intangibles (if shown separately)
- ShareBasedCompensation → Stock-based compensation / share-based compensation / stock compensation expense. NOTE: some filers (especially recently-IPO'd companies) show SBC in the Shareholders' Equity statement rather than the Cash Flow Statement — look in both sections.
- NetCashProvidedByOperatingActivities → Net cash from operating activities / net cash provided by operating activities / net cash flows from operating activities / net cash flows from operating activities of continuing operations. NOTE: if the filing separates "continuing" and "discontinued" operations, use the "continuing operations" value.
- PaymentsToAcquirePropertyPlantAndEquipment → Capital expenditures / purchases of property / capital additions / additions to property, plant and equipment (POSITIVE number)
- NetCashProvidedByInvestingActivities → Net cash from investing activities / net cash used in investing activities / net cash flows from investing activities
- ProceedsFromIssuanceOfLongTermDebt → Proceeds from issuance of long-term debt / borrowings / proceeds from debt (POSITIVE number)
- RepaymentsOfLongTermDebt → Repayments of long-term debt ONLY when the label explicitly names long-term debt, term loan, or non-current notes (e.g., "Repayment of term loan", "Principal payments on long-term debt"). Do NOT use this tag for "Payments on debt" or any label that does not explicitly say "long-term". (POSITIVE number)
- RepaymentsOfShortTermDebt → Repayments of short-term borrowings / short-term debt / revolving credit borrowings (POSITIVE number)
- RepaymentsOfDebt → Use this tag when the label is ambiguous mixed debt repayment such as "Payments on debt", "Repayment of debt", or "Debt payments" — i.e., when the filing does NOT specify long-term vs short-term. (POSITIVE number)
- RepaymentsOfCommercialPaper → Repayments of commercial paper / repayments of short-term borrowings when labeled as commercial paper. (POSITIVE number)
- PaymentsOfDividends → Dividends paid / payment of dividends / payments of dividends / dividends paid to shareholders (POSITIVE number, even if shown as negative in filing)
- PaymentsOfDividendsCommonStock → Dividends paid to common stockholders (use if "common" is specified)
- PaymentsForRepurchaseOfCommonStock → Share repurchases / stock buybacks. Matches any of these labels: "repurchase of common stock", "purchases of common stock", "purchases of [any company name] Class A common stock", "purchases of [any company name] Class B common stock", "total share repurchases", "share repurchase program", "repurchase program". SEARCH PRIORITY: (1) financing section of Cash Flow Statement — preferred; (2) equity rollforward table or share repurchase note — use DOLLAR value column only, not shares column. If the filing is quarterly (10-Q), use the Three Months column; if YTD, use the Nine Months / Year-to-Date column. (POSITIVE number)
- NetCashProvidedByFinancingActivities → Net cash from financing activities / net cash used in financing activities / net cash flows from financing activities

RULES:
- EPS values are per-share (e.g., 2.45), NOT in millions. Do not multiply by 1,000,000.
- CapEx, debt repayments, dividends, and buybacks should be POSITIVE even if the filing shows them as negative outflows.
- Interest expense should be POSITIVE.
- If both "Cost of goods sold" and "Cost of revenue" appear, use CostOfGoodsSold for the former and CostOfRevenue for the latter.
- Operating income can be negative (a loss). Keep the sign.
- Net income can be negative (a loss). Keep the sign.
- "Sales" at the top of the income statement = Revenue (Revenues tag). Do not confuse with "Sales" as a cost-center in SG&A breakdowns.
- Free Cash Flow (FCF) is NOT a required tag — it is computed downstream as (NetCashProvidedByOperatingActivities minus PaymentsToAcquirePropertyPlantAndEquipment). Just extract those two values accurately.
- For debt repayment: "Payments on debt" → RepaymentsOfDebt (mixed). "Repayments of long-term debt" → RepaymentsOfLongTermDebt. "Repayments of commercial paper" → RepaymentsOfCommercialPaper. Do NOT use RepaymentsOfLongTermDebt for ambiguous labels.
- For share repurchases: do NOT require the exact phrase "share repurchases" — any stock purchase line in the financing section qualifies. Check equity notes if not in cash flow.
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
    // Use the LAST occurrence — 10-Q Table of Contents references section headers
    // before the actual financial statements, so the first match is often the TOC.
    const reGlobal = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let lastIdx = -1;
    let m: RegExpExecArray | null;
    while ((m = reGlobal.exec(text)) !== null) {
      lastIdx = m.index;
    }
    if (lastIdx !== -1) {
      return text.slice(lastIdx, lastIdx + maxLen);
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

  // Equity statement — SBC is sometimes only shown here (e.g. recently-IPO'd companies)
  const equityText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders).?\s+equity/i,
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+equity/i,
  ], 8_000);

  // Combine IS + CF + equity for the income/cashflow call
  const isCfText = [isText, cfText, equityText].filter(Boolean).join("\n\n---\n\n");

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

  // First parenthesised amount: "(26)" → 26
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
  // The amount may be on the same line or on the next 1–3 lines.
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
    // Run 5 AI calls in parallel (4 extraction + 1 non-recurring)
    const [bsRaw, isCfRaw, qualRaw, segRaw, nonRecurringItems] = await Promise.all([
      callOpenAI(apiKey, model, BS_PROMPT, `Extract balance sheet data:\n\n${bsInput}`, 4000),
      callOpenAI(apiKey, model, IS_CF_PROMPT, `Extract income statement and cash flow data:\n\n${isCfInput}`, 4000),
      callOpenAI(apiKey, model, QUALITATIVE_PROMPT, `Extract qualitative insights:\n\n${qualInput}`, 4000),
      callOpenAI(apiKey, model, SEGMENT_PROMPT, `Extract segment data:\n\n${segInput}`, 3000),
      extractNonRecurringItems(text, apiKey, model),
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
        text,
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
    // 1) direct extraction from text tables/notes
    // 2) derived proxy from capitalization/tax clues
    // 3) estimated from revenue ratio
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
      text,
      scaleNote: bsExtraction.scaleNote,
      companyName: bsExtraction.companyName,
      existingRd: hasValidRd ? existingRdItem!.value : null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    console.log("[rd:resolution]", rdResolution);

    if (!hasValidRd && rdResolution.rAndDExpense != null && rdResolution.rAndDExpense > 0) {
      const basisPart = rdResolution.rAndDPeriodBasis
        ? `:basis=${rdResolution.rAndDPeriodBasis}`
        : "";
      const source =
        rdResolution.method === "estimated_from_revenue_ratio"
          ? `heuristic:rd:estimated_from_revenue_ratio:pct=${rdResolution.rAndDPercentUsed ?? 0}${basisPart}`
          : rdResolution.method === "derived_from_rd_tax_or_capitalization"
            ? `heuristic:rd:derived_from_rd_tax_or_capitalization${basisPart}`
            : `heuristic:rd:extracted${basisPart}`;

      if (existingRdItem) {
        existingRdItem.value = rdResolution.rAndDExpense;
        existingRdItem.label = "R&D expense";
        existingRdItem.source = source;
      } else {
        cfItems.push({
          tag: "ResearchAndDevelopmentExpense",
          label: "R&D expense",
          value: rdResolution.rAndDExpense,
          period,
          source,
        });
      }
    }
    console.log(
      "[rd:final-cfItem]",
      cfItems.find((i) => i.tag === "ResearchAndDevelopmentExpense") ?? null
    );

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
