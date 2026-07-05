"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Copy,
  DollarSign,
  Eraser,
  Italic,
  Percent,
  Rows3,
  Scissors,
  Trash2,
  Underline,
} from "lucide-react";
import { columnIndexToLetter, normalizeCellStyle } from "@/lib/dataSourceWorkbook";
import {
  cellStyleKey,
  ensureSheetSize,
  EXCEL_EDITOR_MIN_COLS,
  EXCEL_EDITOR_MIN_ROWS,
  formatWorkbookCellValue,
  getSheetColumnCount,
} from "@/lib/excelWorkbook";
import { cn } from "@/lib/utils";
import type { DataSourceWorkbookCellStyle, DataSourceWorkbookNumberFormat } from "@/types/dataSourceWorkbook";
import type { EditableWorkbook, EditableWorkbookSheet } from "@/lib/excelWorkbook";

const FONT_FAMILIES = ["Arial", "Calibri", "Georgia", "Times New Roman", "Verdana", "Courier New"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const DEFAULT_COLUMN_WIDTH = 118;
const DEFAULT_ROW_HEIGHT = 34;
const ROW_HEADER_WIDTH = 46;
const NUMBER_FORMAT_OPTIONS: Array<{ value: "auto" | DataSourceWorkbookNumberFormat; label: string }> = [
  { value: "auto", label: "Automatic" },
  { value: "currency", label: "Currency" },
  { value: "percent", label: "Percent" },
  { value: "decimal-2", label: "2 decimals" },
  { value: "integer", label: "Integer" },
  { value: "thousands", label: "Thousands" },
];

interface SelectionRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface EditingCell {
  row: number;
  col: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  row: number;
  col: number;
}

interface ExcelWorkbookEditorProps {
  workbook: EditableWorkbook;
  onChange: (nextWorkbook: EditableWorkbook) => void;
  onError: (message: string | null) => void;
}

function normalizeSelection(selection: SelectionRange): SelectionRange {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isCellSelected(selection: SelectionRange, row: number, col: number): boolean {
  const normalized = normalizeSelection(selection);
  return (
    row >= normalized.startRow &&
    row <= normalized.endRow &&
    col >= normalized.startCol &&
    col <= normalized.endCol
  );
}

function buildGridWithDimensions(
  sheet: EditableWorkbookSheet,
  minRows = EXCEL_EDITOR_MIN_ROWS,
  minCols = EXCEL_EDITOR_MIN_COLS,
): EditableWorkbookSheet {
  return ensureSheetSize(sheet, minRows, minCols);
}

function ToolbarButton({
  title,
  active = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 transition hover:bg-slate-50",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-slate-200 bg-white"
      )}
    >
      {children}
    </button>
  );
}

export function ExcelWorkbookEditor({ workbook, onChange, onError }: ExcelWorkbookEditorProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selection, setSelection] = useState<SelectionRange>({
    startRow: 0,
    endRow: 0,
    startCol: 0,
    endCol: 0,
  });
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [formulaDraft, setFormulaDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [clipboardBuffer, setClipboardBuffer] = useState("");
  const [zoomLevel, setZoomLevel] = useState(100);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const safeSheetIndex = clamp(activeSheetIndex, 0, Math.max(workbook.sheets.length - 1, 0));
  const baseSheet = workbook.sheets[safeSheetIndex];
  const activeSheet = useMemo(
    () => buildGridWithDimensions(baseSheet),
    [baseSheet]
  );
  const rowCount = activeSheet.cells.length;
  const colCount = getSheetColumnCount(activeSheet);
  const normalizedSelection = useMemo(() => normalizeSelection(selection), [selection]);
  const activeCell = useMemo(
    () => ({
      row: normalizedSelection.endRow,
      col: normalizedSelection.endCol,
    }),
    [normalizedSelection]
  );
  const totalGridWidth = useMemo(() => {
    let width = ROW_HEADER_WIDTH;
    for (let col = 0; col < colCount; col += 1) {
      width += columnWidths[`${safeSheetIndex}:${col}`] ?? DEFAULT_COLUMN_WIDTH;
    }
    return width;
  }, [colCount, columnWidths, safeSheetIndex]);

  useEffect(() => {
    if (activeSheetIndex !== safeSheetIndex) {
      setActiveSheetIndex(safeSheetIndex);
    }
  }, [activeSheetIndex, safeSheetIndex]);

  useEffect(() => {
    setSelection((current) => {
      const next = normalizeSelection({
        startRow: clamp(current.startRow, 0, Math.max(rowCount - 1, 0)),
        endRow: clamp(current.endRow, 0, Math.max(rowCount - 1, 0)),
        startCol: clamp(current.startCol, 0, Math.max(colCount - 1, 0)),
        endCol: clamp(current.endCol, 0, Math.max(colCount - 1, 0)),
      });

      if (
        next.startRow === current.startRow &&
        next.endRow === current.endRow &&
        next.startCol === current.startCol &&
        next.endCol === current.endCol
      ) {
        return current;
      }

      return next;
    });
  }, [colCount, rowCount]);

  useEffect(() => {
    if (editingCell) return;
    setFormulaDraft(activeSheet.cells[activeCell.row]?.[activeCell.col] ?? "");
  }, [activeCell.col, activeCell.row, activeSheet, editingCell]);

  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    const handleClose = () => setContextMenu(null);

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleClose);
    window.addEventListener("scroll", handleClose, true);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [contextMenu]);


  const selectedCellStyle = useMemo(
    () =>
      normalizeCellStyle(
        workbook.styles[cellStyleKey(safeSheetIndex, activeCell.row, activeCell.col)]
      ) ?? null,
    [activeCell.col, activeCell.row, safeSheetIndex, workbook.styles]
  );

  function focusGrid() {
    gridRef.current?.focus();
  }

  function updateActiveSheet(
    updater: (sheet: EditableWorkbookSheet) => EditableWorkbookSheet,
    nextStyles = workbook.styles,
  ) {
    const nextSheet = updater(buildGridWithDimensions(baseSheet));
    const nextSheets = workbook.sheets.map((sheet, sheetIndex) =>
      sheetIndex === safeSheetIndex ? nextSheet : sheet
    );
    onChange({
      sheets: nextSheets,
      styles: nextStyles,
    });
  }

  function writeCellValue(row: number, col: number, nextValue: string) {
    updateActiveSheet((sheet) => {
      const expanded = ensureSheetSize(sheet, Math.max(sheet.cells.length, row + 1), Math.max(colCount, col + 1));
      const nextCells = expanded.cells.map((cellRow) => [...cellRow]);
      nextCells[row][col] = nextValue;
      return {
        ...expanded,
        cells: nextCells,
      };
    });
  }

  function clearSelectedCells() {
    onError(null);
    updateActiveSheet((sheet) => {
      const nextCells = buildGridWithDimensions(sheet).cells.map((cellRow) => [...cellRow]);
      for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
        for (let col = normalizedSelection.startCol; col <= normalizedSelection.endCol; col += 1) {
          nextCells[row][col] = "";
        }
      }
      return {
        ...sheet,
        cells: nextCells,
      };
    });
  }

  function commitEdit(value: string, row = activeCell.row, col = activeCell.col) {
    writeCellValue(row, col, value);
    setFormulaDraft(value);
    setEditingCell(null);
  }

  function beginEdit(row: number, col: number, seed?: string) {
    focusGrid();
    setSelection({ startRow: row, endRow: row, startCol: col, endCol: col });
    const currentValue = activeSheet.cells[row]?.[col] ?? "";
    setEditDraft(seed ?? currentValue);
    setEditingCell({ row, col });
    setContextMenu(null);
  }

  function applyStylePatch(patch: Partial<DataSourceWorkbookCellStyle>) {
    onError(null);
    const nextStyles = { ...workbook.styles };

    for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
      for (let col = normalizedSelection.startCol; col <= normalizedSelection.endCol; col += 1) {
        const key = cellStyleKey(safeSheetIndex, row, col);
        const currentStyle = normalizeCellStyle(nextStyles[key]) ?? {};
        const merged = normalizeCellStyle({ ...currentStyle, ...patch });

        if (merged) {
          nextStyles[key] = merged;
        } else {
          delete nextStyles[key];
        }
      }
    }

    onChange({
      ...workbook,
      styles: nextStyles,
    });
    focusGrid();
  }

  function getColumnWidth(col: number) {
    return columnWidths[`${safeSheetIndex}:${col}`] ?? DEFAULT_COLUMN_WIDTH;
  }

  function getRowHeight(row: number) {
    return rowHeights[`${safeSheetIndex}:${row}`] ?? DEFAULT_ROW_HEIGHT;
  }

  function resizeSelectedColumns(delta: number) {
    setColumnWidths((current) => {
      const next = { ...current };
      for (let col = normalizedSelection.startCol; col <= normalizedSelection.endCol; col += 1) {
        const key = `${safeSheetIndex}:${col}`;
        next[key] = clamp((next[key] ?? DEFAULT_COLUMN_WIDTH) + delta, 56, 420);
      }
      return next;
    });
    focusGrid();
  }

  function resizeSelectedRows(delta: number) {
    setRowHeights((current) => {
      const next = { ...current };
      for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
        const key = `${safeSheetIndex}:${row}`;
        next[key] = clamp((next[key] ?? DEFAULT_ROW_HEIGHT) + delta, 22, 180);
      }
      return next;
    });
    focusGrid();
  }

  function handleColumnResizeStart(col: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = getColumnWidth(col);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setColumnWidths((current) => ({
        ...current,
        [`${safeSheetIndex}:${col}`]: clamp(startWidth + moveEvent.clientX - startX, 56, 520),
      }));
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      focusGrid();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function handleRowResizeStart(row: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = getRowHeight(row);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setRowHeights((current) => ({
        ...current,
        [`${safeSheetIndex}:${row}`]: clamp(startHeight + moveEvent.clientY - startY, 22, 180),
      }));
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      focusGrid();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function remapStylesForRows(startRow: number, deletedRows: number, insertedRows: number) {
    const nextStyles: Record<string, DataSourceWorkbookCellStyle | null> = {};

    for (const [key, style] of Object.entries(workbook.styles)) {
      if (!style) continue;

      const [sheetPart, rowPart, colPart] = key.split(":").map(Number);
      if (sheetPart !== safeSheetIndex) {
        nextStyles[key] = style;
        continue;
      }

      if (rowPart < startRow) {
        nextStyles[key] = style;
        continue;
      }

      if (rowPart >= startRow + deletedRows) {
        const shiftedRow = rowPart - deletedRows + insertedRows;
        nextStyles[cellStyleKey(sheetPart, shiftedRow, colPart)] = style;
      }
    }

    return nextStyles;
  }

  function insertRowAbove() {
    onError(null);
    const targetRow = normalizedSelection.startRow;
    const nextStyles = remapStylesForRows(targetRow, 0, 1);

    updateActiveSheet(
      (sheet) => {
        const expanded = buildGridWithDimensions(sheet);
        const blankRow = Array.from({ length: getSheetColumnCount(expanded) }, () => "");
        return {
          ...expanded,
          cells: [
            ...expanded.cells.slice(0, targetRow),
            blankRow,
            ...expanded.cells.slice(targetRow),
          ],
        };
      },
      nextStyles,
    );

    setSelection({ startRow: targetRow, endRow: targetRow, startCol: 0, endCol: 0 });
  }

  function deleteSelectedRows() {
    onError(null);
    const deleteCount = normalizedSelection.endRow - normalizedSelection.startRow + 1;
    const nextStyles = remapStylesForRows(normalizedSelection.startRow, deleteCount, 0);

    updateActiveSheet(
      (sheet) => {
        const expanded = buildGridWithDimensions(sheet);
        const nextCells = expanded.cells.filter(
          (_, rowIndex) =>
            rowIndex < normalizedSelection.startRow || rowIndex > normalizedSelection.endRow
        );

        return {
          ...expanded,
          cells: nextCells.length > 0 ? nextCells : [Array.from({ length: colCount }, () => "")],
        };
      },
      nextStyles,
    );

    setSelection({
      startRow: Math.max(normalizedSelection.startRow - 1, 0),
      endRow: Math.max(normalizedSelection.startRow - 1, 0),
      startCol: 0,
      endCol: 0,
    });
  }

  function selectionToText(): string {
    const lines: string[] = [];
    for (let row = normalizedSelection.startRow; row <= normalizedSelection.endRow; row += 1) {
      const values: string[] = [];
      for (let col = normalizedSelection.startCol; col <= normalizedSelection.endCol; col += 1) {
        values.push(activeSheet.cells[row]?.[col] ?? "");
      }
      lines.push(values.join("\t"));
    }
    return lines.join("\n");
  }

  async function copySelection() {
    const text = selectionToText();
    setClipboardBuffer(text);

    try {
      await navigator.clipboard.writeText(text);
      onError(null);
    } catch {
      onError("Clipboard write is blocked in this browser. The selection is kept in the in-app clipboard.");
    }
  }

  async function cutSelection() {
    await copySelection();
    clearSelectedCells();
  }

  function applyPastedText(text: string) {
    const normalizedText = text.replace(/\r\n/g, "\n");
    const rows = normalizedText.split("\n");
    if (rows.length > 0 && rows[rows.length - 1] === "") {
      rows.pop();
    }
    if (rows.length === 0) return;

    const parsed = rows.map((row) => row.split("\t"));
    const minRows = normalizedSelection.startRow + parsed.length;
    const minCols =
      normalizedSelection.startCol + Math.max(...parsed.map((row) => row.length), 1);

    onError(null);
    updateActiveSheet((sheet) => {
      const expanded = ensureSheetSize(sheet, Math.max(sheet.cells.length, minRows), Math.max(colCount, minCols));
      const nextCells = expanded.cells.map((cellRow) => [...cellRow]);

      parsed.forEach((parsedRow, rowOffset) => {
        parsedRow.forEach((value, colOffset) => {
          nextCells[normalizedSelection.startRow + rowOffset][normalizedSelection.startCol + colOffset] = value;
        });
      });

      return {
        ...expanded,
        cells: nextCells,
      };
    });
  }

  async function pasteSelection() {
    try {
      const text = await navigator.clipboard.readText();
      applyPastedText(text);
    } catch {
      if (clipboardBuffer) {
        applyPastedText(clipboardBuffer);
        onError("Browser clipboard read is blocked, so the editor used its last copied selection.");
        return;
      }
      onError("Clipboard paste is blocked here. Try Ctrl+V inside the grid.");
    }
  }

  function moveSelection(deltaRow: number, deltaCol: number, extend = false) {
    const nextRow = clamp(activeCell.row + deltaRow, 0, Math.max(rowCount - 1, 0));
    const nextCol = clamp(activeCell.col + deltaCol, 0, Math.max(colCount - 1, 0));

    setSelection((current) =>
      extend
        ? {
            ...current,
            endRow: nextRow,
            endCol: nextCol,
          }
        : {
            startRow: nextRow,
            endRow: nextRow,
            startCol: nextCol,
            endCol: nextCol,
          }
    );
    setEditingCell(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (editingCell) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault();
      applyStylePatch({ bold: !selectedCellStyle?.bold });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "i") {
      event.preventDefault();
      applyStylePatch({ italic: !selectedCellStyle?.italic });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      applyStylePatch({ underline: !selectedCellStyle?.underline });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === ">") {
      event.preventDefault();
      applyStylePatch({ fontSize: Math.min(72, (selectedCellStyle?.fontSize ?? 12) + 1) });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "<") {
      event.preventDefault();
      applyStylePatch({ fontSize: Math.max(6, (selectedCellStyle?.fontSize ?? 12) - 1) });
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
      event.preventDefault();
      void cutSelection();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1, 0, event.shiftKey);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1, 0, event.shiftKey);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(0, -1, event.shiftKey);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(0, 1, event.shiftKey);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelectedCells();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      beginEdit(activeCell.row, activeCell.col);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      beginEdit(activeCell.row, activeCell.col, event.key);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {workbook.sheets.map((sheet, sheetIndex) => (
            <button
              key={sheet.name}
              type="button"
              onClick={() => {
                setActiveSheetIndex(sheetIndex);
                setSelection({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 });
                setEditingCell(null);
                setContextMenu(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                sheetIndex === safeSheetIndex
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
              )}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Font
              <select
                value={selectedCellStyle?.fontFamily ?? "Arial"}
                onChange={(event) => applyStylePatch({ fontFamily: event.target.value })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none"
                style={{ fontFamily: selectedCellStyle?.fontFamily ?? "Arial" }}
              >
                {FONT_FAMILIES.map((family) => (
                  <option key={family} value={family} style={{ fontFamily: family }}>
                    {family}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Size
              <select
                value={selectedCellStyle?.fontSize ?? 12}
                onChange={(event) => applyStylePatch({ fontSize: Number(event.target.value) })}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none"
              >
                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <ToolbarButton
              title="Decrease font size"
              onClick={() => applyStylePatch({ fontSize: Math.max(6, (selectedCellStyle?.fontSize ?? 12) - 1) })}
            >
              <span className="text-sm font-bold">A-</span>
            </ToolbarButton>
            <ToolbarButton
              title="Increase font size"
              onClick={() => applyStylePatch({ fontSize: Math.min(72, (selectedCellStyle?.fontSize ?? 12) + 1) })}
            >
              <span className="text-sm font-bold">A+</span>
            </ToolbarButton>
            <ToolbarButton
              title="Bold"
              active={Boolean(selectedCellStyle?.bold)}
              onClick={() => applyStylePatch({ bold: !selectedCellStyle?.bold })}
            >
              <Bold className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={Boolean(selectedCellStyle?.italic)}
              onClick={() => applyStylePatch({ italic: !selectedCellStyle?.italic })}
            >
              <Italic className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Underline"
              active={Boolean(selectedCellStyle?.underline)}
              onClick={() => applyStylePatch({ underline: !selectedCellStyle?.underline })}
            >
              <Underline className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Align left"
              active={selectedCellStyle?.align === "left"}
              onClick={() => applyStylePatch({ align: "left" })}
            >
              <AlignLeft className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Align center"
              active={selectedCellStyle?.align === "center"}
              onClick={() => applyStylePatch({ align: "center" })}
            >
              <AlignCenter className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton
              title="Align right"
              active={selectedCellStyle?.align === "right"}
              onClick={() => applyStylePatch({ align: "right" })}
            >
              <AlignRight className="h-4 w-4" />
            </ToolbarButton>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">
              Zoom
              <select
                value={zoomLevel}
                onChange={(event) => setZoomLevel(Number(event.target.value))}
                className="bg-transparent outline-none"
              >
                {[50, 75, 90, 100, 110, 125, 150, 175, 200].map((zoom) => (
                  <option key={zoom} value={zoom}>
                    {zoom}%
                  </option>
                ))}
              </select>
            </label>
            <ToolbarButton title="Narrow selected columns" onClick={() => resizeSelectedColumns(-16)}>
              <span className="text-sm font-bold">W-</span>
            </ToolbarButton>
            <ToolbarButton title="Widen selected columns" onClick={() => resizeSelectedColumns(16)}>
              <span className="text-sm font-bold">W+</span>
            </ToolbarButton>
            <ToolbarButton title="Shorten selected rows" onClick={() => resizeSelectedRows(-6)}>
              <span className="text-sm font-bold">H-</span>
            </ToolbarButton>
            <ToolbarButton title="Taller selected rows" onClick={() => resizeSelectedRows(6)}>
              <span className="text-sm font-bold">H+</span>
            </ToolbarButton>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">
              Number
              <select
                value={selectedCellStyle?.numberFormat ?? "auto"}
                onChange={(event) =>
                  applyStylePatch({
                    numberFormat:
                      event.target.value === "auto"
                        ? null
                        : (event.target.value as DataSourceWorkbookNumberFormat),
                  })
                }
                className="bg-transparent outline-none"
              >
                {NUMBER_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ToolbarButton title="Currency" onClick={() => applyStylePatch({ numberFormat: "currency" })}>
              <DollarSign className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Percent" onClick={() => applyStylePatch({ numberFormat: "percent" })}>
              <Percent className="h-4 w-4" />
            </ToolbarButton>
            <button
              type="button"
              onClick={() => applyStylePatch({ numberFormat: "decimal-2" })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              1.23
            </button>
            <button
              type="button"
              onClick={() => applyStylePatch({ numberFormat: "thousands" })}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              1K
            </button>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600">
              Text
              <input
                type="color"
                value={selectedCellStyle?.textColor ?? "#0f172a"}
                onChange={(event) => applyStylePatch({ textColor: event.target.value })}
                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600">
              Fill
              <input
                type="color"
                value={selectedCellStyle?.fillColor ?? "#ffffff"}
                onChange={(event) => applyStylePatch({ fillColor: event.target.value })}
                className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[110px_minmax(0,1fr)_auto]">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            {columnIndexToLetter(activeCell.col)}
            {activeCell.row + 1}
          </div>
          <input
            value={formulaDraft}
            onChange={(event) => setFormulaDraft(event.target.value)}
            onBlur={() => commitEdit(formulaDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitEdit(formulaDraft);
              }
            }}
            className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Edit the selected cell"
          />
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton title="Cut" onClick={() => void cutSelection()}>
              <Scissors className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Copy" onClick={() => void copySelection()}>
              <Copy className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Paste" onClick={() => void pasteSelection()}>
              <ClipboardPaste className="h-4 w-4" />
            </ToolbarButton>
            <ToolbarButton title="Clear selected cells" onClick={clearSelectedCells}>
              <Eraser className="h-4 w-4" />
            </ToolbarButton>
          </div>
        </div>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onMouseDownCapture={(event) => {
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement
          ) {
            return;
          }
          focusGrid();
        }}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          event.preventDefault();
          applyPastedText(event.clipboardData.getData("text/plain"));
        }}
        className="relative max-h-[44rem] overflow-auto outline-none focus:ring-2 focus:ring-primary/15"
      >
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: "top left",
            width: `${100 / (zoomLevel / 100)}%`,
          }}
        >
        <table className="border-separate border-spacing-0 text-[11px]" style={{ minWidth: `${Math.max(totalGridWidth, 620)}px`, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: ROW_HEADER_WIDTH }} />
            {Array.from({ length: colCount }, (_, colIndex) => (
              <col key={`col-width-${colIndex}`} style={{ width: getColumnWidth(colIndex) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-100 px-2.5 py-1.5 text-center font-semibold text-slate-500">
                #
              </th>
              {Array.from({ length: colCount }, (_, colIndex) => (
                <th
                  key={`column-${colIndex}`}
                  onClick={() => {
                    focusGrid();
                    setEditingCell(null);
                    setContextMenu(null);
                    setSelection({
                      startRow: 0,
                      endRow: Math.max(rowCount - 1, 0),
                      startCol: colIndex,
                      endCol: colIndex,
                    });
                  }}
                  className="relative cursor-pointer select-none border-b border-r border-slate-200 bg-slate-100 px-2.5 py-1.5 text-center font-semibold text-slate-500 hover:bg-slate-200/70"
                  style={{ width: getColumnWidth(colIndex) }}
                >
                  {columnIndexToLetter(colIndex)}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize column ${columnIndexToLetter(colIndex)}`}
                    onMouseDown={(event) => handleColumnResizeStart(colIndex, event)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/40"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.cells.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                <th
                  onClick={() => {
                    focusGrid();
                    setEditingCell(null);
                    setContextMenu(null);
                    setSelection({
                      startRow: rowIndex,
                      endRow: rowIndex,
                      startCol: 0,
                      endCol: Math.max(colCount - 1, 0),
                    });
                  }}
                  className="sticky left-0 z-10 cursor-pointer select-none border-b border-r border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center font-semibold text-slate-500 hover:bg-slate-100"
                  style={{ height: getRowHeight(rowIndex) }}
                >
                  {rowIndex + 1}
                  <span
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={`Resize row ${rowIndex + 1}`}
                    onMouseDown={(event) => handleRowResizeStart(rowIndex, event)}
                    className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize bg-transparent hover:bg-primary/40"
                  />
                </th>
                {Array.from({ length: colCount }, (_, colIndex) => {
                  const key = cellStyleKey(safeSheetIndex, rowIndex, colIndex);
                  const style = normalizeCellStyle(workbook.styles[key]) ?? null;
                  const selected = isCellSelected(selection, rowIndex, colIndex);
                  const active = activeCell.row === rowIndex && activeCell.col === colIndex;
                  const isEditing =
                    editingCell?.row === rowIndex && editingCell?.col === colIndex;
                  const rawValue = row[colIndex] ?? "";
                  const displayValue = formatWorkbookCellValue(rawValue, style);

                  return (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      onClick={(event) => {
                        focusGrid();
                        setEditingCell(null);
                        setContextMenu(null);
                        if (event.shiftKey) {
                          setSelection((current) => ({
                            ...current,
                            endRow: rowIndex,
                            endCol: colIndex,
                          }));
                          return;
                        }
                        setSelection({
                          startRow: rowIndex,
                          endRow: rowIndex,
                          startCol: colIndex,
                          endCol: colIndex,
                        });
                      }}
                      onDoubleClick={() => beginEdit(rowIndex, colIndex)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        focusGrid();
                        if (!selected) {
                          setSelection({
                            startRow: rowIndex,
                            endRow: rowIndex,
                            startCol: colIndex,
                            endCol: colIndex,
                          });
                        }
                        setEditingCell(null);
                        setContextMenu({
                          x: Math.min(event.clientX, window.innerWidth - 220),
                          y: Math.min(event.clientY, window.innerHeight - 260),
                          row: rowIndex,
                          col: colIndex,
                        });
                      }}
                      className={cn(
                        "border-b border-r border-slate-200 px-2.5 py-1.5 align-middle transition",
                        selected ? "bg-primary/[0.08]" : "bg-white hover:bg-slate-50/80",
                        active && "shadow-[inset_0_0_0_2px_rgba(43,124,255,0.7)]"
                      )}
                      style={{
                        width: getColumnWidth(colIndex),
                        height: getRowHeight(rowIndex),
                        color: style?.textColor ?? undefined,
                        backgroundColor: selected ? undefined : style?.fillColor ?? undefined,
                        fontFamily: style?.fontFamily ?? undefined,
                        fontSize: style?.fontSize ? `${style.fontSize}px` : undefined,
                        fontWeight: style?.bold ? 700 : undefined,
                        fontStyle: style?.italic ? "italic" : undefined,
                        textDecoration: style?.underline ? "underline" : undefined,
                        textAlign:
                          style?.align ??
                          (style?.numberFormat || rawValue.trim().match(/^-?[\d,.(]/) ? "right" : "left"),
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onBlur={(event) => commitEdit(event.currentTarget.value, rowIndex, colIndex)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitEdit(event.currentTarget.value, rowIndex, colIndex);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingCell(null);
                              setEditDraft(rawValue);
                            }
                          }}
                          className="w-full bg-transparent outline-none"
                        />
                      ) : (
                        <div className="min-h-4 whitespace-pre-wrap break-words text-slate-700">
                          {displayValue || <span className="opacity-0">0</span>}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {contextMenu ? (
          <div
            ref={menuRef}
            className="fixed z-50 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => {
                void cutSelection();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Scissors className="h-4 w-4" />
              Cut
            </button>
            <button
              type="button"
              onClick={() => {
                void copySelection();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
            <button
              type="button"
              onClick={() => {
                void pasteSelection();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste
            </button>
            <div className="my-1 h-px bg-slate-200" />
            <button
              type="button"
              onClick={() => {
                insertRowAbove();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Rows3 className="h-4 w-4" />
              Insert row above
            </button>
            <button
              type="button"
              onClick={() => {
                deleteSelectedRows();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete row
            </button>
            <button
              type="button"
              onClick={() => {
                clearSelectedCells();
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Eraser className="h-4 w-4" />
              Clear contents
            </button>
            <div className="my-1 h-px bg-slate-200" />
            <button
              type="button"
              onClick={() => {
                applyStylePatch({ bold: !selectedCellStyle?.bold });
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Bold className="h-4 w-4" />
              Toggle bold
            </button>
            <button
              type="button"
              onClick={() => {
                applyStylePatch({ numberFormat: "currency" });
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <DollarSign className="h-4 w-4" />
              Format as currency
            </button>
            <button
              type="button"
              onClick={() => {
                applyStylePatch({ numberFormat: "percent" });
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Percent className="h-4 w-4" />
              Format as percent
            </button>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
        Right click for quick actions. Keyboard: Arrow keys move, Shift+Arrow extends, Enter edits, Ctrl/Cmd+C copies, Ctrl/Cmd+V pastes.
      </div>
    </div>
  );
}
