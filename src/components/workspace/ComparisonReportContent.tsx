"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
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
} from "recharts";
import {
  AlertTriangle,
  ChevronRight,
  Database,
  ChevronDown,
  ChevronUp,
  Eye,
  Presentation,
  RotateCcw,
} from "lucide-react";
import type {
  CompanyComparisonPayload,
  ComparisonRow,
  ComparisonSection,
  MetricFormat,
  MultiComparisonRow,
  MultiMarginGapBarRow,
  MultiTrendPoint,
} from "@/lib/companyComparison";
import { StatusPill } from "@/components/ui/status-pill";

type InterpretationTone = "primary" | "warning" | "danger" | "info";

function interpretationMeta(index: number): { label: string; variant: InterpretationTone; rowClass: string } {
  if (index === 0) return { label: "Lead", variant: "primary", rowClass: "border-primary/20 bg-primary/5" };
  if (index === 1) return { label: "Risk", variant: "warning", rowClass: "border-amber-200 bg-amber-50/60" };
  if (index === 2) return { label: "Alert", variant: "danger", rowClass: "border-red-200 bg-red-50/50" };
  return { label: "Signal", variant: "info", rowClass: "border-sky-200 bg-sky-50/50" };
}

export type CompareTab = "overview" | "margin-gaps" | "financials" | "trends";
type ViewMode = "summary" | "detailed";

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

const TABS: Array<{ value: CompareTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "margin-gaps", label: "Margin Gaps" },
  { value: "financials", label: "Financials" },
  { value: "trends", label: "Trends" },
];

const MULTI_CHART_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#64748b"];

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

function buildRowsBySection(result: CompanyComparisonPayload) {
  const map = new Map<ComparisonSection, ComparisonRow[]>();
  for (const section of SECTION_ORDER) {
    map.set(section, result.rows.filter((row) => row.section === section));
  }
  return map;
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

function ModuleCard({
  id,
  title,
  sub,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-subtle">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open ? <div className="border-t border-slate-100 bg-slate-50/50 p-4">{children}</div> : null}
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

function PlainBullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="text-xs leading-relaxed text-slate-700">
          {item}
        </li>
      ))}
    </ul>
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
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            <Bar dataKey="companyA" name={labelA} fill="#4f46e5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="companyB" name={labelB} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
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
}: {
  data: Array<{ metric: string; companyA: number | null; companyB: number | null; gapPp: number | null }>;
  labelA: string;
  labelB: string;
  periodWarning: boolean;
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
            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="m" tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
            <YAxis
              yAxisId="g"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => `${value}pp`}
            />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="g" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar yAxisId="g" dataKey="gapPp" name="Gap (A-B)" fill="#94a3b8" opacity={0.35} radius={[4, 4, 0, 0]} />
            <Line yAxisId="m" type="monotone" dataKey="companyA" name={labelA} stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="m" type="monotone" dataKey="companyB" name={labelB} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} connectNulls />
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
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "...", position: "insideTopRight", fill: "#334155", fontSize: 12 }}
              />
            ) : null}
            <Line type="monotone" dataKey="companyA" name={labelA} stroke="#4f46e5" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="companyB" name={labelB} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function FinancialsTable({
  rowsBySection,
  result,
  condensed = false,
}: {
  rowsBySection: Map<ComparisonSection, ComparisonRow[]>;
  result: CompanyComparisonPayload;
  condensed?: boolean;
}) {
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
            <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-600">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{result.companyA.ticker}</span>
            </th>
            <th className="px-3 py-2 text-right font-semibold text-slate-600">{result.companyB.ticker}</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-600">Diff (A-B)</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-600">Outperformance</th>
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
                    colSpan={5}
                    className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                  >
                    {section}
                  </td>
                </tr>
                {displayRows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {fmt(row.format, row.valueA)}
                      {row.derivedA ? (
                        <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">~</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {fmt(row.format, row.valueB)}
                      {row.derivedB ? (
                        <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">~</span>
                      ) : null}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        row.difference != null && row.difference > 0
                          ? "text-emerald-700"
                          : row.difference != null && row.difference < 0
                            ? "text-red-600"
                            : "text-slate-500"
                      }`}
                    >
                      {fmtDiff(row)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.better === "A" ? (
                        <PillBadge label={result.companyA.ticker} color="indigo" />
                      ) : row.better === "B" ? (
                        <PillBadge label={result.companyB.ticker} color="sky" />
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {condensed && rows.length > displayRows.length ? (
                  <tr className="border-b border-slate-100">
                    <td colSpan={5} className="px-3 py-2 text-center text-[11px] text-slate-400">
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

function MultiPeerGapBarCard({
  title,
  rows,
  peerTickers,
  periodWarning,
}: {
  title: string;
  rows: MultiMarginGapBarRow[];
  peerTickers: string[];
  periodWarning: boolean;
}) {
  const data = rows.map((row) => {
    const point: Record<string, string | number | null> = { metric: row.metric };
    for (const ticker of peerTickers) {
      point[ticker] = row.gapVsBenchmarkPp[ticker] ?? null;
    }
    return point;
  });

  return (
    <Card title={title} sub="Gap vs first ticker (percentage points)">
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
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}pp`} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            {peerTickers.map((ticker, index) => (
              <Bar
                key={ticker}
                dataKey={ticker}
                name={ticker}
                fill={MULTI_CHART_COLORS[(index + 1) % MULTI_CHART_COLORS.length]}
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

function PrintSectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
      {title}
    </div>
  );
}

interface ComparisonReportContentProps {
  result: CompanyComparisonPayload;
  activeTab?: CompareTab;
  onTabChange?: (tab: CompareTab) => void;
  onReset?: () => void;
  exportHref?: string;
  printMode?: boolean;
}

export function ComparisonReportContent({
  result,
  activeTab = "overview",
  onTabChange,
  onReset,
  exportHref,
  printMode = false,
}: ComparisonReportContentProps) {
  const rowsBySection = buildRowsBySection(result);
  const isMulti = isMultiComparison(result);
  const multiTickers = isMulti && result.multiCompanies ? result.multiCompanies.map((c) => c.ticker) : [];
  const peerTickersForGap = multiTickers.length > 0 ? multiTickers.slice(1) : [];
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
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [openModules, setOpenModules] = useState<string[]>([
    "performance",
    "profitability",
    "financials",
    "comparison",
  ]);
  const [showFullFinancialTable, setShowFullFinancialTable] = useState(false);

  const toggleModule = (id: string) => {
    setOpenModules((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
  };

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

  const showOverview = printMode || activeTab === "overview";
  const showMarginGaps = printMode || activeTab === "margin-gaps";
  const showFinancials = printMode || activeTab === "financials";
  const showTrends = printMode || activeTab === "trends";

  return (
    <div className={printMode ? "comparison-print-root space-y-6" : "space-y-4"}>
      <div className={printMode ? "comparison-card rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-subtle" : "comparison-card sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-subtle backdrop-blur"}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            {isMulti && result.multiCompanies ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-900">Peer comparison</span>
                  <StatusPill variant="neutral" size="sm">
                    {result.multiCompanies.length} companies
                  </StatusPill>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.multiCompanies.map((company, index) => (
                    <span
                      key={company.ticker}
                      className={`rounded-md px-2 py-0.5 text-sm font-bold ${
                        index === 0 ? "bg-primary text-white" : "border border-slate-200 bg-slate-100 text-slate-800"
                      }`}
                    >
                      {company.ticker}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {result.multiCompanies
                    .map((c) => `${c.ticker}: ${c.quarterLabel} (${c.periodEnd})`)
                    .join(" · ")}
                  {printMode ? ` | Generated ${generatedLabel}` : ""}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-900">{result.companyA.companyName}.</span>
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary ring-1 ring-inset ring-primary/20">{tA}</span>
                  <span className="text-sm text-slate-400">vs</span>
                  <span className="text-lg font-bold text-slate-900">{result.companyB.companyName}.</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-200">
                    {tB}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {result.companyA.quarterLabel} | Period ending {result.companyA.periodEnd}
                  {printMode ? ` | Generated ${generatedLabel}` : ""}
                </p>
              </>
            )}
          </div>

          {printMode ? null : (
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
          )}
        </div>

        {printMode ? null : (
          <div className="mt-4 flex gap-0 border-b border-slate-200">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange?.(tab.value)}
                className={`relative px-4 pb-2.5 pt-0.5 text-sm font-semibold transition ${
                  activeTab === tab.value ? "text-slate-900" : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {activeTab === tab.value ? (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-primary" />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {!printMode && showOverview ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company comparison</p>
                <p className="text-lg font-bold text-slate-900">
                  {isMulti && result.multiCompanies
                    ? `${result.multiCompanies.map((c) => c.ticker).join(" vs ")}`
                    : `${tA} vs ${tB}`}
                </p>
                <p className="text-xs text-slate-500">
                  Time range: {isMulti && result.multiCompanies ? "Latest available quarter per company" : result.companyA.quarterLabel}
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("summary")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    viewMode === "summary" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Summary mode
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("detailed")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    viewMode === "detailed" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Detailed mode
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {summaryMetrics.map((item) => (
                <TopMetricCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">AI Executive Summary</p>
                <p className="text-xs text-slate-500">Bullet insights first, deeper narrative optional</p>
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              {n.executiveSummary.slice(0, 4).map((item, index) => (
                <li key={`${item}-${index}`} className="text-xs leading-relaxed text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">Expand full executive narrative</summary>
              <div className="mt-2">
                <PlainBullets items={n.executiveSummary} />
              </div>
            </details>
          </div>
        </section>
      ) : null}

      {result.warnings.length > 0 && showOverview ? (
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

      {showOverview ? (
        printMode ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Overview" /> : null}

          {printMode ? (
            <Card title="Executive Summary" sub="[Insight] -> [Cause] -> [Implication]">
              <PlainBullets items={n.executiveSummary} />
            </Card>
          ) : null}

          <Card title="True Performance Diagnosis" sub="Reported vs adjusted - separating real from accounting-driven performance">
            <ArrowBullets items={n.truePerformanceDiagnosis} accent />
            {!isMulti &&
            (result.methodologyComparison.companyAVariants.length > 0 ||
              result.methodologyComparison.companyBVariants.length > 0) ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[
                  { ticker: tA, variants: result.methodologyComparison.companyAVariants },
                  { ticker: tB, variants: result.methodologyComparison.companyBVariants },
                ].map(({ ticker, variants }) =>
                  variants.length > 0 ? (
                    <div key={ticker} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {ticker} Variants
                      </p>
                      {variants.map((variant) => (
                        <div key={variant.label} className="mb-1">
                          <span className="font-medium text-slate-800">{variant.label}</span>
                          <span className="ml-1 text-slate-500">
                            Corp alloc: {variant.corporateAllocation != null ? `$${Math.abs(variant.corporateAllocation).toFixed(0)}M` : "N/A"} | % Rev:{" "}
                            {variant.corporateAsPercentOfRevenue != null ? `${variant.corporateAsPercentOfRevenue.toFixed(1)}%` : "N/A"} | Amort:{" "}
                            {variant.amortizationExpense != null ? `$${Math.abs(variant.amortizationExpense).toFixed(0)}M` : "N/A"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            ) : null}
            {isMulti && result.multiMethodologyNotes && result.multiMethodologyNotes.length > 0 ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-700">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Methodology notes</p>
                <ul className="list-disc space-y-1 pl-4">
                  {result.multiMethodologyNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card title="Investment Interpretation" sub="Outperformance signal | Hidden risk | Misleading metric warnings | FCF signal">
            <div className="space-y-2">
              {n.investmentInterpretation.map((item, index) => {
                const meta = interpretationMeta(index);
                return (
                  <div key={`${meta.label}-${index}`} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${meta.rowClass}`}>
                    <StatusPill variant={meta.variant} size="sm" uppercase className="mt-0.5">
                      {meta.label}
                    </StatusPill>
                    <p className="text-xs leading-relaxed text-slate-700">{item}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {!isMulti && result.relativePerformance.length > 0 ? (
            <Card title="Historical Outperformance" sub="Outperformance count over overlapping quarters">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{tA}</span> Outperformance
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">{tB} Outperformance</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Ties</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Qtrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.relativePerformance.map((row) => (
                      <tr key={row.metric} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{row.metric}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{row.companyAWins}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.companyBWins}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.ties}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.sampleSize}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {n.counterfactual.length > 0 ? (
            <Card title="Counterfactual Engine">
              <ArrowBullets items={n.counterfactual} accent />
            </Card>
          ) : null}
        </section>
        ) : (
          <ModuleCard
            id="performance"
            title="Performance"
            sub="Core signals and strategic interpretation"
            open={openModules.includes("performance")}
            onToggle={toggleModule}
          >
            <section className="comparison-report-section space-y-4">
              <Card title="True Performance Diagnosis" sub="Reported vs adjusted - separating real from accounting-driven performance">
                <ArrowBullets items={viewMode === "summary" ? n.truePerformanceDiagnosis.slice(0, 3) : n.truePerformanceDiagnosis} accent />
                {!isMulti &&
                viewMode === "detailed" &&
                (result.methodologyComparison.companyAVariants.length > 0 ||
                  result.methodologyComparison.companyBVariants.length > 0) ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {[
                      { ticker: tA, variants: result.methodologyComparison.companyAVariants },
                      { ticker: tB, variants: result.methodologyComparison.companyBVariants },
                    ].map(({ ticker, variants }) =>
                      variants.length > 0 ? (
                        <div key={ticker} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ticker} Variants</p>
                          {variants.map((variant) => (
                            <div key={variant.label} className="mb-1">
                              <span className="font-medium text-slate-800">{variant.label}</span>
                              <span className="ml-1 text-slate-500">
                                Corp alloc: {variant.corporateAllocation != null ? `$${Math.abs(variant.corporateAllocation).toFixed(0)}M` : "N/A"} | % Rev:{" "}
                                {variant.corporateAsPercentOfRevenue != null ? `${variant.corporateAsPercentOfRevenue.toFixed(1)}%` : "N/A"} | Amort:{" "}
                                {variant.amortizationExpense != null ? `$${Math.abs(variant.amortizationExpense).toFixed(0)}M` : "N/A"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null
                    )}
                  </div>
                ) : null}
              </Card>
              <Card title="Investment Interpretation" sub="Outperformance signal | Hidden risk | Misleading metric warnings | FCF signal">
                <div className="space-y-2">
                  {(viewMode === "summary" ? n.investmentInterpretation.slice(0, 2) : n.investmentInterpretation).map((item, index) => {
                    const meta = interpretationMeta(index);
                    return (
                      <div key={`${index}-${item}`} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${meta.rowClass}`}>
                        <StatusPill variant={meta.variant} size="sm" uppercase className="mt-0.5">
                          {meta.label}
                        </StatusPill>
                        <p className="text-xs leading-relaxed text-slate-700">{item}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {viewMode === "detailed" && !isMulti && result.relativePerformance.length > 0 ? (
                <Card title="Historical Outperformance" sub="Outperformance count over overlapping quarters">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{tA}</span> Outperformance
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">{tB} Outperformance</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Ties</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Qtrs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.relativePerformance.map((row) => (
                          <tr key={row.metric} className="border-b border-slate-100">
                            <td className="px-3 py-2 text-slate-700">{row.metric}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{row.companyAWins}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{row.companyBWins}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.ties}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{row.sampleSize}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}
            </section>
          </ModuleCard>
        )
      ) : null}

      {showMarginGaps ? (
        printMode ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Margin Gaps" /> : null}

          <Card title="Margin Gap Decomposition" sub="Total gap attributed to: COGS | SG&A | Allocation distortion | Scale">
            <ArrowBullets items={n.marginGapDecomposition} accent />
          </Card>

          {isMulti && result.multiMarginGapBars && result.multiMarginBars && multiTickers.length > 0 ? (
            <>
              <MultiBarCard
                title="Margin levels"
                data={result.multiMarginBars}
                tickers={multiTickers}
                isPercent
                periodWarning={hasPeriodWarn}
              />
              {peerTickersForGap.length > 0 ? (
                <MultiPeerGapBarCard
                  title="Peer margin gaps"
                  rows={result.multiMarginGapBars}
                  peerTickers={peerTickersForGap}
                  periodWarning={hasPeriodWarn}
                />
              ) : null}
              <Card title="Margin comparison" sub={`Levels (%) and gap vs ${multiTickers[0] ?? "benchmark"} (pp)`}>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Margin metric</th>
                        {multiTickers.map((ticker, index) => (
                          <th key={ticker} className="px-3 py-2 text-right font-semibold text-slate-600">
                            {index === 0 ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{ticker}</span>
                            ) : (
                              ticker
                            )}
                          </th>
                        ))}
                        {peerTickersForGap.map((ticker) => (
                          <th key={`gap-${ticker}`} className="px-3 py-2 text-right font-semibold text-slate-600">
                            Δ vs {multiTickers[0]} ({ticker})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.multiMarginGapBars.map((row) => (
                        <tr key={row.metric} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800">{row.metric}</td>
                          {multiTickers.map((ticker) => (
                            <td key={ticker} className="px-3 py-2 text-right tabular-nums text-slate-900">
                              {fmt("percent", row.byTicker[ticker] ?? null)}
                            </td>
                          ))}
                          {peerTickersForGap.map((ticker) => {
                            const gap = row.gapVsBenchmarkPp[ticker];
                            const gapPositive = gap != null && gap > 0;
                            const gapNegative = gap != null && gap < 0;
                            return (
                              <td
                                key={ticker}
                                className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                  gapPositive ? "text-emerald-700" : gapNegative ? "text-red-600" : "text-slate-500"
                                }`}
                              >
                                {gap == null ? "N/A" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)} pp`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            <>
              <MarginGapChart
                data={result.charts.marginGapBars}
                labelA={tA}
                labelB={tB}
                periodWarning={hasPeriodWarn}
              />

              <Card title="Margin Gap Table">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Margin Metric</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{tA}</span>
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">{tB}</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Gap (A-B)</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Interpretation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.charts.marginGapBars.map((row) => {
                        const gapPositive = row.gapPp != null && row.gapPp > 0;
                        const gapNegative = row.gapPp != null && row.gapPp < 0;

                        return (
                          <tr key={row.metric} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-medium text-slate-800">{row.metric}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("percent", row.companyA)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("percent", row.companyB)}</td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                gapPositive ? "text-emerald-700" : gapNegative ? "text-red-600" : "text-slate-500"
                              }`}
                            >
                              {row.gapPp == null ? "N/A" : `${row.gapPp > 0 ? "+" : ""}${row.gapPp.toFixed(1)} pp`}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500">
                              {gapPositive
                                ? `${tA} leads - cost or pricing advantage`
                                : gapNegative
                                  ? `${tB} leads - investigate driver`
                                  : "Comparable"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          <Card title="Cost Structure & Allocation Bridge" sub="Revenue -> COGS -> SG&A -> Corp Alloc -> True Operating Profit">
            <ArrowBullets items={n.costStructureBridge} />
          </Card>

          {!isMulti && result.segmentComparison.length > 0 ? (
            <Card title="Segment-Level Competitive Analysis" sub="Segment outperformance | cost advantage / pricing / scale / allocation">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Segment</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">{tA} Rev</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">{tB} Rev</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">{tA} OP%</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">{tB} OP%</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Gap</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Outperformance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.segmentComparison.map((row) => (
                      <tr key={row.segment} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{row.segment}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("currency", row.companyARevenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("currency", row.companyBRevenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("percent", row.companyAOperatingMargin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">{fmt("percent", row.companyBOperatingMargin)}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-semibold ${
                            row.marginGapPp != null && row.marginGapPp > 0
                              ? "text-emerald-700"
                              : row.marginGapPp != null && row.marginGapPp < 0
                                ? "text-red-600"
                                : "text-slate-500"
                          }`}
                        >
                          {row.marginGapPp == null ? "N/A" : `${row.marginGapPp > 0 ? "+" : ""}${row.marginGapPp.toFixed(1)} pp`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.better === "A" ? (
                            <PillBadge label={tA} color="indigo" />
                          ) : row.better === "B" ? (
                            <PillBadge label={tB} color="sky" />
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </section>
        ) : (
          <ModuleCard
            id="profitability"
            title="Profitability"
            sub="Margins, cost structure, and decomposition"
            open={openModules.includes("profitability")}
            onToggle={toggleModule}
          >
            <section className="comparison-report-section space-y-4">
              <Card title="Margin Gap Decomposition" sub="Total gap attributed to: COGS | SG&A | Allocation distortion | Scale">
                <ArrowBullets items={viewMode === "summary" ? n.marginGapDecomposition.slice(0, 3) : n.marginGapDecomposition} accent />
              </Card>
              {viewMode === "detailed" || !isMulti ? (
                <>
                  {isMulti && result.multiMarginGapBars && result.multiMarginBars && multiTickers.length > 0 ? (
                    <>
                      <MultiBarCard
                        title="Margin levels"
                        data={result.multiMarginBars}
                        tickers={multiTickers}
                        isPercent
                        periodWarning={hasPeriodWarn}
                      />
                      {peerTickersForGap.length > 0 ? (
                        <MultiPeerGapBarCard
                          title="Peer margin gaps"
                          rows={result.multiMarginGapBars}
                          peerTickers={peerTickersForGap}
                          periodWarning={hasPeriodWarn}
                        />
                      ) : null}
                    </>
                  ) : (
                    <MarginGapChart data={result.charts.marginGapBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
                  )}
                </>
              ) : null}
            </section>
          </ModuleCard>
        )
      ) : null}

      {showFinancials ? (
        printMode ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Financials" /> : null}

          <Card title="Capital Allocation & Strategy" sub="CapEx intensity | M&A signals | Buybacks | Debt posture consequences">
            <ArrowBullets items={n.capitalAllocationStory} />
          </Card>

          {isMulti &&
          result.multiFinancialBars &&
          result.multiMarginBars &&
          result.multiCashFlowBars &&
          result.multiDriverBars &&
          rowsBySectionMulti ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <MultiBarCard
                title="Revenue, EBITDA, Net Income, FCF"
                data={result.multiFinancialBars}
                tickers={multiTickers}
                periodWarning={hasPeriodWarn}
              />
              <MultiBarCard
                title="Gross / Op / Net Margin"
                data={result.multiMarginBars}
                tickers={multiTickers}
                isPercent
                periodWarning={hasPeriodWarn}
              />
              <MultiBarCard
                title="Revenue, Gross Profit, SG&A, Op. Income"
                data={result.multiDriverBars}
                tickers={multiTickers}
                periodWarning={hasPeriodWarn}
              />
              <MultiBarCard
                title="OpCF, CapEx, Free Cash Flow"
                data={result.multiCashFlowBars}
                tickers={multiTickers}
                periodWarning={hasPeriodWarn}
              />
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
              <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
              <BarCard title="Revenue, Gross Profit, SG&A, Op. Income" data={driverChartData} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
              <BarCard title="OpCF, CapEx, Free Cash Flow" data={result.charts.cashFlowBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
            </div>
          )}

          {!isMulti ? <BoardScorecard result={result} /> : null}
          {isMulti && rowsBySectionMulti ? (
            <MultiFinancialsTable rowsBySection={rowsBySectionMulti} tickers={multiTickers} />
          ) : (
            <FinancialsTable rowsBySection={rowsBySection} result={result} />
          )}
        </section>
        ) : (
          <ModuleCard
            id="financials"
            title="Financials"
            sub="Key metrics first, full statements on demand"
            open={openModules.includes("financials")}
            onToggle={toggleModule}
          >
            <section className="comparison-report-section space-y-4">
              <Card title="Capital Allocation & Strategy" sub="CapEx intensity | M&A signals | Buybacks | Debt posture consequences">
                <ArrowBullets items={viewMode === "summary" ? n.capitalAllocationStory.slice(0, 3) : n.capitalAllocationStory} />
              </Card>
              {isMulti &&
              result.multiFinancialBars &&
              result.multiMarginBars &&
              result.multiCashFlowBars &&
              result.multiDriverBars &&
              rowsBySectionMulti ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <MultiBarCard title="Revenue, EBITDA, Net Income, FCF" data={result.multiFinancialBars} tickers={multiTickers} periodWarning={hasPeriodWarn} />
                  <MultiBarCard title="Gross / Op / Net Margin" data={result.multiMarginBars} tickers={multiTickers} isPercent periodWarning={hasPeriodWarn} />
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
                  <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comparison table</p>
                  <button
                    type="button"
                    onClick={() => setShowFullFinancialTable(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View full table
                  </button>
                </div>
                {isMulti && rowsBySectionMulti ? (
                  <MultiFinancialsTable rowsBySection={rowsBySectionMulti} tickers={multiTickers} condensed={viewMode === "summary"} />
                ) : (
                  <FinancialsTable rowsBySection={rowsBySection} result={result} condensed={viewMode === "summary"} />
                )}
              </div>
            </section>
          </ModuleCard>
        )
      ) : null}

      {showTrends ? (
        printMode ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Trends" /> : null}

          <Card title="What Changed (Period-over-Period)" sub="Inflection points | margin changes | cost spikes | revenue trajectory">
            <ArrowBullets items={n.whatChanged} accent />
          </Card>

          {isMulti && result.multiTrends ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <MultiTrendCard title="Revenue" data={result.multiTrends.revenue} tickers={multiTickers} />
              <MultiTrendCard
                title="Operating Margin"
                data={result.multiTrends.operatingMargin}
                tickers={multiTickers}
                isPercent
              />
              <MultiTrendCard title="Gross Margin" data={result.multiTrends.grossMargin} tickers={multiTickers} isPercent />
              <MultiTrendCard title="Net Margin" data={result.multiTrends.netMargin} tickers={multiTickers} isPercent />
              <MultiTrendCard title="Free Cash Flow" data={result.multiTrends.freeCashFlow} tickers={multiTickers} />
              <MultiTrendCard title="SG&A Expense" data={result.multiTrends.sgaExpense} tickers={multiTickers} />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <TrendCard title="Revenue" data={result.trends.revenue} labelA={tA} labelB={tB} />
              <TrendCard title="Operating Margin" data={result.trends.operatingMargin} labelA={tA} labelB={tB} isPercent />
              <TrendCard title="Gross Margin" data={result.trends.grossMargin} labelA={tA} labelB={tB} isPercent />
              <TrendCard title="Net Margin" data={result.trends.netMargin} labelA={tA} labelB={tB} isPercent />
              <TrendCard title="Free Cash Flow" data={result.trends.freeCashFlow} labelA={tA} labelB={tB} />
              <TrendCard title="SG&A Expense" data={result.trends.sgaExpense} labelA={tA} labelB={tB} />
            </div>
          )}

          <Card title="Data Quality & Adjustments Applied" sub="What is missing | what was inferred | what may distort conclusions">
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <ArrowBullets items={n.dataQuality} />
            </div>
          </Card>
        </section>
        ) : (
          <ModuleCard
            id="comparison"
            title="Comparison"
            sub="Trends, board view, and data quality"
            open={openModules.includes("comparison")}
            onToggle={toggleModule}
          >
            <section className="comparison-report-section space-y-4">
              <Card title="What Changed (Period-over-Period)" sub="Inflection points | margin changes | cost spikes | revenue trajectory">
                <ArrowBullets items={viewMode === "summary" ? n.whatChanged.slice(0, 3) : n.whatChanged} accent />
              </Card>

              {isMulti && result.multiTrends ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MultiTrendCard title="Revenue" data={result.multiTrends.revenue} tickers={multiTickers} />
                  <MultiTrendCard title="Operating Margin" data={result.multiTrends.operatingMargin} tickers={multiTickers} isPercent />
                  <MultiTrendCard title="Gross Margin" data={result.multiTrends.grossMargin} tickers={multiTickers} isPercent />
                  <MultiTrendCard title="Net Margin" data={result.multiTrends.netMargin} tickers={multiTickers} isPercent />
                  <MultiTrendCard title="Free Cash Flow" data={result.multiTrends.freeCashFlow} tickers={multiTickers} />
                  <MultiTrendCard title="SG&A Expense" data={result.multiTrends.sgaExpense} tickers={multiTickers} />
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <TrendCard title="Revenue" data={result.trends.revenue} labelA={tA} labelB={tB} />
                  <TrendCard title="Operating Margin" data={result.trends.operatingMargin} labelA={tA} labelB={tB} isPercent />
                  <TrendCard title="Gross Margin" data={result.trends.grossMargin} labelA={tA} labelB={tB} isPercent />
                  <TrendCard title="Net Margin" data={result.trends.netMargin} labelA={tA} labelB={tB} isPercent />
                  <TrendCard title="Free Cash Flow" data={result.trends.freeCashFlow} labelA={tA} labelB={tB} />
                  <TrendCard title="SG&A Expense" data={result.trends.sgaExpense} labelA={tA} labelB={tB} />
                </div>
              )}

              {!isMulti && viewMode === "detailed" ? <BoardScorecard result={result} /> : null}
              <Card title="Data Quality & Adjustments Applied" sub="What is missing | what was inferred | what may distort conclusions">
                <div className="flex items-start gap-2">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <ArrowBullets items={viewMode === "summary" ? n.dataQuality.slice(0, 3) : n.dataQuality} />
                </div>
              </Card>
            </section>
          </ModuleCard>
        )
      ) : null}

      {!printMode && showFullFinancialTable ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Full financial comparison table</p>
              <button
                type="button"
                onClick={() => setShowFullFinancialTable(false)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            {isMulti && rowsBySectionMulti ? (
              <MultiFinancialsTable rowsBySection={rowsBySectionMulti} tickers={multiTickers} />
            ) : (
              <FinancialsTable rowsBySection={rowsBySection} result={result} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
