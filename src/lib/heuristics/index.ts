// Barrel export for all heuristic modules
export { resolveRnDExpense } from "./rdExpense";
export type { RdMethod, RdResolution } from "./rdExpense";

export { extractShareRepurchasesHeuristic } from "./shareRepurchases";

export { extractTotalEquityHeuristic, computeBalanceGapPct } from "./totalEquity";
export type { EquityConfidence, EquityExtractionResult } from "./totalEquity";

export {
  extractTotalLiabilitiesHeuristic,
  type LiabilitiesHeuristicResult,
} from "./totalLiabilities";
