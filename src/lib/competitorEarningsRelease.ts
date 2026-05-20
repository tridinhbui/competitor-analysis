import "server-only";

import type {
  ComparisonNarrative,
  NormalizedCompanyMetrics,
} from "@/lib/companyComparison";
import {
  fetchStockPriceHistory,
  fetchStockReactionWindow,
} from "@/lib/stockPriceHistory";
import type { CompetitorEarningsReleasePayload } from "@/types/competitorRelease";

function fmtSignedPercent(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function fmtCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function formatDisplayDate(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function reactionToneLabel(oneDay: number | null, fiveDay: number | null): string {
  if (oneDay == null && fiveDay == null) return "mixed";
  const primary = fiveDay ?? oneDay ?? 0;
  if (primary >= 2.5) return "positive";
  if (primary <= -2.5) return "negative";
  return "muted";
}

function distanceFromHigh(low: number | null, high: number | null, latest: number | null) {
  if (low == null || high == null || latest == null || high === 0 || low === 0) {
    return {
      offHighPct: null as number | null,
      aboveLowPct: null as number | null,
    };
  }

  return {
    offHighPct: ((latest / high) - 1) * 100,
    aboveLowPct: ((latest / low) - 1) * 100,
  };
}

function selectNarrativeSupport(
  benchmarkTicker: string,
  competitorTicker: string,
  narrative: ComparisonNarrative
): string | null {
  const preferred = [
    ...narrative.truePerformanceDiagnosis,
    ...narrative.whatChanged,
    ...narrative.investmentInterpretation,
    ...narrative.executiveSummary,
  ]
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    preferred.find(
      (line) =>
        line.includes(competitorTicker) ||
        (line.includes(benchmarkTicker) && line.includes(competitorTicker))
    ) ??
    preferred[0] ??
    null
  );
}

function buildReleaseSummary(params: {
  competitor: NormalizedCompanyMetrics;
  stockChangePct: number | null;
  reactionOneDayPct: number | null;
  reactionFiveDayPct: number | null;
}): string {
  const { competitor, stockChangePct, reactionOneDayPct, reactionFiveDayPct } = params;
  const tone = reactionToneLabel(reactionOneDayPct, reactionFiveDayPct);

  if (reactionOneDayPct != null) {
    if (tone === "positive") {
      return `${competitor.ticker} traded higher immediately after the ${competitor.quarterLabel} release, suggesting investors leaned constructive on the print and near-term outlook.`;
    }
    if (tone === "negative") {
      return `${competitor.ticker} sold off after the ${competitor.quarterLabel} release, implying the market focused on execution risk or fading margin durability.`;
    }
    return `${competitor.ticker} showed a relatively muted post-release move, suggesting the quarter landed close to expectations despite mixed operating signals.`;
  }

  if (stockChangePct != null) {
    if (stockChangePct >= 0) {
      return `${competitor.ticker} remains up ${fmtSignedPercent(stockChangePct)} over the last year, keeping the equity narrative broadly constructive into the latest quarter.`;
    }
    return `${competitor.ticker} is down ${Math.abs(stockChangePct).toFixed(1)}% over the last year, leaving the market more sensitive to downside surprises in the latest quarter.`;
  }

  return `${competitor.ticker} earnings context is available, but live stock reaction data was limited for this period.`;
}

function buildReleaseCommentary(params: {
  benchmark: NormalizedCompanyMetrics;
  competitor: NormalizedCompanyMetrics;
  narrative: ComparisonNarrative;
  stockChangePct: number | null;
  reactionOneDayPct: number | null;
  reactionFiveDayPct: number | null;
  latestPrice: number | null;
  week52High: number | null;
  week52Low: number | null;
}): string[] {
  const {
    benchmark,
    competitor,
    narrative,
    stockChangePct,
    reactionOneDayPct,
    reactionFiveDayPct,
    latestPrice,
    week52High,
    week52Low,
  } = params;

  const commentary: string[] = [];
  const reactionDateLabel = competitor.filingDate
    ? formatDisplayDate(normalizeDate(competitor.filingDate))
    : "the filing date";

  if (reactionOneDayPct != null) {
    const tone = reactionToneLabel(reactionOneDayPct, reactionFiveDayPct);
    if (tone === "positive") {
      commentary.push(
        `Shares reacted positively after the ${reactionDateLabel} release, moving ${fmtSignedPercent(reactionOneDayPct)} on the first trading day and ${fmtSignedPercent(reactionFiveDayPct)} over the following week.`
      );
    } else if (tone === "negative") {
      commentary.push(
        `Shares weakened after the ${reactionDateLabel} release, falling ${fmtSignedPercent(reactionOneDayPct)} on the first trading day and ${fmtSignedPercent(reactionFiveDayPct)} over the following week.`
      );
    } else {
      commentary.push(
        `The immediate stock reaction was muted after the ${reactionDateLabel} release at ${fmtSignedPercent(reactionOneDayPct)} on day one and ${fmtSignedPercent(reactionFiveDayPct)} over the next week, pointing to an in-line or mixed read-through.`
      );
    }
  } else if (stockChangePct != null) {
    commentary.push(
      `${competitor.ticker} is ${fmtSignedPercent(stockChangePct)} over the last year, which frames how much confidence investors had already priced in before this quarter.`
    );
  }

  const { offHighPct, aboveLowPct } = distanceFromHigh(
    week52Low,
    week52High,
    latestPrice
  );
  if (offHighPct != null && aboveLowPct != null) {
    commentary.push(
      `${competitor.ticker} currently trades ${Math.abs(offHighPct).toFixed(1)}% below its 52-week high and ${aboveLowPct.toFixed(1)}% above its 52-week low, leaving sentiment constructive but not euphoric.`
    );
  }

  const opMarginA = benchmark.metrics.operatingMargin;
  const opMarginB = competitor.metrics.operatingMargin;
  if (opMarginA != null && opMarginB != null) {
    const gap = opMarginB - opMarginA;
    if (gap >= 0.5) {
      commentary.push(
        `${competitor.ticker} still carries a ${gap.toFixed(1)} pp operating-margin advantage versus ${benchmark.ticker}, which helps explain why investors may give the name more room on near-term volatility.`
      );
    } else if (gap <= -0.5) {
      commentary.push(
        `${competitor.ticker} trails ${benchmark.ticker} by ${Math.abs(gap).toFixed(1)} pp on operating margin, so any rally likely needs proof that margin pressure is stabilizing.`
      );
    } else {
      commentary.push(
        `${competitor.ticker} and ${benchmark.ticker} are close on operating margin, so investor reaction is more likely to hinge on guidance credibility and segment mix than on headline profitability alone.`
      );
    }
  }

  const fcf = competitor.metrics.freeCashFlow;
  const ni = competitor.metrics.netIncome;
  if (fcf != null || ni != null) {
    commentary.push(
      `Quarterly free cash flow was ${fmtCurrency(fcf)} and net income was ${fmtCurrency(ni)}, giving the market a direct read on earnings quality and cash backing behind the release.`
    );
  }

  const narrativeSupport = selectNarrativeSupport(
    benchmark.ticker,
    competitor.ticker,
    narrative
  );
  if (narrativeSupport) {
    commentary.push(narrativeSupport);
  }

  return commentary.slice(0, 5);
}

export async function buildCompetitorEarningsReleasePayload(params: {
  benchmark: NormalizedCompanyMetrics;
  competitor: NormalizedCompanyMetrics;
  narrative: ComparisonNarrative;
}): Promise<CompetitorEarningsReleasePayload> {
  const { benchmark, competitor, narrative } = params;
  const filingDate = normalizeDate(competitor.filingDate);

  const [stock, reaction] = await Promise.all([
    fetchStockPriceHistory({ ticker: competitor.ticker, range: "1Y" }),
    filingDate
      ? fetchStockReactionWindow({
          ticker: competitor.ticker,
          eventDate: filingDate,
        })
      : Promise.resolve(null),
  ]);

  const summary = buildReleaseSummary({
    competitor,
    stockChangePct: stock.percentChange,
    reactionOneDayPct: reaction?.oneDayChangePct ?? null,
    reactionFiveDayPct: reaction?.fiveDayChangePct ?? null,
  });

  const commentary = buildReleaseCommentary({
    benchmark,
    competitor,
    narrative,
    stockChangePct: stock.percentChange,
    reactionOneDayPct: reaction?.oneDayChangePct ?? null,
    reactionFiveDayPct: reaction?.fiveDayChangePct ?? null,
    latestPrice: stock.latestPrice,
    week52High: stock.week52High,
    week52Low: stock.week52Low,
  });

  return {
    benchmarkTicker: benchmark.ticker,
    competitorTicker: competitor.ticker,
    competitorName: competitor.companyName,
    period: competitor.quarterLabel,
    filingDate,
    stock,
    reaction,
    summary,
    commentary,
  };
}
