import type { DataSourceRow } from "@/types/dataSource";
import { METRIC_COLUMNS } from "@/types/dataSource";
import type {
  DataSourceWorkbookCellPayload,
  DataSourceWorkbookCellState,
  DataSourceWorkbookCellStyle,
  DataSourceWorkbookTickerState,
} from "@/types/dataSourceWorkbook";

export type WorkbookWorkflowOrigin = "analyze" | "competitor";

export interface WorkbookColumn {
  field: string;
  label: string;
  editable: boolean;
  align: "left" | "center" | "right";
  format?: string;
}

export const WORKBOOK_COLUMNS: WorkbookColumn[] = [
  { field: "ticker", label: "Ticker", editable: false, align: "left" },
  { field: "companyName", label: "Company", editable: false, align: "left" },
  { field: "quarterLabel", label: "Quarter", editable: false, align: "left" },
  { field: "periodEnd", label: "Period End", editable: false, align: "center" },
  ...METRIC_COLUMNS.map((column) => ({
    field: String(column.key),
    label: column.label,
    editable: true,
    align: "right" as const,
    format: column.format,
  })),
];

export const EDITABLE_WORKBOOK_FIELDS = new Set(
  WORKBOOK_COLUMNS.filter((column) => column.editable).map((column) => column.field),
);

export type WorkbookRowCellStateMap = Record<string, Record<string, DataSourceWorkbookCellState>>;
export type WorkbookNumericOverrideMap = Record<string, Record<string, number | null>>;
export type WorkbookFormulaErrorMap = Record<string, string>;

function getRowFieldValue(
  row: DataSourceRow,
  field: string,
): string | number | null {
  const value = (row as unknown as Record<string, string | number | null | undefined>)[field];
  return value ?? null;
}

function setRowFieldValue(
  row: DataSourceRow,
  field: string,
  value: number | null,
): void {
  (row as unknown as Record<string, string | number | null | undefined>)[field] = value;
}

function isNonEmptyFormula(formula: string | null | undefined): formula is string {
  return typeof formula === "string" && formula.trim().length > 0;
}

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

const ALLOWED_NUMBER_FORMATS: ReadonlySet<string> = new Set([
  "auto",
  "currency",
  "percent",
  "decimal-2",
  "integer",
  "thousands",
]);

const ALLOWED_FONT_FAMILIES: ReadonlySet<string> = new Set([
  "Arial",
  "Calibri",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
]);

export function normalizeCellStyle(
  style: DataSourceWorkbookCellStyle | null | undefined,
): DataSourceWorkbookCellStyle | null {
  if (!style) return null;

  const next: DataSourceWorkbookCellStyle = {};
  if (style.align === "left" || style.align === "center" || style.align === "right") {
    next.align = style.align;
  }
  if (style.bold) next.bold = true;
  if (style.italic) next.italic = true;
  if (style.underline) next.underline = true;
  if (style.strikethrough) next.strikethrough = true;

  // Legacy `border: true` migrates to all four sides on read.
  const legacyAllSides = style.border === true;
  if (legacyAllSides || style.borderTop) next.borderTop = true;
  if (legacyAllSides || style.borderBottom) next.borderBottom = true;
  if (legacyAllSides || style.borderLeft) next.borderLeft = true;
  if (legacyAllSides || style.borderRight) next.borderRight = true;

  const textColor = normalizeHexColor(style.textColor);
  const fillColor = normalizeHexColor(style.fillColor);
  if (textColor) next.textColor = textColor;
  if (fillColor) next.fillColor = fillColor;
  if (typeof style.fontSize === "number" && Number.isFinite(style.fontSize) && style.fontSize >= 6 && style.fontSize <= 96) {
    next.fontSize = Math.round(style.fontSize);
  }
  if (typeof style.fontFamily === "string" && ALLOWED_FONT_FAMILIES.has(style.fontFamily)) {
    next.fontFamily = style.fontFamily;
  }
  if (typeof style.numberFormat === "string" && ALLOWED_NUMBER_FORMATS.has(style.numberFormat)) {
    if (style.numberFormat !== "auto") {
      next.numberFormat = style.numberFormat as DataSourceWorkbookCellStyle["numberFormat"];
    }
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function normalizeCellState(
  state: DataSourceWorkbookCellState | null | undefined,
): DataSourceWorkbookCellState | null {
  if (!state) return null;

  const normalizedFormula = isNonEmptyFormula(state.formula) ? state.formula.trim() : null;
  const normalizedStyle = normalizeCellStyle(state.style);

  if (!normalizedFormula && !normalizedStyle) return null;

  return {
    ...(normalizedFormula ? { formula: normalizedFormula } : {}),
    ...(normalizedStyle ? { style: normalizedStyle } : {}),
  };
}

export function serializeWorkbookRowCellStates(
  states: WorkbookRowCellStateMap,
): string {
  const rowIds = Object.keys(states).sort();
  const normalized: Record<string, Record<string, DataSourceWorkbookCellState>> = {};

  for (const rowId of rowIds) {
    const fields = Object.keys(states[rowId] ?? {}).sort();
    const rowState: Record<string, DataSourceWorkbookCellState> = {};
    for (const field of fields) {
      const normalizedState = normalizeCellState(states[rowId]?.[field]);
      if (normalizedState) {
        rowState[field] = normalizedState;
      }
    }
    if (Object.keys(rowState).length > 0) {
      normalized[rowId] = rowState;
    }
  }

  return JSON.stringify(normalized);
}

export function getWorkbookStateForCell(
  states: WorkbookRowCellStateMap,
  rowId: string,
  field: string,
): DataSourceWorkbookCellState | null {
  return normalizeCellState(states[rowId]?.[field]) ?? null;
}

export function setWorkbookStateForCell(
  states: WorkbookRowCellStateMap,
  rowId: string,
  field: string,
  state: DataSourceWorkbookCellState | null,
): WorkbookRowCellStateMap {
  const normalizedState = normalizeCellState(state);
  const next: WorkbookRowCellStateMap = { ...states };
  const currentRow = { ...(next[rowId] ?? {}) };

  if (normalizedState) {
    currentRow[field] = normalizedState;
    next[rowId] = currentRow;
    return next;
  }

  delete currentRow[field];
  if (Object.keys(currentRow).length > 0) {
    next[rowId] = currentRow;
  } else {
    delete next[rowId];
  }

  return next;
}

export function flattenWorkbookCellsForSave(
  rows: DataSourceRow[],
  states: WorkbookRowCellStateMap,
): DataSourceWorkbookCellPayload[] {
  const rowLookup = new Map(rows.map((row) => [row.id, row]));
  const payloads: DataSourceWorkbookCellPayload[] = [];

  for (const [rowId, fieldStates] of Object.entries(states)) {
    const row = rowLookup.get(rowId);
    if (!row || row.periodEnd === "TTM") continue;

    for (const [field, state] of Object.entries(fieldStates)) {
      const normalizedState = normalizeCellState(state);
      if (!normalizedState) continue;
      payloads.push({
        ticker: row.ticker,
        periodEnd: row.periodEnd,
        field,
        state: normalizedState,
      });
    }
  }

  return payloads;
}

export function groupWorkbookCellsByTicker(
  payloads: DataSourceWorkbookCellPayload[],
): Record<string, DataSourceWorkbookTickerState> {
  const grouped: Record<string, DataSourceWorkbookTickerState> = {};

  for (const payload of payloads) {
    if (!grouped[payload.ticker]) grouped[payload.ticker] = {};
    if (!grouped[payload.ticker][payload.periodEnd]) grouped[payload.ticker][payload.periodEnd] = {};
    grouped[payload.ticker][payload.periodEnd][payload.field] = payload.state;
  }

  return grouped;
}

export function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let label = "";

  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }

  return label;
}

function columnLetterToIndex(label: string): number {
  let value = 0;
  for (const ch of label.toUpperCase()) {
    value = value * 26 + (ch.charCodeAt(0) - 64);
  }
  return value - 1;
}

function parseCellReference(reference: string): { rowIndex: number; colIndex: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(reference.trim());
  if (!match) return null;

  return {
    colIndex: columnLetterToIndex(match[1]),
    rowIndex: Number(match[2]) - 1,
  };
}

function flattenNumericArgs(values: unknown[]): number[] {
  const numeric: number[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      numeric.push(value);
    }
  };

  for (const value of values) visit(value);
  return numeric;
}

function toNumericValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  const leftNumber = toNumericValue(left);
  const rightNumber = toNumericValue(right);

  switch (operator) {
    case ">":
      return leftNumber > rightNumber;
    case "<":
      return leftNumber < rightNumber;
    case ">=":
      return leftNumber >= rightNumber;
    case "<=":
      return leftNumber <= rightNumber;
    case "=":
    case "==":
      return leftNumber === rightNumber;
    case "<>":
    case "!=":
      return leftNumber !== rightNumber;
    default:
      return false;
  }
}

function tokenizeFormula(input: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < input.length) {
    const ch = input[index];

    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    const two = input.slice(index, index + 2);
    if (["<=", ">=", "<>", "!="].includes(two)) {
      tokens.push(two);
      index += 2;
      continue;
    }

    if ("+-*/(),:<>=".includes(ch)) {
      tokens.push(ch);
      index += 1;
      continue;
    }

    const numberMatch = /^\d+(\.\d+)?/.exec(input.slice(index));
    if (numberMatch) {
      tokens.push(numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(index));
    if (identifierMatch) {
      tokens.push(identifierMatch[0]);
      index += identifierMatch[0].length;
      continue;
    }

    throw new Error(`Unexpected token "${ch}"`);
  }

  return tokens;
}

type FormulaValue = number | boolean | string | null | Array<number | null>;

interface FormulaParserContext {
  tokens: string[];
  position: number;
  resolveReference: (reference: string, stack: string[]) => FormulaValue;
  resolveRange: (start: string, end: string, stack: string[]) => Array<number | null>;
  stack: string[];
}

function evaluateParsedFormula(
  formula: string,
  resolveReference: (reference: string, stack: string[]) => FormulaValue,
  resolveRange: (start: string, end: string, stack: string[]) => Array<number | null>,
  stack: string[],
): FormulaValue {
  const context: FormulaParserContext = {
    tokens: tokenizeFormula(formula),
    position: 0,
    resolveReference,
    resolveRange,
    stack,
  };

  const readToken = () => context.tokens[context.position] ?? null;
  const consumeToken = () => context.tokens[context.position++] ?? null;

  const parsePrimary = (): FormulaValue => {
    const token = consumeToken();
    if (!token) throw new Error("Unexpected end of formula");

    if (token === "(") {
      const value = parseComparison();
      if (consumeToken() !== ")") throw new Error("Expected closing parenthesis");
      return value;
    }

    if (token === "+" || token === "-") {
      const value = parsePrimary();
      const numeric = toNumericValue(value);
      return token === "-" ? -numeric : numeric;
    }

    if (/^\d+(\.\d+)?$/.test(token)) {
      return Number(token);
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      const nextToken = readToken();
      if (nextToken === "(") {
        consumeToken();
        const args: FormulaValue[] = [];
        if (readToken() !== ")") {
          while (true) {
            args.push(parseComparison());
            if (readToken() === ",") {
              consumeToken();
              continue;
            }
            break;
          }
        }
        if (consumeToken() !== ")") throw new Error("Expected closing function parenthesis");

        const fn = token.toUpperCase();
        if (fn === "IF") {
          const condition = args[0];
          return toNumericValue(condition) !== 0 ? (args[1] ?? null) : (args[2] ?? null);
        }

        const numericArgs = flattenNumericArgs(args);
        switch (fn) {
          case "SUM":
            return numericArgs.reduce((sum, value) => sum + value, 0);
          case "AVERAGE":
            return numericArgs.length
              ? numericArgs.reduce((sum, value) => sum + value, 0) / numericArgs.length
              : 0;
          case "MIN":
            return numericArgs.length ? Math.min(...numericArgs) : 0;
          case "MAX":
            return numericArgs.length ? Math.max(...numericArgs) : 0;
          case "COUNT":
            return numericArgs.length;
          default:
            throw new Error(`Unsupported function ${fn}`);
        }
      }

      const following = readToken();
      if (following === ":") {
        consumeToken();
        const end = consumeToken();
        if (!end || !/^[A-Za-z]+\d+$/i.test(end)) {
          throw new Error("Invalid range reference");
        }
        return resolveRange(token, end, stack);
      }

      return resolveReference(token, stack);
    }

    throw new Error(`Unexpected token ${token}`);
  };

  const parseMultiply = (): FormulaValue => {
    let left = parsePrimary();

    while (true) {
      const token = readToken();
      if (token !== "*" && token !== "/") break;
      consumeToken();
      const right = parsePrimary();
      const leftNumber = toNumericValue(left);
      const rightNumber = toNumericValue(right);
      left = token === "*" ? leftNumber * rightNumber : rightNumber === 0 ? 0 : leftNumber / rightNumber;
    }

    return left;
  };

  const parseAddSubtract = (): FormulaValue => {
    let left = parseMultiply();

    while (true) {
      const token = readToken();
      if (token !== "+" && token !== "-") break;
      consumeToken();
      const right = parseMultiply();
      const leftNumber = toNumericValue(left);
      const rightNumber = toNumericValue(right);
      left = token === "+" ? leftNumber + rightNumber : leftNumber - rightNumber;
    }

    return left;
  };

  const parseComparison = (): FormulaValue => {
    let left = parseAddSubtract();

    while (true) {
      const token = readToken();
      if (!token || ![">", "<", ">=", "<=", "=", "==", "!=", "<>"].includes(token)) break;
      consumeToken();
      const right = parseAddSubtract();
      left = compareValues(left, token, right);
    }

    return left;
  };

  const result = parseComparison();
  if (context.position < context.tokens.length) {
    throw new Error("Unexpected trailing formula tokens");
  }
  return result;
}

export function computeWorkbookRows(
  rows: DataSourceRow[],
  numericOverrides: WorkbookNumericOverrideMap,
  workbookCells: WorkbookRowCellStateMap,
): { rows: DataSourceRow[]; formulaErrors: WorkbookFormulaErrorMap } {
  const formulaErrors: WorkbookFormulaErrorMap = {};
  const rowsByWorkflow = new Map<WorkbookWorkflowOrigin, DataSourceRow[]>();

  for (const row of rows) {
    const workflow = row.workflowOrigin === "competitor" ? "competitor" : "analyze";
    if (!rowsByWorkflow.has(workflow)) rowsByWorkflow.set(workflow, []);
    rowsByWorkflow.get(workflow)!.push({ ...row });
  }

  const finalRows: DataSourceRow[] = [];

  for (const workflowRows of rowsByWorkflow.values()) {
    const rowIndexById = new Map(workflowRows.map((row, index) => [row.id, index]));
    const memo = new Map<string, number | null>();

    for (const [rowId, fieldMap] of Object.entries(numericOverrides)) {
      const rowIndex = rowIndexById.get(rowId);
      if (rowIndex == null) continue;
      const row = workflowRows[rowIndex];
      for (const [field, value] of Object.entries(fieldMap)) {
        if (field in row) {
          setRowFieldValue(row, field, value);
        }
      }
    }

    const getCellValue = (
      rowIndex: number,
      colIndex: number,
      stack: string[],
    ): FormulaValue => {
      if (rowIndex < 0 || rowIndex >= workflowRows.length) return null;
      if (colIndex < 0 || colIndex >= WORKBOOK_COLUMNS.length) return null;

      const row = workflowRows[rowIndex];
      const field = WORKBOOK_COLUMNS[colIndex]?.field;
      if (!field) return null;

      const cellKey = `${row.id}:${field}`;
      if (memo.has(cellKey)) return memo.get(cellKey) ?? null;

      const cellState = getWorkbookStateForCell(workbookCells, row.id, field);
      if (cellState?.formula && EDITABLE_WORKBOOK_FIELDS.has(field) && row.periodEnd !== "TTM") {
        if (stack.includes(cellKey)) {
          formulaErrors[cellKey] = "Circular reference";
          return null;
        }

        try {
          const result = evaluateParsedFormula(
            cellState.formula.replace(/^=/, ""),
            (reference, nestedStack) => {
              const coords = parseCellReference(reference);
              if (!coords) throw new Error(`Invalid reference ${reference}`);
              return getCellValue(coords.rowIndex, coords.colIndex, nestedStack);
            },
            (start, end, nestedStack) => {
              const startCoords = parseCellReference(start);
              const endCoords = parseCellReference(end);
              if (!startCoords || !endCoords) throw new Error("Invalid range reference");

              const values: Array<number | null> = [];
              const rowStart = Math.min(startCoords.rowIndex, endCoords.rowIndex);
              const rowEnd = Math.max(startCoords.rowIndex, endCoords.rowIndex);
              const colStart = Math.min(startCoords.colIndex, endCoords.colIndex);
              const colEnd = Math.max(startCoords.colIndex, endCoords.colIndex);

              for (let r = rowStart; r <= rowEnd; r += 1) {
                for (let c = colStart; c <= colEnd; c += 1) {
                  const raw = getCellValue(r, c, nestedStack);
                  values.push(typeof raw === "number" && Number.isFinite(raw) ? raw : null);
                }
              }

              return values;
            },
            [...stack, cellKey],
          );

          const numericResult =
            typeof result === "number" && Number.isFinite(result)
              ? Math.round(result * 10000) / 10000
              : null;
          memo.set(cellKey, numericResult);
          if (field in row) {
            setRowFieldValue(row, field, numericResult);
          }
          return numericResult;
        } catch (error) {
          formulaErrors[cellKey] = error instanceof Error ? error.message : "Formula error";
          memo.set(cellKey, null);
          return null;
        }
      }

      const raw = getRowFieldValue(row, field);
      return raw ?? null;
    };

    for (let rowIndex = 0; rowIndex < workflowRows.length; rowIndex += 1) {
      const row = workflowRows[rowIndex];
      const rowState = workbookCells[row.id];
      if (!rowState || row.periodEnd === "TTM") continue;

      for (const field of Object.keys(rowState)) {
        if (!EDITABLE_WORKBOOK_FIELDS.has(field)) continue;
        const colIndex = WORKBOOK_COLUMNS.findIndex((column) => column.field === field);
        if (colIndex === -1) continue;
        getCellValue(rowIndex, colIndex, []);
      }
    }

    finalRows.push(...workflowRows);
  }

  return { rows: finalRows, formulaErrors };
}
