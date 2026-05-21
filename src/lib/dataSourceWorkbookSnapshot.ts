import type { DataSourceEditLogEntry, DataSourceWorkbookTickerState } from "@/types/dataSourceWorkbook";
import type { DataSourceWorkbookSnapshot } from "@/types/chatThread";

type AdjustmentPayload = {
  dataSourceOverrides?: Record<string, Record<string, number | null>>;
  dataSourceWorkbook?: DataSourceWorkbookTickerState;
  dataSourceEditLog?: DataSourceEditLogEntry[];
} | null | undefined;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildWorkbookSnapshotFromAdjustments(payload: AdjustmentPayload): DataSourceWorkbookSnapshot {
  return {
    ...(payload?.dataSourceOverrides ? { dataSourceOverrides: clone(payload.dataSourceOverrides) } : {}),
    ...(payload?.dataSourceWorkbook ? { dataSourceWorkbook: clone(payload.dataSourceWorkbook) } : {}),
    ...(Array.isArray(payload?.dataSourceEditLog) ? { dataSourceEditLog: clone(payload.dataSourceEditLog) } : {}),
  };
}

export function normalizeWorkbookSnapshot(payload: unknown): DataSourceWorkbookSnapshot {
  if (!payload || typeof payload !== "object") return {};

  const snapshot = payload as DataSourceWorkbookSnapshot;
  const normalized: DataSourceWorkbookSnapshot = {};

  if (snapshot.dataSourceOverrides && typeof snapshot.dataSourceOverrides === "object") {
    normalized.dataSourceOverrides = clone(snapshot.dataSourceOverrides);
  }

  if (snapshot.dataSourceWorkbook && typeof snapshot.dataSourceWorkbook === "object") {
    normalized.dataSourceWorkbook = clone(snapshot.dataSourceWorkbook);
  }

  if (Array.isArray(snapshot.dataSourceEditLog)) {
    normalized.dataSourceEditLog = clone(snapshot.dataSourceEditLog);
  }

  return normalized;
}
