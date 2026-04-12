"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, TrendingUp } from "lucide-react";
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

export function PeerComparisonView() {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [companyA, setCompanyA] = useState("");
  const [companyB, setCompanyB] = useState("");
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
          setCompanyA((current) => current || nextOptions[0].ticker);
          setCompanyB((current) => current || (nextOptions.length > 1 ? nextOptions[1].ticker : nextOptions[0].ticker));
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Failed to load companies");
      } finally {
        setLoadingOpts(false);
      }
    })();
  }, []);

  const compare = useCallback(async () => {
    if (!companyA || !companyB) return;

    setComparing(true);
    setError("");
    setResult(null);
    setActiveTab("overview");

    try {
      const response = await fetch(`/api/company-comparison?companyA=${companyA}&companyB=${companyB}`);
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
  }, [companyA, companyB]);

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
            <p className="mb-5 text-sm text-slate-500">
              Compare financial metrics across companies side-by-side. Load historical quarters first via the Analyze page.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Subject Company</label>
                <select
                  value={companyA}
                  onChange={(event) => setCompanyA(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {options.map((option) => (
                    <option key={option.ticker} value={option.ticker}>
                      {option.ticker}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Comparison Company</label>
                <select
                  value={companyB}
                  onChange={(event) => setCompanyB(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {options.map((option) => (
                    <option key={option.ticker} value={option.ticker}>
                      {option.ticker}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={compare}
              disabled={comparing || !companyA || !companyB || companyA === companyB}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {comparing ? "Comparing..." : "Compare"}
            </button>
          </>
        )}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
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
