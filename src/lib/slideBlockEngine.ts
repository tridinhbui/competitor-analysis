/**
 * Slide Block Engine — transforms metrics into presentation-ready blocks.
 *
 * Pure functions. No I/O. Reuses extractMetrics() from the metrics engine.
 * Every block includes titles, headlines, formatted tables, chart series,
 * footnotes, and traceability metadata.
 */

import type { Filing, PeerType } from "@/types/competitor";
import type {
  SlideBlock,
  SlideBlockType,
  SlideTable,
  SlideTableRow,
  SlideCell,
  SlideColumn,
  HeadlineMetric,
  ChartSeries,
  SlideBlockMetadata,
} from "@/types/slideBlocks";
import { extractMetrics, type QuarterMetrics } from "./analysisModules";
import { deriveQuarter } from "./competitorService";
import { buildQoQBridge, buildYoYBridge, buildTTMBridge, type BridgeResult } from "./bridgeEngine";
import { buildIndustryLandscapeBlock, type LandscapeManualData } from "./landscapeEngine";
import { buildMarketVolumeBlock, buildMarketChannelBlock, buildCompetitiveOverlapBlock, type MarketDataEntry } from "./marketDataEngine";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCurrency(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const formatted =
    abs >= 1000
      ? `$${(abs / 1).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : `$${abs.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
  return v < 0 ? `(${formatted})` : formatted;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtRatio(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}x`;
}

function fmtChange(current: number | null, prior: number | null): { change: string; direction: "positive" | "negative" | "neutral" | null } {
  if (current == null || prior == null) return { change: "", direction: null };
  const diff = current - prior;
  const sign = diff > 0 ? "+" : "";
  return {
    change: `${sign}${fmtCurrency(diff).replace("$", "$")}`,
    direction: diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral",
  };
}

function fmtPctChange(current: number | null, prior: number | null): { change: string; direction: "positive" | "negative" | "neutral" | null } {
  if (current == null || prior == null || prior === 0) return { change: "", direction: null };
  const pctDiff = ((current - prior) / Math.abs(prior)) * 100;
  const sign = pctDiff > 0 ? "+" : "";
  return {
    change: `${sign}${pctDiff.toFixed(1)}%`,
    direction: pctDiff > 0 ? "positive" : pctDiff < 0 ? "negative" : "neutral",
  };
}

function fmtBpsChange(current: number | null, prior: number | null): { change: string; direction: "positive" | "negative" | "neutral" | null } {
  if (current == null || prior == null) return { change: "", direction: null };
  const bps = Math.round((current - prior) * 10);
  const sign = bps > 0 ? "+" : "";
  return {
    change: `${sign}${bps}bps`,
    direction: bps > 0 ? "positive" : bps < 0 ? "negative" : "neutral",
  };
}

function cell(display: string, raw: number | null, change?: string, direction?: "positive" | "negative" | "neutral" | null): SlideCell {
  return { display, raw, change, direction: direction ?? undefined };
}

function metricRow(label: string, cells: SlideCell[]): SlideTableRow {
  return { label, rowType: "metric", cells };
}

function subtotalRow(label: string, cells: SlideCell[]): SlideTableRow {
  return { label, rowType: "subtotal", cells };
}

function rightCol(header: string, subHeader?: string): SlideColumn {
  return { header, subHeader, align: "right" };
}

// ---------------------------------------------------------------------------
// Metric definition — reusable across blocks
// ---------------------------------------------------------------------------

type MetricKey = keyof QuarterMetrics;

interface MetricDef {
  label: string;
  key: MetricKey;
  format: "currency" | "percent" | "ratio";
  positiveGood: boolean;
  category?: "income" | "balance" | "cashflow" | "ratio" | "margin";
}

const CORE_METRICS: MetricDef[] = [
  { label: "Revenue ($M)", key: "revenue", format: "currency", positiveGood: true, category: "income" },
  { label: "Cost of Revenue ($M)", key: "costOfRevenue", format: "currency", positiveGood: false, category: "income" },
  { label: "Gross Profit ($M)", key: "grossProfit", format: "currency", positiveGood: true, category: "income" },
  { label: "SG&A ($M)", key: "sgaExpense", format: "currency", positiveGood: false, category: "income" },
  { label: "Operating Income ($M)", key: "operatingIncome", format: "currency", positiveGood: true, category: "income" },
  { label: "Net Income ($M)", key: "netIncome", format: "currency", positiveGood: true, category: "income" },
  { label: "Total Assets ($M)", key: "totalAssets", format: "currency", positiveGood: true, category: "balance" },
  { label: "Total Equity ($M)", key: "totalEquity", format: "currency", positiveGood: true, category: "balance" },
  { label: "Total Debt ($M)", key: "totalDebt", format: "currency", positiveGood: false, category: "balance" },
  { label: "Net Debt ($M)", key: "netDebt", format: "currency", positiveGood: false, category: "balance" },
  { label: "Cash ($M)", key: "cash", format: "currency", positiveGood: true, category: "balance" },
  { label: "Operating CF ($M)", key: "operatingCashFlow", format: "currency", positiveGood: true, category: "cashflow" },
  { label: "Free Cash Flow ($M)", key: "freeCashFlow", format: "currency", positiveGood: true, category: "cashflow" },
  { label: "CapEx ($M)", key: "capex", format: "currency", positiveGood: false, category: "cashflow" },
  { label: "Gross Margin", key: "grossMargin", format: "percent", positiveGood: true, category: "margin" },
  { label: "Operating Margin", key: "operatingMargin", format: "percent", positiveGood: true, category: "margin" },
  { label: "Net Margin", key: "netMargin", format: "percent", positiveGood: true, category: "margin" },
  { label: "FCF Margin", key: "fcfMargin", format: "percent", positiveGood: true, category: "margin" },
  { label: "Debt / Equity", key: "debtToEquity", format: "ratio", positiveGood: false, category: "ratio" },
  { label: "Current Ratio", key: "currentRatio", format: "ratio", positiveGood: true, category: "ratio" },
  { label: "Interest Coverage", key: "interestCoverage", format: "ratio", positiveGood: true, category: "ratio" },
  { label: "ROE", key: "roe", format: "percent", positiveGood: true, category: "ratio" },
  { label: "ROA", key: "roa", format: "percent", positiveGood: true, category: "ratio" },
];

function formatValue(v: number | null, format: "currency" | "percent" | "ratio"): string {
  switch (format) {
    case "currency": return fmtCurrency(v);
    case "percent": return fmtPct(v);
    case "ratio": return fmtRatio(v);
  }
}

function changeForFormat(current: number | null, prior: number | null, format: "currency" | "percent" | "ratio") {
  switch (format) {
    case "currency": return fmtChange(current, prior);
    case "percent": return fmtBpsChange(current, prior);
    case "ratio": {
      if (current == null || prior == null) return { change: "", direction: null as "positive" | "negative" | "neutral" | null };
      const diff = current - prior;
      return { change: `${diff > 0 ? "+" : ""}${diff.toFixed(2)}x`, direction: (diff > 0 ? "positive" : diff < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral" };
    }
  }
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

function buildMeta(
  sourceModule: string,
  subjectTicker: string,
  peerTickers: string[],
  metrics: QuarterMetrics[],
  missing: string[] = []
): SlideBlockMetadata {
  const sorted = [...metrics].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return {
    sourceModule,
    subjectTicker,
    peerTickers,
    quarterRange: {
      from: sorted[0]?.quarterLabel ?? "—",
      to: sorted[sorted.length - 1]?.quarterLabel ?? "—",
    },
    generatedAt: new Date().toISOString(),
    completeness: missing.length === 0 ? "full" : "partial",
    missingData: missing,
  };
}

// ---------------------------------------------------------------------------
// Block 1: Benchmark Table
// ---------------------------------------------------------------------------

function buildBenchmarkBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  const latest = subject[0];
  if (!latest) return null;

  const allLatest: QuarterMetrics[] = [latest];
  for (const [, m] of peers) if (m.length > 0) allLatest.push(m[0]);

  const hasPeers = allLatest.length > 1;
  const blockId = `benchmark-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  // Columns
  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...allLatest.map((m) => rightCol(m.ticker, m.quarterLabel)),
  ];

  // Select key metrics for benchmark
  const benchMetrics = CORE_METRICS.filter((d) =>
    ["revenue", "netIncome", "totalAssets", "totalEquity", "totalDebt",
     "freeCashFlow", "grossMargin", "operatingMargin", "netMargin",
     "debtToEquity", "currentRatio", "roe"].includes(d.key)
  );

  const rows: SlideTableRow[] = benchMetrics.map((def) =>
    metricRow(def.label, allLatest.map((m) =>
      cell(formatValue(m[def.key] as number | null, def.format), m[def.key] as number | null)
    ))
  );

  // Headlines
  const headlines: HeadlineMetric[] = [];
  if (latest.revenue != null) headlines.push({ label: "Revenue", value: fmtCurrency(latest.revenue) + "M" });
  if (latest.netMargin != null) headlines.push({ label: "Net Margin", value: fmtPct(latest.netMargin) });
  if (latest.debtToEquity != null) headlines.push({ label: "D/E Ratio", value: fmtRatio(latest.debtToEquity) });

  // Chart: revenue comparison bar chart
  const chartSeries: ChartSeries[] = [{
    name: "Revenue ($M)",
    data: allLatest.map((m) => ({ label: m.ticker, value: m.revenue })),
  }];

  const missing: string[] = [];
  if (!hasPeers) missing.push("No peer companies for comparison");

  return {
    blockId,
    blockType: "benchmark-table",
    title: `Key Financial Metrics — ${latest.quarterLabel}`,
    subtitle: hasPeers
      ? `${latest.companyName} vs. ${allLatest.length - 1} peer(s)`
      : latest.companyName,
    headlines,
    table: { columns, rows },
    chartSeries,
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "All dollar values in millions ($M) unless otherwise noted.",
    ],
    assumptions: [
      "Metrics reflect the most recent quarter on file for each company.",
      "Margin calculations use reported revenue as denominator.",
    ],
    metadata: buildMeta("benchmark-table", latest.ticker, allLatest.slice(1).map((m) => m.ticker), allLatest, missing),
  };
}

// ---------------------------------------------------------------------------
// Block 2: Quarterly Trend
// ---------------------------------------------------------------------------

function buildQuarterlyTrendBlock(subject: QuarterMetrics[]): SlideBlock | null {
  if (subject.length === 0) return null;

  const sorted = [...subject].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const latest = sorted[sorted.length - 1];
  const blockId = `quarterly-trend-${latest.ticker}`;

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...sorted.map((m) => rightCol(m.quarterLabel)),
  ];

  const trendMetrics = CORE_METRICS.filter((d) =>
    ["revenue", "grossProfit", "operatingIncome", "netIncome",
     "grossMargin", "operatingMargin", "netMargin",
     "totalAssets", "totalDebt", "freeCashFlow"].includes(d.key)
  );

  const rows: SlideTableRow[] = trendMetrics.map((def) =>
    metricRow(def.label, sorted.map((m) =>
      cell(formatValue(m[def.key] as number | null, def.format), m[def.key] as number | null)
    ))
  );

  // Chart series for key trends
  const chartSeries: ChartSeries[] = [
    { name: "Revenue ($M)", data: sorted.map((m) => ({ label: m.quarterLabel, value: m.revenue })) },
    { name: "Net Income ($M)", data: sorted.map((m) => ({ label: m.quarterLabel, value: m.netIncome })) },
    { name: "Net Margin %", color: "line", data: sorted.map((m) => ({ label: m.quarterLabel, value: m.netMargin })) },
  ];

  const headlines: HeadlineMetric[] = [];
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.netIncome != null && last.netIncome != null) {
      const chg = fmtPctChange(last.netIncome, first.netIncome);
      headlines.push({
        label: "Net Income Change",
        value: chg.change || "—",
        comparison: `${first.quarterLabel} → ${last.quarterLabel}`,
        direction: chg.direction ?? undefined,
      });
    }
  }

  return {
    blockId,
    blockType: "quarterly-trend",
    title: `Quarterly Financial Trends — ${sorted[0].quarterLabel} to ${latest.quarterLabel}`,
    subtitle: `${latest.companyName} · ${sorted.length} quarters`,
    headlines,
    table: { columns, rows },
    chartSeries,
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "All dollar values in millions ($M).",
    ],
    assumptions: [
      "Each column represents one fiscal quarter as reported.",
      "Margin percentages calculated from reported revenue.",
    ],
    metadata: buildMeta("quarterly-trend", latest.ticker, [], sorted),
  };
}

// ---------------------------------------------------------------------------
// Block 3: Sequential Comparison
// ---------------------------------------------------------------------------

function buildSequentialBlock(subject: QuarterMetrics[]): SlideBlock | null {
  const sorted = [...subject].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  if (sorted.length < 2) return null;

  const current = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2];
  const blockId = `sequential-${current.ticker}-${current.quarterLabel.replace(/\s/g, "-")}`;

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    rightCol(prior.quarterLabel),
    rightCol(current.quarterLabel),
    rightCol("Change"),
    rightCol("% Change"),
  ];

  const seqMetrics = CORE_METRICS.filter((d) =>
    ["revenue", "grossProfit", "operatingIncome", "netIncome",
     "grossMargin", "operatingMargin", "netMargin",
     "totalAssets", "totalDebt", "freeCashFlow", "operatingCashFlow"].includes(d.key)
  );

  const rows: SlideTableRow[] = seqMetrics.map((def) => {
    const priorVal = prior[def.key] as number | null;
    const currentVal = current[def.key] as number | null;
    const absChange = changeForFormat(currentVal, priorVal, def.format);
    const pctChg = def.format === "currency" ? fmtPctChange(currentVal, priorVal) : { change: "", direction: null };

    return metricRow(def.label, [
      cell(formatValue(priorVal, def.format), priorVal),
      cell(formatValue(currentVal, def.format), currentVal),
      cell(absChange.change || "—", null, undefined, absChange.direction),
      cell(pctChg.change || "—", null, undefined, pctChg.direction),
    ]);
  });

  const headlines: HeadlineMetric[] = [];
  if (current.revenue != null && prior.revenue != null) {
    const chg = fmtPctChange(current.revenue, prior.revenue);
    headlines.push({ label: "Revenue", value: chg.change || "—", comparison: "QoQ", direction: chg.direction ?? undefined });
  }
  if (current.netIncome != null && prior.netIncome != null) {
    const chg = fmtPctChange(current.netIncome, prior.netIncome);
    headlines.push({ label: "Net Income", value: chg.change || "—", comparison: "QoQ", direction: chg.direction ?? undefined });
  }
  if (current.netMargin != null && prior.netMargin != null) {
    const chg = fmtBpsChange(current.netMargin, prior.netMargin);
    headlines.push({ label: "Net Margin", value: chg.change || "—", comparison: "QoQ", direction: chg.direction ?? undefined });
  }

  // Build grouped bar chart series for key currency metrics
  const seqCurrencyDefs = seqMetrics.filter((d) => d.format === "currency").slice(0, 4);
  const chartSeries: ChartSeries[] = [
    { name: prior.quarterLabel, data: seqCurrencyDefs.map((def) => ({ label: def.label, value: prior[def.key] as number | null })) },
    { name: current.quarterLabel, data: seqCurrencyDefs.map((def) => ({ label: def.label, value: current[def.key] as number | null })) },
  ];

  return {
    blockId,
    blockType: "sequential-comparison",
    title: `Sequential Comparison — ${prior.quarterLabel} vs. ${current.quarterLabel}`,
    subtitle: current.companyName,
    headlines,
    table: { columns, rows },
    chartSeries,
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "All dollar values in millions ($M).",
      "% Change calculated on absolute basis.",
    ],
    assumptions: [
      "Comparison reflects two consecutive quarters as filed.",
    ],
    metadata: buildMeta("sequential-comparison", current.ticker, [], [prior, current]),
  };
}

// ---------------------------------------------------------------------------
// Block 4: YoY Comparison
// ---------------------------------------------------------------------------

function buildYoYBlock(subject: QuarterMetrics[]): SlideBlock | null {
  // Find latest quarter and its year-ago counterpart
  const sorted = [...subject].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const latest = sorted[0];
  if (!latest) return null;

  const latestQ = deriveQuarter(latest.periodEnd);
  const yearAgo = sorted.find((m) => {
    const q = deriveQuarter(m.periodEnd);
    return q.fiscalQuarter === latestQ.fiscalQuarter && q.fiscalYear === latestQ.fiscalYear - 1;
  });

  if (!yearAgo) {
    // Can't build YoY without matching quarter
    return null;
  }

  const blockId = `yoy-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    rightCol(`${latestQ.fiscalQuarter === deriveQuarter(yearAgo.periodEnd).fiscalQuarter ? "Q" + latestQ.fiscalQuarter : yearAgo.quarterLabel} ${deriveQuarter(yearAgo.periodEnd).fiscalYear}`),
    rightCol(`${latestQ.fiscalQuarter === deriveQuarter(yearAgo.periodEnd).fiscalQuarter ? "Q" + latestQ.fiscalQuarter : latest.quarterLabel} ${latestQ.fiscalYear}`),
    rightCol("Change"),
    rightCol("% Change"),
  ];

  const yoyMetrics = CORE_METRICS.filter((d) =>
    ["revenue", "grossProfit", "operatingIncome", "netIncome",
     "grossMargin", "operatingMargin", "netMargin",
     "totalAssets", "totalDebt", "freeCashFlow"].includes(d.key)
  );

  const rows: SlideTableRow[] = yoyMetrics.map((def) => {
    const priorVal = yearAgo[def.key] as number | null;
    const currentVal = latest[def.key] as number | null;
    const absChange = changeForFormat(currentVal, priorVal, def.format);
    const pctChg = def.format === "currency" ? fmtPctChange(currentVal, priorVal) : { change: "", direction: null };

    return metricRow(def.label, [
      cell(formatValue(priorVal, def.format), priorVal),
      cell(formatValue(currentVal, def.format), currentVal),
      cell(absChange.change || "—", null, undefined, absChange.direction),
      cell(pctChg.change || "—", null, undefined, pctChg.direction),
    ]);
  });

  const headlines: HeadlineMetric[] = [];
  if (latest.revenue != null && yearAgo.revenue != null) {
    const chg = fmtPctChange(latest.revenue, yearAgo.revenue);
    headlines.push({ label: "Revenue", value: chg.change || "—", comparison: "YoY", direction: chg.direction ?? undefined });
  }
  if (latest.netMargin != null && yearAgo.netMargin != null) {
    const chg = fmtBpsChange(latest.netMargin, yearAgo.netMargin);
    headlines.push({ label: "Net Margin", value: chg.change || "—", comparison: "YoY", direction: chg.direction ?? undefined });
  }

  // Build grouped bar chart series for key currency metrics
  const yoyCurrencyDefs = yoyMetrics.filter((d) => d.format === "currency").slice(0, 4);
  const chartSeries: ChartSeries[] = [
    { name: yearAgo.quarterLabel, data: yoyCurrencyDefs.map((def) => ({ label: def.label, value: yearAgo[def.key] as number | null })) },
    { name: latest.quarterLabel, data: yoyCurrencyDefs.map((def) => ({ label: def.label, value: latest[def.key] as number | null })) },
  ];

  return {
    blockId,
    blockType: "yoy-comparison",
    title: `Year-over-Year Comparison — Q${latestQ.fiscalQuarter}`,
    subtitle: `${latest.companyName} · ${deriveQuarter(yearAgo.periodEnd).fiscalYear} vs. ${latestQ.fiscalYear}`,
    headlines,
    table: { columns, rows },
    chartSeries,
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "All dollar values in millions ($M).",
    ],
    assumptions: [
      `Compares Q${latestQ.fiscalQuarter} ${deriveQuarter(yearAgo.periodEnd).fiscalYear} with Q${latestQ.fiscalQuarter} ${latestQ.fiscalYear}.`,
    ],
    metadata: buildMeta("yoy-comparison", latest.ticker, [], [yearAgo, latest]),
  };
}

// ---------------------------------------------------------------------------
// Block 5: TTM Comparison
// ---------------------------------------------------------------------------

function buildTTMBlock(subject: QuarterMetrics[]): SlideBlock | null {
  const sorted = [...subject].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  if (sorted.length < 4) return null;

  const latest4 = sorted.slice(-4);
  const latestLabel = latest4[latest4.length - 1].quarterLabel;
  const ticker = latest4[0].ticker;
  const blockId = `ttm-${ticker}-${latestLabel.replace(/\s/g, "-")}`;

  function sumField(metrics: QuarterMetrics[], key: MetricKey): number | null {
    const vals = metrics.map((m) => m[key] as number | null).filter((v) => v != null) as number[];
    return vals.length === 0 ? null : Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
  }

  // Build TTM windows
  const windows: Array<{ label: string; metrics: QuarterMetrics[] }> = [];
  for (let i = 3; i < sorted.length; i++) {
    windows.push({
      label: `TTM ${sorted[i].quarterLabel}`,
      metrics: sorted.slice(i - 3, i + 1),
    });
  }

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...windows.map((w) => rightCol(w.label)),
  ];

  const ttmFlowMetrics: MetricDef[] = CORE_METRICS.filter((d) =>
    ["revenue", "grossProfit", "operatingIncome", "netIncome",
     "operatingCashFlow", "freeCashFlow", "capex"].includes(d.key)
  );

  const rows: SlideTableRow[] = ttmFlowMetrics.map((def) =>
    metricRow(def.label, windows.map((w) =>
      cell(fmtCurrency(sumField(w.metrics, def.key)), sumField(w.metrics, def.key))
    ))
  );

  // Add TTM margins
  rows.push(
    metricRow("TTM Net Margin", windows.map((w) => {
      const rev = sumField(w.metrics, "revenue");
      const ni = sumField(w.metrics, "netIncome");
      const margin = rev && ni ? Math.round((ni / rev) * 1000) / 10 : null;
      return cell(fmtPct(margin), margin);
    })),
    metricRow("TTM FCF Margin", windows.map((w) => {
      const rev = sumField(w.metrics, "revenue");
      const fcf = sumField(w.metrics, "freeCashFlow");
      const margin = rev && fcf ? Math.round((fcf / rev) * 1000) / 10 : null;
      return cell(fmtPct(margin), margin);
    }))
  );

  const ttmRevenue = sumField(latest4, "revenue");
  const ttmNI = sumField(latest4, "netIncome");
  const headlines: HeadlineMetric[] = [];
  if (ttmRevenue != null) headlines.push({ label: "TTM Revenue", value: fmtCurrency(ttmRevenue) + "M" });
  if (ttmNI != null) headlines.push({ label: "TTM Net Income", value: fmtCurrency(ttmNI) + "M" });

  const chartSeries: ChartSeries[] = [{
    name: "TTM Revenue ($M)",
    data: windows.map((w) => ({ label: w.label, value: sumField(w.metrics, "revenue") })),
  }];

  return {
    blockId,
    blockType: "ttm-comparison",
    title: `Trailing Twelve Months — Ending ${latestLabel}`,
    subtitle: `${latest4[0].companyName} · ${windows.length} TTM window(s)`,
    headlines,
    table: { columns, rows },
    chartSeries,
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "TTM calculated as sum of four consecutive quarters for flow metrics.",
      "All dollar values in millions ($M).",
    ],
    assumptions: [
      "TTM aggregation uses simple sum for income and cash flow items.",
      "Margin percentages use TTM revenue as denominator.",
    ],
    metadata: buildMeta("ttm-comparison", ticker, [], sorted),
  };
}

// ---------------------------------------------------------------------------
// Block 6: SG&A Comparison
// ---------------------------------------------------------------------------

function buildSGABlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  const latest = subject[0];
  if (!latest) return null;

  const allLatest: QuarterMetrics[] = [latest];
  for (const [, m] of peers) if (m.length > 0) allLatest.push(m[0]);

  const blockId = `sga-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...allLatest.map((m) => rightCol(m.ticker, m.quarterLabel)),
  ];

  function sgaPctOfRevenue(m: QuarterMetrics): number | null {
    if (m.sgaExpense == null || m.revenue == null || m.revenue === 0) return null;
    return Math.round((m.sgaExpense / m.revenue) * 1000) / 10;
  }
  function sgaPctOfGross(m: QuarterMetrics): number | null {
    if (m.sgaExpense == null || m.grossProfit == null || m.grossProfit === 0) return null;
    return Math.round((m.sgaExpense / m.grossProfit) * 1000) / 10;
  }

  const rows: SlideTableRow[] = [
    metricRow("Revenue ($M)", allLatest.map((m) => cell(fmtCurrency(m.revenue), m.revenue))),
    metricRow("Cost of Revenue ($M)", allLatest.map((m) => cell(fmtCurrency(m.costOfRevenue), m.costOfRevenue))),
    subtotalRow("Gross Profit ($M)", allLatest.map((m) => cell(fmtCurrency(m.grossProfit), m.grossProfit))),
    metricRow("Gross Margin", allLatest.map((m) => cell(fmtPct(m.grossMargin), m.grossMargin))),
    metricRow("SG&A ($M)", allLatest.map((m) => cell(fmtCurrency(m.sgaExpense), m.sgaExpense))),
    metricRow("SG&A / Revenue", allLatest.map((m) => cell(fmtPct(sgaPctOfRevenue(m)), sgaPctOfRevenue(m)))),
    metricRow("SG&A / Gross Profit", allLatest.map((m) => cell(fmtPct(sgaPctOfGross(m)), sgaPctOfGross(m)))),
    subtotalRow("Operating Income ($M)", allLatest.map((m) => cell(fmtCurrency(m.operatingIncome), m.operatingIncome))),
    metricRow("Operating Margin", allLatest.map((m) => cell(fmtPct(m.operatingMargin), m.operatingMargin))),
  ];

  const missing: string[] = [];
  if (allLatest.length < 2) missing.push("No peer companies for SG&A comparison");
  if (latest.sgaExpense == null) missing.push("SG&A expense not available for subject company");

  return {
    blockId,
    blockType: "sga-comparison",
    title: `SG&A Expense Analysis — ${latest.quarterLabel}`,
    subtitle: allLatest.length > 1
      ? `${latest.companyName} vs. ${allLatest.length - 1} peer(s)`
      : latest.companyName,
    headlines: latest.sgaExpense != null && latest.revenue != null
      ? [{ label: "SG&A / Revenue", value: fmtPct(sgaPctOfRevenue(latest)) }]
      : [],
    table: { columns, rows },
    chartSeries: [{
      name: "SG&A / Revenue %",
      data: allLatest.map((m) => ({ label: m.ticker, value: sgaPctOfRevenue(m) })),
    }],
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "SG&A = Selling, General & Administrative expense as reported.",
    ],
    assumptions: [
      "SG&A ratios use reported revenue and gross profit as denominators.",
    ],
    metadata: buildMeta("sga-comparison", latest.ticker, allLatest.slice(1).map((m) => m.ticker), allLatest, missing),
  };
}

// ---------------------------------------------------------------------------
// Block 7: Appendix Historical
// ---------------------------------------------------------------------------

function buildAppendixBlock(subject: QuarterMetrics[]): SlideBlock | null {
  if (subject.length === 0) return null;

  const sorted = [...subject].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const ticker = sorted[0].ticker;
  const blockId = `appendix-${ticker}`;

  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...sorted.map((m) => rightCol(m.quarterLabel, m.periodEnd)),
  ];

  // Balance Sheet section
  const bsMetrics = CORE_METRICS.filter((d) => d.category === "balance");
  const isMetrics = CORE_METRICS.filter((d) => d.category === "income");
  const cfMetrics = CORE_METRICS.filter((d) => d.category === "cashflow");
  const ratioMetrics = CORE_METRICS.filter((d) => d.category === "ratio" || d.category === "margin");

  function sectionRows(metrics: MetricDef[]): SlideTableRow[] {
    return metrics.map((def) =>
      metricRow(def.label, sorted.map((m) =>
        cell(formatValue(m[def.key] as number | null, def.format), m[def.key] as number | null)
      ))
    );
  }

  const rows: SlideTableRow[] = [
    { label: "Balance Sheet", rowType: "header", cells: sorted.map(() => cell("", null)) },
    ...sectionRows(bsMetrics),
    { label: "Income Statement", rowType: "header", cells: sorted.map(() => cell("", null)) },
    ...sectionRows(isMetrics),
    { label: "Cash Flow", rowType: "header", cells: sorted.map(() => cell("", null)) },
    ...sectionRows(cfMetrics),
    { label: "Ratios & Margins", rowType: "header", cells: sorted.map(() => cell("", null)) },
    ...sectionRows(ratioMetrics),
  ];

  return {
    blockId,
    blockType: "appendix-historical",
    title: `Historical Financial Data — ${sorted[0].quarterLabel} to ${sorted[sorted.length - 1].quarterLabel}`,
    subtitle: `${sorted[0].companyName} · ${sorted.length} quarters`,
    headlines: [],
    table: { columns, rows },
    chartSeries: [],
    footnotes: [
      "Source: SEC EDGAR 10-Q/10-K filings.",
      "All dollar values in millions ($M).",
      "Ratios and margins derived from reported financials.",
    ],
    assumptions: [
      "Data as reported; no adjustments applied.",
      "Fiscal quarter mapping uses calendar quarter convention.",
    ],
    metadata: buildMeta("appendix-historical", ticker, [], sorted),
  };
}

// ---------------------------------------------------------------------------
// Block 8: Narrative Block
// ---------------------------------------------------------------------------

function buildNarrativeBlock(
  narrative: {
    type: string;
    title: string;
    body: string;
    date: string;
    stockPriceReaction?: string;
    segmentHighlights?: Array<{ segmentName: string; operatingIncome: number | null; yoyChange: string }>;
    sourceLinks?: Array<{ label: string; url: string }>;
  },
  ticker: string
): SlideBlock {
  const blockId = `narrative-${ticker}-${narrative.date.replace(/\W/g, "")}`;

  const headlines: HeadlineMetric[] = [];
  if (narrative.stockPriceReaction) {
    headlines.push({ label: "Stock Reaction", value: narrative.stockPriceReaction });
  }

  // Build segment highlights table if present
  const table: SlideTable = { columns: [], rows: [] };
  if (narrative.segmentHighlights && narrative.segmentHighlights.length > 0) {
    table.columns = [
      { header: "Segment", align: "left" },
      { header: "Operating Income ($MM)", align: "right" },
      { header: "YoY Change", align: "right" },
    ];
    table.rows = narrative.segmentHighlights.map((sh) => ({
      label: sh.segmentName,
      rowType: "metric" as const,
      cells: [
        { display: sh.operatingIncome != null ? `$${sh.operatingIncome}MM` : "—", raw: sh.operatingIncome },
        { display: sh.yoyChange, raw: null },
      ],
    }));
  }

  return {
    blockId,
    blockType: "narrative-block",
    title: narrative.title,
    subtitle: narrative.date,
    headlines,
    table,
    chartSeries: [],
    footnotes: [],
    assumptions: [],
    metadata: {
      sourceModule: "narrative-block",
      subjectTicker: ticker,
      peerTickers: [],
      quarterRange: { from: narrative.date, to: narrative.date },
      generatedAt: new Date().toISOString(),
      completeness: "full",
      missingData: [],
    },
    narrativeBody: narrative.body,
    segmentHighlights: narrative.segmentHighlights,
    sourceLinks: narrative.sourceLinks,
  };
}

// ---------------------------------------------------------------------------
// Block 9: Guidance Table
// ---------------------------------------------------------------------------

function buildGuidanceBlock(
  entries: Array<{
    fiscalYear: number;
    metric: string;
    metricLabel: string;
    low: number | null;
    high: number | null;
    midpoint: number | null;
    unit: string;
    asOfDate: string;
    source: string;
    consensus?: number | null;
    actual?: number | null;
  }>,
  ticker: string
): SlideBlock | null {
  if (entries.length === 0) return null;

  const blockId = `guidance-${ticker}`;

  // Group by metric
  const byMetric = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.fiscalYear}-${e.metric}`;
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(e);
  }

  // Build table: one row per guidance entry
  const columns: SlideColumn[] = [
    { header: "Metric", align: "left" },
    { header: "FY", align: "right" },
    { header: "Low", align: "right" },
    { header: "High", align: "right" },
    { header: "Midpoint", align: "right" },
    { header: "Consensus", align: "right" },
    { header: "Actual", align: "right" },
    { header: "As Of", align: "right" },
  ];

  function fmtVal(v: number | null, unit: string): string {
    if (v == null) return "—";
    if (unit === "eps") return `$${v.toFixed(2)}`;
    if (unit === "dollars-b") return `$${v.toFixed(1)}B`;
    if (unit === "dollars-mm") return `$${v.toLocaleString()}MM`;
    if (unit === "percent") return `${v.toFixed(1)}%`;
    return String(v);
  }

  const rows: SlideTableRow[] = entries.map((e) => ({
    label: e.metricLabel,
    rowType: "metric" as const,
    cells: [
      { display: `FY${e.fiscalYear}`, raw: e.fiscalYear },
      { display: fmtVal(e.low, e.unit), raw: e.low },
      { display: fmtVal(e.high, e.unit), raw: e.high },
      { display: fmtVal(e.midpoint, e.unit), raw: e.midpoint },
      { display: e.consensus != null ? fmtVal(e.consensus, e.unit) : "—", raw: e.consensus ?? null },
      { display: e.actual != null ? fmtVal(e.actual, e.unit) : "—", raw: e.actual ?? null },
      { display: e.asOfDate, raw: null },
    ],
  }));

  return {
    blockId,
    blockType: "guidance-table",
    title: `Guidance Progression — ${ticker}`,
    subtitle: `${entries.length} guidance entries`,
    headlines: [],
    table: { columns, rows },
    chartSeries: [],
    footnotes: ["Source: Company earnings calls, press releases, and SEC filings."],
    assumptions: ["Guidance figures as reported by management on the stated date."],
    metadata: {
      sourceModule: "guidance-table",
      subjectTicker: ticker,
      peerTickers: [],
      quarterRange: { from: entries[0]?.asOfDate ?? "—", to: entries[entries.length - 1]?.asOfDate ?? "—" },
      generatedAt: new Date().toISOString(),
      completeness: "full",
      missingData: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Block 10-12: OP Bridge (QoQ, YoY, TTM)
// ---------------------------------------------------------------------------

function bridgeToSlideBlock(
  bridge: BridgeResult,
  blockType: "op-bridge-qoq" | "op-bridge-yoy" | "op-bridge-ttm",
  ticker: string,
  metrics: QuarterMetrics[]
): SlideBlock {
  const blockId = `${blockType}-${ticker}-${bridge.endLabel.replace(/\s/g, "-")}`;

  const columns: SlideColumn[] = [
    { header: "Component", align: "left" },
    rightCol("Amount ($MM)"),
    rightCol("Running Total"),
  ];

  const rows: SlideTableRow[] = bridge.components.map((c) => ({
    label: c.label,
    rowType: c.type === "start" || c.type === "end" ? ("subtotal" as const) : ("metric" as const),
    cells: [
      cell(
        c.type === "delta"
          ? `${c.value > 0 ? "+" : ""}${fmtCurrency(c.value)}`
          : fmtCurrency(c.value),
        c.value,
        undefined,
        c.type === "delta"
          ? c.value > 0 ? "positive" : c.value < 0 ? "negative" : "neutral"
          : undefined
      ),
      cell(fmtCurrency(c.runningTotal), c.runningTotal),
    ],
  }));

  const changeDir = bridge.totalChange > 0 ? "positive" : bridge.totalChange < 0 ? "negative" : "neutral";

  return {
    blockId,
    blockType,
    title: `OP Bridge — ${bridge.description}`,
    subtitle: `${ticker} · ${bridge.startLabel} → ${bridge.endLabel}`,
    headlines: [
      { label: bridge.startLabel, value: fmtCurrency(bridge.startOP) },
      { label: bridge.endLabel, value: fmtCurrency(bridge.endOP) },
      {
        label: "Change",
        value: `${bridge.totalChange > 0 ? "+" : ""}${fmtCurrency(bridge.totalChange)}`,
        direction: changeDir as "positive" | "negative" | "neutral",
      },
    ],
    table: { columns, rows },
    chartSeries: [],
    footnotes: ["Bridge decomposes OP change into revenue mix, cost of sales, SG&A, and other components."],
    assumptions: ["Revenue mix impact estimated using prior-period margin."],
    metadata: buildMeta(blockType, ticker, [], metrics),
    // Store bridge components for waterfall rendering
    bridgeComponents: bridge.components,
  };
}

// ---------------------------------------------------------------------------
// Block 13: Segment Margin Comparison
// ---------------------------------------------------------------------------

function buildSegmentMarginBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  const latest = subject[0];
  if (!latest || latest.segments.length === 0) return null;

  const blockId = `segment-margin-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  // Collect all tickers that have segment data
  const allLatest: { ticker: string; metrics: QuarterMetrics }[] = [
    { ticker: latest.ticker, metrics: latest },
  ];
  for (const [ticker, m] of peers) {
    if (m.length > 0 && m[0].segments.length > 0) {
      allLatest.push({ ticker, metrics: m[0] });
    }
  }

  // Columns: Segment | Subject Margin | Peer1 Margin | ...
  const columns: SlideColumn[] = [
    { header: "Segment", align: "left" },
    ...allLatest.map((e) => rightCol(e.ticker, `OP Margin`)),
    ...allLatest.map((e) => rightCol(e.ticker, `OP ($MM)`)),
  ];

  // Build rows for each segment of the subject company
  const rows: SlideTableRow[] = [];
  for (const seg of latest.segments) {
    const cells: SlideCell[] = [];
    // Margin columns
    for (const entry of allLatest) {
      const match = entry.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const margin = match?.operatingMargin ?? null;
      cells.push(cell(fmtPct(margin), margin));
    }
    // OP columns
    for (const entry of allLatest) {
      const match = entry.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const oi = match?.operatingIncome ?? null;
      cells.push(cell(fmtCurrency(oi), oi));
    }
    rows.push(metricRow(seg.segmentName, cells));
  }

  // Chart series: one series per company showing segment margins
  const chartSeries: ChartSeries[] = allLatest.map((entry) => ({
    name: entry.ticker,
    data: entry.metrics.segments.map((s) => ({
      label: s.segmentName,
      value: s.operatingMargin,
    })),
  }));

  const peerTickers = allLatest.slice(1).map((e) => e.ticker);
  const missing: string[] = [];
  for (const entry of allLatest) {
    if (entry.metrics.segments.length === 0) {
      missing.push(`${entry.ticker}: no segment data`);
    }
  }

  return {
    blockId,
    blockType: "segment-margin-comparison",
    title: `Segment Operating Margin Comparison — ${latest.quarterLabel}`,
    subtitle: `${allLatest.map((e) => e.ticker).join(" vs ")}`,
    headlines: latest.segments.slice(0, 3).map((s) => ({
      label: s.segmentName,
      value: fmtPct(s.operatingMargin),
      direction: s.operatingMargin != null
        ? s.operatingMargin > 0 ? "positive" : s.operatingMargin < 0 ? "negative" : "neutral"
        : undefined,
    })),
    table: { columns, rows },
    chartSeries,
    footnotes: ["Segment margins based on reported operating income / revenue."],
    assumptions: [],
    metadata: buildMeta("segment-margin-comparison", latest.ticker, peerTickers, [latest], missing),
  };
}

// ---------------------------------------------------------------------------
// Block 11: Segment Revenue Composition
// ---------------------------------------------------------------------------

function buildSegmentRevenueCompositionBlock(
  subject: QuarterMetrics[]
): SlideBlock | null {
  // Need at least 2 quarters for trend
  const withSegments = subject.filter((m) => m.segments.length > 0);
  if (withSegments.length === 0) return null;

  const latest = withSegments[0];
  const blockId = `segment-revenue-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  // Use up to 8 quarters
  const quarters = withSegments.slice(0, 8).reverse();

  // Columns: Segment | Q1 | Q2 | ...
  const columns: SlideColumn[] = [
    { header: "Segment", align: "left" },
    ...quarters.map((q) => rightCol(q.quarterLabel)),
  ];

  // Get unique segment names from latest
  const segNames = latest.segments.map((s) => s.segmentName);

  // Revenue rows
  const rows: SlideTableRow[] = [];
  rows.push({ label: "Revenue ($MM)", rowType: "header", cells: [] });
  for (const name of segNames) {
    const cells: SlideCell[] = quarters.map((q) => {
      const seg = q.segments.find((s) => s.segmentName === name);
      const rev = seg?.revenue ?? null;
      return cell(fmtCurrency(rev), rev);
    });
    rows.push(metricRow(name, cells));
  }

  // Total revenue row
  rows.push(subtotalRow("Total Revenue", quarters.map((q) => {
    const total = q.segments.reduce((sum, s) => sum + (s.revenue ?? 0), 0);
    return cell(fmtCurrency(total), total);
  })));

  // Margin rows
  rows.push({ label: "", rowType: "spacer", cells: [] });
  rows.push({ label: "Operating Margin", rowType: "header", cells: [] });
  for (const name of segNames) {
    const cells: SlideCell[] = quarters.map((q) => {
      const seg = q.segments.find((s) => s.segmentName === name);
      const margin = seg?.operatingMargin ?? null;
      return cell(fmtPct(margin), margin);
    });
    rows.push(metricRow(name, cells));
  }

  // Chart series — stacked bar (revenue) + line overlay (margin) for latest
  const chartSeries: ChartSeries[] = [
    // Revenue per segment as chart series
    ...segNames.map((name) => ({
      name: `${name} Revenue`,
      data: quarters.map((q) => ({
        label: q.quarterLabel,
        value: q.segments.find((s) => s.segmentName === name)?.revenue ?? null,
      })),
    })),
    // Margin line per segment
    ...segNames.map((name) => ({
      name: `${name} Margin`,
      color: "line",
      data: quarters.map((q) => ({
        label: q.quarterLabel,
        value: q.segments.find((s) => s.segmentName === name)?.operatingMargin ?? null,
      })),
    })),
  ];

  return {
    blockId,
    blockType: "segment-revenue-composition",
    title: `Segment Revenue & Margin Trend — ${latest.ticker}`,
    subtitle: `${quarters[0].quarterLabel} → ${quarters[quarters.length - 1].quarterLabel}`,
    headlines: segNames.slice(0, 3).map((name) => {
      const seg = latest.segments.find((s) => s.segmentName === name);
      const pct = seg && latest.segments.reduce((sum, s) => sum + (s.revenue ?? 0), 0) > 0
        ? ((seg.revenue ?? 0) / latest.segments.reduce((sum, s) => sum + (s.revenue ?? 0), 0) * 100)
        : null;
      return {
        label: name,
        value: pct != null ? `${pct.toFixed(0)}% of rev` : "—",
      };
    }),
    table: { columns, rows },
    chartSeries,
    footnotes: ["Segment breakdown as reported. Intercompany eliminations excluded."],
    assumptions: [],
    metadata: buildMeta("segment-revenue-composition", latest.ticker, [], withSegments),
  };
}

// ---------------------------------------------------------------------------
// Block 12: Margin Gap Trend
// ---------------------------------------------------------------------------

function buildMarginGapTrendBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  if (subject.length < 2) return null;

  // Find the first peer with segment data
  let peerTicker: string | null = null;
  let peerData: QuarterMetrics[] = [];
  for (const [ticker, m] of peers) {
    if (m.length >= 2 && m.some((q) => q.segments.length > 0)) {
      peerTicker = ticker;
      peerData = m;
      break;
    }
  }

  // Fall back to consolidated margin gap if no segment data
  const subjectQuarters = subject.slice(0, 12).reverse();
  const blockId = `margin-gap-${subject[0].ticker}-${subject[0].quarterLabel.replace(/\s/g, "-")}`;

  // Columns: Quarter | Subject Margin | Peer Margin | Gap
  const columns: SlideColumn[] = [
    { header: "Quarter", align: "left" },
    rightCol(subject[0].ticker, "OP Margin"),
    ...(peerTicker ? [rightCol(peerTicker, "OP Margin")] : []),
    rightCol("Gap", "bps"),
  ];

  const rows: SlideTableRow[] = subjectQuarters.map((sq) => {
    const subMargin = sq.operatingMargin;
    const peerQ = peerData.find((p) => p.periodEnd === sq.periodEnd);
    const peerMargin = peerQ?.operatingMargin ?? null;
    const gap = subMargin != null && peerMargin != null
      ? Math.round((subMargin - peerMargin) * 10)
      : null;
    const gapDir = gap != null ? (gap > 0 ? "positive" : gap < 0 ? "negative" : "neutral") : undefined;

    const cells: SlideCell[] = [
      cell(fmtPct(subMargin), subMargin),
      ...(peerTicker ? [cell(fmtPct(peerMargin), peerMargin)] : []),
      cell(gap != null ? `${gap > 0 ? "+" : ""}${gap}bps` : "—", gap, undefined, gapDir),
    ];
    return { label: sq.quarterLabel, rowType: "metric" as const, cells };
  });

  // Chart series
  const chartSeries: ChartSeries[] = [
    {
      name: subject[0].ticker,
      data: subjectQuarters.map((q) => ({ label: q.quarterLabel, value: q.operatingMargin })),
    },
  ];
  if (peerTicker) {
    chartSeries.push({
      name: peerTicker,
      data: subjectQuarters.map((sq) => {
        const peerQ = peerData.find((p) => p.periodEnd === sq.periodEnd);
        return { label: sq.quarterLabel, value: peerQ?.operatingMargin ?? null };
      }),
    });
  }

  const latest = subject[0];
  const peerLatest = peerData[0];
  const latestGap = latest.operatingMargin != null && peerLatest?.operatingMargin != null
    ? Math.round((latest.operatingMargin - peerLatest.operatingMargin) * 10)
    : null;

  return {
    blockId,
    blockType: "margin-gap-trend",
    title: `Operating Margin Gap — ${latest.ticker}${peerTicker ? ` vs ${peerTicker}` : ""}`,
    subtitle: `${subjectQuarters[0].quarterLabel} → ${subjectQuarters[subjectQuarters.length - 1].quarterLabel}`,
    headlines: [
      {
        label: `${latest.ticker} OP Margin`,
        value: fmtPct(latest.operatingMargin),
        direction: latest.operatingMargin != null
          ? latest.operatingMargin > 0 ? "positive" : "negative"
          : undefined,
      },
      ...(latestGap != null ? [{
        label: "Margin Gap",
        value: `${latestGap > 0 ? "+" : ""}${latestGap}bps`,
        direction: (latestGap > 0 ? "positive" : latestGap < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
      }] : []),
    ],
    table: { columns, rows },
    chartSeries,
    footnotes: ["Operating margin = Operating Income / Revenue."],
    assumptions: [],
    metadata: buildMeta("margin-gap-trend", latest.ticker, peerTicker ? [peerTicker] : [], subject.slice(0, 12)),
  };
}

// ---------------------------------------------------------------------------
// Block 13: Per-Unit Comparison
// ---------------------------------------------------------------------------

function buildPerUnitBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  // Need segment data with volume units
  const latest = subject[0];
  if (!latest || latest.segments.length === 0) return null;

  const segsWithVolume = latest.segments.filter((s) => s.volumeUnits != null && s.volumeUnits > 0);
  if (segsWithVolume.length === 0) return null;

  const blockId = `per-unit-${latest.ticker}-${latest.quarterLabel.replace(/\s/g, "-")}`;

  // Collect all companies with per-unit data
  const allCompanies: { ticker: string; metrics: QuarterMetrics }[] = [
    { ticker: latest.ticker, metrics: latest },
  ];
  for (const [ticker, m] of peers) {
    if (m.length > 0 && m[0].segments.some((s) => s.volumeUnits != null && s.volumeUnits > 0)) {
      allCompanies.push({ ticker, metrics: m[0] });
    }
  }

  // Build a table per segment that has volume data
  const columns: SlideColumn[] = [
    { header: "Metric", align: "left" },
    ...allCompanies.map((c) => rightCol(c.ticker)),
  ];

  const rows: SlideTableRow[] = [];
  for (const seg of segsWithVolume) {
    rows.push({ label: seg.segmentName, rowType: "header" as const, cells: [] });

    const unitLabel = seg.volumeUnitType === "head" ? "hd"
      : seg.volumeUnitType === "cwt" ? "cwt"
      : seg.volumeUnitType === "lbs" ? "lbs"
      : seg.volumeUnitType === "cases" ? "cases"
      : "units";

    // Volume row
    rows.push(metricRow(`Volume (${unitLabel})`, allCompanies.map((c) => {
      const match = c.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const vol = match?.volumeUnits ?? null;
      return cell(vol != null ? vol.toLocaleString("en-US") : "—", vol);
    })));

    // Revenue per unit
    rows.push(metricRow(`Revenue / ${unitLabel}`, allCompanies.map((c) => {
      const match = c.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const rpu = match?.revenuePerUnit ?? null;
      return cell(rpu != null ? `$${rpu.toFixed(2)}` : "—", rpu);
    })));

    // OP per unit
    rows.push(metricRow(`OP / ${unitLabel}`, allCompanies.map((c) => {
      const match = c.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const opu = match?.operatingIncomePerUnit ?? null;
      const dir = opu != null ? (opu > 0 ? "positive" : opu < 0 ? "negative" : "neutral") : undefined;
      return cell(opu != null ? `$${opu.toFixed(2)}` : "—", opu, undefined, dir);
    })));

    // OP Margin
    rows.push(metricRow("OP Margin", allCompanies.map((c) => {
      const match = c.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      const margin = match?.operatingMargin ?? null;
      return cell(fmtPct(margin), margin);
    })));
  }

  // Chart series: OP per unit for each company across segments
  const chartSeries: ChartSeries[] = allCompanies.map((c) => ({
    name: c.ticker,
    data: segsWithVolume.map((seg) => {
      const match = c.metrics.segments.find(
        (s) => s.segmentName.toLowerCase() === seg.segmentName.toLowerCase()
      );
      return { label: seg.segmentName, value: match?.operatingIncomePerUnit ?? null };
    }),
  }));

  return {
    blockId,
    blockType: "per-unit-comparison",
    title: `Per-Unit Economics — ${latest.quarterLabel}`,
    subtitle: `${allCompanies.map((c) => c.ticker).join(" vs ")}`,
    headlines: segsWithVolume.slice(0, 2).map((s) => ({
      label: `${s.segmentName} OP/${s.volumeUnitType === "head" ? "hd" : s.volumeUnitType ?? "unit"}`,
      value: s.operatingIncomePerUnit != null ? `$${s.operatingIncomePerUnit.toFixed(2)}` : "—",
      direction: s.operatingIncomePerUnit != null
        ? s.operatingIncomePerUnit > 0 ? "positive" : "negative"
        : undefined,
    })),
    table: { columns, rows },
    chartSeries,
    footnotes: ["Per-unit = segment metric / volume in stated units.", "Volume data from manual entry or company disclosures."],
    assumptions: ["Volume figures may be estimated if not explicitly reported."],
    metadata: buildMeta("per-unit-comparison", latest.ticker, allCompanies.slice(1).map((c) => c.ticker), [latest]),
  };
}

// ---------------------------------------------------------------------------
// Block 17: Methodology Comparison
// ---------------------------------------------------------------------------

function buildMethodologyComparisonBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  // Look for methodology variants in subject or any peer
  const latest = subject[0];
  if (!latest) return null;

  // Collect all companies with methodology variants
  const companiesWithVariants: {
    ticker: string;
    metrics: QuarterMetrics;
    variants: import("@/types/segments").MethodologyVariant[];
  }[] = [];

  if (latest.methodologyVariants && latest.methodologyVariants.length >= 2) {
    companiesWithVariants.push({ ticker: latest.ticker, metrics: latest, variants: latest.methodologyVariants });
  }
  for (const [ticker, m] of peers) {
    if (m.length > 0 && m[0].methodologyVariants && m[0].methodologyVariants.length >= 2) {
      companiesWithVariants.push({ ticker, metrics: m[0], variants: m[0].methodologyVariants });
    }
  }

  if (companiesWithVariants.length === 0) return null;

  // Build a block for the first company with variants (usually the peer that changed methodology)
  const target = companiesWithVariants[0];
  const blockId = `methodology-${target.ticker}-${target.metrics.quarterLabel.replace(/\s/g, "-")}`;
  const [oldVariant, newVariant] = target.variants;

  // Columns: Segment | Old Method Margin | New Method Margin | Difference
  const columns: SlideColumn[] = [
    { header: "Segment", align: "left" },
    rightCol(oldVariant.label, "OP ($MM)"),
    rightCol(oldVariant.label, "Margin"),
    rightCol(newVariant.label, "OP ($MM)"),
    rightCol(newVariant.label, "Margin"),
    rightCol("Impact", "bps"),
  ];

  // Get all unique segment names across both variants
  const allSegNames = new Set<string>();
  for (const s of oldVariant.segments) allSegNames.add(s.segmentName);
  for (const s of newVariant.segments) allSegNames.add(s.segmentName);

  const rows: SlideTableRow[] = [];
  for (const name of allSegNames) {
    const oldSeg = oldVariant.segments.find((s) => s.segmentName === name);
    const newSeg = newVariant.segments.find((s) => s.segmentName === name);
    const oldMargin = oldSeg?.operatingMargin ?? null;
    const newMargin = newSeg?.operatingMargin ?? null;
    const impactBps = oldMargin != null && newMargin != null ? Math.round((newMargin - oldMargin) * 10) : null;

    rows.push({
      label: name,
      rowType: "metric",
      cells: [
        cell(fmtCurrency(oldSeg?.operatingIncome ?? null), oldSeg?.operatingIncome ?? null),
        cell(fmtPct(oldMargin), oldMargin),
        cell(fmtCurrency(newSeg?.operatingIncome ?? null), newSeg?.operatingIncome ?? null),
        cell(fmtPct(newMargin), newMargin),
        cell(
          impactBps != null ? `${impactBps > 0 ? "+" : ""}${impactBps}bps` : "—",
          impactBps,
          undefined,
          impactBps != null ? (impactBps > 0 ? "positive" : impactBps < 0 ? "negative" : "neutral") : undefined
        ),
      ],
    });
  }

  // Corporate allocation rows
  rows.push({ label: "", rowType: "spacer", cells: [] });
  rows.push(subtotalRow("Corporate / Unallocated", [
    cell(fmtCurrency(oldVariant.corporateAllocation), oldVariant.corporateAllocation),
    cell(oldVariant.corporateAsPercentOfRevenue != null ? fmtPct(oldVariant.corporateAsPercentOfRevenue) : "—", oldVariant.corporateAsPercentOfRevenue),
    cell(fmtCurrency(newVariant.corporateAllocation), newVariant.corporateAllocation),
    cell(newVariant.corporateAsPercentOfRevenue != null ? fmtPct(newVariant.corporateAsPercentOfRevenue) : "—", newVariant.corporateAsPercentOfRevenue),
    cell("—", null),
  ]));

  // Subject comparison row if subject has segments
  if (subject[0].segments.length > 0 && target.ticker !== subject[0].ticker) {
    rows.push({ label: "", rowType: "spacer", cells: [] });
    rows.push({ label: `${subject[0].ticker} (for reference)`, rowType: "header", cells: [] });
    for (const seg of subject[0].segments) {
      rows.push({
        label: seg.segmentName,
        rowType: "metric",
        cells: [
          cell(fmtCurrency(seg.operatingIncome), seg.operatingIncome),
          cell(fmtPct(seg.operatingMargin), seg.operatingMargin),
          cell("—", null),
          cell("—", null),
          cell("—", null),
        ],
      });
    }
  }

  return {
    blockId,
    blockType: "methodology-comparison",
    title: `Methodology Change Impact — ${target.ticker}`,
    subtitle: `${oldVariant.label} vs ${newVariant.label} · ${target.metrics.quarterLabel}`,
    headlines: [
      { label: oldVariant.label, value: `${oldVariant.segments.length} segments` },
      { label: newVariant.label, value: `${newVariant.segments.length} segments` },
      ...(oldVariant.corporateAllocation != null && newVariant.corporateAllocation != null ? [{
        label: "Corp Alloc Change",
        value: fmtCurrency(newVariant.corporateAllocation - oldVariant.corporateAllocation),
        direction: ((newVariant.corporateAllocation - oldVariant.corporateAllocation) < 0 ? "positive" : "negative") as "positive" | "negative",
      }] : []),
    ],
    table: { columns, rows },
    chartSeries: [
      { name: oldVariant.label, data: oldVariant.segments.map((seg) => ({ label: seg.segmentName, value: seg.operatingMargin })) },
      { name: newVariant.label, data: newVariant.segments.map((seg) => ({ label: seg.segmentName, value: seg.operatingMargin })) },
    ],
    footnotes: [
      `${oldVariant.description}`,
      `${newVariant.description}`,
      "Impact shows the margin difference under the new methodology vs the old.",
    ],
    assumptions: ["Methodology variants from manual data entry. Corporate allocations as reported."],
    metadata: buildMeta("methodology-comparison", subject[0].ticker, [target.ticker], [target.metrics]),
  };
}

// ---------------------------------------------------------------------------
// Block 18: SG&A Trend (12-quarter multi-company line)
// ---------------------------------------------------------------------------

function buildSGATrendBlock(
  subject: QuarterMetrics[],
  peers: Map<string, QuarterMetrics[]>
): SlideBlock | null {
  if (subject.length < 2) return null;

  const quarters = subject.slice(0, 12).reverse();
  const blockId = `sga-trend-${subject[0].ticker}-${subject[0].quarterLabel.replace(/\s/g, "-")}`;

  // Compute SG&A as % of revenue
  const sgaPct = (m: QuarterMetrics) =>
    m.sgaExpense != null && m.revenue != null && m.revenue > 0
      ? Math.round((m.sgaExpense / m.revenue) * 1000) / 10
      : null;

  // Build columns: Quarter | Subject | Peer1 | Peer2 ...
  const allTickers = [subject[0].ticker, ...Array.from(peers.keys())];
  const columns: SlideColumn[] = [
    { header: "Quarter", align: "left" },
    ...allTickers.map((t) => rightCol(t, "SG&A %")),
  ];

  const rows: SlideTableRow[] = quarters.map((q) => {
    const cells: SlideCell[] = [];
    // Subject
    const val = sgaPct(q);
    cells.push(cell(fmtPct(val), val));
    // Peers
    for (const [, peerM] of peers) {
      const peerQ = peerM.find((p) => p.periodEnd === q.periodEnd);
      const pval = peerQ ? sgaPct(peerQ) : null;
      cells.push(cell(fmtPct(pval), pval));
    }
    return { label: q.quarterLabel, rowType: "metric" as const, cells };
  });

  // Chart series
  const chartSeries: ChartSeries[] = [
    {
      name: subject[0].ticker,
      data: quarters.map((q) => ({ label: q.quarterLabel, value: sgaPct(q) })),
    },
    ...Array.from(peers.entries()).map(([ticker, peerM]) => ({
      name: ticker,
      data: quarters.map((q) => {
        const peerQ = peerM.find((p) => p.periodEnd === q.periodEnd);
        return { label: q.quarterLabel, value: peerQ ? sgaPct(peerQ) : null };
      }),
    })),
  ];

  return {
    blockId,
    blockType: "sga-trend",
    title: `SG&A as % of Revenue — 12-Quarter Trend`,
    subtitle: allTickers.join(" vs "),
    headlines: allTickers.slice(0, 3).map((t) => {
      const m = t === subject[0].ticker ? subject[0] : peers.get(t)?.[0];
      return {
        label: t,
        value: m ? fmtPct(sgaPct(m)) : "—",
        comparison: "SG&A %",
      };
    }),
    table: { columns, rows },
    chartSeries,
    footnotes: ["SG&A % = Selling, General & Administrative / Revenue."],
    assumptions: [],
    metadata: buildMeta("sga-trend", subject[0].ticker, allTickers.slice(1), subject.slice(0, 12)),
  };
}

// ---------------------------------------------------------------------------
// Main: generate all slide blocks
// ---------------------------------------------------------------------------

export interface ManualDataForBlocks {
  narratives?: Array<{
    type: string;
    title: string;
    body: string;
    date: string;
    stockPriceReaction?: string;
    segmentHighlights?: Array<{ segmentName: string; operatingIncome: number | null; yoyChange: string }>;
    sourceLinks?: Array<{ label: string; url: string }>;
  }>;
  guidanceEntries?: Array<{
    fiscalYear: number;
    metric: string;
    metricLabel: string;
    low: number | null;
    high: number | null;
    midpoint: number | null;
    unit: string;
    asOfDate: string;
    source: string;
    consensus?: number | null;
    actual?: number | null;
  }>;
  landscapeData?: LandscapeManualData[];
  marketData?: MarketDataEntry[];
}

export interface SlideBlockInput {
  subjectTicker: string;
  subjectFilings: Filing[];
  subjectPeerType: PeerType;
  peerFilings: Map<string, { filings: Filing[]; peerType: PeerType }>;
  manualData?: ManualDataForBlocks;
}

export function generateAllSlideBlocks(input: SlideBlockInput): SlideBlock[] {
  const subjectMetrics = input.subjectFilings
    .map((f) => extractMetrics(f, input.subjectPeerType))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));

  const peerMetrics = new Map<string, QuarterMetrics[]>();
  for (const [ticker, data] of input.peerFilings) {
    const metrics = data.filings
      .map((f) => extractMetrics(f, data.peerType))
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    peerMetrics.set(ticker, metrics);
  }

  const blocks: SlideBlock[] = [];

  const benchmark = buildBenchmarkBlock(subjectMetrics, peerMetrics);
  if (benchmark) blocks.push(benchmark);

  const trend = buildQuarterlyTrendBlock(subjectMetrics);
  if (trend) blocks.push(trend);

  const sequential = buildSequentialBlock(subjectMetrics);
  if (sequential) blocks.push(sequential);

  const yoy = buildYoYBlock(subjectMetrics);
  if (yoy) blocks.push(yoy);

  const ttm = buildTTMBlock(subjectMetrics);
  if (ttm) blocks.push(ttm);

  const sga = buildSGABlock(subjectMetrics, peerMetrics);
  if (sga) blocks.push(sga);

  const appendix = buildAppendixBlock(subjectMetrics);
  if (appendix) blocks.push(appendix);

  // OP Bridge blocks
  const qoqBridge = buildQoQBridge(subjectMetrics);
  if (qoqBridge) blocks.push(bridgeToSlideBlock(qoqBridge, "op-bridge-qoq", input.subjectTicker, subjectMetrics));

  const yoyBridge = buildYoYBridge(subjectMetrics);
  if (yoyBridge) blocks.push(bridgeToSlideBlock(yoyBridge, "op-bridge-yoy", input.subjectTicker, subjectMetrics));

  const ttmBridge = buildTTMBridge(subjectMetrics);
  if (ttmBridge) blocks.push(bridgeToSlideBlock(ttmBridge, "op-bridge-ttm", input.subjectTicker, subjectMetrics));

  // Segment-level blocks
  const segMargin = buildSegmentMarginBlock(subjectMetrics, peerMetrics);
  if (segMargin) blocks.push(segMargin);

  const segRevenue = buildSegmentRevenueCompositionBlock(subjectMetrics);
  if (segRevenue) blocks.push(segRevenue);

  const marginGap = buildMarginGapTrendBlock(subjectMetrics, peerMetrics);
  if (marginGap) blocks.push(marginGap);

  const perUnit = buildPerUnitBlock(subjectMetrics, peerMetrics);
  if (perUnit) blocks.push(perUnit);

  // Methodology comparison (if any company has methodology variants)
  const methodologyBlock = buildMethodologyComparisonBlock(subjectMetrics, peerMetrics);
  if (methodologyBlock) blocks.push(methodologyBlock);

  // SG&A Trend (12-quarter multi-company)
  const sgaTrend = buildSGATrendBlock(subjectMetrics, peerMetrics);
  if (sgaTrend) blocks.push(sgaTrend);

  // Industry Landscape (merges financials + manual data)
  if (input.manualData?.landscapeData) {
    const allMetrics = new Map<string, QuarterMetrics[]>();
    allMetrics.set(input.subjectTicker, subjectMetrics);
    for (const [ticker, m] of peerMetrics) allMetrics.set(ticker, m);
    const landscape = buildIndustryLandscapeBlock(allMetrics, input.manualData.landscapeData, input.subjectTicker);
    if (landscape) blocks.push(landscape);
  }

  // Narrative blocks (from manual data)
  if (input.manualData?.narratives) {
    for (const narrative of input.manualData.narratives) {
      blocks.push(buildNarrativeBlock(narrative, input.subjectTicker));
    }
  }

  // Guidance block (from manual data)
  if (input.manualData?.guidanceEntries && input.manualData.guidanceEntries.length > 0) {
    const guidanceBlock = buildGuidanceBlock(input.manualData.guidanceEntries, input.subjectTicker);
    if (guidanceBlock) blocks.push(guidanceBlock);
  }

  // Market data blocks (from manual entry)
  if (input.manualData?.marketData) {
    for (const entry of input.manualData.marketData) {
      blocks.push(buildMarketVolumeBlock(entry, input.subjectTicker));
      const channelBlock = buildMarketChannelBlock(entry, input.subjectTicker);
      if (channelBlock) blocks.push(channelBlock);
      const overlapBlock = buildCompetitiveOverlapBlock(entry, input.subjectTicker);
      if (overlapBlock) blocks.push(overlapBlock);
    }
  }

  return blocks;
}
