/**
 * Lightweight validation / issue list for extraction quality (machine-readable).
 * Heavy repairs run in extractionRepairs + analysisEngine.assembleAnalysis.
 */

import type {
  BSItem,
  BalanceSheet,
  CashFlowData,
  DebtStructure,
  ExtractionValidationIssue,
  FullAnalysis,
  IncomeStatement,
  Ratios,
  ReconcileResult,
} from "@/types/analysis";

type ExtractionProfile = NonNullable<FullAnalysis["meta"]["extractionProfile"]>;

interface BuildExtractionIssueInput {
  meta: FullAnalysis["meta"];
  balanceSheet: BalanceSheet;
  debtStructure: DebtStructure;
  cashFlow: CashFlowData;
  incomeStatement: IncomeStatement;
  ratios: Ratios;
  reconcile: ReconcileResult;
  allItems: BSItem[];
}

function pct(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || Math.abs(denominator) < 1e-9) return null;
  return numerator / denominator;
}

function uniqueIssues(issues: ExtractionValidationIssue[]): ExtractionValidationIssue[] {
  const seen = new Set<string>();
  const out: ExtractionValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.field}:${issue.type}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function isHeuristicOrLowConfidence(item: BSItem): boolean {
  return item.confidence === "low" || /^heuristic:/i.test(item.source);
}

function businessType(meta: FullAnalysis["meta"]): ExtractionProfile["businessType"] {
  return meta.extractionProfile?.businessType ?? "general";
}

function businessSpecificIssues(input: BuildExtractionIssueInput): ExtractionValidationIssue[] {
  const issues: ExtractionValidationIssue[] = [];
  const business = businessType(input.meta);
  const { incomeStatement: inc, ratios } = input;

  if (business === "financial" || business === "insurance") {
    const industrialMetricsPresent =
      inc.grossMargin != null ||
      inc.costOfRevenue != null ||
      ratios.cashConversionCycle != null ||
      ratios.inventoryTurnover != null;
    if (industrialMetricsPresent) {
      issues.push({
        severity: "warning",
        field: "businessType",
        type: "industry_model_mismatch",
        message:
          `${business} filing is being scored with at least one industrial operating metric. Gross margin, inventory turns, CCC, and FCF ratios may not be decision-grade for this business model.`,
        suggestedAction:
          "Use the extraction profile to keep industry-specific metrics, then review the workbook before export.",
      });
    }
    if (inc.revenue == null && inc.netIncome != null) {
      issues.push({
        severity: "info",
        field: "revenue",
        type: "industry_metric_missing",
        message:
          "Revenue is missing, which can be normal for banks or insurers if the filing reports net interest income, premiums, or investment income instead.",
        suggestedAction:
          "Validate the industry-specific top-line metric in the workbook rather than forcing generic revenue.",
      });
    }
  }

  if (business === "software") {
    const deferredRevenue = input.allItems.some((item) => item.tag === "DeferredRevenueCurrent");
    if (deferredRevenue && inc.revenue == null) {
      issues.push({
        severity: "warning",
        field: "revenue",
        type: "saas_revenue_missing",
        message:
          "Deferred revenue was found but revenue was not mapped. SaaS filings often require separating revenue, ARR/RPO, billings, and deferred revenue.",
        suggestedAction:
          "Check the income statement and deferred revenue roll-forward; do not substitute ARR or RPO for GAAP revenue.",
      });
    }
  }

  if (business === "real-estate" && inc.ebitda != null && input.cashFlow.capitalExpenditures == null) {
    issues.push({
      severity: "info",
      field: "cashFlow.capitalExpenditures",
      type: "reit_capex_context_missing",
      message:
        "Real estate filing has EBITDA-like metrics but no CapEx line. FFO/AFFO may be more useful than generic FCF.",
      suggestedAction:
        "Add or verify FFO/AFFO and maintenance CapEx in the workbook if this is a REIT-style analysis.",
    });
  }

  return issues;
}

function periodIssues(input: BuildExtractionIssueInput): ExtractionValidationIssue[] {
  const cfPeriods = new Set(
    input.allItems
      .filter((item) => item.period_type && item.period_type !== "balance_sheet")
      .map((item) => item.period_type)
  );
  const preference = input.meta.extractionProfile?.periodPreference ?? "auto";
  const issues: ExtractionValidationIssue[] = [];

  if (!input.meta.periodEnd) {
    issues.push({
      severity: "warning",
      field: "meta.periodEnd",
      type: "period_end_not_detected",
      message:
        "Fiscal period-end date could not be detected from the filing's cover page.",
      suggestedAction:
        "Check the filing cover page for the exact 'quarterly period ended' date and set it manually before relying on period-over-period comparisons.",
    });
  }

  if (cfPeriods.size > 1) {
    issues.push({
      severity: "warning",
      field: "periodBasis",
      type: "mixed_period_basis",
      message:
        `Cash-flow / income items contain mixed period bases (${[...cfPeriods].join(", ")}). Margins, FCF conversion, and payout ratios can be wrong if quarter and YTD numbers are mixed.`,
      suggestedAction:
        "Open the workbook and align income statement and cash-flow metrics to one period basis before using the model.",
    });
  }

  if (preference !== "auto" && !cfPeriods.has(preference)) {
    issues.push({
      severity: "info",
      field: "periodBasis",
      type: "preferred_period_not_found",
      message:
        `Extraction profile requested ${preference} metrics, but the extracted line items did not clearly include that period basis.`,
      suggestedAction:
        "Review source columns in the PDF trace and select the correct period manually if needed.",
    });
  }

  return issues;
}

function sanityIssues(input: BuildExtractionIssueInput): ExtractionValidationIssue[] {
  const issues: ExtractionValidationIssue[] = [];
  const { balanceSheet: bs, cashFlow: cf, debtStructure: debt, incomeStatement: inc, ratios, reconcile } = input;

  if (reconcile.status === "fail") {
    issues.push({
      severity: "error",
      field: "balanceSheet",
      type: "accounting_identity_fail",
      message:
        `Balance sheet does not reconcile: assets differ from liabilities plus equity by ${reconcile.gapPct.toFixed(1)}%.`,
      suggestedAction:
        "Verify total liabilities, equity, and any noncontrolling interest lines before relying on leverage metrics.",
    });
  } else if (reconcile.status === "warning") {
    issues.push({
      severity: "warning",
      field: "balanceSheet",
      type: "accounting_identity_warning",
      message:
        `Balance sheet identity gap is ${reconcile.gapPct.toFixed(1)}%, above the normal tolerance.`,
      suggestedAction:
        "Review equity and liabilities in the workbook; one total line may have been missed or scaled differently.",
    });
  }

  // reconcile.* reflects the balance sheet AFTER identity enforcement may
  // have silently plugged liabilities/equity to force A = L + E, so it will
  // usually read "ok" even when a real, unexplained gap was found and
  // patched. Surface that original gap explicitly instead of hiding it.
  if (bs.unexplainedGap != null && bs.totalAssets > 0) {
    const gapPctOfAssets = (bs.unexplainedGap / bs.totalAssets) * 100;
    issues.push({
      severity: gapPctOfAssets > 5 ? "error" : "warning",
      field: "balanceSheet",
      type: "unexplained_identity_gap_patched",
      message:
        `Assets did not equal Liabilities + Equity as extracted (gap of ~${bs.unexplainedGap.toLocaleString("en-US")}M, ${gapPctOfAssets.toFixed(1)}% of assets). Liabilities/equity shown here were auto-adjusted to force the identity — this can be legitimate (noncontrolling interest, redeemable equity) or a real extraction error.`,
      suggestedAction:
        "Check the source filing's equity and noncontrolling-interest lines before trusting leverage/equity ratios for this period.",
    });
  }

  const grossMargin = pct(inc.grossProfit, inc.revenue);
  if (grossMargin != null && (grossMargin > 1.05 || grossMargin < -0.2)) {
    issues.push({
      severity: "warning",
      field: "incomeStatement.grossMargin",
      type: "margin_outlier",
      message:
        `Gross margin is ${(grossMargin * 100).toFixed(1)}%, which is outside a normal operating range.`,
      suggestedAction:
        "Check whether revenue, COGS, or gross profit came from different tables or period bases.",
    });
  }

  if (inc.ebitdaAdjusted != null && inc.ebitdaGaap != null) {
    const divergence = pct(inc.ebitdaAdjusted - inc.ebitdaGaap, inc.ebitdaGaap);
    if (divergence != null && Math.abs(divergence) > 0.1) {
      issues.push({
        severity: "info",
        field: "incomeStatement.ebitda",
        type: "ebitda_adjusted_gaap_divergence",
        message:
          `Company-disclosed Adjusted EBITDA differs from GAAP-calculated EBITDA (Operating Income + D&A) by ${(divergence * 100).toFixed(1)}%. The two are not directly comparable to peers unless they use the same basis.`,
        suggestedAction:
          "Check what the company excludes in its Adjusted EBITDA (stock comp, restructuring, one-offs) before using it for peer or trend comparisons.",
      });
    }
  }

  const opMargin = pct(inc.operatingIncome, inc.revenue);
  if (opMargin != null && (opMargin > 0.8 || opMargin < -0.8)) {
    issues.push({
      severity: "warning",
      field: "incomeStatement.operatingMargin",
      type: "margin_outlier",
      message:
        `Operating margin is ${(opMargin * 100).toFixed(1)}%, which looks unusual for most companies.`,
      suggestedAction:
        "Confirm operating income and revenue use the same period and consolidated scope.",
    });
  }

  if (inc.revenue != null && bs.totalAssets > 0 && inc.revenue > bs.totalAssets * 8 && businessType(input.meta) !== "retail") {
    issues.push({
      severity: "warning",
      field: "scale",
      type: "revenue_assets_scale_mismatch",
      message:
        "Revenue is more than 8x total assets. This can happen for some models, but often signals a units or period mismatch.",
      suggestedAction:
        "Check the extraction scale setting and source table units (thousands vs millions).",
    });
  }

  if (debt.totalDebt > 0 && bs.totalAssets > 0 && debt.totalDebt > bs.totalAssets * 1.5) {
    issues.push({
      severity: "warning",
      field: "debtStructure.totalDebt",
      type: "debt_assets_outlier",
      message:
        "Total debt exceeds 150% of total assets, which is unusual and may indicate duplicated debt lines.",
      suggestedAction:
        "Verify that current debt, long-term debt, gross debt, and net debt were not double-counted.",
    });
  }

  if (cf.freeCashFlow != null && inc.revenue != null && Math.abs(cf.freeCashFlow) > Math.abs(inc.revenue) * 1.5) {
    issues.push({
      severity: "warning",
      field: "cashFlow.freeCashFlow",
      type: "fcf_revenue_outlier",
      message:
        "Free cash flow magnitude is larger than 150% of revenue. This is usually a period or scale mismatch.",
      suggestedAction:
        "Verify OCF and CapEx period basis before using FCF conversion or payout metrics.",
    });
  }

  if (ratios.effectiveTaxRate != null && (ratios.effectiveTaxRate < 0 || ratios.effectiveTaxRate > 80)) {
    issues.push({
      severity: "info",
      field: "ratios.effectiveTaxRate",
      type: "tax_rate_outlier",
      message:
        `Effective tax rate is ${ratios.effectiveTaxRate.toFixed(1)}%, which may reflect one-time items or extraction mismatch.`,
      suggestedAction:
        "Check pretax income and income tax expense in the source table.",
    });
  }

  return issues;
}

function confidenceIssues(input: BuildExtractionIssueInput): ExtractionValidationIssue[] {
  const lowConfidence = input.allItems.filter(isHeuristicOrLowConfidence);
  if (lowConfidence.length === 0) return [];

  const importantTags = new Set([
    "Assets",
    "Liabilities",
    "StockholdersEquity",
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "OperatingIncomeLoss",
    "NetIncomeLoss",
    "NetCashProvidedByOperatingActivities",
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsOfDividends",
  ]);
  const important = lowConfidence.filter((item) => importantTags.has(item.tag));

  return [
    {
      severity: important.length > 0 ? "warning" : "info",
      field: "lineItems",
      type: "heuristic_or_low_confidence_items",
      message:
        `${lowConfidence.length} extracted line ${lowConfidence.length === 1 ? "item is" : "items are"} heuristic or low-confidence${important.length > 0 ? `, including ${important.length} core metric${important.length === 1 ? "" : "s"}` : ""}.`,
      suggestedAction:
        "Open source traceability for low-confidence rows and approve or override them in the workbook before export.",
    },
  ];
}

export function buildExtractionValidationIssues(
  input: BuildExtractionIssueInput
): ExtractionValidationIssue[] {
  return uniqueIssues([
    ...confidenceIssues(input),
    ...periodIssues(input),
    ...sanityIssues(input),
    ...businessSpecificIssues(input),
  ]);
}
