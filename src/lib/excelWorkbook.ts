import * as XLSX from "xlsx";
import { normalizeCellStyle } from "@/lib/dataSourceWorkbook";
import type { DataSourceWorkbookCellStyle } from "@/types/dataSourceWorkbook";

export const EXCEL_ANALYZE_MAX_ROWS = 250;
export const EXCEL_ANALYZE_MAX_COLS = 20;
export const EXCEL_EDITOR_MIN_ROWS = 1;
export const EXCEL_EDITOR_MIN_COLS = 1;

export interface EditableWorkbookSheet {
  name: string;
  cells: string[][];
}

export interface EditableWorkbook {
  sheets: EditableWorkbookSheet[];
  styles: Record<string, DataSourceWorkbookCellStyle | null>;
}

export function cellStyleKey(sheetIndex: number, rowIndex: number, colIndex: number): string {
  return `${sheetIndex}:${rowIndex}:${colIndex}`;
}

export function getSheetColumnCount(sheet: EditableWorkbookSheet): number {
  return Math.max(EXCEL_EDITOR_MIN_COLS, ...sheet.cells.map((row) => row.length), 0);
}

export function ensureSheetSize(
  sheet: EditableWorkbookSheet,
  minRows = EXCEL_EDITOR_MIN_ROWS,
  minCols = EXCEL_EDITOR_MIN_COLS,
): EditableWorkbookSheet {
  const rowCount = Math.max(minRows, sheet.cells.length, 1);
  const colCount = Math.max(minCols, getSheetColumnCount(sheet), 1);

  return {
    ...sheet,
    cells: Array.from({ length: rowCount }, (_, rowIndex) =>
      Array.from({ length: colCount }, (_, colIndex) => sheet.cells[rowIndex]?.[colIndex] ?? ""),
    ),
  };
}

export function createBlankSheet(name = "Sheet1"): EditableWorkbookSheet {
  return ensureSheetSize({ name, cells: [] });
}

function normalizeSheetRows(
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string[][] {
  const limitedRows = rows.slice(0, EXCEL_ANALYZE_MAX_ROWS).map((row) =>
    row.slice(0, EXCEL_ANALYZE_MAX_COLS).map((cell) => String(cell ?? ""))
  );

  return ensureSheetSize({
    name: "",
    cells: limitedRows,
  }).cells;
}

export function buildEditableWorkbookFromArrayBuffer(buffer: ArrayBuffer): EditableWorkbook {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets: EditableWorkbookSheet[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheet
      ? XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(sheet, {
          header: 1,
          raw: false,
          defval: "",
        })
      : [];

    return {
      name: sheetName,
      cells: normalizeSheetRows(rows),
    };
  });

  return {
    sheets: sheets.length > 0 ? sheets : [createBlankSheet()],
    styles: {},
  };
}

function parseNumericCellValue(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const negativeWrapped = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalized = negativeWrapped ? `-${trimmed.slice(1, -1)}` : trimmed;
  const cleaned = normalized.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatWorkbookCellValue(
  rawValue: string,
  style: DataSourceWorkbookCellStyle | null | undefined,
): string {
  const normalizedStyle = normalizeCellStyle(style);
  const format = normalizedStyle?.numberFormat;
  if (!format || format === "auto") return rawValue;

  const numericValue = parseNumericCellValue(rawValue);
  if (numericValue == null) return rawValue;

  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue);
    case "percent": {
      const percentValue = Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue;
      return `${percentValue.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`;
    }
    case "decimal-2":
      return numericValue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "integer":
      return Math.round(numericValue).toLocaleString("en-US");
    case "thousands":
      return `${(numericValue / 1000).toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}K`;
    default:
      return rawValue;
  }
}

export function serializeWorkbookForAnalysis(workbook: EditableWorkbook): string {
  const parts: string[] = [];

  workbook.sheets.forEach((sheet, sheetIndex) => {
    parts.push(`Sheet: ${sheet.name}`);

    sheet.cells.slice(0, EXCEL_ANALYZE_MAX_ROWS).forEach((row, rowIndex) => {
      const cells = row
        .slice(0, EXCEL_ANALYZE_MAX_COLS)
        .map((cell, colIndex) =>
          formatWorkbookCellValue(cell, workbook.styles[cellStyleKey(sheetIndex, rowIndex, colIndex)]).trim()
        )
        .filter(Boolean);

      if (cells.length > 0) {
        parts.push(cells.join(" | "));
      }
    });

    parts.push("");
  });

  return parts.join("\n").trim();
}
