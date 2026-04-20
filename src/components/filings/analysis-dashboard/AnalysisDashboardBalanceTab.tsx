"use client";

import type { BalanceSheet, DebtStructure, Ratios } from "@/types/analysis";
import type { BSItem } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { COLORS, fmt, fmtPct, fmtX, PIE_PALETTE, tooltipStyle } from "./analysisDashboardConstants";
import { Section, MetricTable, RatioCard } from "./analysisDashboardPrimitives";
import { ChartFrame } from "./analysisDashboardCharts";

export function AnalysisDashboardBalanceTab({
  bs,
  debt,
  cfItems,
  ratios,
  onMetricTableRowClick,
}: {
  bs: BalanceSheet;
  debt: DebtStructure;
  cfItems: BSItem[];
  ratios: Ratios;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const capitalPie = [
    { name: "Equity", value: Math.abs(bs.totalEquity) },
    { name: "LT Debt", value: debt.longTermDebt },
    { name: "ST Debt", value: debt.shortTermDebt },
  ].filter((d) => d.value > 0);

  const topBs = [...bs.items]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10)
    .map((i) => ({
      name: i.label.length > 20 ? `${i.label.slice(0, 20)}...` : i.label,
      value: Math.abs(i.value),
    }));

  const ar =
    cfItems.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
    bs.items.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
    null;
  const inv =
    cfItems.find((i) => i.tag === "InventoryNet")?.value ?? bs.items.find((i) => i.tag === "InventoryNet")?.value ?? null;
  const ap =
    cfItems.find((i) => i.tag === "AccountsPayableCurrent")?.value ??
    bs.items.find((i) => i.tag === "AccountsPayableCurrent")?.value ??
    null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Balance Sheet Summary">
          <MetricTable
            onRowClick={onMetricTableRowClick}
            rows={[
              { label: "Total Assets", value: fmt(bs.totalAssets), bold: true, traceable: true },
              { label: "Current Assets", value: fmt(bs.items.find((i) => i.tag === "AssetsCurrent")?.value ?? null), traceable: true },
              { label: "PP&E (Net)", value: fmt(bs.items.find((i) => i.tag === "PropertyPlantAndEquipmentNet")?.value ?? null), traceable: true },
              { label: "Goodwill", value: fmt(bs.items.find((i) => i.tag === "Goodwill")?.value ?? null), traceable: true },
              { label: "Total Liabilities", value: fmt(bs.totalLiabilities), bold: true, traceable: true },
              { label: "Current Liabilities", value: fmt(bs.items.find((i) => i.tag === "LiabilitiesCurrent")?.value ?? null), traceable: true },
              { label: "Total Equity", value: fmt(bs.totalEquity), bold: true, traceable: true },
              { label: "Retained Earnings", value: fmt(bs.retainedEarnings), traceable: true },
            ]}
          />
        </Section>

        {capitalPie.length > 0 && (
          <Section title="Capital Structure">
            <ChartFrame>
              <PieChart>
                <Pie
                  data={capitalPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {capitalPie.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartFrame>
          </Section>
        )}
      </div>

      <Section title="Debt Structure">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RatioCard label="Short-Term Debt" value={fmt(debt.shortTermDebt)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Short-Term Debt") : undefined} />
          <RatioCard label="Long-Term Debt" value={fmt(debt.longTermDebt)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Long-Term Debt") : undefined} />
          <RatioCard label="Total Debt" value={fmt(debt.totalDebt)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Total Debt") : undefined} />
          <RatioCard label="Net Debt" value={fmt(debt.netDebt)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Net Debt") : undefined} />
        </div>
      </Section>

      <Section title="Working Capital">
        <div className="grid gap-4 lg:grid-cols-2">
          <MetricTable
            onRowClick={onMetricTableRowClick}
            rows={[
              { label: "Accounts Receivable", value: fmt(ar), traceable: true },
              { label: "Inventories", value: fmt(inv), traceable: true },
              { label: "Accounts Payable", value: fmt(ap), traceable: true },
              { label: "Working Capital", value: fmt(ratios.workingCapital), bold: true, traceable: true },
              { label: "Current Ratio", value: fmtX(ratios.currentRatio), traceable: true },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <RatioCard label="Asset Turnover" value={fmtX(ratios.assetTurnover)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Asset Turnover") : undefined} />
            <RatioCard label="Inventory Turn." value={fmtX(ratios.inventoryTurnover)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Inventory Turn.") : undefined} />
            <RatioCard label="Receivables Turn." value={fmtX(ratios.receivablesTurnover)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Receivables Turn.") : undefined} />
            <RatioCard label="WC / Revenue" value={fmtPct(ratios.workingCapitalRatio)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Working Capital") : undefined} />
          </div>
        </div>
      </Section>

      {topBs.length > 0 && (
        <Section title="Largest Balance Sheet Items">
          <ChartFrame>
            <BarChart data={topBs} layout="vertical" margin={{ left: 4, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartFrame>
        </Section>
      )}
    </div>
  );
}
