/**
 * Server-side SEC EDGAR XBRL integration.
 *
 * Flow: ticker → CIK → companyfacts JSON → extract latest 10-Q values.
 * SEC requires User-Agent header — DO NOT call from client/browser.
 */

import type { BSItem } from "@/types/analysis";

const BASE = "https://data.sec.gov";

/** SEC requires a User-Agent with contact information; configure it via SEC_EDGAR_USER_AGENT. */
function secUserAgent(): string {
  const fromEnv = process.env.SEC_EDGAR_USER_AGENT?.trim();
  if (fromEnv) return fromEnv;
  return "DividendAnalyzer/1.0 (your-email@example.com)";
}

// ---------------------------------------------------------------------------
// 1. Ticker → CIK
// ---------------------------------------------------------------------------

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerCache: TickerEntry[] | null = null;

export async function resolveTicker(
  ticker: string
): Promise<{ cik: string; name: string }> {
  if (!tickerCache) {
    const resp = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: { "User-Agent": secUserAgent() }, next: { revalidate: 86400 } }
    );
    if (!resp.ok) throw new Error(`SEC tickers endpoint: ${resp.status}`);
    const data = await resp.json();
    tickerCache = Object.values(data) as TickerEntry[];
  }
  const match = tickerCache.find(
    (e) => e.ticker.toUpperCase() === ticker.toUpperCase()
  );
  if (!match) throw new Error(`Ticker "${ticker}" not found in SEC ticker list`);
  return {
    cik: String(match.cik_str).padStart(10, "0"),
    name: match.title,
  };
}

// ---------------------------------------------------------------------------
// 2. Fetch company facts (all XBRL)
// ---------------------------------------------------------------------------

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, GaapConcept>;
    "dei"?: Record<string, GaapConcept>;
  };
}

interface GaapConcept {
  label: string;
  description: string;
  units: Record<string, FactEntry[]>;
}

interface FactEntry {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
  start?: string;
}

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  const url = `${BASE}/api/xbrl/companyfacts/CIK${cik}.json`;
  const resp = await fetch(url, { headers: { "User-Agent": secUserAgent() } });
  if (!resp.ok)
    throw new Error(`SEC companyfacts ${resp.status}: ${url}`);
  return resp.json() as Promise<CompanyFacts>;
}

// ---------------------------------------------------------------------------
// 3. Extract latest value for a given US-GAAP tag
// ---------------------------------------------------------------------------

export function extractLatest(
  facts: CompanyFacts,
  tag: string,
  options?: {
    forms?: string[];
    unit?: string;
    preferInstant?: boolean;
  }
): { value: number; end: string; filed: string; form: string } | null {
  const concept = facts.facts["us-gaap"]?.[tag];
  if (!concept) return null;

  const unit = options?.unit ?? "USD";
  const entries = concept.units[unit];
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const forms = options?.forms ?? ["10-Q", "10-K"];

  let filtered = entries.filter((e) => forms.includes(e.form));
  if (filtered.length === 0) filtered = entries;

  if (options?.preferInstant) {
    const instants = filtered.filter((e) => !e.start);
    if (instants.length > 0) filtered = instants;
  }

  filtered.sort((a, b) => b.end.localeCompare(a.end));
  const latest = filtered[0];
  if (!latest) return null;

  return {
    value: latest.val,
    end: latest.end,
    filed: latest.filed,
    form: latest.form,
  };
}

// ---------------------------------------------------------------------------
// 4. Convenience: extract & convert to BSItem (millions)
// ---------------------------------------------------------------------------

export function extractAsBSItem(
  facts: CompanyFacts,
  tag: string,
  label: string,
  opts?: Parameters<typeof extractLatest>[2]
): BSItem | null {
  const raw = extractLatest(facts, tag, opts);
  if (!raw) return null;
  return {
    tag,
    label,
    value: Math.round(raw.value / 1e6),
    period: raw.end,
    source: `XBRL:us-gaap:${tag} (${raw.form})`,
  };
}

// ---------------------------------------------------------------------------
// 5. High-level: extract all relevant items from company facts
// ---------------------------------------------------------------------------

/** Balance-sheet tags (instant values) */
const BS_TAGS: [string, string][] = [
  ["Assets", "Total assets"],
  ["Liabilities", "Total liabilities"],
  ["StockholdersEquity", "Total equity (stockholders)"],
  ["LiabilitiesAndStockholdersEquity", "Liabilities + equity"],
  ["CashAndCashEquivalentsAtCarryingValue", "Cash & equivalents"],
  ["ShortTermBorrowings", "Short-term borrowings"],
  ["LongTermDebtCurrent", "Current portion LT debt"],
  ["LongTermDebtNoncurrent", "Long-term debt (non-current)"],
  ["LongTermDebt", "Long-term debt (total)"],
  ["DebtCurrent", "Current debt"],
  ["RetainedEarningsAccumulatedDeficit", "Retained earnings"],
  ["CommonStockValue", "Common stock (par)"],
  ["AdditionalPaidInCapital", "Additional paid-in capital"],
  ["TreasuryStockValue", "Treasury stock"],
  ["AssetsCurrent", "Current assets"],
  ["LiabilitiesCurrent", "Current liabilities"],
  // Working capital components
  ["AccountsReceivableNetCurrent", "Accounts receivable"],
  ["InventoryNet", "Inventories"],
  ["AccountsPayableCurrent", "Accounts payable"],
  ["PrepaidExpenseAndOtherAssetsCurrent", "Prepaid & other current assets"],
  ["AccruedLiabilitiesCurrent", "Accrued liabilities"],
  // Fixed assets
  ["PropertyPlantAndEquipmentNet", "PP&E (net)"],
  ["Goodwill", "Goodwill"],
  ["IntangibleAssetsNetExcludingGoodwill", "Intangible assets (net)"],
  // Other
  ["MinorityInterest", "Minority interest"],
  ["CommonStockSharesOutstanding", "Shares outstanding"],
];

/** Cash-flow / income tags (duration values) */
const CF_TAGS: [string, string][] = [
  // Income statement
  ["Revenues", "Revenue"],
  ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue (ASC 606)"],
  ["SalesRevenueNet", "Net sales"],
  ["CostOfGoodsAndServicesSold", "Cost of goods sold"],
  ["CostOfRevenue", "Cost of revenue"],
  ["CostOfGoodsSold", "Cost of goods sold (alt)"],
  ["GrossProfit", "Gross profit"],
  ["SellingGeneralAndAdministrativeExpense", "SG&A expense"],
  ["SellingAndMarketingExpense", "Selling & marketing"],
  ["GeneralAndAdministrativeExpense", "General & admin"],
  ["ResearchAndDevelopmentExpense", "R&D expense"],
  ["OperatingIncomeLoss", "Operating income"],
  ["OperatingExpenses", "Operating expenses"],
  ["InterestExpense", "Interest expense"],
  ["InterestExpenseNet", "Interest expense (net)"],
  ["OtherNonoperatingIncomeExpense", "Other non-operating income"],
  ["IncomeTaxExpenseBenefit", "Income tax expense"],
  ["NetIncomeLoss", "Net income"],
  ["EarningsPerShareBasic", "EPS (basic)"],
  ["EarningsPerShareDiluted", "EPS (diluted)"],
  // D&A
  ["DepreciationDepletionAndAmortization", "D&A (total)"],
  ["DepreciationAndAmortization", "D&A"],
  ["Depreciation", "Depreciation"],
  ["AmortizationOfIntangibleAssets", "Amortization of intangibles"],
  // Cash flow
  ["NetCashProvidedByOperatingActivities", "Operating cash flow"],
  ["PaymentsToAcquirePropertyPlantAndEquipment", "Capital expenditures"],
  ["PaymentsOfDividendsCommonStock", "Dividends paid (common)"],
  ["PaymentsOfDividends", "Dividends paid (total)"],
  ["PaymentsForRepurchaseOfCommonStock", "Share repurchases"],
  ["ProceedsFromIssuanceOfLongTermDebt", "LT debt issuance"],
  ["RepaymentsOfLongTermDebt", "LT debt repayments"],
  ["NetCashProvidedByFinancingActivities", "Financing cash flow"],
  ["NetCashProvidedByInvestingActivities", "Investing cash flow"],
];

export interface ExtractedFacts {
  bs: BSItem[];
  cf: BSItem[];
  meta: {
    entityName: string;
    latestPeriod: string;
    latestFiled: string;
  };
}

// ---------------------------------------------------------------------------
// 5b. Extract facts filtered to a specific period end date
// ---------------------------------------------------------------------------

/**
 * Same as extractAllFacts but filters all values to those filed
 * for the given periodEnd date (YYYY-MM-DD). Used for multi-quarter backfill.
 */
export function extractFactsForPeriod(
  facts: CompanyFacts,
  periodEnd: string,
  form?: string
): ExtractedFacts {
  const targetForms = form ? [form] : ["10-Q", "10-K"];

  function extractForPeriod(
    tag: string,
    label: string,
    preferInstant: boolean
  ): BSItem | null {
    const concept = facts.facts["us-gaap"]?.[tag];
    if (!concept) return null;
    const entries = concept.units["USD"];
    if (!Array.isArray(entries) || entries.length === 0) return null;

    // Filter to target period + form
    let filtered = entries.filter(
      (e) => e.end === periodEnd && targetForms.includes(e.form)
    );

    if (filtered.length === 0) return null;

    // For balance sheet (instant): prefer entries without start date
    if (preferInstant) {
      const instants = filtered.filter((e) => !e.start);
      if (instants.length > 0) filtered = instants;
    }

    // Sort by filed date desc, pick most recently filed
    filtered.sort((a, b) => b.filed.localeCompare(a.filed));
    const entry = filtered[0];
    if (!entry) return null;

    return {
      tag,
      label,
      value: Math.round(entry.val / 1e6),
      period: entry.end,
      source: `XBRL:us-gaap:${tag} (${entry.form})`,
    };
  }

  const bs: BSItem[] = [];
  for (const [tag, label] of BS_TAGS) {
    const item = extractForPeriod(tag, label, true);
    if (item) bs.push(item);
  }

  const cf: BSItem[] = [];
  for (const [tag, label] of CF_TAGS) {
    const item = extractForPeriod(tag, label, false);
    if (item) cf.push(item);
  }

  return {
    bs,
    cf,
    meta: {
      entityName: facts.entityName,
      latestPeriod: periodEnd,
      latestFiled:
        bs.find((i) => i.period === periodEnd)?.source.split("(")[0] ?? "",
    },
  };
}

/**
 * List all available period ends for a ticker from companyfacts,
 * filtering to 10-Q and 10-K forms and a date range.
 */
export function listAvailablePeriods(
  facts: CompanyFacts,
  opts?: { since?: string; forms?: string[] }
): Array<{ periodEnd: string; form: string; filed: string }> {
  const targetForms = opts?.forms ?? ["10-Q", "10-K"];
  const since = opts?.since ?? "2022-01-01";

  // Use Revenue tag as the source of truth for filing periods
  const revTags = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
  ];

  const seen = new Map<string, { periodEnd: string; form: string; filed: string }>();

  for (const tag of revTags) {
    const concept = facts.facts["us-gaap"]?.[tag];
    if (!concept) continue;
    const entries = concept.units["USD"] ?? [];
    for (const e of entries) {
      if (!targetForms.includes(e.form)) continue;
      if (e.end < since) continue;
      // Dedup by periodEnd — keep most recently filed
      const existing = seen.get(e.end);
      if (!existing || e.filed > existing.filed) {
        seen.set(e.end, { periodEnd: e.end, form: e.form, filed: e.filed });
      }
    }
  }

  return [...seen.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

export function extractAllFacts(facts: CompanyFacts): ExtractedFacts {
  const bsOpts = { preferInstant: true };
  const bs: BSItem[] = [];

  for (const [tag, label] of BS_TAGS) {
    const item = extractAsBSItem(facts, tag, label, bsOpts);
    if (item) bs.push(item);
  }

  const cf: BSItem[] = [];
  for (const [tag, label] of CF_TAGS) {
    const item = extractAsBSItem(facts, tag, label);
    if (item) cf.push(item);
  }

  const latestPeriod =
    bs.reduce(
      (max, i) => (i.period > max ? i.period : max),
      "1900-01-01"
    );

  return {
    bs,
    cf,
    meta: {
      entityName: facts.entityName,
      latestPeriod,
      latestFiled:
        bs.find((i) => i.period === latestPeriod)?.source.split("(")[0] ?? "",
    },
  };
}
