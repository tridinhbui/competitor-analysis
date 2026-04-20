/** Shared with PDF trace / metric click — keep stable for importers. */
export interface TraceMetric {
  key: string;
  label: string;
  value?: number | null;
  sourceHint?: string;
}
