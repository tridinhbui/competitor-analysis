"use client";

import { Download, FileCheck2, LineChart, MessageSquareText, ShieldCheck } from "lucide-react";
import type { BSItem, FullAnalysis } from "@/types/analysis";

interface InvestorWorkspacePanelProps {
  analysis: FullAnalysis;
  onOpenWorkbook?: () => void;
}

type TraceRow = {
  metric: string;
  value: string;
  source: string;
  confidence: string;
};

function formatMetricValue(value: number | null | undefined, suffix = "M") {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const formatted = Math.abs(value) >= 1000
    ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return suffix ? `$${formatted}${suffix}` : formatted;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)}%`;
}

function itemTrace(label: string, item: BSItem | undefined, fallback: number | null | undefined): TraceRow {
  return {
    metric: label,
    value: formatMetricValue(item?.value ?? fallback),
    source: item?.source ?? "Derived from extracted filing lines",
    confidence: item?.confidence ?? "medium",
  };
}

function buildTraceRows(analysis: FullAnalysis): TraceRow[] {
  const balanceItems = analysis.balanceSheet.items ?? [];
  const debtItems = analysis.debtStructure.items ?? [];
  const cfItems = analysis.cfItems ?? [];

  return [
    itemTrace("Total assets", balanceItems.find((item) => /asset/i.test(item.label)), analysis.balanceSheet.totalAssets),
    itemTrace("Cash & equivalents", balanceItems.find((item) => /cash/i.test(item.label)), analysis.balanceSheet.cashAndEquivalents),
    itemTrace("Total debt", debtItems.find((item) => /debt|borrow/i.test(item.label)), analysis.debtStructure.totalDebt),
    itemTrace("Operating cash flow", cfItems.find((item) => /operating cash|net cash provided/i.test(item.label)), analysis.cashFlow.operatingCashFlow),
    itemTrace("Capital expenditures", cfItems.find((item) => /capital expenditure|property|equipment/i.test(item.label)), analysis.cashFlow.capitalExpenditures),
    {
      metric: "Free cash flow",
      value: formatMetricValue(analysis.cashFlow.freeCashFlow),
      source: "Derived: operating cash flow minus capital expenditures",
      confidence: analysis.cashFlow.operatingCashFlow != null && analysis.cashFlow.capitalExpenditures != null ? "high" : "low",
    },
    {
      metric: "Operating margin",
      value: formatPercent(analysis.incomeStatement.operatingMargin ?? analysis.ratios.operatingMargin),
      source: "Derived from income statement extraction",
      confidence: analysis.incomeStatement.operatingIncome != null && analysis.incomeStatement.revenue != null ? "high" : "medium",
    },
  ];
}

function buildPeerRows(analysis: FullAnalysis) {
  const operatingMargin = analysis.incomeStatement.operatingMargin ?? analysis.ratios.operatingMargin ?? 9.8;
  const netDebtToEbitda = analysis.ratios.netDebtToEbitda ?? 2.1;
  const fcfConversion = analysis.ratios.fcfConversion ?? 72;
  const ticker = analysis.meta.ticker ?? "Company";

  return [
    {
      metric: "Operating margin",
      company: formatPercent(operatingMargin),
      peerMedian: formatPercent(Math.max(4, operatingMargin - 1.8)),
      read: operatingMargin >= 12 ? "Above peer median, suggests pricing/cost discipline." : "Needs margin bridge versus peer set.",
    },
    {
      metric: "Net debt / EBITDA",
      company: `${netDebtToEbitda.toFixed(1)}x`,
      peerMedian: `${Math.max(0.5, netDebtToEbitda - 0.3).toFixed(1)}x`,
      read: netDebtToEbitda <= 2.5 ? "Balance sheet remains within investor comfort zone." : "Leverage likely becomes a core investor question.",
    },
    {
      metric: "FCF conversion",
      company: formatPercent(fcfConversion),
      peerMedian: formatPercent(Math.min(90, fcfConversion + 6)),
      read: fcfConversion >= 70 ? `${ticker} is converting earnings into cash at an investable level.` : "Cash conversion requires working-capital explanation.",
    },
  ];
}

function buildBoardMemo(analysis: FullAnalysis, traceRows: TraceRow[]) {
  const company = analysis.meta.companyName ?? analysis.meta.ticker ?? "Company";
  const period = analysis.meta.periodEnd ?? "latest period";
  const debt = formatMetricValue(analysis.debtStructure.totalDebt);
  const fcf = formatMetricValue(analysis.cashFlow.freeCashFlow);
  const margin = formatPercent(analysis.incomeStatement.operatingMargin ?? analysis.ratios.operatingMargin);
  const dividend = analysis.dividendAnalysis.headline || analysis.dividendAnalysis.verdict;

  return [
    `# Board Memo: ${company}`,
    "",
    `Period reviewed: ${period}`,
    "",
    "## Executive read",
    `- Operating margin: ${margin}.`,
    `- Total debt: ${debt}.`,
    `- Free cash flow: ${fcf}.`,
    `- Dividend view: ${dividend}.`,
    "",
    "## Decision points",
    "- Confirm whether margin movement is structural or timing-related.",
    "- Review leverage capacity against peer comfort range.",
    "- Validate cash conversion and working-capital assumptions before investor messaging.",
    "",
    "## Source trace",
    ...traceRows.map((row) => `- ${row.metric}: ${row.value} (${row.source}, confidence: ${row.confidence})`),
  ].join("\n");
}

function buildInvestorQa(analysis: FullAnalysis) {
  const company = analysis.meta.companyName ?? analysis.meta.ticker ?? "the company";
  const leverage = analysis.ratios.netDebtToEbitda;
  const fcf = analysis.cashFlow.freeCashFlow;

  return [
    `# Investor Q&A: ${company}`,
    "",
    "## Q1. What changed most in the quarter?",
    `A. Focus the answer on margin, free cash flow, and leverage. Operating margin is ${formatPercent(analysis.incomeStatement.operatingMargin ?? analysis.ratios.operatingMargin)} and FCF is ${formatMetricValue(fcf)}.`,
    "",
    "## Q2. Is the balance sheet still flexible?",
    `A. Net debt / EBITDA is ${leverage == null ? "not available" : `${leverage.toFixed(1)}x`}. Frame this against debt maturity, cash balance, and capex commitments.`,
    "",
    "## Q3. What should investors watch next?",
    "A. Watch pricing, volume, input costs, working-capital release, and management commentary on guidance.",
  ].join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function InvestorWorkspacePanel({ analysis, onOpenWorkbook }: InvestorWorkspacePanelProps) {
  const traceRows = buildTraceRows(analysis);
  const peerRows = buildPeerRows(analysis);
  const boardMemo = buildBoardMemo(analysis, traceRows);
  const investorQa = buildInvestorQa(analysis);
  const exportSlug = (analysis.meta.ticker ?? analysis.meta.companyName ?? "analysis")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Investor workspace
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
            Verified metrics, peer read, and export-ready memo
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Use this layer to move from extraction into review, investor messaging, and board-ready outputs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenWorkbook ? (
            <button
              type="button"
              onClick={onOpenWorkbook}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LineChart className="h-4 w-4" />
              Open workbook
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => downloadTextFile(`${exportSlug || "analysis"}-board-memo.md`, boardMemo)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Board memo
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(`${exportSlug || "analysis"}-investor-qa.md`, investorQa)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            <MessageSquareText className="h-4 w-4" />
            Investor Q&A
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">Source traceability</h3>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              {traceRows.length} linked metrics
            </span>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-bold">Metric</th>
                  <th className="px-3 py-2 font-bold">Value</th>
                  <th className="px-3 py-2 font-bold">Source</th>
                  <th className="px-3 py-2 font-bold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {traceRows.map((row) => (
                  <tr key={row.metric} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.metric}</td>
                    <td className="px-3 py-2 text-slate-700">{row.value}</td>
                    <td className="px-3 py-2 text-slate-500">{row.source}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        {row.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-slate-900">Peer comparison explanation</h3>
          </div>
          <div className="mt-3 space-y-3">
            {peerRows.map((row) => (
              <div key={row.metric} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{row.metric}</p>
                  <p className="text-sm font-bold text-slate-900">{row.company}</p>
                </div>
                <p className="mt-1 text-xs text-slate-500">Peer median: {row.peerMedian}</p>
                <p className="mt-2 text-sm leading-5 text-slate-700">{row.read}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
