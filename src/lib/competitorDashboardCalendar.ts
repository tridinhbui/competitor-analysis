import type { CompetitorDashboardAccount } from "@/types/competitorDashboard";

const CRLF = "\r\n";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function compactDate(iso: string): string {
  return iso.replaceAll("-", "");
}

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function utcStamp(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 73));
  remaining = remaining.slice(73);
  while (remaining.length > 0) {
    chunks.push(" " + remaining.slice(0, 72));
    remaining = remaining.slice(72);
  }
  return chunks.join(CRLF);
}

function buildEventLines(
  account: CompetitorDashboardAccount,
  stamp: string,
): string[] {
  if (!account.nextReleaseDate) return [];

  const start = compactDate(account.nextReleaseDate);
  const end = compactDate(addOneDay(account.nextReleaseDate));
  const tickerSuffix = account.ticker ? ` (${account.ticker})` : "";
  const summary = `Earnings — ${account.customerName}${tickerSuffix}`;
  const description = [
    `Status: ${account.releaseStatus}`,
    `Tracking entity: ${account.trackingEntity}`,
    `Channel: ${account.channel}`,
    "",
    account.nextReleaseLabel,
    "",
    `Notes: ${account.notes}`,
    "",
    "Source: Earnings Calendar (estimated dates require IR confirmation).",
  ].join("\n");

  return [
    "BEGIN:VEVENT",
    foldLine(
      `UID:${account.id}-${account.nextReleaseDate}@earnings-calendar.finbudpro`,
    ),
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    foldLine(`SUMMARY:${escapeText(summary)}`),
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    "CATEGORIES:Earnings,Earnings Calendar",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export function buildEarningsIcs(
  accounts: CompetitorDashboardAccount[],
): string {
  const stamp = utcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//FinBudPro//Earnings Calendar//EN",
    "VERSION:2.0",
    "METHOD:PUBLISH",
    "CALSCALE:GREGORIAN",
  ];
  for (const account of accounts) {
    lines.push(...buildEventLines(account, stamp));
  }
  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

export function downloadIcsFile(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function safeFileSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "earnings"
  );
}
