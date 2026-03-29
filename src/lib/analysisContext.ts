import type { FullAnalysis } from "@/types/analysis";

/** Build a sources map for each key metric — enables AI citations */
function buildSources(a: FullAnalysis): Record<string, { value: number | string | null; source: string }> {
  const findSource = (tag: string): string => {
    const fromBs = a.balanceSheet.items.find((i) => i.tag === tag);
    if (fromBs) return fromBs.source;
    const fromCf = (a.cfItems ?? []).find((i) => i.tag === tag);
    if (fromCf) return fromCf.source;
    return a.meta.source === "sec" ? "SEC XBRL" : a.meta.extractionMethod === "pdf-ai" ? "PDF (AI)" : "PDF (heuristic)";
  };

  const src = (v: number | null, tag?: string) =>
    tag ? findSource(tag) : a.meta.source === "sec" ? "SEC XBRL" : a.meta.extractionMethod ?? "PDF";

  return {
    totalAssets: { value: a.balanceSheet.totalAssets, source: findSource("Assets") || src(a.balanceSheet.totalAssets) },
    totalEquity: { value: a.balanceSheet.totalEquity, source: findSource("StockholdersEquity") || src(a.balanceSheet.totalEquity) },
    totalLiabilities: { value: a.balanceSheet.totalLiabilities, source: findSource("Liabilities") || src(a.balanceSheet.totalLiabilities) },
    cash: { value: a.balanceSheet.cashAndEquivalents, source: findSource("CashAndCashEquivalentsAtCarryingValue") || src(a.balanceSheet.cashAndEquivalents) },
    totalDebt: { value: a.debtStructure.totalDebt, source: "computed from debt items" },
    netDebt: { value: a.debtStructure.netDebt, source: "computed: totalDebt - cash" },
    operatingCashFlow: { value: a.cashFlow.operatingCashFlow, source: findSource("NetCashProvidedByOperatingActivities") || "cash flow" },
    freeCashFlow: { value: a.cashFlow.freeCashFlow, source: "computed: OCF - CapEx" },
    dividendsPaid: { value: a.cashFlow.dividendsPaid, source: findSource("PaymentsOfDividends") || findSource("PaymentsOfDividendsCommonStock") || "cash flow" },
    netIncome: { value: a.cashFlow.netIncome, source: findSource("NetIncomeLoss") || "income statement" },
    debtToEquity: { value: a.ratios.debtToEquity, source: "computed: totalDebt / totalEquity" },
    interestCoverage: { value: a.ratios.interestCoverage, source: "computed: operatingIncome / interestExpense" },
  };
}

/** Compact JSON for LLM context — includes sources for citations */
export function compactAnalysisForLLM(a: FullAnalysis): string {
  const sources = buildSources(a);
  const payload = {
    meta: {
      ...a.meta,
      confidence: a.meta.confidence,
      extractionMethod: a.meta.extractionMethod,
    },
    sources,
    summary: {
      totalAssets: a.balanceSheet.totalAssets,
      totalEquity: a.balanceSheet.totalEquity,
      totalLiabilities: a.balanceSheet.totalLiabilities,
      cash: a.balanceSheet.cashAndEquivalents,
      retainedEarnings: a.balanceSheet.retainedEarnings,
      totalDebt: a.debtStructure.totalDebt,
      netDebt: a.debtStructure.netDebt,
      shortTermDebt: a.debtStructure.shortTermDebt,
      longTermDebt: a.debtStructure.longTermDebt,
    },
    cashFlow: a.cashFlow,
    ratios: a.ratios,
    dividend: a.dividendAnalysis,
    validation: a.validation,
    reconcile: a.reconcile,
    balanceSheetLines: a.balanceSheet.items.slice(0, 40).map((i) => ({ ...i, _src: i.source })),
    incomeCfLines: (a.cfItems ?? []).slice(0, 40).map((i) => ({ ...i, _src: i.source })),
  };
  return JSON.stringify(payload, null, 0);
}
