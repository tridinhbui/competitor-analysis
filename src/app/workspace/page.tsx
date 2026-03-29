"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import type { CompanyRegistry } from "@/types/competitor";
import {
  Boxes,
  ArrowLeft,
  Loader2,
  Building2,
} from "lucide-react";

export default function WorkspacePage() {
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch("/api/filings");
        if (resp.ok) {
          const data: CompanyRegistry = await resp.json();
          setRegistry(data);
          // Auto-select first company if available
          if (data.companies.length > 0 && !selectedTicker) {
            setSelectedTicker(data.companies[0].ticker);
          }
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle transition hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Boxes className="h-6 w-6 text-primary" />
            Competitor Analysis Workspace
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Select a company to view analysis readiness and module eligibility.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !registry || registry.companies.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-subtle">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No companies yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Go back and analyze a company by ticker or PDF upload. Filings will
            appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Company sidebar */}
          <div className="space-y-1">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Companies
            </p>
            {registry.companies.map((c) => (
              <button
                key={c.ticker}
                onClick={() => setSelectedTicker(c.ticker)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedTicker === c.ticker
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Building2 className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.ticker}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Workspace panel */}
          <div>
            <WorkspacePanel ticker={selectedTicker} />
          </div>
        </div>
      )}
    </div>
  );
}
