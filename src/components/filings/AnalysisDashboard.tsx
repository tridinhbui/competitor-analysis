"use client";

import { useMemo, useState } from "react";
import type { FullAnalysis, BSItem, IncomeStatement } from "@/types/analysis";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  CheckCircle2, XCircle, Download, AlertCircle,
  TrendingUp, TrendingDown, ShieldCheck, ShieldAlert,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus, Info,
} from "lucide-react";

interface Props { result: FullAnalysis; onExport?: () => void; }

const COLORS = {
  primary: "#4f46e5", blue: "#3b82f6", emerald: "#10b981",
  amber: "#f59e0b", red: "#ef4444", slate: "#94a3b8",
  purple: "#8b5cf6", cyan: "#06b6d4",
};
const PIE_PALETTE = [COLORS.primary, COLORS.blue, COLORS.emerald, COLORS.amber, COLORS.purple, COLORS.cyan];

const fmt = (v: number | null | undefined, prefix = "$", suffix = "M"): string =>
  v != null ? `${prefix}${v.toLocaleString()}${suffix}` : "—";
const fmtPct = (v: number | null | undefined): string => v != null ? `${v.toFixed(1)}%` : "—";
const fmtX = (v: number | null | undefined): string => v != null ? `${v.toFixed(2)}x` : "—";
const fmtNum = (v: number | null | undefined): string => v != null ? v.toLocaleString() : "—";

const tooltipStyle = {
  borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12,
  background: "#fff", color: "#1e293b", boxShadow: "0 4px 12px rgb(0 0 0/0.08)",
};

/* ──────────────────── Tabs ──────────────────── */

type TabId = "summary" | "income" | "balance" | "cashflow" | "deep-dive";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Executive Summary" },
  { id: "income", label: "Income & Margins" },
  { id: "balance", label: "Balance Sheet" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "deep-dive", label: "Deep Dive" },
];

/* ──────────────────── Main Component ──────────────────── */

export function AnalysisDashboard({ result, onExport }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, dividendAnalysis: div, incomeStatement: inc, validation, meta, reconcile } = result;
  const cfItems = result.cfItems ?? [];

  const verdictColor = {
    strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
    adequate: "text-blue-700 bg-blue-50 border-blue-200",
    stretched: "text-amber-700 bg-amber-50 border-amber-200",
    unknown: "text-slate-500 bg-slate-50 border-slate-200",
  }[div.verdict];

  // Detect missing critical data
  const missingFields: string[] = [];
  if (!inc.revenue) missingFields.push("Revenue");
  if (!inc.grossProfit) missingFields.push("Gross Profit");
  if (!inc.operatingIncome) missingFields.push("Operating Income");
  if (!inc.netIncome) missingFields.push("Net Income");
  if (!bs.totalAssets) missingFields.push("Total Assets");
  if (!bs.totalEquity) missingFields.push("Total Equity");
  if (!cf.operatingCashFlow) missingFields.push("Operating Cash Flow");
  const hasMissingData = missingFields.length > 0;

  return (
    <div className="flex flex-col gap-0 text-slate-800">
      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {meta.companyName ?? meta.fileName ?? "Financial Analysis"}
            </h2>
            {meta.ticker && (
              <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                {meta.ticker}
              </span>
            )}
            {meta.periodEnd && (
              <span className="text-xs text-slate-400">
                {meta.periodEnd}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{meta.source === "sec" ? "SEC EDGAR XBRL" : `PDF${meta.pagesRead ? ` (${meta.pagesRead}p)` : ""}`}</span>
            {meta.extractionMethod && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">{
                  meta.extractionMethod === "pdf-ai-section-split" ? "Section-based AI" :
                  meta.extractionMethod === "pdf-vision" ? "Vision API" :
                  meta.extractionMethod === "pdf-ai" ? "AI extraction" :
                  meta.extractionMethod === "pdf-heuristic" ? "Pattern matching" :
                  "Extraction"
                }</span>
              </>
            )}
            {meta.confidence && (
              <>
                <span className="text-slate-300">•</span>
                <span className={cn(
                  "font-semibold uppercase",
                  meta.confidence === "high" ? "text-emerald-600" : meta.confidence === "medium" ? "text-amber-600" : "text-slate-500"
                )}>
                  {meta.confidence} confidence
                </span>
              </>
            )}
          </div>
        </div>
        {onExport && (
          <button onClick={onExport} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
            <Download className="h-3.5 w-3.5" />
            Export XLSX
          </button>
        )}
      </header>

      {/* ═══ KPI STRIP ═══ */}
      <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-6">
        <KpiCell label="Revenue" value={fmt(inc.revenue)} />
        <KpiCell label="Gross Margin" value={fmtPct(inc.grossMargin)} highlight={inc.grossMargin} />
        <KpiCell label="OP Margin" value={fmtPct(inc.operatingMargin)} highlight={inc.operatingMargin} />
        <KpiCell label="EBITDA" value={fmt(inc.ebitda)} />
        <KpiCell label="Net Income" value={fmt(inc.netIncome)} highlight={inc.netIncome} />
        <KpiCell label="FCF" value={fmt(cf.freeCashFlow)} highlight={cf.freeCashFlow} />
      </div>

      {/* ═══ TAB BAR ═══ */}
      <nav className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "border-b-2 px-3 py-2 text-xs font-semibold transition sm:px-4",
              activeTab === id
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ═══ TAB CONTENT ═══ */}
      <div className="min-h-[320px]">

        {/* ─── EXECUTIVE SUMMARY ─── */}
        {activeTab === "summary" && (
          <div className="space-y-4">
            {/* Verdict */}
            <div className={cn("flex items-start gap-3 rounded-xl border p-4", verdictColor)}>
              {div.verdict === "strong" || div.verdict === "adequate"
                ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />}
              <div>
                <p className="text-sm font-bold">{div.headline}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {div.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed opacity-90">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 opacity-50" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Missing Data Alert */}
            {hasMissingData && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Incomplete data extraction</p>
                  <p className="mt-0.5 text-xs text-amber-800">
                    Missing: {missingFields.join(", ")}. Try uploading a clearer PDF or manually enter values in the Data Source.
                  </p>
                </div>
              </div>
            )}

            {/* Extraction Method Info (for PDF) */}
            {meta.source === "pdf" && meta.extractionMethod && (
              <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div className="text-blue-800">
                  <span className="font-semibold">Extraction method:</span>{" "}
                  {meta.extractionMethod === "pdf-ai-section-split"
                    ? "Section-based AI extraction for improved coverage"
                    : meta.extractionMethod === "pdf-vision"
                    ? "OpenAI Vision API for table extraction"
                    : meta.extractionMethod === "pdf-ai"
                    ? "AI-powered text analysis"
                    : "Pattern matching heuristics"}
                </div>
              </div>
            )}

            {/* Financial Overview Table */}
            <Section title="Financial Overview">
              <div className="grid gap-4 lg:grid-cols-2">
                <MetricTable rows={[
                  { label: "Revenue", value: fmt(inc.revenue) },
                  { label: "Cost of Revenue", value: fmt(inc.costOfRevenue), dim: true },
                  { label: "Gross Profit", value: fmt(inc.grossProfit), bold: true, sub: fmtPct(inc.grossMargin) },
                  { label: "SG&A Expense", value: fmt(inc.sgaExpense), dim: true },
                  { label: "R&D Expense", value: fmt(inc.rdExpense), dim: true },
                  { label: "Operating Income", value: fmt(inc.operatingIncome), bold: true, sub: fmtPct(inc.operatingMargin) },
                  { label: "EBITDA", value: fmt(inc.ebitda), bold: true, sub: fmtPct(inc.ebitdaMargin) },
                  { label: "Net Income", value: fmt(inc.netIncome), bold: true, sub: fmtPct(inc.netMargin) },
                ]} />
                <MetricTable rows={[
                  { label: "Total Assets", value: fmt(bs.totalAssets) },
                  { label: "Total Equity", value: fmt(bs.totalEquity) },
                  { label: "Total Debt", value: fmt(debt.totalDebt) },
                  { label: "Net Debt", value: fmt(debt.netDebt), bold: true },
                  { label: "Cash & Equivalents", value: fmt(bs.cashAndEquivalents) },
                  { label: "Operating CF", value: fmt(cf.operatingCashFlow) },
                  { label: "Capital Expenditures", value: fmt(cf.capitalExpenditures) },
                  { label: "Free Cash Flow", value: fmt(cf.freeCashFlow), bold: true },
                ]} />
              </div>
            </Section>

            {/* Earnings Narrative (if available) */}
            {result.earningsNarrative && (
              <Section title="Earnings Insights">
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("rounded px-2 py-1 text-xs font-bold",
                        result.earningsNarrative.result.includes("Beat") ? "bg-emerald-100 text-emerald-700" :
                        result.earningsNarrative.result.includes("Missed") ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {result.earningsNarrative.result}
                      </span>
                      <span className={cn("rounded px-2 py-1 text-xs font-semibold",
                        result.earningsNarrative.tone === "bullish" ? "bg-emerald-100 text-emerald-700" :
                        result.earningsNarrative.tone === "cautious" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {result.earningsNarrative.tone.charAt(0).toUpperCase() + result.earningsNarrative.tone.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 mb-2">{result.earningsNarrative.summary}</p>
                    {(result.earningsNarrative.priorGuidance || result.earningsNarrative.currentGuidance) && (
                      <div className="mt-2 flex gap-4 text-xs text-slate-600">
                        {result.earningsNarrative.priorGuidance && (
                          <div><span className="font-semibold">Prior Guidance:</span> {result.earningsNarrative.priorGuidance}</div>
                        )}
                        {result.earningsNarrative.currentGuidance && (
                          <div><span className="font-semibold">Current Guidance:</span> {result.earningsNarrative.currentGuidance}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {result.earningsNarrative.keyThemes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2 uppercase">Key Themes</p>
                      <ul className="space-y-1">
                        {result.earningsNarrative.keyThemes.map((theme, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="text-primary font-bold">•</span>
                            <span>{theme}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Key Ratios Grid */}
            <Section title="Key Ratios">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <RatioCard label="Gross Margin" value={fmtPct(ratios.grossMargin)} />
                <RatioCard label="Operating Margin" value={fmtPct(ratios.operatingMargin)} />
                <RatioCard label="EBITDA Margin" value={fmtPct(ratios.ebitdaMargin)} />
                <RatioCard label="Net Margin" value={fmtPct(ratios.netMargin)} />
                <RatioCard label="ROE" value={fmtPct(ratios.returnOnEquity)} />
                <RatioCard label="ROA" value={fmtPct(ratios.returnOnAssets)} />
                <RatioCard label="ROIC" value={fmtPct(ratios.returnOnInvestedCapital)} />
                <RatioCard label="D/E Ratio" value={fmtX(ratios.debtToEquity)} />
                <RatioCard label="ND/EBITDA" value={fmtX(ratios.netDebtToEbitda)} />
                <RatioCard label="Interest Cov." value={fmtX(ratios.interestCoverage)} />
                <RatioCard label="Current Ratio" value={fmtX(ratios.currentRatio)} />
                <RatioCard label="FCF Yield" value={fmtPct(ratios.fcfYield)} />
              </div>
            </Section>

            {/* Segments if available */}
            {result.segments && result.segments.length > 0 && (
              <Section title="Segment Breakdown">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">Segment</th>
                        <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                        <th className="px-3 py-2 text-right font-semibold">OP Income</th>
                        <th className="px-3 py-2 text-right font-semibold">OP Margin</th>
                        <th className="px-3 py-2 text-right font-semibold">Volume</th>
                        <th className="px-3 py-2 text-right font-semibold">Rev/Unit</th>
                        <th className="px-3 py-2 text-right font-semibold">OP/Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.segments.map((seg, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-3 py-2 font-medium">{seg.segmentName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(seg.revenue)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(seg.operatingIncome)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", (seg.operatingMargin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500")}>
                            {fmtPct(seg.operatingMargin)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.volumeUnits != null ? `${fmtNum(seg.volumeUnits)} ${seg.volumeUnitType ?? ""}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.revenuePerUnit != null ? `$${seg.revenuePerUnit.toFixed(0)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                            {seg.operatingIncomePerUnit != null ? `$${seg.operatingIncomePerUnit.toFixed(0)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ─── INCOME & MARGINS ─── */}
        {activeTab === "income" && (() => {
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
          ].filter(d => d.value !== 0);

          return (
            <div className="space-y-4">
              {/* Income Statement Table */}
              <Section title="Income Statement">
                <IncomeStatementTable inc={inc} />
              </Section>

              {/* Charts */}
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title="Profit Waterfall ($M)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
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
                    </ResponsiveContainer>
                  </div>
                </Section>

                <Section title="Margin Profile (%)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={marginData} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                        <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              </div>

              {/* SG&A / R&D / D&A Breakdown */}
              <Section title="Operating Expense Breakdown">
                <MetricTable rows={[
                  { label: "SG&A Expense", value: fmt(inc.sgaExpense), sub: inc.revenue && inc.sgaExpense ? `${((inc.sgaExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined },
                  { label: "R&D Expense", value: fmt(inc.rdExpense), sub: inc.revenue && inc.rdExpense ? `${((inc.rdExpense / inc.revenue) * 100).toFixed(1)}% of revenue` : undefined },
                  { label: "Depreciation", value: fmt(inc.depreciation) },
                  { label: "Amortization", value: fmt(inc.amortization) },
                  { label: "D&A Total", value: fmt(inc.depreciation != null || inc.amortization != null ? (inc.depreciation ?? 0) + (inc.amortization ?? 0) : null), bold: true },
                  { label: "Interest Expense", value: fmt(inc.interestExpense) },
                  { label: "Income Tax", value: fmt(inc.incomeTax) },
                ]} />
              </Section>

              {/* EPS */}
              {(inc.epsBasic != null || inc.epsDiluted != null) && (
                <Section title="Earnings Per Share">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <RatioCard label="EPS (Basic)" value={inc.epsBasic != null ? `$${inc.epsBasic.toFixed(2)}` : "—"} />
                    <RatioCard label="EPS (Diluted)" value={inc.epsDiluted != null ? `$${inc.epsDiluted.toFixed(2)}` : "—"} />
                  </div>
                </Section>
              )}
            </div>
          );
        })()}

        {/* ─── BALANCE SHEET ─── */}
        {activeTab === "balance" && (() => {
          const capitalPie = [
            { name: "Equity", value: Math.abs(bs.totalEquity) },
            { name: "LT Debt", value: debt.longTermDebt },
            { name: "ST Debt", value: debt.shortTermDebt },
          ].filter(d => d.value > 0);

          const topBs = [...bs.items]
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 10)
            .map(i => ({ name: i.label.length > 20 ? `${i.label.slice(0, 20)}...` : i.label, value: Math.abs(i.value) }));

          const ar = cfItems.find(i => i.tag === "AccountsReceivableNetCurrent")?.value ?? bs.items.find(i => i.tag === "AccountsReceivableNetCurrent")?.value ?? null;
          const inv = cfItems.find(i => i.tag === "InventoryNet")?.value ?? bs.items.find(i => i.tag === "InventoryNet")?.value ?? null;
          const ap = cfItems.find(i => i.tag === "AccountsPayableCurrent")?.value ?? bs.items.find(i => i.tag === "AccountsPayableCurrent")?.value ?? null;

          return (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Key Balance Sheet Metrics */}
                <Section title="Balance Sheet Summary">
                  <MetricTable rows={[
                    { label: "Total Assets", value: fmt(bs.totalAssets), bold: true },
                    { label: "Current Assets", value: fmt(bs.items.find(i => i.tag === "AssetsCurrent")?.value ?? null) },
                    { label: "PP&E (Net)", value: fmt(bs.items.find(i => i.tag === "PropertyPlantAndEquipmentNet")?.value ?? null) },
                    { label: "Goodwill", value: fmt(bs.items.find(i => i.tag === "Goodwill")?.value ?? null) },
                    { label: "Total Liabilities", value: fmt(bs.totalLiabilities), bold: true },
                    { label: "Current Liabilities", value: fmt(bs.items.find(i => i.tag === "LiabilitiesCurrent")?.value ?? null) },
                    { label: "Total Equity", value: fmt(bs.totalEquity), bold: true },
                    { label: "Retained Earnings", value: fmt(bs.retainedEarnings) },
                  ]} />
                </Section>

                {/* Capital Structure Pie */}
                {capitalPie.length > 0 && (
                  <Section title="Capital Structure">
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={capitalPie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value"
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                            {capitalPie.map((_, i) => <Cell key={i} fill={PIE_PALETTE[i]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Section>
                )}
              </div>

              {/* Debt Structure */}
              <Section title="Debt Structure">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <RatioCard label="Short-Term Debt" value={fmt(debt.shortTermDebt)} />
                  <RatioCard label="Long-Term Debt" value={fmt(debt.longTermDebt)} />
                  <RatioCard label="Total Debt" value={fmt(debt.totalDebt)} />
                  <RatioCard label="Net Debt" value={fmt(debt.netDebt)} />
                </div>
              </Section>

              {/* Working Capital */}
              <Section title="Working Capital">
                <div className="grid gap-4 lg:grid-cols-2">
                  <MetricTable rows={[
                    { label: "Accounts Receivable", value: fmt(ar) },
                    { label: "Inventories", value: fmt(inv) },
                    { label: "Accounts Payable", value: fmt(ap) },
                    { label: "Working Capital", value: fmt(ratios.workingCapital), bold: true },
                    { label: "Current Ratio", value: fmtX(ratios.currentRatio) },
                  ]} />
                  <div className="grid grid-cols-2 gap-3">
                    <RatioCard label="Asset Turnover" value={fmtX(ratios.assetTurnover)} />
                    <RatioCard label="Inventory Turn." value={fmtX(ratios.inventoryTurnover)} />
                    <RatioCard label="Receivables Turn." value={fmtX(ratios.receivablesTurnover)} />
                    <RatioCard label="WC / Revenue" value={fmtPct(ratios.workingCapitalRatio)} />
                  </div>
                </div>
              </Section>

              {/* Top Items Chart */}
              {topBs.length > 0 && (
                <Section title="Largest Balance Sheet Items">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topBs} layout="vertical" margin={{ left: 4, right: 8 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>
              )}
            </div>
          );
        })()}

        {/* ─── CASH FLOW ─── */}
        {activeTab === "cashflow" && (() => {
          const cfBridge = [
            { name: "OCF", amt: cf.operatingCashFlow ?? 0 },
            { name: "CapEx", amt: -(cf.capitalExpenditures ?? 0) },
            { name: "FCF", amt: cf.freeCashFlow ?? 0 },
            { name: "Dividends", amt: -(cf.dividendsPaid ?? 0) },
            { name: "Net Income", amt: cf.netIncome ?? 0 },
          ];

          const buyback = cfItems.find(i => i.tag === "PaymentsForRepurchaseOfCommonStock")?.value ?? null;
          const debtIssuance = cfItems.find(i => i.tag === "ProceedsFromIssuanceOfLongTermDebt")?.value ?? null;
          const debtRepay = cfItems.find(i => i.tag === "RepaymentsOfLongTermDebt")?.value ?? null;
          const finCF = cfItems.find(i => i.tag === "NetCashProvidedByFinancingActivities")?.value ?? null;
          const invCF = cfItems.find(i => i.tag === "NetCashProvidedByInvestingActivities")?.value ?? null;

          return (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <RatioCard label="Operating CF" value={fmt(cf.operatingCashFlow)} />
                <RatioCard label="CapEx" value={cf.capitalExpenditures != null ? fmt(-Math.abs(cf.capitalExpenditures)) : "—"} />
                <RatioCard label="Free Cash Flow" value={fmt(cf.freeCashFlow)} />
                <RatioCard label="Dividends Paid" value={cf.dividendsPaid != null ? fmt(-Math.abs(cf.dividendsPaid)) : "—"} />
                <RatioCard label="FCF Conversion" value={fmtPct(ratios.fcfConversion)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* CF Bridge */}
                <Section title="Cash Flow Bridge ($M)">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cfBridge}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}M`} contentStyle={tooltipStyle} />
                        <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                          {cfBridge.map((d, i) => <Cell key={i} fill={d.amt >= 0 ? COLORS.emerald : COLORS.red} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                {/* Cash Flow Detail */}
                <Section title="Cash Flow Statement">
                  <MetricTable rows={[
                    { label: "Operating Cash Flow", value: fmt(cf.operatingCashFlow), bold: true },
                    { label: "Capital Expenditures", value: fmt(cf.capitalExpenditures != null ? -Math.abs(cf.capitalExpenditures) : null), dim: true },
                    { label: "Free Cash Flow", value: fmt(cf.freeCashFlow), bold: true },
                    { label: "Dividends Paid", value: fmt(cf.dividendsPaid != null ? -Math.abs(cf.dividendsPaid) : null), dim: true },
                    { label: "Share Repurchases", value: fmt(buyback != null ? -Math.abs(buyback) : null), dim: true },
                    { label: "Investing Cash Flow", value: fmt(invCF) },
                    { label: "LT Debt Issuance", value: fmt(debtIssuance), dim: true },
                    { label: "LT Debt Repayments", value: fmt(debtRepay != null ? -Math.abs(debtRepay) : null), dim: true },
                    { label: "Financing Cash Flow", value: fmt(finCF) },
                  ]} />
                </Section>
              </div>

              {/* Dividend Assessment */}
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
        })()}

        {/* ─── DEEP DIVE ─── */}
        {activeTab === "deep-dive" && (() => {
          const footnotes = result.footnotes ?? [];
          const adjustedMetrics = result.adjustedMetrics ?? [];
          const passedCount = validation.checks.filter(c => c.passed).length;

          return (
            <div className="space-y-4">
              {/* Data Quality */}
              <Section title="Data Quality">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <CheckCircle2 className={cn("h-5 w-5", passedCount === validation.checks.length ? "text-emerald-500" : "text-amber-500")} />
                    <div>
                      <p className="text-sm font-bold">{passedCount}/{validation.checks.length} checks passed</p>
                      <p className="text-[11px] text-slate-500">Data integrity</p>
                    </div>
                  </div>
                  {reconcile && (
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                      {reconcile.status === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}
                      <div>
                        <p className="text-sm font-bold">A = L+E: {reconcile.status.toUpperCase()}</p>
                        <p className="text-[11px] text-slate-500">Gap: {reconcile.gapPct}% (${Math.abs(reconcile.gapM).toLocaleString()}M)</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {validation.checks.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2.5">
                      {c.passed ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 text-red-500" />}
                      <div>
                        <p className="text-[11px] font-semibold">{c.name}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-2">{c.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* All Ratios */}
              <Section title="Complete Ratio Analysis">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Profitability</h5>
                    <MetricTable compact rows={[
                      { label: "Gross Margin", value: fmtPct(ratios.grossMargin) },
                      { label: "Operating Margin", value: fmtPct(ratios.operatingMargin) },
                      { label: "EBITDA Margin", value: fmtPct(ratios.ebitdaMargin) },
                      { label: "Net Margin", value: fmtPct(ratios.netMargin) },
                      { label: "ROE", value: fmtPct(ratios.returnOnEquity) },
                      { label: "ROA", value: fmtPct(ratios.returnOnAssets) },
                      { label: "ROIC", value: fmtPct(ratios.returnOnInvestedCapital) },
                    ]} />
                  </div>
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Leverage & Liquidity</h5>
                    <MetricTable compact rows={[
                      { label: "Debt / Equity", value: fmtX(ratios.debtToEquity) },
                      { label: "Debt / Capital", value: fmtPct(ratios.debtToCapital) },
                      { label: "Net Debt / EBITDA", value: fmtX(ratios.netDebtToEbitda) },
                      { label: "Interest Coverage", value: fmtX(ratios.interestCoverage) },
                      { label: "Current Ratio", value: fmtX(ratios.currentRatio) },
                      { label: "Working Capital", value: fmt(ratios.workingCapital) },
                    ]} />
                  </div>
                  <div>
                    <h5 className="mb-2 text-[11px] font-bold uppercase text-slate-400">Efficiency & Cash</h5>
                    <MetricTable compact rows={[
                      { label: "Asset Turnover", value: fmtX(ratios.assetTurnover) },
                      { label: "Inventory Turnover", value: fmtX(ratios.inventoryTurnover) },
                      { label: "Receivables Turnover", value: fmtX(ratios.receivablesTurnover) },
                      { label: "FCF Yield", value: fmtPct(ratios.fcfYield) },
                      { label: "FCF Conversion", value: fmtPct(ratios.fcfConversion) },
                    ]} />
                  </div>
                </div>
              </Section>

              {/* Footnotes */}
              {footnotes.length > 0 && (
                <Section title={`Notable Footnotes (${footnotes.length})`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {footnotes.map((fn, i) => (
                      <div key={i} className="rounded-lg border border-slate-100 p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-slate-800">{fn.title}</p>
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            fn.significance === "high" ? "bg-red-100 text-red-700" : fn.significance === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                          )}>
                            {fn.significance}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600">{fn.summary}</p>
                        <span className="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{fn.type}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Adjusted Metrics */}
              {adjustedMetrics.length > 0 && (
                <Section title={`Non-GAAP Adjusted Metrics (${adjustedMetrics.length})`}>
                  <div className="space-y-3">
                    {adjustedMetrics.map((am, i) => {
                      const totalAdj = am.adjustments.reduce((s, a) => s + a.value, 0);
                      const unit = am.unit === "per-share" ? "" : "M";
                      return (
                        <div key={i} className="rounded-lg border border-slate-100 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-slate-800">{am.name}</p>
                              <p className="text-[10px] text-slate-400">{am.period}</p>
                            </div>
                            <p className="text-base font-bold tabular-nums text-emerald-600">
                              {am.adjustedValue != null ? `$${am.adjustedValue.toLocaleString()}${unit}` : "—"}
                            </p>
                          </div>
                          <table className="w-full text-xs">
                            <tbody>
                              <tr className="border-b border-slate-100">
                                <td className="py-1 text-slate-500">GAAP</td>
                                <td className="py-1 text-right tabular-nums font-semibold">{am.gaapValue != null ? `$${am.gaapValue.toLocaleString()}${unit}` : "—"}</td>
                              </tr>
                              {am.adjustments.map((adj, j) => (
                                <tr key={j} className="border-b border-slate-50">
                                  <td className="py-1 pl-3 text-slate-400">+ {adj.label}</td>
                                  <td className={cn("py-1 text-right tabular-nums", adj.value >= 0 ? "text-emerald-600" : "text-red-500")}>
                                    {adj.value >= 0 ? "+" : ""}${adj.value.toLocaleString()}{unit}
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t-2 border-slate-200">
                                <td className="py-1 font-bold">Total adjustments</td>
                                <td className={cn("py-1 text-right tabular-nums font-bold", totalAdj >= 0 ? "text-emerald-600" : "text-red-500")}>
                                  {totalAdj >= 0 ? "+" : ""}${totalAdj.toLocaleString()}{unit}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Raw Line Items */}
              <Section title="Extracted Line Items">
                <div className="grid gap-4 lg:grid-cols-2">
                  <LineItemTable title="Balance Sheet" items={bs.items} />
                  <LineItemTable title="Income & Cash Flow" items={cfItems} />
                </div>
              </Section>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ──────────────────── Sub-components ──────────────────── */

function KpiCell({ label, value, highlight }: { label: string; value: string; highlight?: number | null }) {
  return (
    <div className="bg-white px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn(
        "mt-0.5 text-sm font-bold tabular-nums sm:text-base",
        highlight != null ? (highlight > 0 ? "text-slate-900" : highlight < 0 ? "text-red-600" : "text-slate-900") : "text-slate-900"
      )}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </div>
  );
}

function RatioCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function MetricTable({ rows, compact }: {
  rows: Array<{ label: string; value: string; bold?: boolean; dim?: boolean; sub?: string }>;
  compact?: boolean;
}) {
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.filter(r => r.value !== "—" || !compact).map((r, i) => (
          <tr key={i} className={cn(
            "border-b border-slate-100 last:border-b-0",
            r.bold && "bg-slate-50/50"
          )}>
            <td className={cn(
              compact ? "py-1 px-1" : "py-1.5 px-2",
              r.bold ? "font-bold text-slate-800" : r.dim ? "text-slate-400" : "text-slate-600"
            )}>
              {r.label}
            </td>
            <td className={cn(
              "text-right tabular-nums",
              compact ? "py-1 px-1" : "py-1.5 px-2",
              r.bold ? "font-bold text-slate-900" : "font-semibold text-slate-700"
            )}>
              {r.value}
              {r.sub && <span className="ml-1.5 text-[10px] font-normal text-slate-400">{r.sub}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IncomeStatementTable({ inc }: { inc: IncomeStatement }) {
  const lines: Array<{ label: string; value: number | null; bold?: boolean; dim?: boolean; marginLabel?: string; margin?: number | null; indent?: boolean }> = [
    { label: "Revenue", value: inc.revenue, bold: true },
    { label: "Cost of Revenue", value: inc.costOfRevenue ? -inc.costOfRevenue : null, dim: true },
    { label: "Gross Profit", value: inc.grossProfit, bold: true, marginLabel: "Gross Margin", margin: inc.grossMargin },
    { label: "SG&A Expense", value: inc.sgaExpense ? -inc.sgaExpense : null, indent: true, dim: true },
    { label: "R&D Expense", value: inc.rdExpense ? -inc.rdExpense : null, indent: true, dim: true },
    { label: "Operating Income", value: inc.operatingIncome, bold: true, marginLabel: "OP Margin", margin: inc.operatingMargin },
    { label: "D&A", value: inc.depreciation != null ? inc.depreciation : null, indent: true, dim: true },
    { label: "EBITDA", value: inc.ebitda, bold: true, marginLabel: "EBITDA Margin", margin: inc.ebitdaMargin },
    { label: "Interest Expense", value: inc.interestExpense ? -inc.interestExpense : null, indent: true, dim: true },
    { label: "Income Tax", value: inc.incomeTax ? -inc.incomeTax : null, indent: true, dim: true },
    { label: "Net Income", value: inc.netIncome, bold: true, marginLabel: "Net Margin", margin: inc.netMargin },
  ];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-slate-200">
          <th className="px-3 py-2 text-left font-semibold text-slate-500">Line Item</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">$M</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-500">Margin</th>
        </tr>
      </thead>
      <tbody>
        {lines.filter(l => l.value != null).map((l, i) => (
          <tr key={i} className={cn("border-b border-slate-100", l.bold && "bg-slate-50/50")}>
            <td className={cn("px-3 py-1.5", l.indent && "pl-6", l.bold ? "font-bold text-slate-800" : l.dim ? "text-slate-400" : "text-slate-600")}>
              {l.label}
            </td>
            <td className={cn(
              "px-3 py-1.5 text-right tabular-nums",
              l.bold ? "font-bold text-slate-900" : "text-slate-700",
              l.value != null && l.value < 0 && "text-red-500"
            )}>
              {l.value != null ? (l.value < 0 ? `(${Math.abs(l.value).toLocaleString()})` : l.value.toLocaleString()) : "—"}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
              {l.margin != null ? `${l.margin.toFixed(1)}%` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LineItemTable({ title, items }: { title: string; items: BSItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex max-h-[300px] flex-col overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
        <h5 className="text-[11px] font-bold text-slate-700">{title}</h5>
        <span className="text-[10px] text-slate-400">{items.length} items</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 border-b border-slate-100 bg-white">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold text-slate-500">Line</th>
              <th className="px-3 py-1.5 text-right font-semibold text-slate-500">USD (M)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3 py-1">
                  <span className="block font-medium text-slate-700">{item.label}</span>
                  <span className="block max-w-[150px] truncate text-[9px] text-slate-400" title={item.source}>{item.source}</span>
                </td>
                <td className={cn("px-3 py-1 text-right tabular-nums font-semibold", item.value < 0 ? "text-red-500" : "text-slate-800")}>
                  {item.value < 0 ? `(${Math.abs(item.value).toLocaleString()})` : item.value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
