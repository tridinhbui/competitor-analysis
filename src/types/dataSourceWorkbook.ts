export type DataSourceWorkbookNumberFormat =
  | "auto"
  | "currency"
  | "percent"
  | "decimal-2"
  | "integer"
  | "thousands";

export interface DataSourceWorkbookCellStyle {
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Legacy: border:true == all 4 sides. New code uses borderTop/Bottom/Left/Right. */
  border?: boolean;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
  textColor?: string | null;
  fillColor?: string | null;
  fontSize?: number | null;
  fontFamily?: string | null;
  numberFormat?: DataSourceWorkbookNumberFormat | null;
}

export interface DataSourceWorkbookCellState {
  formula?: string | null;
  style?: DataSourceWorkbookCellStyle | null;
}

/** A single audit-log entry for a workbook edit. */
export interface DataSourceEditLogEntry {
  /** ISO timestamp the edit was saved server-side. */
  at: string;
  ticker: string;
  periodEnd: string;
  field: string;
  /** Display label for the field (resolved client-side). Optional for back-compat. */
  fieldLabel?: string;
  prevValue: number | string | null;
  nextValue: number | string | null;
  /** "value" (numeric override), "formula" (cell formula), or "style" (formatting). */
  kind: "value" | "formula" | "style";
}

export type DataSourceWorkbookPeriodState = Record<string, DataSourceWorkbookCellState>;

export type DataSourceWorkbookTickerState = Record<string, DataSourceWorkbookPeriodState>;

export interface DataSourceWorkbookCellPayload {
  ticker: string;
  periodEnd: string;
  field: string;
  state: DataSourceWorkbookCellState;
}
