"use client";

import type { IncomeStatement } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { COLORS, fmt, tooltipStyle } from "./analysisDashboardConstants";
import { Section, IncomeStatementTable, MetricTable, RatioCard } from "./analysisDashboardPrimitives";
import { ChartFrame } from "./analysisDashboardCharts";

export function AnalysisDashboardIncomeTab({
  inc,
  onMetricTableRowClick,
}: {
  inc: IncomeStatement;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const bridgeData = [
    { name: "Revenue", amt: inc.revenue ?? 0 },
    { name: "COGS", amt: -(inc.costOfRevenue ?? 0) },
    { name: "Gross Profit", amt: inc.grossProfit ?? 0 },
    { name: "SG&A", amt: -(inc.sgaExpense ?? 0) },
    { name: "OP Income", amt: inc.operatingIncome ?? 0 },
    { name: "EBITDA", amt: inc.ebitda ?? 0 },
    { name: "Net Income", amt: inc.netIncome ?? 0 },
  ];

  const marginData = [
    { name: "Gross", value: inc.grossMargin ?? 0 },
    { name: "Operating", value: inc.operatingMargin ?? 0 },
    { name: "EBITDA", value: inc.ebitdaMargin ?? 0 },
    { name: "Net", value: inc.netMargin ?? 0 },
  ].filter((d) => d.value !== 0);

  return (
    <div className="space-y-4">
      <Section title="Income Statement">
        <IncomeStatementTable inc={inc} onRowClick={onMetricTableRowClick} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Profit Waterfall ($M)">
          <ChartFrame>
            <BarChart data={bridgeData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
              <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                {bridgeData.map((d, i) => (
                  <Cell key={i} fill={d.amt >= 0 ? COLORS.blue : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
        </Section>

        <Section title="Margin Profile (%)">
          <ChartFrame>
            <BarChart data={marginData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, "auto"]} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartFrame>
        </Section>
      </div>

      <Section title="Operating Expense Breakdown">
        <MetricTable
          onRowClick={onMetricTableRowClick}
          rows={[
            {
              label: "SG&A Expense",
              value: fmt(inc.sgaExpense),
              sub:
                inc.revenue && inc.sgaExpense ? `${((inc.sgaExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined,
              traceable: true,
            },
            {
              label: "R&D Expense",
              value: fmt(inc.rdExpense),
              sub: inc.revenue && inc.rdExpense ? `${((inc.rdExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined,
              traceable: true,
            },
            { label: "Depreciation", value: fmt(inc.depreciation), traceable: true },
            { label: "Amortization", value: fmt(inc.amortization), traceable: true },
            {
              label: "D&A Total",
              value: fmt(inc.depreciation != null || inc.amortization != null ? (inc.depreciation ?? 0) + (inc.amortization ?? 0) : null),
              bold: true,
              traceable: true,
            },
            { label: "Interest Expense", value: fmt(inc.interestExpense), traceable: true },
            { label: "Income Tax", value: fmt(inc.incomeTax), traceable: true },
          ]}
        />
      </Section>

      {(inc.epsBasic != null || inc.epsDiluted != null) && (
        <Section title="Earnings Per Share">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RatioCard
              label="EPS (Basic)"
              value={inc.epsBasic != null ? `$${inc.epsBasic.toFixed(2)}` : "—"}
              traceable={!!onMetricTableRowClick}
              onClick={onMetricTableRowClick ? () => onMetricTableRowClick("EPS (Basic)") : undefined}
            />
            <RatioCard
              label="EPS (Diluted)"
              value={inc.epsDiluted != null ? `$${inc.epsDiluted.toFixed(2)}` : "—"}
              traceable={!!onMetricTableRowClick}
              onClick={onMetricTableRowClick ? () => onMetricTableRowClick("EPS (Diluted)") : undefined}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
