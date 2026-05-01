import { assembleAnalysis } from "./analysisEngine";
import type { BSItem, FullAnalysis } from "@/types/analysis";

export type DataSourceOverrides = Record<string, number | null>;

const BS_FIELD_TAGS: Record<string, { tag: string; label: string }> = {
  totalAssets: { tag: "Assets", label: "Total assets" },
  totalLiabilities: { tag: "Liabilities", label: "Total liabilities" },
  totalEquity: { tag: "StockholdersEquity", label: "Total equity" },
  cashAndEquivalents: {
    tag: "CashAndCashEquivalentsAtCarryingValue",
    label: "Cash & equivalents",
  },
};

const CF_FIELD_TAGS: Record<string, { tag: string; label: string }> = {
  revenue: { tag: "Revenues", label: "Revenue" },
  grossProfit: { tag: "GrossProfit", label: "Gross profit" },
  operatingIncome: { tag: "OperatingIncomeLoss", label: "Operating income" },
  netIncome: { tag: "NetIncomeLoss", label: "Net income" },
  operatingCashFlow: {
    tag: "NetCashProvidedByOperatingActivities",
    label: "Operating cash flow",
  },
  capex: {
    tag: "PaymentsToAcquirePropertyPlantAndEquipment",
    label: "Capital expenditures",
  },
  sgaExpense: {
    tag: "SellingGeneralAndAdministrativeExpense",
    label: "SG&A",
  },
  depreciation: {
    tag: "DepreciationDepletionAndAmortization",
    label: "Depreciation & amortization",
  },
  interestExpense: { tag: "InterestExpense", label: "Interest expense" },
  dividendsPaid: { tag: "PaymentsOfDividends", label: "Dividends paid" },
  shareBasedComp: {
    tag: "ShareBasedCompensation",
    label: "Stock-based compensation",
  },
  epsBasic: { tag: "EarningsPerShareBasic", label: "EPS basic" },
  epsDiluted: { tag: "EarningsPerShareDiluted", label: "EPS diluted" },
};

/** Grid columns rebuilt only via assembleAnalysis + ratio sync — not persisted as supplement. */
const REBUILT_OVERRIDE_KEYS = new Set([
  ...Object.keys(BS_FIELD_TAGS),
  ...Object.keys(CF_FIELD_TAGS),
  "totalDebt",
  "freeCashFlow",
  "ebit",
  "ebitda",
  "grossMargin",
  "operatingMargin",
  "netMargin",
  "ebitdaMargin",
  "debtToEquity",
  "currentRatio",
  "roe",
  "roa",
]);

function hasOverride(overrides: DataSourceOverrides, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

function numericOverride(
  overrides: DataSourceOverrides,
  key: string
): number | null {
  if (!hasOverride(overrides, key)) return null;
  const value = overrides[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function upsertItem(
  items: BSItem[],
  tag: string,
  label: string,
  value: number,
  period: string,
  source: string
): void {
  const existing = items.find((item) => item.tag === tag);
  if (existing) {
    existing.value = value;
    existing.label = label;
    existing.period = period;
    existing.source = source;
    return;
  }

  items.push({ tag, label, value, period, source });
}

function copyItems(items: BSItem[] | undefined): BSItem[] {
  return (items ?? []).map((item) => ({ ...item }));
}

export function applyDataSourceOverridesToAnalysis(
  analysis: FullAnalysis,
  overrides: DataSourceOverrides | undefined,
  source = "data-source-override"
): FullAnalysis {
  if (!overrides || Object.keys(overrides).length === 0) return analysis;

  const period = analysis.meta.periodEnd ?? new Date().toISOString().slice(0, 10);
  const bsItems = copyItems(analysis.balanceSheet.items);
  const cfItems = copyItems(analysis.cfItems);

  for (const [field, def] of Object.entries(BS_FIELD_TAGS)) {
    const value = numericOverride(overrides, field);
    if (value == null) continue;
    upsertItem(bsItems, def.tag, def.label, value, period, source);
  }

  for (const [field, def] of Object.entries(CF_FIELD_TAGS)) {
    const value = numericOverride(overrides, field);
    if (value == null) continue;
    upsertItem(cfItems, def.tag, def.label, value, period, source);
  }

  const rebuilt = assembleAnalysis(bsItems, cfItems, {
    ...analysis.meta,
    periodEnd: analysis.meta.periodEnd ?? period,
  });

  const merged: FullAnalysis = {
    ...rebuilt,
    meta: {
      ...rebuilt.meta,
      ...analysis.meta,
      periodEnd: analysis.meta.periodEnd ?? rebuilt.meta.periodEnd,
    },
    footnotes: analysis.footnotes,
    adjustedMetrics: analysis.adjustedMetrics,
    earningsNarrative: analysis.earningsNarrative,
    segments: analysis.segments,
    nonRecurringItems: analysis.nonRecurringItems,
    methodologyVariants: analysis.methodologyVariants,
  };

  const directNumber = (key: string): number | null => numericOverride(overrides, key);

  const totalDebt = directNumber("totalDebt");
  if (totalDebt != null) {
    merged.debtStructure.totalDebt = totalDebt;
    const cash = directNumber("cashAndEquivalents") ?? merged.balanceSheet.cashAndEquivalents;
    merged.debtStructure.netDebt = Math.round((totalDebt - cash) * 100) / 100;
  }

  const freeCashFlow = directNumber("freeCashFlow");
  if (freeCashFlow != null) merged.cashFlow.freeCashFlow = freeCashFlow;

  const ebit = directNumber("ebit");
  if (ebit != null) {
    merged.incomeStatement.ebit = ebit;
    merged.incomeStatement.operatingIncome = ebit;
  }

  const ebitda = directNumber("ebitda");
  if (ebitda != null) merged.incomeStatement.ebitda = ebitda;

  const marginFields: Array<[string, keyof FullAnalysis["incomeStatement"]]> = [
    ["grossMargin", "grossMargin"],
    ["operatingMargin", "operatingMargin"],
    ["netMargin", "netMargin"],
    ["ebitdaMargin", "ebitdaMargin"],
  ];
  for (const [overrideKey, statementKey] of marginFields) {
    const value = directNumber(overrideKey);
    if (value != null) {
      (merged.incomeStatement[statementKey] as number | null) = value;
    }
  }

  const ratioFields: Array<[string, keyof FullAnalysis["ratios"]]> = [
    ["grossMargin", "grossMargin"],
    ["operatingMargin", "operatingMargin"],
    ["netMargin", "netMargin"],
    ["ebitdaMargin", "ebitdaMargin"],
    ["debtToEquity", "debtToEquity"],
    ["currentRatio", "currentRatio"],
    ["roe", "returnOnEquity"],
    ["roa", "returnOnAssets"],
  ];
  for (const [overrideKey, ratioKey] of ratioFields) {
    const value = directNumber(overrideKey);
    if (value != null) {
      (merged.ratios[ratioKey] as number | null) = value;
    }
  }

  const supplement: Partial<Record<string, number | null>> = {
    ...(merged.meta.dataSourceSupplement ?? {}),
  };
  for (const key of Object.keys(overrides)) {
    if (REBUILT_OVERRIDE_KEYS.has(key)) continue;
    if (!hasOverride(overrides, key)) continue;
    const v = overrides[key];
    if (v == null) {
      delete supplement[key];
    } else {
      supplement[key] = v;
    }
  }
  merged.meta = {
    ...merged.meta,
    dataSourceSupplement: Object.keys(supplement).length > 0 ? supplement : undefined,
  };

  return merged;
}
