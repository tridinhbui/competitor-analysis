import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
import { shouldRunExtraction } from "@/lib/llmExtractionGuards";
import { extractPdfFinancialValue, type PdfFinancialMetric } from "@/lib/pdfFinancialValueExtractor";
import type { BSItem, FootnoteItem, EarningsNarrative } from "@/types/analysis";
import { STRICT_PROVENANCE_EXTRACTOR_SYSTEM } from "@/lib/prompts/strictProvenanceExtractor";
import {
  resolveRnDExpense,
  extractShareRepurchasesHeuristic,
  extractTotalEquityHeuristic,
  computeBalanceGapPct,
} from "@/lib/heuristics";
import { debugLog, warnLog } from "@/lib/debugLogger";

export const runtime = "nodejs";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Helpers: DRY JSON parsing & dynamic token budget
// ---------------------------------------------------------------------------

/** Safely parse an AI call's JSON content with typed fallback. */
function parseJsonCall<T>(call: { content: string | null }, fallback: T): T {
  if (!call.content) return fallback;
  try { return JSON.parse(call.content) as T; } catch { return fallback; }
}

/** Scale max_tokens budget based on input text length. */
function tokensFor(text: string, min = 1500, max = 4000): number {
  return Math.min(max, Math.max(min, Math.ceil(text.length / 15)));
}

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
  if (s === "" || s === "N/A" || s === "n/a" || s === "-" || s === "â€”" || s === "â€“") return 0;
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
// Section detection Ã¢â‚¬â€ find the right text for each AI call
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

  // Equity statement Ã¢â‚¬â€ SBC is sometimes only shown here (e.g. recently-IPO'd companies)
  const equityText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders).?\s+equity/i,
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+equity/i,
  ], 8_000);

  // Combine IS + CF + equity for the income/cashflow call
  const isCfText = [isText, cfText, equityText].filter(Boolean).join("\n\n---\n\n");

  // Combine MD&A + Notes for qualitative call
  const qualText = [mdaText, notesText].filter(Boolean).join("\n\n---\n\n");

  // Segment text Ã¢â‚¬â€ combine segment section + MD&A (often has segment breakdowns)
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
    debugLog("[analyze-pdf:repair]", {
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
    debugLog("[analyze-pdf:repair]", {
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


// ---------------------------------------------------------------------------
// POST handler Ã¢â‚¬â€ 3 parallel AI calls
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

  // Split text into sections (â‰¥500 chars, financial keywords passed guard)
  const { bsText, isCfText, qualText, segmentText } = extractSections(filingText);

  // Fallback: if section detection found nothing, use the full text (truncated)
  const bsInput = bsText.length > 500 ? bsText : filingText.slice(0, 80_000);
  const isCfInput = isCfText.length > 500 ? isCfText : filingText.slice(0, 80_000);
  const qualInput = qualText.length > 500 ? qualText : filingText.slice(0, 60_000);
  const segInput = segmentText.length > 300 ? segmentText : filingText.slice(0, 60_000);

  try {
    // Run 5 AI calls in parallel (4 extraction + 1 non-recurring)
    const [bsCall, isCfCall, qualCall, segCall, nonRecurringItems] = await Promise.all([
      callOpenAI(apiKey, model, BS_PROMPT, `Extract balance sheet data:\n\n${bsInput}`, tokensFor(bsInput)),
      callOpenAI(apiKey, model, IS_CF_PROMPT, `Extract income statement and cash flow data:\n\n${isCfInput}`, tokensFor(isCfInput)),
      callOpenAI(apiKey, model, QUALITATIVE_PROMPT, `Extract qualitative insights:\n\n${qualInput}`, tokensFor(qualInput)),
      callOpenAI(apiKey, model, SEGMENT_PROMPT, `Extract segment data:\n\n${segInput}`, tokensFor(segInput, 1000, 3000)),
      extractNonRecurringItems(filingText, apiKey, model),
    ]);

    const aiErrors = [bsCall, isCfCall, qualCall, segCall]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));

    if (aiErrors.length > 0) {
      warnLog("[analyze-pdf] OpenAI extraction warnings:", aiErrors);
    }

    // Parse all AI responses (DRY helper replaces 4 repetitive try/catch blocks)
    const bsExtraction = parseJsonCall<BsExtraction>(bsCall, {});
    const isCfExtraction = parseJsonCall<IsCfExtraction>(isCfCall, {});
    const qualExtraction = parseJsonCall<QualExtraction>(qualCall, {});
    const segExtraction = parseJsonCall<SegmentExtraction>(segCall, {});

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

    // Build BSItem arrays with exact tags + PDF provenance when model provides it.
    // Keep compatibility with legacy model JSON shape (`items: [{tag,label,value}]`).
    const bsFromParsed = bsParsed.items
      .filter((it) => BS_TAG_SET.has(String(it.tag ?? "")))
      .map((it) => rawAiToBSItem(it, period, "bs"))
      .filter((x): x is BSItem => x != null);
    const bsFromLegacy = toBsItems(
      (bsExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => BS_TAG_SET.has(String(it.tag ?? ""))),
      period,
      "AI:bs"
    );
    const bsItems: BSItem[] = dedupeByTagPreferPdf([...bsFromParsed, ...bsFromLegacy]);

    // Guard: only run equity heuristic if AI equity is missing or zero
    const existingEquityItem = bsItems.find((item) => item.tag === "StockholdersEquity");
    const equityMissing = existingEquityItem == null || Math.abs(existingEquityItem.value) === 0;
    if (equityMissing) {
      const equityCandidate = extractTotalEquityHeuristic(filingText, scaleForHeuristics);
      if (equityCandidate.totalEquity != null) {
        const assetsValue = bsItems.find((item) => item.tag === "Assets")?.value ?? null;
        const liabilitiesValue = bsItems.find((item) => item.tag === "Liabilities")?.value ?? null;
        const existingEquityValue = existingEquityItem?.value ?? null;
        const existingEquityLooksCompanySpecific = existingEquityItem
          ? /^company\s+shareholders?['\u2019]?\s+equity/i.test(existingEquityItem.label)
          : false;

        const currentGap = computeBalanceGapPct(assetsValue, liabilitiesValue, existingEquityValue);
        const candidateGap = computeBalanceGapPct(assetsValue, liabilitiesValue, equityCandidate.totalEquity);

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
            existingEquityItem.label = equityCandidate.labelUsed ?? existingEquityItem.label;
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

        debugLog("[equity:heuristic-candidate]", {
          selectedLabel: equityCandidate.labelUsed,
          selectedValue: equityCandidate.totalEquity,
          confidence: equityCandidate.confidence,
          shouldUseCandidate,
          currentGap,
          candidateGap,
        });
      }
    }

    const cfFromParsed = isCfParsed.items
      .filter((it) => CF_TAG_SET.has(String(it.tag ?? "")))
      .map((it) => rawAiToBSItem(it, period, "cf"))
      .filter((x): x is BSItem => x != null);
    const cfFromLegacy = toBsItems(
      (isCfExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => CF_TAG_SET.has(String(it.tag ?? ""))),
      period,
      "AI:cf"
    );
    const cfItems: BSItem[] = dedupeByTagPreferPdf([...cfFromParsed, ...cfFromLegacy]);

    // Hard backfill for core dashboard fields when AI coverage is weak in production.
    for (const metric of ["totalAssets", "cashAndEquivalents"] as const) {
      repairCriticalFinancialValue(bsItems, metric, filingText, scaleForHeuristics, period);
    }
    for (const metric of [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "operatingIncome",
      "netIncome",
      "operatingCashFlow",
      "capitalExpenditures",
    ] as const) {
      repairCriticalFinancialValue(cfItems, metric, filingText, scaleForHeuristics, period);
    }

    // Heuristic fallback: run when the AI either missed repurchases entirely or
    // extracted a zero/invalid value (e.g. model returned 0 for a non-zero buyback).
    const existingRepurchase = cfItems.find(
      (i) => i.tag === "PaymentsForRepurchaseOfCommonStock"
    );
    const hasValidRepurchase =
      existingRepurchase != null && Math.abs(existingRepurchase.value) > 0;
    debugLog("[repurchase:guard] hasValidRepurchase:", hasValidRepurchase, "existing value:", existingRepurchase?.value ?? "none");
    if (!hasValidRepurchase) {
      const heuristicValue = extractShareRepurchasesHeuristic(
        filingText,
        scaleForHeuristics
      );
      debugLog("[repurchase:heuristic] heuristicValue:", heuristicValue);
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
    debugLog("[repurchase:final-cfItem]", cfItems.find((i) => i.tag === "PaymentsForRepurchaseOfCommonStock") ?? null);

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
    debugLog("[debt-repay:classification]", {
      label: debtRepaymentLabel,
      directLt: directLtDebtRepayItem?.value ?? null,
      paymentsOnDebt: paymentsOnDebtItem?.value ?? null,
      hasShortTermRepayments,
      hasConflictingDebtBreakdown,
    });

    // R&D fallback chain:
    // We only auto-fill when an explicit R&D line is found in the PDF text.
    // If not explicit, leave missing so UI shows "Ã¢â‚¬â€" instead of forced estimates.
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
      scaleNote: scaleForHeuristics,
      companyName: mergedCompanyName,
      existingRd: hasValidRd ? existingRdItem!.value : null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    debugLog("[rd:resolution]", rdResolution);

    // Inline guards (not a precomputed boolean) so TS narrows rAndDExpense to number.
    if (
      !hasValidRd &&
      rdResolution.rAndDExpense != null &&
      rdResolution.rAndDExpense > 0 &&
      rdResolution.method === "extracted"
    ) {
      const rdExpense = rdResolution.rAndDExpense;
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
      debugLog("[rd:skip-backfill]", {
        reason: "non-explicit or unavailable R&D value",
        method: rdResolution.method,
        candidate: rdResolution.rAndDExpense,
      });
    }
    debugLog(
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
        charsExtracted: body.chars ?? filingText.length,
        periodEnd: period,
        confidence: "low",
        extractionMethod: "pdf-ai-partial",
      });

      warnLog("[analyze-pdf] Degraded extraction mode:", reasons);

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
      charsExtracted: body.chars ?? filingText.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });
    debugLog(
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

