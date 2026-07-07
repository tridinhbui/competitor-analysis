/**
 * Enforces A = L + E and aligns extracted BS line items after messy PDF/AI extraction.
 */

import type { BSItem, BalanceSheet, FullAnalysis } from "@/types/analysis";

const IDENTITY_TOLERANCE = 0.02;

function gapPct(assets: number, liabilities: number, equity: number): number {
  if (assets <= 0) return 0;
  return Math.abs(assets - (liabilities + equity)) / Math.abs(assets);
}

function patchItem(items: BSItem[], tag: string, value: number): void {
  const it = items.find((i) => i.tag === tag);
  if (it) {
    it.value = value;
    if (!it.source.includes("identity-enforced")) {
      it.source = `${it.source}|identity-enforced`;
    }
  }
}

const IDENTITY_RELATED_TAGS = new Set([
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "LiabilitiesAndStockholdersEquity",
]);

/**
 * A balance-sheet identity mismatch only casts doubt on the lines that make
 * up A = L + E — not on unrelated, correctly-extracted lines like Cash or
 * AR. Blanket-marking everything "low" hides which numbers are actually
 * suspect.
 */
function tagIdentityRelatedBsItemsLow(items: BSItem[]): void {
  for (const it of items) {
    if (IDENTITY_RELATED_TAGS.has(it.tag)) {
      it.confidence = "low";
    }
  }
}

export interface AccountingIdentityResult {
  balanceSheet: BalanceSheet;
  /** True when |A−(L+E)|/A exceeded 2% before reconciliation */
  hadLargeMismatch: boolean;
}

/**
 * Reconciles total assets = liabilities + equity; patches BS items when tags exist.
 * If initial gap > 2%, marks all balance-sheet line items LOW.
 */
export function enforceAccountingIdentity(
  bs: BalanceSheet,
  bsItems: BSItem[]
): AccountingIdentityResult {
  const A = bs.totalAssets;
  let L = bs.totalLiabilities;
  let E = bs.totalEquity;
  const originalL = L;
  const originalE = E;
  let patched = false;

  // Placeholder equity (e.g. −1 from a footnote) on large filings — prefer A − L
  if (A > 500 && Math.abs(L) > 100 && Math.abs(E) < 5) {
    E = Math.round(A - L);
    patchItem(bsItems, "StockholdersEquity", E);
    patched = true;
  }

  const initialGap = gapPct(A, L, E);
  const hadLargeMismatch = A > 0 && initialGap > IDENTITY_TOLERANCE;

  if (A > 0 && hadLargeMismatch) {
    if (L !== 0) {
      E = Math.round(A - L);
      patchItem(bsItems, "StockholdersEquity", E);
      patched = true;
    } else if (E !== 0) {
      L = Math.round(A - E);
      patchItem(bsItems, "Liabilities", L);
      patched = true;
    }
  }

  if (hadLargeMismatch) {
    // Only the identity-related lines are actually suspect — don't drag down
    // unrelated, correctly-extracted lines (Cash, AR, etc.) to "low" too.
    tagIdentityRelatedBsItemsLow(bsItems);
  }

  // The gap as it was BEFORE this function silently plugged it — this is
  // what the analyst actually needs to see (often NCI / redeemable equity /
  // a genuine misclassification, not an extraction bug).
  const unexplainedGap = patched
    ? Math.round(Math.abs(A - (originalL + originalE)))
    : null;

  return {
    balanceSheet: {
      ...bs,
      totalAssets: A,
      totalLiabilities: L,
      totalEquity: E,
      originalTotalLiabilities: patched ? originalL : null,
      originalTotalEquity: patched ? originalE : null,
      unexplainedGap,
    },
    hadLargeMismatch,
  };
}

type Conf = "HIGH" | "MEDIUM" | "LOW";

function mapDataConfidence(c: FullAnalysis["meta"]["confidence"]): Conf {
  if (c === "high") return "HIGH";
  if (c === "medium") return "MEDIUM";
  return "LOW";
}

function mapItemConfidence(c: BSItem["confidence"]): Conf | null {
  if (c === "high") return "HIGH";
  if (c === "medium") return "MEDIUM";
  if (c === "low") return "LOW";
  return null;
}

/**
 * Per-field confidence: look up the actual extracted line item behind a
 * given output field instead of stamping every field with the same overall
 * `meta.confidence`. A single low-confidence line (e.g. a plugged equity
 * value) should not make a correctly-extracted net_income read as "LOW" too.
 * Falls back to overall confidence when no matching line item is found
 * (derived/computed fields like margins, ratios).
 */
function fieldConfidence(items: BSItem[], base: Conf, ...tags: string[]): Conf {
  for (const tag of tags) {
    const item = items.find((i) => i.tag === tag);
    const mapped = item ? mapItemConfidence(item.confidence) : null;
    if (mapped) return mapped;
  }
  return base;
}

/**
 * Strict JSON snapshot (for APIs / LLM consumers) aligned with SEC extraction QA rules.
 */
export function buildStrictFinancialPayload(a: FullAnalysis): {
  income_statement: Record<string, number | null>;
  balance_sheet: Record<string, number | null>;
  cash_flow: Record<string, number | null>;
  ratios: Record<string, number | null>;
  confidence: Record<string, Conf>;
} {
  const is = a.incomeStatement;
  const bs = a.balanceSheet;
  const d = a.debtStructure;
  const cf = a.cashFlow;
  const r = a.ratios;
  const base = mapDataConfidence(a.meta.confidence);
  const allItems = [...bs.items, ...(a.cfItems ?? [])];

  return {
    income_statement: {
      revenue: is.revenue,
      cost_of_revenue: is.costOfRevenue,
      gross_profit: is.grossProfit,
      sga_expense: is.sgaExpense,
      rd_expense: is.rdExpense,
      operating_income: is.operatingIncome,
      ebitda: is.ebitda,
      net_income: is.netIncome,
    },
    balance_sheet: {
      total_assets: bs.totalAssets,
      total_liabilities: bs.totalLiabilities,
      total_equity: bs.totalEquity,
      cash: bs.cashAndEquivalents,
      short_term_debt: d.shortTermDebt,
      long_term_debt: d.longTermDebt,
      total_debt: d.totalDebt,
      net_debt: d.netDebt,
    },
    cash_flow: {
      operating_cash_flow: cf.operatingCashFlow,
      capital_expenditures: cf.capitalExpenditures,
      free_cash_flow: cf.freeCashFlow,
    },
    ratios: {
      gross_margin: is.grossMargin,
      operating_margin: is.operatingMargin,
      net_margin: is.netMargin,
      roa: r.returnOnAssets,
      roe: r.returnOnEquity,
      debt_to_equity: r.debtToEquity,
      current_ratio: r.currentRatio,
      interest_coverage: r.interestCoverage,
    },
    confidence: {
      revenue: fieldConfidence(
        allItems,
        base,
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet"
      ),
      total_assets: fieldConfidence(allItems, base, "Assets"),
      total_equity: fieldConfidence(allItems, base, "StockholdersEquity"),
      net_income: fieldConfidence(allItems, base, "NetIncomeLoss"),
    },
  };
}
