import { loadAllFilings } from "@/lib/filingStorage";
import {
  buildBoardInsights,
  buildComparisonCharts,
  buildComparisonNarrative,
  buildComparisonReport,
  buildComparisonRows,
  buildComparisonTrends,
  buildComparisonWarnings,
  buildMethodologyComparison,
  buildRelativePerformance,
  buildSegmentComparisonRows,
  normalizeMetrics,
  type CompanyComparisonPayload,
} from "@/lib/companyComparison";
import {
  filterFilingsForWorkspace,
  getWorkspaceResetAt,
} from "@/lib/workspaceReset";

export class CompanyComparisonRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "CompanyComparisonRequestError";
  }
}

export interface BuildCompanyComparisonPayloadInput {
  companyA?: string | null;
  companyB?: string | null;
  periodEndA?: string | null;
  periodEndB?: string | null;
}

function pickFilingByPeriod(
  filings: Awaited<ReturnType<typeof loadAllFilings>>,
  periodEnd?: string | null
) {
  if (!periodEnd) return filings[0] ?? null;
  return filings.find((filing) => filing.periodEnd === periodEnd) ?? filings[0] ?? null;
}

export async function buildCompanyComparisonPayload(
  input: BuildCompanyComparisonPayloadInput
): Promise<CompanyComparisonPayload> {
  const companyA = input.companyA?.trim().toUpperCase();
  const companyB = input.companyB?.trim().toUpperCase();
  const periodEndA = input.periodEndA?.trim() || undefined;
  const periodEndB = input.periodEndB?.trim() || undefined;

  if (!companyA || !companyB) {
    throw new CompanyComparisonRequestError(
      400,
      "Missing ?companyA= or ?companyB= parameter"
    );
  }

  if (companyA === companyB) {
    throw new CompanyComparisonRequestError(
      400,
      "Please select two different companies to compare."
    );
  }

  const [resetAtA, resetAtB] = await Promise.all([
    getWorkspaceResetAt(companyA),
    getWorkspaceResetAt(companyB),
  ]);

  const [allFilingsA, allFilingsB] = await Promise.all([
    loadAllFilings(companyA),
    loadAllFilings(companyB),
  ]);

  const filingsA = filterFilingsForWorkspace(allFilingsA, resetAtA);
  const filingsB = filterFilingsForWorkspace(allFilingsB, resetAtB);

  if (filingsA.length === 0) {
    throw new CompanyComparisonRequestError(
      404,
      `No analyzed filings found for ${companyA}.`
    );
  }

  if (filingsB.length === 0) {
    throw new CompanyComparisonRequestError(
      404,
      `No analyzed filings found for ${companyB}.`
    );
  }

  const selectedA = pickFilingByPeriod(filingsA, periodEndA);
  const selectedB = pickFilingByPeriod(filingsB, periodEndB);

  if (!selectedA || !selectedB) {
    throw new CompanyComparisonRequestError(
      500,
      "Could not select filings for comparison."
    );
  }

  const normalizedA = normalizeMetrics(selectedA, filingsA.length);
  const normalizedB = normalizeMetrics(selectedB, filingsB.length);
  const rows = buildComparisonRows(normalizedA, normalizedB);
  const charts = buildComparisonCharts(normalizedA, normalizedB);

  const historyA = filingsA
    .map((filing) => normalizeMetrics(filing, filingsA.length))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const historyB = filingsB
    .map((filing) => normalizeMetrics(filing, filingsB.length))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  const trends = buildComparisonTrends(historyA, historyB);
  const warnings = buildComparisonWarnings(normalizedA, normalizedB);
  const report = buildComparisonReport(normalizedA, normalizedB, trends, warnings);
  const segmentComparison = buildSegmentComparisonRows(selectedA, selectedB);
  const methodologyComparison = buildMethodologyComparison(
    selectedA,
    selectedB,
    normalizedA,
    normalizedB
  );
  const relativePerformance = buildRelativePerformance(trends);
  const boardInsights = buildBoardInsights(normalizedA, normalizedB, trends);
  const narrative = buildComparisonNarrative(
    normalizedA,
    normalizedB,
    trends,
    warnings,
    relativePerformance,
    methodologyComparison
  );

  return {
    companyA: normalizedA,
    companyB: normalizedB,
    rows,
    charts,
    trends,
    warnings,
    report,
    segmentComparison,
    methodologyComparison,
    relativePerformance,
    boardInsights,
    narrative,
    generatedAt: new Date().toISOString(),
  };
}
