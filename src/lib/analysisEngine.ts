/**
 * Pure computation engine — no I/O.
 * Takes extracted BSItem arrays and computes FullAnalysis.
 */

import type {
  BSItem,
  BalanceSheet,
  CashFlowData,
  DebtStructure,
  DividendAnalysis,
  FullAnalysis,
  IncomeStatement,
  Ratios,
  ReconcileResult,
  ValidationCheck,
} from "@/types/analysis";
import { enforceAccountingIdentity } from "@/lib/financialConsistency";
import {
  applyExtractionRepairs,
  deriveEbitdaIfMissing,
  pickDisclosedEbitdaValue,
} from "@/lib/extractionRepairs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function find(items: BSItem[], ...tags: string[]): number {
  for (const tag of tags) {
    const found = items.find((i) => i.tag === tag);
    if (found) return found.value;
  }
  return 0;
}

function findOrNull(items: BSItem[], ...tags: string[]): number | null {
  for (const tag of tags) {
    const found = items.find((i) => i.tag === tag);
    if (found) return found.value;
  }
  return null;
}

/** Prefer the largest consolidated revenue when PDF/AI emits duplicate revenue rows (e.g. segment + total). */
function pickPrimaryRevenue(items: BSItem[]): number | null {
  const tags = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ];
  const vals = items
    .filter((i) => tags.includes(i.tag))
    .map((i) => i.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => (b > a ? b : a));
}

/** Prefer the line with largest |OI| when multiple OperatingIncomeLoss rows exist (stray 0/segment vs consolidated). */
function pickPrimaryOperatingIncome(items: BSItem[]): number | null {
  const vals = items
    .filter((i) => i.tag === "OperatingIncomeLoss")
    .map((i) => i.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best));
}

function ratio(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

function pct(a: number | null, b: number | null): number | null {
  const r = ratio(a, b);
  return r != null ? Math.round(r * 1000) / 10 : null;
}

// ---------------------------------------------------------------------------
// Balance sheet
// ---------------------------------------------------------------------------

export function buildBalanceSheet(bs: BSItem[]): BalanceSheet {
  const totalAssets = find(bs, "Assets");
  const liabilitiesAndEquity = find(bs, "LiabilitiesAndStockholdersEquity");
  let totalLiabilities = find(bs, "Liabilities");
  let totalEquity = find(
    bs,
    "StockholdersEquity"
  );

  // SEC filings sometimes omit explicit "Total Liabilities" but provide:
  // - Total liabilities and equity
  // - Total assets
  // - Total equity
  // Derive missing counterpart to avoid false reconciliation gaps.
  if (totalLiabilities === 0 && totalEquity !== 0) {
    if (liabilitiesAndEquity !== 0) {
      totalLiabilities = Math.round(liabilitiesAndEquity - totalEquity);
    } else if (totalAssets !== 0) {
      totalLiabilities = Math.round(totalAssets - totalEquity);
    }
  }
  if (totalEquity === 0 && totalLiabilities !== 0) {
    if (liabilitiesAndEquity !== 0) {
      totalEquity = Math.round(liabilitiesAndEquity - totalLiabilities);
    } else if (totalAssets !== 0) {
      totalEquity = Math.round(totalAssets - totalLiabilities);
    }
  }

  // When the L+E total line matches assets, re-derive L from (L+E) − E (fixes mis-tagged liability totals)
  const hasBindLE = bs.some((i) => i.tag === "LiabilitiesAndStockholdersEquity");
  if (
    hasBindLE &&
    totalAssets > 0 &&
    liabilitiesAndEquity > 0 &&
    Math.abs(liabilitiesAndEquity - totalAssets) / totalAssets < 0.03
  ) {
    const recomputedL = Math.round(liabilitiesAndEquity - totalEquity);
    if (
      Math.abs(recomputedL - totalLiabilities) / totalAssets > 0.02 ||
      Math.abs(totalLiabilities + totalEquity - totalAssets) / totalAssets > 0.05
    ) {
      totalLiabilities = recomputedL;
    }
  }

  const cash =
    findOrNull(bs, "CashAndCashEquivalentsAtCarryingValue") ??
    findOrNull(bs, "CashAndCashEquivalents") ??
    0;
  const retained =
    findOrNull(bs, "RetainedEarningsAccumulatedDeficit", "RetainedEarnings");

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashAndEquivalents: cash,
    retainedEarnings: retained,
    items: bs,
  };
}

// ---------------------------------------------------------------------------
// Debt structure
// ---------------------------------------------------------------------------

export function buildDebtStructure(bs: BSItem[]): DebtStructure {
  // Sum all short-term / current debt pieces (do NOT use || — that drops components when DebtCurrent is non-zero).
  const stDebt =
    find(bs, "DebtCurrent") +
    find(bs, "ShortTermBorrowings") +
    find(bs, "LongTermDebtCurrent");

  const ltNon = find(bs, "LongTermDebtNoncurrent");
  const ltPlain = find(bs, "LongTermDebt");
  let ltDebt = 0;
  if (ltNon > 0 && ltPlain > 0) {
    const mx = Math.max(ltNon, ltPlain);
    const mn = Math.min(ltNon, ltPlain);
    ltDebt = mx - mn < mx * 0.04 ? mx : ltNon + ltPlain;
  } else {
    ltDebt = ltNon || ltPlain;
  }

  const financeLease = find(bs, "FinanceLeaseLiabilityNoncurrent");
  const computedGross = stDebt + ltDebt + financeLease;

  const cashForDebt =
    findOrNull(bs, "CashAndCashEquivalentsAtCarryingValue") ??
    findOrNull(bs, "CashAndCashEquivalents") ??
    0;

  const grossFromTag = findOrNull(bs, "GrossDebt");
  const netDebtSupplemental = findOrNull(bs, "TotalNetDebtSupplemental");
  const grossFromNetPlusCash =
    netDebtSupplemental != null && cashForDebt > 0
      ? Math.abs(netDebtSupplemental) + cashForDebt
      : null;

  const total =
    grossFromTag != null && Math.abs(grossFromTag) > 400
      ? Math.abs(grossFromTag)
      : grossFromNetPlusCash != null && grossFromNetPlusCash > 400
        ? grossFromNetPlusCash
        : computedGross;

  const cash = cashForDebt;
  const netDebt = total - cash;

  const items = bs.filter((i) =>
    [
      "GrossDebt",
      "LongTermDebt",
      "LongTermDebtNoncurrent",
      "LongTermDebtCurrent",
      "DebtCurrent",
      "ShortTermBorrowings",
      "FinanceLeaseLiabilityNoncurrent",
    ].includes(i.tag)
  );

  return {
    shortTermDebt: stDebt,
    longTermDebt: ltDebt,
    totalDebt: total,
    netDebt,
    items,
  };
}

// ---------------------------------------------------------------------------
// Cash flow
// ---------------------------------------------------------------------------

/** Prefer the CapEx line from the cash flow / investing context, not supplemental EBITDA tables mis-tagged as PP&E. */
function pickCapitalExpenditures(cf: BSItem[]): number | null {
  const rows = cf.filter(
    (i) => i.tag === "PaymentsToAcquirePropertyPlantAndEquipment"
  );
  if (rows.length === 0) return null;
  if (rows.length === 1) return Math.abs(rows[0].value);

  const ocf = findOrNull(cf, "NetCashProvidedByOperatingActivities");

  const score = (lab: string, value: number): number => {
    const l = lab.toLowerCase();
    let s = 0;
    if (/\bebitda\b|net\s+debt|gross\s+debt|key\s+financial\s+measures|ratio\s+calc|supplemental\s+disclosure/i.test(l))
      s += 500;
    if (/contractual\s+obligation|maturity|thereafter/i.test(l)) s += 300;
    if (/capital\s+expenditure|purchase.*property|p\s*&\s*p\s*&\s*e|plant\s*(,|and)\s*equipment/i.test(l))
      s -= 40;
    const av = Math.abs(value);
    if (ocf != null && ocf > 100 && av > ocf * 1.35) s += 200;
    return s;
  };

  const ranked = [...rows].sort(
    (a, b) => score(a.label ?? "", a.value) - score(b.label ?? "", b.value)
  );
  return Math.abs(ranked[0].value);
}

export function buildCashFlow(cf: BSItem[]): CashFlowData {
  const operatingCashFlow = findOrNull(
    cf,
    "NetCashProvidedByOperatingActivities"
  );
  const capex = pickCapitalExpenditures(cf);
  const dividendsPaid =
    findOrNull(cf, "PaymentsOfDividendsCommonStock") ??
    findOrNull(cf, "PaymentsOfDividends");
  const netIncome = findOrNull(cf, "NetIncomeLoss");
  const shareRepurchases = findOrNull(cf, "PaymentsForRepurchaseOfCommonStock");
  const investingCashFlow = findOrNull(cf, "NetCashProvidedByInvestingActivities");
  const financingCashFlowDirect = findOrNull(cf, "NetCashProvidedByFinancingActivities");

  const debtIssuance = findOrNull(
    cf,
    "ProceedsFromIssuanceOfLongTermDebt",
    "ProceedsFromDebt"
  );
  const ltDebtRepayments = findOrNull(cf, "RepaymentsOfLongTermDebt");
  const debtRepaymentsMixed = findOrNull(cf, "RepaymentsOfDebt");
  const stDebtRepayments =
    findOrNull(cf, "RepaymentsOfShortTermDebt") ??
    findOrNull(cf, "RepaymentsOfCommercialPaper");

  const freeCashFlow =
    operatingCashFlow != null && capex != null
      ? operatingCashFlow - Math.abs(capex)
      : null;

  let financingCashFlow = financingCashFlowDirect;
  if (financingCashFlow == null) {
    let derived = 0;
    let hasAnyFinComponent = false;

    if (debtIssuance != null) {
      derived += Math.abs(debtIssuance);
      hasAnyFinComponent = true;
    }
    if (ltDebtRepayments != null) {
      derived -= Math.abs(ltDebtRepayments);
      hasAnyFinComponent = true;
    }
    if (debtRepaymentsMixed != null) {
      derived -= Math.abs(debtRepaymentsMixed);
      hasAnyFinComponent = true;
    }
    if (stDebtRepayments != null) {
      derived -= Math.abs(stDebtRepayments);
      hasAnyFinComponent = true;
    }
    if (dividendsPaid != null) {
      derived -= Math.abs(dividendsPaid);
      hasAnyFinComponent = true;
    }
    if (shareRepurchases != null) {
      derived -= Math.abs(shareRepurchases);
      hasAnyFinComponent = true;
    }

    // Do not infer financing CF from one or two noisy lines — need enough independent legs
    // (issuance, any repayment line, dividends, buybacks) or leave null so the UI shows —.
    const hasRepaymentLine =
      ltDebtRepayments != null ||
      debtRepaymentsMixed != null ||
      stDebtRepayments != null;
    const reliableFinSlots = [
      debtIssuance != null,
      hasRepaymentLine,
      dividendsPaid != null,
      shareRepurchases != null,
    ].filter(Boolean).length;
    const hasEnoughFinComponents = reliableFinSlots >= 3;

    financingCashFlow =
      hasAnyFinComponent && hasEnoughFinComponents ? Math.round(derived) : null;
  }

  return {
    operatingCashFlow,
    capitalExpenditures: capex != null ? Math.abs(capex) : null,
    freeCashFlow,
    dividendsPaid: dividendsPaid != null ? Math.abs(dividendsPaid) : null,
    netIncome,
    shareRepurchases: shareRepurchases != null ? Math.abs(shareRepurchases) : null,
    investingCashFlow,
    financingCashFlow,
  };
}

// ---------------------------------------------------------------------------
// Ratios
// ---------------------------------------------------------------------------

/** @deprecated Use buildRatiosFull instead. Kept for backward compat. */
export function buildRatios(
  bs: BalanceSheet,
  debt: DebtStructure,
  cf: CashFlowData
): Ratios {
  return buildRatiosFull(bs, debt, cf, [...bs.items]);
}

// ---------------------------------------------------------------------------
// Income Statement
// ---------------------------------------------------------------------------

/** R&D lines of a few $M on multi‑billion revenue are often footnote noise — exclude from bridges. */
function rdForOperatingBridge(
  rd: number | null,
  revenue: number | null
): number {
  if (rd == null || revenue == null) return 0;
  const a = Math.abs(rd);
  if (revenue > 500 && a < 15) return 0;
  return a;
}

/** Hide clearly spurious R&D (e.g. "3" from a footnote) from the UI. */
function rdExpenseDisplay(
  rd: number | null,
  revenue: number | null
): number | null {
  if (rd == null) return null;
  if (revenue == null) return Math.abs(rd);
  const a = Math.abs(rd);
  if (revenue > 500 && a < 15) return null;
  return a;
}

export function buildIncomeStatement(cf: BSItem[], bs: BSItem[]): IncomeStatement {
  const allItems = [...cf, ...bs];

  const revenue = pickPrimaryRevenue(cf);
  const cogs = findOrNull(cf, "CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold");
  const grossProfitRaw = findOrNull(cf, "GrossProfit");
  const grossProfit = grossProfitRaw ?? (revenue != null && cogs != null ? revenue - Math.abs(cogs) : null);
  const sga = findOrNull(cf, "SellingGeneralAndAdministrativeExpense");
  const rd = findOrNull(cf, "ResearchAndDevelopmentExpense");
  const opExpenses = findOrNull(cf, "OperatingExpenses");
  let operatingIncome = pickPrimaryOperatingIncome(cf);
  let interestExpense = findOrNull(
    cf,
    "InterestExpense",
    "InterestExpenseNet",
    "InterestExpenseDebt",
    "InterestAndDebtExpense"
  );
  const incomeTax = findOrNull(cf, "IncomeTaxExpenseBenefit");
  const netIncome = findOrNull(cf, "NetIncomeLoss");
  const epsBasic = findOrNull(cf, "EarningsPerShareBasic");
  const epsDiluted = findOrNull(cf, "EarningsPerShareDiluted");

  const pretax = findOrNull(
    cf,
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeBeforeIncomeTaxes"
  );

  const dep = findOrNull(
    cf,
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "Depreciation",
    "CostDepreciationAmortizationAndDepletion"
  );
  const amort = findOrNull(cf, "AmortizationOfIntangibleAssets");

  const rdBridge = rdForOperatingBridge(rd, revenue);

  let sgaOut = sga != null ? Math.abs(sga) : null;
  const oiMeaningful = operatingIncome != null && Math.abs(operatingIncome) > 1e-3;
  if (sgaOut == null && grossProfit != null && oiMeaningful) {
    const implied = grossProfit - operatingIncome! - rdBridge;
    if (implied > 0 && implied < grossProfit * 1.01) {
      sgaOut = Math.round(implied * 100) / 100;
    }
  }

  // If OI is still missing or a stray zero while GP and SGA exist, infer OI = GP - SGA - R&D (bridge).
  if (
    (operatingIncome == null || Math.abs(operatingIncome) < 1e-3) &&
    grossProfit != null &&
    sgaOut != null
  ) {
    const inferredOi = grossProfit - sgaOut - rdBridge;
    if (
      Number.isFinite(inferredOi) &&
      Math.abs(inferredOi) > 1 &&
      (revenue == null || Math.abs(inferredOi) <= Math.abs(revenue) * 0.55)
    ) {
      operatingIncome = Math.round(inferredOi * 100) / 100;
    }
  }

  const ebit = operatingIncome;
  const totalDA =
    dep != null
      ? Math.abs(dep) + (amort != null ? Math.abs(amort) : 0)
      : amort != null
        ? Math.abs(amort)
        : null;
  // Prefer company-disclosed EBITDA (e.g. "Other Key Financial Measures") over OI + D&A when tagged or coalesced.
  const disclosedEbitda = pickDisclosedEbitdaValue(allItems, revenue);
  let ebitda: number | null =
    disclosedEbitda != null
      ? Math.round(disclosedEbitda * 100) / 100
      : ebit != null && totalDA != null
        ? Math.round((ebit + totalDA) * 100) / 100
        : null;

  if (
    interestExpense == null &&
    operatingIncome != null &&
    pretax != null &&
    revenue != null
  ) {
    const gap = operatingIncome - pretax;
    if (
      gap > 1 &&
      gap < Math.abs(operatingIncome) * 0.35 &&
      gap < revenue * 0.08
    ) {
      interestExpense = gap;
    }
  }

  const margin = (num: number | null, den: number | null) => {
    if (num == null || den == null || den === 0) return null;
    return Math.round((num / den) * 1000) / 10;
  };

  return {
    revenue,
    costOfRevenue: cogs != null ? Math.abs(cogs) : null,
    grossProfit,
    grossMargin: margin(grossProfit, revenue),
    sgaExpense: sgaOut,
    rdExpense: rdExpenseDisplay(rd, revenue),
    operatingExpenses: opExpenses != null ? Math.abs(opExpenses) : null,
    operatingIncome,
    operatingMargin: margin(operatingIncome, revenue),
    ebit,
    ebitMargin: margin(ebit, revenue),
    depreciation: dep != null ? Math.abs(dep) : null,
    amortization: amort != null ? Math.abs(amort) : null,
    ebitda,
    ebitdaMargin: margin(ebitda, revenue),
    interestExpense: interestExpense != null ? Math.abs(interestExpense) : null,
    incomeTax: incomeTax != null ? Math.abs(incomeTax) : null,
    netIncome,
    netMargin: margin(netIncome, revenue),
    epsBasic,
    epsDiluted,
  };
}

// ---------------------------------------------------------------------------
// Ratios (with full items access)
// ---------------------------------------------------------------------------

export function buildRatiosFull(
  bs: BalanceSheet,
  debt: DebtStructure,
  cf: CashFlowData,
  allItems: BSItem[],
  income?: IncomeStatement
): Ratios {
  const debtToEquity = ratio(debt.totalDebt, bs.totalEquity);
  const debtToCapital = ratio(
    debt.totalDebt,
    debt.totalDebt + bs.totalEquity
  );

  const ebitda = income?.ebitda ?? null;
  const operatingIncome = income?.operatingIncome ?? findOrNull(allItems, "OperatingIncomeLoss");
  const revenue = income?.revenue ?? null;
  let interestExpense =
    income?.interestExpense ??
    findOrNull(
      allItems,
      "InterestExpense",
      "InterestExpenseNet",
      "InterestExpenseDebt",
      "InterestAndDebtExpense"
    );

  const ebitdaFinal = ebitda;

  const netDebtToEbitda = ratio(debt.netDebt, ebitdaFinal);
  let interestCoverage = ratio(operatingIncome, interestExpense);
  if (
    interestCoverage == null &&
    ebitdaFinal != null &&
    interestExpense != null &&
    Math.abs(interestExpense) > 1e-6
  ) {
    interestCoverage = ratio(ebitdaFinal, interestExpense);
  }
  if (
    interestCoverage == null &&
    operatingIncome != null &&
    interestExpense == null &&
    revenue != null
  ) {
    const pretax = findOrNull(
      allItems,
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
      "IncomeBeforeIncomeTaxes"
    );
    if (pretax != null) {
      const implied = operatingIncome - pretax;
      if (
        implied > 1 &&
        implied < Math.abs(operatingIncome) * 0.35 &&
        implied < revenue * 0.08
      ) {
        interestExpense = implied;
        interestCoverage = ratio(operatingIncome, implied);
      }
    }
  }

  const currentAssets = findOrNull(allItems, "AssetsCurrent");
  const currentLiab = findOrNull(allItems, "LiabilitiesCurrent");
  const currentRatio = ratio(currentAssets, currentLiab);

  // Profitability
  const grossMarginR = income?.grossMargin ?? null;
  const opMarginR = income?.operatingMargin ?? null;
  const netMarginR = income?.netMargin ?? null;
  const ebitdaMarginR = income?.ebitdaMargin ?? null;

  // Returns
  const netIncome = cf.netIncome;
  let roe = ratio(netIncome, bs.totalEquity);
  // Null only absurd ratios (>5000% or <−5000%); prior 5x cap hid valid high-ROE names
  if (roe != null && (roe > 50 || roe < -50)) {
    roe = null;
  }
  const roa = ratio(netIncome, bs.totalAssets);
  // ROIC: prefer company-disclosed % from supplemental tables when extracted as a line item
  const disclosedRoicRaw = findOrNull(allItems, "ReturnOnInvestedCapital");
  let roic: number | null = null;
  if (disclosedRoicRaw != null) {
    const v = Math.abs(disclosedRoicRaw);
    roic = v > 1 ? v / 100 : v;
  }
  // ROIC ≈ NOPAT / (Equity + Debt − Cash); NOPAT ≈ EBIT × (1 − statutory tax rate)
  const pretaxForRoic = findOrNull(
    allItems,
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeBeforeIncomeTaxes"
  );
  const incomeTaxForRoic =
    income?.incomeTax ??
    findOrNull(allItems, "IncomeTaxExpenseBenefit");
  let nopat: number | null = null;
  if (
    operatingIncome != null &&
    pretaxForRoic != null &&
    pretaxForRoic > 25 &&
    incomeTaxForRoic != null
  ) {
    const statutoryRate = Math.abs(incomeTaxForRoic) / pretaxForRoic;
    if (statutoryRate > 0 && statutoryRate < 0.55) {
      nopat =
        operatingIncome * (1 - Math.min(0.45, statutoryRate));
    }
  }
  const investedCapital = bs.totalEquity + debt.totalDebt - bs.cashAndEquivalents;
  if (roic == null) {
    roic = ratio(
      nopat,
      investedCapital > 1e-6 ? investedCapital : null
    );
  }

  // Efficiency
  const assetTurnover = ratio(revenue, bs.totalAssets);
  const inventory = findOrNull(allItems, "InventoryNet");
  const cogs = income?.costOfRevenue ?? null;
  const inventoryTurnover = ratio(cogs, inventory);
  const receivables =
    findOrNull(allItems, "AccountsReceivableNetCurrent") ??
    findOrNull(allItems, "AccountsReceivableNet");
  const receivablesTurnover = ratio(revenue, receivables);

  // Cash
  const fcfYield = cf.freeCashFlow != null && bs.totalEquity > 0
    ? cf.freeCashFlow / (bs.totalEquity + debt.totalDebt) : null;
  const fcfConversion = ratio(cf.freeCashFlow, netIncome);

  // Working capital
  const wc = currentAssets != null && currentLiab != null ? currentAssets - currentLiab : null;
  const wcRatio = ratio(wc, revenue);

  const r1 = (v: number | null) => v != null ? Math.round(v * 100) / 100 : null;
  const r10 = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null;

  return {
    debtToEquity: r1(debtToEquity),
    debtToCapital: debtToCapital != null ? Math.round(debtToCapital * 1000) / 10 : null,
    netDebtToEbitda: r10(netDebtToEbitda),
    interestCoverage: r1(interestCoverage),
    currentRatio: r1(currentRatio),
    grossMargin: grossMarginR,
    operatingMargin: opMarginR,
    netMargin: netMarginR,
    ebitdaMargin: ebitdaMarginR,
    returnOnEquity: roe != null ? Math.round(roe * 1000) / 10 : null,
    returnOnAssets: roa != null ? Math.round(roa * 1000) / 10 : null,
    returnOnInvestedCapital: roic != null ? Math.round(roic * 1000) / 10 : null,
    assetTurnover: r1(assetTurnover),
    inventoryTurnover: r10(inventoryTurnover),
    receivablesTurnover: r10(receivablesTurnover),
    fcfYield: fcfYield != null ? Math.round(fcfYield * 1000) / 10 : null,
    fcfConversion: fcfConversion != null ? Math.round(fcfConversion * 1000) / 10 : null,
    workingCapital: wc,
    workingCapitalRatio: wcRatio != null ? Math.round(wcRatio * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Dividend assessment
// ---------------------------------------------------------------------------

export function buildDividendAnalysis(
  bs: BalanceSheet,
  debt: DebtStructure,
  cf: CashFlowData,
  allItems?: BSItem[]
): DividendAnalysis {
  const divPaid = cf.dividendsPaid;
  const payoutNI = pct(divPaid, cf.netIncome);
  const payoutFCF = pct(divPaid, cf.freeCashFlow);

  const fcfCoverage =
    divPaid && cf.freeCashFlow && divPaid > 0
      ? Math.round((cf.freeCashFlow / divPaid) * 10) / 10
      : null;

  const cashCoverage =
    divPaid && bs.cashAndEquivalents && divPaid > 0
      ? Math.round((bs.cashAndEquivalents / divPaid) * 10) / 10
      : null;

  let verdict: DividendAnalysis["verdict"] = "unknown";
  const bullets: string[] = [];

  if (divPaid == null || divPaid === 0) {
    verdict = "unknown";
    bullets.push("No dividend cash outflow found in this extract.");
    bullets.push(
      "Dividends are often also disclosed in the statement of equity, footnotes, or MD&A — verify the filing if policy matters."
    );
    if (cf.freeCashFlow != null && cf.freeCashFlow > 0) {
      bullets.push(
        `FCF is ${cf.freeCashFlow.toLocaleString()}M — capacity to pay a dividend exists if the board chooses to.`
      );
    }
    if (bs.retainedEarnings != null && bs.retainedEarnings > 0) {
      bullets.push(
        `Retained earnings: ${bs.retainedEarnings.toLocaleString()}M (positive accumulated profits).`
      );
    }
  } else {
    const divLine = allItems?.find(
      (i) =>
        (i.tag === "PaymentsOfDividends" ||
          i.tag === "PaymentsOfDividendsCommonStock") &&
        Math.abs(i.value) > 1
    );
    if (divLine?.source?.includes("notes_dividends")) {
      bullets.push(
        "Dividend amount is from note disclosure (dividends declared). The cash flow statement line was not mapped — compare to cash dividends paid when that line is available."
      );
    }
    if (payoutNI != null) {
      bullets.push(
        `Payout vs net income: ${payoutNI}% — ${payoutNI < 60 ? "comfortable" : payoutNI < 85 ? "reasonable" : "stretched"}`
      );
    }
    if (payoutFCF != null) {
      bullets.push(
        `Payout vs FCF: ${payoutFCF}% — ${payoutFCF < 70 ? "safe" : payoutFCF < 100 ? "watch closely" : "above FCF (unsustainable if persistent)"}`
      );
    }
    if (fcfCoverage != null) {
      bullets.push(
        `FCF covers dividends ${fcfCoverage}× — ${fcfCoverage >= 2 ? "strong buffer" : fcfCoverage >= 1.2 ? "adequate" : "thin"}`
      );
    }
    if (cashCoverage != null) {
      bullets.push(
        `Cash on hand could cover ~${cashCoverage} years of dividends at this run-rate (illustrative).`
      );
    }

    const d2e = debt.totalDebt && bs.totalEquity
      ? debt.totalDebt / bs.totalEquity
      : null;
    if (d2e != null) {
      bullets.push(
        `D/E = ${d2e.toFixed(2)} — ${d2e < 1 ? "low leverage" : d2e < 2 ? "moderate leverage" : "higher leverage"}`
      );
    }

    if (cf.operatingCashFlow != null && divPaid > 0) {
      const ocfCov = Math.round((cf.operatingCashFlow / divPaid) * 10) / 10;
      bullets.push(
        `Operating cash flow covers dividends ${ocfCov}×`
      );
    }

    if (bs.retainedEarnings != null && bs.retainedEarnings !== 0) {
      bullets.push(
        `Retained earnings: ${bs.retainedEarnings.toLocaleString()}M${bs.retainedEarnings < 0 ? " (deficit — review equity quality)" : ""}`
      );
    }

    // Share repurchases context
    if (allItems) {
      const buyback = findOrNull(allItems, "PaymentsForRepurchaseOfCommonStock");
      if (buyback != null && Math.abs(buyback) > 0) {
        const totalReturn = Math.abs(buyback) + divPaid;
        bullets.push(
          `Total shareholder cash return (dividends + buybacks): ${totalReturn.toLocaleString()}M — buybacks: ${Math.abs(buyback).toLocaleString()}M`
        );
      }
    }

    if (
      payoutFCF != null && payoutFCF < 70 &&
      fcfCoverage != null && fcfCoverage >= 1.5
    ) {
      verdict = "strong";
    } else if (
      payoutFCF != null && payoutFCF < 100 &&
      fcfCoverage != null && fcfCoverage >= 1
    ) {
      verdict = "adequate";
    } else if (payoutNI != null && payoutNI < 75 && fcfCoverage == null) {
      verdict = "adequate";
    } else {
      verdict = "stretched";
    }
  }

  const headlineMap: Record<DividendAnalysis["verdict"], string> = {
    strong: "Dividend well supported by free cash flow and liquidity",
    adequate: "Dividend appears manageable but warrants ongoing monitoring",
    stretched: "Dividend is tight — high payout and/or thin FCF",
    unknown: "Insufficient data to assess dividend sustainability",
  };

  return {
    verdict,
    headline: headlineMap[verdict],
    bullets,
    payoutRatioNI: payoutNI,
    payoutRatioFCF: payoutFCF,
    fcfCoverageYears: fcfCoverage,
    cashCoverageYears: cashCoverage,
  };
}

// ---------------------------------------------------------------------------
// Reconcile (A ≈ L + E)
// ---------------------------------------------------------------------------

export function buildReconcile(bs: BalanceSheet): ReconcileResult {
  const lhs = bs.totalAssets;
  const rhs = bs.totalLiabilities + bs.totalEquity;
  const gapM = lhs - rhs;
  const gapPct = lhs > 0 ? Math.abs(gapM) / lhs : 0;
  const withinTolerance = gapPct < 0.01; // 1% = strict
  let status: ReconcileResult["status"] = "ok";
  if (gapPct >= 0.05) status = "fail";
  else if (gapPct >= 0.01) status = "warning";

  return {
    gapPct: Math.round(gapPct * 10000) / 100,
    gapM: Math.round(gapM),
    withinTolerance,
    status,
    lhs,
    rhs,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function buildValidation(
  bs: BalanceSheet,
  debt: DebtStructure,
  cf: CashFlowData,
  allItems: BSItem[]
): { passed: boolean; checks: ValidationCheck[] } {
  const checks: ValidationCheck[] = [];

  // 1. A ≈ L + E
  const aLe = bs.totalAssets > 0
    ? Math.abs(
        bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)
      ) / bs.totalAssets
    : 1;
  checks.push({
    name: "A ≈ L + E",
    passed: aLe < 0.05,
    note:
      aLe < 0.05
        ? `Balance sheet identity gap ${(aLe * 100).toFixed(1)}% — OK`
        : `Gap ${(aLe * 100).toFixed(1)}% — extraction may be incomplete`,
  });

  // 2. Total assets found
  checks.push({
    name: "Total assets",
    passed: bs.totalAssets > 0,
    note: bs.totalAssets > 0
      ? `${bs.totalAssets.toLocaleString()}M USD`
      : "Not found",
  });

  // 3. Debt found
  checks.push({
    name: "Debt data",
    passed: debt.totalDebt > 0,
    note: debt.totalDebt > 0
      ? `Total debt: ${debt.totalDebt.toLocaleString()}M USD`
      : "Debt lines not found",
  });

  // 4. Equity
  checks.push({
    name: "Equity",
    passed: bs.totalEquity !== 0,
    note: bs.totalEquity !== 0
      ? `${bs.totalEquity.toLocaleString()}M USD${bs.totalEquity < 0 ? " (negative)" : ""}`
      : "Not found",
  });

  // 5. Net income
  checks.push({
    name: "Net income",
    passed: cf.netIncome != null,
    note: cf.netIncome != null
      ? `${cf.netIncome.toLocaleString()}M USD`
      : "Not found",
  });

  // 6. Operating cash flow
  checks.push({
    name: "Operating CF",
    passed: cf.operatingCashFlow != null,
    note: cf.operatingCashFlow != null
      ? `${cf.operatingCashFlow.toLocaleString()}M USD`
      : "Not found",
  });

  // 7. Dividend data
  checks.push({
    name: "Dividend data",
    passed: cf.dividendsPaid != null && cf.dividendsPaid > 0,
    note: cf.dividendsPaid != null && cf.dividendsPaid > 0
      ? `${cf.dividendsPaid.toLocaleString()}M USD`
      : "Not found or zero",
  });

  // 8. Item count
  const totalItems = allItems.length;
  checks.push({
    name: "Line items extracted",
    passed: totalItems >= 10,
    note: `${totalItems} lines${totalItems < 10 ? " — low count; PDF parsing may be weak" : ""}`,
  });

  return {
    passed: checks.filter((c) => !c.passed).length <= 2,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Assemble full result
// ---------------------------------------------------------------------------

export function assembleAnalysis(
  bs: BSItem[],
  cf: BSItem[],
  meta: FullAnalysis["meta"]
): FullAnalysis {
  const { bs: bsRep, cf: cfRep, repairs } = applyExtractionRepairs(bs, cf);
  const allItems = [...bsRep, ...cfRep];
  let balanceSheet = buildBalanceSheet(bsRep);
  const identity = enforceAccountingIdentity(balanceSheet, bsRep);
  balanceSheet = identity.balanceSheet;
  const metaMerged: FullAnalysis["meta"] = { ...meta };
  if (identity.hadLargeMismatch) {
    metaMerged.confidence = "low";
  }
  if (repairs.length > 0) {
    metaMerged.extractionRepairs = repairs;
  }
  const debtStructure = buildDebtStructure(bsRep);
  const cashFlow = buildCashFlow(cfRep);
  let incomeStatement = buildIncomeStatement(cfRep, bsRep);
  incomeStatement = deriveEbitdaIfMissing(incomeStatement, cfRep);
  const ratios = buildRatiosFull(balanceSheet, debtStructure, cashFlow, allItems, incomeStatement);
  const dividendAnalysis = buildDividendAnalysis(
    balanceSheet,
    debtStructure,
    cashFlow,
    allItems
  );
  const validation = buildValidation(balanceSheet, debtStructure, cashFlow, allItems);
  const reconcile = buildReconcile(balanceSheet);

  return {
    meta: metaMerged,
    balanceSheet,
    debtStructure,
    cashFlow,
    incomeStatement,
    ratios,
    dividendAnalysis,
    cfItems: cfRep,
    validation,
    reconcile,
  };
}
