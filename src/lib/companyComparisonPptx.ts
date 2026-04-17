/**
 * Peer comparison → PowerPoint (16:9, consulting-style white deck).
 * Data source: CompanyComparisonPayload (same as former PDF print view).
 */

import PptxGenJS from "pptxgenjs";
import type {
  CompanyComparisonPayload,
  ComparisonRow,
  ComparisonSection,
  MetricFormat,
  MultiComparisonRow,
} from "@/lib/companyComparison";
import { fetchStockPriceHistory } from "@/lib/stockPriceHistory";
import { COLORS, FONTS, LAYOUT, TABLE_STYLE } from "./pptxTemplates";

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

const SECTION_ORDER: ComparisonSection[] = [
  "Context",
  "Income Statement",
  "Cash Flow",
  "Balance Sheet / Capital Structure",
];

const ROWS_PER_TABLE_SLIDE = 11;
const CHART_COLORS = ["1E2761", "2563EB", "0D9488", "D97706", "7C3AED", "64748B"];
const REFERENCE_COLORS = {
  tableHeader: "B9753E",
  tableHeaderDark: "9F6230",
  tableAlt: "F7EAE1",
  tableBase: "FFF8F3",
  tableBorder: "2A2A2A",
  updateTag: "9AF25A",
  accentBlue: "3D69B1",
  accentOrange: "C17B36",
};

function isMultiPayload(p: CompanyComparisonPayload): boolean {
  return (
    p.comparisonMode === "multi" &&
    Array.isArray(p.multiCompanies) &&
    p.multiCompanies.length >= 3
  );
}

function fmtMetric(format: MetricFormat, value: number | string | null): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (format === "currency") {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (abs >= 1000) return `${sign}$${(abs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "multiple") return `${value.toFixed(2)}x`;
  if (format === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

function addFooter(slide: PptxSlide, pageNum: number, updated: string) {
  slide.addText(`Slide ${pageNum}  ·  Source: app peer comparison`, {
    x: LAYOUT.marginX,
    y: LAYOUT.footerY,
    w: LAYOUT.contentW,
    h: 0.35,
    fontSize: 7,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  slide.addText("Back to table of contents — use workspace Peer Comparison navigation", {
    x: LAYOUT.marginX,
    y: LAYOUT.footerY + 0.28,
    w: LAYOUT.contentW,
    h: 0.25,
    fontSize: 6.5,
    fontFace: FONTS.body,
    color: COLORS.slate300,
    align: "left",
  });
}

function summarizeTopLines(lines: string[], max = 5): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max);
}

function addSourceAndNote(slide: PptxSlide, source: string, note: string, y = 4.95) {
  slide.addText(`Source: ${source}`, {
    x: LAYOUT.marginX,
    y,
    w: 6.2,
    h: 0.2,
    fontSize: 7,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  slide.addText(`Note: ${note}`, {
    x: 6.65,
    y,
    w: 2.85,
    h: 0.2,
    fontSize: 7,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "right",
  });
}

function buildCompareComments(chartData: Array<{ name: string; labels: string[]; values: number[] }>): string[] {
  const comments: string[] = [];
  for (const row of chartData) {
    if (row.values.length < 2) continue;
    const a = row.values[0] ?? 0;
    const b = row.values[1] ?? 0;
    const aLabel = row.labels[0] ?? "A";
    const bLabel = row.labels[1] ?? "B";
    const diff = a - b;
    const winner = diff >= 0 ? aLabel : bLabel;
    const loser = diff >= 0 ? bLabel : aLabel;
    const gap = Math.abs(diff);
    const base = Math.max(Math.abs(a), Math.abs(b), 1);
    const gapPct = (gap / base) * 100;
    comments.push(`${row.name}: ${winner} leads ${loser} by ${gap.toLocaleString(undefined, { maximumFractionDigits: 1 })} (${gapPct.toFixed(1)}%).`);
  }
  return comments.slice(0, 4);
}

function buildTableInsights(rows: ComparisonRow[], tA: string, tB: string): string[] {
  const numeric = rows.filter((r) => typeof r.valueA === "number" && typeof r.valueB === "number");
  if (numeric.length === 0) return ["Data is mostly qualitative in this section.", "Use filing footnotes for detailed interpretation."];
  const aWins = numeric.filter((r) => r.better === "A").length;
  const bWins = numeric.filter((r) => r.better === "B").length;
  const largestGap = [...numeric]
    .filter((r) => r.difference != null)
    .sort((x, y) => Math.abs(y.difference ?? 0) - Math.abs(x.difference ?? 0))[0];
  const leadLine =
    aWins === bWins
      ? `${tA} and ${tB} are balanced across this section (${aWins}/${numeric.length} each).`
      : aWins > bWins
        ? `${tA} leads ${tB} on ${aWins}/${numeric.length} comparable metrics.`
        : `${tB} leads ${tA} on ${bWins}/${numeric.length} comparable metrics.`;
  const gapLine = largestGap
    ? `${largestGap.label}: largest gap in this section (${fmtMetric(largestGap.format, largestGap.difference)}).`
    : "No significant single-metric gap detected.";
  return [
    leadLine,
    gapLine,
    "All values shown in USD millions unless explicitly marked as percent/multiple.",
  ].slice(0, 4);
}

function buildTrendInsights(series: { name: string; labels: string[]; values: number[] }[]): string[] {
  if (series.length < 2) return ["Trend comparison unavailable with single series."];
  const a = series[0];
  const b = series[1];
  const aLast = a.values[a.values.length - 1] ?? 0;
  const bLast = b.values[b.values.length - 1] ?? 0;
  const leader = aLast >= bLast ? a.name : b.name;
  const lagger = aLast >= bLast ? b.name : a.name;
  const gap = Math.abs(aLast - bLast);
  const aChange = a.values.length > 1 ? aLast - (a.values[0] ?? aLast) : 0;
  const bChange = b.values.length > 1 ? bLast - (b.values[0] ?? bLast) : 0;
  return [
    `${leader} leads ${lagger} at the latest point by ${gap.toLocaleString(undefined, { maximumFractionDigits: 1 })}.`,
    `${a.name} change over period: ${aChange >= 0 ? "+" : ""}${aChange.toLocaleString(undefined, { maximumFractionDigits: 1 })}.`,
    `${b.name} change over period: ${bChange >= 0 ? "+" : ""}${bChange.toLocaleString(undefined, { maximumFractionDigits: 1 })}.`,
  ];
}

function formatTrendBoxValue(value: number, valAxisFmt?: string): string {
  if (valAxisFmt === "0.0") return `${value.toFixed(1)}%`;
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (abs >= 100) return value.toFixed(0);
  return value.toFixed(1);
}

function addTrendValueBoxes(
  slide: PptxSlide,
  series: { name: string; labels: string[]; values: number[] }[],
  chartX: number,
  chartY: number,
  chartW: number,
  chartH: number,
  yMin: number,
  yMax: number,
  valAxisFmt?: string
) {
  if (series.length === 0 || yMax <= yMin) return;
  const labelCount = Math.max(...series.map((s) => s.values.length), 0);
  if (labelCount <= 1 || labelCount > 14) return;

  const plotX = chartX + 0.55;
  const plotY = chartY + 0.24;
  const plotW = chartW - 0.95;
  const plotH = chartH - 0.82;
  const colors = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3]];

  series.slice(0, 2).forEach((line, lineIndex) => {
    line.values.forEach((v, i) => {
      const xRatio = labelCount > 1 ? i / (labelCount - 1) : 0;
      const yRatio = (v - yMin) / (yMax - yMin);
      const x = plotX + xRatio * plotW;
      const y = plotY + (1 - yRatio) * plotH;
      const text = formatTrendBoxValue(v, valAxisFmt);
      const boxW = Math.max(0.38, Math.min(0.64, 0.2 + text.length * 0.05));
      const boxH = 0.16;
      const yOffset = lineIndex === 0 ? -0.15 : 0.06;
      const bx = Math.max(chartX + 0.2, Math.min(chartX + chartW - boxW - 0.2, x - boxW / 2));
      const by = Math.max(chartY + 0.15, Math.min(chartY + chartH - boxH - 0.22, y + yOffset));
      slide.addShape("roundRect" as PptxGenJS.ShapeType, {
        x: bx,
        y: by,
        w: boxW,
        h: boxH,
        fill: { color: colors[lineIndex % colors.length] },
        line: { color: colors[lineIndex % colors.length], width: 0.3 },
      });
      slide.addText(text, {
        x: bx,
        y: by + 0.01,
        w: boxW,
        h: boxH - 0.01,
        fontSize: 6.3,
        fontFace: FONTS.body,
        color: COLORS.white,
        bold: true,
        align: "center",
        valign: "middle",
      });
    });
  });
}

function buildEarningsNumericalInsights(result: CompanyComparisonPayload): string[] {
  const a = result.companyA;
  const b = result.companyB;
  const lines: string[] = [];

  lines.push(
    `${a.ticker} revenue ${fmtMetric("currency", a.metrics.revenue)} vs ${b.ticker} ${fmtMetric("currency", b.metrics.revenue)} (${a.quarterLabel}).`
  );
  lines.push(
    `${a.ticker} EBITDA ${fmtMetric("currency", a.metrics.ebitda)} vs ${b.ticker} ${fmtMetric("currency", b.metrics.ebitda)}.`
  );
  lines.push(
    `${a.ticker} net income ${fmtMetric("currency", a.metrics.netIncome)} vs ${b.ticker} ${fmtMetric("currency", b.metrics.netIncome)}.`
  );
  lines.push(
    `${a.ticker} free cash flow ${fmtMetric("currency", a.metrics.freeCashFlow)} vs ${b.ticker} ${fmtMetric("currency", b.metrics.freeCashFlow)}.`
  );

  const opMarginGap =
    typeof a.metrics.operatingMargin === "number" && typeof b.metrics.operatingMargin === "number"
      ? a.metrics.operatingMargin - b.metrics.operatingMargin
      : null;
  if (opMarginGap != null) {
    lines.push(
      `Operating margin gap: ${a.ticker} ${fmtMetric("percent", a.metrics.operatingMargin)} vs ${b.ticker} ${fmtMetric("percent", b.metrics.operatingMargin)} (${opMarginGap >= 0 ? "+" : ""}${opMarginGap.toFixed(1)}pp).`
    );
  }

  return lines;
}

function addCombinedChartConclusionSlide(
  pres: PptxGenJS,
  result: CompanyComparisonPayload,
  pageNum: { n: number },
  updated: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  const tA = result.companyA.ticker;
  const tB = result.companyB.ticker;

  const finComments = buildCompareComments(
    result.charts.financialBars.slice(0, 4).map((r) => ({
      name: r.metric,
      labels: [tA, tB],
      values: [r.companyA ?? 0, r.companyB ?? 0],
    }))
  );
  const marginComments = buildCompareComments(
    result.charts.marginBars.slice(0, 3).map((r) => ({
      name: r.metric,
      labels: [tA, tB],
      values: [r.companyA ?? 0, r.companyB ?? 0],
    }))
  );
  const trendComments = buildTrendInsights([
    {
      name: tA,
      labels: result.trends.revenue.map((p) => p.quarterLabel),
      values: result.trends.revenue.map((p) => p.companyA ?? 0),
    },
    {
      name: tB,
      labels: result.trends.revenue.map((p) => p.quarterLabel),
      values: result.trends.revenue.map((p) => p.companyB ?? 0),
    },
  ]);

  const allComments = [
    ...summarizeTopLines(finComments, 2),
    ...summarizeTopLines(marginComments, 1),
    ...summarizeTopLines(trendComments, 1),
  ].slice(0, 4);

  slide.addText("Combined chart conclusions", {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  slide.addText("Synthesis across financial levels, margins, and trend charts", {
    x: LAYOUT.marginX,
    y: 0.82,
    w: LAYOUT.contentW,
    h: 0.25,
    fontSize: 9,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  slide.addText(`• ${allComments.join("\n• ") || "No combined conclusion available."}`, {
    x: LAYOUT.marginX,
    y: 1.2,
    w: LAYOUT.contentW,
    h: 3.45,
    fontSize: 11,
    fontFace: FONTS.body,
    color: COLORS.slate900,
    valign: "top",
    lineSpacingMultiple: 1.22,
  });

  addSourceAndNote(
    slide,
    "Company filings and normalized comparison engine",
    "Conclusion combines key signals from chart sections.",
    4.86
  );
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

function addSalesMarginDashboardSlide(
  pres: PptxGenJS,
  result: CompanyComparisonPayload,
  pageNum: { n: number },
  updated: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;

  const tA = result.companyA.ticker;
  const tB = result.companyB.ticker;
  const revTrend = result.trends.revenue.slice(-8);
  const marginTrend = result.trends.operatingMargin.slice(-8);
  const labels = revTrend.map((p) => p.quarterLabel);
  const revA = revTrend.map((p) => p.companyA ?? 0);
  const revB = revTrend.map((p) => p.companyB ?? 0);
  const marginA = marginTrend.map((p) => p.companyA ?? 0);
  const marginB = marginTrend.map((p) => p.companyB ?? 0);

  const currentIdx = Math.max(revTrend.length - 1, 0);
  const prevIdx = Math.max(revTrend.length - 2, 0);
  const revNowA = revA[currentIdx] ?? 0;
  const revPrevA = revA[prevIdx] ?? 0;
  const revNowB = revB[currentIdx] ?? 0;
  const revPrevB = revB[prevIdx] ?? 0;
  const marginNowA = marginA[currentIdx] ?? 0;
  const marginPrevA = marginA[prevIdx] ?? 0;
  const marginNowB = marginB[currentIdx] ?? 0;
  const marginPrevB = marginB[prevIdx] ?? 0;

  const opNowA = (revNowA * marginNowA) / 100;
  const opPrevA = (revPrevA * marginPrevA) / 100;
  const opNowB = (revNowB * marginNowB) / 100;
  const opPrevB = (revPrevB * marginPrevB) / 100;
  const gapNow = marginNowA - marginNowB;
  const gapPrev = marginPrevA - marginPrevB;

  slide.addText(`${tA} vs ${tB} Sales and Operating Margin`, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.title,
    color: COLORS.slate900,
    bold: true,
    align: "left",
  });

  slide.addText("Sales and profitability", {
    x: 2.2,
    y: 0.83,
    w: 2.6,
    h: 0.2,
    fontSize: 9,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "center",
  });

  slide.addChart(
    pres.ChartType.bar,
    [
      { name: tA, labels, values: revA },
      { name: tB, labels, values: revB },
    ],
    {
      x: LAYOUT.marginX,
      y: 1.05,
      w: 5.2,
      h: 2.35,
      barGrouping: "clustered",
      chartColors: [CHART_COLORS[0], CHART_COLORS[1]],
      catAxisLabelFontSize: 6.5,
      valAxisLabelFontSize: 6.5,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 6.5,
      valGridLine: { color: COLORS.slate300, size: 0.4 },
    }
  );

  slide.addChart(
    pres.ChartType.line,
    [
      { name: `${tA} Margin`, labels, values: marginA },
      { name: `${tB} Margin`, labels, values: marginB },
    ],
    {
      x: LAYOUT.marginX,
      y: 3.28,
      w: 5.2,
      h: 1.25,
      chartColors: [CHART_COLORS[2], CHART_COLORS[3]],
      catAxisLabelFontSize: 6,
      valAxisLabelFontSize: 6,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 6,
      lineDataSymbol: "square",
      lineDataSymbolSize: 4,
      showValue: false,
      lineSmooth: false,
      valAxisLabelFormatCode: "0.0",
    }
  );

  const opTable: PptxGenJS.TableRow[] = [
    [
      { text: "Operating Profit", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, fontSize: 7 } },
      { text: "Prev Q", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, align: "right" as const, fontSize: 7 } },
      { text: "Current Q", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, align: "right" as const, fontSize: 7 } },
      { text: "Chg", options: { fill: { color: "FDE68A" }, color: "111827", bold: true, align: "right" as const, fontSize: 7 } },
    ],
    [
      { text: tA, options: { fill: { color: "FFF8F3" }, fontSize: 7.2 } },
      { text: fmtMetric("currency", opPrevA), options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
      { text: fmtMetric("currency", opNowA), options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
      { text: fmtMetric("currency", opNowA - opPrevA), options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
    ],
    [
      { text: tB, options: { fill: { color: "F7EAE1" }, fontSize: 7.2 } },
      { text: fmtMetric("currency", opPrevB), options: { fill: { color: "F7EAE1" }, align: "right" as const, fontSize: 7.2 } },
      { text: fmtMetric("currency", opNowB), options: { fill: { color: "F7EAE1" }, align: "right" as const, fontSize: 7.2 } },
      { text: fmtMetric("currency", opNowB - opPrevB), options: { fill: { color: "F7EAE1" }, align: "right" as const, fontSize: 7.2 } },
    ],
  ];
  slide.addTable(opTable, {
    x: 5.85,
    y: 1.18,
    w: 3.65,
    rowH: 0.24,
    border: { type: "solid", color: COLORS.slate300, pt: 0.5 },
  });

  const gapTable: PptxGenJS.TableRow[] = [
    [
      { text: "Margin Gap (bps)", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, fontSize: 7 } },
      { text: "Prev Q", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, align: "right" as const, fontSize: 7 } },
      { text: "Current Q", options: { fill: { color: "111827" }, color: "FFFFFF", bold: true, align: "right" as const, fontSize: 7 } },
      { text: "Chg", options: { fill: { color: "FDE68A" }, color: "111827", bold: true, align: "right" as const, fontSize: 7 } },
    ],
    [
      { text: `${tA} vs ${tB}`, options: { fill: { color: "FFF8F3" }, fontSize: 7.2 } },
      { text: `${(gapPrev * 100).toFixed(0)}`, options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
      { text: `${(gapNow * 100).toFixed(0)}`, options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
      { text: `${((gapNow - gapPrev) * 100).toFixed(0)}`, options: { fill: { color: "FFF8F3" }, align: "right" as const, fontSize: 7.2 } },
    ],
  ];
  slide.addTable(gapTable, {
    x: 5.85,
    y: 2.32,
    w: 3.65,
    rowH: 0.24,
    border: { type: "solid", color: COLORS.slate300, pt: 0.5 },
  });

  const comments = [
    `In the latest quarter, ${tA} operating profit is ${fmtMetric("currency", opNowA)} vs ${tB} ${fmtMetric("currency", opNowB)}.`,
    `${tA} vs ${tB} operating margin gap moved from ${(gapPrev * 100).toFixed(0)} bps to ${(gapNow * 100).toFixed(0)} bps.`,
    `${tA} revenue changed ${fmtMetric("currency", revNowA - revPrevA)} QoQ; ${tB} changed ${fmtMetric("currency", revNowB - revPrevB)} QoQ.`,
  ];
  slide.addText(`• ${comments.join("\n• ")}`, {
    x: LAYOUT.marginX,
    y: 4.62,
    w: LAYOUT.contentW,
    h: 0.4,
    fontSize: 7.8,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    valign: "top",
    lineSpacingMultiple: 1.15,
  });
  addSourceAndNote(
    slide,
    "Company filings and normalized comparison engine",
    "Operating profit approximated as Revenue × Operating Margin.",
    5.02
  );
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

function computeAdaptiveAxis(values: number[]): { min?: number; max?: number; truncated: boolean; cutAt?: number } {
  if (values.length === 0) return { truncated: false };
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return { truncated: false };
  const max = sorted[sorted.length - 1];
  const min = sorted[0];
  const secondMax = sorted.length > 1 ? sorted[sorted.length - 2] : max;
  const positiveOutlier = max > 0 && secondMax > 0 && max >= secondMax * 3.5;
  if (positiveOutlier) {
    const capped = secondMax * 1.35;
    return { min: Math.min(0, min), max: capped, truncated: true, cutAt: capped };
  }
  return { min: Math.min(0, min), max: undefined, truncated: false };
}

function addTitleSlide(
  pres: PptxGenJS,
  title: string,
  periodLine: string,
  dateLine: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: 1.1,
    w: LAYOUT.contentW,
    h: 1,
    fontSize: 30,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
    valign: "top",
  });
  slide.addText(periodLine, {
    x: LAYOUT.marginX,
    y: 2.25,
    w: LAYOUT.contentW,
    h: 0.45,
    fontSize: 14,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    align: "left",
  });
  slide.addText(dateLine, {
    x: LAYOUT.marginX,
    y: 2.75,
    w: LAYOUT.contentW,
    h: 0.35,
    fontSize: 11,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  slide.addShape("rect" as PptxGenJS.ShapeType, {
    x: LAYOUT.marginX,
    y: 3.35,
    w: 2.2,
    h: 0.04,
    fill: { color: COLORS.navy },
    line: { color: COLORS.navy, width: 0 },
  });
  return 1;
}

function addTocSlide(pres: PptxGenJS, items: string[], pageNum: { n: number }, updated: string): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  slide.addText("Table of contents", {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.55,
    fontSize: 22,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  const body = items.map((t, i) => `${i + 1}. ${t}`).join("\n");
  slide.addText(body, {
    x: LAYOUT.marginX,
    y: 1.1,
    w: LAYOUT.contentW,
    h: 3.5,
    fontSize: 12,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.35,
  });
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

function addSectionDivider(
  pres: PptxGenJS,
  title: string,
  subtitle: string,
  pageNum: { n: number },
  updated: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.offWhite };
  pageNum.n += 1;
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: 2,
    w: LAYOUT.contentW,
    h: 0.7,
    fontSize: 22,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  slide.addText(subtitle, {
    x: LAYOUT.marginX,
    y: 2.75,
    w: LAYOUT.contentW,
    h: 0.4,
    fontSize: 12,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

function addNarrativeSlide(
  pres: PptxGenJS,
  heading: string,
  bullets: string[],
  takeaway: string | undefined,
  pageNum: { n: number },
  updated: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  slide.addText(heading, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.5,
    fontSize: 18,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  const text = bullets.slice(0, 12).join("\n• ");
  slide.addText(text ? `• ${text}` : "—", {
    x: LAYOUT.marginX,
    y: 0.95,
    w: 7.8,
    h: 3.2,
    fontSize: 10.5,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.25,
  });
  if (takeaway) {
    slide.addText(takeaway, {
      x: LAYOUT.marginX,
      y: 4.35,
      w: LAYOUT.contentW,
      h: 0.55,
      fontSize: 11,
      fontFace: FONTS.title,
      color: COLORS.slate900,
      bold: true,
      align: "left",
    });
  }
  slide.addText("Source: extracted filings & computed metrics in-app.", {
    x: LAYOUT.marginX,
    y: 4.95,
    w: LAYOUT.contentW,
    h: 0.25,
    fontSize: 7,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

export async function addEarningsStockSlide(
  ppt: PptxGenJS,
  params: {
    companyName: string;
    ticker: string;
    period: string;
    metrics: {
      revenue?: number;
      ebitda?: number;
      netIncome?: number;
      fcf?: number;
    };
    insights: string[];
  }
) {
  const slide = ppt.addSlide();
  slide.background = { fill: COLORS.white };
  const introCommentary = summarizeTopLines(params.insights, 2).join(" ");
  slide.addText(`${params.companyName} Earnings Overview`, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.55,
    fontSize: 20,
    fontFace: FONTS.title,
    color: COLORS.slate900,
    bold: true,
    align: "left",
  });
  slide.addText(
    introCommentary || `${params.ticker} results show mixed earnings signals versus prior period and peers.`,
    {
      x: LAYOUT.marginX,
      y: 0.62,
      w: LAYOUT.contentW,
      h: 0.2,
      fontSize: 8.8,
      fontFace: FONTS.body,
      color: COLORS.slate700,
      align: "left",
    }
  );
  slide.addText(
    `Revenue: ${fmtMetric("currency", params.metrics.revenue ?? null)}   |   EBITDA: ${fmtMetric("currency", params.metrics.ebitda ?? null)}   |   Net Income: ${fmtMetric("currency", params.metrics.netIncome ?? null)}   |   FCF: ${fmtMetric("currency", params.metrics.fcf ?? null)}`,
    {
      x: LAYOUT.marginX,
      y: 0.86,
      w: LAYOUT.contentW,
      h: 0.3,
      fontSize: 9.5,
      fontFace: FONTS.body,
      color: COLORS.slate900,
      bold: true,
      align: "left",
    }
  );
  slide.addText(`Period: ${params.period}`, {
    x: LAYOUT.marginX,
    y: 1.12,
    w: 4.8,
    h: 0.2,
    fontSize: 8.2,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });

  slide.addText(`• ${summarizeTopLines(params.insights, 5).join("\n• ") || "No earnings insights available."}`, {
    x: LAYOUT.marginX,
    y: 1.42,
    w: 5.0,
    h: 3.2,
    fontSize: 10,
    fontFace: FONTS.body,
    color: COLORS.slate900,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.2,
  });

  const stock = await fetchStockPriceHistory({
    ticker: params.ticker,
    range: "1Y",
  });

  slide.addText(`${params.ticker} — 1Y stock chart`, {
    x: 5.35,
    y: 1.2,
    w: 4.2,
    h: 0.2,
    fontSize: 9,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });

  if (stock.points.length > 0) {
    const labels = stock.points.map((p) => p.date);
    const prices = stock.points.map((p) => p.close);
    const positive = (stock.percentChange ?? 0) >= 0;
    slide.addChart(ppt.ChartType.line, [{ name: params.ticker, labels, values: prices }], {
      x: 5.35,
      y: 1.45,
      w: 4.1,
      h: 2.35,
      showTitle: false,
      chartColors: [positive ? "16A34A" : "DC2626"],
      showLegend: false,
      catAxisLabelFontSize: 6.5,
      valAxisLabelFontSize: 6.5,
      valGridLine: { color: COLORS.slate300, size: 0.4 },
      lineSmooth: true,
      lineDataSymbol: "none",
    });

    slide.addTable(
      [
        [
          { text: "Latest", options: { bold: true, color: COLORS.slate700, fontSize: 7 } },
          { text: "1Y Chg", options: { bold: true, color: COLORS.slate700, fontSize: 7 } },
          { text: "52W High", options: { bold: true, color: COLORS.slate700, fontSize: 7 } },
          { text: "52W Low", options: { bold: true, color: COLORS.slate700, fontSize: 7 } },
        ],
        [
          { text: stock.latestPrice != null ? `$${stock.latestPrice.toFixed(2)}` : "—", options: { fontSize: 7.5 } },
          {
            text: stock.percentChange != null ? `${stock.percentChange >= 0 ? "+" : ""}${stock.percentChange.toFixed(1)}%` : "—",
            options: { fontSize: 7.5, color: (stock.percentChange ?? 0) >= 0 ? "166534" : "991B1B", bold: true },
          },
          { text: stock.week52High != null ? `$${stock.week52High.toFixed(2)}` : "—", options: { fontSize: 7.5 } },
          { text: stock.week52Low != null ? `$${stock.week52Low.toFixed(2)}` : "—", options: { fontSize: 7.5 } },
        ],
      ],
      {
        x: 5.35,
        y: 3.95,
        w: 4.1,
        rowH: 0.24,
        border: { type: "solid", color: COLORS.slate300, pt: 0.5 },
      }
    );
  } else {
    slide.addShape("rect" as PptxGenJS.ShapeType, {
      x: 5.35,
      y: 1.45,
      w: 4.1,
      h: 2.35,
      fill: { color: COLORS.offWhite },
      line: { color: COLORS.slate300, width: 0.8 },
    });
    slide.addText("Stock data unavailable", {
      x: 5.35,
      y: 2.45,
      w: 4.1,
      h: 0.3,
      fontSize: 11,
      fontFace: FONTS.body,
      color: COLORS.slate500,
      bold: true,
      align: "center",
    });
  }

  slide.addText("Source: stock API + filings", {
    x: LAYOUT.marginX,
    y: 5.0,
    w: LAYOUT.contentW,
    h: 0.2,
    fontSize: 7,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
}

function addKeyFinancialAnalysisSlide(
  pres: PptxGenJS,
  title: string,
  chartSeries: Array<{ name: string; labels: string[]; values: number[] }>,
  sideTable: Array<{ metric: string; valueA: string; valueB: string; delta: string }>,
  commentary: string[],
  pageNum: { n: number },
  updated: string
): number {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: 6.3,
    h: 0.5,
    fontSize: 22,
    fontFace: FONTS.title,
    color: COLORS.slate900,
    bold: true,
  });
  slide.addChart(pres.ChartType.bar, chartSeries, {
    x: LAYOUT.marginX,
    y: 0.9,
    w: 5.75,
    h: 2.55,
    barGrouping: "stacked",
    chartColors: [REFERENCE_COLORS.accentBlue, REFERENCE_COLORS.accentOrange, "9CA3AF"],
    catAxisLabelFontSize: 7.5,
    valAxisLabelFontSize: 7.5,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 7,
    valGridLine: { color: COLORS.slate300, size: 0.4 },
  });
  const tableHeader: PptxGenJS.TableRow = [
    { text: "Metric", options: { fill: { color: REFERENCE_COLORS.tableHeaderDark }, color: COLORS.white, bold: true, fontSize: 7.5, fontFace: FONTS.body } },
    { text: "A", options: { fill: { color: REFERENCE_COLORS.tableHeaderDark }, color: COLORS.white, bold: true, align: "right" as const, fontSize: 7.5, fontFace: FONTS.body } },
    { text: "B", options: { fill: { color: REFERENCE_COLORS.tableHeaderDark }, color: COLORS.white, bold: true, align: "right" as const, fontSize: 7.5, fontFace: FONTS.body } },
    { text: "CHG", options: { fill: { color: "E9BF4C" }, color: "1F2937", bold: true, align: "right" as const, fontSize: 7.5, fontFace: FONTS.body } },
  ];
  const tableRows: PptxGenJS.TableRow[] = [
    tableHeader,
    ...sideTable.slice(0, 4).map((row, idx) => [
      { text: row.metric, options: { fill: { color: idx % 2 === 0 ? REFERENCE_COLORS.tableAlt : REFERENCE_COLORS.tableBase }, fontSize: 7.2, fontFace: FONTS.body } },
      { text: row.valueA, options: { fill: { color: idx % 2 === 0 ? REFERENCE_COLORS.tableAlt : REFERENCE_COLORS.tableBase }, align: "right" as const, fontSize: 7.2, fontFace: FONTS.body } },
      { text: row.valueB, options: { fill: { color: idx % 2 === 0 ? REFERENCE_COLORS.tableAlt : REFERENCE_COLORS.tableBase }, align: "right" as const, fontSize: 7.2, fontFace: FONTS.body } },
      { text: row.delta, options: { fill: { color: idx % 2 === 0 ? REFERENCE_COLORS.tableAlt : REFERENCE_COLORS.tableBase }, align: "right" as const, fontSize: 7.2, fontFace: FONTS.body } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 6.35,
    y: 1.05,
    w: 3.15,
    rowH: 0.28,
    border: { type: "solid", color: REFERENCE_COLORS.tableBorder, pt: 0.6 },
  });
  slide.addText(`• ${summarizeTopLines(commentary, 4).join("\n• ")}`, {
    x: LAYOUT.marginX,
    y: 3.7,
    w: LAYOUT.contentW,
    h: 1.1,
    fontSize: 9.5,
    fontFace: FONTS.body,
    color: COLORS.slate900,
    lineSpacingMultiple: 1.18,
    valign: "top",
  });
  addSourceAndNote(slide, "Company filings and in-app normalized metrics", "USD millions unless stated; CHG uses same unit as metric.", 4.86);
  addFooter(slide, pageNum.n, updated);
  return pageNum.n;
}

function pairTableMatrix(result: CompanyComparisonPayload): {
  section: string;
  rows: ComparisonRow[];
}[] {
  const out: { section: string; rows: ComparisonRow[] }[] = [];
  for (const section of SECTION_ORDER) {
    const rows = result.rows.filter((r) => r.section === section);
    if (rows.length > 0) out.push({ section, rows });
  }
  return out;
}

function addPairTableSlides(
  pres: PptxGenJS,
  result: CompanyComparisonPayload,
  pageNum: { n: number },
  updated: string
): void {
  const tA = result.companyA.ticker;
  const tB = result.companyB.ticker;
  const blocks = pairTableMatrix(result);

  for (const { section, rows } of blocks) {
    for (let i = 0; i < rows.length; i += ROWS_PER_TABLE_SLIDE) {
      const chunk = rows.slice(i, i + ROWS_PER_TABLE_SLIDE);
      const slide = pres.addSlide();
      slide.background = { fill: COLORS.white };
      pageNum.n += 1;
      slide.addText(
        `${section}${rows.length > ROWS_PER_TABLE_SLIDE ? ` (${i + 1}–${Math.min(i + ROWS_PER_TABLE_SLIDE, rows.length)} of ${rows.length})` : ""}`,
        {
          x: LAYOUT.marginX,
          y: LAYOUT.marginY,
          w: LAYOUT.contentW,
          h: 0.45,
          fontSize: 14,
          fontFace: FONTS.title,
          color: COLORS.navy,
          bold: true,
          align: "left",
        }
      );

      const header: PptxGenJS.TableCell[] = [
        {
          text: "Metric",
          options: {
            fill: { color: REFERENCE_COLORS.tableHeader },
            color: TABLE_STYLE.headerColor,
            fontSize: TABLE_STYLE.headerFontSize,
            fontFace: FONTS.body,
            bold: true,
            align: "left",
            valign: "middle",
            margin: TABLE_STYLE.cellPadding,
          },
        },
        {
          text: tA,
          options: {
            fill: { color: REFERENCE_COLORS.tableHeader },
            color: TABLE_STYLE.headerColor,
            fontSize: TABLE_STYLE.headerFontSize,
            fontFace: FONTS.body,
            bold: true,
            align: "right",
            valign: "middle",
            margin: TABLE_STYLE.cellPadding,
          },
        },
        {
          text: tB,
          options: {
            fill: { color: REFERENCE_COLORS.tableHeader },
            color: TABLE_STYLE.headerColor,
            fontSize: TABLE_STYLE.headerFontSize,
            fontFace: FONTS.body,
            bold: true,
            align: "right",
            valign: "middle",
            margin: TABLE_STYLE.cellPadding,
          },
        },
        {
          text: "Diff",
          options: {
            fill: { color: REFERENCE_COLORS.tableHeader },
            color: TABLE_STYLE.headerColor,
            fontSize: TABLE_STYLE.headerFontSize,
            fontFace: FONTS.body,
            bold: true,
            align: "right",
            valign: "middle",
            margin: TABLE_STYLE.cellPadding,
          },
        },
      ];

      const dataRows: PptxGenJS.TableRow[] = chunk.map((row, rowIdx) => {
        const fillColor = rowIdx % 2 === 0 ? REFERENCE_COLORS.tableBase : REFERENCE_COLORS.tableAlt;
        return [
          {
            text: row.label,
            options: {
              fill: { color: fillColor },
              fontSize: TABLE_STYLE.rowFontSize,
              fontFace: FONTS.body,
              color: COLORS.slate900,
              align: "left",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          },
          {
            text: fmtMetric(row.format, row.valueA),
            options: {
              fill: { color: fillColor },
              fontSize: TABLE_STYLE.rowFontSize,
              fontFace: FONTS.body,
              color: COLORS.slate700,
              align: "right",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          },
          {
            text: fmtMetric(row.format, row.valueB),
            options: {
              fill: { color: fillColor },
              fontSize: TABLE_STYLE.rowFontSize,
              fontFace: FONTS.body,
              color: COLORS.slate700,
              align: "right",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          },
          {
            text:
              row.difference != null
                ? row.format === "percent"
                  ? `${row.difference > 0 ? "+" : ""}${row.difference.toFixed(1)} pp`
                  : fmtMetric(row.format, row.difference)
                : "—",
            options: {
              fill: { color: fillColor },
              fontSize: TABLE_STYLE.rowFontSize,
              fontFace: FONTS.body,
              color: COLORS.slate700,
              align: "right",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          },
        ];
      });

      const tableRows: PptxGenJS.TableRow[] = [header, ...dataRows];
      const rowH = Math.min(0.32, (LAYOUT.slideH - 1.4 - LAYOUT.footerY) / tableRows.length);

      slide.addTable(tableRows, {
        x: LAYOUT.marginX,
        y: 0.95,
        w: LAYOUT.contentW,
        rowH,
        border: { type: "solid", color: REFERENCE_COLORS.tableBorder, pt: 0.6 },
        autoPage: false,
      });
      const insights = buildTableInsights(chunk, tA, tB);
      slide.addText(`• ${insights.slice(0, 2).join("\n• ")}`, {
        x: LAYOUT.marginX,
        y: 4.58,
        w: LAYOUT.contentW,
        h: 0.34,
        fontSize: 7.6,
        fontFace: FONTS.body,
        color: COLORS.slate700,
        valign: "top",
        lineSpacingMultiple: 1.15,
      });
      addSourceAndNote(slide, "Company filings and normalized comparison engine", "Values shown in USD millions unless %/x.", 5.0);
      addFooter(slide, pageNum.n, updated);
    }
  }
}

function addMultiTableSlides(
  pres: PptxGenJS,
  result: CompanyComparisonPayload,
  pageNum: { n: number },
  updated: string
): void {
  const tickers = result.multiCompanies!.map((c) => c.ticker);
  const rows = result.multiRows ?? [];
  const bySection = SECTION_ORDER.map((section) => ({
    section,
    rows: rows.filter((r) => r.section === section),
  })).filter((b) => b.rows.length > 0);

  for (const { section, rows: secRows } of bySection) {
    for (let i = 0; i < secRows.length; i += ROWS_PER_TABLE_SLIDE) {
      const chunk = secRows.slice(i, i + ROWS_PER_TABLE_SLIDE);
      const slide = pres.addSlide();
      slide.background = { fill: COLORS.white };
      pageNum.n += 1;
      slide.addText(section, {
        x: LAYOUT.marginX,
        y: LAYOUT.marginY,
        w: LAYOUT.contentW,
        h: 0.45,
        fontSize: 14,
        fontFace: FONTS.title,
        color: COLORS.navy,
        bold: true,
        align: "left",
      });

      const header: PptxGenJS.TableCell[] = [
        {
          text: "Metric",
          options: {
            fill: { color: REFERENCE_COLORS.tableHeader },
            color: TABLE_STYLE.headerColor,
            fontSize: 8,
            fontFace: FONTS.body,
            bold: true,
            align: "left",
            valign: "middle",
            margin: TABLE_STYLE.cellPadding,
          },
        },
        ...tickers.map(
          (t): PptxGenJS.TableCell => ({
            text: t,
            options: {
              fill: { color: REFERENCE_COLORS.tableHeader },
              color: TABLE_STYLE.headerColor,
              fontSize: 8,
              fontFace: FONTS.body,
              bold: true,
              align: "right",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          })
        ),
      ];

      const dataRows: PptxGenJS.TableRow[] = chunk.map((row: MultiComparisonRow, rowIndex: number) => {
        const fillColor = rowIndex % 2 === 0 ? REFERENCE_COLORS.tableBase : REFERENCE_COLORS.tableAlt;
        const cells: PptxGenJS.TableCell[] = [
          {
            text: row.label,
            options: {
              fill: { color: fillColor },
              fontSize: 7,
              fontFace: FONTS.body,
              color: COLORS.slate900,
              align: "left",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          },
        ];
        for (let ci = 0; ci < tickers.length; ci++) {
          cells.push({
            text: fmtMetric(row.format, row.values[ci] ?? null),
            options: {
              fill: { color: fillColor },
              fontSize: 7,
              fontFace: FONTS.body,
              color: COLORS.slate700,
              align: "right",
              valign: "middle",
              margin: TABLE_STYLE.cellPadding,
            },
          });
        }
        return cells;
      });

      const tableRows: PptxGenJS.TableRow[] = [header, ...dataRows];
      const rowH = Math.min(0.28, (LAYOUT.slideH - 1.2 - LAYOUT.footerY) / tableRows.length);
      slide.addTable(tableRows, {
        x: LAYOUT.marginX,
        y: 0.9,
        w: LAYOUT.contentW,
        rowH,
        border: { type: "solid", color: REFERENCE_COLORS.tableBorder, pt: 0.6 },
        autoPage: false,
      });
      const topTicker = tickers[0] ?? "Benchmark";
      slide.addText(
        `• ${topTicker} is the benchmark ticker in this peer slice.\n• Section rows highlight peer spread and outlier behavior.`,
        {
          x: LAYOUT.marginX,
          y: 4.58,
          w: LAYOUT.contentW,
          h: 0.34,
          fontSize: 7.6,
          fontFace: FONTS.body,
          color: COLORS.slate700,
          valign: "top",
          lineSpacingMultiple: 1.15,
        }
      );
      addSourceAndNote(slide, "Company filings and normalized comparison engine", "USD millions unless row marked otherwise.", 5.0);
      addFooter(slide, pageNum.n, updated);
    }
  }
}

function addPairChartSlide(
  pres: PptxGenJS,
  title: string,
  insight: string,
  chartData: Array<{ name: string; labels: string[]; values: number[] }>,
  pageNum: { n: number },
  updated: string
): void {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  const allValues = chartData.flatMap((d) => d.values).filter((v) => Number.isFinite(v));
  const axis = computeAdaptiveAxis(allValues);
  const comments = buildCompareComments(chartData);
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.45,
    fontSize: 14,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  slide.addText(insight, {
    x: LAYOUT.marginX,
    y: 0.85,
    w: LAYOUT.contentW,
    h: 0.55,
    fontSize: 9,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    align: "left",
  });
  slide.addText(`• ${comments.join("\n• ") || "No strong difference for this chart."}`, {
    x: LAYOUT.marginX,
    y: 4.44,
    w: LAYOUT.contentW,
    h: 0.46,
    fontSize: 7.8,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    valign: "top",
    lineSpacingMultiple: 1.15,
  });
  slide.addChart(pres.ChartType.bar, chartData, {
    x: LAYOUT.marginX,
    y: 1.45,
    w: LAYOUT.contentW,
    h: 2.78,
    showTitle: false,
    barGrouping: "clustered",
    chartColors: CHART_COLORS,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 8,
    showLegend: true,
    legendFontSize: 8,
    legendPos: "b",
    valGridLine: { color: COLORS.slate300, size: 0.5 },
    valAxisMinVal: axis.min,
    valAxisMaxVal: axis.max,
  });
  if (axis.truncated && axis.cutAt) {
    slide.addText(`Y-axis truncated near ${axis.cutAt.toLocaleString(undefined, { maximumFractionDigits: 0 })} to improve readability of smaller values.`, {
      x: LAYOUT.marginX,
      y: 4.25,
      w: LAYOUT.contentW,
      h: 0.22,
      fontSize: 7,
      fontFace: FONTS.body,
      color: COLORS.slate500,
      align: "left",
    });
    slide.addText("...", {
      x: 9.08,
      y: 1.52,
      w: 0.2,
      h: 0.18,
      fontSize: 13,
      fontFace: FONTS.title,
      color: COLORS.slate700,
      bold: true,
      align: "center",
    });
  }
  addSourceAndNote(slide, "Company filings and normalized comparison engine", "Amounts in USD millions unless margin %.", 5.0);
  addFooter(slide, pageNum.n, updated);
}

function addLineTrendSlide(
  pres: PptxGenJS,
  title: string,
  series: { name: string; labels: string[]; values: number[] }[],
  pageNum: { n: number },
  updated: string,
  valAxisFmt?: string
): void {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };
  pageNum.n += 1;
  const allValues = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const axis = computeAdaptiveAxis(allValues);
  const comments = buildTrendInsights(series).slice(0, 4);
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.45,
    fontSize: 14,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  const isPair = series.length === 2;
  const chartX = 0.25;
  const chartW = 9.45;
  const baseChartY = isPair ? 2.25 : 0.82;
  const baseChartH = isPair ? 2.18 : 3.78;
  if (isPair) {
    const timeline = series[0].labels;
    const diffValues = timeline.map((_, i) => (series[1].values[i] ?? 0) - (series[0].values[i] ?? 0));
    const diffAbs = diffValues.map((v) => Math.abs(v));
    const diffBound = Math.max(1, Math.ceil(Math.max(...diffAbs, 1) * 1.2));
    const diffTitle = title.toLowerCase().includes("revenue")
      ? "Revenue difference vs. Company A"
      : `${title.replace(/\s*trend.*$/i, "")} difference vs. Company A`;
    const latestDiff = diffValues[diffValues.length - 1] ?? 0;
    const latestLabel = latestDiff >= 0
      ? `${series[1].name} above ${series[0].name} by ${latestDiff.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
      : `${series[1].name} below ${series[0].name} by ${Math.abs(latestDiff).toLocaleString(undefined, { maximumFractionDigits: 1 })}`;

    slide.addText(diffTitle, {
      x: LAYOUT.marginX,
      y: 0.78,
      w: 4.8,
      h: 0.22,
      fontSize: 9.2,
      fontFace: FONTS.title,
      color: COLORS.navy,
      bold: true,
      align: "left",
    });
    slide.addText(`Positive values mean ${series[1].name} is above ${series[0].name}`, {
      x: LAYOUT.marginX,
      y: 0.96,
      w: 5.2,
      h: 0.18,
      fontSize: 7,
      fontFace: FONTS.body,
      color: COLORS.slate500,
      align: "left",
    });
    slide.addText(latestLabel, {
      x: 6.1,
      y: 0.8,
      w: 3.45,
      h: 0.2,
      fontSize: 6.8,
      fontFace: FONTS.body,
      color: COLORS.slate700,
      bold: true,
      align: "right",
    });
    slide.addChart(
      pres.ChartType.line,
      [
        {
          name: `${series[1].name} - ${series[0].name}`,
          labels: timeline,
          values: diffValues,
        },
      ],
      {
        x: chartX,
        y: 1.15,
        w: chartW,
        h: 1.0,
        showTitle: false,
        chartColors: [CHART_COLORS[1]],
        catAxisLabelFontSize: 7,
        valAxisLabelFontSize: 7,
        showLegend: false,
        lineDataSymbol: "square",
        lineDataSymbolSize: 5,
        showValue: false,
        lineSmooth: false,
        valAxisLabelFormatCode: valAxisFmt,
        valAxisMinVal: -diffBound,
        valAxisMaxVal: diffBound,
        catAxisCrossesAt: 0,
      }
    );
  }
  slide.addChart(pres.ChartType.line, series, {
    x: chartX,
    y: baseChartY,
    w: chartW,
    h: baseChartH,
    showTitle: false,
    chartColors: CHART_COLORS,
    catAxisLabelFontSize: 7,
    valAxisLabelFontSize: 7,
    showLegend: true,
    legendFontSize: 7,
    legendPos: "b",
    lineDataSymbol: "square",
    lineDataSymbolSize: 6,
    showValue: false,
    lineSmooth: false,
    valAxisLabelFormatCode: valAxisFmt,
    valAxisMinVal: axis.min,
    valAxisMaxVal: axis.max,
  });
  const yMin = axis.min ?? Math.min(...allValues, 0);
  const yMax = axis.max ?? Math.max(...allValues, 1) * 1.08;
  addTrendValueBoxes(
    slide,
    series,
    chartX,
    baseChartY,
    chartW,
    baseChartH,
    yMin,
    yMax,
    valAxisFmt
  );
  for (const line of series.slice(0, 2)) {
    const n = line.values.length;
    if (n < 1) continue;
    const last = line.values[n - 1];
    const prev = n > 1 ? line.values[n - 2] : line.values[n - 1];
    slide.addText(`${line.name}: ${last.toLocaleString(undefined, { maximumFractionDigits: 1 })}`, {
      x: n > 1 && last >= prev ? 8.25 : 0.6,
      y: n > 1 && last >= prev ? baseChartY + 0.04 : baseChartY + 0.22,
      w: 1.35,
      h: 0.18,
      fontSize: 7.2,
      fontFace: FONTS.body,
      color: COLORS.slate900,
      bold: true,
      align: "left",
    });
  }
  if (axis.truncated && axis.cutAt) {
    slide.addText(`Y-axis truncated near ${axis.cutAt.toLocaleString(undefined, { maximumFractionDigits: 0 })} to preserve smaller-value trend visibility.`, {
      x: LAYOUT.marginX,
      y: 4.48,
      w: LAYOUT.contentW,
      h: 0.18,
      fontSize: 7,
      fontFace: FONTS.body,
      color: COLORS.slate500,
      align: "left",
    });
  }
  if (comments.length > 0) {
    slide.addText(`• ${comments.slice(0, 3).join("\n• ")}`, {
      x: LAYOUT.marginX,
      y: 4.63,
      w: LAYOUT.contentW,
      h: 0.22,
      fontSize: 6.8,
      fontFace: FONTS.body,
      color: COLORS.slate700,
      lineSpacingMultiple: 1.15,
      valign: "top",
    });
  }
  addSourceAndNote(slide, "Company filings and normalized comparison engine", "Trend uses reported historical periods; units follow chart title.", 5.06);
  addFooter(slide, pageNum.n, updated);
}

/** Build downloadable .pptx buffer from the same payload used for on-screen peer comparison. */
export async function generateCompanyComparisonPptx(
  result: CompanyComparisonPayload
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Competitor Analysis";
  const updated = new Date(result.generatedAt).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const pageNum = { n: 0 };

  const multi = isMultiPayload(result);
  const titleText = multi
    ? `Peer comparison — ${result.multiCompanies!.map((c) => c.ticker).join(" · ")}`
    : result.report.title;
  const periodLine = multi
    ? result.multiCompanies!.map((c) => `${c.ticker}: ${c.quarterLabel}`).join(" · ")
    : result.report.subtitle;
  const dateLine = `Report date: ${updated}`;

  pageNum.n = addTitleSlide(pres, titleText, periodLine, dateLine);

  const tocItems = [
    "Executive summary",
    multi ? "Multi-company financial table" : "Financial comparison tables",
    "Key metrics — bar charts",
    "Historical trends",
    "Data notes & methodology",
  ];
  addTocSlide(pres, tocItems, pageNum, updated);

  addSectionDivider(
    pres,
    "Executive summary",
    "Automated narrative from comparison engine",
    pageNum,
    updated
  );

  const execBullets = [
    ...result.narrative.executiveSummary.slice(0, 5),
    ...result.report.sections.find((s) => s.key === "overview")?.bullets.slice(0, 4) ?? [],
  ];
  addNarrativeSlide(
    pres,
    "Overview & investment context",
    execBullets,
    result.narrative.investmentInterpretation[0],
    pageNum,
    updated
  );

  if (!multi) {
    await addEarningsStockSlide(pres, {
      companyName: result.companyB.ticker,
      ticker: result.companyB.ticker,
      period: result.companyB.quarterLabel,
      metrics: {
        revenue: result.companyB.metrics.revenue ?? undefined,
        ebitda: result.companyB.metrics.ebitda ?? undefined,
        netIncome: result.companyB.metrics.netIncome ?? undefined,
        fcf: result.companyB.metrics.freeCashFlow ?? undefined,
      },
      insights: [
        ...buildEarningsNumericalInsights(result),
        ...result.narrative.truePerformanceDiagnosis,
        ...result.narrative.whatChanged,
        ...result.narrative.investmentInterpretation,
      ],
    });
    pageNum.n += 1;

    const keyRows = result.rows.filter(
      (row) =>
        row.section === "Income Statement" &&
        ["Revenue", "Operating Income", "Net Income", "Free Cash Flow"].includes(row.label)
    );
    const sideTable = keyRows.map((row) => ({
      metric: row.label,
      valueA: fmtMetric(row.format, row.valueA),
      valueB: fmtMetric(row.format, row.valueB),
      delta:
        row.difference == null
          ? "—"
          : row.format === "percent"
            ? `${row.difference > 0 ? "+" : ""}${row.difference.toFixed(1)} pp`
            : fmtMetric(row.format, row.difference),
    }));
    const chartSeries = result.charts.financialBars.slice(0, 3).map((item) => ({
      name: item.metric,
      labels: [result.companyA.ticker, result.companyB.ticker],
      values: [item.companyA ?? 0, item.companyB ?? 0],
    }));
    if (chartSeries.length > 0) {
      addKeyFinancialAnalysisSlide(
        pres,
        `${result.companyA.ticker} vs ${result.companyB.ticker} Sales and Profitability`,
        chartSeries,
        sideTable,
        [...result.narrative.costStructureBridge, ...result.narrative.marginGapDecomposition],
        pageNum,
        updated
      );
    }
    if (result.trends.revenue.length >= 2 && result.trends.operatingMargin.length >= 2) {
      addSalesMarginDashboardSlide(pres, result, pageNum, updated);
    }
  }

  addSectionDivider(
    pres,
    multi ? "Financial metrics (all peers)" : "Financial comparison",
    "Same fiscal basis where extraction allows — see warnings in app",
    pageNum,
    updated
  );

  if (multi) {
    addMultiTableSlides(pres, result, pageNum, updated);
  } else {
    addPairTableSlides(pres, result, pageNum, updated);
  }

  addSectionDivider(pres, "Charts — levels & margins", "Clustered bars — USD millions for dollar metrics", pageNum, updated);

  if (!multi) {
    const fin = result.charts.financialBars.map((r) => ({
      name: r.metric,
      labels: [result.companyA.ticker, result.companyB.ticker],
      values: [r.companyA ?? 0, r.companyB ?? 0],
    }));
    if (fin.length > 0) {
      addPairChartSlide(
        pres,
        "Revenue, EBITDA, net income, FCF",
        "Scale comparison for the selected filing period.",
        fin,
        pageNum,
        updated
      );
    }
    const marg = result.charts.marginBars.map((r) => ({
      name: r.metric,
      labels: [result.companyA.ticker, result.companyB.ticker],
      values: [r.companyA ?? 0, r.companyB ?? 0],
    }));
    if (marg.length > 0) {
      addPairChartSlide(
        pres,
        "Gross / operating / net margin",
        "Percent of revenue.",
        marg,
        pageNum,
        updated
      );
    }
    addCombinedChartConclusionSlide(pres, result, pageNum, updated);
  } else if (result.multiFinancialBars && result.multiCompanies) {
    const tickers = result.multiCompanies.map((c) => c.ticker);
    const labels = result.multiFinancialBars.map((r) => String(r.metric));
    const series = tickers.map((t, idx) => ({
      name: t,
      labels,
      values: result.multiFinancialBars!.map((row) => Number(row[t] ?? 0)),
    }));
    addPairChartSlide(
      pres,
      "Revenue, EBITDA, net income, FCF (all peers)",
      "Clustered bars — first ticker is margin benchmark in app.",
      series,
      pageNum,
      updated
    );
  }

  addSectionDivider(pres, "Trends", "Trailing periods in database", pageNum, updated);

  if (!multi) {
    const revSeries = [
      {
        name: result.companyA.ticker,
        labels: result.trends.revenue.map((p) => p.quarterLabel),
        values: result.trends.revenue.map((p) => p.companyA ?? 0),
      },
      {
        name: result.companyB.ticker,
        labels: result.trends.revenue.map((p) => p.quarterLabel),
        values: result.trends.revenue.map((p) => p.companyB ?? 0),
      },
    ];
    if (result.trends.revenue.length > 0) {
      addLineTrendSlide(pres, "Revenue trend", revSeries, pageNum, updated, "#,##0");
    }
    const omSeries = [
      {
        name: result.companyA.ticker,
        labels: result.trends.operatingMargin.map((p) => p.quarterLabel),
        values: result.trends.operatingMargin.map((p) => p.companyA ?? 0),
      },
      {
        name: result.companyB.ticker,
        labels: result.trends.operatingMargin.map((p) => p.quarterLabel),
        values: result.trends.operatingMargin.map((p) => p.companyB ?? 0),
      },
    ];
    if (result.trends.operatingMargin.length > 0) {
      addLineTrendSlide(pres, "Operating margin trend (%)", omSeries, pageNum, updated, "0.0");
    }
  } else if (result.multiTrends?.revenue && result.multiCompanies) {
    const tickers = result.multiCompanies.map((c) => c.ticker);
    const labels = result.multiTrends.revenue.map((p) => p.quarterLabel);
    const series = tickers.map((t) => ({
      name: t,
      labels,
      values: result.multiTrends!.revenue.map((p) => p.byTicker[t] ?? 0),
    }));
    addLineTrendSlide(pres, "Revenue trend (all peers)", series, pageNum, updated, "#,##0");
  }

  const warnSlide = pres.addSlide();
  warnSlide.background = { fill: COLORS.white };
  pageNum.n += 1;
  warnSlide.addText("Data quality & methodology", {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: 0.45,
    fontSize: 14,
    fontFace: FONTS.title,
    color: COLORS.navy,
    bold: true,
    align: "left",
  });
  const warnText =
    result.warnings.length > 0
      ? result.warnings.map((w) => `• ${w.message}`).join("\n")
      : "• No blocking warnings for this export.";
  warnSlide.addText(warnText, {
    x: LAYOUT.marginX,
    y: 0.95,
    w: LAYOUT.contentW,
    h: 3.5,
    fontSize: 10,
    fontFace: FONTS.body,
    color: COLORS.slate700,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.2,
  });
  addFooter(warnSlide, pageNum.n, updated);

  pres.title = titleText;
  const out = await pres.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
