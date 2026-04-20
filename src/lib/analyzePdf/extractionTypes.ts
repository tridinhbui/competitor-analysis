import type { FootnoteItem, EarningsNarrative } from "@/types/analysis";

export interface ExtractionMeta {
  companyName?: string | null;
  periodEnd?: string | null;
  filingType?: string | null;
  scaleNote?: string;
  confidence?: string;
}

/** AI row with optional provenance (strict schema) or legacy { tag, label, value }. */
export interface RawAiItem {
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

export interface BsExtraction {
  meta?: ExtractionMeta;
  companyName?: string | null;
  periodEnd?: string | null;
  scaleNote?: string;
  items?: RawAiItem[];
}

export interface IsCfExtraction {
  meta?: ExtractionMeta;
  items?: RawAiItem[];
}

export interface QualExtraction {
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

export interface SegmentExtraction {
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

export const BS_TAG_SET = new Set([
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

export const CF_TAG_SET = new Set([
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
