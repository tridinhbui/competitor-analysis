import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
import type { BSItem, FootnoteItem, EarningsNarrative } from "@/types/analysis";
import { STRICT_PROVENANCE_EXTRACTOR_SYSTEM } from "@/lib/prompts/strictProvenanceExtractor";

export const runtime = "nodejs";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Exact XBRL tags that assembleAnalysis actually uses via find()/findOrNull()
// ---------------------------------------------------------------------------

const BS_PROMPT =
  STRICT_PROVENANCE_EXTRACTOR_SYSTEM +
  `
CALL-SPECIFIC: BALANCE SHEET ONLY
Return JSON with "meta" and "items" exactly as defined in the system rules (provenance fields required per item).

Items MUST use ONLY these EXACT tags (do not output income or cash flow tags in this call):
- Assets -> Total assets
- AssetsCurrent -> Total current assets
- AssetsNoncurrent -> Total non-current assets
- CashAndCashEquivalentsAtCarryingValue -> Cash and cash equivalents
- ShortTermInvestments -> Short-term investments / marketable securities
- AccountsReceivableNet -> Accounts receivable, net (trade receivables)
- AccountsReceivableNetCurrent -> Accounts receivable current
- InventoryNet -> Inventories
- PrepaidExpenseAndOtherAssetsCurrent -> Prepaid expenses & other current assets
- PropertyPlantAndEquipmentNet -> Property, plant & equipment, net
- Goodwill -> Goodwill
- IntangibleAssetsNet -> Intangible assets, net
- OtherAssetsNoncurrent -> Other non-current assets
- DeferredIncomeTaxAssetsNet -> Deferred income tax assets
- Liabilities -> Total liabilities
- LiabilitiesCurrent -> Total current liabilities
- LiabilitiesNoncurrent -> Total non-current / long-term liabilities
- AccountsPayable -> Accounts payable (trade payables)
- AccruedLiabilitiesCurrent -> Accrued expenses / accrued liabilities
- DeferredRevenueCurrent -> Deferred revenue (current)
- DebtCurrent -> Current portion of long-term debt / short-term borrowings / notes payable current
- LongTermDebtNoncurrent -> Long-term debt (non-current portion)
- LongTermDebt -> Long-term debt (if only one debt line is shown)
- ShortTermBorrowings -> Short-term borrowings / revolving credit (if separate from current portion of LT debt)
- LongTermDebtCurrent -> Current maturities of long-term debt (if shown as separate line from DebtCurrent)
- OperatingLeaseLiabilityNoncurrent -> Operating lease liabilities (non-current)
- FinanceLeaseLiabilityNoncurrent -> Finance lease obligations (non-current portion)
- PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent -> Pension / OPEB obligations (non-current)
- RedeemableNoncontrollingInterestEquityCarryingAmount -> Redeemable noncontrolling interests (mezzanine)
- StockholdersEquity -> Total stockholders' equity / shareholders' equity (NET after treasury & AOCI)
- CommonStockValue -> Common stock
- AdditionalPaidInCapital -> Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit -> Retained earnings / accumulated deficit
- TreasuryStockValue -> Treasury stock (NEGATIVE when parenthesized)
- AccumulatedOtherComprehensiveIncomeLoss -> AOCI
- LiabilitiesAndStockholdersEquity -> Total liabilities and stockholders' equity
- MinorityInterest -> Noncontrolling interests inside total equity

Balance-sheet rules:
- Extract the most recent balance sheet column (latest "As of" / rightmost data column if clearly labeled).
- For every item set statementType to "balance_sheet".
- periodBasis: use "unknown" for typical point-in-time balances unless clearly fiscal year-end only.
- If a line item matches multiple tags, pick the most specific one.
- ALL parenthesized values (1,234) are NEGATIVE where applicable (TreasuryStockValue, AOCI, etc.).
- TreasuryStockValue MUST be negative when shown in parentheses.
- StockholdersEquity: prefer the FINAL total line; if Company vs Total exist, choose TOTAL (includes NCI).
- Validate Assets ~ Liabilities + Equity; if mismatch, re-check StockholdersEquity.
- Do NOT invent numbers.
`;

const IS_CF_PROMPT =
  STRICT_PROVENANCE_EXTRACTOR_SYSTEM +
  `
CALL-SPECIFIC: INCOME STATEMENT + CASH FLOW (+ equity-statement SBC if only shown there)
Return JSON with "meta" and "items" exactly as defined in the system rules (provenance fields required per item).

Items MUST use ONLY these EXACT tags:

INCOME STATEMENT:
- Revenues -> Net sales / sales / net revenue / total revenue (food companies often label "Sales")
- CostOfGoodsSold -> Cost of goods sold / cost of sales / cost of products sold
- CostOfGoodsAndServicesSold -> Cost of goods and services sold
- CostOfRevenue -> Cost of revenue (exact label)
- GrossProfit -> Gross profit (or compute Revenues - COGS if clearly implied)
- SellingGeneralAndAdministrativeExpense -> SG&A
- ResearchAndDevelopmentExpense -> R&D
- OperatingExpenses -> Total operating expenses (if shown as a total)
- OperatingIncomeLoss -> Operating income / income from operations / operating profit
- InterestExpense -> Interest expense (positive)
- InterestIncome -> Interest income
- IncomeTaxExpenseBenefit -> Income tax expense / provision for income taxes
- NetIncomeLoss -> Net income / net earnings / attributable lines
- EarningsPerShareBasic -> Basic EPS (per-share; unit per-share; NOT millions)
- EarningsPerShareDiluted -> Diluted EPS (per-share; unit per-share)
- WeightedAverageSharesBasic -> Weighted average shares basic (millions; unit shares-millions)
- WeightedAverageSharesDiluted -> Weighted average shares diluted (millions; unit shares-millions)

CASH FLOW:
- DepreciationDepletionAndAmortization -> D&A
- DepreciationAndAmortization -> alternative D&A tag
- Depreciation -> Depreciation only
- AmortizationOfIntangibleAssets -> Amortization of intangibles
- ShareBasedCompensation -> SBC (check equity statement if missing from CF)
- NetCashProvidedByOperatingActivities -> Net cash from operating activities (continuing if split)
- PaymentsToAcquirePropertyPlantAndEquipment -> CapEx (POSITIVE outflow magnitude)
- NetCashProvidedByInvestingActivities -> Net cash from investing activities
- ProceedsFromIssuanceOfLongTermDebt -> Debt issuance (POSITIVE)
- RepaymentsOfLongTermDebt -> LT debt repayments ONLY when label explicitly long-term (POSITIVE)
- RepaymentsOfShortTermDebt -> ST debt repayments (POSITIVE)
- RepaymentsOfDebt -> Mixed / ambiguous debt payments (POSITIVE)
- RepaymentsOfCommercialPaper -> Commercial paper repayments (POSITIVE)
- PaymentsOfDividends -> Dividends paid (POSITIVE even if filing shows negative)
- PaymentsOfDividendsCommonStock -> Common dividends (POSITIVE)
- PaymentsForRepurchaseOfCommonStock -> Share repurchases / buybacks (POSITIVE; prefer financing CF dollars)
- NetCashProvidedByFinancingActivities -> Net cash from financing activities

IS/CF rules:
- For a quarterly 10-Q dashboard, prefer **Three months ended** column (periodBasis "quarter"), not YTD, unless only YTD is available.
- CapEx, debt repayments, dividends, buybacks: POSITIVE magnitudes as specified above.
- Interest expense POSITIVE.
- Operating income and net income may be negative (losses).
- "Sales" at top of consolidated income statement = Revenues; do not confuse with SG&A segment "sales".
- FCF is computed downstream from OCF and CapEx only.
- Debt repayment tag rules: ambiguous "Payments on debt" -> RepaymentsOfDebt; explicit LT -> RepaymentsOfLongTermDebt; commercial paper -> RepaymentsOfCommercialPaper.
- Do NOT invent numbers.
`;

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

interface ExtractionMeta {
  companyName?: string | null;
  periodEnd?: string | null;
  filingType?: string | null;
  scaleNote?: string;
  confidence?: string;
}

/** AI row with optional provenance (strict schema) or legacy { tag, label, value }. */
interface RawAiItem {
  tag?: string;
  label?: string;
  value?: number | string | null;
  valueRaw?: string | null;
  unit?: string | null;
  statementType?: string | null;
  periodBasis?: string | null;
  page?: number | null;
  rowLabel?: string | null;
  columnLabel?: string | null;
  source?: string | null;
  notes?: string | null;
}

interface BsExtraction {
  meta?: ExtractionMeta;
  companyName?: string | null;
  periodEnd?: string | null;
  scaleNote?: string;
  items?: RawAiItem[];
}

interface IsCfExtraction {
  meta?: ExtractionMeta;
  items?: RawAiItem[];
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

const BS_TAG_SET = new Set([
  "Assets", "AssetsCurrent", "AssetsNoncurrent", "CashAndCashEquivalentsAtCarryingValue",
  "ShortTermInvestments", "AccountsReceivableNet", "AccountsReceivableNetCurrent", "InventoryNet",
  "PrepaidExpenseAndOtherAssetsCurrent", "PropertyPlantAndEquipmentNet", "Goodwill", "IntangibleAssetsNet",
  "OtherAssetsNoncurrent", "DeferredIncomeTaxAssetsNet", "Liabilities", "LiabilitiesCurrent", "LiabilitiesNoncurrent",
  "AccountsPayable", "AccruedLiabilitiesCurrent", "DeferredRevenueCurrent", "DebtCurrent", "LongTermDebtNoncurrent",
  "LongTermDebt", "ShortTermBorrowings", "LongTermDebtCurrent", "OperatingLeaseLiabilityNoncurrent",
  "FinanceLeaseLiabilityNoncurrent", "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent",
  "RedeemableNoncontrollingInterestEquityCarryingAmount", "StockholdersEquity", "CommonStockValue",
  "AdditionalPaidInCapital", "RetainedEarningsAccumulatedDeficit", "TreasuryStockValue",
  "AccumulatedOtherComprehensiveIncomeLoss", "LiabilitiesAndStockholdersEquity", "MinorityInterest",
]);

const CF_TAG_SET = new Set([
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "CostOfGoodsSold", "CostOfGoodsAndServicesSold", "CostOfRevenue", "GrossProfit",
  "SellingGeneralAndAdministrativeExpense", "ResearchAndDevelopmentExpense", "OperatingExpenses",
  "OperatingIncomeLoss", "InterestExpense", "InterestIncome", "IncomeTaxExpenseBenefit", "NetIncomeLoss",
  "EarningsPerShareBasic", "EarningsPerShareDiluted", "WeightedAverageSharesBasic", "WeightedAverageSharesDiluted",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation", "AmortizationOfIntangibleAssets",
  "ShareBasedCompensation", "NetCashProvidedByOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
  "NetCashProvidedByInvestingActivities", "ProceedsFromIssuanceOfLongTermDebt", "RepaymentsOfLongTermDebt",
  "RepaymentsOfShortTermDebt", "RepaymentsOfDebt", "RepaymentsOfCommercialPaper", "PaymentsOfDividends",
  "PaymentsOfDividendsCommonStock", "PaymentsForRepurchaseOfCommonStock", "NetCashProvidedByFinancingActivities",
]);

function parseAiEnvelope(raw: unknown): { meta: ExtractionMeta; items: RawAiItem[] } {
  const meta: ExtractionMeta = {};
  const items: RawAiItem[] = [];
  if (!raw || typeof raw !== "object") return { meta, items };
  const o = raw as Record<string, unknown>;
  if (o.meta && typeof o.meta === "object") {
    const m = o.meta as Record<string, unknown>;
    if ("companyName" in m) meta.companyName = m.companyName as string | null;
    if ("periodEnd" in m) meta.periodEnd = m.periodEnd as string | null;
    if ("filingType" in m) meta.filingType = m.filingType as string | null;
    if ("scaleNote" in m && m.scaleNote != null) meta.scaleNote = String(m.scaleNote);
    if ("confidence" in m && m.confidence != null) meta.confidence = String(m.confidence);
  }
  if (meta.companyName === undefined && "companyName" in o) meta.companyName = o.companyName as string | null;
  if (meta.periodEnd === undefined && "periodEnd" in o) meta.periodEnd = o.periodEnd as string | null;
  if (meta.scaleNote === undefined && "scaleNote" in o && o.scaleNote != null) meta.scaleNote = String(o.scaleNote);

  const arr = o.items;
  if (!Array.isArray(arr)) return { meta, items };
  for (const it of arr) {
    if (it && typeof it === "object" && typeof (it as RawAiItem).tag === "string") {
      items.push(it as RawAiItem);
    }
  }
  return { meta, items };
}

function rowLabelForSource(it: RawAiItem): string {
  const r =
    String(it.rowLabel ?? "").trim() ||
    String(it.label ?? "").trim() ||
    String(it.tag ?? "").trim() ||
    "row";
  return r.replace(/"/g, "'").slice(0, 120);
}

function buildProvenanceSource(it: RawAiItem, tag: string, aiPrefix: "bs" | "cf"): string {
  const s = typeof it.source === "string" ? it.source.trim() : "";
  if (/^PDF:p\d+/i.test(s)) return s;
  const pg = it.page;
  if (pg != null && Number.isFinite(Number(pg))) {
    const p = Math.max(1, Math.floor(Number(pg)));
    return `PDF:p${p}:"${rowLabelForSource(it)}"`;
  }
  return `AI:${aiPrefix}:${tag}`;
}

function periodTypeFromItem(it: RawAiItem, kind: "bs" | "cf"): BSItem["period_type"] | undefined {
  if (kind === "bs") return "balance_sheet";
  const b = String(it.periodBasis ?? "").toLowerCase();
  if (b === "quarter") return "quarter";
  if (b === "ytd") return "ytd";
  if (b === "annual") return "annual";
  return undefined;
}

function itemValueForTag(tag: string, v: number | string | null | undefined): number {
  if (v == null) return 0;
  const s = typeof v === "string" ? v.trim() : String(v);
  if (s === "" || s === "N/A" || s === "n/a" || s === "-" || s === "—" || s === "–") return 0;
  const cleaned = s.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  if (tag === "EarningsPerShareBasic" || tag === "EarningsPerShareDiluted") {
    return Math.round(n * 10000) / 10000;
  }
  if (tag === "WeightedAverageSharesBasic" || tag === "WeightedAverageSharesDiluted") {
    return Math.round(n * 1000) / 1000;
  }
  return Math.round(n);
}

function rawAiToBSItem(it: RawAiItem, period: string, kind: "bs" | "cf"): BSItem | null {
  const tag = String(it.tag ?? "").trim();
  if (!tag) return null;
  return {
    tag,
    label: String(it.label ?? tag),
    value: itemValueForTag(tag, it.value),
    period,
    source: buildProvenanceSource(it, tag, kind === "bs" ? "bs" : "cf"),
    period_type: periodTypeFromItem(it, kind),
  };
}

function dedupeByTagPreferPdf(items: BSItem[]): BSItem[] {
  const m = new Map<string, BSItem>();
  const pdfFirst = (s: string) => /^PDF:p/i.test(s);
  const rankPeriod = (p: BSItem["period_type"] | undefined) =>
    p === "quarter" ? 3 : p === "ytd" ? 2 : p === "annual" ? 1 : 0;
  for (const it of items) {
    const prev = m.get(it.tag);
    if (!prev) {
      m.set(it.tag, it);
      continue;
    }
    let replace = false;
    if (pdfFirst(it.source) && !pdfFirst(prev.source)) replace = true;
    else if (pdfFirst(it.source) === pdfFirst(prev.source)) {
      if (rankPeriod(it.period_type) > rankPeriod(prev.period_type)) replace = true;
    }
    if (replace) m.set(it.tag, it);
  }
  return [...m.values()];
}

/** Map meta.scaleNote ("millions", "unknown", etc.) to heuristic helpers. */
function normalizeScaleNote(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const l = s.toLowerCase();
  if (l.includes("thousand")) return "thousands";
  if (l.includes("billion")) return "billions";
  if (l.includes("million")) return "millions";
  return undefined;
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

function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "string") {
    if (v === "â€“" || v === "â€”" || v === "-" || v === "N/A" || v === "n/a") return 0;
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
  const bsInput = bsText.length > 500 ? bsText : text.slice(0, 80_000);
  const isCfInput = isCfText.length > 500 ? isCfText : text.slice(0, 80_000);
  const qualInput = qualText.length > 500 ? qualText : text.slice(0, 60_000);
  const segInput = segmentText.length > 300 ? segmentText : text.slice(0, 60_000);

  try {
    // Run 5 AI calls in parallel (4 extraction + 1 non-recurring)
    const [bsCall, isCfCall, qualCall, segCall, nonRecurringItems] = await Promise.all([
      callOpenAI(apiKey, model, BS_PROMPT, `Extract balance sheet data:\n\n${bsInput}`, 4000),
      callOpenAI(apiKey, model, IS_CF_PROMPT, `Extract income statement and cash flow data:\n\n${isCfInput}`, 4000),
      callOpenAI(apiKey, model, QUALITATIVE_PROMPT, `Extract qualitative insights:\n\n${qualInput}`, 4000),
      callOpenAI(apiKey, model, SEGMENT_PROMPT, `Extract segment data:\n\n${segInput}`, 3000),
      extractNonRecurringItems(text, apiKey, model),
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

    const bsParsed = parseAiEnvelope(bsExtraction);
    const isCfParsed = parseAiEnvelope(isCfExtraction);

    const period =
      bsParsed.meta.periodEnd ??
      isCfParsed.meta.periodEnd ??
      bsExtraction.periodEnd ??
      new Date().toISOString().slice(0, 10);

    const mergedScaleRaw =
      bsParsed.meta.scaleNote ??
      bsExtraction.scaleNote ??
      isCfParsed.meta.scaleNote;
    const scaleForHeuristics =
      normalizeScaleNote(mergedScaleRaw) ?? bsExtraction.scaleNote;

    const mergedCompanyName =
      bsParsed.meta.companyName ??
      isCfParsed.meta.companyName ??
      bsExtraction.companyName ??
      null;

    // Build BSItem arrays with exact tags + PDF provenance when model provides it
    const bsItems: BSItem[] = dedupeByTagPreferPdf(
      bsParsed.items
        .filter((it) => BS_TAG_SET.has(String(it.tag ?? "")))
        .map((it) => rawAiToBSItem(it, period, "bs"))
        .filter((x): x is BSItem => x != null)
    );

    const equityCandidate = extractTotalEquityHeuristic(text, scaleForHeuristics);
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

    const cfItems: BSItem[] = dedupeByTagPreferPdf(
      isCfParsed.items
        .filter((it) => CF_TAG_SET.has(String(it.tag ?? "")))
        .map((it) => rawAiToBSItem(it, period, "cf"))
        .filter((x): x is BSItem => x != null)
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
        text,
        scaleForHeuristics
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
      text,
      scaleNote: scaleForHeuristics,
      companyName: mergedCompanyName,
      existingRd: hasValidRd ? existingRdItem!.value : null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    console.log("[rd:resolution]", rdResolution);

    const shouldBackfillRd =
      !hasValidRd &&
      rdResolution.rAndDExpense != null &&
      rdResolution.rAndDExpense > 0 &&
      rdResolution.method === "extracted";

    if (shouldBackfillRd) {
      const basisPart = rdResolution.rAndDPeriodBasis
        ? `:basis=${rdResolution.rAndDPeriodBasis}`
        : "";
      const source = `heuristic:rd:extracted${basisPart}`;

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

      const degradedAnalysis = assembleAnalysis(bsItems, cfItems, {
        source: "pdf",
        companyName: mergedCompanyName ?? undefined,
        fileName: body.fileName,
        pagesRead: body.pages,
        charsExtracted: body.chars ?? text.length,
        periodEnd: period,
        confidence: "low",
        extractionMethod: "pdf-ai-partial",
      });

      console.warn("[analyze-pdf] Degraded extraction mode:", reasons);

      return NextResponse.json({
        analysis: degradedAnalysis,
        degraded: true,
        warning: `AI extraction coverage low (${reasons.join("; ")}). Returned partial analysis instead of failing request.`,
      });
    }

    // Assemble full analysis
    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: mergedCompanyName ?? undefined,
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

