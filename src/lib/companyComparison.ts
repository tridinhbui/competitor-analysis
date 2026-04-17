import type { FullAnalysis } from "@/types/analysis";
import type { Filing } from "@/types/competitor";
import { deriveQuarter } from "./competitorService";

export type PeriodType = "quarter" | "ytd" | "annual" | "balance_sheet" | "unknown";

export type MetricFormat = "currency" | "percent" | "multiple" | "number" | "text" | "date";

export type ComparisonSection =
  | "Context"
  | "Income Statement"
  | "Cash Flow"
  | "Balance Sheet / Capital Structure";

export type ComparableMetricKey =
  | "revenue"
  | "grossProfit"
  | "grossMargin"
  | "sga"
  | "operatingIncome"
  | "operatingMargin"
  | "ebitda"
  | "ebitdaMargin"
  | "netIncome"
  | "netMargin"
  | "operatingCashFlow"
  | "capex"
  | "freeCashFlow"
  | "dividendsPaid"
  | "shareRepurchases"
  | "investingCashFlow"
  | "financingCashFlow"
  | "totalAssets"
  | "totalDebt"
  | "totalEquity"
  | "cashAndEquivalents"
  | "netDebt"
  | "currentRatio"
  | "debtToEquity"
  | "netDebtToEbitda"
  | "interestCoverage"
  | "roa"
  | "roe"
  | "roic"
  | "interestExpense";

export type BetterDirection = "higher" | "lower" | "neutral";

export interface NormalizedCompanyMetrics {
  ticker: string;
  companyName: string;
  filingDate: string | null;
  periodEnd: string;
  periodType: PeriodType;
  quarterLabel: string;
  confidence: "high" | "medium" | "low" | "unknown";
  extractionMethod: string | null;
  extractionQuality: string;
  quarterCount: number;
  unitLabel: "USD millions";
  metrics: Record<ComparableMetricKey, number | null>;
  derivedMetrics: Partial<Record<ComparableMetricKey, true>>;
  missingMetricKeys: ComparableMetricKey[];
  validationPassed: boolean;
  reconcileStatus: "ok" | "warning" | "fail" | "unknown";
}

export interface ComparisonRow {
  section: ComparisonSection;
  key: string;
  label: string;
  format: MetricFormat;
  valueA: number | string | null;
  valueB: number | string | null;
  difference: number | null;
  better: "A" | "B" | null;
  derivedA: boolean;
  derivedB: boolean;
}

export interface ComparisonWarning {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface ComparisonCharts {
  financialBars: Array<{ metric: string; companyA: number | null; companyB: number | null }>;
  marginBars: Array<{ metric: string; companyA: number | null; companyB: number | null }>;
  marginGapBars: Array<{ metric: string; companyA: number | null; companyB: number | null; gapPp: number | null }>;
  capitalBars: Array<{ metric: string; companyA: number | null; companyB: number | null }>;
  cashFlowBars: Array<{ metric: string; companyA: number | null; companyB: number | null }>;
}

export interface ComparisonTrendPoint {
  periodEnd: string;
  quarterLabel: string;
  companyA: number | null;
  companyB: number | null;
}

export interface ComparisonTrends {
  revenue: ComparisonTrendPoint[];
  grossMargin: ComparisonTrendPoint[];
  operatingMargin: ComparisonTrendPoint[];
  netMargin: ComparisonTrendPoint[];
  freeCashFlow: ComparisonTrendPoint[];
  sgaExpense: ComparisonTrendPoint[];
}

export interface ComparisonReportSection {
  key: "overview" | "margin-gaps" | "financials" | "trends";
  title: string;
  bullets: string[];
}

export interface ComparisonReport {
  title: string;
  subtitle: string;
  sections: ComparisonReportSection[];
}

export interface SegmentComparisonRow {
  segment: string;
  companyARevenue: number | null;
  companyBRevenue: number | null;
  companyAOperatingIncome: number | null;
  companyBOperatingIncome: number | null;
  companyAOperatingMargin: number | null;
  companyBOperatingMargin: number | null;
  marginGapPp: number | null;
  better: "A" | "B" | null;
}

export interface MethodologyVariantSnapshot {
  label: string;
  corporateAllocation: number | null;
  corporateAsPercentOfRevenue: number | null;
  amortizationExpense: number | null;
}

export interface MethodologyComparison {
  companyAHasVariants: boolean;
  companyBHasVariants: boolean;
  companyAVariants: MethodologyVariantSnapshot[];
  companyBVariants: MethodologyVariantSnapshot[];
  notes: string[];
}

export interface RelativePerformanceRow {
  metric: string;
  companyAWins: number;
  companyBWins: number;
  ties: number;
  sampleSize: number;
}

export interface BoardInsightRow {
  metric: string;
  format: MetricFormat;
  valueA: number | null;
  valueB: number | null;
  winner: "A" | "B" | null;
  insight: string;
}

export interface ComparisonNarrative {
  /** Section 1 – [Insight] → [Cause] → [Implication] bullets, max 5 */
  executiveSummary: string[];
  /** Section 2 – Adjusted performance diagnosis, separation of real vs reported */
  truePerformanceDiagnosis: string[];
  /** Section 4 – Cost structure bridge: which P&L line drives the gap */
  costStructureBridge: string[];
  /** Section 5 – CapEx, M&A, buybacks, debt strategy consequences */
  capitalAllocationStory: string[];
  /** Section 6 – Margin gap attribution in pp terms */
  marginGapDecomposition: string[];
  /** Section 7 – Period-over-period driver changes, inflection points */
  whatChanged: string[];
  /** Section 9 – Investment interpretation: structural vs accounting advantage */
  investmentInterpretation: string[];
  /** Section 10 – Data gaps, inferences, distortion warnings */
  dataQuality: string[];
  /** Optional counterfactual – "without X, Company Y would …" */
  counterfactual: string[];
  /** Legacy fields retained for backward compatibility */
  driverAnalysis: string[];
  pricingCostDynamics: string[];
  keyRisks: string[];
}

export interface CompanyComparisonPayload {
  companyA: NormalizedCompanyMetrics;
  companyB: NormalizedCompanyMetrics;
  rows: ComparisonRow[];
  charts: ComparisonCharts;
  trends: ComparisonTrends;
  warnings: ComparisonWarning[];
  report: ComparisonReport;
  segmentComparison: SegmentComparisonRow[];
  methodologyComparison: MethodologyComparison;
  relativePerformance: RelativePerformanceRow[];
  boardInsights: BoardInsightRow[];
  narrative: ComparisonNarrative;
  generatedAt: string;
  /** Present when comparing 3–7 companies in one request */
  comparisonMode?: "pair" | "multi";
  multiCompanies?: NormalizedCompanyMetrics[];
  multiRows?: MultiComparisonRow[];
  multiTrends?: MultiComparisonTrends;
  /** Recharts-friendly rows: `{ metric, [TICKER]: value }` */
  multiFinancialBars?: Array<Record<string, string | number | null>>;
  multiMarginBars?: Array<Record<string, string | number | null>>;
  multiMarginGapBars?: MultiMarginGapBarRow[];
  multiCashFlowBars?: Array<Record<string, string | number | null>>;
  multiDriverBars?: Array<Record<string, string | number | null>>;
  multiMethodologyNotes?: string[];
}

export interface MultiComparisonRow {
  section: ComparisonSection;
  key: string;
  label: string;
  format: MetricFormat;
  values: Array<number | string | null>;
  derived: boolean[];
  /** Best column index for numeric metrics with a directional preference; null for context rows or ties */
  bestIndex: number | null;
}

export interface MultiTrendPoint {
  periodEnd: string;
  quarterLabel: string;
  byTicker: Record<string, number | null>;
}

export interface MultiComparisonTrends {
  revenue: MultiTrendPoint[];
  grossMargin: MultiTrendPoint[];
  operatingMargin: MultiTrendPoint[];
  netMargin: MultiTrendPoint[];
  freeCashFlow: MultiTrendPoint[];
  sgaExpense: MultiTrendPoint[];
}

export interface MultiMarginGapBarRow {
  metric: string;
  /** Level in % for each ticker */
  byTicker: Record<string, number | null>;
  /** pp vs first ticker (benchmark); benchmark ticker maps to null */
  gapVsBenchmarkPp: Record<string, number | null>;
}

interface BaseComparableMetrics {
  revenue: number | null;
  grossProfit: number | null;
  grossMargin: number | null;
  sga: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  netIncome: number | null;
  netMargin: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  shareRepurchases: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  cashAndEquivalents: number | null;
  netDebt: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  roa: number | null;
  roe: number | null;
  roic: number | null;
  interestExpense: number | null;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Match analysisEngine: EBITDA = EBIT/operating income + D&A when headline ebitda is missing.
 * Fills peer-comparison charts (e.g. EBITDA margin) when filings only have OI + depreciation lines.
 */
function coerceEbitdaFromIncome(is: FullAnalysis["incomeStatement"] | undefined): number | null {
  if (!is) return null;
  const headline = toNumber(is.ebitda);
  if (headline != null) return headline;
  const oi = toNumber(is.operatingIncome);
  const ebit = toNumber(is.ebit);
  const base = oi ?? ebit;
  const dep = toNumber(is.depreciation);
  const amort = toNumber(is.amortization);
  if (base == null || dep == null) return null;
  const da = Math.abs(dep) + (amort != null ? Math.abs(amort) : 0);
  return round(base + da, 2);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function pct(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return round((num / den) * 100, 2);
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return round(num / den, 3);
}

function fmtCurrency(value: number | null): string {
  if (value == null) return "N/A";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
}

function fmtPercent(value: number | null): string {
  if (value == null) return "N/A";
  return `${value.toFixed(1)}%`;
}

function fmtMultiple(value: number | null): string {
  if (value == null) return "N/A";
  return `${value.toFixed(2)}x`;
}

function inferPeriodType(filing: Filing, analysis: FullAnalysis): PeriodType {
  const itemTypes = [
    ...(analysis.balanceSheet.items ?? []).map((item) => item.period_type),
    ...(analysis.cfItems ?? []).map((item) => item.period_type),
  ].filter(Boolean) as Array<"quarter" | "ytd" | "annual" | "balance_sheet">;

  if (itemTypes.includes("annual")) return "annual";
  if (itemTypes.includes("ytd")) return "ytd";
  if (itemTypes.includes("quarter")) return "quarter";
  if (itemTypes.includes("balance_sheet")) return "balance_sheet";

  const fileName = (analysis.meta.fileName ?? "").toLowerCase();
  if (filing.filingType === "10-K" || /10-k|annual/.test(fileName)) return "annual";
  if (/9m|nine\s+months|year[-\s]*to[-\s]*date|ytd/.test(fileName)) return "ytd";
  if (filing.filingType === "10-Q") return "quarter";
  return "unknown";
}

function buildExtractionQuality(
  confidence: "high" | "medium" | "low" | "unknown",
  extractionMethod: string | null
): string {
  const methodPart = extractionMethod ? ` (${extractionMethod})` : "";
  return `${confidence}${methodPart}`;
}

export function computeComparableMetrics(
  base: BaseComparableMetrics
): {
  metrics: Record<ComparableMetricKey, number | null>;
  derivedMetrics: Partial<Record<ComparableMetricKey, true>>;
} {
  const metrics: Record<ComparableMetricKey, number | null> = {
    revenue: base.revenue,
    grossProfit: base.grossProfit,
    grossMargin: base.grossMargin,
    sga: base.sga,
    operatingIncome: base.operatingIncome,
    operatingMargin: base.operatingMargin,
    ebitda: base.ebitda,
    ebitdaMargin: base.ebitdaMargin,
    netIncome: base.netIncome,
    netMargin: base.netMargin,
    operatingCashFlow: base.operatingCashFlow,
    capex: base.capex,
    freeCashFlow: base.freeCashFlow,
    dividendsPaid: base.dividendsPaid,
    shareRepurchases: base.shareRepurchases,
    investingCashFlow: base.investingCashFlow,
    financingCashFlow: base.financingCashFlow,
    totalAssets: base.totalAssets,
    totalDebt: base.totalDebt,
    totalEquity: base.totalEquity,
    cashAndEquivalents: base.cashAndEquivalents,
    netDebt: base.netDebt,
    currentRatio: base.currentRatio,
    debtToEquity: base.debtToEquity,
    netDebtToEbitda: base.netDebtToEbitda,
    interestCoverage: base.interestCoverage,
    roa: base.roa,
    roe: base.roe,
    roic: base.roic,
    interestExpense: base.interestExpense,
  };

  const derivedMetrics: Partial<Record<ComparableMetricKey, true>> = {};
  const setDerived = (key: ComparableMetricKey, value: number | null) => {
    if (value == null || metrics[key] != null) return;
    metrics[key] = value;
    derivedMetrics[key] = true;
  };

  setDerived("grossMargin", pct(metrics.grossProfit, metrics.revenue));
  setDerived("operatingMargin", pct(metrics.operatingIncome, metrics.revenue));
  setDerived("ebitdaMargin", pct(metrics.ebitda, metrics.revenue));
  setDerived("netMargin", pct(metrics.netIncome, metrics.revenue));
  setDerived("freeCashFlow", metrics.operatingCashFlow != null && metrics.capex != null
    ? round(metrics.operatingCashFlow - metrics.capex, 2)
    : null);
  setDerived("netDebt", metrics.totalDebt != null && metrics.cashAndEquivalents != null
    ? round(metrics.totalDebt - metrics.cashAndEquivalents, 2)
    : null);
  setDerived("debtToEquity", ratio(metrics.totalDebt, metrics.totalEquity));
  setDerived("roa", pct(metrics.netIncome, metrics.totalAssets));
  setDerived("roe", pct(metrics.netIncome, metrics.totalEquity));
  setDerived("netDebtToEbitda", ratio(metrics.netDebt, metrics.ebitda));
  setDerived(
    "interestCoverage",
    metrics.interestExpense != null && metrics.interestExpense !== 0
      ? ratio(metrics.ebitda ?? metrics.operatingIncome, metrics.interestExpense)
      : null
  );

  const investedCapital =
    metrics.totalDebt != null && metrics.totalEquity != null && metrics.cashAndEquivalents != null
      ? metrics.totalDebt + metrics.totalEquity - metrics.cashAndEquivalents
      : null;
  setDerived("roic", pct(metrics.operatingIncome ?? metrics.netIncome, investedCapital));

  return { metrics, derivedMetrics };
}

export function normalizeMetrics(
  filing: Filing,
  quarterCount: number
): NormalizedCompanyMetrics {
  const analysis = filing.analysis;
  const periodType = inferPeriodType(filing, analysis);
  const quarter = deriveQuarter(filing.periodEnd);
  const confidence = analysis.meta.confidence ?? "unknown";
  const extractionMethod = analysis.meta.extractionMethod ?? null;

  const inc = analysis.incomeStatement;
  const ebitdaResolved = coerceEbitdaFromIncome(inc);
  const ebitdaMarginHeadline = toNumber(inc?.ebitdaMargin ?? analysis.ratios?.ebitdaMargin);

  const { metrics, derivedMetrics } = computeComparableMetrics({
    revenue: toNumber(inc?.revenue),
    grossProfit: toNumber(inc?.grossProfit),
    grossMargin: toNumber(inc?.grossMargin),
    sga: toNumber(inc?.sgaExpense),
    operatingIncome: toNumber(inc?.operatingIncome),
    operatingMargin: toNumber(inc?.operatingMargin),
    ebitda: ebitdaResolved,
    ebitdaMargin: ebitdaMarginHeadline,
    netIncome: toNumber(inc?.netIncome ?? analysis.cashFlow?.netIncome),
    netMargin: toNumber(inc?.netMargin),
    operatingCashFlow: toNumber(analysis.cashFlow?.operatingCashFlow),
    capex: toNumber(analysis.cashFlow?.capitalExpenditures),
    freeCashFlow: toNumber(analysis.cashFlow?.freeCashFlow),
    dividendsPaid: toNumber(analysis.cashFlow?.dividendsPaid),
    shareRepurchases: toNumber(analysis.cashFlow?.shareRepurchases),
    investingCashFlow: toNumber(analysis.cashFlow?.investingCashFlow),
    financingCashFlow: toNumber(analysis.cashFlow?.financingCashFlow),
    totalAssets: toNumber(analysis.balanceSheet?.totalAssets),
    totalDebt: toNumber(analysis.debtStructure?.totalDebt),
    totalEquity: toNumber(analysis.balanceSheet?.totalEquity),
    cashAndEquivalents: toNumber(analysis.balanceSheet?.cashAndEquivalents),
    netDebt: toNumber(analysis.debtStructure?.netDebt),
    currentRatio: toNumber(analysis.ratios?.currentRatio),
    debtToEquity: toNumber(analysis.ratios?.debtToEquity),
    netDebtToEbitda: toNumber(analysis.ratios?.netDebtToEbitda),
    interestCoverage: toNumber(analysis.ratios?.interestCoverage),
    roa: toNumber(analysis.ratios?.returnOnAssets),
    roe: toNumber(analysis.ratios?.returnOnEquity),
    roic: toNumber(analysis.ratios?.returnOnInvestedCapital),
    interestExpense: toNumber(inc?.interestExpense),
  });

  const keyCoverage: ComparableMetricKey[] = [
    "revenue",
    "grossProfit",
    "operatingIncome",
    "netIncome",
    "operatingCashFlow",
    "totalAssets",
    "totalDebt",
    "totalEquity",
  ];
  const missingMetricKeys = keyCoverage.filter((key) => metrics[key] == null);

  return {
    ticker: filing.ticker,
    companyName: analysis.meta.companyName ?? filing.ticker,
    filingDate: filing.filingDate ?? analysis.meta.filingDate ?? null,
    periodEnd: filing.periodEnd,
    periodType,
    quarterLabel: filing.quarter?.label ?? quarter.label,
    confidence,
    extractionMethod,
    extractionQuality: buildExtractionQuality(confidence, extractionMethod),
    quarterCount,
    unitLabel: "USD millions",
    metrics,
    derivedMetrics,
    missingMetricKeys,
    validationPassed: analysis.validation?.passed ?? false,
    reconcileStatus: analysis.reconcile?.status ?? "unknown",
  };
}

const ROW_DEFINITIONS: Array<{
  section: ComparisonSection;
  key: string;
  label: string;
  format: MetricFormat;
  metricKey?: ComparableMetricKey;
  contextField?: keyof Pick<
    NormalizedCompanyMetrics,
    "companyName" | "filingDate" | "periodEnd" | "periodType" | "extractionQuality"
  >;
  betterDirection?: BetterDirection;
}> = [
  { section: "Context", key: "company_name", label: "Company Name", format: "text", contextField: "companyName" },
  { section: "Context", key: "filing_date", label: "Filing Date", format: "date", contextField: "filingDate" },
  { section: "Context", key: "period_end", label: "Period End", format: "date", contextField: "periodEnd" },
  { section: "Context", key: "period_type", label: "Period Type", format: "text", contextField: "periodType" },
  { section: "Context", key: "quality", label: "Confidence / Extraction Quality", format: "text", contextField: "extractionQuality" },

  { section: "Income Statement", key: "revenue", label: "Revenue", format: "currency", metricKey: "revenue", betterDirection: "higher" },
  { section: "Income Statement", key: "gross_profit", label: "Gross Profit", format: "currency", metricKey: "grossProfit", betterDirection: "higher" },
  { section: "Income Statement", key: "gross_margin", label: "Gross Margin", format: "percent", metricKey: "grossMargin", betterDirection: "higher" },
  { section: "Income Statement", key: "sga", label: "SG&A", format: "currency", metricKey: "sga", betterDirection: "lower" },
  { section: "Income Statement", key: "operating_income", label: "Operating Income", format: "currency", metricKey: "operatingIncome", betterDirection: "higher" },
  { section: "Income Statement", key: "operating_margin", label: "Operating Margin", format: "percent", metricKey: "operatingMargin", betterDirection: "higher" },
  { section: "Income Statement", key: "ebitda", label: "EBITDA", format: "currency", metricKey: "ebitda", betterDirection: "higher" },
  { section: "Income Statement", key: "ebitda_margin", label: "EBITDA Margin", format: "percent", metricKey: "ebitdaMargin", betterDirection: "higher" },
  { section: "Income Statement", key: "net_income", label: "Net Income", format: "currency", metricKey: "netIncome", betterDirection: "higher" },
  { section: "Income Statement", key: "net_margin", label: "Net Margin", format: "percent", metricKey: "netMargin", betterDirection: "higher" },

  { section: "Cash Flow", key: "ocf", label: "Operating Cash Flow", format: "currency", metricKey: "operatingCashFlow", betterDirection: "higher" },
  { section: "Cash Flow", key: "capex", label: "Capital Expenditures", format: "currency", metricKey: "capex", betterDirection: "neutral" },
  { section: "Cash Flow", key: "fcf", label: "Free Cash Flow", format: "currency", metricKey: "freeCashFlow", betterDirection: "higher" },
  { section: "Cash Flow", key: "dividends", label: "Dividends Paid", format: "currency", metricKey: "dividendsPaid", betterDirection: "neutral" },
  { section: "Cash Flow", key: "buybacks", label: "Share Repurchases", format: "currency", metricKey: "shareRepurchases", betterDirection: "neutral" },
  { section: "Cash Flow", key: "investing_cf", label: "Investing Cash Flow", format: "currency", metricKey: "investingCashFlow", betterDirection: "higher" },
  { section: "Cash Flow", key: "financing_cf", label: "Financing Cash Flow", format: "currency", metricKey: "financingCashFlow", betterDirection: "higher" },

  { section: "Balance Sheet / Capital Structure", key: "assets", label: "Total Assets", format: "currency", metricKey: "totalAssets", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "debt", label: "Total Debt", format: "currency", metricKey: "totalDebt", betterDirection: "lower" },
  { section: "Balance Sheet / Capital Structure", key: "equity", label: "Total Equity", format: "currency", metricKey: "totalEquity", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "cash", label: "Cash & Equivalents", format: "currency", metricKey: "cashAndEquivalents", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "net_debt", label: "Net Debt", format: "currency", metricKey: "netDebt", betterDirection: "lower" },
  { section: "Balance Sheet / Capital Structure", key: "current_ratio", label: "Current Ratio", format: "multiple", metricKey: "currentRatio", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "de_ratio", label: "Debt / Equity", format: "multiple", metricKey: "debtToEquity", betterDirection: "lower" },
  { section: "Balance Sheet / Capital Structure", key: "nd_ebitda", label: "Net Debt / EBITDA", format: "multiple", metricKey: "netDebtToEbitda", betterDirection: "lower" },
  { section: "Balance Sheet / Capital Structure", key: "interest_cov", label: "Interest Coverage", format: "multiple", metricKey: "interestCoverage", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "roa", label: "ROA", format: "percent", metricKey: "roa", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "roe", label: "ROE", format: "percent", metricKey: "roe", betterDirection: "higher" },
  { section: "Balance Sheet / Capital Structure", key: "roic", label: "ROIC", format: "percent", metricKey: "roic", betterDirection: "higher" },
];

function selectBetterSide(
  direction: BetterDirection | undefined,
  valueA: number | null,
  valueB: number | null
): "A" | "B" | null {
  if (direction == null || direction === "neutral") return null;
  if (valueA == null || valueB == null || valueA === valueB) return null;
  if (direction === "higher") return valueA > valueB ? "A" : "B";
  return valueA < valueB ? "A" : "B";
}

export function buildComparisonRows(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics
): ComparisonRow[] {
  return ROW_DEFINITIONS.map((rowDef) => {
    if (rowDef.contextField) {
      const valueA = companyA[rowDef.contextField];
      const valueB = companyB[rowDef.contextField];
      return {
        section: rowDef.section,
        key: rowDef.key,
        label: rowDef.label,
        format: rowDef.format,
        valueA: valueA ?? null,
        valueB: valueB ?? null,
        difference: null,
        better: null,
        derivedA: false,
        derivedB: false,
      };
    }

    const key = rowDef.metricKey as ComparableMetricKey;
    const valueA = companyA.metrics[key];
    const valueB = companyB.metrics[key];
    return {
      section: rowDef.section,
      key: rowDef.key,
      label: rowDef.label,
      format: rowDef.format,
      valueA,
      valueB,
      difference: valueA != null && valueB != null ? round(valueA - valueB, 3) : null,
      better: selectBetterSide(rowDef.betterDirection, valueA, valueB),
      derivedA: Boolean(companyA.derivedMetrics[key]),
      derivedB: Boolean(companyB.derivedMetrics[key]),
    };
  });
}

export function buildComparisonCharts(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics
): ComparisonCharts {
  const point = (metric: string, key: ComparableMetricKey) => ({
    metric,
    companyA: companyA.metrics[key],
    companyB: companyB.metrics[key],
  });

  return {
    financialBars: [
      point("Revenue", "revenue"),
      point("EBITDA", "ebitda"),
      point("Net Income", "netIncome"),
      point("Free Cash Flow", "freeCashFlow"),
    ],
    marginBars: [
      point("Gross Margin", "grossMargin"),
      point("Operating Margin", "operatingMargin"),
      point("Net Margin", "netMargin"),
    ],
    marginGapBars: [
      {
        metric: "Gross Margin",
        companyA: companyA.metrics.grossMargin,
        companyB: companyB.metrics.grossMargin,
        gapPp:
          companyA.metrics.grossMargin != null && companyB.metrics.grossMargin != null
            ? round(companyA.metrics.grossMargin - companyB.metrics.grossMargin, 2)
            : null,
      },
      {
        metric: "Operating Margin",
        companyA: companyA.metrics.operatingMargin,
        companyB: companyB.metrics.operatingMargin,
        gapPp:
          companyA.metrics.operatingMargin != null && companyB.metrics.operatingMargin != null
            ? round(companyA.metrics.operatingMargin - companyB.metrics.operatingMargin, 2)
            : null,
      },
      {
        metric: "Net Margin",
        companyA: companyA.metrics.netMargin,
        companyB: companyB.metrics.netMargin,
        gapPp:
          companyA.metrics.netMargin != null && companyB.metrics.netMargin != null
            ? round(companyA.metrics.netMargin - companyB.metrics.netMargin, 2)
            : null,
      },
      {
        metric: "EBITDA Margin",
        companyA: companyA.metrics.ebitdaMargin,
        companyB: companyB.metrics.ebitdaMargin,
        gapPp:
          companyA.metrics.ebitdaMargin != null && companyB.metrics.ebitdaMargin != null
            ? round(companyA.metrics.ebitdaMargin - companyB.metrics.ebitdaMargin, 2)
            : null,
      },
    ],
    capitalBars: [
      point("Total Debt", "totalDebt"),
      point("Total Equity", "totalEquity"),
      point("Net Debt", "netDebt"),
    ],
    cashFlowBars: [
      point("Operating Cash Flow", "operatingCashFlow"),
      point("CapEx", "capex"),
      point("Free Cash Flow", "freeCashFlow"),
    ],
  };
}

function buildTrendMetric(
  historyA: NormalizedCompanyMetrics[],
  historyB: NormalizedCompanyMetrics[],
  metric: ComparableMetricKey
): ComparisonTrendPoint[] {
  const mapA = new Map(historyA.map((entry) => [entry.periodEnd, entry]));
  const mapB = new Map(historyB.map((entry) => [entry.periodEnd, entry]));

  const periodEnds = Array.from(new Set([...mapA.keys(), ...mapB.keys()]))
    .sort((a, b) => a.localeCompare(b))
    .slice(-12);

  return periodEnds.map((periodEnd) => {
    const a = mapA.get(periodEnd);
    const b = mapB.get(periodEnd);
    return {
      periodEnd,
      quarterLabel: a?.quarterLabel ?? b?.quarterLabel ?? periodEnd,
      companyA: a?.metrics[metric] ?? null,
      companyB: b?.metrics[metric] ?? null,
    };
  });
}

export function buildComparisonTrends(
  historyA: NormalizedCompanyMetrics[],
  historyB: NormalizedCompanyMetrics[]
): ComparisonTrends {
  return {
    revenue: buildTrendMetric(historyA, historyB, "revenue"),
    grossMargin: buildTrendMetric(historyA, historyB, "grossMargin"),
    operatingMargin: buildTrendMetric(historyA, historyB, "operatingMargin"),
    netMargin: buildTrendMetric(historyA, historyB, "netMargin"),
    freeCashFlow: buildTrendMetric(historyA, historyB, "freeCashFlow"),
    sgaExpense: buildTrendMetric(historyA, historyB, "sga"),
  };
}

function computeTrendDelta(
  points: ComparisonTrendPoint[],
  side: "companyA" | "companyB"
): { first: number; last: number; change: number; fromLabel: string; toLabel: string } | null {
  const valid = points.filter((point) => typeof point[side] === "number") as Array<
    ComparisonTrendPoint & { [K in "companyA" | "companyB"]: number | null }
  >;
  if (valid.length < 2) return null;

  const firstPoint = valid[0];
  const lastPoint = valid[valid.length - 1];
  const first = firstPoint[side];
  const last = lastPoint[side];
  if (first == null || last == null) return null;

  return {
    first,
    last,
    change: round(last - first, 2),
    fromLabel: firstPoint.quarterLabel,
    toLabel: lastPoint.quarterLabel,
  };
}

export function buildComparisonReport(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics,
  trends: ComparisonTrends,
  warnings: ComparisonWarning[]
): ComparisonReport {
  const revenueA = companyA.metrics.revenue;
  const revenueB = companyB.metrics.revenue;
  const netMarginA = companyA.metrics.netMargin;
  const netMarginB = companyB.metrics.netMargin;
  const fcfA = companyA.metrics.freeCashFlow;
  const fcfB = companyB.metrics.freeCashFlow;
  const debtToEquityA = companyA.metrics.debtToEquity;
  const debtToEquityB = companyB.metrics.debtToEquity;
  const netDebtA = companyA.metrics.netDebt;
  const netDebtB = companyB.metrics.netDebt;

  const scaleBullet =
    revenueA != null && revenueB != null
      ? revenueA === revenueB
        ? `${companyA.ticker} and ${companyB.ticker} report the same revenue at ${fmtCurrency(revenueA)}.`
        : `${revenueA > revenueB ? companyA.ticker : companyB.ticker} leads on revenue (${fmtCurrency(
            Math.max(revenueA, revenueB)
          )} vs ${fmtCurrency(Math.min(revenueA, revenueB))}).`
      : `Revenue is missing for ${revenueA == null ? companyA.ticker : ""}${
          revenueA == null && revenueB == null ? " and " : ""
        }${revenueB == null ? companyB.ticker : ""}.`;

  const profitabilityBullet =
    netMarginA != null && netMarginB != null
      ? `${netMarginA >= netMarginB ? companyA.ticker : companyB.ticker} has the stronger net margin (${fmtPercent(
          Math.max(netMarginA, netMarginB)
        )} vs ${fmtPercent(Math.min(netMarginA, netMarginB))}).`
      : "Net margin comparison is partial due to missing values.";

  const gapMetrics = [
    { label: "Gross margin", a: companyA.metrics.grossMargin, b: companyB.metrics.grossMargin },
    { label: "Operating margin", a: companyA.metrics.operatingMargin, b: companyB.metrics.operatingMargin },
    { label: "Net margin", a: companyA.metrics.netMargin, b: companyB.metrics.netMargin },
  ];
  const gapBullets = gapMetrics.map(({ label, a, b }) => {
    if (a == null || b == null) return `${label}: N/A due to incomplete extraction.`;
    const gap = round(a - b, 2);
    const leader = gap >= 0 ? companyA.ticker : companyB.ticker;
    return `${label}: ${leader} leads by ${Math.abs(gap).toFixed(1)}pp (${fmtPercent(a)} vs ${fmtPercent(b)}).`;
  });

  const financialBullets = [
    fcfA != null && fcfB != null
      ? `${fcfA >= fcfB ? companyA.ticker : companyB.ticker} generates higher free cash flow (${fmtCurrency(
          Math.max(fcfA, fcfB)
        )} vs ${fmtCurrency(Math.min(fcfA, fcfB))}).`
      : "Free cash flow is missing for one or both companies.",
    netDebtA != null && netDebtB != null
      ? `${netDebtA <= netDebtB ? companyA.ticker : companyB.ticker} has lower net debt (${fmtCurrency(
          Math.min(netDebtA, netDebtB)
        )} vs ${fmtCurrency(Math.max(netDebtA, netDebtB))}).`
      : "Net debt cannot be compared because debt/cash inputs are incomplete.",
    debtToEquityA != null && debtToEquityB != null
      ? `Leverage (Debt/Equity): ${companyA.ticker} ${fmtMultiple(debtToEquityA)} vs ${companyB.ticker} ${fmtMultiple(
          debtToEquityB
        )}.`
      : "Debt/Equity ratio is missing for one or both companies.",
  ];

  const revTrendA = computeTrendDelta(trends.revenue, "companyA");
  const revTrendB = computeTrendDelta(trends.revenue, "companyB");
  const marginTrendA = computeTrendDelta(trends.operatingMargin, "companyA");
  const marginTrendB = computeTrendDelta(trends.operatingMargin, "companyB");

  const trendBullets = [
    revTrendA
      ? `${companyA.ticker} revenue moved ${revTrendA.change >= 0 ? "up" : "down"} ${fmtCurrency(
          Math.abs(revTrendA.change)
        )} from ${revTrendA.fromLabel} to ${revTrendA.toLabel}.`
      : `${companyA.ticker} revenue trend has insufficient history.`,
    revTrendB
      ? `${companyB.ticker} revenue moved ${revTrendB.change >= 0 ? "up" : "down"} ${fmtCurrency(
          Math.abs(revTrendB.change)
        )} from ${revTrendB.fromLabel} to ${revTrendB.toLabel}.`
      : `${companyB.ticker} revenue trend has insufficient history.`,
    marginTrendA && marginTrendB
      ? `Operating margin trend: ${companyA.ticker} ${marginTrendA.change >= 0 ? "+" : ""}${marginTrendA.change.toFixed(
          1
        )}pp, ${companyB.ticker} ${marginTrendB.change >= 0 ? "+" : ""}${marginTrendB.change.toFixed(1)}pp.`
      : "Operating margin trend is limited by historical coverage.",
  ];

  const warningBullets =
    warnings.length > 0
      ? warnings.slice(0, 3).map((warning) => warning.message)
      : ["No major data-quality warnings were detected for this comparison."];

  return {
    title: `${companyA.companyName} vs ${companyB.companyName} Comparison Report`,
    subtitle: `${companyA.quarterLabel} (${companyA.periodEnd}) vs ${companyB.quarterLabel} (${companyB.periodEnd})`,
    sections: [
      {
        key: "overview",
        title: "Overview",
        bullets: [scaleBullet, profitabilityBullet, ...warningBullets],
      },
      {
        key: "margin-gaps",
        title: "Margin Gaps",
        bullets: gapBullets,
      },
      {
        key: "financials",
        title: "Financials",
        bullets: financialBullets,
      },
      {
        key: "trends",
        title: "Trends",
        bullets: trendBullets,
      },
    ],
  };
}

function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function winnerForValues(
  valueA: number | null,
  valueB: number | null,
  betterDirection: "higher" | "lower"
): "A" | "B" | null {
  if (valueA == null || valueB == null) return null;
  if (valueA === valueB) return null;
  if (betterDirection === "higher") return valueA > valueB ? "A" : "B";
  return valueA < valueB ? "A" : "B";
}

export function buildSegmentComparisonRows(
  selectedA: Filing,
  selectedB: Filing
): SegmentComparisonRow[] {
  type SegmentEntry = NonNullable<FullAnalysis["segments"]>[number];
  const segmentsA = selectedA.analysis.segments ?? [];
  const segmentsB = selectedB.analysis.segments ?? [];

  const mapByName = (segments: SegmentEntry[]) => {
    const map = new Map<string, SegmentEntry>();
    for (const segment of segments) {
      const key = normalizeNameKey(segment.segmentName);
      if (!key) continue;
      const existing = map.get(key);
      const currentSize = Math.abs(segment.revenue ?? 0);
      const existingSize = Math.abs(existing?.revenue ?? 0);
      if (!existing || currentSize > existingSize) {
        map.set(key, segment);
      }
    }
    return map;
  };

  const mapA = mapByName(segmentsA);
  const mapB = mapByName(segmentsB);
  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );

  return keys.map((key) => {
    const segA = mapA.get(key);
    const segB = mapB.get(key);
    const marginA = toNumber(segA?.operatingMargin);
    const marginB = toNumber(segB?.operatingMargin);

    return {
      segment: segA?.segmentName ?? segB?.segmentName ?? key,
      companyARevenue: toNumber(segA?.revenue),
      companyBRevenue: toNumber(segB?.revenue),
      companyAOperatingIncome: toNumber(segA?.operatingIncome),
      companyBOperatingIncome: toNumber(segB?.operatingIncome),
      companyAOperatingMargin: marginA,
      companyBOperatingMargin: marginB,
      marginGapPp:
        marginA != null && marginB != null ? round(marginA - marginB, 2) : null,
      better: winnerForValues(marginA, marginB, "higher"),
    };
  });
}

function snapshotMethodologyVariants(
  variants: FullAnalysis["methodologyVariants"]
): MethodologyVariantSnapshot[] {
  return (variants ?? []).map((variant) => ({
    label: variant.label,
    corporateAllocation: toNumber(variant.corporateAllocation),
    corporateAsPercentOfRevenue: toNumber(variant.corporateAsPercentOfRevenue),
    amortizationExpense: toNumber(variant.amortizationExpense),
  }));
}

export function buildMethodologyComparison(
  selectedA: Filing,
  selectedB: Filing,
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics
): MethodologyComparison {
  const variantsA = snapshotMethodologyVariants(selectedA.analysis.methodologyVariants);
  const variantsB = snapshotMethodologyVariants(selectedB.analysis.methodologyVariants);

  const notes: string[] = [];
  if (variantsA.length > 1) {
    notes.push(
      `${companyA.ticker} reports multiple methodology variants (${variantsA.length}), which can affect quarter-over-quarter comparability.`
    );
  }
  if (variantsB.length > 1) {
    notes.push(
      `${companyB.ticker} reports multiple methodology variants (${variantsB.length}), which can affect quarter-over-quarter comparability.`
    );
  }

  const amortA = toNumber(selectedA.analysis.incomeStatement?.amortization);
  const amortB = toNumber(selectedB.analysis.incomeStatement?.amortization);
  if (amortA != null && amortB != null) {
    const leader = amortA > amortB ? companyA.ticker : companyB.ticker;
    notes.push(
      `${leader} carries higher reported amortization (${fmtCurrency(Math.max(amortA, amortB))} vs ${fmtCurrency(
        Math.min(amortA, amortB)
      )}), which can pressure reported earnings.`
    );
  }

  const nonRecurringA = selectedA.analysis.nonRecurringItems?.length ?? 0;
  const nonRecurringB = selectedB.analysis.nonRecurringItems?.length ?? 0;
  if (nonRecurringA > 0 || nonRecurringB > 0) {
    notes.push(
      `Non-recurring items detected: ${companyA.ticker} (${nonRecurringA}) vs ${companyB.ticker} (${nonRecurringB}).`
    );
  }

  return {
    companyAHasVariants: variantsA.length > 0,
    companyBHasVariants: variantsB.length > 0,
    companyAVariants: variantsA,
    companyBVariants: variantsB,
    notes,
  };
}

function countMetricWins(
  points: ComparisonTrendPoint[],
  betterDirection: "higher" | "lower"
): Omit<RelativePerformanceRow, "metric"> {
  let companyAWins = 0;
  let companyBWins = 0;
  let ties = 0;
  let sampleSize = 0;

  for (const point of points) {
    const a = point.companyA;
    const b = point.companyB;
    if (a == null || b == null) continue;

    sampleSize += 1;
    if (a === b) {
      ties += 1;
      continue;
    }

    const aBetter =
      betterDirection === "higher" ? a > b : a < b;
    if (aBetter) companyAWins += 1;
    else companyBWins += 1;
  }

  return {
    companyAWins,
    companyBWins,
    ties,
    sampleSize,
  };
}

export function buildRelativePerformance(
  trends: ComparisonTrends
): RelativePerformanceRow[] {
  return [
    {
      metric: "Operating Margin",
      ...countMetricWins(trends.operatingMargin, "higher"),
    },
    {
      metric: "Net Margin",
      ...countMetricWins(trends.netMargin, "higher"),
    },
    {
      metric: "Free Cash Flow",
      ...countMetricWins(trends.freeCashFlow, "higher"),
    },
    {
      metric: "SG&A Expense",
      ...countMetricWins(trends.sgaExpense, "lower"),
    },
  ].filter((row) => row.sampleSize > 0);
}

function boardInsightText(
  metric: string,
  winner: "A" | "B" | null,
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics
): string {
  if (!winner) return `${metric}: comparable between both companies — no structural edge identified.`;
  const lead = winner === "A" ? companyA.ticker : companyB.ticker;
  const lag  = winner === "A" ? companyB.ticker : companyA.ticker;

  if (metric === "Revenue")
    return `${lead} holds a revenue scale advantage over ${lag}, enabling greater fixed-cost absorption and supplier leverage. Scale alone doesn't determine profitability — watch margin conversion.`;
  if (metric === "Operating Margin")
    return `${lead} converts revenue to operating profit more efficiently, implying either a lower cost structure, superior pricing power, or less corporate overhead drag. This is the most reliable profitability signal.`;
  if (metric === "Gross Margin")
    return `${lead} retains more revenue after direct production costs, suggesting better input-cost management, pricing discipline, or a higher-value product mix — the primary driver of sustainable margin difference.`;
  if (metric === "Net Margin")
    return `${lead} earns more after all costs including tax, interest, and one-time items. Verify whether the advantage is structural (core operations) or episodic (tax benefit, lower interest).`;
  if (metric === "Free Cash Flow")
    return `${lead} converts earnings to cash more effectively, signaling either lower working-capital intensity or less CapEx drag. FCF is the cleanest indicator of true capital generation capacity.`;
  if (metric === "Total Debt")
    return `${lead} carries a lighter absolute debt burden, reducing refinancing risk and providing greater financial flexibility under stress. Cross-check against EBITDA coverage to assess true leverage.`;
  if (metric === "Debt / Equity")
    return `${lead} maintains lower financial leverage relative to equity capital, indicating a more conservative balance sheet. This constrains financial risk but may also reflect underinvestment.`;
  if (metric === "ROIC" || metric === "roic")
    return `${lead} generates higher returns on invested capital — the single best indicator of whether capital allocation decisions are creating shareholder value versus destroying it.`;
  if (metric === "ROE" || metric === "roe")
    return `${lead} earns more on equity capital. Verify whether this advantage comes from superior profitability (positive signal) or from high leverage amplifying returns (risk signal).`;
  if (metric === "SG&A % Revenue")
    return `${lead} runs a leaner overhead structure relative to revenue, providing a structural cost advantage that compounds over time as revenue scales.`;
  if (metric === "EBITDA Margin")
    return `${lead} generates more pre-D&A operating cash, a proxy for underlying operational efficiency before capital structure and accounting choices intervene.`;
  if (metric === "Operating Margin Trend (12Q Delta)")
    return `${lead} shows a positive operating margin trajectory over the measurement window, indicating improving operational efficiency or favorable mix shift rather than one-period noise.`;
  return `${lead} currently leads ${lag} on ${metric}. Evaluate whether this reflects structural competitive advantage or a period-specific accounting or business-mix factor.`;
}

export function buildBoardInsights(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics,
  trends: ComparisonTrends
): BoardInsightRow[] {
  const operatingTrendA = computeTrendDelta(trends.operatingMargin, "companyA");
  const operatingTrendB = computeTrendDelta(trends.operatingMargin, "companyB");
  const operatingTrendWinner = winnerForValues(
    operatingTrendA?.change ?? null,
    operatingTrendB?.change ?? null,
    "higher"
  );

  const rows: BoardInsightRow[] = [
    {
      metric: "Revenue",
      format: "currency",
      valueA: companyA.metrics.revenue,
      valueB: companyB.metrics.revenue,
      winner: winnerForValues(companyA.metrics.revenue, companyB.metrics.revenue, "higher"),
      insight: "",
    },
    {
      metric: "Gross Margin",
      format: "percent",
      valueA: companyA.metrics.grossMargin,
      valueB: companyB.metrics.grossMargin,
      winner: winnerForValues(companyA.metrics.grossMargin, companyB.metrics.grossMargin, "higher"),
      insight: "",
    },
    {
      metric: "Operating Margin",
      format: "percent",
      valueA: companyA.metrics.operatingMargin,
      valueB: companyB.metrics.operatingMargin,
      winner: winnerForValues(companyA.metrics.operatingMargin, companyB.metrics.operatingMargin, "higher"),
      insight: "",
    },
    {
      metric: "EBITDA Margin",
      format: "percent",
      valueA: companyA.metrics.ebitdaMargin,
      valueB: companyB.metrics.ebitdaMargin,
      winner: winnerForValues(companyA.metrics.ebitdaMargin, companyB.metrics.ebitdaMargin, "higher"),
      insight: "",
    },
    {
      metric: "Net Margin",
      format: "percent",
      valueA: companyA.metrics.netMargin,
      valueB: companyB.metrics.netMargin,
      winner: winnerForValues(companyA.metrics.netMargin, companyB.metrics.netMargin, "higher"),
      insight: "",
    },
    {
      metric: "Free Cash Flow",
      format: "currency",
      valueA: companyA.metrics.freeCashFlow,
      valueB: companyB.metrics.freeCashFlow,
      winner: winnerForValues(companyA.metrics.freeCashFlow, companyB.metrics.freeCashFlow, "higher"),
      insight: "",
    },
    {
      metric: "ROIC",
      format: "percent",
      valueA: companyA.metrics.roic,
      valueB: companyB.metrics.roic,
      winner: winnerForValues(companyA.metrics.roic, companyB.metrics.roic, "higher"),
      insight: "",
    },
    {
      metric: "Total Debt",
      format: "currency",
      valueA: companyA.metrics.totalDebt,
      valueB: companyB.metrics.totalDebt,
      winner: winnerForValues(companyA.metrics.totalDebt, companyB.metrics.totalDebt, "lower"),
      insight: "",
    },
    {
      metric: "Debt / Equity",
      format: "multiple",
      valueA: companyA.metrics.debtToEquity,
      valueB: companyB.metrics.debtToEquity,
      winner: winnerForValues(companyA.metrics.debtToEquity, companyB.metrics.debtToEquity, "lower"),
      insight: "",
    },
    {
      metric: "SG&A % Revenue",
      format: "percent",
      valueA: companyA.metrics.revenue != null && companyA.metrics.sga != null
        ? round((companyA.metrics.sga / companyA.metrics.revenue) * 100, 1)
        : null,
      valueB: companyB.metrics.revenue != null && companyB.metrics.sga != null
        ? round((companyB.metrics.sga / companyB.metrics.revenue) * 100, 1)
        : null,
      winner: (() => {
        const sgaPctA = companyA.metrics.revenue != null && companyA.metrics.sga != null
          ? (companyA.metrics.sga / companyA.metrics.revenue) : null;
        const sgaPctB = companyB.metrics.revenue != null && companyB.metrics.sga != null
          ? (companyB.metrics.sga / companyB.metrics.revenue) : null;
        return winnerForValues(sgaPctA, sgaPctB, "lower");
      })(),
      insight: "",
    },
    {
      metric: "Operating Margin Trend (12Q Delta)",
      format: "percent",
      valueA: operatingTrendA?.change ?? null,
      valueB: operatingTrendB?.change ?? null,
      winner: operatingTrendWinner,
      insight:
        operatingTrendA && operatingTrendB
          ? `${companyA.ticker} moved ${operatingTrendA.change >= 0 ? "+" : ""}${operatingTrendA.change.toFixed(1)}pp from ${operatingTrendA.fromLabel} to ${operatingTrendA.toLabel}; ${companyB.ticker} moved ${operatingTrendB.change >= 0 ? "+" : ""}${operatingTrendB.change.toFixed(1)}pp over the same window. ${operatingTrendWinner ? `Trajectory advantage: ${operatingTrendWinner === "A" ? companyA.ticker : companyB.ticker}.` : "Trajectories are equivalent."}`
          : "Insufficient trend history to evaluate operating margin direction.",
    },
  ];

  return rows.map((row) => ({
    ...row,
    insight: row.insight || boardInsightText(row.metric, row.winner, companyA, companyB),
  }));
}

export function buildComparisonNarrative(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics,
  trends: ComparisonTrends,
  warnings: ComparisonWarning[],
  relativePerformance: RelativePerformanceRow[],
  methodologyComparison: MethodologyComparison
): ComparisonNarrative {
  const tA = companyA.ticker;
  const tB = companyB.ticker;

  // Pre-compute winners & trends once
  const revenueWinner   = winnerForValues(companyA.metrics.revenue, companyB.metrics.revenue, "higher");
  const marginWinner    = winnerForValues(companyA.metrics.operatingMargin, companyB.metrics.operatingMargin, "higher");
  const grossWinner     = winnerForValues(companyA.metrics.grossMargin, companyB.metrics.grossMargin, "higher");
  const fcfWinner       = winnerForValues(companyA.metrics.freeCashFlow, companyB.metrics.freeCashFlow, "higher");
  const sgaWinner       = winnerForValues(
    companyA.metrics.sga != null && companyA.metrics.revenue != null ? companyA.metrics.sga / companyA.metrics.revenue : null,
    companyB.metrics.sga != null && companyB.metrics.revenue != null ? companyB.metrics.sga / companyB.metrics.revenue : null,
    "lower"
  );

  const leadScale  = revenueWinner === "A" ? tA : revenueWinner === "B" ? tB : null;
  const leadMargin = marginWinner  === "A" ? tA : marginWinner  === "B" ? tB : null;
  const leadGross  = grossWinner   === "A" ? tA : grossWinner   === "B" ? tB : null;
  const leadCash   = fcfWinner     === "A" ? tA : fcfWinner     === "B" ? tB : null;
  const leadSga    = sgaWinner     === "A" ? tA : sgaWinner     === "B" ? tB : null;

  const revTrendA  = computeTrendDelta(trends.revenue, "companyA");
  const revTrendB  = computeTrendDelta(trends.revenue, "companyB");
  const grossTrendA = computeTrendDelta(trends.grossMargin, "companyA");
  const grossTrendB = computeTrendDelta(trends.grossMargin, "companyB");
  const opTrendA   = computeTrendDelta(trends.operatingMargin, "companyA");
  const opTrendB   = computeTrendDelta(trends.operatingMargin, "companyB");
  const sgaTrendA  = computeTrendDelta(trends.sgaExpense, "companyA");
  const sgaTrendB  = computeTrendDelta(trends.sgaExpense, "companyB");

  const opGapPp = companyA.metrics.operatingMargin != null && companyB.metrics.operatingMargin != null
    ? round(companyA.metrics.operatingMargin - companyB.metrics.operatingMargin, 1) : null;
  const grossGapPp = companyA.metrics.grossMargin != null && companyB.metrics.grossMargin != null
    ? round(companyA.metrics.grossMargin - companyB.metrics.grossMargin, 1) : null;

  // ── Section 1: Executive Summary ─────────────────────────────────────────
  const executiveSummary: string[] = [];
  if (leadScale && leadMargin && leadScale !== leadMargin) {
    const lagScale  = leadScale  === tA ? tB : tA;
    const lagMargin = leadMargin === tA ? tB : tA;
    executiveSummary.push(
      `${leadScale} holds the revenue scale advantage over ${lagScale}, yet ${leadMargin} outperforms on operating profitability → driven by a structurally leaner cost structure → implying ${leadMargin}'s core business is more capital-efficient, not disadvantaged by smaller size.`
    );
  } else if (leadScale) {
    const lag = leadScale === tA ? tB : tA;
    executiveSummary.push(
      `${leadScale} leads both on revenue scale and operating margin over ${lag} → indicating dominant positioning across both top-line and cost dimensions → suggesting a compounding competitive moat.`
    );
  }
  if (leadGross && opGapPp != null && grossGapPp != null) {
    const sgaContrib = opGapPp != null && grossGapPp != null ? round(opGapPp - grossGapPp, 1) : null;
    if (Math.abs(grossGapPp) > 0.5) {
      executiveSummary.push(
        `${leadGross} holds a ${Math.abs(grossGapPp).toFixed(1)}pp gross margin advantage → driven by superior input-cost control or pricing power at the product level${sgaContrib != null && Math.abs(sgaContrib) > 0.5 ? `, partially offset by a ${Math.abs(sgaContrib).toFixed(1)}pp overhead differential` : ""} → this is a structural production-level advantage that is difficult to replicate without fundamental operational change.`
      );
    }
  }
  if (leadCash) {
    const lagCash = leadCash === tA ? tB : tA;
    executiveSummary.push(
      `${leadCash} demonstrates stronger free-cash-flow conversion over ${lagCash} → driven by higher operating cash generation relative to CapEx investment → implying ${leadCash} retains more financial optionality for shareholder returns, debt reduction, or M&A.`
    );
  }
  if (methodologyComparison.notes.length > 0) {
    executiveSummary.push(
      `Methodology distortions are present: ${methodologyComparison.notes[0]} → these accounting differences can mask true operating performance → reported comparisons should be normalized before any strategic conclusion.`
    );
  }
  if (executiveSummary.length === 0) {
    executiveSummary.push(`${tA} and ${tB} are broadly comparable on reported metrics; deeper segment and cost-structure analysis is required to identify performance drivers.`);
  }

  // ── Section 2: True Performance Diagnosis ────────────────────────────────
  const truePerformanceDiagnosis: string[] = [];
  const hasMethodology = methodologyComparison.companyAVariants.length > 0 || methodologyComparison.companyBVariants.length > 0;

  if (hasMethodology) {
    const varA = methodologyComparison.companyAVariants[0];
    const varB = methodologyComparison.companyBVariants[0];
    if (varA && varB) {
      truePerformanceDiagnosis.push(
        `Reported operating margin for ${tA} (${fmtPercent(companyA.metrics.operatingMargin)}) includes corporate allocation of ${fmtCurrency(varA.corporateAllocation)}; ${tB} (${fmtPercent(companyB.metrics.operatingMargin)}) includes ${fmtCurrency(varB.corporateAllocation)}. After normalizing, the segment-level advantage may differ materially from headline numbers.`
      );
      if (varA.corporateAsPercentOfRevenue != null && varB.corporateAsPercentOfRevenue != null) {
        const heavier = varA.corporateAsPercentOfRevenue > varB.corporateAsPercentOfRevenue ? tA : tB;
        const lighter = heavier === tA ? tB : tA;
        truePerformanceDiagnosis.push(
          `${heavier} carries a proportionally heavier corporate overhead burden (${fmtPercent(Math.max(varA.corporateAsPercentOfRevenue, varB.corporateAsPercentOfRevenue))} of revenue vs ${fmtPercent(Math.min(varA.corporateAsPercentOfRevenue, varB.corporateAsPercentOfRevenue))} for ${lighter}) → segment results for ${heavier} are understated relative to ${lighter} on an apples-to-apples basis.`
        );
      }
    }
    truePerformanceDiagnosis.push(
      `After normalizing for allocation differences, evaluate whether the operating margin gap of ${opGapPp != null ? `${opGapPp > 0 ? "+" : ""}${opGapPp.toFixed(1)}pp` : "N/A"} is driven by genuine operating efficiency or by allocation accounting choices.`
    );
  } else {
    truePerformanceDiagnosis.push(
      `No methodology variants were extracted; reported margins are compared as-is. Operating margin: ${tA} ${fmtPercent(companyA.metrics.operatingMargin)} vs ${tB} ${fmtPercent(companyB.metrics.operatingMargin)} (gap: ${opGapPp != null ? `${opGapPp > 0 ? "+" : ""}${opGapPp.toFixed(1)}pp` : "N/A"}).`
    );
    truePerformanceDiagnosis.push(
      `Without segment-level cost allocation detail, it is not possible to separate true core profitability from corporate overhead drag. Single-period reported margins should be treated as directional, not definitive.`
    );
  }

  // ── Section 4: Cost Structure Bridge ────────────────────────────────────
  const costStructureBridge: string[] = [];
  const revA  = companyA.metrics.revenue;
  const revB  = companyB.metrics.revenue;
  const gpA   = companyA.metrics.grossProfit;
  const gpB   = companyB.metrics.grossProfit;
  const sgaA  = companyA.metrics.sga;
  const sgaB  = companyB.metrics.sga;
  const oiA   = companyA.metrics.operatingIncome;
  const oiB   = companyB.metrics.operatingIncome;

  if (revA != null && gpA != null && sgaA != null && oiA != null) {
    const cogsPctA = revA > 0 ? round(((revA - gpA) / revA) * 100, 1) : null;
    const sgaPctA  = revA > 0 ? round((sgaA / revA) * 100, 1) : null;
    costStructureBridge.push(
      `${tA} P&L bridge: Revenue ${fmtCurrency(revA)} → Gross Profit ${fmtCurrency(gpA)} (COGS: ${fmtPercent(cogsPctA)}) → less SG&A ${fmtCurrency(sgaA)} (${fmtPercent(sgaPctA)} of revenue) → Operating Income ${fmtCurrency(oiA)} (${fmtPercent(companyA.metrics.operatingMargin)}).`
    );
  }
  if (revB != null && gpB != null && sgaB != null && oiB != null) {
    const cogsPctB = revB > 0 ? round(((revB - gpB) / revB) * 100, 1) : null;
    const sgaPctB  = revB > 0 ? round((sgaB / revB) * 100, 1) : null;
    costStructureBridge.push(
      `${tB} P&L bridge: Revenue ${fmtCurrency(revB)} → Gross Profit ${fmtCurrency(gpB)} (COGS: ${fmtPercent(cogsPctB)}) → less SG&A ${fmtCurrency(sgaB)} (${fmtPercent(sgaPctB)} of revenue) → Operating Income ${fmtCurrency(oiB)} (${fmtPercent(companyB.metrics.operatingMargin)}).`
    );
  }
  if (grossGapPp != null && opGapPp != null) {
    const sgaDiffPp = round(opGapPp - grossGapPp, 1);
    const primaryDriver = Math.abs(grossGapPp) >= Math.abs(sgaDiffPp) ? "gross margin (COGS / product-level profitability)" : "SG&A overhead";
    costStructureBridge.push(
      `Gap attribution: ${tA} vs ${tB} gross margin gap = ${grossGapPp > 0 ? "+" : ""}${grossGapPp.toFixed(1)}pp; SG&A drag differential = ${sgaDiffPp > 0 ? "+" : ""}${sgaDiffPp.toFixed(1)}pp. Primary cost gap driver: ${primaryDriver}.`
    );
  }
  if (leadSga) {
    const lagSga = leadSga === tA ? tB : tA;
    costStructureBridge.push(`${leadSga} runs a structurally leaner SG&A base relative to revenue than ${lagSga} → this overhead advantage compresses with scale and may reflect better process efficiency, lower distribution cost, or organizational design.`);
  }

  // ── Section 5: Capital Allocation ────────────────────────────────────────
  const capexA  = companyA.metrics.capex;
  const capexB  = companyB.metrics.capex;
  const debtA   = companyA.metrics.totalDebt;
  const debtB   = companyB.metrics.totalDebt;
  const buybackA = companyA.metrics.shareRepurchases;
  const buybackB = companyB.metrics.shareRepurchases;

  const capitalAllocationStory: string[] = [];
  if (capexA != null && capexB != null && revA != null && revB != null) {
    const capexPctA = round((capexA / revA) * 100, 1);
    const capexPctB = round((capexB / revB) * 100, 1);
    const higherCapex = capexPctA > capexPctB ? tA : tB;
    const lowerCapex  = higherCapex === tA ? tB : tA;
    capitalAllocationStory.push(
      `CapEx intensity: ${tA} ${fmtCurrency(capexA)} (${fmtPercent(capexPctA)} of revenue) vs ${tB} ${fmtCurrency(capexB)} (${fmtPercent(capexPctB)} of revenue). ${higherCapex} invests proportionally more in capacity → this either signals growth optionality or maintenance-cost drag depending on asset age and M&A history.`
    );
  } else {
    capitalAllocationStory.push(`CapEx comparison is incomplete due to missing values for one or both companies.`);
  }
  if (buybackA != null || buybackB != null) {
    capitalAllocationStory.push(
      `Share repurchases: ${tA} ${fmtCurrency(buybackA)} vs ${tB} ${fmtCurrency(buybackB)}. ${buybackA != null && buybackB != null && buybackA > buybackB ? `${tA} is returning more capital to shareholders, signaling management confidence in FCF durability.` : buybackA != null && buybackB != null && buybackB > buybackA ? `${tB} is the more aggressive repurchaser, implying stronger balance-sheet confidence.` : "Both companies appear to have similar or limited repurchase activity."}`
    );
  }
  if (debtA != null && debtB != null) {
    const ebitdaA = companyA.metrics.ebitda;
    const ebitdaB = companyB.metrics.ebitda;
    const leverageA = ebitdaA != null && ebitdaA > 0 ? round(debtA / ebitdaA, 1) : null;
    const leverageB = ebitdaB != null && ebitdaB > 0 ? round(debtB / ebitdaB, 1) : null;
    capitalAllocationStory.push(
      `Leverage: ${tA} net debt coverage ${leverageA != null ? `${leverageA}x EBITDA` : fmtCurrency(debtA) + " total debt"} vs ${tB} ${leverageB != null ? `${leverageB}x EBITDA` : fmtCurrency(debtB) + " total debt"}. ${
        leverageA != null && leverageB != null
          ? leverageA > leverageB
            ? `${tA}'s higher leverage may reflect acquisition-driven asset accumulation with residual amortization consequences.`
            : `${tB}'s higher leverage warrants monitoring, particularly if FCF generation deteriorates.`
          : "Debt postures differ materially; evaluate in context of FCF coverage."
      }`
    );
  }

  // ── Section 6: Margin Gap Decomposition ─────────────────────────────────
  const marginGapDecomposition: string[] = [];
  if (opGapPp != null) {
    marginGapDecomposition.push(
      `Total operating margin gap (${tA} minus ${tB}): ${opGapPp > 0 ? "+" : ""}${opGapPp.toFixed(1)}pp.`
    );
    if (grossGapPp != null) {
      const sgaContribPp = round(opGapPp - grossGapPp, 1);
      marginGapDecomposition.push(
        `Gross margin contribution: ${grossGapPp > 0 ? "+" : ""}${grossGapPp.toFixed(1)}pp → attributable to product-level pricing, input cost, or mix. This is the raw material / production efficiency component.`
      );
      marginGapDecomposition.push(
        `SG&A / overhead contribution: ${sgaContribPp > 0 ? "+" : ""}${sgaContribPp.toFixed(1)}pp → attributable to organizational scale, distribution network cost, or corporate allocation methodology differences.`
      );
      const primaryDriver = Math.abs(grossGapPp) >= Math.abs(sgaContribPp)
        ? `gross margin (product economics) drives ${Math.round(Math.abs(grossGapPp) / Math.abs(opGapPp) * 100)}% of the operating gap`
        : `SG&A/overhead drives ${Math.round(Math.abs(sgaContribPp) / Math.abs(opGapPp) * 100)}% of the operating gap`;
      marginGapDecomposition.push(`Core gap driver: ${primaryDriver}. Corrective action should prioritize this lever.`);
    }
    if (methodologyComparison.notes.length > 0) {
      marginGapDecomposition.push(`Allocation distortion: at least ${methodologyComparison.notes.length} methodology comparability note(s) flagged — portion of margin gap may be accounting-driven rather than operational.`);
    }
  } else {
    marginGapDecomposition.push("Operating margin data is insufficient for a quantitative gap decomposition. Directional assessment only.");
  }

  // ── Section 7: What Changed ──────────────────────────────────────────────
  const whatChanged: string[] = [];
  if (revTrendA) {
    const dir = revTrendA.change > 0 ? "accelerated" : "decelerated";
    whatChanged.push(
      `${tA} revenue ${dir} by ${revTrendA.change > 0 ? "+" : ""}${revTrendA.change.toFixed(1)}M from ${revTrendA.fromLabel} to ${revTrendA.toLabel}. ${revTrendA.change > 0 ? "Positive volume/pricing momentum." : "Negative signal — investigate volume vs pricing mix."}`
    );
  }
  if (revTrendB) {
    const dir = revTrendB.change > 0 ? "accelerated" : "decelerated";
    whatChanged.push(
      `${tB} revenue ${dir} by ${revTrendB.change > 0 ? "+" : ""}${revTrendB.change.toFixed(1)}M from ${revTrendB.fromLabel} to ${revTrendB.toLabel}.`
    );
  }
  if (opTrendA) {
    const signal = opTrendA.change > 0
      ? "improving operating leverage or cost discipline"
      : "cost inflation, pricing lag, or mix deterioration";
    whatChanged.push(
      `${tA} operating margin moved ${opTrendA.change > 0 ? "+" : ""}${opTrendA.change.toFixed(1)}pp (${opTrendA.fromLabel}–${opTrendA.toLabel}), consistent with ${signal}.`
    );
  }
  if (opTrendB) {
    const signal = opTrendB.change > 0
      ? "improving efficiency or mix benefit"
      : "rising cost headwinds or volume decline";
    whatChanged.push(
      `${tB} operating margin moved ${opTrendB.change > 0 ? "+" : ""}${opTrendB.change.toFixed(1)}pp (${opTrendB.fromLabel}–${opTrendB.toLabel}), consistent with ${signal}.`
    );
  }
  if (grossTrendA && revTrendA) {
    if (revTrendA.change > 0 && grossTrendA.change < 0) {
      whatChanged.push(`${tA}: revenue grew but gross margin contracted — classic cost-pass-through lag. Input costs outpaced pricing realization; margin recovery requires either pricing action or input-cost normalization.`);
    } else if (revTrendA.change < 0 && grossTrendA.change > 0) {
      whatChanged.push(`${tA}: revenue declined but gross margin expanded — evidence of successful mix shift to higher-value products or meaningful COGS reduction program.`);
    }
  }
  if (whatChanged.length === 0) {
    whatChanged.push("Insufficient multi-period data to identify trend inflection points. Single-period comparison only.");
  }

  // ── Section 9: Investment Interpretation ────────────────────────────────
  const investmentInterpretation: string[] = [];
  const structuralWinner = leadMargin || leadGross;

  if (structuralWinner) {
    const opponent = structuralWinner === tA ? tB : tA;
    const isMarginsAligned = leadMargin && leadGross && leadMargin === leadGross;
    investmentInterpretation.push(
      isMarginsAligned
        ? `Structural outperformance leader: ${structuralWinner}. Both gross and operating margin advantage reside with ${structuralWinner}, indicating a genuine cost-structure superiority — not an accounting artifact. This advantage is durable unless ${opponent} executes a fundamental cost-reduction program.`
        : `Structural outperformance is mixed: gross margin advantage sits with ${leadGross ?? "neither"}, while operating margin advantage sits with ${leadMargin ?? "neither"} — suggesting the operating gap is partially driven by overhead allocation rather than core product economics.`
    );
  }

  const capexRatioA = capexA != null && revA != null && revA > 0 ? capexA / revA : null;
  const capexRatioB = capexB != null && revB != null && revB > 0 ? capexB / revB : null;
  if (capexRatioA != null && capexRatioB != null) {
    const highCapex = capexRatioA > capexRatioB ? tA : tB;
    investmentInterpretation.push(
      `Hidden risk: ${highCapex}'s elevated CapEx intensity either signals growth investment (value-accretive) or asset-maintenance drag (value-neutral). If amortization from prior M&A remains elevated, reported margins are structurally depressed relative to true cash earnings.`
    );
  } else {
    investmentInterpretation.push(
      `Hidden risk: CapEx-to-revenue intensity could not be fully compared due to missing data. Assess independently to understand cash earnings quality relative to reported GAAP income.`
    );
  }

  if (methodologyComparison.notes.length > 0) {
    investmentInterpretation.push(
      `Misleading metric warning: corporate allocation methodology differences can make the margin-lagging company appear structurally weaker than it actually is. Normalize for allocation before drawing capital allocation conclusions.`
    );
  }

  const fcfYieldMsg = companyA.metrics.freeCashFlow != null && companyB.metrics.freeCashFlow != null
    ? `FCF comparison (${tA} ${fmtCurrency(companyA.metrics.freeCashFlow)} vs ${tB} ${fmtCurrency(companyB.metrics.freeCashFlow)}) is the cleanest comparative signal because it bypasses GAAP allocation choices. ${leadCash ? `${leadCash} holds a superior FCF position.` : "FCF generation is comparable."}`
    : "FCF comparison unavailable — assess independently from cash flow statements.";
  investmentInterpretation.push(fcfYieldMsg);

  // ── Section 10: Data Quality ─────────────────────────────────────────────
  const dataQuality: string[] = [];
  if (companyA.missingMetricKeys.length > 0) {
    dataQuality.push(`${tA} missing extracted fields: ${companyA.missingMetricKeys.join(", ")}. Conclusions relying on these metrics should be treated as directional only.`);
  }
  if (companyB.missingMetricKeys.length > 0) {
    dataQuality.push(`${tB} missing extracted fields: ${companyB.missingMetricKeys.join(", ")}.`);
  }
  if (companyA.derivedMetrics && Object.keys(companyA.derivedMetrics).length > 0) {
    dataQuality.push(`${tA} derived metrics (calculated, not directly extracted): ${Object.keys(companyA.derivedMetrics).join(", ")} — derived values carry higher estimation error.`);
  }
  if (companyB.derivedMetrics && Object.keys(companyB.derivedMetrics).length > 0) {
    dataQuality.push(`${tB} derived metrics: ${Object.keys(companyB.derivedMetrics).join(", ")}.`);
  }
  if (companyA.periodType !== companyB.periodType) {
    dataQuality.push(`Period type mismatch: ${tA} (${companyA.periodType}) vs ${tB} (${companyB.periodType}). Absolute values are not directly comparable; ratios and margins are more reliable than dollar figures.`);
  }
  if (companyA.confidence === "low" || companyB.confidence === "low") {
    dataQuality.push(`Low-confidence extraction on one or both companies. Metrics extracted from low-quality PDF renders may contain tabular parsing errors. Cross-check critical values against source filings.`);
  }
  if (methodologyComparison.notes.length > 0) {
    methodologyComparison.notes.forEach((note) => dataQuality.push(`Methodology note: ${note}`));
  }
  if (dataQuality.length === 0) {
    dataQuality.push("No major data quality issues flagged. Both extractions appear complete with no missing critical metrics or period mismatches.");
  }

  // ── Counterfactual ───────────────────────────────────────────────────────
  const counterfactual: string[] = [];
  const opWinsByA = relativePerformance.find(r => r.metric === "Operating Margin");
  if (opWinsByA && opWinsByA.sampleSize >= 3) {
    const totalOpQuarters = opWinsByA.companyAWins + opWinsByA.companyBWins + opWinsByA.ties;
    counterfactual.push(
      `${tA} outperformed ${tB} on operating margin in ${opWinsByA.companyAWins}/${totalOpQuarters} overlapping quarters.`
    );
  }
  const varA = methodologyComparison.companyAVariants[0];
  const varB = methodologyComparison.companyBVariants[0];
  if (varA && varB && varA.corporateAllocation != null && varB.corporateAllocation != null && revA != null && revB != null) {
    const allocDiffPp = round(((varA.corporateAllocation / revA) - (varB.corporateAllocation / revB)) * 100, 1);
    if (Math.abs(allocDiffPp) > 0.5) {
      const higherBurden = allocDiffPp > 0 ? tA : tB;
      const lowerBurden  = higherBurden === tA ? tB : tA;
      counterfactual.push(
        `Excluding corporate allocation differential, ${higherBurden}'s operating margin would improve by ~${Math.abs(allocDiffPp).toFixed(1)}pp relative to ${lowerBurden}, potentially narrowing or reversing the reported gap.`
      );
    }
  }

  // ── Legacy fields ────────────────────────────────────────────────────────
  const driverAnalysis = [
    ...whatChanged.slice(0, 2),
    relativePerformance.length > 0
      ? `Relative performance (overlapping quarters): ${relativePerformance.map(r => `${r.metric}: ${tA} outperformance ${r.companyAWins}/${r.sampleSize}`).join("; ")}.`
      : "Insufficient overlap for relative win counts.",
  ];

  const pricingCostDynamics = [
    grossTrendA && revTrendA
      ? `${tA}: revenue Δ${revTrendA.change >= 0 ? "+" : ""}${revTrendA.change.toFixed(1)}M, gross margin Δ${grossTrendA.change >= 0 ? "+" : ""}${grossTrendA.change.toFixed(1)}pp.`
      : `${tA}: pricing signal incomplete.`,
    grossTrendB && revTrendB
      ? `${tB}: revenue Δ${revTrendB.change >= 0 ? "+" : ""}${revTrendB.change.toFixed(1)}M, gross margin Δ${grossTrendB.change >= 0 ? "+" : ""}${grossTrendB.change.toFixed(1)}pp.`
      : `${tB}: pricing signal incomplete.`,
    sgaTrendA && sgaTrendB
      ? `SG&A trend: ${tA} ${sgaTrendA.change >= 0 ? "+" : ""}${sgaTrendA.change.toFixed(1)}M vs ${tB} ${sgaTrendB.change >= 0 ? "+" : ""}${sgaTrendB.change.toFixed(1)}M.`
      : "SG&A trend unavailable.",
  ];

  const keyRisks = [
    ...warnings.slice(0, 2).map(w => w.message),
    ...methodologyComparison.notes.slice(0, 2),
    "Extraction-based analysis: verify critical metrics against primary SEC filings before board presentation.",
  ];

  return {
    executiveSummary,
    truePerformanceDiagnosis,
    costStructureBridge,
    capitalAllocationStory,
    marginGapDecomposition,
    whatChanged,
    investmentInterpretation,
    dataQuality,
    counterfactual,
    driverAnalysis,
    pricingCostDynamics,
    keyRisks,
  };
}

export function buildComparisonWarnings(
  companyA: NormalizedCompanyMetrics,
  companyB: NormalizedCompanyMetrics
): ComparisonWarning[] {
  const warnings: ComparisonWarning[] = [];

  if (companyA.periodType !== companyB.periodType) {
    warnings.push({
      code: "period_type_mismatch",
      severity: "warning",
      message: "Company A and Company B use different reporting periods. Interpret comparisons carefully.",
    });
  }

  if (companyA.periodEnd !== companyB.periodEnd) {
    warnings.push({
      code: "period_end_mismatch",
      severity: "warning",
      message: `Company A period end (${companyA.periodEnd}) and Company B period end (${companyB.periodEnd}) are different.`,
    });
  }

  const dayDiff = Math.abs(
    new Date(companyA.periodEnd).getTime() - new Date(companyB.periodEnd).getTime()
  );
  if (Number.isFinite(dayDiff) && dayDiff > 45 * 24 * 60 * 60 * 1000) {
    warnings.push({
      code: "period_distance",
      severity: "warning",
      message: "Reporting dates are more than 45 days apart, so period comparability is limited.",
    });
  }

  if (companyA.quarterCount !== companyB.quarterCount) {
    warnings.push({
      code: "coverage_mismatch",
      severity: "info",
      message: `Coverage differs: Company A has ${companyA.quarterCount} filing(s), Company B has ${companyB.quarterCount}.`,
    });
  }

  if (companyA.confidence === "low" || companyB.confidence === "low") {
    warnings.push({
      code: "low_confidence",
      severity: "warning",
      message: "One or both companies include low-confidence extracted data.",
    });
  }

  if (!companyA.validationPassed || !companyB.validationPassed) {
    warnings.push({
      code: "validation_issues",
      severity: "warning",
      message: "Validation checks failed for one or both companies. Some metrics may be incomplete or inconsistent.",
    });
  }

  if (companyA.reconcileStatus === "fail" || companyB.reconcileStatus === "fail") {
    warnings.push({
      code: "reconcile_fail",
      severity: "warning",
      message: "Balance-sheet reconciliation failed for one or both companies (Assets vs Liabilities + Equity).",
    });
  }

  if (companyA.missingMetricKeys.length > 0) {
    warnings.push({
      code: "missing_a",
      severity: "info",
      message: `Company A is missing: ${companyA.missingMetricKeys.join(", ")}.`,
    });
  }
  if (companyB.missingMetricKeys.length > 0) {
    warnings.push({
      code: "missing_b",
      severity: "info",
      message: `Company B is missing: ${companyB.missingMetricKeys.join(", ")}.`,
    });
  }

  return warnings;
}

function bestIndexForMulti(
  values: Array<number | null>,
  direction: BetterDirection | undefined
): number | null {
  if (direction == null || direction === "neutral") return null;
  const scored = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => typeof entry.value === "number" && Number.isFinite(entry.value));
  if (scored.length < 2) return null;
  if (direction === "higher") {
    return scored.reduce((best, cur) => (cur.value > best.value ? cur : best)).index;
  }
  return scored.reduce((best, cur) => (cur.value < best.value ? cur : best)).index;
}

export function buildMultiComparisonRows(companies: NormalizedCompanyMetrics[]): MultiComparisonRow[] {
  return ROW_DEFINITIONS.map((rowDef) => {
    if (rowDef.contextField) {
      const field = rowDef.contextField;
      const values = companies.map((company) => {
        const raw = company[field];
        if (raw == null) return null;
        if (typeof raw === "string" || typeof raw === "number") return raw;
        return String(raw);
      });
      return {
        section: rowDef.section,
        key: rowDef.key,
        label: rowDef.label,
        format: rowDef.format,
        values,
        derived: companies.map(() => false),
        bestIndex: null,
      };
    }

    const metricKey = rowDef.metricKey as ComparableMetricKey;
    const values = companies.map((company) => company.metrics[metricKey]);
    const derived = companies.map((company) => Boolean(company.derivedMetrics[metricKey]));
    const numericValues = values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

    return {
      section: rowDef.section,
      key: rowDef.key,
      label: rowDef.label,
      format: rowDef.format,
      values,
      derived,
      bestIndex: bestIndexForMulti(numericValues, rowDef.betterDirection),
    };
  });
}

function buildMultiTrendMetric(
  histories: Array<{ ticker: string; history: NormalizedCompanyMetrics[] }>,
  metric: ComparableMetricKey
): MultiTrendPoint[] {
  const maps = new Map(
    histories.map(({ ticker, history }) => [ticker, new Map(history.map((entry) => [entry.periodEnd, entry]))])
  );

  const periodEnds = Array.from(
    new Set(histories.flatMap(({ history }) => history.map((entry) => entry.periodEnd)))
  )
    .sort((a, b) => a.localeCompare(b))
    .slice(-12);

  return periodEnds.map((periodEnd) => {
    const byTicker: Record<string, number | null> = {};
    let quarterLabel = periodEnd;
    for (const { ticker, history } of histories) {
      const entry = maps.get(ticker)?.get(periodEnd);
      byTicker[ticker] = entry?.metrics[metric] ?? null;
      if (entry?.quarterLabel) quarterLabel = entry.quarterLabel;
    }
    return { periodEnd, quarterLabel, byTicker };
  });
}

export function buildMultiComparisonTrends(
  histories: Array<{ ticker: string; history: NormalizedCompanyMetrics[] }>
): MultiComparisonTrends {
  return {
    revenue: buildMultiTrendMetric(histories, "revenue"),
    grossMargin: buildMultiTrendMetric(histories, "grossMargin"),
    operatingMargin: buildMultiTrendMetric(histories, "operatingMargin"),
    netMargin: buildMultiTrendMetric(histories, "netMargin"),
    freeCashFlow: buildMultiTrendMetric(histories, "freeCashFlow"),
    sgaExpense: buildMultiTrendMetric(histories, "sga"),
  };
}

export function buildMultiComparisonWarnings(companies: NormalizedCompanyMetrics[]): ComparisonWarning[] {
  const warnings: ComparisonWarning[] = [];
  if (companies.length < 2) return warnings;

  const periodTypes = new Set(companies.map((c) => c.periodType));
  if (periodTypes.size > 1) {
    warnings.push({
      code: "period_type_mismatch",
      severity: "warning",
      message: "Selected companies use different reporting period types. Interpret comparisons carefully.",
    });
  }

  const periodEnds = new Set(companies.map((c) => c.periodEnd));
  if (periodEnds.size > 1) {
    const detail = companies.map((c) => `${c.ticker}: ${c.periodEnd}`).join("; ");
    warnings.push({
      code: "period_end_mismatch",
      severity: "warning",
      message: `Period end dates differ across tickers: ${detail}`,
    });
  }

  const first = companies[0];
  for (let i = 1; i < companies.length; i++) {
    const dayDiff = Math.abs(new Date(first.periodEnd).getTime() - new Date(companies[i].periodEnd).getTime());
    if (Number.isFinite(dayDiff) && dayDiff > 45 * 24 * 60 * 60 * 1000) {
      warnings.push({
        code: "period_distance",
        severity: "warning",
        message: "Some reporting dates are more than 45 days apart, so period comparability is limited.",
      });
      break;
    }
  }

  const coverageParts = companies.map((c) => `${c.ticker}: ${c.quarterCount}`);
  if (new Set(companies.map((c) => c.quarterCount)).size > 1) {
    warnings.push({
      code: "coverage_mismatch",
      severity: "info",
      message: `Filing coverage differs — ${coverageParts.join(", ")}.`,
    });
  }

  if (companies.some((c) => c.confidence === "low")) {
    warnings.push({
      code: "low_confidence",
      severity: "warning",
      message: "One or more companies include low-confidence extracted data.",
    });
  }

  if (companies.some((c) => !c.validationPassed)) {
    warnings.push({
      code: "validation_issues",
      severity: "warning",
      message: "Validation checks failed for one or more companies. Some metrics may be incomplete or inconsistent.",
    });
  }

  if (companies.some((c) => c.reconcileStatus === "fail")) {
    warnings.push({
      code: "reconcile_fail",
      severity: "warning",
      message: "Balance-sheet reconciliation failed for at least one company (Assets vs Liabilities + Equity).",
    });
  }

  for (const company of companies) {
    if (company.missingMetricKeys.length > 0) {
      warnings.push({
        code: `missing_${company.ticker}`,
        severity: "info",
        message: `${company.ticker} is missing: ${company.missingMetricKeys.join(", ")}.`,
      });
    }
  }

  return warnings;
}

function multiBarRow(
  metric: string,
  companies: NormalizedCompanyMetrics[],
  key: ComparableMetricKey
): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = { metric };
  for (const company of companies) {
    row[company.ticker] = company.metrics[key];
  }
  return row;
}

export function buildMultiComparisonBarData(companies: NormalizedCompanyMetrics[]) {
  return {
    financialBars: [
      multiBarRow("Revenue", companies, "revenue"),
      multiBarRow("EBITDA", companies, "ebitda"),
      multiBarRow("Net Income", companies, "netIncome"),
      multiBarRow("Free Cash Flow", companies, "freeCashFlow"),
    ],
    marginBars: [
      multiBarRow("Gross Margin", companies, "grossMargin"),
      multiBarRow("Operating Margin", companies, "operatingMargin"),
      multiBarRow("Net Margin", companies, "netMargin"),
    ],
    cashFlowBars: [
      multiBarRow("Operating Cash Flow", companies, "operatingCashFlow"),
      multiBarRow("CapEx", companies, "capex"),
      multiBarRow("Free Cash Flow", companies, "freeCashFlow"),
    ],
    driverBars: [
      multiBarRow("Revenue", companies, "revenue"),
      multiBarRow("Gross Profit", companies, "grossProfit"),
      multiBarRow("SG&A", companies, "sga"),
      multiBarRow("Op. Income", companies, "operatingIncome"),
    ],
  };
}

export function buildMultiMarginGapBarRows(companies: NormalizedCompanyMetrics[]): MultiMarginGapBarRow[] {
  if (companies.length === 0) return [];
  const benchmark = companies[0];
  const specs: Array<{ metric: string; key: ComparableMetricKey }> = [
    { metric: "Gross Margin", key: "grossMargin" },
    { metric: "Operating Margin", key: "operatingMargin" },
    { metric: "Net Margin", key: "netMargin" },
    { metric: "EBITDA Margin", key: "ebitdaMargin" },
  ];

  return specs.map(({ metric, key }) => {
    const byTicker: Record<string, number | null> = {};
    const gapVsBenchmarkPp: Record<string, number | null> = {};
    const base = benchmark.metrics[key];

    for (const company of companies) {
      const v = company.metrics[key];
      byTicker[company.ticker] = v;
      if (company.ticker === benchmark.ticker) {
        gapVsBenchmarkPp[company.ticker] = null;
      } else if (base != null && v != null) {
        gapVsBenchmarkPp[company.ticker] = round(v - base, 2);
      } else {
        gapVsBenchmarkPp[company.ticker] = null;
      }
    }

    return { metric, byTicker, gapVsBenchmarkPp };
  });
}

export function buildMinimalMultiNarrative(companies: NormalizedCompanyMetrics[]): ComparisonNarrative {
  const tickers = companies.map((c) => c.ticker).join(", ");
  const periodLine = companies.map((c) => `${c.ticker}: ${c.quarterLabel} (${c.periodEnd})`).join(" · ");

  const stub = "Use the Financials and Trends tabs for side-by-side metrics; detailed narrative decomposition is optimized for two-company comparisons.";

  return {
    executiveSummary: [
      `Comparing ${companies.length} companies (${tickers}) on the latest (or selected) analyzed filing per ticker.`,
    ],
    truePerformanceDiagnosis: [stub],
    costStructureBridge: [stub],
    capitalAllocationStory: [stub],
    marginGapDecomposition: [
      `Margin gaps in the Margin Gaps tab are shown versus the first ticker (${companies[0]?.ticker}) as benchmark, in percentage points.`,
    ],
    whatChanged: [periodLine],
    investmentInterpretation: [
      "Rank leaders on operating margin and free cash flow after confirming comparable reporting periods.",
      "Watch for period-end mismatches and low extraction confidence flags in the warnings strip.",
    ],
    dataQuality: [
      "Verify critical figures in source SEC filings; automated extraction may omit footnoted adjustments.",
    ],
    counterfactual: [],
    driverAnalysis: [],
    pricingCostDynamics: [],
    keyRisks: ["Cross-ticker period alignment is not enforced beyond the warnings shown above."],
  };
}
