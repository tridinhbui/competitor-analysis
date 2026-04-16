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
    const found = items.find((i) => i.tag === tag);
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

  const cash = find(bs, "CashAndCashEquivalentsAtCarryingValue");
  const retained = find(bs, "RetainedEarningsAccumulatedDeficit");

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

    financingCashFlow = hasAnyFinComponent ? Math.round(derived) : null;
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

export function buildIncomeStatement(cf: BSItem[], bs: BSItem[]): IncomeStatement {
  const allItems = [...cf, ...bs];

  const revenue = findOrNull(
    cf,
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet"
  );
  const cogs = findOrNull(cf, "CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold");
  const grossProfitRaw = findOrNull(cf, "GrossProfit");
  const grossProfit = grossProfitRaw ?? (revenue != null && cogs != null ? revenue - Math.abs(cogs) : null);
  const sga = findOrNull(cf, "SellingGeneralAndAdministrativeExpense");
  const rd = findOrNull(cf, "ResearchAndDevelopmentExpense");
  const opExpenses = findOrNull(cf, "OperatingExpenses");
  const operatingIncome = findOrNull(cf, "OperatingIncomeLoss");
  const interestExpense = findOrNull(cf, "InterestExpense", "InterestExpenseNet");
  const incomeTax = findOrNull(cf, "IncomeTaxExpenseBenefit");
  const netIncome = findOrNull(cf, "NetIncomeLoss");
  const epsBasic = findOrNull(cf, "EarningsPerShareBasic");
  const epsDiluted = findOrNull(cf, "EarningsPerShareDiluted");

  const dep = findOrNull(cf, "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation");
  const amort = findOrNull(cf, "AmortizationOfIntangibleAssets");

  const ebit = operatingIncome;
  const totalDA = dep != null ? Math.abs(dep) + (amort != null ? Math.abs(amort) : 0) : (amort != null ? Math.abs(amort) : null);
  const ebitda = ebit != null && totalDA != null ? ebit + totalDA
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
  const interestExpense =
    income?.interestExpense ??
    findOrNull(allItems, "InterestExpense", "InterestExpenseNet");

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
  const receivables = findOrNull(allItems, "AccountsReceivableNetCurrent");
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
  const reconcile = buildReconcile(balanceSheet);

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
