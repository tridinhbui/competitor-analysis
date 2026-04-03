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
    const found = items.find(
      (i) => i.tag === tag && i.value != null && Number.isFinite(i.value)
    );
    if (found) return found.value;
  }
  return null;
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
  const extractedLiabilities = findOrNull(bs, "Liabilities");
  const directRHS = findOrNull(bs, "LiabilitiesAndStockholdersEquity");
  const retained = find(bs, "RetainedEarningsAccumulatedDeficit");
  const cash = find(bs, "CashAndCashEquivalentsAtCarryingValue");

  // Equity: prefer the directly extracted total (already net of treasury stock).
  // If missing, compute from components so treasury stock is correctly subtracted.
  const equityDirect = findOrNull(bs, "StockholdersEquity");
  const totalEquity = equityDirect != null && equityDirect !== 0
    ? equityDirect
    : (() => {
        const common   = findOrNull(bs, "CommonStockValue") ?? 0;
        const apic     = findOrNull(bs, "AdditionalPaidInCapital") ?? 0;
        const re       = findOrNull(bs, "RetainedEarningsAccumulatedDeficit") ?? 0;
        const treasury = findOrNull(bs, "TreasuryStockValue") ?? 0; // already negative
        const aoci     = findOrNull(bs, "AccumulatedOtherComprehensiveIncomeLoss") ?? 0;
        const nci      = findOrNull(bs, "MinorityInterest") ?? 0;
        const sum = common + apic + re + treasury + aoci + nci;
        return sum !== 0 ? sum : 0;
      })();

  // Total liabilities: prefer the directly extracted tag.
  // If absent, reconstruct from liabilities components (same philosophy as reconcile):
  // do NOT derive as A − E (that would make identity checks trivially true).
  let totalLiabilities = 0;
  if (extractedLiabilities != null && extractedLiabilities > 0) {
    totalLiabilities = extractedLiabilities;
  } else if (directRHS != null && directRHS > 0) {
    const redeemableNCI =
      findOrNull(bs, "RedeemableNoncontrollingInterestEquityCarryingAmount") ?? 0;
    totalLiabilities = Math.max(0, Math.round(directRHS - totalEquity - redeemableNCI));
  } else {
    const currentLiab = findOrNull(bs, "LiabilitiesCurrent") ?? 0;

    const noncurrentDirect = findOrNull(bs, "LiabilitiesNoncurrent");
    let noncurrentLiab = 0;
    if (noncurrentDirect != null && noncurrentDirect > 0) {
      noncurrentLiab = noncurrentDirect;
    } else {
      const ltDebt =
        findOrNull(bs, "LongTermDebtNoncurrent") ??
        findOrNull(bs, "LongTermDebt") ??
        0;
      const opLease =
        findOrNull(bs, "OperatingLeaseLiabilityNoncurrent") ?? 0;
      const finLease =
        findOrNull(bs, "FinanceLeaseLiabilityNoncurrent") ?? 0;
      const pension =
        findOrNull(bs, "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent") ?? 0;
      const deferredTx =
        findOrNull(bs, "DeferredIncomeTaxLiabilitiesNet") ??
        findOrNull(bs, "DeferredTaxLiabilitiesNoncurrent") ??
        0;
      const otherLiab =
        findOrNull(bs, "OtherLiabilitiesNoncurrent") ?? 0;
      noncurrentLiab = ltDebt + opLease + finLease + pension + deferredTx + otherLiab;
    }

    totalLiabilities = currentLiab + noncurrentLiab;
  }

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
  const ltDebt =
    find(bs, "LongTermDebtNoncurrent") || find(bs, "LongTermDebt");
  const stDebt =
    find(bs, "DebtCurrent") ||
    find(bs, "ShortTermBorrowings") + find(bs, "LongTermDebtCurrent");
  const total = ltDebt + stDebt;
  const cash = find(bs, "CashAndCashEquivalentsAtCarryingValue");
  const netDebt = total - cash;

  const items = bs.filter((i) =>
    [
      "LongTermDebt",
      "LongTermDebtNoncurrent",
      "LongTermDebtCurrent",
      "DebtCurrent",
      "ShortTermBorrowings",
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

export function buildCashFlow(cf: BSItem[]): CashFlowData {
  console.log(
    "[cashflow:build-input]",
    cf.map((i) => ({ tag: i.tag, label: i.label, value: i.value, source: i.source }))
  );
  const operatingCashFlow = findOrNull(
    cf,
    "NetCashProvidedByOperatingActivities"
  );
  const capex = findOrNull(
    cf,
    "PaymentsToAcquirePropertyPlantAndEquipment"
  );
  const dividendsPaid =
    findOrNull(cf, "PaymentsOfDividendsCommonStock") ??
    findOrNull(cf, "PaymentsOfDividends");
  const netIncome = findOrNull(cf, "NetIncomeLoss");
  const buyback = findOrNull(cf, "PaymentsForRepurchaseOfCommonStock");
  const debtIssue = findOrNull(cf, "ProceedsFromIssuanceOfLongTermDebt");
  const directLtDebtRepay = findOrNull(cf, "RepaymentsOfLongTermDebt");
  const paymentsOnDebt = findOrNull(cf, "RepaymentsOfDebt");
  const commercialPaperRepay = findOrNull(cf, "RepaymentsOfCommercialPaper");
  const shortTermDebtRepay = findOrNull(cf, "RepaymentsOfShortTermDebt");
  const hasShortTermRepayments =
    (commercialPaperRepay != null && Math.abs(commercialPaperRepay) > 0) ||
    (shortTermDebtRepay != null && Math.abs(shortTermDebtRepay) > 0);
  const hasConflictingDebtBreakdown = hasShortTermRepayments;
  let ltDebtRepayments: number | null = null;
  let debtRepayForFinancing: number | null = null;
  let debtRepayLabel: "direct" | "proxy_from_payments_on_debt" | "mixed_debt_repayment" | "unknown" = "unknown";
  if (directLtDebtRepay != null) {
    ltDebtRepayments = Math.abs(directLtDebtRepay);
    debtRepayForFinancing = Math.abs(directLtDebtRepay);
    debtRepayLabel = "direct";
  } else if (paymentsOnDebt != null && !hasShortTermRepayments && !hasConflictingDebtBreakdown) {
    ltDebtRepayments = Math.abs(paymentsOnDebt);
    debtRepayForFinancing = Math.abs(paymentsOnDebt);
    debtRepayLabel = "proxy_from_payments_on_debt";
  } else if (paymentsOnDebt != null) {
    // Mixed repayment remains usable for financing CF math, but not shown as LT-specific.
    ltDebtRepayments = null;
    debtRepayForFinancing = Math.abs(paymentsOnDebt);
    debtRepayLabel = "mixed_debt_repayment";
  }
  console.log("[cashflow:buyback-lookup]", buyback);
  console.log("[cashflow:debt-repay-classification]", {
    label: debtRepayLabel,
    directLtDebtRepay,
    paymentsOnDebt,
    commercialPaperRepay,
    shortTermDebtRepay,
    hasShortTermRepayments,
  });

  const freeCashFlow =
    operatingCashFlow != null && capex != null
      ? operatingCashFlow - Math.abs(capex)
      : null;

  // Investing CF: direct or capex-only floor
  let investingCashFlow = findOrNull(cf, "NetCashProvidedByInvestingActivities");
  if (investingCashFlow == null && capex != null) {
    investingCashFlow = -Math.abs(capex);
  }

  // Financing CF: direct or sum of known components
  let financingCashFlow = findOrNull(cf, "NetCashProvidedByFinancingActivities");
  if (financingCashFlow == null) {
    if (buyback != null || debtIssue != null || debtRepayForFinancing != null || dividendsPaid != null) {
      financingCashFlow =
        (debtIssue ?? 0)
        - Math.abs(buyback ?? 0)
        - Math.abs(debtRepayForFinancing ?? 0)
        - Math.abs(dividendsPaid ?? 0);
    }
  }

  return {
    operatingCashFlow,
    capitalExpenditures: capex != null ? Math.abs(capex) : null,
    freeCashFlow,
    dividendsPaid: dividendsPaid != null ? Math.abs(dividendsPaid) : null,
    netIncome,
    investingCashFlow,
    financingCashFlow,
    shareRepurchases: buyback != null ? Math.abs(buyback) : null,
    ltDebtIssuance: debtIssue,
    ltDebtRepayments,
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

export function buildIncomeStatement(cf: BSItem[], bs: BSItem[]): IncomeStatement {
  const allItems = [...cf, ...bs];

  const revenue = findOrNull(cf, "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "SalesRevenueGoodsNet");
  const cogs = findOrNull(cf, "CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold");
  const grossProfitRaw = findOrNull(cf, "GrossProfit");
  const grossProfit = grossProfitRaw ?? (revenue != null && cogs != null ? revenue - Math.abs(cogs) : null);
  const sga = findOrNull(cf, "SellingGeneralAndAdministrativeExpense");
  const rdItem = cf.find(
    (i) =>
      i.tag === "ResearchAndDevelopmentExpense" &&
      i.value != null &&
      Number.isFinite(i.value)
  );
  const rd = rdItem != null ? rdItem.value : null;
  const rdSource = rdItem?.source?.toLowerCase() ?? "";
  let rdExpenseMethod: IncomeStatement["rdExpenseMethod"] = null;
  let rdExpensePercentUsed: number | null = null;
  let rAndDPeriodBasis: IncomeStatement["rAndDPeriodBasis"] = null;
  if (rdItem != null) {
    if (rdSource.includes("estimated_from_revenue_ratio")) {
      rdExpenseMethod = "estimated_from_revenue_ratio";
      const m = rdSource.match(/pct=([\d.]+)/);
      if (m) {
        const pct = parseFloat(m[1]);
        rdExpensePercentUsed = Number.isFinite(pct) ? pct : null;
      }
      const basis = rdSource.match(/basis=(quarterly|ytd|annual)/);
      if (basis) rAndDPeriodBasis = basis[1] as IncomeStatement["rAndDPeriodBasis"];
    } else if (rdSource.includes("derived_from_rd_tax_or_capitalization")) {
      rdExpenseMethod = "derived_from_rd_tax_or_capitalization";
      const basis = rdSource.match(/basis=(quarterly|ytd|annual)/);
      if (basis) rAndDPeriodBasis = basis[1] as IncomeStatement["rAndDPeriodBasis"];
    } else {
      rdExpenseMethod = "extracted";
      const basis = rdSource.match(/basis=(quarterly|ytd|annual)/);
      if (basis) rAndDPeriodBasis = basis[1] as IncomeStatement["rAndDPeriodBasis"];
    }
  }
  const opExpenses = findOrNull(cf, "OperatingExpenses");
  const operatingIncome = findOrNull(cf, "OperatingIncomeLoss");
  const interestExpense = findOrNull(cf, "InterestExpense", "InterestExpenseNet");
  const incomeTax = findOrNull(cf, "IncomeTaxExpenseBenefit");
  const netIncome = findOrNull(cf, "NetIncomeLoss");
  const epsBasic = findOrNull(cf, "EarningsPerShareBasic");
  const epsDiluted = findOrNull(cf, "EarningsPerShareDiluted");

  // Identify D&A items by checking specific tags
  const combinedDAItem = cf.find(i =>
    i.tag === "DepreciationDepletionAndAmortization" || i.tag === "DepreciationAndAmortization"
  );
  const deprecOnlyItem = cf.find(i => i.tag === "Depreciation");
  const amortItem = cf.find(i => i.tag === "AmortizationOfIntangibleAssets");

  let depOut: number | null = null;
  let amortOut: number | null = null;
  let totalDAOut: number | null = null;

  if (combinedDAItem != null && amortItem != null) {
    // Combined D&A total is found AND amortization is separately disclosed
    // amort is a sub-component → don't add, instead split
    totalDAOut = Math.abs(combinedDAItem.value);
    amortOut = Math.abs(amortItem.value);
    depOut = Math.max(0, Math.round((totalDAOut - amortOut) * 10) / 10);
  } else if (combinedDAItem != null) {
    // Only combined D&A — try to estimate split via intangibles
    totalDAOut = Math.abs(combinedDAItem.value);
    const intangibles = findOrNull(bs, "IntangibleAssetsNet", "FiniteLivedIntangibleAssetsNet");
    if (intangibles != null && intangibles > 0) {
      // Has intangible assets → amortization is non-trivial; estimate at 15% of D&A
      amortOut = Math.round(totalDAOut * 0.15 * 10) / 10;
      depOut = Math.round((totalDAOut - amortOut) * 10) / 10;
    } else {
      // No intangibles → depreciation ≈ all of D&A
      depOut = totalDAOut;
      amortOut = null;
    }
  } else if (deprecOnlyItem != null) {
    // Separate depreciation line
    depOut = Math.abs(deprecOnlyItem.value);
    amortOut = amortItem != null ? Math.abs(amortItem.value) : null;
    totalDAOut = depOut + (amortOut ?? 0);
  } else if (amortItem != null) {
    // Only amortization
    amortOut = Math.abs(amortItem.value);
    totalDAOut = amortOut;
  }

  const ebit = operatingIncome;
  const ebitda = ebit != null && totalDAOut != null ? ebit + totalDAOut
    : ebit != null && interestExpense != null ? ebit + Math.abs(interestExpense)
    : null;

  const r2 = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null;
  const margin = (num: number | null, den: number | null) => {
    if (num == null || den == null || den === 0) return null;
    return Math.round((num / den) * 1000) / 10;
  };

  return {
    revenue,
    costOfRevenue: cogs != null ? Math.abs(cogs) : null,
    grossProfit,
    grossMargin: margin(grossProfit, revenue),
    sgaExpense: sga != null ? Math.abs(sga) : null,
    rdExpense: rd != null ? Math.abs(rd) : null,
    rdExpenseMethod,
    rdExpensePercentUsed,
    rAndDPeriodBasis,
    operatingExpenses: opExpenses != null ? Math.abs(opExpenses) : null,
    operatingIncome,
    operatingMargin: margin(operatingIncome, revenue),
    ebit,
    ebitMargin: margin(ebit, revenue),
    depreciation: depOut,
    amortization: amortOut,
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
  const interestExpense = income?.interestExpense ?? null;

  // Fallback EBITDA if income statement couldn't derive it
  const ebitdaFinal = ebitda ?? (cf.netIncome != null ? cf.netIncome * 1.35 : null);

  const netDebtToEbitda = ratio(debt.netDebt, ebitdaFinal);
  const interestCoverage = ratio(operatingIncome ?? ebitdaFinal, interestExpense);

  const currentAssets = findOrNull(allItems, "AssetsCurrent");
  const currentLiab = findOrNull(allItems, "LiabilitiesCurrent");
  const currentRatio = ratio(currentAssets, currentLiab);

  // Profitability
  const revenue = income?.revenue ?? null;
  const grossMarginR = income?.grossMargin ?? null;
  const opMarginR = income?.operatingMargin ?? null;
  const netMarginR = income?.netMargin ?? null;
  const ebitdaMarginR = income?.ebitdaMargin ?? null;

  // Returns
  const netIncome = cf.netIncome;
  const roe = ratio(netIncome, bs.totalEquity);
  const roa = ratio(netIncome, bs.totalAssets);
  // ROIC = NOPAT / (Equity + Debt - Cash)
  const nopat = operatingIncome != null && income?.incomeTax != null && income?.netIncome != null && operatingIncome !== 0
    ? operatingIncome * (1 - (income.incomeTax / Math.max(Math.abs(operatingIncome), 1)))
    : null;
  const investedCapital = bs.totalEquity + debt.totalDebt - bs.cashAndEquivalents;
  const roic = ratio(nopat, investedCapital > 0 ? investedCapital : null);

  // Efficiency
  const assetTurnover = ratio(revenue, bs.totalAssets);
  const inventory = findOrNull(allItems, "InventoryNet");
  const cogs = income?.costOfRevenue ?? null;
  const inventoryTurnover = ratio(cogs, inventory);
  // AccountsReceivableNet is the non-current-specific tag many filers use
  const receivables = findOrNull(allItems, "AccountsReceivableNetCurrent", "AccountsReceivableNet");
  const receivablesTurnover = ratio(revenue, receivables);

  // Cash
  const fcfYield = cf.freeCashFlow != null && bs.totalEquity > 0
    ? cf.freeCashFlow / (bs.totalEquity + debt.totalDebt) : null;
  const fcfConversion = ratio(cf.freeCashFlow, netIncome);

  // Working capital
  const wc = currentAssets != null && currentLiab != null ? currentAssets - currentLiab : null;
  const wcRatio = ratio(wc, revenue);

  // Accrual ratio: (netIncome - operatingCashFlow) / totalAssets
  // Positive = income exceeds cash flow (accrual-heavy); negative = cash exceeds income (high quality)
  const accrualNum = netIncome != null && cf.operatingCashFlow != null
    ? netIncome - cf.operatingCashFlow : null;
  const accrualRatio = accrualNum != null && bs.totalAssets > 0
    ? Math.round((accrualNum / bs.totalAssets) * 1000) / 10 : null;

  const r1 = (v: number | null) => v != null ? Math.round(v * 100) / 100 : null;
  const r10 = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null;

  return {
    debtToEquity: r1(debtToEquity),
    debtToCapital: debtToCapital != null ? Math.round(debtToCapital * 1000) / 10 : null,
    netDebtToEbitda: r10(netDebtToEbitda),
    interestCoverage: r10(interestCoverage),
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
    accrualRatio,
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
    if (cf.freeCashFlow != null && cf.freeCashFlow > 0) {
      bullets.push(
        `FCF is ${cf.freeCashFlow.toLocaleString()}M — capacity to pay a dividend exists if the board chooses to.`
      );
    }
    if (bs.retainedEarnings > 0) {
      bullets.push(
        `Retained earnings: ${bs.retainedEarnings.toLocaleString()}M (positive accumulated profits).`
      );
    }
  } else {
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

    if (bs.retainedEarnings !== 0) {
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

export function buildReconcile(bs: BalanceSheet, bsItems: BSItem[]): ReconcileResult {
  const lhs = bs.totalAssets;
  let rhs: number;
  let balanceIdentitySource: ReconcileResult["balanceIdentitySource"];

  // Primary: use the directly extracted total-RHS line if available.
  // This covers labels like "Total liabilities and shareholders' equity",
  // "Total liabilities and stockholders' equity", "Total liabilities and equity".
  const directRHS = bsItems.find(i => i.tag === "LiabilitiesAndStockholdersEquity")?.value;
  if (directRHS != null && directRHS > 0) {
    rhs = directRHS;
    balanceIdentitySource = "direct_totals";
  } else {
    // Fallback: reconstruct RHS from components.
    // Prefer the directly extracted Liabilities tag; only sum sub-components
    // if that tag is absent — never derive liabilities as totalAssets - totalEquity.
    const directLiab = bsItems.find(i => i.tag === "Liabilities")?.value;
    let totalLiabilitiesComputed: number;
    if (directLiab != null && directLiab > 0) {
      totalLiabilitiesComputed = directLiab;
    } else {
      const currentLiab = bsItems.find(i => i.tag === "LiabilitiesCurrent")?.value ?? 0;
      const noncurrentDirect = bsItems.find(i => i.tag === "LiabilitiesNoncurrent")?.value;
      let noncurrentLiab: number;
      if (noncurrentDirect != null && noncurrentDirect > 0) {
        noncurrentLiab = noncurrentDirect;
      } else {
        const ltDebt     = bsItems.find(i => i.tag === "LongTermDebtNoncurrent" || i.tag === "LongTermDebt")?.value ?? 0;
        const opLease    = bsItems.find(i => i.tag === "OperatingLeaseLiabilityNoncurrent")?.value ?? 0;
        const finLease   = bsItems.find(i => i.tag === "FinanceLeaseLiabilityNoncurrent")?.value ?? 0;
        const pension    = bsItems.find(i => i.tag === "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent")?.value ?? 0;
        const deferredTx = bsItems.find(i => i.tag === "DeferredIncomeTaxLiabilitiesNet" || i.tag === "DeferredTaxLiabilitiesNoncurrent")?.value ?? 0;
        const otherLiab  = bsItems.find(i => i.tag === "OtherLiabilitiesNoncurrent")?.value ?? 0;
        noncurrentLiab = ltDebt + opLease + finLease + pension + deferredTx + otherLiab;
      }
      totalLiabilitiesComputed = currentLiab + noncurrentLiab;
    }
    // Redeemable NCI: mezzanine item between Liabilities and Equity.
    const redeemableNCI = bsItems.find(i => i.tag === "RedeemableNoncontrollingInterestEquityCarryingAmount")?.value ?? 0;
    rhs = totalLiabilitiesComputed + redeemableNCI + bs.totalEquity;
    balanceIdentitySource = "component_reconstruction";
  }

  const gapM = lhs - rhs;
  const gapPct = lhs > 0 ? Math.abs(gapM) / lhs : 0;
  const withinTolerance = gapPct < 0.01;
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
    balanceIdentitySource,
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

  // 1. A ≈ Total Liabilities and Equity
  // Prefer the directly extracted RHS total; fall back to component reconstruction
  // only when that tag is absent. Never derive liabilities as A − E.
  const directRHSV = allItems.find(i => i.tag === "LiabilitiesAndStockholdersEquity")?.value;
  let rhsForCheck: number;
  let identitySource: string;
  if (directRHSV != null && directRHSV > 0) {
    rhsForCheck = directRHSV;
    identitySource = "direct totals";
  } else {
    const directLiabV = allItems.find(i => i.tag === "Liabilities")?.value;
    let liabForCheck: number;
    if (directLiabV != null && directLiabV > 0) {
      liabForCheck = directLiabV;
    } else {
      const cl = allItems.find(i => i.tag === "LiabilitiesCurrent")?.value ?? 0;
      const noncurrentDirect2 = allItems.find(i => i.tag === "LiabilitiesNoncurrent")?.value;
      let ncl: number;
      if (noncurrentDirect2 != null && noncurrentDirect2 > 0) {
        ncl = noncurrentDirect2;
      } else {
        const ltd = allItems.find(i => i.tag === "LongTermDebtNoncurrent" || i.tag === "LongTermDebt")?.value ?? 0;
        const ope = allItems.find(i => i.tag === "OperatingLeaseLiabilityNoncurrent")?.value ?? 0;
        const fin = allItems.find(i => i.tag === "FinanceLeaseLiabilityNoncurrent")?.value ?? 0;
        const pen = allItems.find(i => i.tag === "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent")?.value ?? 0;
        const dt  = allItems.find(i => i.tag === "DeferredIncomeTaxLiabilitiesNet" || i.tag === "DeferredTaxLiabilitiesNoncurrent")?.value ?? 0;
        const ol  = allItems.find(i => i.tag === "OtherLiabilitiesNoncurrent")?.value ?? 0;
        ncl = ltd + ope + fin + pen + dt + ol;
      }
      liabForCheck = cl + ncl;
    }
    const redeemableNCICheck = allItems.find(i => i.tag === "RedeemableNoncontrollingInterestEquityCarryingAmount")?.value ?? 0;
    rhsForCheck = liabForCheck + redeemableNCICheck + bs.totalEquity;
    identitySource = "components";
  }
  const aLe = bs.totalAssets > 0
    ? Math.abs(bs.totalAssets - rhsForCheck) / bs.totalAssets
    : 1;
  checks.push({
    name: "A ≈ L + E",
    passed: aLe < 0.05,
    note:
      aLe < 0.05
        ? `Balance sheet identity gap ${(aLe * 100).toFixed(1)}% — OK (${identitySource})`
        : `Gap ${(aLe * 100).toFixed(1)}% — extraction may be incomplete (${identitySource})`,
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
  const allItems = [...bs, ...cf];
  const balanceSheet = buildBalanceSheet(bs);
  const debtStructure = buildDebtStructure(bs);
  const cashFlow = buildCashFlow(cf);
  const incomeStatement = buildIncomeStatement(cf, bs);
  const ratios = buildRatiosFull(balanceSheet, debtStructure, cashFlow, allItems, incomeStatement);
  const dividendAnalysis = buildDividendAnalysis(
    balanceSheet,
    debtStructure,
    cashFlow,
    allItems
  );
  const validation = buildValidation(balanceSheet, debtStructure, cashFlow, allItems);
  const reconcile = buildReconcile(balanceSheet, bs);

  return {
    meta,
    balanceSheet,
    debtStructure,
    cashFlow,
    incomeStatement,
    ratios,
    dividendAnalysis,
    cfItems: cf,
    validation,
    reconcile,
  };
}
