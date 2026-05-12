"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Download,
  Filter,
  Radar,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { competitorDashboardAccounts } from "@/lib/competitorDashboardSeed";
import {
  buildEarningsIcs,
  downloadIcsFile,
} from "@/lib/competitorDashboardCalendar";
import { cn } from "@/lib/utils";
import type {
  CompetitorDashboardAccount,
  CompetitorDashboardCoverage,
  CompetitorDashboardFlashStatus,
  CompetitorDashboardReleaseStatus,
} from "@/types/competitorDashboard";

type WindowFilter = "all" | "next-14" | "next-30" | "no-date";

const coverageTone: Record<CompetitorDashboardCoverage, string> = {
  "direct-public": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "parent-proxy": "border-amber-200 bg-amber-50 text-amber-700",
  private: "border-slate-200 bg-slate-100 text-slate-600",
};

const releaseTone: Record<CompetitorDashboardReleaseStatus, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  estimated: "border-blue-200 bg-blue-50 text-blue-700",
  "needs-date": "border-amber-200 bg-amber-50 text-amber-700",
  "not-public": "border-slate-200 bg-slate-100 text-slate-600",
};

const flashTone: Record<CompetitorDashboardFlashStatus, string> = {
  sent: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "ready-to-draft": "border-blue-200 bg-blue-50 text-blue-700",
  monitoring: "border-violet-200 bg-violet-50 text-violet-700",
  "not-started": "border-amber-200 bg-amber-50 text-amber-700",
  "not-required": "border-slate-200 bg-slate-100 text-slate-600",
};

const coverageLabel: Record<CompetitorDashboardCoverage, string> = {
  "direct-public": "Direct Public",
  "parent-proxy": "Track via Parent",
  private: "Private",
};

const releaseLabel: Record<CompetitorDashboardReleaseStatus, string> = {
  confirmed: "Confirmed",
  estimated: "Estimated",
  "needs-date": "Need Date",
  "not-public": "No Public Release",
};

const flashLabel: Record<CompetitorDashboardFlashStatus, string> = {
  sent: "Sent",
  "ready-to-draft": "Ready to Draft",
  monitoring: "Monitoring",
  "not-started": "Not Started",
  "not-required": "Not Required",
};

const NO_DATE_SENTINEL = "9999-12-31";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
}

function daysUntil(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / 86_400_000);
}

function formatReleaseDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysBadgeTone(days: number | null): string {
  if (days === null) return "border-slate-200 bg-slate-100 text-slate-500";
  if (days < 0) return "border-slate-200 bg-slate-100 text-slate-500";
  if (days <= 7) return "border-rose-200 bg-rose-50 text-rose-700";
  if (days <= 21) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function daysBadgeLabel(days: number | null): string {
  if (days === null) return "No date";
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

function sortByDateThenRank(
  left: CompetitorDashboardAccount,
  right: CompetitorDashboardAccount,
): number {
  const dl = left.nextReleaseDate ?? NO_DATE_SENTINEL;
  const dr = right.nextReleaseDate ?? NO_DATE_SENTINEL;
  if (dl !== dr) return dl.localeCompare(dr);
  return left.rank - right.rank;
}

function exportAccountsToCsv(accounts: CompetitorDashboardAccount[]) {
  const header = [
    "Customer",
    "Channel",
    "Coverage",
    "Tracking Entity",
    "Ticker",
    "Release Status",
    "Release Date",
    "Release Plan",
    "Flash Report Status",
    "Notes",
  ];

  const rows = accounts.map((account) => [
    account.customerName,
    account.channel,
    coverageLabel[account.coverage],
    account.trackingEntity,
    account.ticker ?? "",
    releaseLabel[account.releaseStatus],
    account.nextReleaseDate ?? "",
    account.nextReleaseLabel,
    flashLabel[account.flashStatus],
    account.notes,
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "competitor-dashboard-tracker.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportAccountsToIcs(
  accounts: CompetitorDashboardAccount[],
  filename: string,
) {
  const dated = accounts.filter((account) => Boolean(account.nextReleaseDate));
  if (dated.length === 0) return;
  const ics = buildEarningsIcs(dated);
  downloadIcsFile(filename, ics);
}

function addOneDayIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildOutlookComposeUrl(account: CompetitorDashboardAccount): string | null {
  if (!account.nextReleaseDate) return null;

  const tickerSuffix = account.ticker ? ` (${account.ticker})` : "";
  const subject = `Earnings — ${account.customerName}${tickerSuffix}`;
  const body = [
    `Status: ${account.releaseStatus}`,
    `Tracking entity: ${account.trackingEntity}`,
    `Channel: ${account.channel}`,
    "",
    account.nextReleaseLabel,
    "",
    `Notes: ${account.notes}`,
    "",
    "Source: Competitor Dashboard (estimated dates require IR confirmation).",
  ].join("\n");

  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject,
    body,
    startdt: account.nextReleaseDate,
    enddt: addOneDayIso(account.nextReleaseDate),
    allday: "true",
  });

  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function openOutlookCompose(account: CompetitorDashboardAccount) {
  const url = buildOutlookComposeUrl(account);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function DaysBadge({ days }: { days: number | null }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border whitespace-nowrap text-[10px] font-semibold tracking-wide",
        daysBadgeTone(days),
      )}
    >
      {daysBadgeLabel(days)}
    </Badge>
  );
}

function AddToOutlookButton({
  account,
  size = "icon",
}: {
  account: CompetitorDashboardAccount;
  size?: "icon" | "pill";
}) {
  if (!account.nextReleaseDate) return null;
  const onClick = () => openOutlookCompose(account);

  if (size === "pill") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="workspace-interactive inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-primary/40 hover:text-primary"
        title={`Add ${account.customerName} earnings to Outlook`}
      >
        <CalendarPlus className="h-3 w-3" />
        Outlook
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="workspace-interactive inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-primary/40 hover:text-primary"
      title={`Add ${account.customerName} earnings to Outlook`}
      aria-label={`Add ${account.customerName} earnings to Outlook`}
    >
      <CalendarPlus className="h-3.5 w-3.5" />
    </button>
  );
}

export function CompetitorDashboard() {
  const [search, setSearch] = useState("");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("all");
  const deferredSearch = useDeferredValue(search);

  const today = useMemo(() => startOfTodayUtc(), []);

  const filteredAccounts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return competitorDashboardAccounts.filter((account) => {
      let matchesWindow = true;
      if (windowFilter === "no-date") {
        matchesWindow = !account.nextReleaseDate;
      } else if (windowFilter !== "all") {
        const days = daysUntil(account.nextReleaseDate, today);
        if (days === null || days < 0) {
          matchesWindow = false;
        } else if (windowFilter === "next-14") {
          matchesWindow = days <= 14;
        } else if (windowFilter === "next-30") {
          matchesWindow = days <= 30;
        }
      }

      const matchesQuery =
        query.length === 0
          ? true
          : [
              account.customerName,
              account.trackingEntity,
              account.ticker ?? "",
              account.channel,
            ]
              .join(" ")
              .toLowerCase()
              .includes(query);
      return matchesQuery && matchesWindow;
    });
  }, [deferredSearch, today, windowFilter]);

  const upcomingDated = useMemo(
    () =>
      competitorDashboardAccounts
        .filter((account) => {
          const days = daysUntil(account.nextReleaseDate, today);
          return days !== null && days >= 0;
        })
        .sort(sortByDateThenRank),
    [today],
  );

  const upcomingHighlight = useMemo(
    () => upcomingDated.slice(0, 6),
    [upcomingDated],
  );

  const totalDatedAccounts = upcomingDated.length;
  const filteredDatedCount = useMemo(
    () =>
      filteredAccounts.filter((account) => Boolean(account.nextReleaseDate))
        .length,
    [filteredAccounts],
  );

  return (
    <div className="workspace-page mx-auto max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Radar className="h-5 w-5 text-primary" />
            Competitor Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Track top customer earnings dates, queue AlphaSense summaries, and
            push the schedule to Outlook in one click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportAccountsToIcs(
                upcomingDated,
                "competitor-dashboard-earnings.ics",
              )
            }
            disabled={totalDatedAccounts === 0}
            className="workspace-interactive inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-subtle transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add {totalDatedAccounts} to Outlook
          </button>
          <button
            type="button"
            onClick={() => exportAccountsToCsv(filteredAccounts)}
            className="workspace-interactive inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle transition hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-rose-500" />
            <p className="text-sm font-semibold text-slate-900">
              Upcoming Releases
            </p>
            <span className="text-[11px] text-slate-400">sorted by date</span>
          </div>
        </div>
        <div className="p-3">
          {upcomingHighlight.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">
              No dated releases ahead. Confirm dates on the &quot;Need
              Date&quot; accounts to populate this view.
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {upcomingHighlight.map((account) => {
                const days = daysUntil(account.nextReleaseDate, today);
                const dateLabel = formatReleaseDate(account.nextReleaseDate);
                return (
                  <div
                    key={account.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                          {dateLabel}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">
                          {account.customerName}
                          {account.ticker ? (
                            <span className="ml-1.5 text-[10px] font-medium uppercase text-slate-400">
                              {account.ticker}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <DaysBadge days={days} />
                    </div>
                    <p className="text-[11px] leading-snug text-slate-600 line-clamp-2">
                      {account.nextReleaseLabel}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "border text-[10px]",
                          releaseTone[account.releaseStatus],
                        )}
                      >
                        {releaseLabel[account.releaseStatus]}
                      </Badge>
                      <AddToOutlookButton account={account} size="pill" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#bc5b2c]" />
              <p className="text-sm font-semibold text-slate-900">
                Competitor Analysis List
              </p>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Full tracker for release dates, coverage, and flash status.
              Use the filters to isolate the accounts that need action.
            </p>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, ticker, tracking entity..."
                className="h-8 w-full min-w-[240px] rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 lg:justify-end">
                {(
                  [
                    { id: "all", label: "All Dates" },
                    { id: "next-14", label: "Next 14 Days" },
                    { id: "next-30", label: "Next 30 Days" },
                    { id: "no-date", label: "Need Date" },
                  ] as Array<{ id: WindowFilter; label: string }>
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setWindowFilter(filter.id)}
                    className={cn(
                      "workspace-interactive rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                      windowFilter === filter.id
                        ? "border-rose-300/60 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {filteredDatedCount > 0 ? (
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-600">
            <span>
              {filteredDatedCount} dated{" "}
              {filteredDatedCount === 1 ? "release" : "releases"} in the current
              view.
            </span>
            <button
              type="button"
              onClick={() =>
                exportAccountsToIcs(
                  filteredAccounts,
                  "competitor-dashboard-filtered.ics",
                )
              }
              className="workspace-interactive inline-flex items-center gap-1 rounded-full border border-primary/40 bg-white px-2.5 py-1 font-semibold text-primary transition hover:bg-primary/5"
            >
              <CalendarPlus className="h-3 w-3" />
              Filtered view to Outlook
            </button>
          </div>
        ) : null}

        <div className="p-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Release Date</th>
                  <th className="px-3 py-2">Tracking Entity</th>
                  <th className="px-3 py-2">Release Plan</th>
                  <th className="px-3 py-2">Flash</th>
                  <th className="px-3 py-2 text-right">Outlook</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => {
                  const days = daysUntil(account.nextReleaseDate, today);
                  const dateLabel = formatReleaseDate(account.nextReleaseDate);
                  return (
                    <tr
                      key={account.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-3 py-2.5">
                        <div className="min-w-[160px]">
                          <p className="font-semibold text-slate-900">
                            {account.customerName}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {account.channel}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "border text-[10px]",
                                coverageTone[account.coverage],
                              )}
                            >
                              {coverageLabel[account.coverage]}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "border text-[10px]",
                                releaseTone[account.releaseStatus],
                              )}
                            >
                              {releaseLabel[account.releaseStatus]}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="min-w-[140px] space-y-1">
                          {dateLabel ? (
                            <p className="text-xs font-semibold text-slate-900">
                              {dateLabel}
                            </p>
                          ) : (
                            <p className="text-xs font-semibold text-slate-400">
                              Pending source
                            </p>
                          )}
                          <DaysBadge days={days} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="min-w-[140px]">
                          <p className="font-semibold text-slate-900">
                            {account.trackingEntity}
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-slate-400">
                            {account.ticker ?? "No Ticker"}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="min-w-[220px] space-y-1">
                          <p className="text-slate-700">
                            {account.nextReleaseLabel}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {account.notes}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "border text-[10px]",
                            flashTone[account.flashStatus],
                          )}
                        >
                          {flashLabel[account.flashStatus]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {account.nextReleaseDate ? (
                          <AddToOutlookButton account={account} />
                        ) : (
                          <span className="text-[10px] text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredAccounts.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">
              No accounts match the current filters.
            </div>
          ) : null}
        </div>
      </div>

    </div>
  );
}
