/**
 * Competitor Analysis Service.
 *
 * Pure logic for:
 * - Mapping FullAnalysis → Quarter domain object
 * - Computing workspace readiness
 * - Determining module eligibility
 *
 * No I/O — storage access is done by callers.
 */

import type { FullAnalysis } from "@/types/analysis";
import type {
  Company,
  Quarter,
  Filing,
  ModuleReadiness,
  WorkspaceReadiness,
  AnalysisModuleId,
  PeerType,
} from "@/types/competitor";
import { ANALYSIS_MODULES } from "@/types/competitor";

// ---------------------------------------------------------------------------
// Quarter derivation
// ---------------------------------------------------------------------------

/**
 * Derive a Quarter from a period-end date string.
 *
 * Assumption: calendar quarters. Many food companies have non-standard fiscal
 * years (e.g. Smithfield's FY ends in April). This is a best-effort mapping
 * that can be refined per-company in future sprints.
 */
export function deriveQuarter(periodEnd: string): Quarter {
  const d = new Date(periodEnd + "T00:00:00Z");
  const month = d.getUTCMonth() + 1; // 1-12
  const year = d.getUTCFullYear();

  let fiscalQuarter: number;
  let fiscalYear: number;

  if (month >= 1 && month <= 3) {
    fiscalQuarter = 1;
    fiscalYear = year;
  } else if (month >= 4 && month <= 6) {
    fiscalQuarter = 2;
    fiscalYear = year;
  } else if (month >= 7 && month <= 9) {
    fiscalQuarter = 3;
    fiscalYear = year;
  } else {
    fiscalQuarter = 4;
    fiscalYear = year;
  }

  return {
    periodEnd,
    fiscalYear,
    fiscalQuarter,
    label: `Q${fiscalQuarter} ${fiscalYear}`,
  };
}

export function quarterPeriodEnd(
  fiscalYear: number,
  fiscalQuarter: number
): string {
  if (fiscalQuarter === 1) return `${fiscalYear}-03-31`;
  if (fiscalQuarter === 2) return `${fiscalYear}-06-30`;
  if (fiscalQuarter === 3) return `${fiscalYear}-09-30`;
  return `${fiscalYear}-12-31`;
}

export function explicitQuarter(
  fiscalYear: number,
  fiscalQuarter: number
): Quarter {
  return {
    fiscalYear,
    fiscalQuarter,
    periodEnd: quarterPeriodEnd(fiscalYear, fiscalQuarter),
    label: `Q${fiscalQuarter} ${fiscalYear}`,
  };
}

// ---------------------------------------------------------------------------
// Module eligibility
// ---------------------------------------------------------------------------

/**
 * Check if a single analysis module is ready given available data.
 */
export function checkModuleReadiness(
  moduleId: AnalysisModuleId,
  subjectQuarterCount: number,
  peerCount: number,
  latestFiling: Filing | null
): ModuleReadiness {
  const mod = ANALYSIS_MODULES.find((m) => m.id === moduleId);
  if (!mod) {
    return {
      moduleId,
      moduleName: moduleId,
      ready: false,
      reasons: ["Unknown module"],
    };
  }

  const reasons: string[] = [];

  if (subjectQuarterCount < mod.minQuarters) {
    reasons.push(
      `Need ${mod.minQuarters} quarter(s), have ${subjectQuarterCount}`
    );
  }

  if (peerCount < mod.minPeers) {
    reasons.push(
      `Need ${mod.minPeers} peer(s) with data, have ${peerCount}`
    );
  }

  // Check required fields on the latest filing
  if (latestFiling && mod.requiredFields.length > 0) {
    for (const field of mod.requiredFields) {
      const value = latestFiling.analysis[field];
      if (value == null) {
        reasons.push(`Missing required data: ${field}`);
      }
    }
  } else if (!latestFiling && mod.minQuarters > 0) {
    reasons.push("No filing data available");
  }

  return {
    moduleId: mod.id,
    moduleName: mod.name,
    ready: reasons.length === 0,
    reasons,
  };
}

/**
 * Compute full workspace readiness for a company.
 *
 * @param company - The company record
 * @param filings - All filings for the company, sorted descending by periodEnd
 * @param peers - All peer companies with their filing counts
 */
export function computeWorkspaceReadiness(
  company: Company,
  filings: Filing[],
  peers: Array<{ company: Company; quarterCount: number }>
): WorkspaceReadiness {
  const quarterCount = filings.length;
  const quartersOnFile = filings.map((f) => f.periodEnd);
  const latestFiling = filings[0] ?? null;
  const latestQuarter = latestFiling
    ? deriveQuarter(latestFiling.periodEnd)
    : null;

  // Count peers that have at least 1 quarter of data
  const peersWithData = peers.filter((p) => p.quarterCount > 0);
  const peerCount = peersWithData.length;

  const peerCoverage = peers.map((p) => ({
    ticker: p.company.ticker,
    name: p.company.name,
    peerType: p.company.peerType,
    quarterCount: p.quarterCount,
  }));

  // Check each module
  const modules: ModuleReadiness[] = ANALYSIS_MODULES.map((mod) =>
    checkModuleReadiness(mod.id, quarterCount, peerCount, latestFiling)
  );

  const canBeginAnalysis = modules.some((m) => m.ready);

  return {
    company,
    latestQuarter,
    quarterCount,
    quartersOnFile,
    peerCount,
    peerCoverage,
    modules,
    canBeginAnalysis,
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers — FullAnalysis → summary metrics for listing
// ---------------------------------------------------------------------------

export interface QuarterSummary {
  periodEnd: string;
  quarter: Quarter;
  source: "sec" | "pdf";
  totalRevenue: number | null;
  netIncome: number | null;
  totalAssets: number;
  totalDebt: number;
  freeCashFlow: number | null;
  debtToEquity: number | null;
}

/**
 * Extract a compact summary from a Filing for list/table views.
 */
export function filingToSummary(filing: Filing): QuarterSummary {
  const a = filing.analysis;

  // Try to find revenue from cfItems
  const revenueItem = (a.cfItems ?? []).find(
    (i) => i.tag === "Revenues" || i.tag === "RevenueFromContractWithCustomerExcludingAssessedTax"
  );

  return {
    periodEnd: filing.periodEnd,
    quarter: deriveQuarter(filing.periodEnd),
    source: filing.source,
    totalRevenue: revenueItem?.value ?? null,
    netIncome: a.cashFlow.netIncome,
    totalAssets: a.balanceSheet.totalAssets,
    totalDebt: a.debtStructure.totalDebt,
    freeCashFlow: a.cashFlow.freeCashFlow,
    debtToEquity: a.ratios.debtToEquity,
  };
}
