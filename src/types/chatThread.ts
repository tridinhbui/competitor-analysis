import type {
  DataSourceEditLogEntry,
  DataSourceWorkbookTickerState,
} from "@/types/dataSourceWorkbook";

export type ChatThreadKind = "general" | "data-source-workbook";

export interface DataSourceWorkbookSnapshot {
  dataSourceOverrides?: Record<string, Record<string, number | null>>;
  dataSourceWorkbook?: DataSourceWorkbookTickerState;
  dataSourceEditLog?: DataSourceEditLogEntry[];
}

export interface ChatThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  kind: ChatThreadKind;
  companyTicker: string | null;
  companyName: string | null;
  sourceThreadId: string | null;
}

export interface CompanyWorkbookSummary {
  ticker: string;
  companyName: string;
  threadCount: number;
  latestThreadId: string | null;
  latestUpdatedAt: string | null;
}
