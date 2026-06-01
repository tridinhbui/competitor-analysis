import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
import { shouldRunExtraction } from "@/lib/llmExtractionGuards";
import {
  buildHeuristicPdfProvenance,
  extractPdfFinancialValue,
  type PdfFinancialMetric,
} from "@/lib/pdfFinancialValueExtractor";
import type { BSItem, FootnoteItem, EarningsNarrative, FullAnalysis, NonRecurringItem } from "@/types/analysis";
import { STRICT_PROVENANCE_EXTRACTOR_SYSTEM } from "@/lib/prompts/strictProvenanceExtractor";
import {
  resolveRnDExpense,
  extractShareRepurchasesHeuristic,
  extractTotalEquityHeuristic,
  extractTotalLiabilitiesHeuristic,
  computeBalanceGapPct,
} from "@/lib/heuristics";
import { applyDividendsDeclaredNoteFallback } from "@/lib/dividendsNoteHeuristic";
import { debugLog, warnLog } from "@/lib/debugLogger";
import {
  buildFinancialsPartial,
  encodePdfAnalyzeSse,
  type PdfAnalyzeStreamEvent,
} from "@/lib/pdfAiPartial";
import {
  classifySegmentType,
  extractSegmentsHeuristic as extractSegmentsHeuristicShared,
  parseSegmentNumberToken,
} from "@/lib/segmentExtractionHeuristics";

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
- CashAndCashEquivalents -> Cash and cash equivalents (alternate tag when the filing uses this label)
- ShortTermInvestments -> Short-term investments / marketable securities
- AccountsReceivableNet -> Accounts receivable, net (trade receivables)
- AccountsReceivableNetCurrent -> Accounts receivable current
- InventoryNet -> Inventories
- PrepaidExpenseAndOtherAssetsCurrent -> Prepaid expenses & other current assets
- PropertyPlantAndEquipmentNet -> Property, plant & equipment, net; also match "Net Property, Plant, and Equipment", "Net property, plant and equipment", "PP&E, net", "Net PP&E"
- Goodwill -> Goodwill
- IntangibleAssetsNet -> Intangible assets, net
- OtherAssetsNoncurrent -> Other non-current assets
- DeferredIncomeTaxAssetsNet -> Deferred income tax assets
- Liabilities -> Total liabilities
- LiabilitiesCurrent -> Total current liabilities
- LiabilitiesNoncurrent -> Total non-current / long-term liabilities
- AccountsPayable -> Accounts payable (trade payables)
- AccountsPayableCurrent -> Accounts payable current (use if filer tags current AP separately; else use AccountsPayable)
- AccruedLiabilitiesCurrent -> Accrued expenses / accrued liabilities
- DeferredRevenueCurrent -> Deferred revenue (current)
- DebtCurrent -> Current portion of long-term debt / short-term borrowings / notes payable current; also match "Current portion of debt and finance leases", "Current maturities of debt", "Current portion of long-term debt and finance lease obligations"
- LongTermDebtNoncurrent -> Long-term debt (non-current portion); also match "Long-term Debt Less Current Maturities", "Long-term debt, less current maturities", "Long-term debt, net of current portion", "Long-term portion of debt", "Debt and finance leases, net of current portion", "Long-term debt and finance lease obligations, net of current portion"
- LongTermDebt -> Long-term debt (if only one debt line is shown)
- ShortTermBorrowings -> Short-term borrowings / revolving credit (if separate from current portion of LT debt)
- LongTermDebtCurrent -> Current maturities of long-term debt (if shown as separate line from DebtCurrent)
- GrossDebt -> Total debt (GROSS carrying amount per debt footnote — all borrowings; NOT the same as "Total long-term debt" alone)
- TotalNetDebtSupplemental -> "Total net debt" line from Key Financial Measures / supplemental tables only (not a ratio); used with cash to cross-check gross debt downstream
- Do NOT tag GrossDebt from lines that say only "Long-term debt", "Total long-term debt", or "Long-term debt, net" — those belong on LongTermDebtNoncurrent / LongTermDebt, not gross consolidated debt.
- OperatingLeaseLiabilityNoncurrent -> Operating lease liabilities (non-current)
- FinanceLeaseLiabilityNoncurrent -> Finance lease obligations (non-current portion)
- PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent -> Pension / OPEB obligations (non-current)
- RedeemableNoncontrollingInterestEquityCarryingAmount -> Redeemable noncontrolling interests (mezzanine)
- StockholdersEquity -> Total stockholders' equity / shareholders' equity / shareholders' investment / shareowners' equity / members' equity; also match "Total Shareholders' Investment", "Hormel Foods Corporation Shareholders' Investment", "Total shareowners' equity", "Total members' equity" (NET after treasury & AOCI)
- CommonStockValue -> Common stock
- AdditionalPaidInCapital -> Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit -> Retained earnings / accumulated deficit
- TreasuryStockValue -> Treasury stock (NEGATIVE when parenthesized)
- AccumulatedOtherComprehensiveIncomeLoss -> AOCI
- LiabilitiesAndStockholdersEquity -> Total liabilities and stockholders' equity / total liabilities and shareholders' investment; also match "Total Liabilities and Shareholders' Investment"
- MinorityInterest -> Noncontrolling interests inside total equity

Balance-sheet rules:
- Extract the most recent balance sheet column (latest "As of" / rightmost data column if clearly labeled).
- For every item set statementType to "balance_sheet".
- periodBasis: use "unknown" for typical point-in-time balances unless clearly fiscal year-end only.
- If a line item matches multiple tags, pick the most specific one.
- ALL parenthesized values (1,234) are NEGATIVE where applicable (TreasuryStockValue, AOCI, etc.).
- TreasuryStockValue MUST be negative when shown in parentheses.
- StockholdersEquity: prefer the FINAL total line; if Company vs Total exist, choose TOTAL (includes NCI); treat "Total Shareholders' Investment" as equity.
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
- EBITDA -> Company-reported EBITDA in **Other Key Financial Measures**, supplemental tables, or non-GAAP reconciliations (may differ from Operating Income + D&A)
- EarningsBeforeInterestTaxesDepreciationAmortization -> Same as EBITDA (XBRL-style tag)
- ReturnOnInvestedCapital -> Return on invested capital / ROIC as a **percentage** (e.g. 2.8 for 2.8%) when shown in Key Financial Measures or ratio tables
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

const FILING_IDENTITY_PROMPT = `You read the beginning of an SEC filing (HTML or text extracted from a PDF).

Return ONLY valid JSON with exactly these keys:
- "companyName": string | null — the legal/registrant name from the cover page (e.g. "APPLE INC"). Use null if not visible.
- "ticker": string | null — trading symbol only if explicitly printed on the cover (e.g. "Symbol", "Trading symbol", exchange listing). Never infer from the company name. Use null if absent.
- "filingType": "10-K" | "10-Q" | null — from explicit form title (Form 10-K, Form 10-Q, Annual Report on Form 10-K, Quarterly Report on Form 10-Q). Use null if ambiguous or missing.

Rules: Use only the excerpt provided. Do not invent tickers or form types.`;


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

/**
 * Deterministic segment fallback used when AI segment extraction is unavailable.
 * Expected row shape examples:
 * - "Retail 1,858 123 6.6% 2,127"
 * - "Foodservice | 987 | 141 | 14.3%"
 */
function extractSegmentsHeuristic(
  text: string
): NonNullable<SegmentExtraction["segments"]> {
  const candidateRows: Array<{
    segmentName: string;
    revenue: number | null;
    operatingIncome: number | null;
  }> = [];
  const rows = text
    .split(/\r?\n/)
    .map((r) => r.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
  const fallbackSegments = extractSegmentsHeuristicShared(text);
  if (fallbackSegments.length > 0) return fallbackSegments;
  const badNamePatterns = [
    /^(total|consolidated|subtotal|three months ended|nine months ended|segment results|reportable segments?)\b/i,
    /^(net sales|sales|revenue|operating income|gross profit|assets|liabilities|equity)\b/i,
    /\b(eliminations?|corporate|other)\b/i,
  ];
  const numericTokenRe = /\(?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?/g;

  for (const row of rows) {
    const firstNumber = row.search(/\(?\$?\d/);
    if (firstNumber <= 1) continue;
    const segmentName = row.slice(0, firstNumber).replace(/[$|:–\-]\s*$/, "").trim();
    if (!segmentName || segmentName.length > 40) continue;
    if (badNamePatterns.some((p) => p.test(segmentName))) continue;
    if (!/[a-z]/i.test(segmentName)) continue;

    const numericTokens = row.match(numericTokenRe) ?? [];
    if (numericTokens.length < 2) continue;
    const numbers = numericTokens
      .map(parseSegmentNumberToken)
      .filter((n): n is number => n != null);
    if (numbers.length < 2) continue;

    const revenue = numbers[0] > 0 ? numbers[0] : null;
    const operatingIncome = numbers[1];
    if (revenue == null) continue;
    if (Math.abs(revenue) < 10 || Math.abs(revenue) > 1_000_000) continue;

    candidateRows.push({ segmentName, revenue, operatingIncome });
  }

  const deduped = new Map<string, { revenue: number | null; operatingIncome: number | null }>();
  for (const row of candidateRows) {
    const key = row.segmentName.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || (row.revenue ?? 0) > (existing.revenue ?? 0)) {
      deduped.set(key, { revenue: row.revenue, operatingIncome: row.operatingIncome });
    }
  }

  return Array.from(deduped.entries())
    .map(([name, vals]) => ({
      segmentName: name
        .split(" ")
        .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" "),
      segmentType: classifySegmentType(name),
      revenue: vals.revenue,
      operatingIncome: vals.operatingIncome,
      depreciation: null,
      capitalExpenditures: null,
      totalAssets: null,
      volumeUnits: null,
      volumeUnitType: null,
    }))
    .slice(0, 8);
}

const BS_TAG_SET = new Set([
  "Assets", "AssetsCurrent", "AssetsNoncurrent",
  "CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents",
  "ShortTermInvestments", "AccountsReceivableNet", "AccountsReceivableNetCurrent", "InventoryNet",
  "PrepaidExpenseAndOtherAssetsCurrent", "PropertyPlantAndEquipmentNet", "Goodwill", "IntangibleAssetsNet",
  "OtherAssetsNoncurrent", "DeferredIncomeTaxAssetsNet", "Liabilities", "LiabilitiesCurrent", "LiabilitiesNoncurrent",
  "AccountsPayable", "AccountsPayableCurrent", "AccruedLiabilitiesCurrent", "DeferredRevenueCurrent", "DebtCurrent", "LongTermDebtNoncurrent",
  "LongTermDebt", "ShortTermBorrowings", "LongTermDebtCurrent", "GrossDebt", "TotalNetDebtSupplemental",
  "OperatingLeaseLiabilityNoncurrent",
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
  "OperatingIncomeLoss",
  "IncomeBeforeIncomeTaxes",
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
  "InterestExpense", "InterestIncome", "IncomeTaxExpenseBenefit", "NetIncomeLoss",
  "EBITDA", "EarningsBeforeInterestTaxesDepreciationAmortization",
  "ReturnOnInvestedCapital",
  "EarningsPerShareBasic", "EarningsPerShareDiluted", "WeightedAverageSharesBasic", "WeightedAverageSharesDiluted",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation", "AmortizationOfIntangibleAssets",
  "ShareBasedCompensation", "NetCashProvidedByOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
  "NetCashProvidedByInvestingActivities", "ProceedsFromIssuanceOfLongTermDebt", "RepaymentsOfLongTermDebt",
  "RepaymentsOfShortTermDebt", "RepaymentsOfDebt", "RepaymentsOfCommercialPaper", "PaymentsOfDividends",
  "PaymentsOfDividendsCommonStock", "PaymentsForRepurchaseOfCommonStock", "NetCashProvidedByFinancingActivities",
]);

const TAG_ALIASES: Record<string, string> = {
  // Balance sheet aliases seen in non-standard filings/model output
  PropertyPlantAndEquipment: "PropertyPlantAndEquipmentNet",
  PropertyPlantAndEquipmentGross: "PropertyPlantAndEquipmentNet",
  NetPropertyPlantAndEquipment: "PropertyPlantAndEquipmentNet",
  PropertyPlantEquipmentNet: "PropertyPlantAndEquipmentNet",
  AccountsReceivable: "AccountsReceivableNetCurrent",
  TradeAccountsReceivable: "AccountsReceivableNetCurrent",
  AccountsReceivableCurrent: "AccountsReceivableNetCurrent",
  LongTermDebtLessCurrentMaturities: "LongTermDebtNoncurrent",
  LongTermDebtNetOfCurrentPortion: "LongTermDebtNoncurrent",
  LongTermPortionOfDebt: "LongTermDebtNoncurrent",
  TotalShareholdersInvestment: "StockholdersEquity",
  ShareholdersInvestment: "StockholdersEquity",
  TotalLiabilitiesAndShareholdersInvestment: "LiabilitiesAndStockholdersEquity",

};

function canonicalTag(tag: string): string {
  const t = tag.trim();
  return TAG_ALIASES[t] ?? t;
}

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
  if (s === "" || s === "N/A" || s === "n/a" || s === "-" || s === "├óΓé¼ΓÇ¥" || s === "├óΓé¼ΓÇ£") return 0;
  const cleaned = s.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  if (tag === "EarningsPerShareBasic" || tag === "EarningsPerShareDiluted") {
    return Math.round(n * 10000) / 10000;
  }
  if (tag === "WeightedAverageSharesBasic" || tag === "WeightedAverageSharesDiluted") {
    return Math.round(n * 1000) / 1000;
  }
  // Preserve up to 2 decimal places so values like 23.56M don't get rounded to 24M.
  // The fmt() display function already shows ".xx" only when the value is non-integer.
  return Math.round(n * 100) / 100;
}

function rawAiToBSItem(it: RawAiItem, period: string, kind: "bs" | "cf"): BSItem | null {
  const tag = canonicalTag(String(it.tag ?? ""));
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

function detectScaleFromText(text: string): string | undefined {
  const normalized = text.toLowerCase();
  if (/in\s+thousands?,\s+except\s+(?:per\s+share|share)/i.test(normalized)) {
    return "thousands";
  }
  if (/amounts?\s+in\s+thousands/i.test(normalized)) return "thousands";
  if (/\(\s*in\s+thousands?\s*\)/i.test(normalized)) return "thousands";
  if (/dollars?\s+in\s+thousands/i.test(normalized)) return "thousands";
  if (/in\s+millions?,\s+except\s+(?:per\s+share|share)/i.test(normalized)) {
    return "millions";
  }
  if (/\(\s*in\s+millions?\s*\)/i.test(normalized)) return "millions";
  if (/dollars?\s+in\s+millions/i.test(normalized)) return "millions";
  if (/in\s+billions?\b/i.test(normalized) || /\(\s*in\s+billions?\s*\)/i.test(normalized)) {
    return "billions";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Section detection ├â┬ó├óΓÇÜ┬¼├óΓé¼┬¥ find the right text for each AI call
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
      const idx = Math.max(0, match.index - 3000);
      // Skip if this offset is within an already-captured range
      const rounded = Math.floor(idx / 1000) * 1000;
      if (usedOffsets.has(rounded)) continue;
      usedOffsets.add(rounded);

      const remaining = Math.max(0, text.length - idx);
      const chunkLen = Math.min(maxLen, remaining);
      const slice = text.slice(idx, idx + chunkLen);
      chunks.push(slice);
      totalLen += slice.length;
      if (totalLen >= maxLen * 2) break; // cap total to avoid massive payloads
    }
    if (totalLen >= maxLen * 2) break;
  }

  return chunks.join("\n\n---\n\n");
}

/**
 * Capture deeply nested NOTE sections directly (e.g. "NOTE 20: ...") so we do not
 * miss material disclosures when early cross-references consume section budget.
 */
function extractKeyNoteBlocks(text: string, maxBlocks = 8, blockLen = 7_500): string {
  const blocks: string[] = [];
  const seen = new Set<number>();
  const noteHeaderRe =
    /^NOTE\s+([0-9]{1,2}|[IVXLC]{1,8})\s*[:.\-–—]\s*.*$/gim;
  let match: RegExpExecArray | null;

  while ((match = noteHeaderRe.exec(text)) !== null) {
    const idx = Math.max(0, match.index);
    const rounded = Math.floor(idx / 1000) * 1000;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    blocks.push(text.slice(idx, idx + blockLen));
    if (blocks.length >= maxBlocks) break;
  }

  return blocks.join("\n\n---\n\n");
}

function extractSections(text: string): {
  bsText: string;
  isCfText: string;
  qualText: string;
  segmentText: string;
  segText: string;
} {
  const bsText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?balance\s+sheet/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?financial\s+position/i,
    /total\s+current\s+assets\b/i,
    /current\s+assets\b/i,
  ], 32_000);

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

  // Anchor the real Notes header first (avoid matching cross-references like
  // "see Notes to Financial Statements, Note 17" in MD&A).
  const notesHeaderText = findSection(text, [
    /^notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements\b/gim,
  ], 60_000);
  const keyNotesText = extractKeyNoteBlocks(text);
  const notesFallbackText = findSection(text, [
    /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements/i,
  ], 20_000);
  const notesText = [notesHeaderText, keyNotesText, notesFallbackText]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const segText = findSection(text, [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
    /(?:beef|pork|chicken|prepared\s+foods?|packaged\s+meats?|international)\s+segment/i,
    /note\s+\d+[\.\:\-\s\u2014\u2013]+(?:segment|business\s+segment|operating\s+segment)/i,
  ], 25_000);

  // Equity statement ├â┬ó├óΓÇÜ┬¼├óΓé¼┬¥ SBC is sometimes only shown here (e.g. recently-IPO'd companies)
  const equityText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders).?\s+equity/i,
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+equity/i,
  ], 8_000);

  const keyMeasuresText = findSection(
    text,
    [
      /other\s+key\s+financial\s+measures/i,
      /key\s+financial\s+measures/i,
      /non-gaap\s+financial\s+measures/i,
      /supplemental\s+(?:financial\s+)?information/i,
    ],
    35_000
  );

  // Combine IS + CF + equity + supplemental key measures (EBITDA, gross/net debt often live here)
  const isCfText = [isText, cfText, equityText, keyMeasuresText]
    .filter(Boolean)
    .join("\n\n---\n\n");

  // Combine MD&A + Notes for qualitative call
  const qualText = [mdaText, notesText].filter(Boolean).join("\n\n---\n\n");

  // Segment text ├â┬ó├óΓÇÜ┬¼├óΓé¼┬¥ combine segment section + MD&A + notes (segment disclosures may be nested in notes)
  const segmentText = [segText, mdaText, notesText].filter(Boolean).join("\n\n---\n\n");

  return { bsText, isCfText, qualText, segmentText, segText };
}

function extractSegmentFallback(text: string): string {
  const sections: string[] = [];

  // Pattern 1: Explicit segment section headers
  const segPatterns = [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /(?:business\s+segments?|segment\s+information|segment\s+reporting|operating\s+segment(?:s)?)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
  ];
  for (const re of segPatterns) {
    const idx = text.search(re);
    if (idx !== -1) {
      sections.push(text.slice(Math.max(0, idx - 200), idx + 20_000));
      break;
    }
  }

  // Pattern 2: Note about segments in financial statements
  const noteIdx = text.search(/note\s+\d+[^\n]{0,80}(?:segment|business\s+segment|operating\s+segment|reportable\s+segment|segment\s+information)/i);
  if (noteIdx !== -1) {
    sections.push(text.slice(Math.max(0, noteIdx - 200), noteIdx + 18_000));
  }

  // Pattern 3: Tables that list well-known segment names (Tyson-style)
  const segTableIdx = text.search(
    /(?:^|\n)\s*(?:beef|pork|chicken|prepared\s+foods?|international)\b[^\n]{0,120}(?:\|[^\n]*\d|\s{2,}\(?\$?\d)/im
  );
  if (segTableIdx !== -1) {
    sections.push(text.slice(Math.max(0, segTableIdx - 800), segTableIdx + 14_000));
  }

  if (sections.length === 0) return "";
  return sections.join("\n\n---\n\n").slice(0, 45_000);
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

type CanonicalFilingType = "10-K" | "10-Q";

function parseCanonicalFilingType(
  raw: string | null | undefined
): CanonicalFilingType | undefined {
  if (raw == null) return undefined;
  const compact = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (compact === "10-K" || compact === "10K") return "10-K";
  if (compact === "10-Q" || compact === "10Q") return "10-Q";
  return undefined;
}

function heuristicFilingType(text: string): CanonicalFilingType | undefined {
  const cover = text.slice(0, 8000);
  const formQ = /\bFORM\s*10[\s\-]*Q\b/i.test(cover);
  const formK = /\bFORM\s*10[\s\-]*K\b/i.test(cover);
  if (formQ && !formK) return "10-Q";
  if (formK && !formQ) return "10-K";
  const qTitle = /\bQUARTERLY\s+REPORT\b/i.test(cover);
  const kTitle = /\bANNUAL\s+REPORT\b/i.test(cover);
  if (qTitle && !kTitle) return "10-Q";
  if (kTitle && !qTitle) return "10-K";
  return undefined;
}

async function detectFilingIdentity(
  apiKey: string,
  model: string,
  filingText: string,
  fileName?: string
): Promise<{
  companyName: string | null;
  ticker: string | null;
  filingType: CanonicalFilingType | null;
  error: string | null;
}> {
  const empty = {
    companyName: null as string | null,
    ticker: null as string | null,
    filingType: null as CanonicalFilingType | null,
    error: null as string | null,
  };
  const snippet = filingText.slice(0, 14_000);
  const user = `File name: ${fileName?.trim() || "(none)"}\n\n---\n${snippet}`;
  const res = await callOpenAI(apiKey, model, FILING_IDENTITY_PROMPT, user, 500);
  if (res.error) {
    return { ...empty, error: res.error };
  }
  if (!res.content) {
    return { ...empty, error: "empty identity response" };
  }
  try {
    const o = JSON.parse(res.content) as Record<string, unknown>;
    const companyName =
      typeof o.companyName === "string" && o.companyName.trim().length > 0
        ? o.companyName.trim()
        : null;
    let ticker: string | null = null;
    if (typeof o.ticker === "string") {
      const t = o.ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
      if (/^[A-Z]{1,6}$/.test(t)) ticker = t;
    }
    const filingType = parseCanonicalFilingType(
      typeof o.filingType === "string" ? o.filingType : null
    );
    return {
      companyName,
      ticker,
      filingType: filingType ?? null,
      error: null,
    };
  } catch {
    return { ...empty, error: "identity JSON parse failed" };
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
    return Math.round((negative ? -n : n) * 100) / 100;
  }
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
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

const REPAIR_OVERRIDE_METRICS = new Set<PdfFinancialMetric>([
  // Core financial statement totals most vulnerable to 1000x scaling errors.
  "totalAssets",
  "cashAndEquivalents",
  "revenue",
  "operatingIncome",
  "operatingCashFlow",
  "capitalExpenditures",
  "netIncome",
  "grossProfit",
  "costOfRevenue",
  "totalCurrentAssets",
  "totalCurrentLiabilities",
  "longTermDebtNoncurrent",
  "currentMaturitiesLongTermDebt",
  "shortTermBorrowings",
  "inventories",
  "propertyPlantAndEquipment",
  "retainedEarnings",
  "goodwill",
  "accountsPayable",
  "interestExpense",
  "incomeTaxExpense",
  "incomeBeforeIncomeTaxes",
  "stockBasedCompensation",
  "depreciationDepletionAndAmortization",
  "ebitda",
  "grossDebt",
  "supplementalNetDebt",
  "accountsReceivable",
]);

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
  const existingIsAi = existing?.source?.startsWith("AI:") ?? false;
  const heuristicOverridesWrongAi =
    REPAIR_OVERRIDE_METRICS.has(metric) && existingIsAi;

  // Safeguard: if the AI value is 100x+ LARGER than the heuristic, treat it as a unit
  // error (e.g. AI returned raw dollars when filing uses millions) and override with the
  // smaller heuristic value. Only fires when existing >> repaired, NOT the reverse,
  // so a correct AI value is never replaced by an inflated heuristic.
  const likelyScaleMismatchOverride =
    existingIsAi &&
    existingValue != null &&
    Math.abs(existingValue) > 1 &&
    Math.abs(repaired.value) > 1 &&
    Math.abs(existingValue) / Math.abs(repaired.value) >= 100;

  /** SCF "Dividends" vs footnote/derivative line with a tiny bogus $(8).
   *  Only fires when the existing AI value is genuinely tiny (<50M) — prevents
   *  overwriting a correct $684M with a heuristic-found $684,000M. */
  const dividendsHeuristicReplacesSuspiciousExisting =
    metric === "dividendsPaid" &&
    existingValue != null &&
    Math.abs(existingValue) < 50 &&
    Math.abs(repaired.value) > 35 &&
    Math.abs(repaired.value) >= Math.abs(existingValue) * 3;

  // AR: AI often picks up "Decrease in Accounts Receivable" from CF (~$54M)
  // instead of the BS balance (~$764M). Override when heuristic finds a
  // materially larger balance-sheet value with medium/high confidence.
  const arHeuristicOverride =
    metric === "accountsReceivable" &&
    existingValue != null &&
    repaired != null &&
    repaired.confidence !== "low" &&
    Math.abs(repaired.value) > Math.abs(existingValue) * 0.3;

  if (
    existingValue != null &&
    Math.abs(existingValue) > 1 &&
    !heuristicOverridesWrongAi &&
    !likelyScaleMismatchOverride &&
    !dividendsHeuristicReplacesSuspiciousExisting &&
    !arHeuristicOverride
  ) {
    return;
  }

  // Even for REPAIR_OVERRIDE_METRICS (heuristicOverridesWrongAi=true), refuse the
  // heuristic when its value is 100x+ LARGER than a plausible existing AI value.
  // That means the heuristic over-scaled (e.g. read "67,000" in a thousands-scale
  // supplemental section as 67,000M), not the AI.
  if (
    heuristicOverridesWrongAi &&
    existingValue != null &&
    Math.abs(existingValue) > 1 &&
    Math.abs(repaired.value) > 1 &&
    Math.abs(repaired.value) / Math.abs(existingValue) >= 100
  ) {
    return;
  }

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
    existing.source = buildHeuristicPdfProvenance(repaired, text);
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
      source: buildHeuristicPdfProvenance(repaired, text),
    });
  }
}

/**
 * Last-resort unit sanity guard.
 * If values appear 1000x inflated (raw dollars interpreted as millions),
 * normalize extreme magnitudes before analysis assembly.
 */
function normalizeLikelyScaleMismatches(
  items: BSItem[],
  scaleNote: string | undefined,
  bucket: "bs" | "cf"
): void {
  const normalizedScale = normalizeScaleNote(scaleNote);
  if (normalizedScale !== "millions" && normalizedScale !== "thousands") return;

  const skipTags = new Set([
    "EarningsPerShareBasic",
    "EarningsPerShareDiluted",
    "WeightedAverageSharesBasic",
    "WeightedAverageSharesDiluted",
  ]);

  // 5 trillion in "M" is already unusually large; beyond this is likely a unit bug.
  const extremeThreshold = 5_000_000;
  for (const item of items) {
    if (skipTags.has(item.tag)) continue;
    if (!Number.isFinite(item.value)) continue;
    if (Math.abs(item.value) < extremeThreshold) continue;

    const previous = item.value;
    item.value = Math.round(item.value / 1000);
    item.source = `${item.source}|unit-normalized:÷1000`;
    debugLog("[analyze-pdf:unit-normalize]", {
      bucket,
      tag: item.tag,
      previous,
      normalized: item.value,
      scaleNote: normalizedScale,
    });
  }
}

function attachSupplementalAnalysisData(
  analysis: FullAnalysis,
  qualExtraction: QualExtraction,
  nonRecurringItems: NonRecurringItem[],
  segExtraction: SegmentExtraction,
  segInput: string
): void {
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

  if (nonRecurringItems.length > 0) {
    analysis.nonRecurringItems = nonRecurringItems;
  }

  const aiSegments: NonNullable<SegmentExtraction["segments"]> =
    segExtraction.segments && Array.isArray(segExtraction.segments)
      ? segExtraction.segments
      : [];
  const aiHasBusinessSegments = aiSegments.some((s) => s.segmentType === "business");
  const needsHeuristicFallback = aiSegments.length === 0 || !aiHasBusinessSegments;
  const fallbackSegments = needsHeuristicFallback ? extractSegmentsHeuristic(segInput) : [];
  const segmentsToUse =
    aiHasBusinessSegments
      ? aiSegments
      : fallbackSegments.length > 0
        ? fallbackSegments
        : aiSegments;

  if (segmentsToUse.length > 0) {
    const validVolumeTypes = new Set(["head", "cwt", "lbs", "cases"]);
    analysis.segments = segmentsToUse.map((seg) => {
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
    if (needsHeuristicFallback && fallbackSegments.length > 0) {
      warnLog("[analyze-pdf] Segment heuristic fallback used:", fallbackSegments.map((s) => s.segmentName));
    }
  }
}

// ---------------------------------------------------------------------------
// POST handler ├â┬ó├óΓÇÜ┬¼├óΓé¼┬¥ 3 parallel AI calls
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured on server." },
      { status: 503 }
    );
  }

  let body: {
    text?: string;
    fileName?: string;
    pages?: number;
    chars?: number;
    stream?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filingText = body.text?.trim() ?? "";
  if (!shouldRunExtraction(filingText)) {
    return NextResponse.json({ error: "NO_VALID_FILING_TEXT" }, { status: 400 });
  }

  const wantStream = body.stream === true;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  // Split text into sections (├óΓÇ░┬Ñ500 chars, financial keywords passed guard)
  const { bsText, isCfText, qualText, segmentText, segText } = extractSections(filingText);

  // Fallback: if segment detection found nothing, use the full text (truncated)
  const bsInput = bsText.length > 500 ? bsText : filingText.slice(0, 80_000);
  const isCfInput = isCfText.length > 500 ? isCfText : filingText.slice(0, 80_000);
  const qualInput = qualText.length > 500 ? qualText : filingText.slice(0, 60_000);
  const segFallback = segText.length > 300 ? "" : extractSegmentFallback(filingText);
  const segInput =
    segText.length > 300
      ? segmentText
      : segFallback.length > 300
        ? segFallback
        : filingText.length > 200_000
          ? filingText.slice(Math.floor(filingText.length * 0.5))
          : filingText.slice(0, 60_000);

  const runExtraction = async (emitStream?: (evt: PdfAnalyzeStreamEvent) => void) => {
    const bsPromise = callOpenAI(
      apiKey,
      model,
      BS_PROMPT,
      `Extract balance sheet data:\n\n${bsInput}`,
      tokensFor(bsInput)
    );
    const isCfPromise = callOpenAI(
      apiKey,
      model,
      IS_CF_PROMPT,
      `Extract income statement and cash flow data:\n\n${isCfInput}`,
      tokensFor(isCfInput)
    );
    const qualPromise = callOpenAI(
      apiKey,
      model,
      QUALITATIVE_PROMPT,
      `Extract qualitative insights:\n\n${qualInput}`,
      tokensFor(qualInput)
    );
    const segPromise = callOpenAI(
      apiKey,
      model,
      SEGMENT_PROMPT,
      `Extract segment data:\n\n${segInput}`,
      tokensFor(segInput, 1500, 4000)
    );
    const nonRecurringPromise = extractNonRecurringItems(filingText, apiKey, model);
    const identityPromise = detectFilingIdentity(apiKey, model, filingText, body.fileName);

    if (emitStream) {
      void Promise.all([bsPromise, isCfPromise]).then(([bsCall, isCfCall]) => {
        const partial = buildFinancialsPartial(bsCall, isCfCall, filingText, body);
        if (partial) {
          emitStream({ event: "partial", stage: "financials", analysis: partial });
        }
      });
    }

    const [bsCall, isCfCall, qualCall, segCall, nonRecurringItems, identityDetection] =
      await Promise.all([
        bsPromise,
        isCfPromise,
        qualPromise,
        segPromise,
        nonRecurringPromise,
        identityPromise,
      ]);

    const aiErrors = [bsCall, isCfCall, qualCall, segCall]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));

    if (aiErrors.length > 0) {
      warnLog("[analyze-pdf] OpenAI extraction warnings:", aiErrors);
    }
    if (identityDetection.error) {
      warnLog("[analyze-pdf] Cover identity detection:", identityDetection.error);
    } else {
      debugLog("[analyze-pdf:filing-identity]", {
        companyName: identityDetection.companyName,
        ticker: identityDetection.ticker,
        filingType: identityDetection.filingType,
      });
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
      normalizeScaleNote(mergedScaleRaw) ??
      normalizeScaleNote(bsExtraction.scaleNote) ??
      detectScaleFromText(filingText);

    const mergedCompanyNameFromExtraction =
      bsParsed.meta.companyName ??
      isCfParsed.meta.companyName ??
      bsExtraction.companyName ??
      null;
    const trimmedIdentityName = identityDetection.companyName?.trim();
    const mergedCompanyName =
      trimmedIdentityName && trimmedIdentityName.length > 0
        ? trimmedIdentityName
        : mergedCompanyNameFromExtraction;

    const filingTypeFromExtraction =
      parseCanonicalFilingType(bsParsed.meta.filingType) ??
      parseCanonicalFilingType(isCfParsed.meta.filingType);

    const mergedFilingType: CanonicalFilingType | undefined =
      identityDetection.filingType ??
      filingTypeFromExtraction ??
      heuristicFilingType(filingText);

    // Build BSItem arrays with exact tags + PDF provenance when model provides it.
    // Keep compatibility with legacy model JSON shape (`items: [{tag,label,value}]`).
    const bsFromParsed = bsParsed.items
      .filter((it) => BS_TAG_SET.has(canonicalTag(String(it.tag ?? ""))))
      .map((it) => rawAiToBSItem(it, period, "bs"))
      .filter((x): x is BSItem => x != null);
    const bsFromLegacy = toBsItems(
      (bsExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => BS_TAG_SET.has(canonicalTag(String(it.tag ?? "")))),
      period,
      "AI:bs"
    );
    const bsItems: BSItem[] = dedupeByTagPreferPdf([...bsFromParsed, ...bsFromLegacy]);

    // Run before BS text heuristics so equity/liabilities can sanity-check vs scale (e.g. when AI returns weak values).
    for (const metric of ["totalAssets", "cashAndEquivalents"] as const) {
      repairCriticalFinancialValue(bsItems, metric, filingText, scaleForHeuristics, period);
    }

    const equityCandidate = extractTotalEquityHeuristic(filingText, scaleForHeuristics);
    if (equityCandidate.totalEquity != null) {
      const assetsValue = bsItems.find((item) => item.tag === "Assets")?.value ?? null;
      const liabilitiesValue = bsItems.find((item) => item.tag === "Liabilities")?.value ?? null;
      const existingEquityItem = bsItems.find((item) => item.tag === "StockholdersEquity");
      const existingEquityValue = existingEquityItem?.value ?? null;
      const existingEquityLooksCompanySpecific = existingEquityItem
        ? /^company\s+shareholders?['\u2019]?\s+(?:equity|investments?)/i.test(existingEquityItem.label)
        : false;

      const currentGap = computeBalanceGapPct(assetsValue, liabilitiesValue, existingEquityValue);
      const candidateGap = computeBalanceGapPct(assetsValue, liabilitiesValue, equityCandidate.totalEquity);

      const equityToAssetsRatio =
        assetsValue != null && Math.abs(assetsValue) >= 500
          ? Math.abs(equityCandidate.totalEquity) / Math.abs(assetsValue)
          : null;
      const equityLooksPlausibleVsAssets =
        equityToAssetsRatio == null ||
        (equityToAssetsRatio >= 0.02 && equityToAssetsRatio <= 0.98);

      const shouldUseCandidate =
        equityLooksPlausibleVsAssets &&
        (existingEquityItem == null ||
          existingEquityValue === 0 ||
          existingEquityLooksCompanySpecific ||
          (Number.isFinite(candidateGap) &&
            (!Number.isFinite(currentGap) || candidateGap < currentGap)) ||
          (equityCandidate.confidence === "high" && !Number.isFinite(currentGap)));

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

    const assetsForHeuristics = bsItems.find((item) => item.tag === "Assets")?.value ?? null;
    const liabilitiesCandidate = extractTotalLiabilitiesHeuristic(
      filingText,
      scaleForHeuristics,
      assetsForHeuristics
    );
    if (liabilitiesCandidate.totalLiabilities != null) {
      const equityValueForGap =
        bsItems.find((item) => item.tag === "StockholdersEquity")?.value ?? null;
      const existingLiab = bsItems.find((item) => item.tag === "Liabilities");
      const existingLiabValue = existingLiab?.value ?? null;

      const currentGapL = computeBalanceGapPct(
        assetsForHeuristics,
        existingLiabValue,
        equityValueForGap
      );
      const candidateGapL = computeBalanceGapPct(
        assetsForHeuristics,
        liabilitiesCandidate.totalLiabilities,
        equityValueForGap
      );

      const shouldUseLiab =
        existingLiab == null ||
        existingLiabValue === 0 ||
        (Number.isFinite(candidateGapL) &&
          (!Number.isFinite(currentGapL) || candidateGapL < currentGapL));

      if (shouldUseLiab) {
        if (existingLiab) {
          existingLiab.value = liabilitiesCandidate.totalLiabilities;
          existingLiab.label = liabilitiesCandidate.labelUsed ?? existingLiab.label;
          existingLiab.source = "heuristic:liabilities";
        } else {
          bsItems.push({
            tag: "Liabilities",
            label: liabilitiesCandidate.labelUsed ?? "Total liabilities",
            value: liabilitiesCandidate.totalLiabilities,
            period,
            source: "heuristic:liabilities",
          });
        }
      }

      debugLog("[liabilities:heuristic-candidate]", {
        selectedLabel: liabilitiesCandidate.labelUsed,
        selectedValue: liabilitiesCandidate.totalLiabilities,
        shouldUseLiab,
        currentGap: currentGapL,
        candidateGap: candidateGapL,
      });
    }

    const cfFromParsed = isCfParsed.items
      .filter((it) => CF_TAG_SET.has(canonicalTag(String(it.tag ?? ""))))
      .map((it) => rawAiToBSItem(it, period, "cf"))
      .filter((x): x is BSItem => x != null);
    const cfFromLegacy = toBsItems(
      (isCfExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => CF_TAG_SET.has(canonicalTag(String(it.tag ?? "")))),
      period,
      "AI:cf"
    );
    const cfItems: BSItem[] = dedupeByTagPreferPdf([...cfFromParsed, ...cfFromLegacy]);

    // Hard backfill for core dashboard fields when AI coverage is weak in production.
    for (const metric of [
      "totalAssets",
      "cashAndEquivalents",
      "totalCurrentAssets",
      "totalCurrentLiabilities",
      "longTermDebtNoncurrent",
      "currentMaturitiesLongTermDebt",
      "shortTermBorrowings",
      "grossDebt",
      "supplementalNetDebt",
      "inventories",
      "accountsReceivable",
      "propertyPlantAndEquipment",
      "retainedEarnings",
      "goodwill",
      "accountsPayable",
    ] as const) {
      repairCriticalFinancialValue(bsItems, metric, filingText, scaleForHeuristics, period);
    }
    for (const metric of [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "operatingIncome",
      "sgaExpense",
      "netIncome",
      "operatingCashFlow",
      "capitalExpenditures",
      "dividendsPaid",
      "stockBasedCompensation",
      "depreciationDepletionAndAmortization",
      "interestExpense",
      "incomeTaxExpense",
      "incomeBeforeIncomeTaxes",
      "ebitda",
    ] as const) {
      repairCriticalFinancialValue(cfItems, metric, filingText, scaleForHeuristics, period);
    }

    normalizeLikelyScaleMismatches(bsItems, scaleForHeuristics, "bs");
    normalizeLikelyScaleMismatches(cfItems, scaleForHeuristics, "cf");

    // Repurchase heuristic: always run so we can also correct AI over-scaling.
    // AI occasionally reads share repurchases from a thousands-scale supplemental
    // table and returns, e.g., 49,000 when the real value is 49 (in millions).
    const existingRepurchase = cfItems.find(
      (i) => i.tag === "PaymentsForRepurchaseOfCommonStock"
    );
    const hasValidRepurchase =
      existingRepurchase != null && Math.abs(existingRepurchase.value) > 0;
    debugLog("[repurchase:guard] hasValidRepurchase:", hasValidRepurchase, "existing value:", existingRepurchase?.value ?? "none");
    const heuristicValue = extractShareRepurchasesHeuristic(
      filingText,
      scaleForHeuristics
    );
    debugLog("[repurchase:heuristic] heuristicValue:", heuristicValue);
    const existingRepurchaseIsAi =
      existingRepurchase?.source?.startsWith("AI:") ?? false;
    // Scale-mismatch: existing AI value is 100x+ the heuristic → AI over-scaled.
    const repurchaseAiOverScaled =
      hasValidRepurchase &&
      existingRepurchaseIsAi &&
      heuristicValue != null &&
      heuristicValue > 0 &&
      Math.abs(existingRepurchase!.value) / heuristicValue >= 100;
    if (!hasValidRepurchase || repurchaseAiOverScaled) {
      if (heuristicValue != null && heuristicValue > 0) {
        if (existingRepurchase) {
          existingRepurchase.value = heuristicValue;
          existingRepurchase.label = repurchaseAiOverScaled
            ? "Share repurchases (heuristic scale fix)"
            : "Share repurchases (heuristic)";
          existingRepurchase.source = repurchaseAiOverScaled
            ? "heuristic:repurchase_scale_fix"
            : "heuristic:repurchase_overwrite";
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
    // If not explicit, leave missing so UI shows "├â┬ó├óΓÇÜ┬¼├óΓé¼┬¥" instead of forced estimates.
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
    const explicitRdResolution = resolveRnDExpense({
      text: filingText,
      scaleNote: scaleForHeuristics,
      companyName: mergedCompanyName,
      existingRd: null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    const hasExplicitRdInPdf =
      explicitRdResolution.method === "extracted" &&
      explicitRdResolution.rAndDExpense != null &&
      explicitRdResolution.rAndDExpense > 0;
    debugLog("[rd:resolution]", rdResolution);

    // Guard against AI-only hallucinated R&D values when no explicit R&D line exists in the filing text.
    // In that case we prefer missing (`—`) over a potentially wrong number.
    if (
      hasValidRd &&
      existingRdItem &&
      !hasExplicitRdInPdf &&
      /^AI:/i.test(existingRdItem.source ?? "")
    ) {
      const idx = cfItems.indexOf(existingRdItem);
      if (idx >= 0) {
        cfItems.splice(idx, 1);
      }
      debugLog("[rd:drop-ai-no-explicit-row]", {
        removedValue: existingRdItem.value,
        source: existingRdItem.source,
      });
    }

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

    const dividendNoteRepairs = applyDividendsDeclaredNoteFallback(
      cfItems,
      filingText,
      scaleForHeuristics,
      period
    );
    if (dividendNoteRepairs.length > 0) {
      debugLog("[dividends:note-fallback]", dividendNoteRepairs);
    }

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
        ticker: identityDetection.ticker ?? undefined,
        filingType: mergedFilingType,
        fileName: body.fileName,
        pagesRead: body.pages,
        charsExtracted: body.chars ?? filingText.length,
        periodEnd: period,
        confidence: "low",
        extractionMethod: "pdf-ai-partial",
      });
      if (dividendNoteRepairs.length > 0) {
        degradedAnalysis.meta.extractionRepairs = [
          ...(degradedAnalysis.meta.extractionRepairs ?? []),
          ...dividendNoteRepairs,
        ];
      }
      attachSupplementalAnalysisData(
        degradedAnalysis,
        qualExtraction,
        nonRecurringItems,
        segExtraction,
        segInput
      );

      warnLog("[analyze-pdf] Degraded extraction mode:", reasons);

      const degradedPayload = {
        analysis: degradedAnalysis,
        degraded: true as const,
        warning: `AI extraction coverage low (${reasons.join("; ")}). Returned partial analysis instead of failing request.`,
      };
      if (emitStream) {
        emitStream({ event: "result", ...degradedPayload });
        return degradedPayload;
      }
      return degradedPayload;
    }

    // Assemble full analysis
    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: mergedCompanyName ?? undefined,
      ticker: identityDetection.ticker ?? undefined,
      filingType: mergedFilingType,
      fileName: body.fileName,
      pagesRead: body.pages,
      charsExtracted: body.chars ?? filingText.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });
    if (dividendNoteRepairs.length > 0) {
      analysis.meta.extractionRepairs = [
        ...(analysis.meta.extractionRepairs ?? []),
        ...dividendNoteRepairs,
      ];
    }
    debugLog(
      "[repurchase:final-render-value]",
      analysis.cashFlow.shareRepurchases
    );

    attachSupplementalAnalysisData(
      analysis,
      qualExtraction,
      nonRecurringItems,
      segExtraction,
      segInput
    );

    const successPayload = { analysis, degraded: false as const, warning: undefined as string | undefined };
    if (emitStream) {
      emitStream({ event: "result", analysis });
      return successPayload;
    }
    return successPayload;
  };

  if (wantStream) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (evt: PdfAnalyzeStreamEvent) => {
          controller.enqueue(encodePdfAnalyzeSse(evt));
        };
        try {
          await runExtraction(send);
        } catch (e) {
          send({
            event: "error",
            message: e instanceof Error ? e.message : "OpenAI call failed",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const payload = await runExtraction();
    if ("error" in payload) {
      return NextResponse.json(payload, { status: 502 });
    }
    if (payload.degraded) {
      return NextResponse.json({
        analysis: payload.analysis,
        degraded: true,
        warning: payload.warning,
      });
    }
    return NextResponse.json({ analysis: payload.analysis });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OpenAI call failed" },
      { status: 502 }
    );
  }
}
