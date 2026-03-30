/**
 * PPTX Export Engine — converts SlideBlocks / DeckSections into
 * downloadable .pptx files using pptxgenjs.
 *
 * Server-side only (Node.js runtime).
 */

import PptxGenJS from "pptxgenjs";
import type { SlideBlock } from "@/types/slideBlocks";
import type { DeckSection } from "@/types/deckSection";
import { COLORS, FONTS, LAYOUT, TABLE_STYLE } from "./pptxTemplates";

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

  // Table
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

    // Calculate available height
    const availH = LAYOUT.slideH - contentStartY - 0.6;
    const rowH = Math.min(0.28, availH / tableRows.length);

    slide.addTable(tableRows, {
      x: LAYOUT.marginX,
      y: contentStartY,
      w: LAYOUT.contentW,
      rowH,
      border: { type: "solid", color: TABLE_STYLE.borderColor, pt: TABLE_STYLE.borderWidth },
      autoPage: false,
    });
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
