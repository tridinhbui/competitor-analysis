/**
 * Fast partial FullAnalysis builds for progressive PDF analyze SSE.
 * Uses the same tag sets and parsing rules as /api/analyze-pdf (subset).
 */

import { assembleAnalysis } from "@/lib/analysisEngine";
import {
  extractPdfFinancialValue,
  type PdfFinancialMetric,
} from "@/lib/pdfFinancialValueExtractor";
import type { BSItem, FullAnalysis } from "@/types/analysis";

export type OpenAiCallResult = {
  content: string | null;
  error: string | null;
  status: number | null;
};

export type PdfAnalyzeStreamBody = {
  fileName?: string;
  pages?: number;
  chars?: number;
};

interface RawAiItem {
  tag?: string;
  label?: string;
  value?: number | string | null;
  periodBasis?: string | null;
  page?: number | null;
  rowLabel?: string | null;
  source?: string | null;
}

interface ExtractionMeta {
  companyName?: string | null;
  periodEnd?: string | null;
  scaleNote?: string;
}

const BS_TAG_SET = new Set([
  "Assets", "AssetsCurrent", "AssetsNoncurrent",
  "CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents",
  "ShortTermInvestments", "AccountsReceivableNet", "AccountsReceivableNetCurrent", "InventoryNet",
  "PrepaidExpenseAndOtherAssetsCurrent", "PropertyPlantAndEquipmentNet", "Goodwill", "IntangibleAssetsNet",
  "OtherAssetsNoncurrent", "DeferredIncomeTaxAssetsNet", "Liabilities", "LiabilitiesCurrent", "LiabilitiesNoncurrent",
  "AccountsPayable", "AccountsPayableCurrent", "AccruedLiabilitiesCurrent", "DeferredRevenueCurrent", "DebtCurrent",
  "LongTermDebtNoncurrent", "LongTermDebt", "ShortTermBorrowings", "LongTermDebtCurrent", "GrossDebt",
  "TotalNetDebtSupplemental", "OperatingLeaseLiabilityNoncurrent", "FinanceLeaseLiabilityNoncurrent",
  "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent",
  "RedeemableNoncontrollingInterestEquityCarryingAmount", "StockholdersEquity", "CommonStockValue",
  "AdditionalPaidInCapital", "RetainedEarningsAccumulatedDeficit", "TreasuryStockValue",
  "AccumulatedOtherComprehensiveIncomeLoss", "LiabilitiesAndStockholdersEquity", "MinorityInterest",
]);

const CF_TAG_SET = new Set([
  "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "SalesRevenueGoodsNet",
  "CostOfGoodsSold", "CostOfGoodsAndServicesSold", "CostOfRevenue", "GrossProfit",
  "SellingGeneralAndAdministrativeExpense", "ResearchAndDevelopmentExpense", "OperatingExpenses",
  "OperatingIncomeLoss", "IncomeBeforeIncomeTaxes", "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
  "InterestExpense", "InterestIncome", "IncomeTaxExpenseBenefit", "NetIncomeLoss",
  "EBITDA", "EarningsBeforeInterestTaxesDepreciationAmortization", "ReturnOnInvestedCapital",
  "EarningsPerShareBasic", "EarningsPerShareDiluted", "WeightedAverageSharesBasic", "WeightedAverageSharesDiluted",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation", "AmortizationOfIntangibleAssets",
  "ShareBasedCompensation", "NetCashProvidedByOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
  "NetCashProvidedByInvestingActivities", "ProceedsFromIssuanceOfLongTermDebt", "RepaymentsOfLongTermDebt",
  "RepaymentsOfShortTermDebt", "RepaymentsOfDebt", "RepaymentsOfCommercialPaper", "PaymentsOfDividends",
  "PaymentsOfDividendsCommonStock", "PaymentsForRepurchaseOfCommonStock", "NetCashProvidedByFinancingActivities",
]);

const TAG_ALIASES: Record<string, string> = {
  PropertyPlantAndEquipment: "PropertyPlantAndEquipmentNet",
  NetPropertyPlantAndEquipment: "PropertyPlantAndEquipmentNet",
  AccountsReceivable: "AccountsReceivableNetCurrent",
  LongTermDebtLessCurrentMaturities: "LongTermDebtNoncurrent",
  TotalShareholdersInvestment: "StockholdersEquity",
  TotalLiabilitiesAndShareholdersInvestment: "LiabilitiesAndStockholdersEquity",
};

const CORE_BS_REPAIRS: PdfFinancialMetric[] = [
  "totalAssets",
  "cashAndEquivalents",
];

const CORE_CF_REPAIRS: PdfFinancialMetric[] = [
  "revenue",
  "operatingIncome",
  "netIncome",
  "operatingCashFlow",
  "capitalExpenditures",
];

function canonicalTag(tag: string): string {
  const t = tag.trim();
  return TAG_ALIASES[t] ?? t;
}

function parseJsonCall<T>(call: OpenAiCallResult, fallback: T): T {
  if (!call.content) return fallback;
  try {
    return JSON.parse(call.content) as T;
  } catch {
    return fallback;
  }
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
    if ("scaleNote" in m && m.scaleNote != null) meta.scaleNote = String(m.scaleNote);
  }
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

function itemValueForTag(tag: string, v: number | string | null | undefined): number {
  if (v == null) return 0;
  const s = typeof v === "string" ? v.trim() : String(v);
  if (s === "" || s === "N/A" || s === "n/a" || s === "-") return 0;
  const cleaned = s.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

function rawAiToBSItem(it: RawAiItem, period: string, kind: "bs" | "cf"): BSItem | null {
  const tag = canonicalTag(String(it.tag ?? ""));
  if (!tag) return null;
  const pg = it.page;
  const source =
    typeof it.source === "string" && /^PDF:p\d+/i.test(it.source.trim())
      ? it.source.trim()
      : pg != null && Number.isFinite(Number(pg))
        ? `PDF:p${Math.max(1, Math.floor(Number(pg)))}:"${String(it.label ?? tag).slice(0, 80)}"`
        : `AI:${kind}:${tag}`;
  return {
    tag,
    label: String(it.label ?? tag),
    value: itemValueForTag(tag, it.value),
    period,
    source,
    period_type: kind === "bs" ? "balance_sheet" : undefined,
  };
}

function dedupeByTagPreferPdf(items: BSItem[]): BSItem[] {
  const m = new Map<string, BSItem>();
  const pdfFirst = (s: string) => /^PDF:p/i.test(s);
  for (const it of items) {
    const prev = m.get(it.tag);
    if (!prev) {
      m.set(it.tag, it);
      continue;
    }
    if (pdfFirst(it.source) && !pdfFirst(prev.source)) m.set(it.tag, it);
  }
  return [...m.values()];
}

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
  if (/in\s+millions/i.test(normalized)) return "millions";
  if (/in\s+thousands/i.test(normalized)) return "thousands";
  if (/in\s+billions/i.test(normalized)) return "billions";
  return undefined;
}

function repairMetric(
  items: BSItem[],
  metric: PdfFinancialMetric,
  text: string,
  scaleNote: string | undefined,
  period: string
): void {
  const repaired = extractPdfFinancialValue(text, metric, scaleNote);
  if (!repaired || Math.abs(repaired.value) <= 1) return;
  const existing = items.find((item) => item.tag === repaired.tag);
  if (!existing) {
    items.push({
      tag: repaired.tag,
      label: repaired.label,
      value: repaired.value,
      period,
      source: `heuristic:partial:${metric}`,
    });
    return;
  }
  const existingIsAi = existing.source?.startsWith("AI:") ?? false;
  if (existingIsAi || existing.value === 0) {
    existing.value = repaired.value;
    existing.source = `heuristic:partial:${metric}`;
  }
}

function parseBsItems(bsCall: OpenAiCallResult, period: string): BSItem[] {
  const bsExtraction = parseJsonCall(bsCall, {} as { items?: RawAiItem[] });
  const bsParsed = parseAiEnvelope(bsExtraction);
  const fromParsed = bsParsed.items
    .filter((it) => BS_TAG_SET.has(canonicalTag(String(it.tag ?? ""))))
    .map((it) => rawAiToBSItem(it, period, "bs"))
    .filter((x): x is BSItem => x != null);
  return dedupeByTagPreferPdf(fromParsed);
}

function parseCfItems(isCfCall: OpenAiCallResult, period: string): BSItem[] {
  const isCfExtraction = parseJsonCall(isCfCall, {} as { items?: RawAiItem[] });
  const isCfParsed = parseAiEnvelope(isCfExtraction);
  const fromParsed = isCfParsed.items
    .filter((it) => CF_TAG_SET.has(canonicalTag(String(it.tag ?? ""))))
    .map((it) => rawAiToBSItem(it, period, "cf"))
    .filter((x): x is BSItem => x != null);
  return dedupeByTagPreferPdf(fromParsed);
}

function resolvePeriod(bsCall: OpenAiCallResult, isCfCall?: OpenAiCallResult): string {
  const bsExtraction = parseJsonCall(bsCall, {} as { periodEnd?: string });
  const bsParsed = parseAiEnvelope(bsExtraction);
  if (isCfCall) {
    const isCfParsed = parseAiEnvelope(parseJsonCall(isCfCall, {}));
    return (
      bsParsed.meta.periodEnd ??
      isCfParsed.meta.periodEnd ??
      new Date().toISOString().slice(0, 10)
    );
  }
  return bsParsed.meta.periodEnd ?? new Date().toISOString().slice(0, 10);
}

function resolveScale(bsCall: OpenAiCallResult, isCfCall: OpenAiCallResult | undefined, filingText: string): string | undefined {
  const bsParsed = parseAiEnvelope(parseJsonCall(bsCall, {}));
  const scale =
    normalizeScaleNote(bsParsed.meta.scaleNote) ??
    normalizeScaleNote(parseJsonCall(bsCall, {} as { scaleNote?: string }).scaleNote);
  if (scale) return scale;
  if (isCfCall) {
    const isCfParsed = parseAiEnvelope(parseJsonCall(isCfCall, {}));
    const fromCf = normalizeScaleNote(isCfParsed.meta.scaleNote);
    if (fromCf) return fromCf;
  }
  return detectScaleFromText(filingText);
}

function baseMeta(
  body: PdfAnalyzeStreamBody,
  filingText: string,
  period: string,
  companyName?: string | null
): FullAnalysis["meta"] {
  return {
    source: "pdf",
    fileName: body.fileName,
    pagesRead: body.pages,
    charsExtracted: body.chars ?? filingText.length,
    periodEnd: period,
    companyName: companyName ?? undefined,
    confidence: "low",
    extractionMethod: "pdf-ai-partial",
  };
}

/** Balance sheet only — first progressive paint. */
export function buildBalanceSheetPartial(
  bsCall: OpenAiCallResult,
  filingText: string,
  body: PdfAnalyzeStreamBody
): FullAnalysis | null {
  const period = resolvePeriod(bsCall);
  const bsItems = parseBsItems(bsCall, period);
  if (bsItems.length === 0) return null;

  const scale = resolveScale(bsCall, undefined, filingText);
  for (const metric of CORE_BS_REPAIRS) {
    repairMetric(bsItems, metric, filingText, scale, period);
  }

  const bsParsed = parseAiEnvelope(parseJsonCall(bsCall, {}));
  return assembleAnalysis(bsItems, [], baseMeta(body, filingText, period, bsParsed.meta.companyName));
}

/** BS + IS/CF — main dashboard metrics. */
export function buildFinancialsPartial(
  bsCall: OpenAiCallResult,
  isCfCall: OpenAiCallResult,
  filingText: string,
  body: PdfAnalyzeStreamBody
): FullAnalysis | null {
  const period = resolvePeriod(bsCall, isCfCall);
  const bsItems = parseBsItems(bsCall, period);
  const cfItems = parseCfItems(isCfCall, period);
  if (bsItems.length === 0 && cfItems.length === 0) return null;

  const scale = resolveScale(bsCall, isCfCall, filingText);
  for (const metric of CORE_BS_REPAIRS) {
    repairMetric(bsItems, metric, filingText, scale, period);
  }
  for (const metric of CORE_CF_REPAIRS) {
    repairMetric(cfItems, metric, filingText, scale, period);
  }

  const bsParsed = parseAiEnvelope(parseJsonCall(bsCall, {}));
  return assembleAnalysis(bsItems, cfItems, baseMeta(body, filingText, period, bsParsed.meta.companyName));
}

export type PdfAnalyzeStreamUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type PdfAnalyzeStreamEvent =
  | { event: "partial"; stage: "balance_sheet" | "financials"; analysis: FullAnalysis }
  | { event: "result"; analysis: FullAnalysis; degraded?: boolean; warning?: string; usage?: PdfAnalyzeStreamUsage }
  | { event: "error"; message: string };

export function encodePdfAnalyzeSse(payload: PdfAnalyzeStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}
