import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractMetrics } from "@/lib/analysisModules";
import { normalizeWorkbookSnapshot } from "@/lib/dataSourceWorkbookSnapshot";
import { normalizeCompanyName } from "@/lib/filingIdentity";
import type { DataSourceMetricTrace, DataSourceRow } from "@/types/dataSource";
import type { Filing } from "@/types/competitor";
import type { FullAnalysis } from "@/types/analysis";
import type { ChatThreadSummary, DataSourceWorkbookSnapshot } from "@/types/chatThread";
import { applyDataSourceOverridesToAnalysis } from "@/lib/dataSourceOverrides";
import type {
  DataSourceEditLogEntry,
  DataSourceWorkbookCellPayload,
  DataSourceWorkbookCellState,
  DataSourceWorkbookTickerState,
} from "@/types/dataSourceWorkbook";
import { groupWorkbookCellsByTicker, normalizeCellState } from "@/lib/dataSourceWorkbook";
import { requireAdminUser } from "@/lib/serverAuth";

export const runtime = "nodejs";

function isMissingWorkbookThreadSchema(message: string | undefined): boolean {
  if (!message) return false;
  return [
    "company_name",
    "company_ticker",
    "source_thread_id",
    "workbook_snapshot",
    "data-source-workbook",
    "kind",
  ].some((token) => message.includes(token));
}

type AdjustmentPayload = {
  dataSourceOverrides?: Record<string, Record<string, number | null>>;
  dataSourceWorkbook?: DataSourceWorkbookTickerState;
  dataSourceEditLog?: DataSourceEditLogEntry[];
} | null | undefined;

type WorkbookThreadRow = {
  id: string;
  title: string;
  company_ticker: string | null;
  company_name: string | null;
  workbook_snapshot: unknown;
  updated_at: string;
};

const TRACE_TAGS_BY_FIELD: Record<string, string[]> = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  costOfRevenue: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold", "CostOfSales"],
  grossProfit: ["GrossProfit"],
  operatingExpenses: ["OperatingExpenses"],
  rdExpense: ["ResearchAndDevelopmentExpense"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  incomeTax: ["IncomeTaxExpenseBenefit", "IncomeTaxExpense"],
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  totalEquity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  totalDebt: ["LongTermDebt", "LongTermDebtCurrent", "ShortTermBorrowings", "Debt"],
  shortTermDebt: ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  netDebt: ["TotalNetDebtSupplemental", "LongTermDebt", "DebtCurrent", "CashAndCashEquivalentsAtCarryingValue"],
  cashAndEquivalents: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  shortTermInvestments: ["ShortTermInvestments"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  workingCapital: ["AssetsCurrent", "LiabilitiesCurrent"],
  inventory: ["InventoryNet", "Inventory"],
  accountsReceivable: ["AccountsReceivableNetCurrent", "AccountsReceivableNet"],
  accountsPayable: ["AccountsPayableCurrent", "AccountsPayable"],
  accruedLiabilities: ["AccruedLiabilitiesCurrent"],
  deferredRevenue: ["DeferredRevenueCurrent"],
  propertyPlantEquipment: ["PropertyPlantAndEquipmentNet"],
  goodwill: ["Goodwill"],
  intangibleAssets: ["IntangibleAssetsNet"],
  operatingLeaseLiabilities: ["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent"],
  financeLeaseLiabilities: ["FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent"],
  leaseAdjustedDebt: ["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent", "FinanceLeaseLiabilityCurrent", "GrossDebt"],
  leaseAdjustedNetDebt: ["OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent", "CashAndCashEquivalentsAtCarryingValue", "GrossDebt"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"],
  freeCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment"],
  shareRepurchases: ["PaymentsForRepurchaseOfCommonStock"],
  investingCashFlow: ["NetCashProvidedByUsedInInvestingActivities", "NetCashProvidedByInvestingActivities"],
  financingCashFlow: ["NetCashProvidedByUsedInFinancingActivities", "NetCashProvidedByFinancingActivities"],
  debtIssued: ["ProceedsFromIssuanceOfLongTermDebt", "ProceedsFromDebt"],
  debtRepaid: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt", "RepaymentsOfShortTermDebt", "RepaymentsOfCommercialPaper"],
  sgaExpense: ["SellingGeneralAndAdministrativeExpense"],
  depreciation: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
  ebit: ["OperatingIncomeLoss"],
  ebitda: ["OperatingIncomeLoss", "DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
  interestExpense: ["InterestExpenseNonOperating", "InterestExpense"],
  epsBasic: ["EarningsPerShareBasic"],
  epsDiluted: ["EarningsPerShareDiluted"],
  weightedAverageSharesBasic: ["WeightedAverageSharesBasic"],
  weightedAverageSharesDiluted: ["WeightedAverageSharesDiluted"],
  shareBasedComp: ["ShareBasedCompensation"],
  dividendsPaid: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
};

const NORMALIZED_CALC_BY_FIELD: Record<string, string> = {
  grossProfit: "Gross profit from filing line; if unavailable, revenue minus cost of revenue.",
  totalDebt: "Short-term debt plus long-term debt, normalized to USD millions.",
  freeCashFlow: "Operating cash flow minus capital expenditures.",
  shareRepurchases: "Cash used for common share repurchases.",
  investingCashFlow: "Net cash provided by or used in investing activities.",
  financingCashFlow: "Net cash provided by or used in financing activities.",
  grossMargin: "Gross profit divided by revenue.",
  operatingMargin: "Operating income divided by revenue.",
  netMargin: "Net income divided by revenue.",
  debtToEquity: "Total debt divided by total equity.",
  debtToCapital: "Total debt divided by total debt plus equity.",
  netDebt: "Total debt minus cash and equivalents.",
  netDebtToEbitda: "Net debt divided by EBITDA.",
  interestCoverage: "EBITDA or operating income divided by interest expense.",
  currentRatio: "Current assets divided by current liabilities when available from extraction.",
  workingCapital: "Current assets minus current liabilities.",
  workingCapitalRatio: "Working capital divided by revenue.",
  daysSalesOutstanding: "Accounts receivable divided by revenue, multiplied by 90 days for quarterly rows.",
  daysInventoryOutstanding: "Inventory divided by cost of revenue, multiplied by 90 days for quarterly rows.",
  daysPayableOutstanding: "Accounts payable divided by cost of revenue, multiplied by 90 days for quarterly rows.",
  cashConversionCycle: "DSO plus DIO minus DPO.",
  effectiveTaxRate: "Income tax divided by pretax income when available.",
  capexAsPercentRevenue: "Capital expenditures divided by revenue.",
  dividendPayoutRatio: "Dividends paid divided by net income.",
  buybackPayoutRatio: "Share repurchases divided by net income.",
  totalPayoutRatio: "Dividends plus buybacks divided by net income.",
  leaseAdjustedDebt: "Total debt plus lease obligations not already captured in gross debt.",
  leaseAdjustedNetDebt: "Lease-adjusted debt minus cash and equivalents.",
  leaseAdjustedDebtToEbitda: "Lease-adjusted debt divided by EBITDA.",
  leaseAdjustedNetDebtToEbitda: "Lease-adjusted net debt divided by EBITDA.",
  inventoryTurnover: "Cost of revenue divided by inventory.",
  receivablesTurnover: "Revenue divided by accounts receivable.",
  assetTurnover: "Revenue divided by total assets.",
  ebit: "Operating income used as EBIT proxy unless a direct EBIT line exists.",
  ebitda: "EBIT plus depreciation and amortization.",
  ebitdaMargin: "EBITDA divided by revenue.",
  roic: "NOPAT divided by invested capital, using filing-derived ROIC when available.",
  roe: "Net income divided by total equity.",
  roa: "Net income divided by total assets.",
  fcfMargin: "Free cash flow divided by revenue.",
  fcfConversion: "Free cash flow divided by net income.",
  opPerHead: "Operating income divided by heads processed.",
  opPerCwt: "Operating income divided by hundredweight volume.",
  adjustedOperatingIncome: "Operating income adjusted for non-comparable add-backs and removals.",
  adjustedOperatingMargin: "Adjusted operating income divided by revenue.",
  adjustedOpPerHead: "Adjusted operating income divided by heads processed.",
  adjustedOpPerCwt: "Adjusted operating income divided by hundredweight volume.",
  sgaAsPercent: "Absolute SG&A divided by revenue.",
};

function buildMetricTraceMap(
  analysis: FullAnalysis,
  values: Record<string, number | string | null | undefined>,
): Record<string, DataSourceMetricTrace> {
  const items = [
    ...(analysis.cfItems ?? []),
    ...(analysis.balanceSheet?.items ?? []),
    ...(analysis.debtStructure?.items ?? []),
  ];
  const defaultConfidence = analysis.meta.confidence ?? (analysis.meta.source === "sec" ? "high" : "medium");
  const defaultSource =
    analysis.meta.source === "sec"
      ? "SEC XBRL / company filing"
      : `${analysis.meta.extractionMethod ?? "PDF extraction"} / company filing`;

  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => {
      const tags = TRACE_TAGS_BY_FIELD[field] ?? [];
      const matchedItems = items.filter((item) =>
        tags.some((tag) => item.tag.toLowerCase().includes(tag.toLowerCase())),
      );
      const primary = matchedItems[0] ?? null;
      const label = primary?.label ?? field;
      const source = primary?.source ?? defaultSource;
      const confidence = primary?.confidence ?? defaultConfidence;
      const statement = primary
        ? `${label} from ${primary.period || analysis.meta.periodEnd || "the reported period"}`
        : `${field} normalized by the workbook engine`;
      const originalText = primary
        ? `${primary.label} (${primary.tag}) • ${primary.source}`
        : (analysis.meta.rawFilingText?.slice(0, 240) ?? "No exact source line stored for this computed workbook field.");
      const normalizedCalculation =
        NORMALIZED_CALC_BY_FIELD[field] ??
        (primary
          ? `Direct extraction normalized to ${typeof value === "number" ? "USD millions where applicable" : "reported text"}.`
          : "Workbook field carried forward from normalized filing metrics.");

      return [field, {
        label,
        value: value ?? null,
        source,
        confidence,
        statement,
        originalText,
        normalizedCalculation,
      }];
    }),
  );
}

function ratioNumber(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function roundOne(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

function daysMetric(numerator: number | null, denominator: number | null, days = 90): number | null {
  const ratio = ratioNumber(numerator, denominator);
  return roundOne(ratio != null ? ratio * days : null);
}

function sumNullable(...values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return present.length > 0 ? roundRatio(present.reduce((sum, value) => sum + value, 0), 2) : null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createAuthedClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

async function requireUserId(
  req: NextRequest,
): Promise<{ userId: string; token: string } | NextResponse> {
  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { userId: data.user.id, token };
}

async function tryRequireUserId(req: NextRequest): Promise<{ userId: string; token: string } | null> {
  const authHeader = req.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;

  return { userId: data.user.id, token };
}

function normalizeEditLogEntries(
  ticker: string,
  entries: unknown,
): DataSourceEditLogEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as DataSourceEditLogEntry).at !== "string" ||
      typeof (entry as DataSourceEditLogEntry).field !== "string" ||
      typeof (entry as DataSourceEditLogEntry).periodEnd !== "string"
    ) {
      return [];
    }

    return [{
      ...(entry as DataSourceEditLogEntry),
      ticker: (entry as DataSourceEditLogEntry).ticker ?? ticker,
    }];
  });
}

async function loadCompanyMap(companyTicker?: string) {
  let query = supabase
    .from("companies")
    .select("ticker, name, peer_type");

  if (companyTicker) {
    query = query.eq("ticker", companyTicker);
  }

  const { data: companies } = await query;
  const companyMap = new Map<string, { name: string; peerType: string }>();

  for (const company of companies ?? []) {
    companyMap.set(company.ticker, {
      name: company.name,
      peerType: company.peer_type ?? "diversified-protein",
    });
  }

  return companyMap;
}

async function loadAvailableCompanies() {
  const companyMap = await loadCompanyMap();
  const { data: filings, error } = await supabase
    .from("filings")
    .select("ticker, analysis")
    .order("ticker");

  if (error) return [];

  const companies = new Map<string, { ticker: string; companyName: string }>();
  for (const filing of filings ?? []) {
    const ticker = typeof filing.ticker === "string" ? filing.ticker.trim().toUpperCase() : "";
    if (!ticker || companies.has(ticker)) continue;

    const analysis = filing.analysis as FullAnalysis | null;
    const company = companyMap.get(ticker);
    const companyName = normalizeCompanyName({
      candidate: analysis?.meta.companyName ?? company?.name ?? ticker,
      fileName: analysis?.meta.fileName,
      ticker,
    });

    companies.set(ticker, { ticker, companyName });
  }

  return [...companies.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

async function loadGlobalAdjustmentMaps() {
  const { data: adjustments } = await supabase
    .from("adjustments")
    .select("ticker, data");

  const overrideMap = new Map<string, Record<string, Record<string, number | null>>>();
  const workbookStateMap = new Map<string, DataSourceWorkbookTickerState>();
  const editLog: DataSourceEditLogEntry[] = [];

  for (const adjustment of adjustments ?? []) {
    const payload = adjustment.data as AdjustmentPayload;
    if (payload?.dataSourceOverrides) {
      overrideMap.set(adjustment.ticker, clone(payload.dataSourceOverrides));
    }
    if (payload?.dataSourceWorkbook) {
      workbookStateMap.set(adjustment.ticker, clone(payload.dataSourceWorkbook));
    }
    editLog.push(...normalizeEditLogEntries(adjustment.ticker, payload?.dataSourceEditLog));
  }

  editLog.sort((a, b) => b.at.localeCompare(a.at));
  return { overrideMap, workbookStateMap, editLog };
}

function buildThreadAdjustmentMaps(
  companyTicker: string,
  snapshot: DataSourceWorkbookSnapshot,
) {
  const overrideMap = new Map<string, Record<string, Record<string, number | null>>>();
  const workbookStateMap = new Map<string, DataSourceWorkbookTickerState>();

  if (snapshot.dataSourceOverrides) {
    overrideMap.set(companyTicker, clone(snapshot.dataSourceOverrides));
  }
  if (snapshot.dataSourceWorkbook) {
    workbookStateMap.set(companyTicker, clone(snapshot.dataSourceWorkbook));
  }

  const editLog = normalizeEditLogEntries(companyTicker, snapshot.dataSourceEditLog);
  editLog.sort((a, b) => b.at.localeCompare(a.at));

  return { overrideMap, workbookStateMap, editLog };
}

async function requireWorkbookThread(
  req: NextRequest,
  threadId: string,
): Promise<
  | {
      userId: string;
      token: string;
      db: ReturnType<typeof createAuthedClient>;
      thread: WorkbookThreadRow;
    }
  | NextResponse
> {
  const result = await requireUserId(req);
  if (result instanceof NextResponse) return result;

  const db = createAuthedClient(result.token);
  const { data, error } = await db
    .from("chat_threads")
    .select("id, title, company_ticker, company_name, workbook_snapshot, updated_at")
    .eq("id", threadId)
    .eq("user_id", result.userId)
    .eq("kind", "data-source-workbook")
    .maybeSingle();

  if (error) {
    if (isMissingWorkbookThreadSchema(error.message)) {
      return NextResponse.json({
        error: "Workbook threads need the latest chat schema. Run supabase-chat-schema.sql in Supabase SQL Editor, then refresh.",
        migrationRequired: true,
        migrationFile: "supabase-chat-schema.sql",
        schemaReady: false,
      }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return {
    userId: result.userId,
    token: result.token,
    db,
    thread: data,
  };
}

function buildAvailableCompanies(rows: DataSourceRow[]) {
  return Array.from(
    rows.reduce<Map<string, { ticker: string; companyName: string }>>((acc, row) => {
      if (!acc.has(row.ticker)) {
        acc.set(row.ticker, {
          ticker: row.ticker,
          companyName: row.companyName,
        });
      }
      return acc;
    }, new Map()),
  )
    .map(([, company]) => company)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function findAnalysisItemValue(
  analysis: FullAnalysis,
  ...tags: string[]
): number | null {
  const items = [
    ...(analysis.cfItems ?? []),
    ...(analysis.balanceSheet?.items ?? []),
    ...(analysis.debtStructure?.items ?? []),
  ];
  for (const tag of tags) {
    const item = items.find((entry) => entry.tag === tag);
    if (typeof item?.value === "number" && Number.isFinite(item.value)) {
      return item.value;
    }
  }
  return null;
}

function roundRatio(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return roundRatio((numerator / denominator) * 100, 1);
}

async function loadWorkbookThreadsNavigator(req: NextRequest): Promise<{
  threads: ChatThreadSummary[];
  schemaReady: boolean;
  threadSchemaMessage: string | null;
}> {
  const auth = await tryRequireUserId(req);
  if (!auth) {
    return { threads: [], schemaReady: true, threadSchemaMessage: null };
  }

  const db = createAuthedClient(auth.token);
  const { data, error } = await db
    .from("chat_threads")
    .select("id, title, created_at, updated_at, kind, company_ticker, company_name, source_thread_id")
    .eq("user_id", auth.userId)
    .eq("kind", "data-source-workbook")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingWorkbookThreadSchema(error.message)) {
      return {
        threads: [],
        schemaReady: false,
        threadSchemaMessage: error.message,
      };
    }

    throw error;
  }

  return {
    threads: (data ?? []).map((thread) => ({
      id: thread.id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      kind: "data-source-workbook",
      companyTicker: thread.company_ticker ?? null,
      companyName: thread.company_name ?? null,
      sourceThreadId: thread.source_thread_id ?? null,
    })),
    schemaReady: true,
    threadSchemaMessage: null,
  };
}

async function buildWorkbookResponse({
  companyTicker,
  snapshot,
  threadMeta,
  availableCompanies,
  workbookThreads,
  schemaReady,
  threadSchemaMessage,
  selectedCompanyTicker,
  selectedThreadId,
}: {
  companyTicker?: string;
  snapshot?: DataSourceWorkbookSnapshot;
  threadMeta?: {
    id: string;
    title: string;
    companyTicker: string | null;
    companyName: string | null;
    updatedAt: string;
  };
  availableCompanies?: Array<{ ticker: string; companyName: string }>;
  workbookThreads?: ChatThreadSummary[];
  schemaReady?: boolean;
  threadSchemaMessage?: string | null;
  selectedCompanyTicker?: string | null;
  selectedThreadId?: string | null;
}) {
  let filingsQuery = supabase
    .from("filings")
    .select("id, ticker, period_end, fiscal_year, fiscal_quarter, quarter_label, source, analysis, saved_at")
    .order("ticker")
    .order("period_end", { ascending: false });

  if (companyTicker) {
    filingsQuery = filingsQuery.eq("ticker", companyTicker);
  }

  const { data: filings, error } = await filingsQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companyMap = await loadCompanyMap(companyTicker);
  const { overrideMap, workbookStateMap, editLog } =
    companyTicker && snapshot
      ? buildThreadAdjustmentMaps(companyTicker, snapshot)
      : await loadGlobalAdjustmentMaps();

  const rows: DataSourceRow[] = [];
  const workbookCells: Record<string, Record<string, DataSourceWorkbookCellState>> = {};
  for (const filingRow of filings ?? []) {
    const analysis = filingRow.analysis as FullAnalysis;
    if (!analysis) continue;

    const company = companyMap.get(filingRow.ticker);
    const displayName = normalizeCompanyName({
      candidate: analysis.meta.companyName ?? company?.name ?? filingRow.ticker,
      fileName: analysis.meta.fileName,
      ticker: filingRow.ticker,
    });
    const peerType = (company?.peerType ?? "diversified-protein") as import("@/types/competitor").PeerType;

    const filing: Filing = {
      ticker: filingRow.ticker,
      periodEnd: filingRow.period_end,
      source: filingRow.source ?? "sec",
      filingType: "10-Q",
      filingDate: "",
      savedAt: "",
      analysis,
      quarter:
        typeof filingRow.fiscal_year === "number" && typeof filingRow.fiscal_quarter === "number"
          ? {
              periodEnd: filingRow.period_end,
              fiscalYear: filingRow.fiscal_year,
              fiscalQuarter: filingRow.fiscal_quarter,
              label:
                typeof filingRow.quarter_label === "string" && filingRow.quarter_label.trim()
                  ? filingRow.quarter_label
                  : `Q${filingRow.fiscal_quarter} ${filingRow.fiscal_year}`,
            }
          : undefined,
    };

    const metrics = extractMetrics(filing, peerType);
    const cfItems = analysis.cfItems ?? [];
    const depItem = cfItems.find((item) =>
      item.tag === "DepreciationDepletionAndAmortization" ||
      item.tag === "DepreciationAndAmortization" ||
      item.tag === "Depreciation",
    );
    const sbcItem = cfItems.find((item) => item.tag === "ShareBasedCompensation");

    const ebit = metrics.operatingIncome;
    const ebitda = ebit != null && depItem?.value != null ? ebit + Math.abs(depItem.value) : null;
    const ebitdaMargin = ebitda != null && metrics.revenue != null && metrics.revenue > 0
      ? parseFloat(((ebitda / metrics.revenue) * 100).toFixed(1))
      : null;

    const overrides = overrideMap.get(filingRow.ticker)?.[filingRow.period_end] ?? {};
    const rawSga = overrides.sgaExpense ?? metrics.sgaExpense;
    const rawRevenue = overrides.revenue ?? metrics.revenue;
    const rawOperatingIncome = overrides.operatingIncome ?? metrics.operatingIncome;
    const costOfRevenue = overrides.costOfRevenue ?? analysis.incomeStatement?.costOfRevenue ?? metrics.costOfRevenue ?? null;
    const operatingExpenses = overrides.operatingExpenses ?? analysis.incomeStatement?.operatingExpenses ?? null;
    const rdExpense = overrides.rdExpense ?? analysis.incomeStatement?.rdExpense ?? null;
    const incomeTax = overrides.incomeTax ?? analysis.incomeStatement?.incomeTax ?? null;
    const shortTermDebt = overrides.shortTermDebt ?? analysis.debtStructure?.shortTermDebt ?? null;
    const longTermDebt = overrides.longTermDebt ?? analysis.debtStructure?.longTermDebt ?? null;
    const netDebt = overrides.netDebt ?? metrics.netDebt ?? analysis.debtStructure?.netDebt ?? null;
    const shortTermInvestments = overrides.shortTermInvestments ?? findAnalysisItemValue(analysis, "ShortTermInvestments");
    const currentAssets = overrides.currentAssets ?? findAnalysisItemValue(analysis, "AssetsCurrent");
    const currentLiabilities = overrides.currentLiabilities ?? findAnalysisItemValue(analysis, "LiabilitiesCurrent");
    const workingCapital = overrides.workingCapital ?? analysis.ratios?.workingCapital ?? (
      currentAssets != null && currentLiabilities != null ? roundRatio(currentAssets - currentLiabilities, 2) : null
    );
    const inventory = overrides.inventory ?? findAnalysisItemValue(analysis, "InventoryNet", "Inventory");
    const accountsReceivable = overrides.accountsReceivable ?? findAnalysisItemValue(analysis, "AccountsReceivableNetCurrent", "AccountsReceivableNet");
    const accountsPayable = overrides.accountsPayable ?? findAnalysisItemValue(analysis, "AccountsPayableCurrent", "AccountsPayable");
    const accruedLiabilities = overrides.accruedLiabilities ?? findAnalysisItemValue(analysis, "AccruedLiabilitiesCurrent");
    const deferredRevenue = overrides.deferredRevenue ?? findAnalysisItemValue(analysis, "DeferredRevenueCurrent");
    const propertyPlantEquipment = overrides.propertyPlantEquipment ?? findAnalysisItemValue(analysis, "PropertyPlantAndEquipmentNet");
    const goodwill = overrides.goodwill ?? findAnalysisItemValue(analysis, "Goodwill");
    const intangibleAssets = overrides.intangibleAssets ?? findAnalysisItemValue(analysis, "IntangibleAssetsNet");
    const operatingLeaseLiabilities =
      overrides.operatingLeaseLiabilities ??
      analysis.debtStructure?.operatingLeaseLiabilities ??
      sumNullable(
        findAnalysisItemValue(analysis, "OperatingLeaseLiabilityCurrent"),
        findAnalysisItemValue(analysis, "OperatingLeaseLiabilityNoncurrent"),
      );
    const financeLeaseLiabilities =
      overrides.financeLeaseLiabilities ??
      analysis.debtStructure?.financeLeaseLiabilities ??
      sumNullable(
        findAnalysisItemValue(analysis, "FinanceLeaseLiabilityCurrent"),
        findAnalysisItemValue(analysis, "FinanceLeaseLiabilityNoncurrent"),
      );
    const leaseAdjustedDebt =
      overrides.leaseAdjustedDebt ??
      analysis.debtStructure?.leaseAdjustedDebt ??
      (metrics.totalDebt != null && operatingLeaseLiabilities != null
        ? roundRatio(metrics.totalDebt + operatingLeaseLiabilities, 2)
        : null);
    const leaseAdjustedNetDebt =
      overrides.leaseAdjustedNetDebt ??
      analysis.debtStructure?.leaseAdjustedNetDebt ??
      (netDebt != null && operatingLeaseLiabilities != null
        ? roundRatio(netDebt + operatingLeaseLiabilities, 2)
        : null);
    const shareRepurchases = overrides.shareRepurchases ?? analysis.cashFlow?.shareRepurchases ?? null;
    const investingCashFlow = overrides.investingCashFlow ?? analysis.cashFlow?.investingCashFlow ?? null;
    const financingCashFlow = overrides.financingCashFlow ?? analysis.cashFlow?.financingCashFlow ?? null;
    const debtIssued = overrides.debtIssued ?? analysis.cashFlow?.debtIssued ?? null;
    const debtRepaid = overrides.debtRepaid ?? analysis.cashFlow?.debtRepaid ?? null;
    const debtToCapital = overrides.debtToCapital ?? analysis.ratios?.debtToCapital ?? null;
    const netDebtToEbitda = overrides.netDebtToEbitda ?? analysis.ratios?.netDebtToEbitda ?? null;
    const interestCoverage = overrides.interestCoverage ?? metrics.interestCoverage ?? analysis.ratios?.interestCoverage ?? null;
    const roic = overrides.roic ?? analysis.ratios?.returnOnInvestedCapital ?? null;
    const assetTurnover = overrides.assetTurnover ?? analysis.ratios?.assetTurnover ?? null;
    const inventoryTurnover = overrides.inventoryTurnover ?? analysis.ratios?.inventoryTurnover ?? null;
    const receivablesTurnover = overrides.receivablesTurnover ?? analysis.ratios?.receivablesTurnover ?? null;
    const daysSalesOutstanding = overrides.daysSalesOutstanding ?? analysis.ratios?.daysSalesOutstanding ?? daysMetric(accountsReceivable, rawRevenue);
    const daysInventoryOutstanding = overrides.daysInventoryOutstanding ?? analysis.ratios?.daysInventoryOutstanding ?? daysMetric(inventory, costOfRevenue);
    const daysPayableOutstanding = overrides.daysPayableOutstanding ?? analysis.ratios?.daysPayableOutstanding ?? daysMetric(accountsPayable, costOfRevenue);
    const cashConversionCycle = overrides.cashConversionCycle ?? analysis.ratios?.cashConversionCycle ?? (
      daysSalesOutstanding != null && daysInventoryOutstanding != null && daysPayableOutstanding != null
        ? roundOne(daysSalesOutstanding + daysInventoryOutstanding - daysPayableOutstanding)
        : null
    );
    const fcfConversion = overrides.fcfConversion ?? analysis.ratios?.fcfConversion ?? percent(metrics.freeCashFlow, metrics.netIncome);
    const workingCapitalRatio = overrides.workingCapitalRatio ?? analysis.ratios?.workingCapitalRatio ?? percent(workingCapital, rawRevenue);
    const effectiveTaxRate = overrides.effectiveTaxRate ?? analysis.ratios?.effectiveTaxRate ?? null;
    const capexAsPercentRevenue = overrides.capexAsPercentRevenue ?? analysis.ratios?.capexAsPercentRevenue ?? percent(metrics.capex, rawRevenue);
    const dividendPayoutRatio = overrides.dividendPayoutRatio ?? analysis.ratios?.dividendPayoutRatio ?? percent(metrics.dividendsPaid, metrics.netIncome);
    const buybackPayoutRatio = overrides.buybackPayoutRatio ?? analysis.ratios?.buybackPayoutRatio ?? percent(shareRepurchases, metrics.netIncome);
    const totalPayoutRatio = overrides.totalPayoutRatio ?? analysis.ratios?.totalPayoutRatio ?? percent(
      metrics.dividendsPaid != null || shareRepurchases != null
        ? (metrics.dividendsPaid ?? 0) + (shareRepurchases ?? 0)
        : null,
      metrics.netIncome,
    );
    const leaseAdjustedDebtToEbitda = overrides.leaseAdjustedDebtToEbitda ?? analysis.ratios?.leaseAdjustedDebtToEbitda ?? (
      leaseAdjustedDebt != null && ebitda != null && ebitda !== 0 ? roundRatio(leaseAdjustedDebt / ebitda, 1) : null
    );
    const leaseAdjustedNetDebtToEbitda = overrides.leaseAdjustedNetDebtToEbitda ?? analysis.ratios?.leaseAdjustedNetDebtToEbitda ?? (
      leaseAdjustedNetDebt != null && ebitda != null && ebitda !== 0 ? roundRatio(leaseAdjustedNetDebt / ebitda, 1) : null
    );
    const volumeHeads = (overrides.volumeHeads ?? null) as number | null;
    const volumeLbs = (overrides.volumeLbs ?? null) as number | null;
    const volumeCwt = (overrides.volumeCwt ?? (volumeLbs != null ? volumeLbs / 100 : null)) as number | null;
    const opPerHead = volumeHeads != null && rawOperatingIncome != null && volumeHeads > 0
      ? parseFloat(((rawOperatingIncome * 1000) / volumeHeads).toFixed(2))
      : null;
    const opPerCwt = volumeCwt != null && rawOperatingIncome != null && volumeCwt > 0
      ? parseFloat((rawOperatingIncome / volumeCwt).toFixed(2))
      : null;
    const ercAdjustment = (overrides.ercAdjustment ?? null) as number | null;
    const legalChargeAdjustment = (overrides.legalChargeAdjustment ?? null) as number | null;
    const transferValueAdjustment = (overrides.transferValueAdjustment ?? null) as number | null;
    const corporateAllocationAdjustment = (overrides.corporateAllocationAdjustment ?? null) as number | null;
    const adjustedOperatingIncome = rawOperatingIncome != null
      ? rawOperatingIncome
        - (ercAdjustment ?? 0)
        + (legalChargeAdjustment ?? 0)
        - (transferValueAdjustment ?? 0)
        + (corporateAllocationAdjustment ?? 0)
      : null;
    const adjustedOperatingMargin = adjustedOperatingIncome != null && rawRevenue != null && rawRevenue > 0
      ? parseFloat(((adjustedOperatingIncome / rawRevenue) * 100).toFixed(1))
      : null;
    const adjustedOpPerHead = volumeHeads != null && adjustedOperatingIncome != null && volumeHeads > 0
      ? parseFloat(((adjustedOperatingIncome * 1000) / volumeHeads).toFixed(2))
      : null;
    const adjustedOpPerCwt = volumeCwt != null && adjustedOperatingIncome != null && volumeCwt > 0
      ? parseFloat((adjustedOperatingIncome / volumeCwt).toFixed(2))
      : null;
    const sgaAsPercent = rawSga != null && rawRevenue != null && rawRevenue > 0
      ? parseFloat(((Math.abs(rawSga) / rawRevenue) * 100).toFixed(1))
      : null;

    const workflowOrigin = analysis.meta.workflowOrigin === "competitor" ? "competitor" : "analyze";
    const rowMetricTrace = buildMetricTraceMap(analysis, {
      revenue: rawRevenue,
      costOfRevenue,
      grossProfit: overrides.grossProfit ?? metrics.grossProfit,
      operatingExpenses,
      rdExpense,
      operatingIncome: rawOperatingIncome,
      netIncome: overrides.netIncome ?? metrics.netIncome,
      incomeTax,
      totalAssets: overrides.totalAssets ?? metrics.totalAssets,
      totalLiabilities: overrides.totalLiabilities ?? metrics.totalLiabilities,
      totalEquity: overrides.totalEquity ?? metrics.totalEquity,
      totalDebt: overrides.totalDebt ?? metrics.totalDebt,
      shortTermDebt,
      longTermDebt,
      netDebt,
      cashAndEquivalents: overrides.cashAndEquivalents ?? metrics.cash,
      shortTermInvestments,
      currentAssets,
      currentLiabilities,
      workingCapital,
      inventory,
      accountsReceivable,
      accountsPayable,
      accruedLiabilities,
      deferredRevenue,
      propertyPlantEquipment,
      goodwill,
      intangibleAssets,
      operatingLeaseLiabilities,
      financeLeaseLiabilities,
      leaseAdjustedDebt,
      leaseAdjustedNetDebt,
      operatingCashFlow: overrides.operatingCashFlow ?? metrics.operatingCashFlow,
      capex: overrides.capex ?? metrics.capex,
      freeCashFlow: overrides.freeCashFlow ?? metrics.freeCashFlow,
      shareRepurchases,
      investingCashFlow,
      financingCashFlow,
      debtIssued,
      debtRepaid,
      grossMargin: overrides.grossMargin ?? metrics.grossMargin,
      operatingMargin: overrides.operatingMargin ?? metrics.operatingMargin,
      netMargin: overrides.netMargin ?? metrics.netMargin,
      debtToEquity: overrides.debtToEquity ?? metrics.debtToEquity,
      debtToCapital,
      netDebtToEbitda,
      interestCoverage,
      currentRatio: overrides.currentRatio ?? metrics.currentRatio,
      roic,
      assetTurnover,
      inventoryTurnover,
      receivablesTurnover,
      daysSalesOutstanding,
      daysInventoryOutstanding,
      daysPayableOutstanding,
      cashConversionCycle,
      fcfConversion,
      workingCapitalRatio,
      effectiveTaxRate,
      capexAsPercentRevenue,
      dividendPayoutRatio,
      buybackPayoutRatio,
      totalPayoutRatio,
      leaseAdjustedDebtToEbitda,
      leaseAdjustedNetDebtToEbitda,
      sgaExpense: rawSga,
      depreciation: overrides.depreciation ?? depItem?.value ?? null,
      ebit: overrides.ebit ?? ebit,
      ebitda: overrides.ebitda ?? ebitda,
      ebitdaMargin: overrides.ebitdaMargin ?? ebitdaMargin,
      interestExpense: overrides.interestExpense ?? analysis.incomeStatement?.interestExpense ?? null,
      epsBasic: overrides.epsBasic ?? analysis.incomeStatement?.epsBasic ?? null,
      epsDiluted: overrides.epsDiluted ?? analysis.incomeStatement?.epsDiluted ?? null,
      weightedAverageSharesBasic: overrides.weightedAverageSharesBasic ?? analysis.incomeStatement?.weightedAverageSharesBasic ?? null,
      weightedAverageSharesDiluted: overrides.weightedAverageSharesDiluted ?? analysis.incomeStatement?.weightedAverageSharesDiluted ?? null,
      shareBasedComp: overrides.shareBasedComp ?? sbcItem?.value ?? null,
      dividendsPaid: overrides.dividendsPaid ?? metrics.dividendsPaid ?? null,
      roe: overrides.roe ?? metrics.roe ?? null,
      roa: overrides.roa ?? metrics.roa ?? null,
      fcfMargin: overrides.fcfMargin ?? metrics.fcfMargin ?? null,
      volumeHeads,
      volumeLbs,
      volumeCwt,
      opPerHead,
      opPerCwt,
      ercAdjustment,
      legalChargeAdjustment,
      transferValueAdjustment,
      corporateAllocationAdjustment,
      adjustedOperatingIncome,
      adjustedOperatingMargin,
      adjustedOpPerHead,
      adjustedOpPerCwt,
      sgaAsPercent,
    });

    rows.push({
      id: filingRow.id,
      workflowOrigin,
      ticker: filingRow.ticker,
      companyName: displayName,
      periodEnd: filingRow.period_end,
      quarterLabel: metrics.quarterLabel,
      savedAt: typeof filingRow.saved_at === "string" ? filingRow.saved_at : null,
      revenue: rawRevenue,
      costOfRevenue,
      grossProfit: overrides.grossProfit ?? metrics.grossProfit,
      operatingExpenses,
      rdExpense,
      operatingIncome: rawOperatingIncome,
      netIncome: overrides.netIncome ?? metrics.netIncome,
      incomeTax,
      totalAssets: overrides.totalAssets ?? metrics.totalAssets,
      totalLiabilities: overrides.totalLiabilities ?? metrics.totalLiabilities,
      totalEquity: overrides.totalEquity ?? metrics.totalEquity,
      totalDebt: overrides.totalDebt ?? metrics.totalDebt,
      shortTermDebt,
      longTermDebt,
      netDebt,
      cashAndEquivalents: overrides.cashAndEquivalents ?? metrics.cash,
      shortTermInvestments,
      currentAssets,
      currentLiabilities,
      workingCapital,
      inventory,
      accountsReceivable,
      accountsPayable,
      accruedLiabilities,
      deferredRevenue,
      propertyPlantEquipment,
      goodwill,
      intangibleAssets,
      operatingLeaseLiabilities,
      financeLeaseLiabilities,
      leaseAdjustedDebt,
      leaseAdjustedNetDebt,
      operatingCashFlow: overrides.operatingCashFlow ?? metrics.operatingCashFlow,
      capex: overrides.capex ?? metrics.capex,
      freeCashFlow: overrides.freeCashFlow ?? metrics.freeCashFlow,
      shareRepurchases,
      investingCashFlow,
      financingCashFlow,
      debtIssued,
      debtRepaid,
      grossMargin: overrides.grossMargin ?? metrics.grossMargin,
      operatingMargin: overrides.operatingMargin ?? metrics.operatingMargin,
      netMargin: overrides.netMargin ?? metrics.netMargin,
      debtToEquity: overrides.debtToEquity ?? metrics.debtToEquity,
      debtToCapital,
      netDebtToEbitda,
      interestCoverage,
      currentRatio: overrides.currentRatio ?? metrics.currentRatio,
      roic,
      assetTurnover,
      inventoryTurnover,
      receivablesTurnover,
      daysSalesOutstanding,
      daysInventoryOutstanding,
      daysPayableOutstanding,
      cashConversionCycle,
      fcfConversion,
      workingCapitalRatio,
      effectiveTaxRate,
      capexAsPercentRevenue,
      dividendPayoutRatio,
      buybackPayoutRatio,
      totalPayoutRatio,
      leaseAdjustedDebtToEbitda,
      leaseAdjustedNetDebtToEbitda,
      sgaExpense: rawSga,
      depreciation: overrides.depreciation ?? depItem?.value ?? null,
      ebit: overrides.ebit ?? ebit,
      ebitda: overrides.ebitda ?? ebitda,
      ebitdaMargin: overrides.ebitdaMargin ?? ebitdaMargin,
      interestExpense: overrides.interestExpense ?? analysis.incomeStatement?.interestExpense ?? null,
      epsBasic: overrides.epsBasic ?? analysis.incomeStatement?.epsBasic ?? null,
      epsDiluted: overrides.epsDiluted ?? analysis.incomeStatement?.epsDiluted ?? null,
      weightedAverageSharesBasic: overrides.weightedAverageSharesBasic ?? analysis.incomeStatement?.weightedAverageSharesBasic ?? null,
      weightedAverageSharesDiluted: overrides.weightedAverageSharesDiluted ?? analysis.incomeStatement?.weightedAverageSharesDiluted ?? null,
      shareBasedComp: overrides.shareBasedComp ?? sbcItem?.value ?? null,
      dividendsPaid: overrides.dividendsPaid ?? metrics.dividendsPaid ?? null,
      roe: overrides.roe ?? metrics.roe ?? null,
      roa: overrides.roa ?? metrics.roa ?? null,
      fcfMargin: overrides.fcfMargin ?? metrics.fcfMargin ?? null,
      volumeHeads,
      volumeLbs,
      volumeCwt,
      opPerHead,
      opPerCwt,
      ercAdjustment,
      legalChargeAdjustment,
      transferValueAdjustment,
      corporateAllocationAdjustment,
      adjustedOperatingIncome,
      adjustedOperatingMargin,
      adjustedOpPerHead,
      adjustedOpPerCwt,
      sgaAsPercent,
      _metricTrace: rowMetricTrace,
    });

    const workbookPeriodState = workbookStateMap.get(filingRow.ticker)?.[filingRow.period_end];
    if (workbookPeriodState) {
      const normalizedFields = Object.entries(workbookPeriodState).reduce<Record<string, DataSourceWorkbookCellState>>(
        (acc, [field, state]) => {
          const normalized = normalizeCellState(state);
          if (normalized) acc[field] = normalized;
          return acc;
        },
        {},
      );

      if (Object.keys(normalizedFields).length > 0) {
        workbookCells[filingRow.id] = normalizedFields;
      }
    }
  }

  const rowsByTicker = new Map<string, DataSourceRow[]>();
  for (const row of rows) {
    const key = `${row.workflowOrigin}:${row.ticker}`;
    if (!rowsByTicker.has(key)) rowsByTicker.set(key, []);
    rowsByTicker.get(key)!.push(row);
  }

  const ttmRows: DataSourceRow[] = [];
  for (const [groupKey, tickerRows] of rowsByTicker) {
    const [workflowOrigin, ticker] = groupKey.split(":") as ["analyze" | "competitor", string];
    const sorted = tickerRows.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    if (sorted.length < 4) continue;

    const last4 = sorted.slice(-4);
    const latest = last4[3];
    const sumN = (fn: (row: DataSourceRow) => number | null) => {
      const values = last4.map(fn).filter((value): value is number => value != null);
      return values.length === 4 ? Math.round(values.reduce((sum, value) => sum + value, 0)) : null;
    };

    const revenue = sumN((row) => row.revenue);
    const costOfRevenue = sumN((row) => row.costOfRevenue);
    const grossProfit = sumN((row) => row.grossProfit);
    const operatingExpenses = sumN((row) => row.operatingExpenses);
    const rdExpense = sumN((row) => row.rdExpense);
    const operatingIncome = sumN((row) => row.operatingIncome);
    const netIncome = sumN((row) => row.netIncome);
    const incomeTax = sumN((row) => row.incomeTax);
    const ebitda = sumN((row) => row.ebitda);
    const operatingCashFlow = sumN((row) => row.operatingCashFlow);
    const freeCashFlow = sumN((row) => row.freeCashFlow);
    const capex = sumN((row) => row.capex);
    const shareRepurchases = sumN((row) => row.shareRepurchases);
    const investingCashFlow = sumN((row) => row.investingCashFlow);
    const financingCashFlow = sumN((row) => row.financingCashFlow);
    const debtIssued = sumN((row) => row.debtIssued);
    const debtRepaid = sumN((row) => row.debtRepaid);
    const dividendsPaid = sumN((row) => row.dividendsPaid);
    const sgaExpense = sumN((row) => row.sgaExpense);
    const depreciation = sumN((row) => row.depreciation);
    const interestExpense = sumN((row) => row.interestExpense);

    const pctCalc = (numerator: number | null, denominator: number | null) =>
      numerator != null && denominator != null && denominator > 0
        ? parseFloat(((numerator / denominator) * 100).toFixed(1))
        : null;

    ttmRows.push({
      id: `${workflowOrigin}:${ticker}_TTM`,
      workflowOrigin,
      ticker,
      companyName: latest.companyName,
      periodEnd: "TTM",
      quarterLabel: `TTM (${last4[0].quarterLabel}-${last4[3].quarterLabel})`,
      savedAt: latest.savedAt ?? null,
      revenue,
      costOfRevenue,
      grossProfit,
      operatingExpenses,
      rdExpense,
      operatingIncome,
      netIncome,
      incomeTax,
      totalAssets: latest.totalAssets,
      totalLiabilities: latest.totalLiabilities,
      totalEquity: latest.totalEquity,
      totalDebt: latest.totalDebt,
      shortTermDebt: latest.shortTermDebt,
      longTermDebt: latest.longTermDebt,
      netDebt: latest.netDebt,
      cashAndEquivalents: latest.cashAndEquivalents,
      shortTermInvestments: latest.shortTermInvestments,
      currentAssets: latest.currentAssets,
      currentLiabilities: latest.currentLiabilities,
      workingCapital: latest.workingCapital,
      inventory: latest.inventory,
      accountsReceivable: latest.accountsReceivable,
      accountsPayable: latest.accountsPayable,
      accruedLiabilities: latest.accruedLiabilities,
      deferredRevenue: latest.deferredRevenue,
      propertyPlantEquipment: latest.propertyPlantEquipment,
      goodwill: latest.goodwill,
      intangibleAssets: latest.intangibleAssets,
      operatingLeaseLiabilities: latest.operatingLeaseLiabilities,
      financeLeaseLiabilities: latest.financeLeaseLiabilities,
      leaseAdjustedDebt: latest.leaseAdjustedDebt,
      leaseAdjustedNetDebt: latest.leaseAdjustedNetDebt,
      operatingCashFlow,
      capex,
      freeCashFlow,
      shareRepurchases,
      investingCashFlow,
      financingCashFlow,
      debtIssued,
      debtRepaid,
      grossMargin: pctCalc(grossProfit, revenue),
      operatingMargin: pctCalc(operatingIncome, revenue),
      netMargin: pctCalc(netIncome, revenue),
      debtToEquity: latest.debtToEquity,
      debtToCapital: latest.debtToCapital,
      netDebtToEbitda: ebitda != null && ebitda !== 0 && latest.netDebt != null ? roundRatio(latest.netDebt / ebitda, 1) : latest.netDebtToEbitda,
      interestCoverage: interestExpense != null && interestExpense !== 0
        ? roundRatio((ebitda ?? operatingIncome) != null ? Math.abs((ebitda ?? operatingIncome) as number / interestExpense) : null, 2)
        : latest.interestCoverage,
      currentRatio: latest.currentRatio,
      roic: latest.roic,
      assetTurnover: latest.totalAssets != null && latest.totalAssets > 0 ? roundRatio((revenue ?? 0) / latest.totalAssets, 2) : latest.assetTurnover,
      inventoryTurnover: latest.inventory != null && latest.inventory > 0 ? roundRatio((costOfRevenue ?? 0) / latest.inventory, 1) : latest.inventoryTurnover,
      receivablesTurnover: latest.accountsReceivable != null && latest.accountsReceivable > 0 ? roundRatio((revenue ?? 0) / latest.accountsReceivable, 1) : latest.receivablesTurnover,
      daysSalesOutstanding: daysMetric(latest.accountsReceivable, revenue, 365),
      daysInventoryOutstanding: daysMetric(latest.inventory, costOfRevenue, 365),
      daysPayableOutstanding: daysMetric(latest.accountsPayable, costOfRevenue, 365),
      cashConversionCycle:
        daysMetric(latest.accountsReceivable, revenue, 365) != null &&
        daysMetric(latest.inventory, costOfRevenue, 365) != null &&
        daysMetric(latest.accountsPayable, costOfRevenue, 365) != null
          ? roundOne(
              (daysMetric(latest.accountsReceivable, revenue, 365) ?? 0) +
                (daysMetric(latest.inventory, costOfRevenue, 365) ?? 0) -
                (daysMetric(latest.accountsPayable, costOfRevenue, 365) ?? 0),
            )
          : null,
      fcfConversion: pctCalc(freeCashFlow, netIncome),
      workingCapitalRatio: pctCalc(latest.workingCapital, revenue),
      effectiveTaxRate: latest.effectiveTaxRate,
      capexAsPercentRevenue: pctCalc(capex, revenue),
      dividendPayoutRatio: pctCalc(dividendsPaid, netIncome),
      buybackPayoutRatio: pctCalc(shareRepurchases, netIncome),
      totalPayoutRatio: pctCalc(
        dividendsPaid != null || shareRepurchases != null ? (dividendsPaid ?? 0) + (shareRepurchases ?? 0) : null,
        netIncome,
      ),
      leaseAdjustedDebtToEbitda:
        latest.leaseAdjustedDebt != null && ebitda != null && ebitda !== 0
          ? roundRatio(latest.leaseAdjustedDebt / ebitda, 1)
          : latest.leaseAdjustedDebtToEbitda,
      leaseAdjustedNetDebtToEbitda:
        latest.leaseAdjustedNetDebt != null && ebitda != null && ebitda !== 0
          ? roundRatio(latest.leaseAdjustedNetDebt / ebitda, 1)
          : latest.leaseAdjustedNetDebtToEbitda,
      sgaExpense,
      depreciation,
      ebit: operatingIncome,
      ebitda,
      ebitdaMargin: pctCalc(ebitda, revenue),
      interestExpense,
      epsBasic: null,
      epsDiluted: null,
      weightedAverageSharesBasic: null,
      weightedAverageSharesDiluted: null,
      shareBasedComp: sumN((row) => row.shareBasedComp),
      dividendsPaid,
      roe: pctCalc(netIncome, latest.totalEquity),
      roa: pctCalc(netIncome, latest.totalAssets),
      fcfMargin: pctCalc(freeCashFlow, revenue),
      volumeHeads: null,
      volumeLbs: null,
      volumeCwt: null,
      opPerHead: null,
      opPerCwt: null,
      ercAdjustment: null,
      legalChargeAdjustment: null,
      transferValueAdjustment: null,
      corporateAllocationAdjustment: null,
      adjustedOperatingIncome: null,
      adjustedOperatingMargin: null,
      adjustedOpPerHead: null,
      adjustedOpPerCwt: null,
      sgaAsPercent: pctCalc(sgaExpense != null ? Math.abs(sgaExpense) : null, revenue),
    });
  }

  return NextResponse.json({
    rows: [...rows, ...ttmRows],
    workbookCells,
    editLog,
    availableCompanies: availableCompanies ?? buildAvailableCompanies(rows),
    workbookThreads: workbookThreads ?? [],
    schemaReady: schemaReady ?? true,
    migrationRequired: schemaReady === false,
    migrationFile: schemaReady === false ? "supabase-chat-schema.sql" : null,
    threadSchemaMessage: threadSchemaMessage ?? null,
    selectedCompanyTicker: selectedCompanyTicker ?? companyTicker ?? null,
    selectedThreadId: selectedThreadId ?? threadMeta?.id ?? null,
    thread: threadMeta ?? null,
    updatedAt: new Date().toISOString(),
  });
}

async function loadThreadSnapshotFromId(
  req: NextRequest,
  threadId: string,
) {
  const threadResult = await requireWorkbookThread(req, threadId);
  if (threadResult instanceof NextResponse) return threadResult;

  const companyTicker = threadResult.thread.company_ticker?.trim().toUpperCase();
  if (!companyTicker) {
    return NextResponse.json({ error: "Workbook thread is missing a company ticker" }, { status: 400 });
  }

  return {
    threadResult,
    companyTicker,
    snapshot: normalizeWorkbookSnapshot(threadResult.thread.workbook_snapshot),
  };
}

/** GET /api/data-source - returns workbook rows for the shared view or a specific workbook thread */
export async function GET(req: NextRequest) {
  const authResult = await requireUserId(req);
  if (authResult instanceof NextResponse) return authResult;

  const searchParams = new URL(req.url).searchParams;
  const includeNavigator = searchParams.get("includeNavigator") === "1";
  const requestedThreadId = searchParams.get("threadId")?.trim() ?? null;
  const requestedCompanyTicker = searchParams.get("companyTicker")?.trim().toUpperCase() ?? null;

  let availableCompanies: Array<{ ticker: string; companyName: string }> | undefined;
  let workbookThreads: ChatThreadSummary[] | undefined;
  let schemaReady = true;
  let threadSchemaMessage: string | null = null;
  let selectedThreadId = requestedThreadId;
  let selectedCompanyTicker = requestedCompanyTicker;

  if (includeNavigator) {
    try {
      const [companyList, navigator] = await Promise.all([
        loadAvailableCompanies(),
        loadWorkbookThreadsNavigator(req),
      ]);
      availableCompanies = companyList;
      workbookThreads = navigator.threads;
      schemaReady = navigator.schemaReady;
      threadSchemaMessage = navigator.threadSchemaMessage;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load workbook navigator";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!selectedThreadId && schemaReady) {
      if (selectedCompanyTicker) {
        const latestCompanyThread = workbookThreads?.find(
          (thread) => thread.companyTicker?.toUpperCase() === selectedCompanyTicker,
        );
        selectedThreadId = latestCompanyThread?.id ?? null;
      } else {
        selectedThreadId = workbookThreads?.[0]?.id ?? null;
      }
    }

    if (!selectedCompanyTicker) {
      selectedCompanyTicker =
        (selectedThreadId
          ? workbookThreads?.find((thread) => thread.id === selectedThreadId)?.companyTicker?.toUpperCase()
          : null) ??
        availableCompanies?.[0]?.ticker ??
        null;
    }
  }

  if (!selectedThreadId || !schemaReady) {
    return buildWorkbookResponse({
      companyTicker: selectedCompanyTicker || undefined,
      availableCompanies,
      workbookThreads,
      schemaReady,
      threadSchemaMessage,
      selectedCompanyTicker,
      selectedThreadId: schemaReady ? selectedThreadId : null,
    });
  }

  const threadContext = await loadThreadSnapshotFromId(req, selectedThreadId);
  if (threadContext instanceof NextResponse) return threadContext;

  return buildWorkbookResponse({
    companyTicker: threadContext.companyTicker,
    snapshot: threadContext.snapshot,
    threadMeta: {
      id: threadContext.threadResult.thread.id,
      title: threadContext.threadResult.thread.title,
      companyTicker: threadContext.companyTicker,
      companyName: threadContext.threadResult.thread.company_name ?? null,
      updatedAt: threadContext.threadResult.thread.updated_at,
    },
    availableCompanies,
    workbookThreads,
    schemaReady,
    threadSchemaMessage,
    selectedCompanyTicker: threadContext.companyTicker,
    selectedThreadId: threadContext.threadResult.thread.id,
  });
}

/** PATCH /api/data-source - save cell overrides */
export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    edits: Array<{ id: string; ticker: string; periodEnd: string; field: string; value: number | null }>;
    workbookCells?: DataSourceWorkbookCellPayload[];
    workbookTickers?: string[];
    threadId?: string;
  };
  const editsPayload = body.edits ?? [];

  if (!editsPayload.length && !body.workbookCells?.length) {
    return NextResponse.json({ error: "No workbook changes provided" }, { status: 400 });
  }

  const workbookCellsByTicker = groupWorkbookCellsByTicker(body.workbookCells ?? []);
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";

  if (threadId) {
    const threadContext = await loadThreadSnapshotFromId(req, threadId);
    if (threadContext instanceof NextResponse) return threadContext;

    const { db, userId, thread } = threadContext.threadResult;
    const ticker = threadContext.companyTicker;
    const snapshot = threadContext.snapshot;
    const overrides = clone(snapshot.dataSourceOverrides ?? {});
    const tickerLog = normalizeEditLogEntries(ticker, snapshot.dataSourceEditLog);
    const now = new Date().toISOString();

    for (const edit of editsPayload.filter((entry) => entry.ticker.toUpperCase() === ticker)) {
      if (!overrides[edit.periodEnd]) overrides[edit.periodEnd] = {};
      const prev = overrides[edit.periodEnd][edit.field] ?? null;
      if (prev !== edit.value) {
        tickerLog.push({
          at: now,
          ticker,
          periodEnd: edit.periodEnd,
          field: edit.field,
          prevValue: prev,
          nextValue: edit.value,
          kind: "value",
        });
      }
      overrides[edit.periodEnd][edit.field] = edit.value;
    }

    const nextSnapshot: DataSourceWorkbookSnapshot = {};
    if (Object.keys(overrides).length > 0) {
      nextSnapshot.dataSourceOverrides = overrides;
    }

    const tickerWorkbookState = workbookCellsByTicker[ticker];
    if (tickerWorkbookState && Object.keys(tickerWorkbookState).length > 0) {
      nextSnapshot.dataSourceWorkbook = clone(tickerWorkbookState);
    }

    const trimmedLog = tickerLog.slice(-500);
    if (trimmedLog.length > 0) {
      nextSnapshot.dataSourceEditLog = trimmedLog;
    }

    const { error } = await db
      .from("chat_threads")
      .update({
        workbook_snapshot: nextSnapshot,
        updated_at: now,
      })
      .eq("id", thread.id)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, threadId: thread.id });
  }

  const editsByTicker = new Map<string, Array<{ periodEnd: string; field: string; value: number | null }>>();
  for (const edit of editsPayload) {
    if (!editsByTicker.has(edit.ticker)) editsByTicker.set(edit.ticker, []);
    editsByTicker.get(edit.ticker)!.push(edit);
  }

  const workbookTickers = new Set(
    (body.workbookTickers ?? []).map((ticker) => ticker.toUpperCase()).filter((ticker) => ticker.length > 0),
  );
  for (const ticker of Object.keys(workbookCellsByTicker)) {
    workbookTickers.add(ticker.toUpperCase());
  }
  for (const ticker of editsByTicker.keys()) {
    workbookTickers.add(ticker.toUpperCase());
  }

  for (const ticker of workbookTickers) {
    const edits = editsByTicker.get(ticker) ?? [];
    const { data } = await supabase
      .from("adjustments")
      .select("data")
      .eq("ticker", ticker)
      .maybeSingle();

    const existing = (data?.data ?? {
      ticker,
      insights: [],
      cells: [],
      footnotes: [],
      blocks: [],
      updatedAt: "",
    }) as Record<string, unknown>;
    const overrides = (existing.dataSourceOverrides ?? {}) as Record<string, Record<string, number | null>>;
    const tickerLog = Array.isArray(existing.dataSourceEditLog)
      ? ((existing.dataSourceEditLog as unknown[]).filter(
          (entry): entry is DataSourceEditLogEntry =>
            !!entry && typeof entry === "object" && "at" in entry && "field" in entry,
        ))
      : [];
    const now = new Date().toISOString();

    for (const edit of edits) {
      if (!overrides[edit.periodEnd]) overrides[edit.periodEnd] = {};
      const prev = overrides[edit.periodEnd][edit.field] ?? null;
      if (prev !== edit.value) {
        tickerLog.push({
          at: now,
          ticker,
          periodEnd: edit.periodEnd,
          field: edit.field,
          prevValue: prev,
          nextValue: edit.value,
          kind: "value",
        });
      }
      overrides[edit.periodEnd][edit.field] = edit.value;
    }

    existing.dataSourceOverrides = overrides;
    existing.dataSourceEditLog = tickerLog.slice(-500);
    const tickerWorkbookState = workbookCellsByTicker[ticker];
    if (tickerWorkbookState && Object.keys(tickerWorkbookState).length > 0) {
      existing.dataSourceWorkbook = tickerWorkbookState;
    } else {
      delete existing.dataSourceWorkbook;
    }
    existing.updatedAt = now;

    await supabase
      .from("adjustments")
      .upsert({ ticker, data: existing, updated_at: now }, { onConflict: "ticker" });
  }

  const filingIds = [
    ...new Set(
      editsPayload
        .map((edit) => edit.id)
        .filter((id) => typeof id === "string" && id.length > 0 && !id.endsWith("_TTM")),
    ),
  ];

  for (const filingId of filingIds) {
    const { data: filing, error: loadErr } = await supabase
      .from("filings")
      .select("id, ticker, period_end, analysis")
      .eq("id", filingId)
      .maybeSingle();

    if (loadErr || !filing?.analysis || !filing.ticker || !filing.period_end) continue;

    const { data: adjustmentRow } = await supabase
      .from("adjustments")
      .select("data")
      .eq("ticker", filing.ticker)
      .maybeSingle();

    const payload = adjustmentRow?.data as { dataSourceOverrides?: Record<string, Record<string, number | null>> } | undefined;
    const periodOverrides = payload?.dataSourceOverrides?.[filing.period_end] ?? {};

    const updatedAnalysis = applyDataSourceOverridesToAnalysis(
      filing.analysis as FullAnalysis,
      periodOverrides,
      "data-source-override",
    );

    await supabase.from("filings").update({ analysis: updatedAnalysis }).eq("id", filingId);
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/data-source - clear all filings for one workflow table */
export async function DELETE(req: NextRequest) {
  const adminResult = await requireAdminUser(req);
  if (adminResult instanceof NextResponse) return adminResult;

  const body = (await req.json().catch(() => ({}))) as {
    workflowOrigin?: "analyze" | "competitor";
    confirmationText?: string;
  };

  const workflowOrigin = body.workflowOrigin;
  if (workflowOrigin !== "analyze" && workflowOrigin !== "competitor") {
    return NextResponse.json({ error: "workflowOrigin must be 'analyze' or 'competitor'" }, { status: 400 });
  }

  const expectedConfirmationText =
    workflowOrigin === "analyze"
      ? "Delete Quick Analyze Records"
      : "Delete Competitor Analyze Records";

  if ((body.confirmationText ?? "").trim() !== expectedConfirmationText) {
    return NextResponse.json(
      { error: `You must type "${expectedConfirmationText}" exactly to confirm deletion.` },
      { status: 400 },
    );
  }

  const { data: filings, error } = await supabase
    .from("filings")
    .select("id, analysis");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const idsToDelete = (filings ?? [])
    .filter((filing) => {
      const analysis = filing.analysis as FullAnalysis | null;
      const origin = analysis?.meta?.workflowOrigin === "competitor" ? "competitor" : "analyze";
      return origin === workflowOrigin;
    })
    .map((filing) => filing.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (idsToDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error: deleteError } = await supabase
    .from("filings")
    .delete()
    .in("id", idsToDelete);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: idsToDelete.length });
}
