/**
 * PPTX Export Engine — converts SlideBlocks / DeckSections into
 * downloadable .pptx files using pptxgenjs.
 *
 * Server-side only (Node.js runtime).
 */

import PptxGenJS from "pptxgenjs";
import type { SlideBlock, ChartSeries } from "@/types/slideBlocks";
import type { DeckSection } from "@/types/deckSection";
import { COLORS, FONTS, LAYOUT, TABLE_STYLE } from "./pptxTemplates";

// ---------------------------------------------------------------------------
// Chart color palettes
// ---------------------------------------------------------------------------

const CHART_COLORS = ["3B82F6", "F97316", "10B981", "8B5CF6", "EF4444", "06B6D4"];
const LINE_CHART_COLORS = ["1E40AF", "C2410C", "047857", "6D28D9"];

// Block types that should render as LINE charts
const LINE_BLOCK_TYPES = new Set(["margin-gap-trend", "sga-trend"]);

// Block types that use BAR with possible LINE overlay
const BAR_WITH_LINE_BLOCK_TYPES = new Set([
  "quarterly-trend",
  "segment-margin-comparison",
  "segment-revenue-composition",
  "per-unit-comparison",
]);

// Block types that use grouped BAR charts
const GROUPED_BAR_BLOCK_TYPES = new Set([
  "sequential-comparison",
  "yoy-comparison",
  "ttm-comparison",
  "benchmark-table",
  "methodology-comparison",
  "market-data-volume",
  "market-data-channel",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;

function addTitleSlide(pres: PptxGenJS, title: string, subtitle?: string) {
  const slide = pres.addSlide();
  // Dark background
  slide.background = { fill: COLORS.navy };

  // Title
  slide.addText(title, {
    x: LAYOUT.marginX,
    y: 1.5,
    w: LAYOUT.contentW,
    h: 1.2,
    fontSize: 32,
    fontFace: FONTS.title,
    color: COLORS.white,
    bold: true,
    align: "left",
    valign: "middle",
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: LAYOUT.marginX,
      y: 2.8,
      w: LAYOUT.contentW,
      h: 0.5,
      fontSize: 14,
      fontFace: FONTS.body,
      color: COLORS.ice,
      align: "left",
    });
  }

  // Footer accent line
  slide.addShape("rect" as PptxGenJS.ShapeType, {
    x: LAYOUT.marginX,
    y: 4.8,
    w: 2,
    h: 0.04,
    fill: { color: COLORS.primary },
  });
}

function addSectionDivider(pres: PptxGenJS, title: string, subtitle?: string) {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.slate900 };

  slide.addText(title, {
    x: LAYOUT.marginX,
    y: 2,
    w: LAYOUT.contentW,
    h: 0.8,
    fontSize: 24,
    fontFace: FONTS.title,
    color: COLORS.white,
    bold: true,
    align: "left",
    valign: "middle",
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: LAYOUT.marginX,
      y: 2.8,
      w: LAYOUT.contentW,
      h: 0.4,
      fontSize: 12,
      fontFace: FONTS.body,
      color: COLORS.slate500,
    });
  }
}

function addFooter(slide: PptxSlide, text: string) {
  slide.addText(text, {
    x: LAYOUT.marginX,
    y: LAYOUT.footerY,
    w: LAYOUT.contentW,
    h: 0.3,
    fontSize: 6,
    fontFace: FONTS.body,
    color: COLORS.slate500,
    align: "left",
  });
}

// ---------------------------------------------------------------------------
// Chart rendering
// ---------------------------------------------------------------------------

function addChartToSlide(
  pres: PptxGenJS,
  slide: PptxSlide,
  block: SlideBlock,
  startY: number,
  availableH: number
) {
  const chartH = Math.min(2.5, Math.max(1.8, availableH));
  const chartY = startY;

  // --- Waterfall (bridge) charts ---
  if (block.bridgeComponents && block.bridgeComponents.length > 0) {
    addWaterfallChart(pres, slide, block, chartY, chartH);
    return;
  }

  // --- Standard chart series ---
  if (block.chartSeries.length === 0) return;

  const blockType = block.blockType;

  if (LINE_BLOCK_TYPES.has(blockType)) {
    addLineChart(pres, slide, block, chartY, chartH);
  } else if (BAR_WITH_LINE_BLOCK_TYPES.has(blockType)) {
    addBarWithOptionalLineChart(pres, slide, block, chartY, chartH);
  } else if (GROUPED_BAR_BLOCK_TYPES.has(blockType)) {
    addGroupedBarChart(pres, slide, block, chartY, chartH);
  } else {
    // Default: grouped bar
    addGroupedBarChart(pres, slide, block, chartY, chartH);
  }
}

function toChartData(series: ChartSeries[]) {
  return series.map((s) => ({
    name: s.name,
    labels: s.data.map((d) => d.label),
    values: s.data.map((d) => d.value ?? 0),
  }));
}

function pickColors(series: ChartSeries[], palette: string[]): string[] {
  return series.map((s, i) =>
    s.color && s.color !== "line" ? s.color.replace("#", "") : palette[i % palette.length]
  );
}

function addLineChart(
  pres: PptxGenJS,
  slide: PptxSlide,
  block: SlideBlock,
  chartY: number,
  chartH: number
) {
  const chartData = toChartData(block.chartSeries);
  const colors = pickColors(block.chartSeries, LINE_CHART_COLORS);

  slide.addChart(pres.ChartType.line, chartData, {
    x: LAYOUT.marginX,
    y: chartY,
    w: LAYOUT.contentW,
    h: chartH,
    showTitle: false,
    catAxisLabelFontSize: 7,
    valAxisLabelFontSize: 7,
    showLegend: true,
    legendFontSize: 7,
    legendPos: "b",
    chartColors: colors,
    lineDataSymbolSize: 6,
    lineSmooth: false,
  });
}

function addGroupedBarChart(
  pres: PptxGenJS,
  slide: PptxSlide,
  block: SlideBlock,
  chartY: number,
  chartH: number
) {
  const chartData = toChartData(block.chartSeries);
  const colors = pickColors(block.chartSeries, CHART_COLORS);

  slide.addChart(pres.ChartType.bar, chartData, {
    x: LAYOUT.marginX,
    y: chartY,
    w: LAYOUT.contentW,
    h: chartH,
    showTitle: false,
    barGrouping: "clustered",
    catAxisLabelFontSize: 7,
    valAxisLabelFontSize: 7,
    showLegend: true,
    legendFontSize: 7,
    legendPos: "b",
    chartColors: colors,
    valGridLine: { color: COLORS.slate300, size: 0.5 },
  });
}

function addBarWithOptionalLineChart(
  pres: PptxGenJS,
  slide: PptxSlide,
  block: SlideBlock,
  chartY: number,
  chartH: number
) {
  // Split series into bar and line groups
  const barSeries = block.chartSeries.filter((s) => s.color !== "line");
  const lineSeries = block.chartSeries.filter((s) => s.color === "line");

  if (lineSeries.length === 0) {
    // No line overlay — plain bar chart
    addGroupedBarChart(pres, slide, block, chartY, chartH);
    return;
  }

  // Combo chart: BAR + LINE
  const barColors = pickColors(barSeries, CHART_COLORS);
  const lineColors = pickColors(lineSeries, LINE_CHART_COLORS);

  const comboType: PptxGenJS.IChartMulti[] = [
    {
      type: pres.ChartType.bar,
      data: toChartData(barSeries),
      options: {
        chartColors: barColors,
        barGrouping: "clustered",
      } as PptxGenJS.IChartOpts,
    },
    {
      type: pres.ChartType.line,
      data: toChartData(lineSeries),
      options: {
        chartColors: lineColors,
        lineDataSymbolSize: 6,
        lineSmooth: false,
        secondaryValAxis: lineSeries.length > 0,
        secondaryCatAxis: false,
      } as PptxGenJS.IChartOpts,
    },
  ];

  slide.addChart(comboType, [], {
    x: LAYOUT.marginX,
    y: chartY,
    w: LAYOUT.contentW,
    h: chartH,
    showTitle: false,
    catAxisLabelFontSize: 7,
    valAxisLabelFontSize: 7,
    showLegend: true,
    legendFontSize: 7,
    legendPos: "b",
    valGridLine: { color: COLORS.slate300, size: 0.5 },
  });
}

function addWaterfallChart(
  pres: PptxGenJS,
  slide: PptxSlide,
  block: SlideBlock,
  chartY: number,
  chartH: number
) {
  const components = block.bridgeComponents!;

  // Build stacked bar data simulating a waterfall:
  // "Base" series (transparent) + "Delta" series (colored)
  const labels: string[] = [];
  const baseValues: number[] = [];
  const deltaValues: number[] = [];
  const deltaColors: string[] = [];

  for (const comp of components) {
    labels.push(comp.label);

    if (comp.type === "start" || comp.type === "end") {
      // Full bar from zero
      baseValues.push(0);
      deltaValues.push(comp.value);
      deltaColors.push(comp.type === "start" ? COLORS.primary : COLORS.navy);
    } else {
      // Delta: base is the lower of runningTotal and runningTotal - value
      const base = comp.value >= 0 ? comp.runningTotal - comp.value : comp.runningTotal;
      baseValues.push(Math.max(0, base));
      deltaValues.push(Math.abs(comp.value));
      deltaColors.push(comp.value >= 0 ? COLORS.emerald : COLORS.red);
    }
  }

  // Stacked bar chart: transparent "Base" series + colored "Delta" series
  // pptxgenjs doesn't support per-point colors in a single series,
  // so we use a single delta color (primary blue) for simplicity.
  const chartData = [
    { name: "Base", labels, values: baseValues },
    { name: "Change", labels, values: deltaValues },
  ];

  slide.addChart(pres.ChartType.bar, chartData, {
    x: LAYOUT.marginX,
    y: chartY,
    w: LAYOUT.contentW,
    h: chartH,
    showTitle: false,
    barGrouping: "stacked",
    chartColors: [COLORS.transparent, COLORS.primary],
    catAxisLabelFontSize: 7,
    valAxisLabelFontSize: 7,
    showLegend: false,
    valGridLine: { color: COLORS.slate300, size: 0.5 },
  });
}

// ---------------------------------------------------------------------------
// Block → Slide rendering
// ---------------------------------------------------------------------------

function renderBlockSlide(pres: PptxGenJS, block: SlideBlock) {
  const slide = pres.addSlide();
  slide.background = { fill: COLORS.white };

  // Slide title
  slide.addText(block.title, {
    x: LAYOUT.marginX,
    y: LAYOUT.marginY,
    w: LAYOUT.contentW,
    h: LAYOUT.titleH,
    fontSize: 16,
    fontFace: FONTS.title,
    color: COLORS.slate900,
    bold: true,
    align: "left",
    valign: "middle",
  });

  // Subtitle
  if (block.subtitle) {
    slide.addText(block.subtitle, {
      x: LAYOUT.marginX,
      y: LAYOUT.marginY + LAYOUT.titleH,
      w: LAYOUT.contentW,
      h: LAYOUT.subtitleH,
      fontSize: 9,
      fontFace: FONTS.body,
      color: COLORS.slate500,
      align: "left",
    });
  }

  // Headlines row
  let contentStartY = LAYOUT.marginY + LAYOUT.titleH + LAYOUT.subtitleH + 0.1;
  if (block.headlines.length > 0) {
    const hlWidth = Math.min(2.2, LAYOUT.contentW / block.headlines.length);
    block.headlines.forEach((hl, i) => {
      const hlColor =
        hl.direction === "positive" ? COLORS.emerald
        : hl.direction === "negative" ? COLORS.red
        : COLORS.slate700;

      slide.addText([
        { text: hl.label, options: { fontSize: 7, color: COLORS.slate500, breakLine: true } },
        { text: hl.value, options: { fontSize: 14, bold: true, color: hlColor, breakLine: true } },
        ...(hl.comparison ? [{ text: hl.comparison, options: { fontSize: 6, color: COLORS.slate500 } }] : []),
      ], {
        x: LAYOUT.marginX + i * hlWidth,
        y: contentStartY,
        w: hlWidth - 0.1,
        h: 0.65,
        valign: "top",
      });
    });
    contentStartY += 0.75;
  }

  // Narrative body (for narrative blocks)
  if (block.blockType === "narrative-block" && block.narrativeBody) {
    const lines = block.narrativeBody.split("\n").filter((l) => l.trim());
    const textArr = lines.map((line, i) => ({
      text: line,
      options: {
        fontSize: 9,
        fontFace: FONTS.body,
        color: COLORS.slate700,
        breakLine: i < lines.length - 1,
      },
    }));
    slide.addText(textArr as PptxGenJS.TextProps[], {
      x: LAYOUT.marginX,
      y: contentStartY,
      w: LAYOUT.contentW,
      h: LAYOUT.slideH - contentStartY - 0.6,
      valign: "top",
    });

    addFooter(slide, block.footnotes.join(" | "));
    return;
  }

  // Determine whether this block has chart data
  const hasChart = block.chartSeries.length > 0 || (block.bridgeComponents && block.bridgeComponents.length > 0);
  const chartH = hasChart ? 2.2 : 0;
  const chartGap = hasChart ? 0.15 : 0;

  // Table
  let tableEndY = contentStartY;
  if (block.table.rows.length > 0) {
    const tableRows: PptxGenJS.TableRow[] = [];

    // Header row
    const headerCells: PptxGenJS.TableCell[] = block.table.columns.map((col) => ({
      text: col.header + (col.subHeader ? `\n${col.subHeader}` : ""),
      options: {
        fill: { color: TABLE_STYLE.headerFill },
        color: TABLE_STYLE.headerColor,
        fontSize: TABLE_STYLE.headerFontSize,
        fontFace: FONTS.body,
        bold: true,
        align: col.align === "right" ? "right" as const : col.align === "center" ? "center" as const : "left" as const,
        valign: "middle" as const,
        margin: TABLE_STYLE.cellPadding,
      },
    }));
    tableRows.push(headerCells);

    // Data rows
    block.table.rows.forEach((row, ri) => {
      if (row.rowType === "spacer") return;

      const isAlt = ri % 2 === 1;
      const isBold = row.rowType === "subtotal" || row.rowType === "total" || row.rowType === "header";
      const bgColor = row.rowType === "header" ? COLORS.slate100
        : row.rowType === "total" ? COLORS.slate100
        : isAlt ? COLORS.offWhite
        : COLORS.white;

      const rowCells: PptxGenJS.TableCell[] = [
        {
          text: row.label,
          options: {
            fill: { color: bgColor },
            color: COLORS.slate700,
            fontSize: TABLE_STYLE.rowFontSize,
            fontFace: FONTS.body,
            bold: isBold,
            align: "left" as const,
            valign: "middle" as const,
            margin: TABLE_STYLE.cellPadding,
          },
        },
        ...row.cells.map((c) => {
          const cellColor =
            c.direction === "positive" ? COLORS.emerald
            : c.direction === "negative" ? COLORS.red
            : COLORS.slate700;

          return {
            text: c.display + (c.change ? ` ${c.change}` : ""),
            options: {
              fill: { color: bgColor },
              color: cellColor,
              fontSize: TABLE_STYLE.rowFontSize,
              fontFace: FONTS.body,
              bold: isBold,
              align: "right" as const,
              valign: "middle" as const,
              margin: TABLE_STYLE.cellPadding,
            },
          } as PptxGenJS.TableCell;
        }),
      ];
      tableRows.push(rowCells);
    });

    // Calculate available height — reduce for chart if present
    const totalAvailH = LAYOUT.slideH - contentStartY - 0.6;
    const tableAvailH = hasChart ? totalAvailH - chartH - chartGap : totalAvailH;
    const rowH = Math.min(0.28, tableAvailH / tableRows.length);

    slide.addTable(tableRows, {
      x: LAYOUT.marginX,
      y: contentStartY,
      w: LAYOUT.contentW,
      rowH,
      border: { type: "solid", color: TABLE_STYLE.borderColor, pt: TABLE_STYLE.borderWidth },
      autoPage: false,
    });

    tableEndY = contentStartY + rowH * tableRows.length + chartGap;
  }

  // Chart rendering
  if (hasChart) {
    const chartStartY = block.table.rows.length > 0
      ? tableEndY
      : contentStartY;
    const chartAvailH = LAYOUT.slideH - chartStartY - 0.6;
    const effectiveChartH = block.table.rows.length > 0
      ? Math.min(chartH, chartAvailH)
      : Math.min(3.0, chartAvailH);

    if (effectiveChartH > 1.0) {
      addChartToSlide(pres, slide, block, chartStartY, effectiveChartH);
    }
  }

  // Footnotes
  if (block.footnotes.length > 0) {
    addFooter(slide, block.footnotes.join(" | "));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a PPTX buffer from a flat list of slide blocks. */
export async function generatePptxFromBlocks(
  blocks: SlideBlock[],
  title: string,
  subtitle?: string
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Dividend IQ";
  pres.title = title;

  addTitleSlide(pres, title, subtitle);

  for (const block of blocks) {
    renderBlockSlide(pres, block);
  }

  const output = await pres.write({ outputType: "nodebuffer" });
  return output as Buffer;
}

/** Generate a PPTX buffer from deck sections (with section dividers). */
export async function generatePptxFromDeck(
  sections: DeckSection[],
  title: string,
  subtitle?: string
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Dividend IQ";
  pres.title = title;

  addTitleSlide(pres, title, subtitle);

  for (const section of sections) {
    if (section.sectionType === "title") continue; // title already added
    if (section.blocks.length === 0) continue;

    // Section divider
    addSectionDivider(pres, section.title, section.subtitle);

    // Section blocks
    for (const block of section.blocks) {
      renderBlockSlide(pres, block);
    }
  }

  const output = await pres.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
