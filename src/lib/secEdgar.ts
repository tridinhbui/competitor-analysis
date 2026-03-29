/**
 * Server-side SEC EDGAR XBRL integration.
 *
 * Flow: ticker → CIK → companyfacts JSON → extract latest 10-Q values.
 * SEC requires User-Agent header — DO NOT call from client/browser.
 */

import type { BSItem } from "@/types/analysis";

const BASE = "https://data.sec.gov";

/** SEC yêu cầu User-Agent có thông tin liên hệ — cấu hình qua SEC_EDGAR_USER_AGENT. */
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
];

/** Cash-flow / income tags (duration values) */
const CF_TAGS: [string, string][] = [
  ["NetCashProvidedByOperatingActivities", "Operating cash flow"],
  ["PaymentsToAcquirePropertyPlantAndEquipment", "Capital expenditures"],
  ["PaymentsOfDividendsCommonStock", "Dividends paid (common)"],
  ["PaymentsOfDividends", "Dividends paid (total)"],
  ["NetIncomeLoss", "Net income"],
  ["InterestExpense", "Interest expense"],
  ["OperatingIncomeLoss", "Operating income"],
  ["Revenues", "Revenue"],
  ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue (ASC 606)"],
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
