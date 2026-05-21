import type {
  StockPriceHistoryResult,
  StockReactionWindowResult,
} from "@/lib/stockPriceHistory";

export interface CompetitorEarningsReleasePayload {
  benchmarkTicker: string;
  competitorTicker: string;
  competitorName: string;
  period: string;
  filingDate: string | null;
  stock: StockPriceHistoryResult;
  reaction: StockReactionWindowResult | null;
  summary: string;
  commentary: string[];
}
