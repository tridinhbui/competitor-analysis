"use client";

import { Fragment, type ReactNode } from "react";
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
  Printer,
  RotateCcw,
} from "lucide-react";
import type {
  CompanyComparisonPayload,
  ComparisonRow,
  ComparisonSection,
  MetricFormat,
} from "@/lib/companyComparison";

export type CompareTab = "overview" | "margin-gaps" | "financials" | "trends";

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

function buildRowsBySection(result: CompanyComparisonPayload) {
  const map = new Map<ComparisonSection, ComparisonRow[]>();
  for (const section of SECTION_ORDER) {
    map.set(section, result.rows.filter((row) => row.section === section));
  }
  return map;
}

function buildExportParams(result: CompanyComparisonPayload) {
  const params = new URLSearchParams({
    companyA: result.companyA.ticker,
    companyB: result.companyB.ticker,
    periodEndA: result.companyA.periodEnd,
    periodEndB: result.companyB.periodEnd,
  });

  return params.toString();
}

export function buildComparisonExportHref(result: CompanyComparisonPayload): string {
  return `/export/company-comparison?${buildExportParams(result)}`;
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
    <div className="comparison-card rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {sub ? <p className="mb-3 mt-0.5 text-[11px] text-slate-400">{sub}</p> : <div className="mb-3" />}
      {children}
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

  return (
    <Card title={title}>
      {periodWarning ? (
        <div className="mb-2 flex justify-end">
          <PillBadge label="Period mismatch" color="amber" />
        </div>
      ) : null}
      <div className="comparison-chart h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
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
      <div className="comparison-chart h-72">
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

  return (
    <Card title={title}>
      <div className="comparison-chart h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 4, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="quarterLabel" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
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
}: {
  rowsBySection: Map<ComparisonSection, ComparisonRow[]>;
  result: CompanyComparisonPayload;
}) {
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
                {rows.map((row) => (
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

  const showOverview = printMode || activeTab === "overview";
  const showMarginGaps = printMode || activeTab === "margin-gaps";
  const showFinancials = printMode || activeTab === "financials";
  const showTrends = printMode || activeTab === "trends";

  return (
    <div className={printMode ? "comparison-print-root space-y-6" : "space-y-4"}>
      <div className="comparison-card rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-subtle">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-900">{result.companyA.companyName}.</span>
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-sm font-bold text-white">{tA}</span>
              <span className="text-sm text-slate-400">vs</span>
              <span className="text-lg font-bold text-slate-900">{result.companyB.companyName}.</span>
              <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">{tB}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {result.companyA.quarterLabel} | Period ending {result.companyA.periodEnd}
              {printMode ? ` | Generated ${generatedLabel}` : ""}
            </p>
          </div>

          {printMode ? null : (
            <div className="flex items-center gap-2">
              {exportHref ? (
                <a
                  href={exportHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <Printer className="h-3 w-3" />
                  Export PDF
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
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-slate-900" />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {result.warnings.length > 0 ? (
        <div className="comparison-card rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Warnings</p>
          <ul className="space-y-1 text-xs text-amber-800">
            {result.warnings.map((warning) => (
              <li key={warning.code} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showOverview ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Overview" /> : null}

          <Card title="Executive Summary" sub="[Insight] -> [Cause] -> [Implication]">
            <PlainBullets items={n.executiveSummary} />
          </Card>

          <Card title="True Performance Diagnosis" sub="Reported vs adjusted - separating real from accounting-driven performance">
            <ArrowBullets items={n.truePerformanceDiagnosis} accent />
            {result.methodologyComparison.companyAVariants.length > 0 ||
            result.methodologyComparison.companyBVariants.length > 0 ? (
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
          </Card>

          <Card title="Investment Interpretation" sub="Outperformance signal | Hidden risk | Misleading metric warnings | FCF signal">
            <div className="space-y-2">
              {n.investmentInterpretation.map((item, index) => {
                const label = index === 0 ? "Lead" : index === 1 ? "Risk" : index === 2 ? "Alert" : "Signal";
                const tone =
                  index === 0
                    ? "border-slate-200 bg-slate-50"
                    : index === 1
                      ? "border-amber-100 bg-amber-50/60"
                      : index === 2
                        ? "border-red-100 bg-red-50/50"
                        : "border-blue-100 bg-blue-50/40";

                return (
                  <div key={`${label}-${index}`} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${tone}`}>
                    <span className="mt-0.5 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {label}
                    </span>
                    <p className="text-xs leading-relaxed text-slate-700">{item}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {result.relativePerformance.length > 0 ? (
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
      ) : null}

      {showMarginGaps ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Margin Gaps" /> : null}

          <Card title="Margin Gap Decomposition" sub="Total gap attributed to: COGS | SG&A | Allocation distortion | Scale">
            <ArrowBullets items={n.marginGapDecomposition} accent />
          </Card>

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
                          {gapPositive ? `${tA} leads - cost or pricing advantage` : gapNegative ? `${tB} leads - investigate driver` : "Comparable"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Cost Structure & Allocation Bridge" sub="Revenue -> COGS -> SG&A -> Corp Alloc -> True Operating Profit">
            <ArrowBullets items={n.costStructureBridge} />
          </Card>

          {result.segmentComparison.length > 0 ? (
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
      ) : null}

      {showFinancials ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Financials" /> : null}

          <Card title="Capital Allocation & Strategy" sub="CapEx intensity | M&A signals | Buybacks | Debt posture consequences">
            <ArrowBullets items={n.capitalAllocationStory} />
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <BarCard title="Revenue, EBITDA, Net Income, FCF" data={result.charts.financialBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
            <BarCard title="Gross / Op / Net Margin" data={result.charts.marginBars} labelA={tA} labelB={tB} isPercent periodWarning={hasPeriodWarn} />
            <BarCard title="Revenue, Gross Profit, SG&A, Op. Income" data={driverChartData} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
            <BarCard title="OpCF, CapEx, Free Cash Flow" data={result.charts.cashFlowBars} labelA={tA} labelB={tB} periodWarning={hasPeriodWarn} />
          </div>

          <BoardScorecard result={result} />
          <FinancialsTable rowsBySection={rowsBySection} result={result} />
        </section>
      ) : null}

      {showTrends ? (
        <section className="comparison-report-section space-y-4">
          {printMode ? <PrintSectionTitle title="Trends" /> : null}

          <Card title="What Changed (Period-over-Period)" sub="Inflection points | margin changes | cost spikes | revenue trajectory">
            <ArrowBullets items={n.whatChanged} accent />
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendCard title="Revenue Trend" data={result.trends.revenue} labelA={tA} labelB={tB} />
            <TrendCard title="Operating Margin Trend" data={result.trends.operatingMargin} labelA={tA} labelB={tB} isPercent />
            <TrendCard title="Gross Margin Trend" data={result.trends.grossMargin} labelA={tA} labelB={tB} isPercent />
            <TrendCard title="Net Margin Trend" data={result.trends.netMargin} labelA={tA} labelB={tB} isPercent />
            <TrendCard title="Free Cash Flow Trend" data={result.trends.freeCashFlow} labelA={tA} labelB={tB} />
            <TrendCard title="SG&A Expense Trend" data={result.trends.sgaExpense} labelA={tA} labelB={tB} />
          </div>

          <Card title="Data Quality & Adjustments Applied" sub="What is missing | what was inferred | what may distort conclusions">
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <ArrowBullets items={n.dataQuality} />
            </div>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
