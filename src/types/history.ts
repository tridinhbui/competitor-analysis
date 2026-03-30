/**
 * Analysis history types — each run is saved as a thread.
 */

export interface HistoryThread {
  id: string;
  ticker: string | null;
  companyName: string | null;
  source: "sec" | "pdf";
  periodEnd: string | null;
  quarterLabel: string | null;
  title: string;
  createdAt: string;
}

export interface HistoryDetail extends HistoryThread {
  analysis: import("@/types/analysis").FullAnalysis;
  events: import("@/types/analysis").StepEvent[] | null;
}
