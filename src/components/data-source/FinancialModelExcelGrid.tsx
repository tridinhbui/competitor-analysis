"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FinancialModelContext, FinancialModelSheetKey } from "@/lib/dataSourceFinancialModel";
import {
  buildFinancialGrid,
  columnIndexToLetter,
  getCellDisplayValue,
  getCellMeta,
  isCellCovered,
  isCellInSectionHighlight,
  loadFinancialGridOverrides,
  saveFinancialGridOverrides,
  type FinancialShortcutId,
  type FinancialShortcutTarget,
} from "@/lib/financialModelGrid";
import { cn } from "@/lib/utils";

const EXCEL_BORDER = "#217346";
const EXCEL_FILL = "rgba(33, 115, 70, 0.10)";

interface FinancialModelExcelGridProps {
  sheetKey: FinancialModelSheetKey;
  context: FinancialModelContext;
  storageKey: string;
  scrollToSectionId: string | null;
  onScrolledToSection: () => void;
  onShortcut: (target: FinancialShortcutTarget) => void;
}

const STYLE_CLASSES: Record<string, string> = {
  navyTitle: "bg-[#1E3A5F] font-bold text-white text-xs",
  navySub: "bg-[#1E3A5F] text-[10px] text-blue-100",
  sectionHeader: "bg-[#2B579A] font-bold text-white text-[10px] uppercase tracking-wide",
  tableHeader: "bg-[#2B579A] font-semibold text-white text-[10px]",
  label: "bg-[#D9E8F7] font-bold text-[#1E3A5F]",
  metricLabel: "font-semibold text-slate-800 bg-slate-50",
  number: "text-right tabular-nums text-slate-900 bg-white",
  text: "text-left text-slate-900 bg-white",
  total: "bg-[#D9E8F7] font-bold text-right tabular-nums text-[#1E3A5F]",
  shortcutBtn: "bg-[#3B82F6] font-semibold text-white text-center text-[10px] cursor-pointer hover:bg-[#2563EB]",
  empty: "bg-white text-slate-900",
};

export function FinancialModelExcelGrid({
  sheetKey,
  context,
  storageKey,
  scrollToSectionId,
  onScrolledToSection,
  onShortcut,
}: FinancialModelExcelGridProps) {
  const model = useMemo(() => buildFinancialGrid(sheetKey, context), [sheetKey, context]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState({ r: 5, c: 1 });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [highlightedSection, setHighlightedSection] = useState<FinancialShortcutId | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    setOverrides(loadFinancialGridOverrides(storageKey));
    setIsEditing(false);
    setHighlightedSection(null);
    gridRef.current?.focus();
  }, [storageKey, sheetKey]);

  useEffect(() => {
    if (!scrollToSectionId) return;
    setHighlightedSection(scrollToSectionId as FinancialShortcutId);
    let attempts = 0;
    let frame = 0;
    const tryScroll = () => {
      const row = sectionRowRefs.current.get(scrollToSectionId);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "start" });
        onScrolledToSection();
        return;
      }
      if (attempts < 12) {
        attempts += 1;
        frame = requestAnimationFrame(tryScroll);
      }
    };
    frame = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frame);
  }, [scrollToSectionId, sheetKey, onScrolledToSection]);

  const handleShortcutClick = useCallback(
    (target: FinancialShortcutTarget) => {
      setHighlightedSection(target.sectionId);
      onShortcut(target);
    },
    [onShortcut],
  );

  const persistOverride = useCallback(
    (r: number, c: number, value: string) => {
      const k = `${r},${c}`;
      setOverrides((prev) => {
        const next = { ...prev, [k]: value };
        saveFinancialGridOverrides(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const selectedAddress = `${columnIndexToLetter(selection.c)}${selection.r + 1}`;
  const selectedValue = getCellDisplayValue(model, overrides, selection.r, selection.c);
  const selectedMeta = getCellMeta(model, selection.r, selection.c);
  const selectedReadOnly = selectedMeta?.readOnly || selectedMeta?.style === "shortcutBtn";

  const commitDraft = useCallback(() => {
    if (!isEditing || selectedReadOnly) return;
    persistOverride(selection.r, selection.c, draft);
    setIsEditing(false);
  }, [draft, isEditing, persistOverride, selectedReadOnly, selection.c, selection.r]);

  const startEdit = useCallback(() => {
    if (selectedReadOnly) return;
    setDraft(selectedValue);
    setIsEditing(true);
  }, [selectedReadOnly, selectedValue]);

  const moveSelection = useCallback(
    (dr: number, dc: number) => {
      setSelection((prev) => ({
        r: Math.max(0, Math.min(model.rowCount - 1, prev.r + dr)),
        c: Math.max(0, Math.min(model.colCount - 1, prev.c + dc)),
      }));
      setIsEditing(false);
    },
    [model.colCount, model.rowCount],
  );

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isEditing) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitDraft();
          moveSelection(1, 0);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setIsEditing(false);
        } else if (event.key === "Tab") {
          event.preventDefault();
          commitDraft();
          moveSelection(0, event.shiftKey ? -1 : 1);
        }
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          moveSelection(-1, 0);
          break;
        case "ArrowDown":
          event.preventDefault();
          moveSelection(1, 0);
          break;
        case "ArrowLeft":
          event.preventDefault();
          moveSelection(0, -1);
          break;
        case "ArrowRight":
          event.preventDefault();
          moveSelection(0, 1);
          break;
        case "Tab":
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1);
          break;
        case "Enter":
          event.preventDefault();
          startEdit();
          break;
        case "F2":
          event.preventDefault();
          startEdit();
          break;
        default:
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !selectedReadOnly) {
            setDraft(event.key);
            setIsEditing(true);
          }
          break;
      }
    },
    [commitDraft, isEditing, moveSelection, selectedReadOnly, startEdit],
  );

  return (
    <div className="flex flex-col border border-[#d6dbe1] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="border-b border-[#d6dbe1] bg-[#f3f3f3] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded border border-[#cfd6dd] bg-white text-xs font-semibold text-slate-500">
            {selectedAddress}
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#cfd6dd] bg-white text-xs font-semibold text-slate-500">
            fx
          </span>
          <input
            value={isEditing ? draft : selectedValue}
            onChange={(event) => {
              if (!isEditing) startEdit();
              setDraft(event.target.value);
            }}
            onFocus={startEdit}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              }
            }}
            readOnly={selectedReadOnly}
            className="min-w-0 flex-1 rounded border border-[#cfd6dd] bg-white px-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#217346]/20 disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Select a cell or type a value"
          />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Arrow keys to move · Enter / F2 to edit · Tab between cells · Blue shortcuts jump to sections (may switch
          sheets)
        </p>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        className={cn(
          "outline-none focus:ring-2 focus:ring-inset focus:ring-[#217346]/15",
          model.preferHorizontalScroll
            ? "max-h-[48vh] overflow-x-auto overflow-y-auto"
            : "max-h-[58vh] overflow-auto",
        )}
      >
        <table
          className={cn(
            "border-separate border-spacing-0",
            model.preferHorizontalScroll ? "min-w-max text-[10px]" : "text-[11px]",
          )}
          style={{ fontFamily: '"Aptos", "Calibri", sans-serif' }}
        >
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#f3f3f3]">
              <th className="sticky left-0 z-30 w-10 border-b border-r border-[#d6dbe1] bg-[#f3f3f3] px-1 py-1 text-center text-[10px] font-semibold text-slate-500" />
              {Array.from({ length: model.colCount }, (_, c) => (
                <th
                  key={`col-${c}`}
                  className="border-b border-[#d6dbe1] bg-[#f3f3f3] px-1 py-1 text-center text-[10px] font-semibold text-slate-500"
                  style={{ minWidth: model.colWidths[c] ?? 72 }}
                >
                  {columnIndexToLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: model.rowCount }, (_, r) => (
              <tr
                key={`row-${r}`}
                ref={(el) => {
                  if (!el) return;
                  for (const [cellKey, cell] of model.cells) {
                    if (cell.sectionId && cellKey.startsWith(`${r},`)) {
                      sectionRowRefs.current.set(cell.sectionId, el);
                    }
                  }
                }}
              >
                <th
                  className={cn(
                    "sticky left-0 z-10 border-b border-r border-[#d6dbe1] bg-[#f3f3f3] px-1 text-center text-[10px] font-normal text-slate-500",
                    model.preferHorizontalScroll ? "py-0" : "py-0.5",
                  )}
                >
                  {r + 1}
                </th>
                {Array.from({ length: model.colCount }, (_, c) => {
                  if (isCellCovered(model, r, c)) return null;
                  const meta = getCellMeta(model, r, c);
                  const display = getCellDisplayValue(model, overrides, r, c);
                  const isSelected = selection.r === r && selection.c === c;
                  const colspan = meta?.colspan ?? 1;
                  const rowspan = meta?.rowspan ?? 1;
                  const styleKey = meta?.style ?? "empty";
                  const isShortcut = styleKey === "shortcutBtn" && meta?.shortcutTarget;
                  const readOnly = meta?.readOnly ?? false;

                  const sectionHighlight =
                    highlightedSection != null &&
                    isCellInSectionHighlight(model, highlightedSection, r, c);
                  const isActiveShortcutBtn =
                    isShortcut && meta?.shortcutTarget?.sectionId === highlightedSection;

                  if (isShortcut && meta?.shortcutTarget) {
                    return (
                      <td key={`${r}-${c}`} colSpan={colspan} rowSpan={rowspan} className="border border-[#cbd5e1] p-0">
                        <button
                          type="button"
                          onClick={() => handleShortcutClick(meta.shortcutTarget!)}
                          className={cn(
                            "flex h-full min-h-[28px] w-full items-center justify-center px-3 py-1.5 transition",
                            STYLE_CLASSES.shortcutBtn,
                            isActiveShortcutBtn && "ring-2 ring-amber-300 ring-offset-1",
                            isSelected && !isActiveShortcutBtn && "ring-2 ring-inset ring-[#217346]",
                          )}
                          onFocus={() => setSelection({ r, c })}
                        >
                          {display}
                        </button>
                      </td>
                    );
                  }

                  const editingThis = isEditing && isSelected && !readOnly;

                  return (
                    <td
                      key={`${r}-${c}`}
                      colSpan={colspan}
                      rowSpan={rowspan}
                      className={cn(
                        "border border-[#e2e8f0] p-0 transition-colors",
                        meta?.wrapText || display.includes("\n") ? "align-top" : "align-middle",
                        STYLE_CLASSES[styleKey] ?? STYLE_CLASSES.empty,
                        sectionHighlight && "bg-amber-100/90 ring-1 ring-inset ring-amber-400/70",
                        isSelected && !editingThis && !sectionHighlight && "ring-2 ring-inset",
                      )}
                      style={{
                        minWidth: model.colWidths[c] ?? 72,
                        boxShadow:
                          isSelected && !editingThis && !sectionHighlight
                            ? `inset 0 0 0 2px ${EXCEL_BORDER}`
                            : sectionHighlight
                              ? "inset 0 0 0 1px rgba(251, 191, 36, 0.85)"
                              : undefined,
                        backgroundColor:
                          isSelected && !editingThis && !sectionHighlight ? EXCEL_FILL : undefined,
                      }}
                      onMouseDown={() => {
                        setSelection({ r, c });
                        setIsEditing(false);
                      }}
                      onDoubleClick={() => {
                        setSelection({ r, c });
                        if (!readOnly) startEdit();
                      }}
                    >
                      {editingThis ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onBlur={commitDraft}
                          onKeyDown={handleGridKeyDown}
                          className="h-full w-full border-0 bg-white px-1.5 py-1 text-[11px] outline-none"
                        />
                      ) : (
                        <span
                          className={cn(
                            "block px-1.5",
                            model.preferHorizontalScroll ? "py-0.5" : "py-1",
                            meta?.wrapText || display.includes("\n")
                              ? "whitespace-pre-wrap break-words text-[10px] leading-snug"
                              : model.preferHorizontalScroll
                                ? "whitespace-nowrap"
                                : "truncate",
                          )}
                        >
                          {display}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
