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
  buildMinimalMultiNarrative,
  buildMultiComparisonBarData,
  buildMultiComparisonRows,
  buildMultiComparisonTrends,
  buildMultiComparisonWarnings,
  buildMultiMarginGapBarRows,
  buildRelativePerformance,
  buildSegmentComparisonRows,
  normalizeMetrics,
  type CompanyComparisonPayload,
} from "@/lib/companyComparison";
import {
  filterFilingsForWorkspace,
  getWorkspaceResetAt,
} from "@/lib/workspaceReset";
import type { Filing } from "@/types/competitor";

export class CompanyComparisonRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "CompanyComparisonRequestError";
  }
}

const MAX_COMPANIES = 7;

export interface BuildCompanyComparisonPayloadInput {
  companyA?: string | null;
  companyB?: string | null;
  /** Comma-separated tickers (2–7). When set, takes precedence over companyA/companyB. */
  tickers?: string | null;
  periodEndA?: string | null;
  periodEndB?: string | null;
  /** Single period end applied to every ticker when no per-ticker list is given */
  periodEnd?: string | null;
  /** Comma-separated period ends, same length and order as tickers= */
  periodEnds?: string | null;
}

function pickFilingByPeriod(
  filings: Awaited<ReturnType<typeof loadAllFilings>>,
  periodEnd?: string | null
) {
  if (!periodEnd) return filings[0] ?? null;
  return filings.find((filing) => filing.periodEnd === periodEnd) ?? filings[0] ?? null;
}

function resolveTickerList(input: BuildCompanyComparisonPayloadInput): string[] {
  const fromParam = input.tickers?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
  if (fromParam.length > 0) {
    return fromParam;
  }

  const a = input.companyA?.trim().toUpperCase();
  const b = input.companyB?.trim().toUpperCase();
  if (a && b) return [a, b];
  return [];
}

function periodEndForTicker(
  input: BuildCompanyComparisonPayloadInput,
  index: number,
  tickerCount: number
): string | undefined {
  const csv = input.periodEnds
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (csv && csv.length === tickerCount) {
    return csv[index] || undefined;
  }
  if (input.periodEnd?.trim()) {
    return input.periodEnd.trim();
  }
  if (tickerCount === 2) {
    if (index === 0) return input.periodEndA?.trim() || undefined;
    return input.periodEndB?.trim() || undefined;
  }
  return undefined;
}

function sortFilingsDesc(filings: Filing[]): Filing[] {
  return [...filings].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

function buildPairCompanyComparisonPayloadFromWorkspaces(
  tickers: [string, string],
  input: BuildCompanyComparisonPayloadInput,
  filingsA: Filing[],
  filingsB: Filing[],
): CompanyComparisonPayload {
  const companyA = tickers[0];
  const companyB = tickers[1];
  const periodEndA = periodEndForTicker(input, 0, 2);
  const periodEndB = periodEndForTicker(input, 1, 2);

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
    throw new CompanyComparisonRequestError(500, "Could not select filings for comparison.");
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

function buildMultiCompanyComparisonPayloadFromWorkspaces(
  tickers: string[],
  input: BuildCompanyComparisonPayloadInput,
  workspaces: Filing[][],
): CompanyComparisonPayload {
  const count = tickers.length;

  for (let i = 0; i < tickers.length; i++) {
    if (workspaces[i].length === 0) {
      throw new CompanyComparisonRequestError(
        404,
        `No analyzed filings found for ${tickers[i]}.`
      );
    }
  }

  const selectedFilings = tickers.map((_, index) =>
    pickFilingByPeriod(workspaces[index], periodEndForTicker(input, index, count))
  );

  if (selectedFilings.some((filing) => !filing)) {
    throw new CompanyComparisonRequestError(500, "Could not select filings for comparison.");
  }

  const normalized = selectedFilings.map((filing, index) =>
    normalizeMetrics(filing!, workspaces[index].length)
  );

  const histories = tickers.map((ticker, index) => ({
    ticker,
    history: workspaces[index]
      .map((filing) => normalizeMetrics(filing, workspaces[index].length))
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)),
  }));

  const normalizedA = normalized[0];
  const normalizedB = normalized[1];
  const firstFiling = selectedFilings[0]!;
  const secondFiling = selectedFilings[1]!;

  const rows = buildComparisonRows(normalizedA, normalizedB);
  const charts = buildComparisonCharts(normalizedA, normalizedB);
  const trends = buildComparisonTrends(histories[0].history, histories[1].history);
  const warnings = buildMultiComparisonWarnings(normalized);
  const report = buildComparisonReport(normalizedA, normalizedB, trends, warnings);
  const segmentComparison = buildSegmentComparisonRows(firstFiling, secondFiling);
  const methodologyComparison = buildMethodologyComparison(
    firstFiling,
    secondFiling,
    normalizedA,
    normalizedB
  );
  const relativePerformance = buildRelativePerformance(trends);
  const boardInsights = buildBoardInsights(normalizedA, normalizedB, trends);
  const narrative = buildMinimalMultiNarrative(normalized);

  const barData = buildMultiComparisonBarData(normalized);
  const multiMarginGapBars = buildMultiMarginGapBarRows(normalized);

  const multiMethodologyNotes: string[] = [];
  for (let i = 0; i < selectedFilings.length; i++) {
    const variants = selectedFilings[i]!.analysis.methodologyVariants ?? [];
    if (variants.length > 1) {
      multiMethodologyNotes.push(
        `${tickers[i]} reports ${variants.length} methodology variants; quarter comparability may be affected.`
      );
    }
  }

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
    comparisonMode: "multi",
    multiCompanies: normalized,
    multiRows: buildMultiComparisonRows(normalized),
    multiTrends: buildMultiComparisonTrends(histories),
    multiFinancialBars: barData.financialBars,
    multiMarginBars: barData.marginBars,
    multiMarginGapBars,
    multiCashFlowBars: barData.cashFlowBars,
    multiDriverBars: barData.driverBars,
    multiMethodologyNotes,
  };
}

async function buildPairCompanyComparisonPayload(
  tickers: [string, string],
  input: BuildCompanyComparisonPayloadInput
): Promise<CompanyComparisonPayload> {
  const companyA = tickers[0];
  const companyB = tickers[1];

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

  return buildPairCompanyComparisonPayloadFromWorkspaces(
    tickers,
    input,
    filingsA,
    filingsB
  );
}

async function buildMultiCompanyComparisonPayload(
  tickers: string[],
  input: BuildCompanyComparisonPayloadInput
): Promise<CompanyComparisonPayload> {
  const resetAts = await Promise.all(tickers.map((ticker) => getWorkspaceResetAt(ticker)));
  const allFilings = await Promise.all(tickers.map((ticker) => loadAllFilings(ticker)));
  const workspaces = allFilings.map((filings, index) =>
    filterFilingsForWorkspace(filings, resetAts[index])
  );

  return buildMultiCompanyComparisonPayloadFromWorkspaces(
    tickers,
    input,
    workspaces
  );
}

export async function buildCompanyComparisonPayload(
  input: BuildCompanyComparisonPayloadInput
): Promise<CompanyComparisonPayload> {
  const rawTickers = resolveTickerList(input);
  const tickers = [...new Set(rawTickers)];

  if (rawTickers.length !== tickers.length) {
    throw new CompanyComparisonRequestError(400, "Duplicate tickers in comparison list.");
  }

  if (tickers.length < 2) {
    throw new CompanyComparisonRequestError(
      400,
      "Provide at least two tickers (use ?tickers=A,B,C or ?companyA=&companyB=)."
    );
  }

  if (tickers.length > MAX_COMPANIES) {
    throw new CompanyComparisonRequestError(
      400,
      `You can compare at most ${MAX_COMPANIES} companies at once.`
    );
  }

  const csv = input.periodEnds
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (csv && csv.length > 0 && csv.length !== tickers.length) {
    throw new CompanyComparisonRequestError(
      400,
      `periodEnds must have the same number of entries as tickers (${tickers.length}), or be omitted.`
    );
  }

  if (tickers.length === 2) {
    return buildPairCompanyComparisonPayload([tickers[0], tickers[1]], input);
  }

  return buildMultiCompanyComparisonPayload(tickers, input);
}

export async function buildCompanyComparisonPayloadFromFilings(
  input: BuildCompanyComparisonPayloadInput & { filings: Filing[] }
): Promise<CompanyComparisonPayload> {
  const rawTickers = resolveTickerList(input);
  const tickers = [...new Set(rawTickers)];

  if (rawTickers.length !== tickers.length) {
    throw new CompanyComparisonRequestError(400, "Duplicate tickers in comparison list.");
  }

  if (tickers.length < 2) {
    throw new CompanyComparisonRequestError(
      400,
      "Provide at least two tickers for the Excel-processed comparison."
    );
  }

  if (tickers.length > MAX_COMPANIES) {
    throw new CompanyComparisonRequestError(
      400,
      `You can compare at most ${MAX_COMPANIES} companies at once.`
    );
  }

  const csv = input.periodEnds
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (csv && csv.length > 0 && csv.length !== tickers.length) {
    throw new CompanyComparisonRequestError(
      400,
      `periodEnds must have the same number of entries as tickers (${tickers.length}), or be omitted.`
    );
  }

  const grouped = new Map<string, Filing[]>();
  for (const filing of input.filings) {
    const ticker = filing.ticker.trim().toUpperCase();
    if (!grouped.has(ticker)) grouped.set(ticker, []);
    grouped.get(ticker)!.push(filing);
  }

  const workspaces = tickers.map((ticker) => sortFilingsDesc(grouped.get(ticker) ?? []));

  if (tickers.length === 2) {
    return buildPairCompanyComparisonPayloadFromWorkspaces(
      [tickers[0], tickers[1]],
      input,
      workspaces[0],
      workspaces[1]
    );
  }

  return buildMultiCompanyComparisonPayloadFromWorkspaces(tickers, input, workspaces);
}
