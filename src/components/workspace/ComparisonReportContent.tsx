"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  LineChart,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Presentation,
  RotateCcw,
} from "lucide-react";
import type {
  CompanyComparisonPayload,
  ComparisonRow,
  ComparisonSection,
  MetricFormat,
  MultiComparisonRow,
  MultiTrendPoint,
} from "@/lib/companyComparison";
import { StatusPill } from "@/components/ui/status-pill";
import type { CompetitorEarningsReleasePayload } from "@/types/competitorRelease";

type PresentationSlideId =
  | "executive-snapshot"
  | "competitor-release"
  | "overview"
  | "performance-diagnosis"
  | "segment-mix"
  | "margins"
  | "revenue-growth"
  | "ebitda-profitability"
  | "cash-flow-structure"
  | "operating-drivers"
  | "balance-sheet"
  | "trends"
  | "investment-interpretation";

const SECTION_ORDER: ComparisonSection[] = [
  "Context",
  "Income Statement",
  "Cash Flow",
  "Balance Sheet / Capital Structure",
];

const PERIOD_WARNING_CODES = new Set([
  "period_type_mismatch",
  "period_end_mismatch",
  "period_distance",
]);

const MULTI_CHART_COLORS = ["#2563eb", "#14b8a6", "#f97316", "#a855f7", "#e11d48", "#0f766e", "#475569"];
const PRESENTATION_SLIDES: Array<{ id: PresentationSlideId; label: string; title: string }> = [
  { id: "executive-snapshot", label: "Executive", title: "Executive Snapshot" },
  { id: "competitor-release", label: "Release", title: "Competitor Earnings Release" },
  { id: "overview", label: "Overview", title: "Overview" },
  { id: "performance-diagnosis", label: "Diagnosis", title: "Performance Diagnosis" },
  { id: "segment-mix", label: "Cost Structure", title: "Segmented Cost Structure" },
  { id: "margins", label: "Margins", title: "Margins Analysis" },
  { id: "revenue-growth", label: "Growth", title: "Revenue & Growth" },
  { id: "ebitda-profitability", label: "EBITDA", title: "EBITDA & Profitability" },
  { id: "cash-flow-structure", label: "Cash Flow", title: "Cash Flow Structure" },
  { id: "operating-drivers", label: "Drivers", title: "Operating Drivers" },
  { id: "balance-sheet", label: "Debt/Liquidity", title: "Balance Sheet & Liquidity" },
  { id: "trends", label: "Trends", title: "Trend Lines & Timeline" },
  { id: "investment-interpretation", label: "Investment", title: "Investment Interpretation" },
];

function isMultiComparison(result: CompanyComparisonPayload) {
  return (
    result.comparisonMode === "multi" &&
    Array.isArray(result.multiCompanies) &&
    result.multiCompanies.length >= 3
  );
}

function fmt(format: MetricFormat, value: number | string | null): string {
  if (value == null) return "N/A";
  if (typeof value === "string") return value || "N/A";
  if (format === "currency") {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(2)}B` : `${sign}$${abs.toFixed(1)}M`;
  }
  if (format === "percent") return `${value.toFixed(1)}%`;
  if (format === "multiple") return `${value.toFixed(2)}x`;
  if (format === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

function fmtSignedPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  return `$${value.toFixed(2)}`;
}

function fmtPriceRaw(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "NA";
  return value.toFixed(2);
}

function fmtAbsChange(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function fmtIntegerThousands(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "NA";
  return Math.round(value).toLocaleString("en-US");
}

function fmtMarketTime(iso: string | null): string {
  if (!iso) return "Latest close";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Latest close";
  const date = parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Unknown date";
  const iso = value.slice(0, 10);
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDiff(row: ComparisonRow): string {
  if (row.difference == null) return "N/A";
  const sign = row.difference > 0 ? "+" : "";
  if (row.format === "currency") return `${sign}${fmt("currency", row.difference)}`;
  if (row.format === "percent") return `${sign}${row.difference.toFixed(1)} pp`;
  if (row.format === "multiple") return `${sign}${row.difference.toFixed(2)}x`;
  if (row.format === "number") return `${sign}${row.difference.toFixed(2)}`;
  return "N/A";
}

function metricDiffByKey(rows: ComparisonRow[], key: string): string {
  const match = rows.find((row) => row.key === key);
  return match ? fmtDiff(match) : "N/A";
}

type AdaptiveScale = {
  domain: [number, number];
  truncated: boolean;
  capValue: number | null;
};

function buildAdaptiveScale(values: Array<number | null | undefined>, isPercent = false): AdaptiveScale {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return { domain: [0, 1], truncated: false, capValue: null };

  const sorted = [...clean].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const secondMax = sorted.length > 1 ? sorted[sorted.length - 2] : max;
  const thirdMax = sorted.length > 2 ? sorted[sorted.length - 3] : secondMax;
  const positiveOutlier =
    max > 0 &&
    secondMax > 0 &&
    ((max >= secondMax * 3.5 && max - secondMax > Math.abs(secondMax) * 1.25) ||
      (max >= thirdMax * 4.5 && sorted.length >= 4));

  const floor = min < 0 ? min * 1.12 : 0;
  if (!positiveOutlier) {
    const paddedTop = max === 0 ? 1 : max * 1.12;
    return { domain: [floor, paddedTop], truncated: false, capValue: null };
  }

  const cap = Math.max(secondMax * 1.25, thirdMax * 1.35, isPercent ? 5 : 1);
  return { domain: [floor, cap], truncated: true, capValue: cap };
}

function pairComparisonComment(
  data: Array<{ metric: string; companyA: number | null; companyB: number | null }>,
  labelA: string,
  labelB: string
): string {
  const valid = data.filter((d) => d.companyA != null && d.companyB != null);
  if (valid.length === 0) return "No comparable values available.";
  const winsA = valid.filter((d) => (d.companyA ?? 0) >= (d.companyB ?? 0)).length;
  const winsB = valid.length - winsA;
  if (winsA === winsB) return `${labelA} and ${labelB} are broadly balanced across displayed metrics.`;
  return winsA > winsB
    ? `${labelA} leads on ${winsA}/${valid.length} displayed metrics.`
    : `${labelB} leads on ${winsB}/${valid.length} displayed metrics.`;
}

function buildExportParams(result: CompanyComparisonPayload) {
  if (isMultiComparison(result) && result.multiCompanies) {
    const params = new URLSearchParams({
      tickers: result.multiCompanies.map((c) => c.ticker).join(","),
      periodEnds: result.multiCompanies.map((c) => c.periodEnd).join(","),
    });
    return params.toString();
  }

  const params = new URLSearchParams({
    companyA: result.companyA.ticker,
    companyB: result.companyB.ticker,
    periodEndA: result.companyA.periodEnd,
    periodEndB: result.companyB.periodEnd,
  });

  return params.toString();
}

export function buildComparisonExportHref(result: CompanyComparisonPayload): string {
  return `/api/export/company-comparison-pptx?${buildExportParams(result)}`;
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="comparison-card rounded-xl border border-slate-200/70 bg-white p-3">
      <p className="text-[13px] font-semibold text-slate-800">{title}</p>
      {sub ? <p className="mb-2 mt-0.5 text-[11px] text-slate-400">{sub}</p> : <div className="mb-2" />}
      {children}
    </div>
  );
}

function TopMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

const STOCK_RANGE_TABS = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px]">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

function StockOverviewCard({
  ticker,
  fallbackName,
  release,
  loading,
  yAxisDomain,
}: {
  ticker: string;
  fallbackName: string;
  release: CompetitorEarningsReleasePayload | null;
  loading: boolean;
  yAxisDomain: [number, number];
}) {
  const stock = release?.stock;
  const hasPoints = Boolean(stock?.points.length);
  const displayName = fallbackName ?? stock?.longName ?? ticker;
  const positive = (stock?.percentChange ?? 0) >= 0;
  const accentStroke = positive ? "#16a34a" : "#dc2626";
  const accentFillTop = positive ? "rgba(34,197,94,0.32)" : "rgba(220,38,38,0.28)";
  const accentFillBottom = positive ? "rgba(34,197,94,0)" : "rgba(220,38,38,0)";
  const gradientId = `stock-area-${ticker.toLowerCase()}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-subtle">
      <h3 className="text-center text-xl font-bold text-slate-900">
        {displayName} – 1 Year Earnings Overview
      </h3>

      {hasPoints && stock ? (
        <>
          <div className="mt-5 flex flex-wrap items-baseline gap-2.5">
            <span className="text-3xl font-bold leading-none text-slate-900 tabular-nums sm:text-[2rem]">
              {fmtPrice(stock.latestPrice)}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
                positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              <span>{positive ? "↑" : "↓"}</span>
              <span>{Math.abs(stock.percentChange ?? 0).toFixed(2)}%</span>
            </span>
            <span className="text-xs font-medium text-slate-600 tabular-nums sm:text-sm">
              {fmtAbsChange(stock.absoluteChange)} 1Y
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Closed: {fmtMarketTime(stock.marketTimeIso)}
            {stock.currency ? ` • ${stock.currency}` : ""}
            {stock.exchange ? ` • ${stock.exchange}` : ""}
          </p>

          <div className="mt-4 flex items-center gap-6 border-b border-slate-200">
            {STOCK_RANGE_TABS.map((label) => {
              const active = label === "1Y";
              return (
                <span
                  key={label}
                  className={`pb-2 text-sm font-medium ${
                    active
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-slate-400"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </span>
              );
            })}
          </div>

          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stock.points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentFillTop} stopOpacity={1} />
                    <stop offset="100%" stopColor={accentFillBottom} stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid horizontal vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={28} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickFormatter={(value) => {
                    const n = Number(value);
                    if (!Number.isFinite(n)) return "";
                    return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2);
                  }}
                  domain={yAxisDomain}
                  allowDataOverflow
                  axisLine={false}
                  tickLine={false}
                  orientation="left"
                />
                <Tooltip
                  formatter={(value) =>
                    fmtPrice(
                      typeof value === "number"
                        ? value
                        : typeof value === "string"
                          ? Number(value)
                          : null
                    )
                  }
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  name={ticker}
                  stroke={accentStroke}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, stroke: accentStroke, fill: accentStroke }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-x-10 border-t border-slate-200 pt-2 md:grid-cols-2">
            <StatsRow label="Last (Delayed)" value={fmtPriceRaw(stock.latestPrice)} />
            <StatsRow label="Volume" value={fmtIntegerThousands(stock.dayVolume)} />
            <StatsRow label="VWAP (Delayed)" value="NA" />
            <StatsRow label="Avg 3M Daily Volume" value="NA" />
            <StatsRow label="Open" value={fmtPriceRaw(stock.dayOpen)} />
            <StatsRow label="Shares Out." value="NA" />
            <StatsRow label="Previous Close" value={fmtPriceRaw(stock.previousClose)} />
            <StatsRow label="Shares Sold Short" value="NA" />
            <StatsRow
              label="Day High/Low"
              value={
                stock.dayHigh != null || stock.dayLow != null
                  ? `${fmtPriceRaw(stock.dayHigh)} / ${fmtPriceRaw(stock.dayLow)}`
                  : "NA"
              }
            />
            <StatsRow label="Short Int/ShOut (%)" value="NA" />
            <StatsRow
              label="52 wk High/Low"
              value={`${fmtPriceRaw(stock.week52High)} / ${fmtPriceRaw(stock.week52Low)}`}
            />
            <StatsRow label="Div. Yield (%)" value="NA" />
            <StatsRow label="Beta 3Y" value="NA" />
          </div>

          {release?.reaction ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              First trading day after filing: {fmtSignedPercent(release.reaction.oneDayChangePct)}
              {" • "}
              Five trading days after filing: {fmtSignedPercent(release.reaction.fiveDayChangePct)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-500">
          {loading ? "Loading stock chart..." : "Stock data unavailable for this competitor."}
        </p>
      )}
    </div>
  );
}

function ArrowBullets({
  items,
  accent = false,
}: {
  items: string[];
  accent?: boolean;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-2">
          <ChevronRight
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent ? "text-primary" : "text-slate-400"}`}
          />
          <p className="text-xs leading-relaxed text-slate-700">{item}</p>
        </li>
      ))}
    </ul>
  );
}

function PillBadge({
  label,
  color,
}: {
  label: string;
  color: "indigo" | "sky" | "slate" | "amber" | "emerald" | "red";
}) {
  const classes: Record<string, string> = {
    indigo: "bg-primary/10 text-primary",
    sky: "bg-sky-100 text-sky-700",
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${classes[color]}`}>
      {label}
    </span>
  );
}

function BarCard({
  title,
  data,
  labelA,
  labelB,
  isPercent = false,
  periodWarning,
}: {
  title: string;
  data: Array<{ metric: string; companyA: number | null; companyB: number | null }>;
  labelA: string;
  labelB: string;
  isPercent?: boolean;
  periodWarning: boolean;
}) {
  const tickFmt = (value: number) =>
    isPercent
      ? `${value.toFixed(1)}%`
      : `${value >= 0 ? "" : "-"}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}B` : `${Math.abs(value).toFixed(0)}M`}`;
  const scale = buildAdaptiveScale(
    data.flatMap((d) => [d.companyA, d.companyB]),
    isPercent
  );
  const comment = pairComparisonComment(data, labelA, labelB);

  return (
    <Card title={title}>
      {periodWarning ? (
        <div className="mb-2 flex justify-end">
          <PillBadge label="Period mismatch" color="amber" />
        </div>
      ) : null}
      <p className="mb-2 text-[11px] text-slate-500">{comment}</p>
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} domain={scale.domain} allowDataOverflow />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {scale.truncated ? (
              <ReferenceLine
                y={scale.domain[1]}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            <Bar dataKey="companyA" name={labelA} fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="companyB" name={labelB} fill="#14b8a6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MarginGapChart({
  data,
  labelA,
  labelB,
  periodWarning,
  xKey = "metric",
}: {
  data: Array<{
    metric?: string;
    quarterLabel?: string;
    companyA: number | null;
    companyB: number | null;
    gapPp: number | null;
  }>;
  labelA: string;
  labelB: string;
  periodWarning: boolean;
  xKey?: "metric" | "quarterLabel";
}) {
  return (
    <Card title="Margin Gap Analysis" sub="Lines = margin %; bars = gap (A minus B) in pp">
      {periodWarning ? (
        <div className="mb-2 flex justify-end">
          <PillBadge label="Period mismatch" color="amber" />
        </div>
      ) : null}
      <div className="comparison-chart h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="m" tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
            <YAxis
              yAxisId="g"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => `${value}pp`}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="g" y={0} stroke="#64748b" strokeDasharray="3 3" />
            <Bar yAxisId="g" dataKey="gapPp" name="Gap (A-B)" fill="#64748b" opacity={0.35} radius={[4, 4, 0, 0]} />
            <Line yAxisId="m" type="monotone" dataKey="companyA" name={labelA} stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="m" type="monotone" dataKey="companyB" name={labelB} stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TrendCard({
  title,
  data,
  isPercent = false,
  labelA,
  labelB,
}: {
  title: string;
  data: Array<{ quarterLabel: string; companyA: number | null; companyB: number | null }>;
  isPercent?: boolean;
  labelA: string;
  labelB: string;
}) {
  const tickFmt = (value: number) =>
    isPercent
      ? `${value.toFixed(1)}%`
      : `${value >= 0 ? "" : "-"}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}B` : `${Math.abs(value).toFixed(0)}M`}`;
  const scale = buildAdaptiveScale(
    data.flatMap((d) => [d.companyA, d.companyB]),
    isPercent
  );

  return (
    <Card title={title}>
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="quarterLabel" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} domain={scale.domain} allowDataOverflow />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {scale.truncated ? (
              <ReferenceLine
                y={scale.domain[1]}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            <Line type="monotone" dataKey="companyA" name={labelA} stroke="#2563eb" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="companyB" name={labelB} stroke="#14b8a6" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SegmentedMixRadarCard({
  title,
  data,
}: {
  title: string;
  data: Array<{
    ticker: string;
    cogsPct: number;
    sgaPct: number;
    otherOpExPct: number;
    opProfitPct: number;
  }>;
}) {
  const radarData = [
    {
      metric: "COGS %",
      [data[0]?.ticker ?? "A"]: data[0]?.cogsPct ?? 0,
      [data[1]?.ticker ?? "B"]: data[1]?.cogsPct ?? 0,
    },
    {
      metric: "SG&A %",
      [data[0]?.ticker ?? "A"]: data[0]?.sgaPct ?? 0,
      [data[1]?.ticker ?? "B"]: data[1]?.sgaPct ?? 0,
    },
    {
      metric: "Other OpEx %",
      [data[0]?.ticker ?? "A"]: data[0]?.otherOpExPct ?? 0,
      [data[1]?.ticker ?? "B"]: data[1]?.otherOpExPct ?? 0,
    },
    {
      metric: "Op Profit %",
      [data[0]?.ticker ?? "A"]: data[0]?.opProfitPct ?? 0,
      [data[1]?.ticker ?? "B"]: data[1]?.opProfitPct ?? 0,
    },
  ];
  const labelA = data[0]?.ticker ?? "A";
  const labelB = data[1]?.ticker ?? "B";
  return (
    <Card title={title} sub="Radar view of segmented operating structure">
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Radar name={labelA} dataKey={labelA} stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} />
            <Radar name={labelB} dataKey={labelB} stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SegmentedMarginBridgeCard({
  title,
  data,
}: {
  title: string;
  data: Array<{
    ticker: string;
    netMarginPct: number;
    belowOpPct: number;
    opToGrossPct: number;
  }>;
}) {
  return (
    <Card title={title} sub="Segmented bridge from gross to net margin">
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="ticker" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="netMarginPct" stackId="marginBridge" name="Net Margin %" fill="#14b8a6" />
            <Bar dataKey="belowOpPct" stackId="marginBridge" name="Below Op Line %" fill="#f97316" />
            <Bar
              dataKey="opToGrossPct"
              stackId="marginBridge"
              name="Gross-to-Op Cost %"
              fill="#64748b"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function RevenueMarginComboCard({
  title,
  data,
  labelA,
  labelB,
}: {
  title: string;
  data: Array<{
    quarterLabel: string;
    revenueA: number | null;
    revenueB: number | null;
    marginA: number | null;
    marginB: number | null;
  }>;
  labelA: string;
  labelB: string;
}) {
  const revScale = buildAdaptiveScale(data.flatMap((d) => [d.revenueA, d.revenueB]));
  return (
    <Card title={title} sub="Bars: revenue | Lines: operating margin">
      <div className="comparison-chart h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="quarterLabel" tick={{ fontSize: 9 }} />
            <YAxis
              yAxisId="rev"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => `$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}B` : `${Math.abs(value).toFixed(0)}M`}`}
              domain={revScale.domain}
              allowDataOverflow
            />
            <YAxis yAxisId="margin" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar yAxisId="rev" dataKey="revenueA" name={`${labelA} Revenue`} fill="#60a5fa" opacity={0.55} />
            <Bar yAxisId="rev" dataKey="revenueB" name={`${labelB} Revenue`} fill="#2dd4bf" opacity={0.55} />
            <Line yAxisId="margin" type="monotone" dataKey="marginA" name={`${labelA} Op Margin`} stroke="#1d4ed8" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="margin" type="monotone" dataKey="marginB" name={`${labelB} Op Margin`} stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

type DeltaRow = {
  metric: string;
  prevA: number | null;
  currA: number | null;
  deltaA: number | null;
  prevB: number | null;
  currB: number | null;
  deltaB: number | null;
  format: MetricFormat;
};

function DeltaSummaryTable({
  title,
  subtitle,
  labelA,
  labelB,
  rows,
}: {
  title: string;
  subtitle: string;
  labelA: string;
  labelB: string;
  rows: DeltaRow[];
}) {
  const deltaFmt = (format: MetricFormat, value: number | null) => {
    if (value == null) return "N/A";
    const sign = value > 0 ? "+" : "";
    if (format === "percent") return `${sign}${value.toFixed(1)} pp`;
    if (format === "currency") return `${sign}${fmt("currency", value)}`;
    if (format === "multiple") return `${sign}${value.toFixed(2)}x`;
    return `${sign}${value.toFixed(2)}`;
  };

  return (
    <Card title={title} sub={subtitle}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelA} Prev</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelA} Curr</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelA} Chg</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelB} Prev</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelB} Curr</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{labelB} Chg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.metric} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{row.metric}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(row.format, row.prevA)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt(row.format, row.currA)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{deltaFmt(row.format, row.deltaA)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(row.format, row.prevB)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt(row.format, row.currB)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{deltaFmt(row.format, row.deltaB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function buildMultiRowsBySection(result: CompanyComparisonPayload) {
  const map = new Map<ComparisonSection, MultiComparisonRow[]>();
  const rows = result.multiRows ?? [];
  for (const section of SECTION_ORDER) {
    map.set(section, rows.filter((row) => row.section === section));
  }
  return map;
}

function MultiBarCard({
  title,
  data,
  tickers,
  isPercent = false,
  periodWarning,
}: {
  title: string;
  data: Array<Record<string, string | number | null>>;
  tickers: string[];
  isPercent?: boolean;
  periodWarning: boolean;
}) {
  const tickFmt = (value: number) =>
    isPercent
      ? `${value.toFixed(1)}%`
      : `${value >= 0 ? "" : "-"}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}B` : `${Math.abs(value).toFixed(0)}M`}`;
  const scale = buildAdaptiveScale(
    data.flatMap((row) =>
      tickers.map((ticker) => {
        const value = row[ticker];
        return typeof value === "number" ? value : null;
      })
    ),
    isPercent
  );

  return (
    <Card title={title}>
      {periodWarning ? (
        <div className="mb-2 flex justify-end">
          <PillBadge label="Period mismatch" color="amber" />
        </div>
      ) : null}
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} domain={scale.domain} allowDataOverflow />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {scale.truncated ? (
              <ReferenceLine
                y={scale.domain[1]}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            {tickers.map((ticker, index) => (
              <Bar
                key={ticker}
                dataKey={ticker}
                name={ticker}
                fill={MULTI_CHART_COLORS[index % MULTI_CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MultiTrendCard({
  title,
  data,
  tickers,
  isPercent = false,
}: {
  title: string;
  data: MultiTrendPoint[];
  tickers: string[];
  isPercent?: boolean;
}) {
  const chartData = data.map((point) => {
    const row: Record<string, string | number | null> = { quarterLabel: point.quarterLabel };
    for (const ticker of tickers) {
      row[ticker] = point.byTicker[ticker] ?? null;
    }
    return row;
  });

  const tickFmt = (value: number) =>
    isPercent
      ? `${value.toFixed(1)}%`
      : `${value >= 0 ? "" : "-"}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}B` : `${Math.abs(value).toFixed(0)}M`}`;
  const scale = buildAdaptiveScale(
    chartData.flatMap((row) =>
      tickers.map((ticker) => {
        const value = row[ticker];
        return typeof value === "number" ? value : null;
      })
    ),
    isPercent
  );

  return (
    <Card title={title}>
      <div className="comparison-chart h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="quarterLabel" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} domain={scale.domain} allowDataOverflow />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {scale.truncated ? (
              <ReferenceLine
                y={scale.domain[1]}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            {tickers.map((ticker, index) => (
              <Line
                key={ticker}
                type="monotone"
                dataKey={ticker}
                name={ticker}
                stroke={MULTI_CHART_COLORS[index % MULTI_CHART_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MultiFinancialsTable({
  rowsBySection,
  tickers,
  condensed = false,
}: {
  rowsBySection: Map<ComparisonSection, MultiComparisonRow[]>;
  tickers: string[];
  condensed?: boolean;
}) {
  const colCount = tickers.length + 2;
  const previewLimits: Partial<Record<ComparisonSection, number>> = {
    Context: 3,
    "Income Statement": 6,
    "Cash Flow": 4,
    "Balance Sheet / Capital Structure": 4,
  };

  return (
    <div className="comparison-card overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-subtle">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50">
          <tr className="border-b border-slate-200">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
            {tickers.map((ticker, index) => (
              <th key={ticker} className="px-3 py-2 text-right font-semibold text-slate-600">
                {index === 0 ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{ticker}</span>
                ) : (
                  ticker
                )}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold text-slate-600">Leader</th>
          </tr>
        </thead>
        <tbody>
          {SECTION_ORDER.map((section) => {
            const rows = rowsBySection.get(section) ?? [];
            const displayRows = condensed ? rows.slice(0, previewLimits[section] ?? 4) : rows;
            return (
              <Fragment key={section}>
                <tr>
                  <td
                    colSpan={colCount}
                    className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {section}
                  </td>
                </tr>
                {displayRows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-slate-700">{row.label}</td>
                    {tickers.map((ticker, colIndex) => (
                      <td key={ticker} className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmt(row.format, row.values[colIndex] ?? null)}
                        {row.derived[colIndex] ? (
                          <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">~</span>
                        ) : null}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      {row.bestIndex != null && tickers[row.bestIndex] ? (
                        <PillBadge label={tickers[row.bestIndex]} color="indigo" />
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {condensed && rows.length > displayRows.length ? (
                  <tr className="border-b border-slate-100">
                    <td colSpan={colCount} className="px-3 py-2 text-center text-[11px] text-slate-400">
                      + {rows.length - displayRows.length} more rows in {section}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BoardScorecard({ result }: { result: CompanyComparisonPayload }) {
  return (
    <Card title="Board-Level Scorecard" sub="Metric | A | B | Outperformance | Why (mechanism)">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{result.companyA.ticker}</span>
              </th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">{result.companyB.ticker}</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600">Outperformance</th>
              <th className="min-w-[260px] px-3 py-2 text-left font-semibold text-slate-600">Why (mechanism)</th>
            </tr>
          </thead>
          <tbody>
            {result.boardInsights.map((row) => (
              <tr key={row.metric} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2.5 font-medium text-slate-800">{row.metric}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{fmt(row.format, row.valueA)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{fmt(row.format, row.valueB)}</td>
                <td className="px-3 py-2.5 text-right">
                  {row.winner === "A" ? (
                    <PillBadge label={result.companyA.ticker} color="indigo" />
                  ) : row.winner === "B" ? (
                    <PillBadge label={result.companyB.ticker} color="sky" />
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 leading-relaxed text-slate-600">{row.insight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface ComparisonReportContentProps {
  result: CompanyComparisonPayload;
  onReset?: () => void;
  exportHref?: string;
}

export function ComparisonReportContent({
  result,
  onReset,
  exportHref,
}: ComparisonReportContentProps) {
  const isMulti = isMultiComparison(result);
  const presentationSlides = useMemo(
    () =>
      isMulti
        ? PRESENTATION_SLIDES.filter((slide) => slide.id !== "competitor-release")
        : PRESENTATION_SLIDES,
    [isMulti]
  );
  const multiTickers = isMulti && result.multiCompanies ? result.multiCompanies.map((c) => c.ticker) : [];
  const rowsBySectionMulti = isMulti ? buildMultiRowsBySection(result) : null;
  const hasPeriodWarn = result.warnings.some((warning) => PERIOD_WARNING_CODES.has(warning.code));
  const driverChartData = [
    { metric: "Revenue", companyA: result.companyA.metrics.revenue, companyB: result.companyB.metrics.revenue },
    { metric: "Gross Profit", companyA: result.companyA.metrics.grossProfit, companyB: result.companyB.metrics.grossProfit },
    { metric: "SG&A", companyA: result.companyA.metrics.sga, companyB: result.companyB.metrics.sga },
    { metric: "Op. Income", companyA: result.companyA.metrics.operatingIncome, companyB: result.companyB.metrics.operatingIncome },
  ];
  const n = result.narrative;
  const tA = result.companyA.ticker;
  const tB = result.companyB.ticker;
  const generatedLabel = new Date(result.generatedAt).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const [activeSlide, setActiveSlide] = useState<PresentationSlideId>("executive-snapshot");
  const [segmentMiniTab, setSegmentMiniTab] = useState<"cost-stack" | "margin-bridge">("cost-stack");
  const [marginMiniTab, setMarginMiniTab] = useState<"decomposition" | "gap-trend" | "qoq" | "yoy">("decomposition");
  const [balanceMiniTab, setBalanceMiniTab] = useState<"debt" | "liquidity">("debt");
  const [trendsMiniTab, setTrendsMiniTab] = useState<"margin-trend" | "timeline">("margin-trend");
  const [competitorRelease, setCompetitorRelease] = useState<CompetitorEarningsReleasePayload | null>(null);
  const [competitorReleaseLoading, setCompetitorReleaseLoading] = useState(false);
  const [competitorReleaseError, setCompetitorReleaseError] = useState<string | null>(null);
  const pairCostMixData = useMemo(() => {
    const cogsA = result.companyA.metrics.revenue ? ((result.companyA.metrics.revenue - (result.companyA.metrics.grossProfit ?? 0)) / result.companyA.metrics.revenue) * 100 : 0;
    const cogsB = result.companyB.metrics.revenue ? ((result.companyB.metrics.revenue - (result.companyB.metrics.grossProfit ?? 0)) / result.companyB.metrics.revenue) * 100 : 0;
    const sgaA = result.companyA.metrics.revenue ? ((result.companyA.metrics.sga ?? 0) / result.companyA.metrics.revenue) * 100 : 0;
    const sgaB = result.companyB.metrics.revenue ? ((result.companyB.metrics.sga ?? 0) / result.companyB.metrics.revenue) * 100 : 0;
    const otherA = Math.max(0, 100 - (cogsA + sgaA + (result.companyA.metrics.operatingMargin ?? 0)));
    const otherB = Math.max(0, 100 - (cogsB + sgaB + (result.companyB.metrics.operatingMargin ?? 0)));
    return [
      {
        ticker: tA,
        cogsPct: Math.max(0, Number.isFinite(cogsA) ? cogsA : 0),
        sgaPct: Math.max(0, Number.isFinite(sgaA) ? sgaA : 0),
        otherOpExPct: otherA,
        opProfitPct: Math.max(0, result.companyA.metrics.operatingMargin ?? 0),
      },
      {
        ticker: tB,
        cogsPct: Math.max(0, Number.isFinite(cogsB) ? cogsB : 0),
        sgaPct: Math.max(0, Number.isFinite(sgaB) ? sgaB : 0),
        otherOpExPct: otherB,
        opProfitPct: Math.max(0, result.companyB.metrics.operatingMargin ?? 0),
      },
    ];
  }, [result, tA, tB]);
  const pairMarginBridgeData = useMemo(
    () => [
      {
        ticker: tA,
        netMarginPct: Math.max(0, result.companyA.metrics.netMargin ?? 0),
        belowOpPct: Math.max(0, (result.companyA.metrics.operatingMargin ?? 0) - (result.companyA.metrics.netMargin ?? 0)),
        opToGrossPct: Math.max(0, (result.companyA.metrics.grossMargin ?? 0) - (result.companyA.metrics.operatingMargin ?? 0)),
      },
      {
        ticker: tB,
        netMarginPct: Math.max(0, result.companyB.metrics.netMargin ?? 0),
        belowOpPct: Math.max(0, (result.companyB.metrics.operatingMargin ?? 0) - (result.companyB.metrics.netMargin ?? 0)),
        opToGrossPct: Math.max(0, (result.companyB.metrics.grossMargin ?? 0) - (result.companyB.metrics.operatingMargin ?? 0)),
      },
    ],
    [result, tA, tB]
  );
  const revenueMarginTrendData = useMemo(
    () =>
      result.trends.revenue.map((point, idx) => ({
        quarterLabel: point.quarterLabel,
        revenueA: point.companyA,
        revenueB: point.companyB,
        marginA: result.trends.operatingMargin[idx]?.companyA ?? null,
        marginB: result.trends.operatingMargin[idx]?.companyB ?? null,
      })),
    [result]
  );
  const recentRevenueMarginTrendData = useMemo(
    () => revenueMarginTrendData.slice(Math.max(0, revenueMarginTrendData.length - 3)),
    [revenueMarginTrendData]
  );
  const recentRevenueTrendData = useMemo(
    () => result.trends.revenue.slice(Math.max(0, result.trends.revenue.length - 3)),
    [result]
  );
  const recentOperatingMarginTrendData = useMemo(
    () => result.trends.operatingMargin.slice(Math.max(0, result.trends.operatingMargin.length - 3)),
    [result]
  );
  const recentFreeCashFlowTrendData = useMemo(
    () => result.trends.freeCashFlow.slice(Math.max(0, result.trends.freeCashFlow.length - 3)),
    [result]
  );
  const recentMultiRevenueTrendData = useMemo(
    () => (result.multiTrends?.revenue ?? []).slice(Math.max(0, (result.multiTrends?.revenue ?? []).length - 3)),
    [result]
  );
  const recentMultiOperatingMarginTrendData = useMemo(
    () =>
      (result.multiTrends?.operatingMargin ?? []).slice(
        Math.max(0, (result.multiTrends?.operatingMargin ?? []).length - 3)
      ),
    [result]
  );
  const recentMultiFreeCashFlowTrendData = useMemo(
    () =>
      (result.multiTrends?.freeCashFlow ?? []).slice(
        Math.max(0, (result.multiTrends?.freeCashFlow ?? []).length - 3)
      ),
    [result]
  );
  const marginGapTrendData = useMemo(
    () =>
      result.trends.operatingMargin.map((point) => ({
        quarterLabel: point.quarterLabel,
        companyA: point.companyA,
        companyB: point.companyB,
        gapPp:
          point.companyA != null && point.companyB != null
            ? point.companyA - point.companyB
            : null,
      })),
    [result]
  );
  const quarterDeltaRows = useMemo(() => {
    const lastRevenue = result.trends.revenue.at(-1);
    const prevRevenue = result.trends.revenue.at(-2);
    const lastOpMargin = result.trends.operatingMargin.at(-1);
    const prevOpMargin = result.trends.operatingMargin.at(-2);
    const lastFcf = result.trends.freeCashFlow.at(-1);
    const prevFcf = result.trends.freeCashFlow.at(-2);
    return [
      {
        metric: "Revenue",
        prevA: prevRevenue?.companyA ?? null,
        currA: lastRevenue?.companyA ?? null,
        deltaA:
          prevRevenue?.companyA != null && lastRevenue?.companyA != null
            ? lastRevenue.companyA - prevRevenue.companyA
            : null,
        prevB: prevRevenue?.companyB ?? null,
        currB: lastRevenue?.companyB ?? null,
        deltaB:
          prevRevenue?.companyB != null && lastRevenue?.companyB != null
            ? lastRevenue.companyB - prevRevenue.companyB
            : null,
        format: "currency" as MetricFormat,
      },
      {
        metric: "Operating Margin",
        prevA: prevOpMargin?.companyA ?? null,
        currA: lastOpMargin?.companyA ?? null,
        deltaA:
          prevOpMargin?.companyA != null && lastOpMargin?.companyA != null
            ? lastOpMargin.companyA - prevOpMargin.companyA
            : null,
        prevB: prevOpMargin?.companyB ?? null,
        currB: lastOpMargin?.companyB ?? null,
        deltaB:
          prevOpMargin?.companyB != null && lastOpMargin?.companyB != null
            ? lastOpMargin.companyB - prevOpMargin.companyB
            : null,
        format: "percent" as MetricFormat,
      },
      {
        metric: "Free Cash Flow",
        prevA: prevFcf?.companyA ?? null,
        currA: lastFcf?.companyA ?? null,
        deltaA:
          prevFcf?.companyA != null && lastFcf?.companyA != null
            ? lastFcf.companyA - prevFcf.companyA
            : null,
        prevB: prevFcf?.companyB ?? null,
        currB: lastFcf?.companyB ?? null,
        deltaB:
          prevFcf?.companyB != null && lastFcf?.companyB != null
            ? lastFcf.companyB - prevFcf.companyB
            : null,
        format: "currency" as MetricFormat,
      },
    ];
  }, [result]);
  const yearlyDeltaRows = useMemo(() => {
    const lastRevenue = result.trends.revenue.at(-1);
    const prevYearRevenue = result.trends.revenue.length >= 5 ? result.trends.revenue.at(-5) : null;
    const lastOpMargin = result.trends.operatingMargin.at(-1);
    const prevYearOpMargin = result.trends.operatingMargin.length >= 5 ? result.trends.operatingMargin.at(-5) : null;
    const lastFcf = result.trends.freeCashFlow.at(-1);
    const prevYearFcf = result.trends.freeCashFlow.length >= 5 ? result.trends.freeCashFlow.at(-5) : null;
    return [
      {
        metric: "Revenue",
        prevA: prevYearRevenue?.companyA ?? null,
        currA: lastRevenue?.companyA ?? null,
        deltaA:
          prevYearRevenue?.companyA != null && lastRevenue?.companyA != null
            ? lastRevenue.companyA - prevYearRevenue.companyA
            : null,
        prevB: prevYearRevenue?.companyB ?? null,
        currB: lastRevenue?.companyB ?? null,
        deltaB:
          prevYearRevenue?.companyB != null && lastRevenue?.companyB != null
            ? lastRevenue.companyB - prevYearRevenue.companyB
            : null,
        format: "currency" as MetricFormat,
      },
      {
        metric: "Operating Margin",
        prevA: prevYearOpMargin?.companyA ?? null,
        currA: lastOpMargin?.companyA ?? null,
        deltaA:
          prevYearOpMargin?.companyA != null && lastOpMargin?.companyA != null
            ? lastOpMargin.companyA - prevYearOpMargin.companyA
            : null,
        prevB: prevYearOpMargin?.companyB ?? null,
        currB: lastOpMargin?.companyB ?? null,
        deltaB:
          prevYearOpMargin?.companyB != null && lastOpMargin?.companyB != null
            ? lastOpMargin.companyB - prevYearOpMargin.companyB
            : null,
        format: "percent" as MetricFormat,
      },
      {
        metric: "Free Cash Flow",
        prevA: prevYearFcf?.companyA ?? null,
        currA: lastFcf?.companyA ?? null,
        deltaA:
          prevYearFcf?.companyA != null && lastFcf?.companyA != null
            ? lastFcf.companyA - prevYearFcf.companyA
            : null,
        prevB: prevYearFcf?.companyB ?? null,
        currB: lastFcf?.companyB ?? null,
        deltaB:
          prevYearFcf?.companyB != null && lastFcf?.companyB != null
            ? lastFcf.companyB - prevYearFcf.companyB
            : null,
        format: "currency" as MetricFormat,
      },
    ];
  }, [result]);

  const summaryMetrics = useMemo(() => {
    if (isMulti && result.multiCompanies?.length) {
      return [
        { label: "Companies", value: `${result.multiCompanies.length}` },
        { label: "Benchmark", value: result.multiCompanies[0]?.ticker ?? "N/A" },
        { label: "Top Revenue", value: fmt("currency", Math.max(...result.multiCompanies.map((c) => c.metrics.revenue ?? 0))) },
        {
          label: "Top Op Margin",
          value: fmt(
            "percent",
            Math.max(...result.multiCompanies.map((c) => c.metrics.operatingMargin ?? Number.NEGATIVE_INFINITY))
          ),
        },
        { label: "Generated", value: generatedLabel },
      ];
    }

    return [
      { label: "Revenue Gap", value: metricDiffByKey(result.rows, "revenue") },
      { label: "Operating Margin Gap", value: metricDiffByKey(result.rows, "operatingMarginPct") },
      { label: "Net Income Gap", value: metricDiffByKey(result.rows, "netIncome") },
      { label: "FCF Gap", value: metricDiffByKey(result.rows, "freeCashFlow") },
      { label: "Generated", value: generatedLabel },
    ];
  }, [generatedLabel, isMulti, result]);
  const releaseTrendScale = useMemo(
    () => buildAdaptiveScale((competitorRelease?.stock.points ?? []).map((point) => point.close)),
    [competitorRelease]
  );

  const activeSlideMeta = presentationSlides.find((slide) => slide.id === activeSlide) ?? presentationSlides[0];

  useEffect(() => {
    setActiveSlide("executive-snapshot");
    setSegmentMiniTab("cost-stack");
    setMarginMiniTab("decomposition");
    setBalanceMiniTab("debt");
    setTrendsMiniTab("margin-trend");
    setCompetitorRelease(null);
    setCompetitorReleaseError(null);
    setCompetitorReleaseLoading(false);
  }, [result.generatedAt]);

  useEffect(() => {
    if (
      isMulti ||
      activeSlide !== "competitor-release" ||
      competitorRelease ||
      competitorReleaseLoading
    ) {
      return;
    }

    let cancelled = false;

    async function loadCompetitorRelease() {
      setCompetitorReleaseLoading(true);
      setCompetitorReleaseError(null);

      try {
        const response = await fetch("/api/competitor-earnings-release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            benchmark: result.companyA,
            competitor: result.companyB,
            narrative: result.narrative,
          }),
        });

        const payload = (await response.json()) as
          | CompetitorEarningsReleasePayload
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Failed to load competitor release context."
          );
        }

        if (!cancelled) {
          setCompetitorRelease(payload as CompetitorEarningsReleasePayload);
        }
      } catch (error) {
        if (!cancelled) {
          setCompetitorReleaseError(
            error instanceof Error ? error.message : "Failed to load competitor release context."
          );
        }
      } finally {
        if (!cancelled) {
          setCompetitorReleaseLoading(false);
        }
      }
    }

    void loadCompetitorRelease();

    return () => {
      cancelled = true;
    };
    // The guards above use competitorRelease / competitorReleaseLoading as
    // in-flight gates; including them in deps would re-fire this effect right
    // after setCompetitorReleaseLoading(true), causing the cleanup to cancel
    // the in-flight fetch before it can write its result back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide, isMulti, result.generatedAt]);

  return (
    <div className="space-y-4">
      <div className="comparison-card sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-subtle backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-900">
                {isMulti && result.multiCompanies
                  ? `Peer comparison (${result.multiCompanies.length} companies)`
                  : `${result.companyA.companyName} vs ${result.companyB.companyName}`}
              </span>
              <StatusPill variant="neutral" size="sm">{presentationSlides.length}-slide deck</StatusPill>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              One compare call loads all charts. Slide: {activeSlideMeta.title}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {exportHref ? (
              <a
                href={exportHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                <Presentation className="h-3 w-3" />
                Export PowerPoint
              </a>
            ) : null}
            {onReset ? (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" />
                New Comparison
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-1">
            {presentationSlides.map((slide) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActiveSlide(slide.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  activeSlide === slide.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {slide.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result.warnings.length > 0 ? (
        <details className="comparison-card group rounded-xl border border-amber-200 bg-amber-50 p-3 open:pb-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warnings
              <StatusPill variant="warning" size="xs">{result.warnings.length}</StatusPill>
            </span>
            <ChevronDown className="h-4 w-4 text-amber-700 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-amber-800">
            {result.warnings.map((warning) => (
              <li key={warning.code} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {warning.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {activeSlide === "executive-snapshot" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {summaryMetrics.map((item) => (
                <TopMetricCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>
          <Card title="Insights" sub="Who leads and why">
            <p className="text-sm leading-relaxed text-slate-700">
              {(n.executiveSummary[0] ?? n.investmentInterpretation[0] ?? "Overall leadership is mixed across scale, profitability, and cash generation.")}
            </p>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {isMulti && result.multiTrends ? (
              <MultiTrendCard title="Revenue Trend" data={result.multiTrends.revenue} tickers={multiTickers} />
            ) : (
              <TrendCard title="Revenue Trend" data={result.trends.revenue} labelA={tA} labelB={tB} />
            )}
            {isMulti && result.multiTrends ? (
              <MultiTrendCard title="Operating Margin Trend" data={result.multiTrends.operatingMargin} tickers={multiTickers} isPercent />
            ) : (
              <TrendCard title="Operating Margin Trend" data={result.trends.operatingMargin} labelA={tA} labelB={tB} isPercent />
            )}
          </div>
        </section>
      ) : null}

      {activeSlide === "competitor-release" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold text-slate-900">
                    {result.companyB.companyName} Earnings Release
                  </p>
                  <PillBadge label={`${tA} benchmark`} color="indigo" />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {tB} • {result.companyB.quarterLabel} • Filing date {formatDateLabel(competitorRelease?.filingDate ?? result.companyB.filingDate)}
                </p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Presentation-style competitor story view
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {competitorRelease?.summary ??
                (competitorReleaseLoading
                  ? "Pulling stock reaction and building commentary..."
                  : `${tB} release commentary will appear here once stock context loads.`)}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <TopMetricCard label="Revenue" value={fmt("currency", result.companyB.metrics.revenue)} />
            <TopMetricCard label="EBITDA" value={fmt("currency", result.companyB.metrics.ebitda)} />
            <TopMetricCard label="Net Income" value={fmt("currency", result.companyB.metrics.netIncome)} />
            <TopMetricCard label="Free Cash Flow" value={fmt("currency", result.companyB.metrics.freeCashFlow)} />
            <TopMetricCard
              label="Day 1 Stock Move"
              value={fmtSignedPercent(competitorRelease?.reaction?.oneDayChangePct ?? null)}
            />
            <TopMetricCard
              label="5D Stock Move"
              value={fmtSignedPercent(competitorRelease?.reaction?.fiveDayChangePct ?? null)}
            />
          </div>

          {competitorReleaseError ? (
            <Card title="Stock API Status" sub="Release commentary fallback">
              <p className="text-sm text-slate-600">
                {competitorReleaseError}
              </p>
            </Card>
          ) : null}

          <StockOverviewCard
            ticker={tB}
            fallbackName={result.companyB.companyName}
            release={competitorRelease}
            loading={competitorReleaseLoading}
            yAxisDomain={releaseTrendScale.domain}
          />

          <Card title="Presentation Commentary" sub="Market reaction, read-through, and Smithfield relevance">
            {competitorReleaseLoading && !competitorRelease ? (
              <p className="text-sm text-slate-500">Building commentary from live stock context...</p>
            ) : competitorRelease?.commentary.length ? (
              <ArrowBullets items={competitorRelease.commentary} accent />
            ) : (
              <p className="text-sm text-slate-500">Commentary will appear when stock data is available.</p>
            )}
          </Card>
        </section>
      ) : null}

      {activeSlide === "overview" ? (
        <section className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {isMulti && result.multiFinancialBars ? (
              <MultiBarCard title="Revenue, EBITDA, Net Income, FCF" data={result.multiFinancialBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
            ) : (
              <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
            )}
            {isMulti && result.multiMarginBars ? (
              <MultiBarCard title="Gross / Op / Net Margin" data={result.multiMarginBars} tickers={multiTickers} isPercent periodWarning={hasPeriodWarn} />
            ) : (
              <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
            )}
          </div>
          <Card title="Insights" sub="High-level profitability and cash profile">
            <ArrowBullets items={n.executiveSummary.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "performance-diagnosis" ? (
        <section className="space-y-4">
          {!isMulti ? (
            <BoardScorecard result={result} />
          ) : (
            <MultiFinancialsTable rowsBySection={rowsBySectionMulti ?? new Map()} tickers={multiTickers} condensed />
          )}
          <Card title="Insights" sub="Strength vs weakness by quality">
            <ArrowBullets items={n.truePerformanceDiagnosis.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "segment-mix" ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSegmentMiniTab("cost-stack")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                segmentMiniTab === "cost-stack"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              Cost Stack
            </button>
            <button
              type="button"
              onClick={() => setSegmentMiniTab("margin-bridge")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                segmentMiniTab === "margin-bridge"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              Margin Bridge
            </button>
          </div>
          {isMulti && result.multiDriverBars ? (
            <MultiBarCard title="Segmented Driver Mix (Revenue, GP, SG&A, Op Income)" data={result.multiDriverBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
          ) : segmentMiniTab === "cost-stack" ? (
            <SegmentedMixRadarCard title="Operating Cost Structure Radar" data={pairCostMixData} />
          ) : (
            <SegmentedMarginBridgeCard title="Segmented Margin Bridge" data={pairMarginBridgeData} />
          )}
          <Card title="Insights" sub="CFO view: cost stack and conversion quality">
            <ArrowBullets items={n.costStructureBridge.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "margins" ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            {[
              { id: "decomposition", label: "Decomposition" },
              { id: "gap-trend", label: "Gap Trend" },
              { id: "qoq", label: "Q4 vs Q3" },
              { id: "yoy", label: "Q4 vs PY" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMarginMiniTab(tab.id as typeof marginMiniTab)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  marginMiniTab === tab.id
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {marginMiniTab === "decomposition" ? (
            <>
              {isMulti && result.multiMarginBars ? (
                <MultiBarCard title="Margin Decomposition View" data={result.multiMarginBars} tickers={multiTickers} isPercent periodWarning={hasPeriodWarn} />
              ) : (
                <MarginGapChart data={result.charts.marginGapBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
              )}
              <Card title="Insights" sub="Where the gap comes from">
                <ArrowBullets items={n.marginGapDecomposition.slice(0, 4)} accent />
              </Card>
            </>
          ) : null}

          {marginMiniTab === "gap-trend" ? (
            <>
              <MarginGapChart data={marginGapTrendData} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} xKey="quarterLabel" />
              <Card title="Insights" sub="Gap trend and persistence over time">
                <ArrowBullets items={n.whatChanged.slice(0, 4)} accent />
              </Card>
            </>
          ) : null}

          {marginMiniTab === "qoq" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
                <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
              </div>
              <DeltaSummaryTable
                title="Q4 vs Q3 Delta Table"
                subtitle="Current quarter versus previous quarter"
                labelA={tA}
                labelB={tB}
                rows={quarterDeltaRows}
              />
              <Card title="Insights" sub="Quarter-over-quarter operating and cash delta">
                <ArrowBullets items={n.whatChanged.slice(0, 4)} accent />
              </Card>
            </>
          ) : null}

          {marginMiniTab === "yoy" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
                <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
              </div>
              <DeltaSummaryTable
                title="Q4 vs Prior-Year Q4 Delta Table"
                subtitle="Current quarter versus same quarter last year"
                labelA={tA}
                labelB={tB}
                rows={yearlyDeltaRows}
              />
              <Card title="Insights" sub="Year-over-year improvement versus deterioration">
                <ArrowBullets items={n.executiveSummary.slice(0, 4)} accent />
              </Card>
            </>
          ) : null}
        </section>
      ) : null}

      {activeSlide === "revenue-growth" ? (
        <section className="space-y-4">
          {isMulti && result.multiTrends ? (
            <MultiTrendCard title="Revenue Trend" data={result.multiTrends.revenue} tickers={multiTickers} />
          ) : (
            <TrendCard title="Revenue Trend" data={result.trends.revenue} labelA={tA} labelB={tB} />
          )}
          <Card title="Insights" sub="Growth trajectory and acceleration">
            <ArrowBullets items={n.whatChanged.slice(0, 4)} accent />
          </Card>
          {!isMulti ? (
            <RevenueMarginComboCard title="Revenue + Margin Combined Trend" data={revenueMarginTrendData} labelA={tA} labelB={tB} />
          ) : null}
        </section>
      ) : null}

      {activeSlide === "ebitda-profitability" ? (
        <section className="space-y-4">
          {isMulti && result.multiFinancialBars ? (
            <MultiBarCard title="Revenue, EBITDA, Net Income, FCF" data={result.multiFinancialBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
          ) : (
            <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
          )}
          <Card title="Insights" sub="Profitability quality and EBITDA lens">
            <ArrowBullets items={n.investmentInterpretation.slice(0, 4)} />
          </Card>
        </section>
      ) : null}

      {activeSlide === "cash-flow-structure" ? (
        <section className="space-y-4">
          {isMulti && result.multiCashFlowBars ? (
            <MultiBarCard title="OpCF, CapEx, Free Cash Flow" data={result.multiCashFlowBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
          ) : (
            <BarCard title="OpCF, CapEx, Free Cash Flow" data={result.charts.cashFlowBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
          )}
          <Card title="Insights" sub="Cash conversion and reinvestment quality">
            <ArrowBullets items={n.capitalAllocationStory.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "operating-drivers" ? (
        <section className="space-y-4">
          {isMulti && result.multiDriverBars ? (
            <MultiBarCard title="Revenue, Gross Profit, SG&A, Op. Income" data={result.multiDriverBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
          ) : (
            <BarCard title="Revenue, Gross Profit, SG&A, Op. Income" data={driverChartData} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
          )}
          <Card title="Insights" sub="Cost efficiency diagnosis">
            <ArrowBullets items={n.costStructureBridge.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "balance-sheet" ? (
        <section className="space-y-4">
          <BarCard
            title="Net Debt, D/E, Net Debt/EBITDA, Interest Coverage"
            data={[
              { metric: "Net Debt", companyA: result.companyA.metrics.netDebt, companyB: result.companyB.metrics.netDebt },
              { metric: "Debt / Equity", companyA: result.companyA.metrics.debtToEquity, companyB: result.companyB.metrics.debtToEquity },
              { metric: "Net Debt / EBITDA", companyA: result.companyA.metrics.netDebtToEbitda, companyB: result.companyB.metrics.netDebtToEbitda },
              { metric: "Interest Coverage", companyA: result.companyA.metrics.interestCoverage, companyB: result.companyB.metrics.interestCoverage },
            ]}
            labelA={tA}
            labelB={tB}
            periodWarning={hasPeriodWarn}
          />
          <Card title="Insights" sub="Leverage and capital-structure risk">
            <ArrowBullets items={n.capitalAllocationStory.slice(0, 4)} />
          </Card>
        </section>
      ) : null}

      {activeSlide === "balance-sheet" ? (
        <section className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            {isMulti && result.multiCashFlowBars ? (
              <MultiBarCard title="OpCF, CapEx, Free Cash Flow" data={result.multiCashFlowBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
            ) : (
              <BarCard title="OpCF, CapEx, Free Cash Flow" data={result.charts.cashFlowBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
            )}
            <BarCard
              title="Net Debt, Debt/Equity, Interest Coverage"
              data={[
                { metric: "Net Debt", companyA: result.companyA.metrics.netDebt, companyB: result.companyB.metrics.netDebt },
                { metric: "Debt / Equity", companyA: result.companyA.metrics.debtToEquity, companyB: result.companyB.metrics.debtToEquity },
                { metric: "Interest Coverage", companyA: result.companyA.metrics.interestCoverage, companyB: result.companyB.metrics.interestCoverage },
              ]}
              labelA={tA}
              labelB={tB}
              periodWarning={hasPeriodWarn}
            />
          </div>
          <Card title="Insights" sub="Liquidity buffer and debt-servicing resilience">
            <ArrowBullets items={n.capitalAllocationStory.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "trends" ? (
        <section className="space-y-4">
          <Card title="Insights" sub="Combined Q1-Q3 view across growth, margin, and cash">
            <ArrowBullets items={n.whatChanged.slice(0, 4)} accent />
          </Card>
          {isMulti && result.multiTrends ? (
            <div className="grid gap-4 xl:grid-cols-3">
              <MultiTrendCard title="Q1-Q3 Revenue" data={recentMultiRevenueTrendData} tickers={multiTickers} />
              <MultiTrendCard
                title="Q1-Q3 Operating Margin"
                data={recentMultiOperatingMarginTrendData}
                tickers={multiTickers}
                isPercent
              />
              <MultiTrendCard title="Q1-Q3 Free Cash Flow" data={recentMultiFreeCashFlowTrendData} tickers={multiTickers} />
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <RevenueMarginComboCard
                title="Q1-Q3 Revenue + Operating Margin"
                data={recentRevenueMarginTrendData}
                labelA={tA}
                labelB={tB}
              />
              <TrendCard
                title="Q1-Q3 Free Cash Flow"
                data={recentFreeCashFlowTrendData}
                labelA={tA}
                labelB={tB}
              />
              <TrendCard
                title="Q1-Q3 Revenue"
                data={recentRevenueTrendData}
                labelA={tA}
                labelB={tB}
              />
              <TrendCard
                title="Q1-Q3 Operating Margin"
                data={recentOperatingMarginTrendData}
                labelA={tA}
                labelB={tB}
                isPercent
              />
            </div>
          )}
        </section>
      ) : null}

      {activeSlide === "trends" ? (
        <section className="space-y-4">
          {isMulti && result.multiTrends ? (
            <MultiTrendCard title="Operating Margin Trend" data={result.multiTrends.operatingMargin} tickers={multiTickers} isPercent />
          ) : (
            <TrendCard title="Operating Margin Trend" data={result.trends.operatingMargin} labelA={tA} labelB={tB} isPercent />
          )}
          <Card title="Insights" sub="Momentum: improving vs deteriorating">
            <ArrowBullets items={n.whatChanged.slice(0, 4)} accent />
          </Card>
        </section>
      ) : null}

      {activeSlide === "investment-interpretation" ? (
        <section className="space-y-4">
          {!isMulti ? (
            <BoardScorecard result={result} />
          ) : (
            <MultiFinancialsTable rowsBySection={rowsBySectionMulti ?? new Map()} tickers={multiTickers} condensed />
          )}
          <Card title="Insights" sub="Investment framing">
            <ArrowBullets items={n.investmentInterpretation.slice(0, 5)} accent />
          </Card>
        </section>
      ) : null}
    </div>
  );
}


