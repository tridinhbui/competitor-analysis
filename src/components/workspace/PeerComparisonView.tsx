"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PanelLeftClose, PanelLeftOpen, Search, TrendingUp, UploadCloud, X, Trash2 } from "lucide-react";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";
import { ComparisonReportContent, buildComparisonExportHref } from "@/components/workspace/ComparisonReportContent";
import { analyzePdf } from "@/lib/pdfAnalysis";
import type { FullAnalysis } from "@/types/analysis";
import { normalizeCompanyName, resolveTicker } from "@/lib/filingIdentity";

interface CompanyOption {
  ticker: string;
  name: string;
}

interface RegistryResponse {
  companies: Array<{ ticker: string; name: string }>;
}

interface ParsedEntry {
  analysis: FullAnalysis;
  resolvedTicker: string;
  resolvedCompanyName: string;
  sourceFileName: string;
}

interface SetupCompanySlot {
  mode: "existing" | "new";
  existingTicker: string;
  newName: string;
}

const MAX_COMPARISON_COMPANIES = 2;
const NEW_COMPANY_VALUE = "__NEW_COMPANY__";

function slugTickerFromName(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!letters) return "";
  return letters.slice(0, 5);
}

function uniqueTickers(list: string[]): string[] {
  return [...new Set(list.map((t) => t.trim().toUpperCase()).filter(Boolean))];
}

function rankParsedTickers(entries: ParsedEntry[], limit: number): string[] {
  const counts = entries.reduce((acc, entry) => {
    const ticker = (entry.resolvedTicker || "UNKNOWN").toUpperCase();
    if (ticker !== "UNKNOWN") {
      acc[ticker] = (acc[ticker] ?? 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([ticker]) => ticker);
}

type QuarterKey = "Q1" | "Q2" | "Q3" | "Q4" | "Unknown";

function detectQuarterFromText(value?: string): QuarterKey {
  if (!value) return "Unknown";
  const normalized = value.toUpperCase();
  const explicit = normalized.match(/\bQ([1-4])\b/);
  if (explicit) return `Q${explicit[1]}` as QuarterKey;
  const fiscalStyle = normalized.match(/\bFY\d{2,4}\s*Q([1-4])\b/);
  if (fiscalStyle) return `Q${fiscalStyle[1]}` as QuarterKey;
  const wordStyle = normalized.match(/\b([1-4])(?:ST|ND|RD|TH)?\s+QUARTER\b/);
  if (wordStyle) return `Q${wordStyle[1]}` as QuarterKey;
  return "Unknown";
}

function detectQuarterFromPeriodEnd(periodEnd?: string): QuarterKey {
  if (!periodEnd) return "Unknown";
  const isoLike = periodEnd.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashLike = periodEnd.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const compactLike = periodEnd.match(/^(\d{4})(\d{2})(\d{2})$/);
  const month = isoLike
    ? Number(isoLike[2])
    : slashLike
      ? Number(slashLike[1])
      : compactLike
        ? Number(compactLike[2])
        : Number.NaN;
  if (month >= 1 && month <= 3) return "Q1";
  if (month >= 4 && month <= 6) return "Q2";
  if (month >= 7 && month <= 9) return "Q3";
  if (month >= 10 && month <= 12) return "Q4";
  return "Unknown";
}

function resolveQuarterKey(entry: ParsedEntry): QuarterKey {
  const fromSourceFile = detectQuarterFromText(entry.sourceFileName);
  if (fromSourceFile !== "Unknown") return fromSourceFile;
  const fromMetaFile = detectQuarterFromText(entry.analysis.meta.fileName);
  if (fromMetaFile !== "Unknown") return fromMetaFile;
  return detectQuarterFromPeriodEnd(entry.analysis.meta.periodEnd);
}

interface PeerComparisonViewProps {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onRegistryChanged?: () => void | Promise<void>;
  newThreadSignal?: number;
  onComparisonRecorded?: (label: string) => void;
}

export function PeerComparisonView({
  sidebarCollapsed = false,
  onToggleSidebar,
  onRegistryChanged,
  newThreadSignal = 0,
  onComparisonRecorded,
}: PeerComparisonViewProps) {
  type Mode = "setup" | "analysis";
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("analysis");
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompanyComparisonPayload | null>(null);
  const setupCompanyCount = MAX_COMPARISON_COMPANIES;
  const currentYear = new Date().getFullYear();
  const minStartYear = 2020;
  const [setupStartYear, setSetupStartYear] = useState(Math.max(currentYear - 1, minStartYear));
  const [setupEndYear, setSetupEndYear] = useState(currentYear);
  const [setupCompanies, setSetupCompanies] = useState<SetupCompanySlot[]>([
    { mode: "existing", existingTicker: "", newName: "" },
    { mode: "existing", existingTicker: "", newName: "" },
  ]);

  // Full-screen guidance state
  const [showGuidance, setShowGuidance] = useState(false);
  const [guidanceStep, setGuidanceStep] = useState<1 | 2 | 3 | 4>(1);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [parsedAnalyses, setParsedAnalyses] = useState<ParsedEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceStatus, setGuidanceStatus] = useState("");
  const [clearingAll, setClearingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadOptions = useCallback(async () => {
    setLoadingOpts(true);
    try {
      const response = await fetch("/api/filings");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: RegistryResponse = await response.json();
      const nextOptions = [...(data.companies ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((company) => ({ ticker: company.ticker, name: company.name }));

      setOptions(nextOptions);
      if (nextOptions.length > 0) {
        setSelectedTickers((current) => {
          if (current.length > 0) return current;
          if (nextOptions.length === 1) return [nextOptions[0].ticker];
          return [nextOptions[0].ticker, nextOptions[1].ticker];
        });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load companies");
    } finally {
      setLoadingOpts(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!showGuidance) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showGuidance]);

  useEffect(() => {
    if (newThreadSignal <= 0) return;
    // "+" = create new thread and reset to setup mode.
    setMode("setup");
    setError("");
    setResult(null);
    setSelectedTickers([]);
    setQueuedFiles([]);
    setParsedAnalyses([]);
    setSetupCompanies(
      Array.from({ length: setupCompanyCount }, (_, index) => ({
        mode: "existing",
        existingTicker: options[index]?.ticker ?? "",
        newName: "",
      }))
    );
    setGuidanceStatus("");
    setShowGuidance(false);
    setGuidanceStep(1);
  }, [newThreadSignal, options, setupCompanyCount]);

  useEffect(() => {
    setSetupCompanies((current) => {
      return Array.from({ length: setupCompanyCount }, (_, idx) => {
        const existing = current[idx];
        if (existing) return existing;
        return {
          mode: "existing",
          existingTicker: options[idx]?.ticker ?? "",
          newName: "",
        };
      });
    });
  }, [options, setupCompanyCount]);

  useEffect(() => {
    setSelectedTickers((current) => {
      const available = options.map((option) => option.ticker);
      const targetCount = Math.min(MAX_COMPARISON_COMPANIES, available.length);
      const next = uniqueTickers(current).filter((ticker) => available.includes(ticker));

      for (const ticker of available) {
        if (next.length >= targetCount) break;
        if (!next.includes(ticker)) next.push(ticker);
      }

      if (next.length === current.length && next.every((ticker, index) => ticker === current[index])) {
        return current;
      }

      return next.slice(0, targetCount);
    });
  }, [options]);

  const hasDuplicateSelection = new Set(selectedTickers).size !== selectedTickers.length;
  const yearCount = setupEndYear - setupStartYear + 1;
  const resolvedSetupCompanies = useMemo(() => {
    return setupCompanies
      .slice(0, setupCompanyCount)
      .map((entry, index) => {
        if (entry.mode === "new") {
          const name = entry.newName.trim();
          const ticker = slugTickerFromName(name);
          return {
            index,
            mode: entry.mode,
            ticker,
            name,
            valid: Boolean(name && ticker),
          };
        }
        const ticker = entry.existingTicker.trim().toUpperCase();
        const company = options.find((candidate) => candidate.ticker === ticker);
        return {
          index,
          mode: entry.mode,
          ticker,
          name: company?.name ?? ticker,
          valid: Boolean(company && ticker),
        };
      });
  }, [options, setupCompanies, setupCompanyCount]);
  const expectedFileCount = setupCompanyCount * yearCount * 4;

  const updateRow = useCallback((index: number, ticker: string) => {
    setSelectedTickers((rows) => {
      const next = [...rows];
      next[index] = ticker;
      return next;
    });
  }, []);

  const updateSetupCompany = useCallback((index: number, update: Partial<SetupCompanySlot>) => {
    setSetupCompanies((rows) => {
      const next = [...rows];
      const current = next[index] ?? {
        mode: "existing" as const,
        existingTicker: "",
        newName: "",
      };
      next[index] = { ...current, ...update };
      return next;
    });
  }, []);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next = Array.from(incoming).filter((file) => file.type === "application/pdf");
    if (next.length === 0) return;
    setQueuedFiles((current) => [...current, ...next]);
  }, []);

  const removeQueuedFile = useCallback((idx: number) => {
    setQueuedFiles((current) => current.filter((_, index) => index !== idx));
  }, []);

  const parseDroppedFiles = useCallback(async (): Promise<ParsedEntry[]> => {
    if (queuedFiles.length === 0) {
      setParsedAnalyses([]);
      return [];
    }

    setGuidanceLoading(true);
    setError("");
    const analyses: ParsedEntry[] = [];
    try {
      for (let i = 0; i < queuedFiles.length; i += 1) {
        const file = queuedFiles[i];
        setGuidanceStatus(`Parsing ${i + 1}/${queuedFiles.length}: ${file.name}`);
        const analysis = await analyzePdf(file, () => {});
        const resolvedTicker = resolveTicker({
          inputTicker: undefined,
          metaTicker: analysis.meta.ticker,
          fileName: file.name,
          companyName: analysis.meta.companyName,
        });
        const resolvedCompanyName = normalizeCompanyName({
          candidate: analysis.meta.companyName,
          fileName: file.name,
          ticker: resolvedTicker,
        });
        analyses.push({
          analysis: {
            ...analysis,
            meta: {
              ...analysis.meta,
              ticker: resolvedTicker,
              companyName: resolvedCompanyName,
              fileName: analysis.meta.fileName ?? file.name,
            },
          },
          resolvedTicker,
          resolvedCompanyName,
          sourceFileName: file.name,
        });
      }
      setParsedAnalyses(analyses);
      return analyses;
    } finally {
      setGuidanceLoading(false);
    }
  }, [queuedFiles]);

  const parsedCompanyStats = parsedAnalyses.reduce(
    (acc, entry) => {
      const fallbackTicker = resolveTicker({
        inputTicker: undefined,
        metaTicker: entry.analysis?.meta?.ticker,
        fileName: entry.sourceFileName ?? entry.analysis?.meta?.fileName,
        companyName: entry.analysis?.meta?.companyName,
      });
      const ticker = (entry.resolvedTicker || fallbackTicker || "UNKNOWN").toUpperCase();
      const name =
        entry.resolvedCompanyName ||
        normalizeCompanyName({
          candidate: entry.analysis?.meta?.companyName,
          fileName: entry.sourceFileName ?? entry.analysis?.meta?.fileName,
          ticker,
        });
      const periodYear = entry.analysis?.meta?.periodEnd?.slice(0, 4) ?? "N/A";
      if (!acc.byTicker[ticker]) {
        acc.byTicker[ticker] = { ticker, name, files: 0, years: new Set<string>() };
      }
      acc.byTicker[ticker].files += 1;
      acc.byTicker[ticker].years.add(periodYear);
      return acc;
    },
    { byTicker: {} as Record<string, { ticker: string; name: string; files: number; years: Set<string> }> }
  );

  const parsedCompanyList = Object.values(parsedCompanyStats.byTicker).sort((a, b) => b.files - a.files);
  const maxCompanyFiles = Math.max(...parsedCompanyList.map((entry) => entry.files), 1);

  const yearDistribution = parsedAnalyses.reduce(
    (acc, entry) => {
      const ticker = (entry.resolvedTicker || "UNKNOWN").toUpperCase();
      const year = entry.analysis.meta.periodEnd?.slice(0, 4) ?? "N/A";
      if (!acc[year]) acc[year] = {};
      acc[year][ticker] = (acc[year][ticker] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, Record<string, number>>
  );

  const quarterDistribution = parsedAnalyses.reduce(
    (acc, entry) => {
      const ticker = (entry.resolvedTicker || "UNKNOWN").toUpperCase();
      const quarter = resolveQuarterKey(entry);
      if (!acc[quarter]) acc[quarter] = {};
      acc[quarter][ticker] = (acc[quarter][ticker] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, Record<string, number>>
  );

  const step4RevenueBars = (() => {
    const points = Object.entries(yearDistribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, byTicker]) => ({
        label: year,
        value: Object.values(byTicker).reduce((sum, count) => sum + count, 0),
      }))
      .filter((point) => point.value > 0);
    if (points.length === 0) {
      return [
        { label: "Y1", value: 64 },
        { label: "Y2", value: 52 },
        { label: "Y3", value: 72 },
        { label: "Y4", value: 58 },
      ];
    }
    return points;
  })();
  const step4RevenueMax = Math.max(...step4RevenueBars.map((point) => point.value), 1);

  const ingestAnalyses = useCallback(async (analyses: ParsedEntry[]) => {
    if (analyses.length === 0) {
      throw new Error("Upload at least one PDF filing to continue");
    }

    const seenTicker = new Set<string>();
    for (let i = 0; i < analyses.length; i += 1) {
      const entry = analyses[i];
      const analysis = entry.analysis;
      const ticker = entry.resolvedTicker.toUpperCase();
      setGuidanceStatus(`Saving ${i + 1}/${analyses.length}: ${ticker || entry.sourceFileName || "PDF"}`);
      await fetch("/api/filings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker || undefined,
          periodEnd: analysis.meta.periodEnd,
          source: "pdf",
          workflowOrigin: "competitor",
          analysis,
        }),
      });

      if (ticker && !seenTicker.has(ticker)) {
        seenTicker.add(ticker);
        await fetch("/api/filings/peer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            name: entry.resolvedCompanyName || ticker,
            peerType: "diversified-protein",
          }),
        }).catch(() => {});
      }
    }

    await loadOptions();
    const topTickers = rankParsedTickers(analyses, MAX_COMPARISON_COMPANIES);
    if (topTickers.length > 0) {
      setSelectedTickers(topTickers);
    }
    setQueuedFiles([]);
    setParsedAnalyses([]);
    setGuidanceStatus("");
    await onRegistryChanged?.();
  }, [loadOptions, onRegistryChanged, setupCompanyCount]);

  const clearAllCompanies = useCallback(async () => {
    const typed = window.prompt(
      'This will clear all companies and uploaded competitor analysis data. Analysis History in History stays intact.\n\nType "delete all" to confirm.'
    );

    if (typed == null) return;
    if (typed.trim().toLowerCase() !== "delete all") {
      window.alert('Deletion cancelled. You must type "delete all" exactly.');
      return;
    }

    setClearingAll(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/clear-all", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: typed.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setResult(null);
      setSelectedTickers([]);
      setOptions([]);
      setQueuedFiles([]);
      setParsedAnalyses([]);
      setGuidanceStatus("");
      setShowGuidance(false);
      setGuidanceStep(1);
      await onRegistryChanged?.();
      await loadOptions();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to clear competitor analysis data");
    } finally {
      setClearingAll(false);
    }
  }, [loadOptions, onRegistryChanged]);

  const finalizeGuidance = useCallback(async () => {
    setGuidanceLoading(true);
    setError("");
    try {
      const analyses = parsedAnalyses.length > 0 ? parsedAnalyses : await parseDroppedFiles();
      await ingestAnalyses(analyses);
      setShowGuidance(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to complete guidance");
    } finally {
      setGuidanceLoading(false);
    }
  }, [ingestAnalyses, parseDroppedFiles, parsedAnalyses]);

  const processSetupUploads = useCallback(async () => {
    setError("");
    if (setupEndYear < setupStartYear) {
      setError("End Year must be greater than or equal to Start Year.");
      return;
    }
    if (resolvedSetupCompanies.filter((entry) => entry.valid).length < 2) {
      setError("Configure at least 2 valid companies.");
      return;
    }
    const normalizedCompanies = resolvedSetupCompanies.filter((entry) => entry.valid);
    const usedTickers = new Set(options.map((entry) => entry.ticker.toUpperCase()));
    const activeCompanies = normalizedCompanies.map((entry, idx) => {
      if (entry.mode !== "new") {
        usedTickers.add(entry.ticker.toUpperCase());
        return entry;
      }
      let base = entry.ticker.toUpperCase();
      if (!base) base = `NEW${idx + 1}`;
      let candidate = base;
      let suffix = 1;
      while (usedTickers.has(candidate)) {
        const trimmed = base.slice(0, Math.max(1, 5 - String(suffix).length));
        candidate = `${trimmed}${suffix}`;
        suffix += 1;
      }
      usedTickers.add(candidate);
      return { ...entry, ticker: candidate };
    });
    setGuidanceLoading(true);
    try {
      for (const company of activeCompanies.filter((entry) => entry.mode === "new")) {
        await fetch("/api/filings/peer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: company.ticker,
            name: company.name || company.ticker,
            peerType: "diversified-protein",
          }),
        });
      }
      await loadOptions();
      await onRegistryChanged?.();
    } finally {
      setGuidanceLoading(false);
    }
    setSelectedTickers(activeCompanies.map((company) => company.ticker).slice(0, MAX_COMPARISON_COMPANIES));
    setMode("analysis");
  }, [loadOptions, onRegistryChanged, options, resolvedSetupCompanies, setupEndYear, setupStartYear]);

  const compare = useCallback(async () => {
    const tickers = uniqueTickers(selectedTickers);
    if (tickers.length < 2) return;

    setComparing(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ tickers: tickers.join(",") });
      const response = await fetch(`/api/company-comparison?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      const comparisonLabel = tickers
        .map((ticker) => options.find((entry) => entry.ticker === ticker)?.name || ticker)
        .join(" vs ");
      onComparisonRecorded?.(comparisonLabel);
      setResult(await response.json());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  }, [onComparisonRecorded, options, selectedTickers]);

  if (result) {
    return (
      <ComparisonReportContent
        result={result}
        onReset={() => {
          setResult(null);
          setError("");
          setShowGuidance(false);
          setGuidanceStep(1);
          setQueuedFiles([]);
        }}
        exportHref={buildComparisonExportHref(result)}
      />
    );
  }

  return (
    <>
      {showGuidance ? (
        <div className="guidance-overlay fixed inset-0 z-40 overflow-y-auto p-4 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center py-4 sm:items-center">
            <div className="guidance-shell w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white/95 p-6 shadow-elevation">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="guidance-title text-xl font-extrabold">Peer Comparison Guidance</h3>
              <button
                type="button"
                onClick={() => setShowGuidance(false)}
                className="workspace-interactive workspace-press rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                Skip
              </button>
            </div>
            <div className="mb-4 rounded-xl border border-slate-200/70 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-4">
              <p className="text-2xl font-extrabold leading-tight text-slate-800 sm:text-[30px]">
                Build your
                <span className="bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] bg-clip-text text-transparent"> premium </span>
                competitor view
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Drop filings, auto-detect companies, and generate clean insights in minutes.
              </p>
            </div>

            <div className="mb-4 flex items-center gap-2">
              <span className={`guidance-step-chip rounded-full px-3 py-1 text-xs font-semibold ${guidanceStep === 1 ? "guidance-step-chip-active" : "bg-slate-100 text-slate-500"}`}>Step 1</span>
              <span className={`guidance-step-chip rounded-full px-3 py-1 text-xs font-semibold ${guidanceStep === 2 ? "guidance-step-chip-active" : "bg-slate-100 text-slate-500"}`}>Step 2</span>
              <span className={`guidance-step-chip rounded-full px-3 py-1 text-xs font-semibold ${guidanceStep === 3 ? "guidance-step-chip-active" : "bg-slate-100 text-slate-500"}`}>Step 3</span>
              <span className={`guidance-step-chip rounded-full px-3 py-1 text-xs font-semibold ${guidanceStep === 4 ? "guidance-step-chip-active" : "bg-slate-100 text-slate-500"}`}>Step 4</span>
            </div>

            {guidanceStep === 1 ? (
              <div className="workspace-section-enter space-y-4">
                <p className="text-sm text-slate-600">
                  Upload one or more PDF filings. We will parse them and prepare companies for comparison automatically.
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    addFiles(event.dataTransfer.files);
                  }}
                  className={`guidance-card workspace-interactive workspace-press w-full rounded-xl border-2 border-dashed p-8 text-left ${
                    dragActive ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <UploadCloud className="h-6 w-6 text-slate-400" />
                    <div>
                      <p className="text-base font-semibold text-slate-800">Drop PDF files here</p>
                      <p className="text-sm text-slate-500">You can upload multiple files at once.</p>
                    </div>
                  </div>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                {queuedFiles.length > 0 ? (
                  <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Queued PDFs</p>
                    <div className="space-y-1">
                      {queuedFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-md px-2 py-1 text-xs text-slate-700">
                          <span className="truncate">{file.name}</span>
                          <button type="button" onClick={() => removeQueuedFile(idx)} className="rounded p-1 hover:bg-slate-100">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setGuidanceStep(2)}
                  className="workspace-interactive workspace-press guidance-glow inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Continue to Step 2
                </button>
              </div>
            ) : guidanceStep === 2 ? (
              <div className="workspace-section-enter space-y-4">
                <p className="text-sm text-slate-600">
                  Choose benchmark and peer companies. This pre-configures the original comparison screen that appears next.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedTickers.slice(0, 2).map((ticker, index) => (
                    <div key={`${index}-${ticker}`} className="guidance-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        {index === 0 ? "Benchmark Company" : "Peer Company"}
                      </label>
                      <select
                        value={ticker}
                        onChange={(event) => updateRow(index, event.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                      >
                        {options.map((option) => (
                          <option key={option.ticker} value={option.ticker}>
                            {option.ticker}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="guidance-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick visual preview</p>
                  <div className="grid grid-cols-6 gap-2">
                    {[40, 64, 52, 72, 58, 78].map((h, idx) => (
                      <div key={idx} className="rounded bg-primary/10 p-1">
                        <div className="guidance-shimmer mx-auto w-3 rounded-sm bg-primary/70" style={{ height: `${h}px` }} />
                      </div>
                    ))}
                  </div>
                </div>
                {guidanceStatus ? <p className="text-xs text-slate-500">{guidanceStatus}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGuidanceStep(1)}
                    className="workspace-interactive workspace-press inline-flex h-10 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const analyses = await parseDroppedFiles();
                      const extractedTickers = analyses
                        .map((item) => {
                          const fallbackTicker = resolveTicker({
                            inputTicker: undefined,
                            metaTicker: item.analysis?.meta?.ticker,
                            fileName: item.sourceFileName ?? item.analysis?.meta?.fileName,
                            companyName: item.analysis?.meta?.companyName,
                          });
                          return (item.resolvedTicker || fallbackTicker || "UNKNOWN").toUpperCase();
                        })
                        .filter((ticker) => ticker !== "UNKNOWN");

                      if (extractedTickers.length > 0) {
                        const tickerCounts = extractedTickers.reduce(
                          (acc, ticker) => {
                            acc[ticker] = (acc[ticker] ?? 0) + 1;
                            return acc;
                          },
                          {} as Record<string, number>
                        );
                        const topTwo = Object.entries(tickerCounts)
                          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                          .slice(0, 2)
                          .map(([ticker]) => ticker);
                        setSelectedTickers(topTwo);
                      }
                      setGuidanceStep(3);
                    }}
                    disabled={guidanceLoading}
                    className="workspace-interactive workspace-press guidance-glow inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guidanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Continue to Step 3
                  </button>
                </div>
              </div>
            ) : guidanceStep === 3 ? (
              <div className="workspace-section-enter space-y-4">
                <p className="text-sm text-slate-600">
                  Step 3: Graphs generated from dropped PDFs. Review extracted companies, then finish guidance.
                </p>
                {parsedCompanyList.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No parsed PDF data yet. Go back and upload files first.
                  </div>
                ) : (
                  <>
                    <div className="guidance-card rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Files per company</p>
                      <div className="grid grid-cols-1 gap-2">
                        {parsedCompanyList.map((item) => {
                          const widthPct = Math.max(12, Math.round((item.files / maxCompanyFiles) * 100));
                          return (
                            <div key={item.ticker}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">{item.ticker}</span>
                                <span className="text-slate-500">{item.files} file(s)</span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-200">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Year comparison from dropped files</p>
                      <div className="space-y-2">
                        {Object.entries(yearDistribution)
                          .sort(([a], [b]) => b.localeCompare(a))
                          .map(([year, byTicker]) => {
                            const total = Object.values(byTicker).reduce((sum, count) => sum + count, 0);
                            return (
                              <div key={year}>
                                <div className="mb-1 flex items-center justify-between text-xs">
                                  <span className="font-semibold text-slate-700">{year}</span>
                                  <span className="text-slate-500">{total} file(s)</span>
                                </div>
                                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                                  {parsedCompanyList.map((company) => {
                                    const count = byTicker[company.ticker] ?? 0;
                                    const pct = total > 0 ? (count / total) * 100 : 0;
                                    if (pct <= 0) return null;
                                    return (
                                      <div
                                        key={`${year}-${company.ticker}`}
                                        className="h-full border-r border-white/40 bg-primary"
                                        style={{ width: `${pct}%`, opacity: company.ticker === parsedCompanyList[0]?.ticker ? 1 : 0.65 }}
                                        title={`${company.ticker}: ${count}`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                    <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quarter mix comparison</p>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {["Q1", "Q2", "Q3", "Q4"].map((q) => {
                          const byTicker = quarterDistribution[q] ?? {};
                          const total = Object.values(byTicker).reduce((sum, count) => sum + count, 0);
                          return (
                            <div key={q} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                              <p className="text-xs font-semibold text-slate-700">{q}</p>
                              <p className="text-[11px] text-slate-500">{total} file(s)</p>
                              <div className="mt-1 space-y-1">
                                {parsedCompanyList.map((company) => (
                                  <div key={`${q}-${company.ticker}`} className="flex items-center justify-between text-[10px] text-slate-600">
                                    <span>{company.ticker}</span>
                                    <span>{byTicker[company.ticker] ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Detected companies</p>
                      <div className="space-y-1">
                        {parsedCompanyList.map((item) => (
                          <div key={item.ticker} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs">
                            <span className="font-semibold text-slate-700">{item.ticker} - {item.name}</span>
                            <span className="text-slate-500">{item.years.size} year(s)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {guidanceStatus ? <p className="text-xs text-slate-500">{guidanceStatus}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGuidanceStep(2)}
                    className="workspace-interactive workspace-press inline-flex h-10 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuidanceStep(4)}
                    disabled={guidanceLoading}
                    className="workspace-interactive workspace-press guidance-glow inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue to Step 4
                  </button>
                </div>
              </div>
            ) : (
              <div className="workspace-section-enter space-y-4">
                <p className="text-sm text-slate-600">
                  Step 4: Example preview graphs. This shows the style of comparison outputs that will appear after guidance.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Example: Revenue comparison</p>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="flex h-32 items-end gap-3">
                        {step4RevenueBars.map((point) => (
                          <div key={point.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                            <div
                              className="w-8 rounded-t bg-primary/85"
                              style={{ height: `${Math.max(16, Math.round((point.value / step4RevenueMax) * 92))}px` }}
                            />
                            <span className="text-[10px] text-slate-500">{point.label}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {parsedAnalyses.length > 0
                          ? `Generated from ${parsedAnalyses.length} uploaded file(s).`
                          : "Bars illustrate relative scale by period."}
                      </p>
                    </div>
                  </div>
                  <div className="guidance-card rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Example: Margin trend</p>
                    <div className="relative h-44 rounded-lg bg-slate-50 p-3">
                      <svg viewBox="0 0 320 140" className="h-full w-full">
                        <polyline
                          points="10,105 60,95 110,88 160,82 210,76 260,70 310,62"
                          fill="none"
                          stroke="currentColor"
                          className="text-primary"
                          strokeWidth="3"
                        />
                        <polyline
                          points="10,112 60,108 110,104 160,99 210,97 260,92 310,90"
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="3"
                        />
                        {[10, 60, 110, 160, 210, 260, 310].map((x) => (
                          <circle key={x} cx={x} cy={62 + (x / 30) % 5} r="2.5" fill="currentColor" className="text-primary" />
                        ))}
                      </svg>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Lines illustrate relative trend direction and gap.</p>
                  </div>
                </div>
                {guidanceStatus ? <p className="text-xs text-slate-500">{guidanceStatus}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGuidanceStep(3)}
                    className="workspace-interactive workspace-press inline-flex h-10 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={finalizeGuidance}
                    disabled={guidanceLoading}
                    className="workspace-interactive workspace-press guidance-glow inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guidanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Finish Guidance
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" strokeWidth={2.5} />
            <h3 className="text-base font-bold text-slate-900">Peer Comparison</h3>
          </div>
          <div className="flex items-center gap-2">
            {onToggleSidebar ? (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-subtle transition hover:bg-slate-50 hover:text-slate-800"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </div>

        {loadingOpts ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading analyzed companies...
          </div>
        ) : mode === "setup" ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Setup</p>
              <h4 className="mt-2 text-lg font-bold text-slate-900">Drop filings to start the comparison</h4>
              <p className="mt-1 text-sm text-slate-500">Upload the quarterly PDFs for the two companies you want to compare.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comparison size</label>
                <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
                  2 companies
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start year</label>
                <select
                  value={setupStartYear}
                  onChange={(event) => setSetupStartYear(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {Array.from({ length: currentYear - minStartYear + 1 }, (_, index) => currentYear - index).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">End year</label>
                <select
                  value={setupEndYear}
                  onChange={(event) => setSetupEndYear(Number(event.target.value))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {Array.from({ length: currentYear - setupStartYear + 1 }, (_, index) => setupStartYear + index).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Target: <span className="font-semibold text-slate-900">{expectedFileCount}</span> filings
              <span className="text-slate-400"> · range {setupStartYear}-{setupEndYear}</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Company slots</p>
              <div className="space-y-3">
                {Array.from({ length: setupCompanyCount }, (_, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <select
                      value={
                        setupCompanies[index]?.mode === "new"
                          ? NEW_COMPANY_VALUE
                          : (setupCompanies[index]?.existingTicker || "")
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === NEW_COMPANY_VALUE) {
                          updateSetupCompany(index, {
                            mode: "new",
                            existingTicker: "",
                            newName: "",
                          });
                          return;
                        }
                        updateSetupCompany(index, {
                          mode: "existing",
                          existingTicker: value,
                          newName: "",
                        });
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      <option value="">Select company {index + 1}</option>
                      {options.map((option) => (
                        <option key={option.ticker} value={option.ticker}>
                          {option.ticker} - {option.name}
                        </option>
                      ))}
                      <option value={NEW_COMPANY_VALUE}>New Company</option>
                    </select>
                    {setupCompanies[index]?.mode === "new" ? (
                      <div className="rounded-md border border-slate-200 bg-white p-2">
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Company name
                        </label>
                        <input
                          type="text"
                          value={setupCompanies[index]?.newName || ""}
                          onChange={(event) => updateSetupCompany(index, { newName: event.target.value })}
                          placeholder="Enter company name"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Upload filings later in Quarter Coverage.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {options.length === 1 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                One company is already on file. Add at least one more company to compare side by side.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={processSetupUploads}
                disabled={guidanceLoading}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guidanceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {guidanceLoading ? "Processing..." : "Build comparison"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              Compare 2 companies side by side. <span className="text-slate-400">Company 1 is the margin benchmark.</span>
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {selectedTickers.slice(0, MAX_COMPARISON_COMPANIES).map((ticker, index) => (
                <div key={`${index}-${ticker}`} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {index === 0 ? "Company 1 · benchmark" : `Company ${index + 1}`}
                    </label>
                    <select
                      value={ticker}
                      onChange={(event) => updateRow(index, event.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {options.map((option) => (
                        <option key={option.ticker} value={option.ticker}>
                          {option.ticker}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={compare}
                disabled={comparing || uniqueTickers(selectedTickers).length < 2 || hasDuplicateSelection}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {comparing ? "Comparing..." : "Compare"}
              </button>
            </div>
            {hasDuplicateSelection ? (
              <p className="mt-2 text-xs text-amber-700">Each ticker must be unique.</p>
            ) : null}
          </>
        )}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : null}
      </div>
    </>
  );
}
