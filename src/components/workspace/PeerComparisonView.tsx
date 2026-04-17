"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, TrendingUp, X } from "lucide-react";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";
import {
  ComparisonReportContent,
  buildComparisonExportHref,
  type CompareTab,
} from "@/components/workspace/ComparisonReportContent";

interface CompanyOption {
  ticker: string;
  name: string;
}

interface RegistryResponse {
  companies: Array<{ ticker: string; name: string }>;
}

const MAX_COMPANIES = 7;

function uniqueTickers(list: string[]): string[] {
  return [...new Set(list.map((t) => t.trim().toUpperCase()).filter(Boolean))];
}

export function PeerComparisonView() {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CompanyComparisonPayload | null>(null);
  const [activeTab, setActiveTab] = useState<CompareTab>("overview");

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const canAdd =
    selectedTickers.length < MAX_COMPANIES &&
    options.some((option) => !selectedTickers.includes(option.ticker));
  const hasDuplicateSelection = new Set(selectedTickers).size !== selectedTickers.length;

  const compare = useCallback(async () => {
    const tickers = uniqueTickers(selectedTickers);
    if (tickers.length < 2) return;

    setComparing(true);
    setError("");
    setResult(null);
    setActiveTab("overview");

    try {
      const params = new URLSearchParams({ tickers: tickers.join(",") });
      const response = await fetch(`/api/company-comparison?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setResult(await response.json());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Comparison failed");
    } finally {
      setComparing(false);
    }
  }, [selectedTickers]);

  const updateRow = useCallback((index: number, ticker: string) => {
    setSelectedTickers((rows) => {
      const next = [...rows];
      next[index] = ticker;
      return next;
    });
  }, []);

  const removeRow = useCallback((index: number) => {
    setSelectedTickers((rows) => rows.filter((_, i) => i !== index));
  }, []);

  const addRow = useCallback(() => {
    setSelectedTickers((rows) => {
      if (rows.length >= MAX_COMPANIES) return rows;
      const used = new Set(rows);
      const pick = options.find((o) => !used.has(o.ticker))?.ticker;
      if (!pick) return rows;
      return [...rows, pick];
    });
  }, [options]);

  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-subtle">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" strokeWidth={2.5} />
          <h3 className="text-base font-bold text-slate-900">Peer Comparison</h3>
        </div>

        {loadingOpts ? (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading analyzed companies...
          </div>
        ) : options.length < 2 ? (
          <p className="text-sm text-slate-500">
            Compare financial metrics across companies side-by-side. Load historical quarters first via the Analyze page.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-500">
              Compare financial metrics across up to {MAX_COMPANIES} companies side-by-side. Load historical quarters first via the
              Analyze page.
            </p>
            <p className="mb-4 text-xs text-slate-400">
              The first company is the margin benchmark (gaps vs that ticker). Add or remove rows below.
            </p>

            <div className="space-y-3">
              {selectedTickers.map((ticker, index) => (
                <div key={`${index}-${ticker}`} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      {index === 0 ? "Company 1 (benchmark)" : `Company ${index + 1}`}
                    </label>
                    <select
                      value={ticker}
                      onChange={(event) => updateRow(index, event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {options.map((option) => (
                        <option key={option.ticker} value={option.ticker}>
                          {option.ticker}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedTickers.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove company ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addRow}
                disabled={!canAdd}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Add company
              </button>
              <span className="text-xs text-slate-400">
                {selectedTickers.length}/{MAX_COMPANIES} selected
              </span>
            </div>

            <button
              type="button"
              onClick={compare}
              disabled={comparing || uniqueTickers(selectedTickers).length < 2 || hasDuplicateSelection}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {comparing ? "Comparing..." : "Compare"}
            </button>
            {hasDuplicateSelection ? (
              <p className="mt-2 text-xs text-amber-700">Each ticker must be unique.</p>
            ) : null}
          </>
        )}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : null}
      </div>
    );
  }

  return (
    <ComparisonReportContent
      result={result}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onReset={() => {
        setResult(null);
        setError("");
      }}
      exportHref={buildComparisonExportHref(result)}
    />
  );
}
