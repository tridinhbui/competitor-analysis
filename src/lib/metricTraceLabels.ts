import type { FullAnalysis } from "@/types/analysis";
import type { TraceSpecInput } from "./pdfTraceResolve";

export type MetricTraceSpec = TraceSpecInput;

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
  const debtItems = result.debtStructure?.items ?? [];
  const bi = (tag: string) =>
    cfItems.find((i) => i.tag === tag)?.value ??
    bs.items.find((i) => i.tag === tag)?.value ??
    debtItems.find((i) => i.tag === tag)?.value ??
    null;
  const lineByTags = (...tags: string[]) =>
    cfItems.find((i) => tags.includes(i.tag)) ??
    bs.items.find((i) => tags.includes(i.tag)) ??
    debtItems.find((i) => tags.includes(i.tag)) ??
    null;
  const allItems = [...cfItems, ...bs.items, ...debtItems];
  const hasPdfValueMatch = (value: number | null | undefined, ...tags: string[]) =>
    value != null &&
    allItems.some((item) => {
      if (!tags.includes(item.tag)) return false;
      if (!/^PDF:p\d+/i.test(item.source ?? "")) return false;
      const absItem = Math.abs(item.value);
      const absValue = Math.abs(value);
      const diff = Math.abs(absItem - absValue);
      return diff <= Math.max(0.01, Math.min(0.5, Math.max(absItem, absValue) * 0.001));
    });
  const withDerivedFallback = (
    spec: MetricTraceSpec,
    derivation: NonNullable<MetricTraceSpec["derivation"]>
  ): MetricTraceSpec => {
    const sourceTags = spec.sourceTags ?? spec.tags;
    return hasPdfValueMatch(spec.value, ...sourceTags) ? spec : { ...spec, derivation };
  };

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
    EBITDA: {
      value: inc.ebitda,
      tags: ["EarningsBeforeInterestTaxesDepreciationAmortization", "EBITDA"],
      sourceTags: [
        "EBITDA",
        "EarningsBeforeInterestTaxesDepreciationAmortization",
        "DepreciationDepletionAndAmortization",
        "AmortizationOfIntangibleAssets",
      ],
      pdfMatchLabel: "EBITDA",
      derivation: {
        formula: "Operating income + Depreciation + Amortization",
        inputs: ["Operating Income", "Depreciation", "Amortization"],
      },
    },
    "Net Income": { value: inc.netIncome, tags: ["NetIncome", "NetIncomeLoss", "ProfitLoss"] },
    Depreciation: { value: inc.depreciation, tags: ["DepreciationDepletionAndAmortization", "Depreciation"] },
    Amortization: { value: inc.amortization, tags: ["Amortization", "AmortizationOfIntangibleAssets"] },
    "D&A Total": {
      value: daTotal,
      tags: ["DepreciationDepletionAndAmortization", "Depreciation", "Amortization"],
      sourceTags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
      pdfMatchLabel: "Depreciation and Amortization",
    },
    "D&A": {
      value: inc.depreciation != null || inc.amortization != null ? daTotal : inc.depreciation,
      tags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
      sourceTags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
      pdfMatchLabel: "Depreciation and Amortization",
    },
    "Interest Expense": {
      value: inc.interestExpense,
      tags: [
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      sourceTags: [
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      pdfMatchLabel: "Interest Expense",
    },
    "Income Tax": { value: inc.incomeTax, tags: ["IncomeTaxExpense", "IncomeTaxExpenseBenefit"] },
    "EPS (Basic)": { value: inc.epsBasic, tags: ["EarningsPerShareBasic"] },
    "EPS (Diluted)": { value: inc.epsDiluted, tags: ["EarningsPerShareDiluted"] },
    "Total Assets": { value: bs.totalAssets, tags: ["Assets", "AssetsTotal"] },
    "Total Equity": { value: bs.totalEquity, tags: ["StockholdersEquity", "Equity"] },
    "Debt Current": { value: bi("DebtCurrent"), tags: ["DebtCurrent"] },
    "Short-Term Borrowings": { value: bi("ShortTermBorrowings"), tags: ["ShortTermBorrowings"] },
    "Current LT Debt": { value: bi("LongTermDebtCurrent"), tags: ["LongTermDebtCurrent"] },
    "LT Debt (Noncurrent)": { value: bi("LongTermDebtNoncurrent"), tags: ["LongTermDebtNoncurrent"] },
    "LT Debt (Plain)": { value: bi("LongTermDebt"), tags: ["LongTermDebt"] },
    "Total Debt": {
      value: debt.totalDebt,
      tags: ["GrossDebt", "LongTermDebtNoncurrent", "DebtCurrent", "ShortTermBorrowings", "NotesPayable", "NotesPayableCurrent", "NotesPayableNoncurrent"],
      sourceTags: [
        "GrossDebt",
        "DebtCurrent",
        "ShortTermBorrowings",
        "LongTermDebtCurrent",
        "LongTermDebt",
        "LongTermDebtNoncurrent",
        "NotesPayable",
        "NotesPayableCurrent",
        "NotesPayableNoncurrent",
      ],
      pdfMatchLabel: "Notes payable",
    },
    "Net Debt": withDerivedFallback(
      {
        value: debt.netDebt,
        tags: [
          "TotalNetDebtSupplemental",
          "GrossDebt",
          "CashAndCashEquivalentsAtCarryingValue",
          "ShortTermInvestments",
        ],
        sourceTags: [
          "TotalNetDebtSupplemental",
          "GrossDebt",
          "CashAndCashEquivalentsAtCarryingValue",
          "CashAndCashEquivalents",
          "ShortTermInvestments",
        ],
        pdfMatchLabel: "Total net debt",
      },
      {
        formula: "Total debt − Cash & equivalents − Short-term investments",
        formulaNote: "Used when the filing does not provide a direct net debt line but does provide the liquidity offsets separately.",
        inputs: ["Total Debt", "Cash & Equivalents", "Short-Term Investments"],
      }
    ),
    "Cash & Equivalents": { value: bs.cashAndEquivalents, tags: ["CashAndCashEquivalents"] },
    "Short-Term Investments": { value: bi("ShortTermInvestments"), tags: ["ShortTermInvestments"] },
    "Operating CF": {
      value: cf.operatingCashFlow,
      tags: ["NetCashProvidedByOperatingActivities", "OperatingCashFlow"],
      sourceTags: ["NetCashProvidedByOperatingActivities"],
      pdfMatchLabel: "Operating CF",
    },
    "Operating Cash Flow": {
      value: cf.operatingCashFlow,
      tags: ["NetCashProvidedByOperatingActivities", "OperatingCashFlow"],
      sourceTags: ["NetCashProvidedByOperatingActivities"],
      pdfMatchLabel: "Operating CF",
    },
    "Capital Expenditures": {
      value: cf.capitalExpenditures,
      tags: ["CapitalExpenditure", "PaymentsToAcquirePropertyPlantAndEquipment"],
      sourceTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditure"],
      pdfMatchLabel: "Additions to property, plant and equipment",
    },
    "CapEx (Reinvestment)": {
      value: cf.capitalExpenditures,
      tags: ["CapitalExpenditure", "PaymentsToAcquirePropertyPlantAndEquipment"],
      sourceTags: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditure"],
      pdfMatchLabel: "Additions to property, plant and equipment", 
    },
    "Free Cash Flow": {
      value: cf.freeCashFlow,
      tags: ["FreeCashFlow"],
      derivation: {
        formula: "Operating cash flow − Capital expenditures",
        inputs: ["Operating CF", "Capital Expenditures"],
      },
    },
    FCF: {
      value: cf.freeCashFlow,
      tags: ["FreeCashFlow"],
      derivation: {
        formula: "Operating cash flow − Capital expenditures",
        inputs: ["Operating CF", "Capital Expenditures"],
      },
    },
    "Dividends Paid": {
      value: cf.dividendsPaid,
      tags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
      sourceTags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
      pdfMatchLabel: "Dividends",
    },
    "Share Repurchases": {
      value: buyback,
      tags: ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
    },
    "Current Assets": { value: bi("AssetsCurrent"), tags: ["AssetsCurrent"] },
    "PP&E (Net)": {
      value: bi("PropertyPlantAndEquipmentNet"),
      tags: ["PropertyPlantAndEquipmentNet"],
      pdfMatchLabel: "Net Property, Plant and Equipment",
    },
    Goodwill: { value: bi("Goodwill"), tags: ["Goodwill"] },
    "Total Liabilities": {
      value: bs.totalLiabilities,
      tags: ["Liabilities", "LiabilitiesTotal"],
      derivation: {
        formula: "Total assets − Total equity",
        formulaNote: "When a direct total-liabilities line exists, click to jump to it in the PDF. If that line is not confidently mapped, the dashboard falls back to Total assets minus Total equity.",
        inputs: ["Total Assets", "Total Equity"],
      },
    },
    "Current Liabilities": { value: bi("LiabilitiesCurrent"), tags: ["LiabilitiesCurrent"] },
    "Retained Earnings": { value: bs.retainedEarnings, tags: ["RetainedEarningsAccumulatedDeficit", "RetainedEarnings"] },
    "Short-Term Debt": withDerivedFallback(
      {
        value: debt.shortTermDebt,
        tags: ["ShortTermBorrowings", "DebtCurrent", "LongTermDebtCurrent"],
        sourceTags: ["ShortTermBorrowings", "DebtCurrent", "LongTermDebtCurrent"],
      },
      {
        formula: "Debt current + Short-term borrowings + current LT debt",
        formulaNote: "Short-term debt is aggregated from all current debt components when there is no single direct PDF line.",
        inputs: ["Debt Current", "Short-Term Borrowings", "Current LT Debt"],
      }
    ),
    "Long-Term Debt": withDerivedFallback(
      {
        value: debt.longTermDebt,
        tags: ["LongTermDebt", "LongTermDebtNoncurrent"],
        sourceTags: ["LongTermDebt", "LongTermDebtNoncurrent"],
      },
      {
        formula: "Long-term debt non-current (or combined LT debt lines)",
        formulaNote: "When the filing splits long-term debt across multiple labels, the dashboard consolidates those LT debt components.",
        inputs: ["LT Debt (Noncurrent)", "LT Debt (Plain)"],
      }
    ),
    "Accounts Receivable": {
      value: bi("AccountsReceivableNetCurrent") ?? bi("AccountsReceivableNet"),
      tags: ["AccountsReceivableNetCurrent", "AccountsReceivableNet"],
    },
    Inventories: { value: bi("InventoryNet"), tags: ["InventoryNet", "Inventory"] },
    "Accounts Payable": {
      value: bi("AccountsPayableCurrent") ?? bi("AccountsPayable"),
      tags: ["AccountsPayableCurrent", "AccountsPayable"],
    },
    "Working Capital": {
      value: ratios.workingCapital,
      tags: ["AssetsCurrent", "LiabilitiesCurrent"],
      derivation: {
        formula: "Current assets − Current liabilities",
        formulaNote: "Working capital is a computed balance-sheet metric, so the hover explains the math even when there is no single PDF row labeled working capital.",
        inputs: ["Current Assets", "Current Liabilities"],
      },
    },
    "WC / Revenue": {
      value: ratios.workingCapitalRatio,
      tags: ["AssetsCurrent", "LiabilitiesCurrent", "Revenues"],
      derivation: {
        formula: "(Current assets − Current liabilities) ÷ Revenue × 100",
        inputs: ["Current Assets", "Current Liabilities", "Revenue"],
      },
    },
    "Current Ratio": {
      value: ratios.currentRatio,
      tags: ["AssetsCurrent", "LiabilitiesCurrent"],
      derivation: {
        formula: "Current assets ÷ Current liabilities",
        inputs: ["Current Assets", "Current Liabilities"],
      },
    },
    "Investing Cash Flow": { value: cf.investingCashFlow ?? bi("NetCashProvidedByUsedInInvestingActivities"), tags: ["NetCashProvidedByUsedInInvestingActivities"] },
    "LT Debt Issuance": { value: bi("ProceedsFromIssuanceOfLongTermDebt"), tags: ["ProceedsFromIssuanceOfLongTermDebt"] },
    "LT Debt Repayments": { value: bi("RepaymentsOfLongTermDebt"), tags: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt"] },
    "Financing Cash Flow": { value: cf.financingCashFlow ?? bi("NetCashProvidedByUsedInFinancingActivities"), tags: ["NetCashProvidedByUsedInFinancingActivities"] },
    "Gross Margin": {
      value: inc.grossMargin ?? ratios.grossMargin,
      tags: ["GrossProfit", "Revenues"],
      sourceTags: ["GrossProfit", "Revenues"],
      pdfMatchLabel: "Gross Profit",
      derivation: {
        formula: "Gross profit ÷ Revenue × 100",
        inputs: ["Gross Profit", "Revenue"],
      },
    },
    "Operating Margin": {
      value: inc.operatingMargin ?? ratios.operatingMargin,
      tags: ["OperatingIncomeLoss", "Revenues"],
      sourceTags: ["OperatingIncomeLoss"],
      pdfMatchLabel: "Operating Income",
      derivation: {
        formula: "Operating income ÷ Revenue × 100",
        inputs: ["Operating Income", "Revenue"],
      },
    },
    "OP Margin": {
      value: inc.operatingMargin ?? ratios.operatingMargin,
      tags: ["OperatingIncomeLoss", "Revenues"],
      sourceTags: ["OperatingIncomeLoss"],
      pdfMatchLabel: "Operating Income",
      derivation: {
        formula: "Operating income ÷ Revenue × 100",
        inputs: ["Operating Income", "Revenue"],
      },
    },
    "EBITDA Margin": {
      value: inc.ebitdaMargin ?? ratios.ebitdaMargin,
      tags: ["EBITDA", "Revenues"],
      sourceTags: ["EBITDA", "EarningsBeforeInterestTaxesDepreciationAmortization", "Revenues"],
      pdfMatchLabel: "EBITDA",
      derivation: {
        formula: "EBITDA ÷ Revenue × 100",
        inputs: ["EBITDA", "Revenue"],
      },
    },
    "Net Margin": {
      value: inc.netMargin ?? ratios.netMargin,
      tags: ["NetIncomeLoss", "Revenues"],
      sourceTags: ["NetIncomeLoss"],
      pdfMatchLabel: "Net Income",
      derivation: {
        formula: "Net income ÷ Revenue × 100",
        inputs: ["Net Income", "Revenue"],
      },
    },
    ROE: {
      value: ratios.returnOnEquity,
      tags: ["NetIncomeLoss", "StockholdersEquity"],
      sourceTags: ["NetIncomeLoss", "StockholdersEquity"],
      pdfMatchLabel: "Net Income",
      derivation: {
        formula: "Net income ÷ Total equity (period-end) × 100",
        inputs: ["Net Income", "Total Equity"],
      },
    },
    "ROE (TTM)": {
      value: ratios.returnOnEquity,
      tags: ["NetIncomeLoss", "StockholdersEquity"],
      sourceTags: ["NetIncomeLoss", "StockholdersEquity"],
      pdfMatchLabel: "Net Income",
      derivation: {
        formula: "Net income ÷ Total equity (period-end) × 100",
        inputs: ["Net Income", "Total Equity"],
      },
    },
    ROA: {
      value: ratios.returnOnAssets,
      tags: ["NetIncomeLoss", "Assets"],
      sourceTags: ["NetIncomeLoss", "Assets"],
      pdfMatchLabel: "Net Income",
      derivation: {
        formula: "Net income ÷ Total assets × 100",
        inputs: ["Net Income", "Total Assets"],
      },
    },
    "ROA (TTM)": {
      value: ratios.returnOnAssets,
      tags: ["NetIncomeLoss", "Assets"],
      sourceTags: ["NetIncomeLoss", "Assets"],
      pdfMatchLabel: "Net Income",
      derivation: {
        formula: "Net income ÷ Total assets × 100",
        inputs: ["Net Income", "Total Assets"],
      },
    },
    "Debt / Equity": {
      value: ratios.debtToEquity,
      tags: ["Debt", "StockholdersEquity"],
      derivation: { formula: "Total debt ÷ Total equity", inputs: ["Total Debt", "Total Equity"] },
    },
    "D/E Ratio": {
      value: ratios.debtToEquity,
      tags: ["Debt", "StockholdersEquity"],
      derivation: { formula: "Total debt ÷ Total equity", inputs: ["Total Debt", "Total Equity"] },
    },
    "Debt / Capital": {
      value: ratios.debtToCapital,
      tags: ["Debt", "StockholdersEquity"],
      derivation: {
        formula: "Total debt ÷ (Total debt + Total equity) × 100",
        inputs: ["Total Debt", "Total Equity"],
      },
    },
    "Net Debt / EBITDA": {
      value: ratios.netDebtToEbitda,
      tags: ["GrossDebt", "EBITDA", "CashAndCashEquivalentsAtCarryingValue"],
      sourceTags: ["GrossDebt", "EBITDA", "CashAndCashEquivalentsAtCarryingValue"],
      pdfMatchLabel: "Net Debt",
      derivation: { formula: "Net debt ÷ EBITDA", inputs: ["Net Debt", "EBITDA"] },
    },
    "ND/EBITDA": {
      value: ratios.netDebtToEbitda,
      tags: ["GrossDebt", "EBITDA", "CashAndCashEquivalentsAtCarryingValue"],
      sourceTags: ["GrossDebt", "EBITDA", "CashAndCashEquivalentsAtCarryingValue"],
      pdfMatchLabel: "Net Debt",
      derivation: { formula: "Net debt ÷ EBITDA", inputs: ["Net Debt", "EBITDA"] },
    },
    "Interest Coverage": {
      value: ratios.interestCoverage,
      tags: [
        "OperatingIncomeLoss",
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      sourceTags: [
        "OperatingIncomeLoss",
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      pdfMatchLabel: "Operating Income",
      derivation: {
        formula: "Operating income (or EBITDA) ÷ Interest expense",
        inputs: ["Operating Income", "Interest Expense"],
      },
    },
    "Interest Cov.": {
      value: ratios.interestCoverage,
      tags: [
        "OperatingIncomeLoss",
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      sourceTags: [
        "OperatingIncomeLoss",
        "InterestExpense",
        "InterestExpenseNet",
        "InterestExpenseDebt",
        "InterestAndDebtExpense",
      ],
      pdfMatchLabel: "Operating Income",
      derivation: {
        formula: "Operating income (or EBITDA) ÷ Interest expense",
        inputs: ["Operating Income", "Interest Expense"],
      },
    },
    "Asset Turnover": {
      value: ratios.assetTurnover,
      tags: ["Revenues", "Assets"],
      derivation: { formula: "Revenue ÷ Total assets", inputs: ["Revenue", "Total Assets"] },
    },
    "Inventory Turnover": {
      value: ratios.inventoryTurnover,
      tags: ["CostOfRevenue", "InventoryNet"],
      derivation: { formula: "Cost of revenue ÷ Inventories", inputs: ["Cost of Revenue", "Inventories"] },
    },
    "Inventory Turn.": {
      value: ratios.inventoryTurnover,
      tags: ["CostOfRevenue", "InventoryNet"],
      derivation: { formula: "Cost of revenue ÷ Inventories", inputs: ["Cost of Revenue", "Inventories"] },
    },
    "Receivables Turnover": {
      value: ratios.receivablesTurnover,
      tags: ["Revenues", "AccountsReceivableNetCurrent"],
      derivation: { formula: "Revenue ÷ Accounts receivable", inputs: ["Revenue", "Accounts Receivable"] },
    },
    "Receivables Turn.": {
      value: ratios.receivablesTurnover,
      tags: ["Revenues", "AccountsReceivableNetCurrent"],
      derivation: { formula: "Revenue ÷ Accounts receivable", inputs: ["Revenue", "Accounts Receivable"] },
    },
    "FCF Yield": {
      value: ratios.fcfYield,
      tags: ["FreeCashFlow"],
      derivation: {
        formula: "Free cash flow ÷ (Equity + Debt) × 100",
        inputs: ["Free Cash Flow", "Total Equity", "Total Debt"],
      },
    },
    "FCF Conversion": {
      value: ratios.fcfConversion,
      tags: ["FreeCashFlow", "OperatingCashFlow"],
      derivation: { formula: "Free cash flow ÷ Net income", inputs: ["Free Cash Flow", "Net Income"] },
    },
    "FCF Margin": {
      value: inc.revenue && cf.freeCashFlow != null ? (cf.freeCashFlow / inc.revenue) * 100 : null,
      tags: ["FreeCashFlow", "Revenues"],
      derivation: { formula: "Free cash flow ÷ Revenue × 100", inputs: ["Free Cash Flow", "Revenue"] },
    },
    "OCF / Net Income": {
      value: ocfToNI,
      tags: ["OperatingCashFlow", "NetIncome"],
      derivation: { formula: "Operating cash flow ÷ Net income", inputs: ["Operating CF", "Net Income"] },
    },
    "FCF / Net Income": {
      value: fcfToNI,
      tags: ["FreeCashFlow", "NetIncome"],
      derivation: { formula: "Free cash flow ÷ Net income", inputs: ["Free Cash Flow", "Net Income"] },
    },
    "Stock-Based Comp": { value: bi("ShareBasedCompensation"), tags: ["ShareBasedCompensation", "StockCompensation"] },
    "Total Shareholder Returns": {
      value: (cf.dividendsPaid ?? 0) + (buyback ?? 0),
      tags: ["PaymentsOfDividends", "PaymentsForRepurchaseOfCommonStock"],
    },
  };
}
