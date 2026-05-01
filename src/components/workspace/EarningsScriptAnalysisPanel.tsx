"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileScan,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AnalyzeLandingShell } from "@/components/workspace/AnalyzeLandingShell";
import { extractPdfLines } from "@/lib/pdfAnalysis";
import { cn } from "@/lib/utils";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { useRouter, useSearchParams } from "next/navigation";

export type EarningsSignal = {
  theme: string;
  insight: string;
  investorRelevance: string;
  confidence: "high" | "medium" | "low";
};

export type EarningsRisk = {
  risk: string;
  severity: "high" | "medium" | "low";
  why: string;
};

export type EarningsOpportunity = {
  opportunity: string;
  timeHorizon: "near-term" | "mid-term" | "long-term";
  why: string;
};

export type EarningsScriptAnalysis = {
  sessionTitle: string;
  companyFocus: string;
  quarter: string;
  summary: string;
  executiveTakeaway?: string;
  growth?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  profitability?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  investment?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  riskAnalysis?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  demandSignals?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  keySignals: EarningsSignal[];
  macroSignals: string[];
  competitorMentions: string[];
  risks: EarningsRisk[];
  opportunities: EarningsOpportunity[];
  managementTone?: {
    tone: "confident" | "defensive" | "mixed" | "uncertain";
    specificity: "high" | "medium" | "low";
    evidence: string[];
  };
  changeDetection?: {
    newThisQuarter: string[];
    stoppedTalkingAbout: string[];
    priorityShift: string;
  };
  investorBrain?: {
    biggestWorry: string;
    bearCase30Drawdown: string[];
    bullCaseDouble: string[];
    growthCycleStage: "early" | "mid" | "late" | "uncertain";
    storyVsMachine: "story" | "proven-machine" | "mixed";
  };
  watchList: string[];
  extractedMetrics: Array<{ metric: string; value: string; context: string }>;
  generatedAt: string;
  source: "yahoo-finance-script" | "earnings-call-transcript" | "user-input";
  rawScriptPreview: string;
  processingMode?: "analysis" | "format-only";
  slides?: {
    resultsVsExpectations?: {
      chartData: Array<{ metric: string; actual: number | null; estimate: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    growthBreakdown?: {
      companyAverageGrowthPct: number | null;
      chartData: Array<{ metric: string; growthPct: number | null; prevQuarterGrowthPct: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    profitabilityAndCash?: {
      chartData: Array<{ step: string; value: number | null }>;
      capex: { value: number | null; label: string };
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
    };
    risksAndSentiment?: {
      insight: string;
      bullets: string[];
      managementTone: "confident" | "defensive" | "cautious" | "mixed" | "uncertain";
      supportingQuotes?: string[];
    };
    forwardView?: {
      chartData: Array<{ metric: string; low: number | null; high: number | null; priorGuidanceMid: number | null; actual: number | null }>;
      insight: string;
      bullets: string[];
      supportingQuotes?: string[];
      finalSentence?: string;
      bullCase?: string[];
      bearCase?: string[];
    };
  };
};

type AnalyzeResponse = { analysis: EarningsScriptAnalysis };

const STORAGE_KEY = "earnings_script_analysis_latest_v1";
const HISTORY_KEY = "earnings_script_analysis_history_v1";

type ChartPoint = {
  label: string;
  value: number;
};

function toChartPoints(items: Array<{ finding: string; metric: string; context: string; investorImplication: string }> | undefined) {
  if (!items?.length) return [];
  return items
    .map((item) => {
      const match = item.metric.match(/-?\d+(?:\.\d+)?/);
      if (!match) return null;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return null;
      return {
        label: item.metric.slice(0, 26),
        value,
      } as ChartPoint;
    })
    .filter((row): row is ChartPoint => !!row)
    .slice(0, 5);
}

function MiniMetricChart({ title, data, color }: { title: string; data: ChartPoint[]; color: string }) {
  if (!data.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 22, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} height={40} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type InsightRow = { finding: string; metric: string; context: string; investorImplication: string };

function AnalystSection({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: InsightRow[] | undefined;
  emptyText: string;
}) {
  const normalized = rows ?? [];
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {normalized.length ? (
        <ul className="space-y-1">
          {normalized.map((item, index) => (
            <li key={`${title}-${index}`} className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
              <p><span className="font-semibold">{item.metric}:</span> {item.finding}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{item.context}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">Why it matters: {item.investorImplication}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">{emptyText}</div>
      )}
    </div>
  );
}

type SlideId = "results" | "growth" | "profitability" | "risks" | "forward";

function numericFromText(input: string): number | null {
  const match = input.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function transcriptQuotes(script: string, limit = 3): string[] {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 45 && s.length <= 220)
    .slice(0, limit);
}

function buildSlides(analysis: EarningsScriptAnalysis | null) {
  if (!analysis) return null;
  const provided = analysis.slides;
  const baseResults = {
    chartData: [
      { metric: "Revenue", actual: numericFromText(analysis.growth?.[0]?.metric ?? ""), estimate: null },
      { metric: "EPS", actual: numericFromText(analysis.profitability?.[0]?.metric ?? ""), estimate: null },
      { metric: "Cloud Revenue", actual: numericFromText(analysis.growth?.[1]?.metric ?? ""), estimate: null },
      { metric: "Operating Income", actual: numericFromText(analysis.profitability?.[1]?.metric ?? ""), estimate: null },
    ],
    insight: analysis.executiveTakeaway ?? analysis.summary ?? "",
    bullets: analysis.keySignals.slice(0, 3).map((x) => x.insight),
    supportingQuotes: transcriptQuotes(analysis.rawScriptPreview || "", 3),
  };
  const results = {
    chartData: provided?.resultsVsExpectations?.chartData?.length ? provided.resultsVsExpectations.chartData : baseResults.chartData,
    insight: provided?.resultsVsExpectations?.insight || baseResults.insight || "Beat/miss picture is neutral based on available metrics.",
    bullets: provided?.resultsVsExpectations?.bullets?.length ? provided.resultsVsExpectations.bullets : baseResults.bullets,
    supportingQuotes:
      provided?.resultsVsExpectations?.supportingQuotes?.length
        ? provided.resultsVsExpectations.supportingQuotes
        : baseResults.supportingQuotes,
  };

  const baseGrowth = {
    companyAverageGrowthPct: numericFromText(analysis.growth?.[0]?.metric ?? ""),
    chartData: [
      ...(analysis.growth ?? []).slice(0, 5).map((item, idx) => ({
        metric: item.metric || `Metric ${idx + 1}`,
        growthPct: numericFromText(item.metric),
        prevQuarterGrowthPct: null,
      })),
    ],
    insight: analysis.growth?.[0]?.investorImplication ?? "",
    bullets: (analysis.growth ?? []).slice(0, 3).map((x) => x.finding),
    supportingQuotes: transcriptQuotes(analysis.rawScriptPreview || "", 3),
  };
  const growth = {
    companyAverageGrowthPct:
      provided?.growthBreakdown?.companyAverageGrowthPct ?? baseGrowth.companyAverageGrowthPct,
    chartData: provided?.growthBreakdown?.chartData?.length ? provided.growthBreakdown.chartData : baseGrowth.chartData,
    insight:
      provided?.growthBreakdown?.insight ||
      baseGrowth.insight ||
      "Growth momentum is mixed; focus on segments above company-average expansion.",
    bullets: provided?.growthBreakdown?.bullets?.length ? provided.growthBreakdown.bullets : baseGrowth.bullets,
    supportingQuotes:
      provided?.growthBreakdown?.supportingQuotes?.length
        ? provided.growthBreakdown.supportingQuotes
        : baseGrowth.supportingQuotes,
  };

  const baseProfitability = {
    chartData: [
      { step: "Revenue", value: numericFromText(analysis.growth?.[0]?.metric ?? "") },
      { step: "Gross Profit", value: numericFromText(analysis.profitability?.[0]?.metric ?? "") },
      { step: "Operating Income", value: numericFromText(analysis.profitability?.[1]?.metric ?? "") },
      { step: "Net Income", value: numericFromText(analysis.profitability?.[2]?.metric ?? "") },
      { step: "FCF", value: numericFromText(analysis.investment?.[0]?.metric ?? "") },
    ],
    capex: { value: numericFromText(analysis.investment?.[0]?.metric ?? ""), label: "CapEx" },
    insight: analysis.profitability?.[0]?.investorImplication ?? "",
    bullets: (analysis.profitability ?? []).slice(0, 3).map((x) => x.finding),
    supportingQuotes: transcriptQuotes(analysis.rawScriptPreview || "", 3),
  };
  const profitability = {
    chartData:
      provided?.profitabilityAndCash?.chartData?.length ? provided.profitabilityAndCash.chartData : baseProfitability.chartData,
    capex: provided?.profitabilityAndCash?.capex ?? baseProfitability.capex,
    insight:
      provided?.profitabilityAndCash?.insight ||
      baseProfitability.insight ||
      "Margin conversion and cash generation should be monitored for earnings quality.",
    bullets:
      provided?.profitabilityAndCash?.bullets?.length ? provided.profitabilityAndCash.bullets : baseProfitability.bullets,
    supportingQuotes:
      provided?.profitabilityAndCash?.supportingQuotes?.length
        ? provided.profitabilityAndCash.supportingQuotes
        : baseProfitability.supportingQuotes,
  };

  const baseForward = {
    chartData: [
      { metric: "Revenue", low: null, high: null, priorGuidanceMid: null, actual: numericFromText(analysis.growth?.[0]?.metric ?? "") },
      { metric: "COGS", low: null, high: null, priorGuidanceMid: null, actual: numericFromText(analysis.riskAnalysis?.[0]?.metric ?? "") },
      { metric: "OpEx", low: null, high: null, priorGuidanceMid: null, actual: numericFromText(analysis.investment?.[0]?.metric ?? "") },
    ],
    insight: analysis.changeDetection?.priorityShift ?? "",
    bullets: (analysis.changeDetection?.newThisQuarter ?? []).slice(0, 3),
    supportingQuotes: transcriptQuotes(analysis.rawScriptPreview || "", 3),
  };
  const forward = {
    chartData: provided?.forwardView?.chartData?.length ? provided.forwardView.chartData : baseForward.chartData,
    insight:
      provided?.forwardView?.insight ||
      baseForward.insight ||
      analysis.executiveTakeaway ||
      "Guidance posture is cautious with limited quantified range detail.",
    bullets: provided?.forwardView?.bullets?.length ? provided.forwardView.bullets : baseForward.bullets,
    supportingQuotes:
      provided?.forwardView?.supportingQuotes?.length
        ? provided.forwardView.supportingQuotes
        : baseForward.supportingQuotes,
    finalSentence:
      provided?.forwardView?.finalSentence ||
      `${analysis.companyFocus || "Company"} is prioritizing execution, driven by core growth engines, while facing margin and demand tradeoffs.`,
    bullCase:
      provided?.forwardView?.bullCase?.length
        ? provided.forwardView.bullCase
        : (analysis.investorBrain?.bullCaseDouble ?? []).slice(0, 3),
    bearCase:
      provided?.forwardView?.bearCase?.length
        ? provided.forwardView.bearCase
        : (analysis.investorBrain?.bearCase30Drawdown ?? []).slice(0, 3),
  };

  const risks = {
    insight:
      provided?.risksAndSentiment?.insight ||
      analysis.riskAnalysis?.[0]?.investorImplication ||
      "Risk profile reflects concentration and cost sensitivity, which can pressure valuation resilience.",
    bullets:
      provided?.risksAndSentiment?.bullets?.length
        ? provided.risksAndSentiment.bullets
        : [
            ...(analysis.riskAnalysis ?? []).slice(0, 2).map((x) => x.finding),
            ...(analysis.managementTone?.evidence ?? []).slice(0, 1).map((x) => `Tone signal: ${x}`),
          ],
    supportingQuotes:
      provided?.risksAndSentiment?.supportingQuotes?.length
        ? provided.risksAndSentiment.supportingQuotes
        : transcriptQuotes(analysis.rawScriptPreview || "", 3),
    managementTone:
      provided?.risksAndSentiment?.managementTone ||
      (analysis.managementTone?.tone === "uncertain" ? "mixed" : analysis.managementTone?.tone || "uncertain"),
  };

  return { results, growth, profitability, risks, forward };
}

function buildAdditionalInsights(analysis: EarningsScriptAnalysis | null): string[] {
  if (!analysis) return [];
  const fromSignals = (analysis.keySignals ?? []).map((s) => s.insight);
  const fromDemand = (analysis.demandSignals ?? []).map((s) => `${s.finding} (${s.metric})`);
  const fromRisk = (analysis.riskAnalysis ?? []).map((s) => `Risk: ${s.finding}`);
  const fromChange = [
    ...(analysis.changeDetection?.newThisQuarter ?? []).map((x) => `New focus: ${x}`),
    ...(analysis.changeDetection?.stoppedTalkingAbout ?? []).map((x) => `De-emphasized: ${x}`),
  ];
  return [...fromSignals, ...fromDemand, ...fromRisk, ...fromChange]
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function buildKeyFinancialRows(analysis: EarningsScriptAnalysis | null): Array<{ metric: string; value: string; context: string }> {
  if (!analysis) return [];
  const rows = (analysis.extractedMetrics ?? [])
    .map((row) => ({
      metric: (row.metric ?? "").trim(),
      value: (row.value ?? "").trim(),
      context: (row.context ?? "").trim(),
    }))
    .filter((row) => row.metric && row.value);
  return rows.slice(0, 14);
}

function formatTranscriptText(input: string): string {
  const collapsed = input
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const speakerBroken = collapsed.replace(
    /\s*((?:Operator|Analyst|Question|Answer|CEO|CFO|COO|President|Chairman|Moderator)\s*:)/gi,
    "\n\n$1"
  );

  const paragraphs: string[] = [];
  for (const block of speakerBroken.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.length <= 700) {
      paragraphs.push(trimmed);
      continue;
    }
    const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
    if (sentences.length <= 1) {
      paragraphs.push(trimmed);
      continue;
    }
    for (let i = 0; i < sentences.length; i += 4) {
      paragraphs.push(sentences.slice(i, i + 4).join(" "));
    }
  }

  return paragraphs.join("\n\n");
}

function buildFormatOnlyResult(text: string, source: EarningsScriptAnalysis["source"]): EarningsScriptAnalysis {
  const generatedAt = new Date().toISOString();
  return {
    sessionTitle: "Reorganized Transcript",
    companyFocus: "Transcript",
    quarter: "Input Document",
    summary: "",
    executiveTakeaway: "",
    growth: [],
    profitability: [],
    investment: [],
    riskAnalysis: [],
    demandSignals: [],
    keySignals: [],
    macroSignals: [],
    competitorMentions: [],
    risks: [],
    opportunities: [],
    managementTone: { tone: "uncertain", specificity: "low", evidence: [] },
    changeDetection: { newThisQuarter: [], stoppedTalkingAbout: [], priorityShift: "" },
    investorBrain: {
      biggestWorry: "",
      bearCase30Drawdown: [],
      bullCaseDouble: [],
      growthCycleStage: "uncertain",
      storyVsMachine: "mixed",
    },
    watchList: [],
    extractedMetrics: [],
    generatedAt,
    source,
    rawScriptPreview: formatTranscriptText(text).slice(0, 50000),
    processingMode: "format-only",
  };
}

function saveHistory(entry: EarningsScriptAnalysis) {
  if (typeof window === "undefined") return;
  const current = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as EarningsScriptAnalysis[];
  const next = [entry, ...current].slice(0, 15);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  window.dispatchEvent(new CustomEvent("earnings-analysis-updated", { detail: entry }));
}

export function getLatestEarningsAnalysisClient(): EarningsScriptAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EarningsScriptAnalysis) : null;
  } catch {
    return null;
  }
}

export function EarningsScriptAnalysisPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const resultId = searchParams.get("id");
  const showResultScreen = view === "result";
  const [inputMode, setInputMode] = useState<"paste" | "pdf">("paste");
  const [script, setScript] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [dragOverPdf, setDragOverPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<EarningsScriptAnalysis | null>(null);
  const [history, setHistory] = useState<EarningsScriptAnalysis[]>([]);
  const [activeSlide, setActiveSlide] = useState<SlideId>("results");
  const growthChartData = useMemo(() => toChartPoints(latest?.growth), [latest?.growth]);
  const profitabilityChartData = useMemo(() => toChartPoints(latest?.profitability), [latest?.profitability]);
  const investmentChartData = useMemo(() => toChartPoints(latest?.investment), [latest?.investment]);
  const slideDeck = useMemo(() => buildSlides(latest), [latest]);
  const additionalInsights = useMemo(() => buildAdditionalInsights(latest), [latest]);
  const keyFinancialRows = useMemo(() => buildKeyFinancialRows(latest), [latest]);

  const loadFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const rawLatest = localStorage.getItem(STORAGE_KEY);
      const rawHistory = localStorage.getItem(HISTORY_KEY);
      setLatest(rawLatest ? (JSON.parse(rawLatest) as EarningsScriptAnalysis) : null);
      setHistory(rawHistory ? (JSON.parse(rawHistory) as EarningsScriptAnalysis[]) : []);
    } catch {
      setLatest(null);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!showResultScreen || !resultId || history.length === 0) return;
    const match = history.find((entry) => entry.generatedAt === resultId);
    if (match) setLatest(match);
  }, [showResultScreen, resultId, history]);

  const canAnalyze = useMemo(() => {
    if (inputMode === "paste") return script.trim().length >= 300;
    return !!pdfFile;
  }, [inputMode, pdfFile, script]);
  const canFormatOnly = useMemo(() => {
    if (inputMode === "paste") return script.trim().length >= 80;
    return !!pdfFile;
  }, [inputMode, pdfFile, script]);

  const assignPdfFile = useCallback((file: File | null | undefined) => {
    setPdfFile(null);
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    setPdfFile(file);
  }, []);

  const analyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let payload: { script?: string; text?: string; sourceHint?: string } = {};
      if (inputMode === "paste") {
        payload = { script: script.trim(), sourceHint: "user-input" };
      } else {
        if (!pdfFile) throw new Error("Please upload a PDF file first.");
        const extracted = await extractPdfLines(pdfFile);
        payload = {
          text: extracted.fullText,
          sourceHint: "earnings-call-transcript",
        };
      }

      const response = await fetch("/api/earnings-script-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json().catch(() => ({}))) as Partial<AnalyzeResponse> & { error?: string };
      if (!response.ok || !responsePayload.analysis) {
        throw new Error(responsePayload.error || `HTTP ${response.status}`);
      }

      saveHistory(responsePayload.analysis);
      setLatest(responsePayload.analysis);
      setHistory((current) => [responsePayload.analysis!, ...current].slice(0, 15));
      setScript("");
      setPdfFile(null);
      router.push(`/earnings-analysis?view=result&id=${encodeURIComponent(responsePayload.analysis.generatedAt)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to analyze script");
    } finally {
      setLoading(false);
    }
  }, [inputMode, pdfFile, router, script]);

  const reorganizeTextOnly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let sourceText = "";
      let sourceHint: EarningsScriptAnalysis["source"] = "user-input";
      if (inputMode === "paste") {
        sourceText = script.trim();
      } else {
        if (!pdfFile) throw new Error("Please upload a PDF file first.");
        const extracted = await extractPdfLines(pdfFile);
        sourceText = extracted.fullText;
        sourceHint = "earnings-call-transcript";
      }
      if (!sourceText || sourceText.length < 80) {
        throw new Error("Text is too short to reorganize.");
      }
      const formatted = buildFormatOnlyResult(sourceText, sourceHint);
      saveHistory(formatted);
      setLatest(formatted);
      setHistory((current) => [formatted, ...current].slice(0, 15));
      setScript("");
      setPdfFile(null);
      router.push(`/earnings-analysis?view=result&id=${encodeURIComponent(formatted.generatedAt)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to reorganize text");
    } finally {
      setLoading(false);
    }
  }, [inputMode, pdfFile, router, script]);

  const isFormatOnly = latest?.processingMode === "format-only";

  return (
    <div className={`mx-auto w-full space-y-4 px-4 py-5 ${showResultScreen ? "max-w-[96vw]" : ""}`}>
      {!showResultScreen ? (
        <AnalyzeLandingShell
          eyebrow="Earnings Script"
          title="Analyze transcripts & scripts"
          subtitle={
            <>
              Paste Yahoo-style call text or upload a{" "}
              <strong className="font-semibold text-slate-800">transcript PDF</strong>. Slides-ready themes, KPI callouts,
              tone, bull/bear, and exports—without losing the messy source.
            </>
          }
          heroActions={
            <button
              type="button"
              onClick={loadFromStorage}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh saved analyses
            </button>
          }
          left={
            <div className="flex min-h-0 flex-1 flex-col gap-5">
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("paste");
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                    inputMode === "paste"
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  Paste transcript
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode("pdf");
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                    inputMode === "pdf"
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  Upload PDF
                </button>
              </div>

              {inputMode === "paste" ? (
                <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white/90 shadow-inner">
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    placeholder="Paste full earnings transcript (Yahoo Finance format supported)…"
                    className="min-h-[16rem] w-full flex-1 resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary/15"
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => pdfInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pdfInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverPdf(true);
                  }}
                  onDragLeave={() => setDragOverPdf(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverPdf(false);
                    assignPdfFile(e.dataTransfer.files?.[0]);
                  }}
                  aria-label="Upload earnings transcript PDF"
                  className={cn(
                    "flex min-h-[12rem] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:min-h-[14rem]",
                    dragOverPdf
                      ? "border-primary bg-primary/[0.06] shadow-subtle"
                      : "border-slate-200 bg-white/85 shadow-inner hover:border-primary/35 hover:bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex h-12 w-12 items-center justify-center rounded-2xl sm:h-14 sm:w-14",
                      dragOverPdf ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <FileUp className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 sm:text-base">
                    {pdfFile ? pdfFile.name : "Drop transcript PDF here or click to browse"}
                  </p>
                  <p className="max-w-sm text-xs text-slate-500 sm:text-sm">
                    Parsed locally like Quick Analyze—you keep Q&A synced with the extracted source text.
                  </p>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(event) => assignPdfFile(event.target.files?.[0])}
                  />
                </div>
              )}

              <div className="flex flex-shrink-0 flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {inputMode === "paste"
                    ? `${script.trim().length} characters (min ~300 for full analysis)`
                    : pdfFile
                      ? pdfFile.name
                      : "No file selected"}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={reorganizeTextOnly}
                    disabled={!canFormatOnly || loading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-subtle hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Reorganize text only
                  </button>
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={!canAnalyze || loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 sm:text-sm"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Analyze script
                  </button>
                </div>
              </div>

              {error ? (
                <div className="inline-flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          }
          sidebar={
            <>
              <p className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Sparkles className="h-3 w-3" aria-hidden />
                What happens next
              </p>
              <ol className="mt-4 space-y-3 text-sm">
                <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="font-semibold text-slate-900">1) Normalize the source</p>
                  <p className="mt-1 text-xs text-slate-600">
                    PDFs are OCR-free text extraction in-browser; pasted transcripts skip file handling entirely.
                  </p>
                </li>
                <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="font-semibold text-slate-900">2) Extract what investors care about</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Signals, KPI table, bull/bear, risks, macro hooks, tone, guidance deltas—paired with supporting
                    quotes when available.
                  </p>
                </li>
                <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="font-semibold text-slate-900">3) Slide-ready review</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Open the structured deck tabs, skim charts, export talking points—or jump back to reorganize-only
                    cleanup.
                  </p>
                </li>
              </ol>
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                <p className="inline-flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Pro tip
                </p>
                <p className="mt-1 leading-relaxed">
                  Prefer the{" "}
                  <strong className="font-semibold text-emerald-900">vendor PDF transcript</strong> when
                  speaker tags matter—pure paste loses page anchors but is fastest for long calls.
                </p>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Working spreadsheets? Use{" "}
                <Link href="/excel-analyze" className="font-semibold text-primary hover:underline">
                  Excel Analyze
                </Link>{" "}
                for model-driven commentary.
              </p>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500">
                <FileScan className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Workflow stays aligned with Workspace overlays when saved locally.
              </div>
            </>
          }
        />
      ) : null}

      {showResultScreen && latest ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{latest.sessionTitle}</p>
            <button
              type="button"
              onClick={() => router.push("/earnings-analysis")}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              New Analysis
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {latest.companyFocus} • {latest.quarter} • {new Date(latest.generatedAt).toLocaleString("en-US")}
          </p>
          {isFormatOnly ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source Text</p>
              <p className="max-h-[74vh] overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-relaxed text-slate-700">
                {(latest.rawScriptPreview || "").trim() || "Transcript preview unavailable."}
              </p>
            </div>
          ) : (
            <div className="mt-3 grid min-h-[78vh] gap-4 xl:grid-cols-[1.2fr_1.1fr]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source Text</p>
                <p className="max-h-[74vh] overflow-y-auto whitespace-pre-wrap pr-2 text-xs leading-relaxed text-slate-700">
                  {(latest.rawScriptPreview || "").trim() || "Transcript preview unavailable."}
                </p>
              </div>

              <div className="max-h-[74vh] space-y-3 overflow-y-auto pr-1">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {[
                      { id: "results" as const, label: "Results & Expectations" },
                      { id: "growth" as const, label: "Growth Breakdown" },
                      { id: "profitability" as const, label: "Profitability & Cash" },
                      { id: "risks" as const, label: "Risks & Sentiment" },
                      { id: "forward" as const, label: "Forward View" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveSlide(tab.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          activeSlide === tab.id
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {slideDeck && activeSlide === "results" ? (
                    <div className="space-y-3">
                      <div className="h-64 rounded border border-slate-200 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={slideDeck.results.chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar name="Actual" dataKey="actual" fill="#16a34a" />
                            <Bar name="Estimate" dataKey="estimate" fill="#94a3b8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">{slideDeck.results.insight || "No insight extracted."}</div>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {slideDeck.results.bullets.slice(0, 3).map((b, i) => <li key={`r-${i}`} className="rounded bg-slate-50 px-2 py-1">- {b}</li>)}
                      </ul>
                      {(slideDeck.results.supportingQuotes ?? []).length > 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Transcript Sentences</p>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {(slideDeck.results.supportingQuotes ?? []).slice(0, 3).map((q, i) => (
                              <li key={`rq-${i}`} className="rounded bg-slate-50 px-2 py-1">"{q}"</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {slideDeck && activeSlide === "growth" ? (
                    <div className="space-y-3">
                      <div className="h-64 rounded border border-slate-200 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={slideDeck.growth.chartData} layout="vertical" margin={{ left: 40, right: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="metric" tick={{ fontSize: 10 }} width={120} />
                            <Tooltip />
                            {slideDeck.growth.companyAverageGrowthPct != null ? (
                              <ReferenceLine x={slideDeck.growth.companyAverageGrowthPct} stroke="#0f172a" strokeDasharray="4 4" />
                            ) : null}
                            <Bar dataKey="growthPct" radius={[0, 4, 4, 0]}>
                              {slideDeck.growth.chartData.map((row, idx) => {
                                const accel =
                                  row.growthPct != null && row.prevQuarterGrowthPct != null
                                    ? row.growthPct - row.prevQuarterGrowthPct
                                    : 0;
                                return <Cell key={`g-${idx}`} fill={accel > 0 ? "#1d4ed8" : "#93c5fd"} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">{slideDeck.growth.insight || "No insight extracted."}</div>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {slideDeck.growth.bullets.slice(0, 3).map((b, i) => <li key={`g-${i}`} className="rounded bg-slate-50 px-2 py-1">- {b}</li>)}
                      </ul>
                      {(slideDeck.growth.supportingQuotes ?? []).length > 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Transcript Sentences</p>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {(slideDeck.growth.supportingQuotes ?? []).slice(0, 3).map((q, i) => (
                              <li key={`gq-${i}`} className="rounded bg-slate-50 px-2 py-1">"{q}"</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {slideDeck && activeSlide === "profitability" ? (
                    <div className="space-y-3">
                      <div className="h-64 rounded border border-slate-200 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={slideDeck.profitability.chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="step" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="value">
                              {slideDeck.profitability.chartData.map((row, idx) => (
                                <Cell key={`p-${idx}`} fill={idx === 0 ? "#16a34a" : idx < 4 ? "#f59e0b" : "#0ea5e9"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {slideDeck.profitability.insight || "No insight extracted."}{" "}
                        {slideDeck.profitability.capex.value != null ? `CapEx: ${slideDeck.profitability.capex.value}.` : ""}
                      </div>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {slideDeck.profitability.bullets.slice(0, 3).map((b, i) => <li key={`p-${i}`} className="rounded bg-slate-50 px-2 py-1">- {b}</li>)}
                      </ul>
                      {(slideDeck.profitability.supportingQuotes ?? []).length > 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Transcript Sentences</p>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {(slideDeck.profitability.supportingQuotes ?? []).slice(0, 3).map((q, i) => (
                              <li key={`pq-${i}`} className="rounded bg-slate-50 px-2 py-1">"{q}"</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {slideDeck && activeSlide === "risks" ? (
                    <div className="space-y-3">
                      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {slideDeck.risks.insight}
                      </div>
                      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        Management tone: <span className="font-semibold">{slideDeck.risks.managementTone}</span>
                      </div>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {slideDeck.risks.bullets.slice(0, 3).map((b, i) => (
                          <li key={`risk-${i}`} className="rounded bg-slate-50 px-2 py-1">- {b}</li>
                        ))}
                      </ul>
                      {(slideDeck.risks.supportingQuotes ?? []).length > 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Transcript Sentences</p>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {(slideDeck.risks.supportingQuotes ?? []).slice(0, 3).map((q, i) => (
                              <li key={`riskq-${i}`} className="rounded bg-slate-50 px-2 py-1">"{q}"</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {slideDeck && activeSlide === "forward" ? (
                    <div className="space-y-3">
                      <div className="h-64 rounded border border-slate-200 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={slideDeck.forward.chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="metric" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar name="Guidance Low" dataKey="low" fill="#cbd5e1" />
                            <Bar name="Guidance High" dataKey="high" fill="#64748b" />
                            <Scatter name="Actual" dataKey="actual" fill="#16a34a" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-700">{slideDeck.forward.insight || "No insight extracted."}</div>
                      <ul className="space-y-1 text-xs text-slate-700">
                        {slideDeck.forward.bullets.slice(0, 3).map((b, i) => <li key={`f-${i}`} className="rounded bg-slate-50 px-2 py-1">- {b}</li>)}
                      </ul>
                      {(slideDeck.forward.supportingQuotes ?? []).length > 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Transcript Sentences</p>
                          <ul className="space-y-1 text-xs text-slate-700">
                            {(slideDeck.forward.supportingQuotes ?? []).slice(0, 3).map((q, i) => (
                              <li key={`fq-${i}`} className="rounded bg-slate-50 px-2 py-1">"{q}"</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        <span className="font-semibold">Investment view:</span> {slideDeck.forward.finalSentence}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Bull Case</p>
                          <ul className="space-y-1 text-xs text-emerald-900">
                            {(slideDeck.forward.bullCase ?? []).slice(0, 3).map((b, i) => (
                              <li key={`bull-${i}`}>- {b}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Bear Case</p>
                          <ul className="space-y-1 text-xs text-rose-900">
                            {(slideDeck.forward.bearCase ?? []).slice(0, 3).map((b, i) => (
                              <li key={`bear-${i}`}>- {b}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                {keyFinancialRows.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key Financial Data</p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-2 py-1 text-left font-semibold text-slate-600">Metric</th>
                            <th className="px-2 py-1 text-left font-semibold text-slate-600">Value</th>
                            <th className="px-2 py-1 text-left font-semibold text-slate-600">Context</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keyFinancialRows.map((row, idx) => (
                            <tr key={`${row.metric}-${idx}`} className="border-b border-slate-100">
                              <td className="px-2 py-1 text-slate-800">{row.metric}</td>
                              <td className="px-2 py-1 text-slate-900">{row.value}</td>
                              <td className="px-2 py-1 text-slate-600">{row.context || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                {additionalInsights.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Additional Insights</p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {additionalInsights.map((line, idx) => (
                        <li key={`${line}-${idx}`} className="rounded bg-slate-50 px-2 py-1">- {line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showResultScreen && !latest ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-subtle">
          No analysis found for this session. Start a new analysis to continue.
        </div>
      ) : null}

      {history.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
          <p className="mb-2 text-sm font-semibold text-slate-900">Recent Sessions</p>
          <div className="space-y-1.5">
            {history.slice(0, 6).map((entry, index) => (
              <button
                key={`${entry.generatedAt}-${index}`}
                type="button"
                onClick={() => router.push(`/earnings-analysis?view=result&id=${encodeURIComponent(entry.generatedAt)}`)}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-slate-100"
              >
                <p className="font-semibold text-slate-800">{entry.sessionTitle}</p>
                <p className="text-[11px] text-slate-500">{entry.companyFocus} • {entry.quarter}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

