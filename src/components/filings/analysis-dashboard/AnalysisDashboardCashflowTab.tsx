"use client";

import type { BSItem, CashFlowData, DividendAnalysis, Ratios } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { COLORS, fmt, fmtPct, tooltipStyle } from "./analysisDashboardConstants";
import { Section, MetricTable, RatioCard } from "./analysisDashboardPrimitives";
import { ChartFrame } from "./analysisDashboardCharts";

export function AnalysisDashboardCashflowTab({
  cf,
  cfItems,
  div,
  ratios,
  onMetricTableRowClick,
}: {
  cf: CashFlowData;
  cfItems: BSItem[];
  div: DividendAnalysis;
  ratios: Ratios;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const cfBridge = [
    { name: "OCF", amt: cf.operatingCashFlow ?? 0 },
    { name: "CapEx", amt: -(cf.capitalExpenditures ?? 0) },
    { name: "FCF", amt: cf.freeCashFlow ?? 0 },
    { name: "Dividends", amt: -(cf.dividendsPaid ?? 0) },
    { name: "Net Income", amt: cf.netIncome ?? 0 },
  ];

  const buyback = cf.shareRepurchases ?? cfItems.find((i) => i.tag === "PaymentsForRepurchaseOfCommonStock")?.value ?? null;
  const debtIssuance = cfItems.find((i) => i.tag === "ProceedsFromIssuanceOfLongTermDebt")?.value ?? null;
  const debtRepay =
    cfItems.find((i) => i.tag === "RepaymentsOfLongTermDebt")?.value ??
    cfItems.find((i) => i.tag === "RepaymentsOfDebt")?.value ??
    cfItems.find((i) => i.tag === "RepaymentsOfShortTermDebt")?.value ??
    cfItems.find((i) => i.tag === "RepaymentsOfCommercialPaper")?.value ??
    null;
  let finCF = cf.financingCashFlow ?? cfItems.find((i) => i.tag === "NetCashProvidedByFinancingActivities")?.value ?? null;
  if (finCF == null) {
    let derivedFin = 0;
    let hasDerivedFinPart = false;
    if (debtIssuance != null) {
      derivedFin += Math.abs(debtIssuance);
      hasDerivedFinPart = true;
    }
    if (debtRepay != null) {
      derivedFin -= Math.abs(debtRepay);
      hasDerivedFinPart = true;
    }
    if (cf.dividendsPaid != null) {
      derivedFin -= Math.abs(cf.dividendsPaid);
      hasDerivedFinPart = true;
    }
    if (buyback != null) {
      derivedFin -= Math.abs(buyback);
      hasDerivedFinPart = true;
    }
    finCF = hasDerivedFinPart ? Math.round(derivedFin) : null;
  }
  const invCF = cf.investingCashFlow ?? cfItems.find((i) => i.tag === "NetCashProvidedByInvestingActivities")?.value ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <RatioCard label="Operating CF" value={fmt(cf.operatingCashFlow)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Operating CF") : undefined} />
        <RatioCard label="CapEx" value={cf.capitalExpenditures != null ? fmt(-Math.abs(cf.capitalExpenditures)) : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Capital Expenditures") : undefined} />
        <RatioCard label="Free Cash Flow" value={fmt(cf.freeCashFlow)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Free Cash Flow") : undefined} />
        <RatioCard label="Dividends Paid" value={cf.dividendsPaid != null ? fmt(-Math.abs(cf.dividendsPaid)) : "—"} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("Dividends Paid") : undefined} />
        <RatioCard label="FCF Conversion" value={fmtPct(ratios.fcfConversion)} traceable={!!onMetricTableRowClick} onClick={onMetricTableRowClick ? () => onMetricTableRowClick("FCF Conversion") : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Cash Flow Bridge ($M)">
          <ChartFrame>
            <BarChart data={cfBridge}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
              <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                {cfBridge.map((d, i) => (
                  <Cell key={i} fill={d.amt >= 0 ? COLORS.emerald : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
        </Section>

        <Section title="Cash Flow Statement">
          <MetricTable
            onRowClick={onMetricTableRowClick}
            rows={[
              { label: "Operating Cash Flow", value: fmt(cf.operatingCashFlow), bold: true, traceable: true },
              { label: "Capital Expenditures", value: fmt(cf.capitalExpenditures != null ? -Math.abs(cf.capitalExpenditures) : null), dim: true, traceable: true },
              { label: "Free Cash Flow", value: fmt(cf.freeCashFlow), bold: true, traceable: true },
              { label: "Dividends Paid", value: fmt(cf.dividendsPaid != null ? -Math.abs(cf.dividendsPaid) : null), dim: true, traceable: true },
              { label: "Share Repurchases", value: fmt(buyback != null ? -Math.abs(buyback) : null), dim: true, traceable: true },
              { label: "Investing Cash Flow", value: fmt(invCF), traceable: true },
              { label: "LT Debt Issuance", value: fmt(debtIssuance), dim: true, traceable: true },
              { label: "LT Debt Repayments", value: fmt(debtRepay != null ? -Math.abs(debtRepay) : null), dim: true, traceable: true },
              { label: "Financing Cash Flow", value: fmt(finCF), traceable: true },
            ]}
          />
        </Section>
      </div>

      <Section title="Dividend Assessment">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RatioCard label="Verdict" value={div.verdict.toUpperCase()} />
          <RatioCard label="Payout (NI)" value={fmtPct(div.payoutRatioNI)} />
          <RatioCard label="Payout (FCF)" value={fmtPct(div.payoutRatioFCF)} />
          <RatioCard label="FCF Coverage" value={div.fcfCoverageYears != null ? `${div.fcfCoverageYears}x` : "—"} />
        </div>
      </Section>
    </div>
  );
}
