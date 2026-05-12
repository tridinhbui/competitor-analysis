export type CompetitorDashboardCoverage =
  | "direct-public"
  | "parent-proxy"
  | "private";

export type CompetitorDashboardChannel =
  | "Retail"
  | "Club"
  | "Foodservice"
  | "Distribution"
  | "QSR";

export type CompetitorDashboardReleaseStatus =
  | "needs-date"
  | "estimated"
  | "confirmed"
  | "not-public";

export type CompetitorDashboardFlashStatus =
  | "not-required"
  | "not-started"
  | "monitoring"
  | "ready-to-draft"
  | "sent";

export interface CompetitorDashboardAccount {
  id: string;
  rank: number;
  customerName: string;
  channel: CompetitorDashboardChannel;
  coverage: CompetitorDashboardCoverage;
  trackingEntity: string;
  ticker?: string | null;
  releaseStatus: CompetitorDashboardReleaseStatus;
  nextReleaseLabel: string;
  nextReleaseDate?: string | null;
  flashStatus: CompetitorDashboardFlashStatus;
  flashReportRequired: boolean;
  owner: string;
  notes: string;
}
