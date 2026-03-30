/**
 * Peer-Specific Module System — configuration-driven analysis structures
 * that vary by competitor type.
 *
 * Each peer type defines:
 * - comparable scopes (what to compare against)
 * - required metrics
 * - slide block ordering
 * - special footnotes
 * - optional analysis blocks
 *
 * This is a pure configuration layer. No I/O.
 */

import type { PeerType } from "@/types/competitor";
import type { SlideBlockType } from "@/types/slideBlocks";
import type { QuarterMetrics } from "./analysisModules";

// ---------------------------------------------------------------------------
// Peer Module Configuration
// ---------------------------------------------------------------------------

type MetricKey = keyof QuarterMetrics;

export interface PeerModuleConfig {
  /** Peer type this module applies to */
  peerType: PeerType;
  /** Display name */
  name: string;
  /** Short description of analysis approach */
  description: string;
  /** Which slide blocks to include, in order */
  slideBlockOrder: SlideBlockType[];
  /** Comparable scope: which peer types are valid comparisons */
  comparableScopes: PeerType[];
  /** Required metrics — analysis is blocked if these are missing */
  requiredMetrics: MetricKey[];
  /** Optional metrics — shown if available, no warning if missing */
  optionalMetrics: MetricKey[];
  /** Focus metrics — highlighted in headlines and summaries */
  focusMetrics: MetricKey[];
  /** Special footnotes for this peer type */
  footnotes: string[];
  /** Optional analysis blocks unique to this peer type */
  optionalBlocks: Array<{
    id: string;
    name: string;
    description: string;
    condition: string; // human-readable condition
  }>;
  /** Minimum quarters required for meaningful analysis */
  minQuarters: number;
  /** Whether this peer type needs special normalization */
  normalizationNotes: string[];
}

// ---------------------------------------------------------------------------
// Module Definitions
// ---------------------------------------------------------------------------

const SUBJECT_MODULE: PeerModuleConfig = {
  peerType: "subject",
  name: "Subject Company Analysis",
  description: "Full financial analysis of the primary subject company with peer benchmarking",
  slideBlockOrder: [
    "benchmark-table",
    "quarterly-trend",
    "sequential-comparison",
    "yoy-comparison",
    "ttm-comparison",
    "sga-comparison",
    "appendix-historical",
  ],
  comparableScopes: ["packaged-meats", "pork-fresh", "diversified-protein"],
  requiredMetrics: ["revenue", "netIncome", "totalAssets", "totalEquity", "totalDebt"],
  optionalMetrics: ["grossProfit", "sgaExpense", "operatingIncome", "freeCashFlow"],
  focusMetrics: ["revenue", "netMargin", "operatingMargin", "debtToEquity"],
  footnotes: [],
  optionalBlocks: [],
  minQuarters: 1,
  normalizationNotes: [],
};

const PACKAGED_MEATS_MODULE: PeerModuleConfig = {
  peerType: "packaged-meats",
  name: "Packaged Meats Peer",
  description: "Direct branded packaged meats competitor — focus on margins, brand investment, and SG&A efficiency",
  slideBlockOrder: [
    "benchmark-table",
    "sequential-comparison",
    "yoy-comparison",
    "sga-comparison",
    "quarterly-trend",
    "appendix-historical",
  ],
  comparableScopes: ["subject", "packaged-meats"],
  requiredMetrics: ["revenue", "netIncome", "grossProfit", "sgaExpense"],
  optionalMetrics: ["operatingIncome", "freeCashFlow", "totalDebt"],
  focusMetrics: ["grossMargin", "sgaExpense", "operatingMargin", "netMargin"],
  footnotes: [
    "Packaged meats peers are evaluated on gross margin and SG&A efficiency as proxies for brand strength and distribution scale.",
    "Revenue comparisons may not be size-adjusted; focus on margin metrics for comparability.",
  ],
  optionalBlocks: [
    {
      id: "brand-investment",
      name: "Brand Investment Proxy",
      description: "SG&A as % of revenue as a proxy for brand marketing investment",
      condition: "SG&A data available for 2+ quarters",
    },
  ],
  minQuarters: 1,
  normalizationNotes: [
    "Gross profit definitions may vary across companies (inclusion of distribution costs).",
  ],
};

const PORK_FRESH_MODULE: PeerModuleConfig = {
  peerType: "pork-fresh",
  name: "Pork / Fresh Protein Peer",
  description: "Fresh pork and protein peer — focus on commodity exposure, volume sensitivity, and capital intensity",
  slideBlockOrder: [
    "benchmark-table",
    "quarterly-trend",
    "sequential-comparison",
    "yoy-comparison",
    "ttm-comparison",
    "appendix-historical",
  ],
  comparableScopes: ["subject", "pork-fresh"],
  requiredMetrics: ["revenue", "netIncome", "totalAssets", "operatingCashFlow"],
  optionalMetrics: ["grossProfit", "capex", "freeCashFlow"],
  focusMetrics: ["revenue", "grossMargin", "netMargin", "capex"],
  footnotes: [
    "Pork/fresh peers are exposed to commodity price cycles; quarterly comparisons should account for seasonal and commodity effects.",
    "Capital expenditure intensity is a key differentiator in this segment.",
  ],
  optionalBlocks: [
    {
      id: "capex-intensity",
      name: "Capital Intensity Analysis",
      description: "CapEx as % of revenue and assets to evaluate investment requirements",
      condition: "CapEx data available",
    },
  ],
  minQuarters: 2,
  normalizationNotes: [
    "Revenue includes both fresh and value-added products; segment-level data may not be available.",
    "Commodity price swings can distort quarter-over-quarter margin comparisons.",
  ],
};

const DIVERSIFIED_PROTEIN_MODULE: PeerModuleConfig = {
  peerType: "diversified-protein",
  name: "Diversified Protein Peer",
  description: "Large multi-segment protein company — focus on portfolio mix, scale advantages, and leverage",
  slideBlockOrder: [
    "benchmark-table",
    "sequential-comparison",
    "yoy-comparison",
    "ttm-comparison",
    "sga-comparison",
    "quarterly-trend",
    "appendix-historical",
  ],
  comparableScopes: ["subject", "diversified-protein"],
  requiredMetrics: ["revenue", "netIncome", "totalAssets", "totalDebt", "totalEquity"],
  optionalMetrics: ["grossProfit", "sgaExpense", "operatingIncome", "freeCashFlow"],
  focusMetrics: ["revenue", "netMargin", "debtToEquity", "roe"],
  footnotes: [
    "Diversified protein peers operate across multiple segments; consolidated metrics may mask segment-level performance.",
    "Scale differences require margin-based rather than absolute comparisons.",
  ],
  optionalBlocks: [
    {
      id: "leverage-profile",
      name: "Leverage Profile",
      description: "Debt/Equity, Net Debt, and interest coverage comparison",
      condition: "Debt and equity data available",
    },
  ],
  minQuarters: 1,
  normalizationNotes: [
    "Revenue mix (beef, pork, chicken, prepared) varies significantly across diversified peers.",
  ],
};

const METHODOLOGY_CHANGE_MODULE: PeerModuleConfig = {
  peerType: "methodology-change",
  name: "Methodology Change Peer",
  description: "Company with recent accounting or reporting methodology changes — requires special handling for comparability",
  slideBlockOrder: [
    "benchmark-table",
    "quarterly-trend",
    "appendix-historical",
  ],
  comparableScopes: ["subject"],
  requiredMetrics: ["revenue", "netIncome", "totalAssets"],
  optionalMetrics: ["grossProfit", "operatingIncome"],
  focusMetrics: ["revenue", "netIncome", "totalAssets"],
  footnotes: [
    "This company has undergone a methodology change in accounting or reporting. Historical comparisons may not be directly comparable.",
    "Pre-change and post-change periods should be evaluated separately.",
  ],
  optionalBlocks: [
    {
      id: "pre-post-comparison",
      name: "Pre/Post Change Comparison",
      description: "Compare metrics before and after the methodology change",
      condition: "Data available from both pre-change and post-change periods",
    },
  ],
  minQuarters: 2,
  normalizationNotes: [
    "Sequential and YoY comparisons may be unreliable across the change boundary.",
    "Consider using only post-change quarters for trending analysis.",
  ],
};

const SPINOFF_STRUCTURAL_MODULE: PeerModuleConfig = {
  peerType: "spinoff-structural",
  name: "Spin-off / Structural Change Peer",
  description: "Company affected by spin-offs or structural reorganization — limited historical comparability",
  slideBlockOrder: [
    "benchmark-table",
    "quarterly-trend",
    "appendix-historical",
  ],
  comparableScopes: ["subject"],
  requiredMetrics: ["revenue", "netIncome", "totalAssets"],
  optionalMetrics: ["totalDebt", "freeCashFlow"],
  focusMetrics: ["revenue", "totalAssets", "netIncome"],
  footnotes: [
    "This company has been affected by a spin-off or structural reorganization.",
    "Historical data may reflect the combined entity. Post-event data reflects the standalone company.",
  ],
  optionalBlocks: [],
  minQuarters: 1,
  normalizationNotes: [
    "Pre-spin data may include divested segments; direct comparison requires pro-forma adjustments.",
    "Balance sheet figures may have been restructured at the event date.",
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const MODULE_REGISTRY: Record<PeerType, PeerModuleConfig> = {
  subject: SUBJECT_MODULE,
  "packaged-meats": PACKAGED_MEATS_MODULE,
  "pork-fresh": PORK_FRESH_MODULE,
  "diversified-protein": DIVERSIFIED_PROTEIN_MODULE,
  "methodology-change": METHODOLOGY_CHANGE_MODULE,
  "spinoff-structural": SPINOFF_STRUCTURAL_MODULE,
};

export function getPeerModuleConfig(peerType: PeerType): PeerModuleConfig {
  return MODULE_REGISTRY[peerType] ?? DIVERSIFIED_PROTEIN_MODULE;
}

export function getAllPeerModuleConfigs(): PeerModuleConfig[] {
  return Object.values(MODULE_REGISTRY);
}

// ---------------------------------------------------------------------------
// Module readiness check
// ---------------------------------------------------------------------------

export interface PeerModuleReadiness {
  config: PeerModuleConfig;
  ready: boolean;
  availableBlocks: SlideBlockType[];
  missingBlocks: Array<{ blockType: SlideBlockType; reason: string }>;
  missingMetrics: string[];
  availableMetrics: string[];
  quarterCount: number;
  meetsMinQuarters: boolean;
  overallStatus: "ready" | "partial" | "insufficient";
}

export function checkPeerModuleReadiness(
  config: PeerModuleConfig,
  metrics: QuarterMetrics[]
): PeerModuleReadiness {
  const quarterCount = metrics.length;
  const meetsMinQuarters = quarterCount >= config.minQuarters;

  // Check required metrics on latest quarter
  const latest = metrics[0];
  const missingMetrics: string[] = [];
  const availableMetrics: string[] = [];

  if (latest) {
    for (const key of config.requiredMetrics) {
      const val = latest[key];
      if (val == null || val === 0) {
        missingMetrics.push(key);
      } else {
        availableMetrics.push(key);
      }
    }
    for (const key of config.optionalMetrics) {
      const val = latest[key];
      if (val != null && val !== 0) {
        availableMetrics.push(key);
      }
    }
  }

  // Determine available blocks
  const availableBlocks: SlideBlockType[] = [];
  const missingBlocks: Array<{ blockType: SlideBlockType; reason: string }> = [];

  for (const blockType of config.slideBlockOrder) {
    const reasons: string[] = [];

    if (quarterCount === 0) {
      reasons.push("No quarters on file");
    } else if (blockType === "sequential-comparison" && quarterCount < 2) {
      reasons.push("Need 2+ quarters for sequential comparison");
    } else if (blockType === "yoy-comparison" && quarterCount < 5) {
      reasons.push("Need matching quarters from 2 years for YoY");
    } else if (blockType === "ttm-comparison" && quarterCount < 4) {
      reasons.push("Need 4+ quarters for TTM");
    }

    if (reasons.length === 0) {
      availableBlocks.push(blockType);
    } else {
      missingBlocks.push({ blockType, reason: reasons[0] });
    }
  }

  const overallStatus: "ready" | "partial" | "insufficient" =
    quarterCount === 0 || missingMetrics.length === config.requiredMetrics.length
      ? "insufficient"
      : missingMetrics.length > 0 || !meetsMinQuarters
        ? "partial"
        : "ready";

  return {
    config,
    ready: overallStatus === "ready",
    availableBlocks,
    missingBlocks,
    missingMetrics,
    availableMetrics,
    quarterCount,
    meetsMinQuarters,
    overallStatus,
  };
}

// ---------------------------------------------------------------------------
// Company-level overrides
// ---------------------------------------------------------------------------

export interface CompanyOverride {
  ticker: string;
  /** Override peer type for specific quarters */
  quarterOverrides?: Array<{
    periodEnd: string;
    peerType: PeerType;
    reason: string;
  }>;
  /** Additional footnotes for this company */
  additionalFootnotes?: string[];
  /** Exclude specific blocks */
  excludeBlocks?: SlideBlockType[];
  /** Force include specific blocks */
  includeBlocks?: SlideBlockType[];
}

/**
 * Apply company-level overrides to a module config.
 * Returns a modified copy; does not mutate the original.
 */
export function applyOverrides(
  config: PeerModuleConfig,
  override: CompanyOverride | undefined
): PeerModuleConfig {
  if (!override) return config;

  let blockOrder = [...config.slideBlockOrder];

  if (override.excludeBlocks) {
    blockOrder = blockOrder.filter((b) => !override.excludeBlocks!.includes(b));
  }
  if (override.includeBlocks) {
    for (const b of override.includeBlocks) {
      if (!blockOrder.includes(b)) blockOrder.push(b);
    }
  }

  return {
    ...config,
    slideBlockOrder: blockOrder,
    footnotes: [
      ...config.footnotes,
      ...(override.additionalFootnotes ?? []),
    ],
  };
}
