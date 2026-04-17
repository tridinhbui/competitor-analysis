import type { FullAnalysis } from "@/types/analysis";

export type MetricTraceSpec = { value: number | null | undefined; tags: string[] };

/**
 * Maps dashboard row / KPI labels → numeric value + tags for `findSource` / PDF trace.
 */
export function buildMetricTraceLabelMap(result: FullAnalysis): Record<string, MetricTraceSpec> {
  const inc = result.incomeStatement;
  const bs = result.balanceSheet;
  const debt = result.debtStructure;
  const cf = result.cashFlow;
  const ratios = result.ratios;
  const cfItems = result.cfItems ?? [];
  const bi = (tag: string) =>
    cfItems.find((i) => i.tag === tag)?.value ?? bs.items.find((i) => i.tag === tag)?.value ?? null;

  const buyback = cf.shareRepurchases ?? bi("PaymentsForRepurchaseOfCommonStock");
  const daTotal =
    inc.depreciation != null || inc.amortization != null
      ? (inc.depreciation ?? 0) + (inc.amortization ?? 0)
      : null;

  const ocfToNI =
    cf.operatingCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? cf.operatingCashFlow / inc.netIncome
      : null;
  const fcfToNI =
    cf.freeCashFlow != null && inc.netIncome != null && inc.netIncome !== 0
      ? cf.freeCashFlow / inc.netIncome
      : null;

  return {
    Revenue: { value: inc.revenue, tags: ["Revenues", "NetRevenues", "SalesRevenueGoodsNet"] },
    "Cost of Revenue": { value: inc.costOfRevenue, tags: ["CostOfRevenue", "CostOfGoodsSold", "CostOfSales"] },
    "Gross Profit": { value: inc.grossProfit, tags: ["GrossProfit"] },
    "SG&A Expense": { value: inc.sgaExpense, tags: ["SellingGeneralAndAdministrativeExpense", "OperatingExpenses"] },
    "R&D Expense": { value: inc.rdExpense, tags: ["ResearchAndDevelopmentExpense"] },
    "Operating Income": { value: inc.operatingIncome, tags: ["OperatingIncome", "OperatingIncomeLoss"] },
    "OP Income": { value: inc.operatingIncome, tags: ["OperatingIncome", "OperatingIncomeLoss"] },
    EBITDA: { value: inc.ebitda, tags: ["EBITDA", "EarningsBeforeInterestTaxesDepreciationAmortization"] },
    "Net Income": { value: inc.netIncome, tags: ["NetIncome", "NetIncomeLoss", "ProfitLoss"] },
    Depreciation: { value: inc.depreciation, tags: ["DepreciationDepletionAndAmortization", "Depreciation"] },
    Amortization: { value: inc.amortization, tags: ["Amortization", "AmortizationOfIntangibleAssets"] },
    "D&A Total": { value: daTotal, tags: ["DepreciationDepletionAndAmortization", "Depreciation", "Amortization"] },
    "D&A": { value: inc.depreciation != null || inc.amortization != null ? daTotal : inc.depreciation, tags: ["DepreciationDepletionAndAmortization"] },
    "Interest Expense": { value: inc.interestExpense, tags: ["InterestExpense", "InterestAndDebtExpense"] },
    "Income Tax": { value: inc.incomeTax, tags: ["IncomeTaxExpense", "IncomeTaxExpenseBenefit"] },
    "EPS (Basic)": { value: inc.epsBasic, tags: ["EarningsPerShareBasic"] },
    "EPS (Diluted)": { value: inc.epsDiluted, tags: ["EarningsPerShareDiluted"] },
    "Total Assets": { value: bs.totalAssets, tags: ["Assets", "AssetsTotal"] },
    "Total Equity": { value: bs.totalEquity, tags: ["StockholdersEquity", "Equity"] },
    "Total Debt": { value: debt.totalDebt, tags: ["Debt", "LongTermDebt", "LongTermDebtNoncurrent"] },
    "Net Debt": { value: debt.netDebt, tags: ["Debt", "LongTermDebt", "CashAndCashEquivalents"] },
    "Cash & Equivalents": { value: bs.cashAndEquivalents, tags: ["CashAndCashEquivalents"] },
    "Operating CF": { value: cf.operatingCashFlow, tags: ["OperatingCashFlow", "NetCashProvidedByUsedInOperatingActivities"] },
    "Operating Cash Flow": { value: cf.operatingCashFlow, tags: ["OperatingCashFlow", "NetCashProvidedByUsedInOperatingActivities"] },
    "Capital Expenditures": { value: cf.capitalExpenditures, tags: ["CapitalExpenditure", "PaymentsToAcquirePropertyPlantAndEquipment"] },
    "CapEx (Reinvestment)": { value: cf.capitalExpenditures, tags: ["CapitalExpenditure", "PaymentsToAcquirePropertyPlantAndEquipment"] },
    "Free Cash Flow": { value: cf.freeCashFlow, tags: ["FreeCashFlow"] },
    FCF: { value: cf.freeCashFlow, tags: ["FreeCashFlow"] },
    "Dividends Paid": { value: cf.dividendsPaid, tags: ["Dividends", "PaymentsOfDividends"] },
    "Share Repurchases": {
      value: buyback,
      tags: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
    },
    "Current Assets": { value: bi("AssetsCurrent"), tags: ["AssetsCurrent"] },
    "PP&E (Net)": { value: bi("PropertyPlantAndEquipmentNet"), tags: ["PropertyPlantAndEquipmentNet"] },
    Goodwill: { value: bi("Goodwill"), tags: ["Goodwill"] },
    "Total Liabilities": { value: bs.totalLiabilities, tags: ["Liabilities", "LiabilitiesTotal"] },
    "Current Liabilities": { value: bi("LiabilitiesCurrent"), tags: ["LiabilitiesCurrent"] },
    "Retained Earnings": { value: bs.retainedEarnings, tags: ["RetainedEarningsAccumulatedDeficit", "RetainedEarnings"] },
    "Short-Term Debt": { value: debt.shortTermDebt, tags: ["ShortTermBorrowings", "DebtCurrent"] },
    "Long-Term Debt": { value: debt.longTermDebt, tags: ["LongTermDebt", "LongTermDebtNoncurrent"] },
    "Accounts Receivable": { value: bi("AccountsReceivableNetCurrent"), tags: ["AccountsReceivableNetCurrent"] },
    Inventories: { value: bi("InventoryNet"), tags: ["InventoryNet", "Inventory"] },
    "Accounts Payable": { value: bi("AccountsPayableCurrent"), tags: ["AccountsPayableCurrent"] },
    "Working Capital": { value: ratios.workingCapital, tags: ["AssetsCurrent", "LiabilitiesCurrent"] },
    "WC / Revenue": { value: ratios.workingCapitalRatio, tags: ["AssetsCurrent", "LiabilitiesCurrent", "Revenues"] },
    "Current Ratio": { value: ratios.currentRatio, tags: ["AssetsCurrent", "LiabilitiesCurrent"] },
    "Investing Cash Flow": { value: cf.investingCashFlow ?? bi("NetCashProvidedByUsedInInvestingActivities"), tags: ["NetCashProvidedByUsedInInvestingActivities"] },
    "LT Debt Issuance": { value: bi("ProceedsFromIssuanceOfLongTermDebt"), tags: ["ProceedsFromIssuanceOfLongTermDebt"] },
    "LT Debt Repayments": { value: bi("RepaymentsOfLongTermDebt"), tags: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt"] },
    "Financing Cash Flow": { value: cf.financingCashFlow ?? bi("NetCashProvidedByUsedInFinancingActivities"), tags: ["NetCashProvidedByUsedInFinancingActivities"] },
    "Gross Margin": { value: inc.grossMargin ?? ratios.grossMargin, tags: ["GrossProfit", "Revenues"] },
    "Operating Margin": { value: inc.operatingMargin ?? ratios.operatingMargin, tags: ["OperatingIncome", "Revenues"] },
    "OP Margin": { value: inc.operatingMargin ?? ratios.operatingMargin, tags: ["OperatingIncome", "Revenues"] },
    "EBITDA Margin": { value: inc.ebitdaMargin ?? ratios.ebitdaMargin, tags: ["EBITDA", "Revenues"] },
    "Net Margin": { value: inc.netMargin ?? ratios.netMargin, tags: ["NetIncome", "Revenues"] },
    ROE: { value: ratios.returnOnEquity, tags: ["NetIncome", "StockholdersEquity"] },
    "ROE (TTM)": { value: ratios.returnOnEquity, tags: ["NetIncome", "StockholdersEquity"] },
    ROA: { value: ratios.returnOnAssets, tags: ["NetIncome", "Assets"] },
    "ROA (TTM)": { value: ratios.returnOnAssets, tags: ["NetIncome", "Assets"] },
    ROIC: { value: ratios.returnOnInvestedCapital, tags: ["OperatingIncome", "InvestedCapital"] },
    "Debt / Equity": { value: ratios.debtToEquity, tags: ["Debt", "StockholdersEquity"] },
    "D/E Ratio": { value: ratios.debtToEquity, tags: ["Debt", "StockholdersEquity"] },
    "Debt / Capital": { value: ratios.debtToCapital, tags: ["Debt", "StockholdersEquity"] },
    "Net Debt / EBITDA": { value: ratios.netDebtToEbitda, tags: ["Debt", "EBITDA"] },
    "ND/EBITDA": { value: ratios.netDebtToEbitda, tags: ["Debt", "EBITDA"] },
    "Interest Coverage": { value: ratios.interestCoverage, tags: ["OperatingIncome", "InterestExpense"] },
    "Interest Cov.": { value: ratios.interestCoverage, tags: ["OperatingIncome", "InterestExpense"] },
    "Asset Turnover": { value: ratios.assetTurnover, tags: ["Revenues", "Assets"] },
    "Inventory Turnover": { value: ratios.inventoryTurnover, tags: ["CostOfRevenue", "InventoryNet"] },
    "Inventory Turn.": { value: ratios.inventoryTurnover, tags: ["CostOfRevenue", "InventoryNet"] },
    "Receivables Turnover": { value: ratios.receivablesTurnover, tags: ["Revenues", "AccountsReceivableNetCurrent"] },
    "Receivables Turn.": { value: ratios.receivablesTurnover, tags: ["Revenues", "AccountsReceivableNetCurrent"] },
    "FCF Yield": { value: ratios.fcfYield, tags: ["FreeCashFlow"] },
    "FCF Conversion": { value: ratios.fcfConversion, tags: ["FreeCashFlow", "OperatingCashFlow"] },
    "FCF Margin": {
      value: inc.revenue && cf.freeCashFlow != null ? (cf.freeCashFlow / inc.revenue) * 100 : null,
      tags: ["FreeCashFlow", "Revenues"],
    },
    "OCF / Net Income": { value: ocfToNI, tags: ["OperatingCashFlow", "NetIncome"] },
    "FCF / Net Income": { value: fcfToNI, tags: ["FreeCashFlow", "NetIncome"] },
    "Stock-Based Comp": { value: bi("ShareBasedCompensation"), tags: ["ShareBasedCompensation", "StockCompensation"] },
    "Total Shareholder Returns": {
      value: (cf.dividendsPaid ?? 0) + (buyback ?? 0),
      tags: ["PaymentsOfDividends", "PaymentsForRepurchaseOfCommonStock"],
    },
  };
}
