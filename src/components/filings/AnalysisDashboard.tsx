"use client";

import { useMemo, useState } from "react";
import type { FullAnalysis, BSItem } from "@/types/analysis";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  CheckCircle2, XCircle, Download, Info,
  TrendingUp, TrendingDown, ShieldCheck, ShieldAlert,
  DollarSign, BarChart3, Activity, FileCheck,
  Lightbulb, ArrowRight, ArrowDown, ArrowUp,
  Gauge,
} from "lucide-react";

interface Props { result: FullAnalysis; onExport?: () => void; }

const COLORS = {
  primary: "#4f46e5", secondary: "#0ea5e9", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", muted: "#94a3b8",
};
const PIE_COLORS = [COLORS.primary, COLORS.secondary, COLORS.muted, COLORS.warning, "#8b5cf6"];

const fmt = (v: number | null | undefined): string => v != null ? v.toLocaleString() : "—";
const fmtPct = (v: number | null | undefined): string => v != null ? `${v.toFixed(1)}%` : "—";
const fmtRatio = (v: number | null | undefined): string => v != null ? v.toFixed(2) : "—";

function topByAbs(items: BSItem[], n: number) {
  return [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, n)
    .map((i) => ({ name: i.label.length > 18 ? `${i.label.slice(0, 18)}…` : i.label, value: Math.abs(i.value), full: i.label }));
}

const tooltipStyle = {
  borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12,
  background: "#fff", color: "#1e293b", boxShadow: "0 4px 12px rgb(0 0 0/0.08)",
};

/* ──────────────────── Tabs ──────────────────── */

type TabId = "overview" | "capital" | "cashflow" | "ratios" | "data";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "capital", label: "Capital", icon: DollarSign },
  { id: "cashflow", label: "Cash Flow", icon: BarChart3 },
  { id: "ratios", label: "Ratios", icon: Gauge },
  { id: "data", label: "Data", icon: Activity },
];

/* ──────────────────── Industry benchmarks (qualitative) ──────────────────── */

const INDUSTRY_BENCHMARKS = {
  debtToEquity: "Typical D/E ranges: Technology 0.3–1.0; Utilities 1.0–1.5; Industrials 0.8–1.5; Financials 2–4; Consumer 0.5–1.2.",
  payoutRatio: "Sustainable payout: <60% of NI is conservative; 60–80% moderate; >80% or >100% of FCF is stretched.",
  interestCoverage: "Interest coverage: >8x very strong; 4–8x healthy; 2–4x adequate; <2x concerning; <1x distress.",
  netDebtToEbitda: "Net debt/EBITDA: <1x low leverage; 1–2.5x investment grade; 2.5–4x high yield; >4x stressed.",
  currentRatio: "Current ratio: >2x ample liquidity; 1.2–2x normal; 1.0–1.2x tight; <1x may struggle to meet short-term obligations.",
};

/* ──────────────────── Insight generator (detailed, with industry context) ──────────────────── */

function generateInsights(result: FullAnalysis): { overview: string[]; capital: string[]; cashflow: string[]; ratios: string[]; data: string[] } {
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios: r, dividendAnalysis: div, validation, reconcile } = result;

  const overview: string[] = [];
  if (div.verdict === "strong") {
    overview.push("Dividend coverage is strong. The payout is well-supported by both earnings and free cash flow, with FCF comfortably exceeding dividends and a healthy payout ratio. This suggests the company can maintain or grow dividends without straining liquidity or relying on debt.");
  } else if (div.verdict === "adequate") {
    overview.push("Dividend coverage is adequate but warrants ongoing monitoring. Payout ratios and FCF coverage are within manageable ranges, but a material decline in earnings or cash flow could tighten the buffer. Track quarterly trends and any change in capital allocation priorities.");
  } else if (div.verdict === "stretched") {
    overview.push("Dividend looks stretched — payout exceeds comfortable thresholds relative to FCF and/or net income. The company may be returning more cash than it generates, relying on balance sheet strength or debt. Any sustained cash burn or leverage increase would raise sustainability concerns.");
  } else {
    overview.push("Insufficient data to fully assess dividend sustainability. Key line items (dividends paid, FCF, net income) may be missing or incomplete. Consider verifying against the official filing or using SEC XBRL for ticker-based analysis.");
  }

  if (cf.freeCashFlow != null && cf.freeCashFlow > 0) {
    overview.push(`Positive FCF of $${fmt(cf.freeCashFlow)}M provides a meaningful buffer for shareholder returns (dividends, buybacks) and optional investments. Companies that consistently generate FCF above dividend requirements are generally better positioned to navigate downturns.`);
  } else if (cf.freeCashFlow != null) {
    overview.push(`Negative FCF of $${fmt(cf.freeCashFlow)}M signals cash burn. The dividend may be funded from reserves, asset sales, or debt. This is common in growth or capital-intensive phases but should not persist indefinitely without a clear path to positive FCF.`);
  }
  if (debt.netDebt < 0) {
    overview.push("Net cash position — the company holds more cash than debt. This reduces refinancing risk and provides optionality for M&A or buybacks, though excess cash can imply inefficient capital allocation if not deployed. Compare with sector norms.");
  }

  const capital: string[] = [];
  if (bs.totalAssets > 0 && bs.totalEquity > 0) {
    const equityPct = (bs.totalEquity / bs.totalAssets * 100).toFixed(0);
    capital.push(`Equity finances ${equityPct}% of total assets ($${fmt(bs.totalAssets)}M). A higher equity share typically implies lower financial risk and less sensitivity to interest rate changes. ${INDUSTRY_BENCHMARKS.debtToEquity}`);
  }
  if (r.debtToEquity != null) {
    if (r.debtToEquity < 0.5) capital.push(`Low leverage with D/E of ${fmtRatio(r.debtToEquity)}x indicates a conservative balance sheet. The company relies primarily on equity, which reduces interest expense and refinancing risk. Suitable for dividend investors seeking stability.`);
    else if (r.debtToEquity < 1.5) capital.push(`Moderate leverage at ${fmtRatio(r.debtToEquity)}x D/E. Debt is used but not excessive; interest coverage and maturity profile matter. Compare with peers in the same sector for relative positioning.`);
    else capital.push(`High leverage at ${fmtRatio(r.debtToEquity)}x D/E — debt is a significant part of capital. Monitor interest coverage, refinancing schedule, and covenant headroom. Sector context: financials and utilities often operate at higher D/E; tech and consumer typically lower.`);
  }
  if (debt.shortTermDebt > 0 && debt.longTermDebt > 0) {
    const stPct = ((debt.shortTermDebt / debt.totalDebt) * 100).toFixed(0);
    capital.push(`${stPct}% of total debt ($${fmt(debt.totalDebt)}M) is short-term. ${Number(stPct) > 40 ? "A high share of ST debt elevates refinancing risk — ensure adequate liquidity and revolving credit capacity." : "A manageable maturity profile with most debt long-term; reduces near-term refinancing pressure."}`);
  }

  const cashflow: string[] = [];
  if (cf.operatingCashFlow != null && cf.capitalExpenditures != null && cf.operatingCashFlow > 0) {
    const convRate = ((cf.operatingCashFlow - (cf.capitalExpenditures ?? 0)) / cf.operatingCashFlow * 100).toFixed(0);
    cashflow.push(`FCF conversion rate is ${convRate}% of operating cash flow. This measures how much of OCF is left after maintenance CapEx. Higher conversion means more cash available for dividends and growth. Capital-intensive industries (e.g. utilities, industrials) typically have lower conversion rates.`);
  }
  if (cf.dividendsPaid != null && cf.freeCashFlow != null && cf.freeCashFlow > 0) {
    const cover = (cf.freeCashFlow / cf.dividendsPaid).toFixed(1);
    cashflow.push(`FCF covers dividends ${cover}x. ${Number(cover) > 2 ? "A multiple above 2x provides a comfortable margin — room for reinvestment or buybacks without straining the dividend." : Number(cover) > 1 ? "Coverage above 1x is adequate but leaves limited flexibility; monitor any decline in FCF." : "Coverage below 1x means dividends exceed FCF — not sustainable long term without other cash sources."} ${INDUSTRY_BENCHMARKS.payoutRatio}`);
  }
  if (cf.netIncome != null && cf.operatingCashFlow != null) {
    const quality = cf.operatingCashFlow / Math.max(Math.abs(cf.netIncome), 1);
    if (quality > 1.2) cashflow.push("Cash flow quality is strong — OCF significantly exceeds net income. This often indicates conservative accounting, working capital benefits, or non-cash charges that reduce net income but not cash. High-quality earnings signal.");
    else if (quality < 0.7) cashflow.push("Earnings quality concern — OCF trails net income. This can reflect heavy capex, working capital build, or accrual-driven earnings. Investors should verify sustainability of reported earnings.");
  }

  const ratiosInsight: string[] = [];
  ratiosInsight.push(INDUSTRY_BENCHMARKS.debtToEquity);
  ratiosInsight.push(INDUSTRY_BENCHMARKS.interestCoverage);
  if (r.currentRatio != null) {
    if (r.currentRatio > 2) ratiosInsight.push(`Current ratio of ${fmtRatio(r.currentRatio)}x indicates ample short-term liquidity. The company can comfortably cover current liabilities with current assets; low near-term refinancing or working capital stress.`);
    else if (r.currentRatio > 1) ratiosInsight.push(`Current ratio of ${fmtRatio(r.currentRatio)}x — sufficient to meet short-term obligations. Within typical range; monitor for deterioration. ${INDUSTRY_BENCHMARKS.currentRatio}`);
    else ratiosInsight.push(`Current ratio below 1.0 (${fmtRatio(r.currentRatio)}x) — potential liquidity stress. Current assets do not fully cover current liabilities; may need revolving credit or refinancing.`);
  }
  if (r.interestCoverage != null) {
    if (r.interestCoverage > 8) ratiosInsight.push(`Interest coverage of ${r.interestCoverage}x — debt service is very comfortable. Earnings could fall substantially before interest payments become a concern.`);
    else if (r.interestCoverage > 3) ratiosInsight.push(`Interest coverage of ${r.interestCoverage}x — adequate debt-service capacity. Within healthy range; watch for earnings volatility.`);
    else ratiosInsight.push(`Interest coverage of ${r.interestCoverage}x is thin — watch for rising rates or earnings decline. ${INDUSTRY_BENCHMARKS.interestCoverage}`);
  }
  if (r.netDebtToEbitda != null) {
    ratiosInsight.push(INDUSTRY_BENCHMARKS.netDebtToEbitda);
    if (r.netDebtToEbitda < 1) ratiosInsight.push("This company's net debt/EBITDA is below 1x — very low leverage by most standards.");
    else if (r.netDebtToEbitda < 3) ratiosInsight.push(`Net debt/EBITDA of ${fmtRatio(r.netDebtToEbitda)}x is within investment-grade territory.`);
    else ratiosInsight.push(`Net debt/EBITDA of ${fmtRatio(r.netDebtToEbitda)}x suggests elevated leverage — consider sector peers for comparison.`);
  }

  const passedCount = validation.checks.filter(c => c.passed).length;
  const dataInsight: string[] = [];
  if (validation.checks.length > 0) {
    dataInsight.push(`${passedCount} of ${validation.checks.length} data integrity checks passed. ${passedCount === validation.checks.length ? "All core line items and identity checks are satisfied — data appears consistent with the source." : "Critical gaps may exist; cross-reference with the official filing before making decisions."}`);
    const failed = validation.checks.filter(c => !c.passed);
    if (failed.length > 0) dataInsight.push(`Failed checks: ${failed.map(f => f.name).join(", ")}. These metrics could not be extracted or validated; treat related analyses with caution.`);
  }
  if (reconcile && reconcile.status !== "ok") {
    dataInsight.push(`Balance sheet identity gap: Assets − (L+E) = $${reconcile.gapM.toLocaleString()}M (${reconcile.gapPct}%). ${reconcile.status === "warning" ? "Minor discrepancy — may reflect rounding, classification differences, or incomplete extraction. Verify key totals against the filing." : "Significant gap indicates extraction issues — do not rely on these numbers without verification."}`);
  }
  if (result.meta.confidence) {
    const confLabel = { high: "SEC XBRL — high confidence (structured data)", medium: "PDF + AI — medium confidence (model inference)", low: "PDF heuristic — low confidence (pattern matching)" }[result.meta.confidence];
    dataInsight.push(`Data source: ${confLabel}. For peer or market comparison, run the same analysis on competitor tickers (e.g., MSFT for AAPL) or use sector aggregates from financial databases.`);
  }

  return { overview, capital, cashflow, ratios: ratiosInsight, data: dataInsight };
}

/* ──────────────────── Main Component ──────────────────── */

export function AnalysisDashboard({ result, onExport }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { balanceSheet: bs, debtStructure: debt, cashFlow: cf, ratios, dividendAnalysis: div, validation, meta, reconcile } = result;
  const cfItems = result.cfItems ?? [];

  const insights = useMemo(() => generateInsights(result), [result]);

  const verdictConfig = {
    strong: { icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200/60", badge: "bg-emerald-100 text-emerald-700" },
    adequate: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200/60", badge: "bg-blue-100 text-blue-700" },
    stretched: { icon: ShieldAlert, color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200/60", badge: "bg-amber-100 text-amber-700" },
    unknown: { icon: Info, color: "text-slate-500", bg: "bg-slate-50", ring: "ring-slate-200/60", badge: "bg-slate-100 text-slate-600" },
  }[div.verdict];

  const VerdictIcon = verdictConfig.icon;

  const capitalPie = useMemo(() =>
    [{ name: "Equity", value: Math.abs(bs.totalEquity) }, { name: "LT Debt", value: debt.longTermDebt }, { name: "ST Debt", value: debt.shortTermDebt }]
      .filter((d) => d.value > 0), [bs.totalEquity, debt.longTermDebt, debt.shortTermDebt]);

  const coverageData = useMemo(() =>
    [{ label: "Payout (NI)", value: div.payoutRatioNI, color: COLORS.secondary }, { label: "Payout (FCF)", value: div.payoutRatioFCF, color: COLORS.primary }]
      .filter((d) => d.value != null), [div.payoutRatioNI, div.payoutRatioFCF]);

  const bsBar = useMemo(() => [
    { name: "Assets", assets: bs.totalAssets, liab: 0, equity: 0 },
    { name: "Capital", assets: 0, liab: bs.totalLiabilities, equity: bs.totalEquity },
  ], [bs.totalAssets, bs.totalLiabilities, bs.totalEquity]);

  const payoutCompare = useMemo(() =>
    [{ metric: "FCF coverage", value: div.fcfCoverageYears ?? 0 }, { metric: "Cash coverage", value: div.cashCoverageYears ?? 0 }]
      .filter((d) => d.value > 0), [div.fcfCoverageYears, div.cashCoverageYears]);

  const debtBars = useMemo(() => [
    { name: "ST debt", v: debt.shortTermDebt }, { name: "LT debt", v: debt.longTermDebt },
    { name: "Cash", v: bs.cashAndEquivalents }, { name: "Net debt", v: Math.max(0, debt.netDebt) },
  ], [debt, bs.cashAndEquivalents]);

  const cfBridge = useMemo(() => [
    { name: "OCF", amt: cf.operatingCashFlow ?? 0 }, { name: "CapEx", amt: -(cf.capitalExpenditures ?? 0) },
    { name: "FCF", amt: cf.freeCashFlow ?? 0 }, { name: "Dividends", amt: -(cf.dividendsPaid ?? 0) },
    { name: "Net Inc.", amt: cf.netIncome ?? 0 },
  ], [cf]);

  const ratioBars = useMemo(() =>
    [{ name: "D/E", v: ratios.debtToEquity ?? 0 }, { name: "ND/EBITDA", v: ratios.netDebtToEbitda ?? 0 },
     { name: "Int. Cov.", v: ratios.interestCoverage ?? 0 }, { name: "Current", v: ratios.currentRatio ?? 0 }]
      .filter((r) => r.v !== 0), [ratios]);

  const topBs = useMemo(() => topByAbs(bs.items, 8), [bs.items]);
  const topAll = useMemo(() => topByAbs([...bs.items, ...cfItems], 10), [bs.items, cfItems]);

  const passedCount = validation.checks.filter((c) => c.passed).length;
  const passRate = validation.checks.length ? Math.round((passedCount / validation.checks.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl lg:text-2xl">
              {meta.companyName ?? meta.fileName ?? "Financial Report"}
            </h2>
            {meta.ticker && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary sm:px-2.5 sm:text-xs">
                {meta.ticker}
              </span>
            )}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:text-[11px]", verdictConfig.badge)}>
              {div.verdict}
            </span>
            {meta.confidence && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase sm:text-[10px]",
                  meta.confidence === "high" && "bg-emerald-100 text-emerald-700",
                  meta.confidence === "medium" && "bg-amber-100 text-amber-700",
                  meta.confidence === "low" && "bg-slate-200 text-slate-600"
                )}
                title={meta.extractionMethod ?? meta.source}
              >
                {meta.confidence} data
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 sm:gap-2 sm:text-xs">
            {meta.periodEnd && <span>Period ending {meta.periodEnd}</span>}
            <span className="text-slate-300">·</span>
            <span>{meta.source === "sec" ? "SEC EDGAR" : `PDF${meta.pagesRead ? ` (${meta.pagesRead}p)` : ""}`}</span>
          </div>
        </div>
        {onExport && (
          <button onClick={onExport} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:bg-primary/90 sm:gap-2 sm:px-4 sm:py-2 sm:text-xs">
            <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Export
          </button>
        )}
      </header>

      {/* Reconcile warning */}
      {reconcile && reconcile.status !== "ok" && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5 sm:px-4",
            reconcile.status === "fail"
              ? "border-red-200 bg-red-50/80 text-red-800"
              : "border-amber-200 bg-amber-50/80 text-amber-800"
          )}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-xs font-bold">Balance sheet identity gap</p>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              Assets (${reconcile.lhs.toLocaleString()}M) vs Liabilities+Equity (${reconcile.rhs.toLocaleString()}M) = ${Math.abs(reconcile.gapM).toLocaleString()}M ({reconcile.gapPct}%) discrepancy.
              {reconcile.status === "fail" ? " Extraction may be incomplete — verify against official filing." : " Minor gap; cross-check key line items."}
            </p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="-mx-3 mb-4 overflow-x-auto border-b border-slate-100 px-3 sm:-mx-5 sm:px-5">
        <nav className="flex gap-0.5" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-4 sm:py-2.5 sm:text-xs",
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-400 hover:border-slate-200 hover:text-slate-600"
              )}
            >
              <Icon className={cn(
                "h-3.5 w-3.5 sm:h-4 sm:w-4",
                activeTab === id ? "text-primary" : "text-slate-300 group-hover:text-slate-400"
              )} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {/* ─── OVERVIEW ─── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <InsightBar items={insights.overview} />

            {/* Verdict card */}
            <div className={cn("rounded-xl p-3 ring-1 sm:p-4", verdictConfig.bg, verdictConfig.ring)}>
              <div className="flex items-start gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", verdictConfig.bg)}>
                  <VerdictIcon className={cn("h-5 w-5", verdictConfig.color)} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Dividend sustainability</p>
                  <p className="text-sm font-bold text-slate-900 sm:text-base">{div.headline}</p>
                  <ul className="space-y-1">
                    {div.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-600 sm:text-xs">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <KpiCard label="Free Cash Flow" value={cf.freeCashFlow} unit="M" positive={cf.freeCashFlow != null && cf.freeCashFlow > 0} />
              <KpiCard label="Net Debt" value={debt.netDebt} unit="M" positive={debt.netDebt < 0} hint={debt.netDebt < 0 ? "Net cash" : undefined} />
              <KpiCard label="Debt / Equity" value={ratios.debtToEquity} unit="x" thresholds={[0.5, 1.5]} />
              <KpiCard label="Interest Cov." value={ratios.interestCoverage} unit="x" thresholds={[3, 8]} invertThreshold />
            </div>

            {/* Charts row */}
            <div className="grid gap-3 sm:grid-cols-2">
              {coverageData.length > 0 && (
                <ChartCard label="Payout ratio (% of earnings / FCF)">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={coverageData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => v != null ? `${Number(v).toFixed(1)}%` : ""} contentStyle={tooltipStyle} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {coverageData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              {payoutCompare.length > 0 && (
                <ChartCard label="Coverage multiples (x)">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={payoutCompare} layout="vertical" margin={{ left: 4 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="metric" width={90} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v) => v != null ? `${Number(v).toFixed(2)}x` : ""} contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>
          </div>
        )}

        {/* ─── CAPITAL ─── */}
        {activeTab === "capital" && (
          <div className="space-y-4">
            <InsightBar items={insights.capital} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <KpiCard label="Total Assets" value={bs.totalAssets} unit="M" />
              <KpiCard label="Total Equity" value={bs.totalEquity} unit="M" positive={bs.totalEquity > 0} />
              <KpiCard label="Total Debt" value={debt.totalDebt} unit="M" />
              <KpiCard label="Cash" value={bs.cashAndEquivalents} unit="M" positive />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ChartCard label="Assets vs capital breakdown (USD M)" height="h-36 sm:h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bsBar} layout="vertical" barCategoryGap="20%">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} />
                    <Bar dataKey="assets" stackId="a" fill={COLORS.primary} name="Assets" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="liab" stackId="a" fill={COLORS.danger} name="Liabilities" />
                    <Bar dataKey="equity" stackId="a" fill={COLORS.secondary} name="Equity" radius={[0, 4, 4, 0]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {capitalPie.length > 0 && (
                <ChartCard label="Equity vs debt tranches">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={capitalPie} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value">
                        {capitalPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>

            <ChartCard label="Largest balance sheet items (|USD M|)" height="h-40 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBs} layout="vertical" margin={{ left: 4, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {/* ─── CASH FLOW ─── */}
        {activeTab === "cashflow" && (
          <div className="space-y-4">
            <InsightBar items={insights.cashflow} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
              <KpiCard label="Operating CF" value={cf.operatingCashFlow} unit="M" positive={cf.operatingCashFlow != null && cf.operatingCashFlow > 0} />
              <KpiCard label="CapEx" value={cf.capitalExpenditures != null ? -Math.abs(cf.capitalExpenditures) : null} unit="M" />
              <KpiCard label="Free CF" value={cf.freeCashFlow} unit="M" positive={cf.freeCashFlow != null && cf.freeCashFlow > 0} />
              <KpiCard label="Dividends Paid" value={cf.dividendsPaid != null ? -Math.abs(cf.dividendsPaid) : null} unit="M" />
              <KpiCard label="Net Income" value={cf.netIncome} unit="M" positive={cf.netIncome != null && cf.netIncome > 0} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ChartCard label="Cash generation vs uses (USD M)" height="h-44 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cfBridge}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} contentStyle={tooltipStyle} />
                    <Bar dataKey="amt" radius={[4, 4, 0, 0]}>
                      {cfBridge.map((d, i) => <Cell key={i} fill={d.amt >= 0 ? COLORS.success : COLORS.danger} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard label="Debt stack vs liquidity (USD M)" height="h-44 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={debtBars}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} contentStyle={tooltipStyle} />
                    <Bar dataKey="v" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

        {/* ─── RATIOS ─── */}
        {activeTab === "ratios" && (
          <div className="space-y-4">
            <InsightBar items={insights.ratios} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
              <KpiCard label="Debt / Equity" value={ratios.debtToEquity} unit="x" thresholds={[0.5, 1.5]} />
              <KpiCard label="Debt / Capital" value={ratios.debtToCapital} unit="x" thresholds={[0.3, 0.6]} />
              <KpiCard label="ND / EBITDA" value={ratios.netDebtToEbitda} unit="x" thresholds={[1, 3]} />
              <KpiCard label="Interest Cov." value={ratios.interestCoverage} unit="x" thresholds={[3, 8]} invertThreshold />
              <KpiCard label="Current Ratio" value={ratios.currentRatio} unit="x" thresholds={[1, 2]} invertThreshold />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {ratioBars.length > 0 && (
                <ChartCard label="Key financial ratios" height="h-44 sm:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ratioBars}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => v != null ? Number(v).toFixed(2) : ""} contentStyle={tooltipStyle} />
                      <Bar dataKey="v" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 sm:text-sm">Dividend Assessment</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MiniMetric label="Payout (NI)" value={fmtPct(div.payoutRatioNI)} warn={div.payoutRatioNI != null && div.payoutRatioNI > 80} />
                  <MiniMetric label="Payout (FCF)" value={fmtPct(div.payoutRatioFCF)} warn={div.payoutRatioFCF != null && div.payoutRatioFCF > 80} />
                  <MiniMetric label="FCF Coverage" value={div.fcfCoverageYears != null ? `${div.fcfCoverageYears}x` : "—"} />
                  <MiniMetric label="Cash Coverage" value={div.cashCoverageYears != null ? `${div.cashCoverageYears} yrs` : "—"} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── DATA ─── */}
        {activeTab === "data" && (
          <div className="space-y-4">
            <InsightBar items={insights.data} />

            {/* Integrity + Confidence + Reconcile */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:p-4">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  passRate === 100 ? "bg-emerald-100" : passRate >= 75 ? "bg-amber-100" : "bg-red-100"
                )}>
                  <FileCheck className={cn(
                    "h-5 w-5",
                    passRate === 100 ? "text-emerald-600" : passRate >= 75 ? "text-amber-600" : "text-red-600"
                  )} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 sm:text-base">{passedCount}/{validation.checks.length} checks passed</p>
                  <p className="text-[11px] text-slate-500 sm:text-xs">Integrity: {passRate}%</p>
                </div>
              </div>
              {meta.confidence && (
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 sm:p-4">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    meta.confidence === "high" && "bg-emerald-100",
                    meta.confidence === "medium" && "bg-amber-100",
                    meta.confidence === "low" && "bg-slate-200"
                  )}>
                    <ShieldCheck className={cn(
                      "h-5 w-5",
                      meta.confidence === "high" && "text-emerald-600",
                      meta.confidence === "medium" && "text-amber-600",
                      meta.confidence === "low" && "text-slate-500"
                    )} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 sm:text-base">Confidence: {meta.confidence}</p>
                    <p className="text-[11px] text-slate-500 sm:text-xs">{meta.extractionMethod ?? meta.source}</p>
                  </div>
                </div>
              )}
              {reconcile && (
                <div className={cn(
                  "flex items-center gap-3 rounded-xl p-3 ring-1 sm:p-4",
                  reconcile.status === "ok" && "bg-emerald-50 ring-emerald-100",
                  reconcile.status === "warning" && "bg-amber-50 ring-amber-100",
                  reconcile.status === "fail" && "bg-red-50 ring-red-100"
                )}>
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    reconcile.status === "ok" && "bg-emerald-100",
                    reconcile.status === "warning" && "bg-amber-100",
                    reconcile.status === "fail" && "bg-red-100"
                  )}>
                    {reconcile.status === "ok" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <ShieldAlert className={cn("h-5 w-5", reconcile.status === "fail" ? "text-red-600" : "text-amber-600")} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 sm:text-base">
                      A ≈ L+E: {reconcile.status === "ok" ? "OK" : reconcile.status}
                    </p>
                    <p className="text-[11px] text-slate-500 sm:text-xs">
                      Gap {reconcile.gapPct}% (${Math.abs(reconcile.gapM).toLocaleString()}M)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Checks grid */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {validation.checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white p-2.5 shadow-subtle sm:p-3">
                  {c.passed
                    ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
                  <div className="min-w-0">
                    <p className={cn("truncate text-[11px] font-semibold sm:text-xs", c.passed ? "text-slate-700" : "text-red-700")}>{c.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500 sm:text-[11px]">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Line item tables */}
            <div className="grid gap-3 lg:grid-cols-2">
              <LineTable title="Balance Sheet" count={bs.items.length} rows={bs.items} />
              <LineTable title="Income & Cash Flow" count={cfItems.length} rows={cfItems} />
            </div>

            {/* Top items chart */}
            <ChartCard label="Top absolute balances across all extracts (|USD M|)" height="h-44 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topAll} margin={{ bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={0} angle={-15} textAnchor="end" height={55} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => v != null ? `$${Number(v).toLocaleString()}M` : ""} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ""} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={COLORS.muted} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────── Sub-components ──────────────────── */

function InsightBar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary/70">Insights</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-700 sm:text-xs">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary/40" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiCard({ label, value, unit, positive, hint, thresholds, invertThreshold }: {
  label: string;
  value: number | null | undefined;
  unit: string;
  positive?: boolean;
  hint?: string;
  thresholds?: [number, number];
  invertThreshold?: boolean;
}) {
  let colorClass = "text-slate-900";
  let TrendIcon: React.ComponentType<{ className?: string }> | null = null;

  if (value != null) {
    if (thresholds) {
      const [low, high] = thresholds;
      if (invertThreshold) {
        if (value >= high) { colorClass = "text-emerald-600"; TrendIcon = ArrowUp; }
        else if (value >= low) { colorClass = "text-slate-900"; }
        else { colorClass = "text-red-600"; TrendIcon = ArrowDown; }
      } else {
        if (value <= low) { colorClass = "text-emerald-600"; TrendIcon = ArrowDown; }
        else if (value <= high) { colorClass = "text-slate-900"; }
        else { colorClass = "text-red-600"; TrendIcon = ArrowUp; }
      }
    } else if (positive !== undefined) {
      if (positive) { colorClass = "text-emerald-600"; TrendIcon = TrendingUp; }
      else if (value < 0) { colorClass = "text-red-600"; TrendIcon = TrendingDown; }
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-2.5 shadow-subtle sm:p-3">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[10px]">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn("text-base font-bold tabular-nums tracking-tight sm:text-lg lg:text-xl", colorClass)}>
          {value != null ? (unit === "M" ? `$${fmt(value)}` : fmtRatio(value)) : "—"}
        </span>
        <span className="text-[10px] font-medium text-slate-400 sm:text-xs">{unit}</span>
        {TrendIcon && <TrendIcon className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", colorClass)} />}
      </div>
      {hint && <p className="mt-0.5 text-[9px] font-medium text-emerald-600">{hint}</p>}
    </div>
  );
}

function MiniMetric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2.5 sm:p-3", warn ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50/50")}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[10px]">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums sm:text-base", warn ? "text-amber-700" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function ChartCard({ label, children, height = "h-40 sm:h-48" }: { label: string; children: React.ReactNode; height?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-100 bg-white p-2.5 sm:p-3", height)}>
      <p className="mb-1 text-[10px] font-medium text-slate-400 sm:text-[11px]">{label}</p>
      <div className="h-[calc(100%-20px)]">{children}</div>
    </div>
  );
}

function LineTable({ title, count, rows }: { title: string; count: number; rows: BSItem[] }) {
  return (
    <div className="flex max-h-[280px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-subtle sm:max-h-[360px]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4">
        <h4 className="text-[11px] font-bold text-slate-700 sm:text-xs">{title}</h4>
        <span className="text-[10px] text-slate-400">{count} items</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[11px] sm:text-xs">
          <thead className="sticky top-0 z-10 border-b border-slate-100 bg-white">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold text-slate-500 sm:px-4">Line</th>
              <th className="px-3 py-1.5 text-right font-semibold text-slate-500 sm:px-4">USD (M)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((item, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-50/80">
                <td className="px-3 py-1.5 sm:px-4">
                  <span className="block font-medium text-slate-800">{item.label}</span>
                  <span className="block max-w-[120px] truncate text-[9px] text-slate-400 sm:max-w-[180px] sm:text-[10px]" title={item.source}>{item.source}</span>
                </td>
                <td className={cn(
                  "whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums sm:px-4",
                  item.value >= 0 ? "text-slate-800" : "text-red-600"
                )}>
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
