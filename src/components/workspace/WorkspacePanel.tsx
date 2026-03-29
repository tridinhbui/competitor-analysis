"use client";

import { useEffect, useState, useCallback } from "react";
import type {
  WorkspaceReadiness,
  PeerType,
  ModuleReadiness,
  TimelineSlot,
} from "@/types/competitor";
import { PEER_TYPE_LABELS } from "@/types/competitor";
import { QuarterTimeline } from "./QuarterTimeline";
import { QuarterAppendFlow } from "./QuarterAppendFlow";
import {
  Building2,
  CalendarDays,
  Users,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Boxes,
  RefreshCw,
  Plus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Peer type selector
// ---------------------------------------------------------------------------

const PEER_OPTIONS: { value: PeerType; label: string }[] = [
  { value: "subject", label: "Subject Company" },
  { value: "packaged-meats", label: "Packaged Meats" },
  { value: "pork-fresh", label: "Pork / Fresh" },
  { value: "diversified-protein", label: "Diversified Protein" },
  { value: "methodology-change", label: "Methodology Change" },
  { value: "spinoff-structural", label: "Spin-off / Structural" },
];

// ---------------------------------------------------------------------------
// Module readiness row
// ---------------------------------------------------------------------------

function ModuleRow({ m }: { m: ModuleReadiness }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => !m.ready && m.reasons.length > 0 && setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
      >
        {m.ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-slate-300" />
        )}
        <span
          className={
            m.ready ? "font-medium text-slate-900" : "text-slate-500"
          }
        >
          {m.moduleName}
        </span>
        {!m.ready && m.reasons.length > 0 && (
          <span className="ml-auto">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            )}
          </span>
        )}
        {m.ready && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Ready
          </span>
        )}
      </button>
      {open && m.reasons.length > 0 && (
        <div className="px-3 pb-2.5 pl-9">
          <ul className="space-y-1">
            {m.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main workspace panel
// ---------------------------------------------------------------------------

interface Props {
  /** Ticker to show workspace for. If null, shows the company selector. */
  ticker: string | null;
}

export function WorkspacePanel({ ticker }: Props) {
  const [readiness, setReadiness] = useState<(WorkspaceReadiness & { timeline?: TimelineSlot[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerUpdating, setPeerUpdating] = useState(false);
  const [showAppendFlow, setShowAppendFlow] = useState(false);

  const fetchReadiness = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/workspace?ticker=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setError(data.error || `HTTP ${resp.status}`);
        setReadiness(null);
      } else {
        setReadiness(await resp.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchReadiness(ticker);
  }, [ticker, fetchReadiness]);

  const handlePeerTypeChange = async (newType: PeerType) => {
    if (!ticker || peerUpdating) return;
    setPeerUpdating(true);
    try {
      await fetch("/api/filings/peer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, peerType: newType }),
      });
      // Refresh
      await fetchReadiness(ticker);
    } finally {
      setPeerUpdating(false);
    }
  };

  // No ticker selected
  if (!ticker) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-subtle">
        <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">
          Competitor Analysis Workspace
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Analyze a company first to open its workspace.
        </p>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-subtle">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">Loading workspace…</span>
      </div>
    );
  }

  // Error (company not found = no filings yet)
  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-subtle">
        <p className="text-sm font-semibold text-amber-800">{error}</p>
        <p className="mt-1 text-xs text-amber-600">
          Upload a 10-Q or search by ticker to create the first filing.
        </p>
      </div>
    );
  }

  if (!readiness) return null;

  const { company, latestQuarter, quarterCount, quartersOnFile, peerCoverage, modules, canBeginAnalysis } = readiness;

  const readyCount = modules.filter((m) => m.ready).length;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {company.name}
            </h3>
            <p className="text-xs text-slate-500">{company.ticker}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAppendFlow(!showAppendFlow)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Quarter
            </button>
            <button
              onClick={() => fetchReadiness(company.ticker)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-slate-100 px-1 py-3">
          {/* Latest quarter */}
          <div className="flex flex-col items-center gap-1 px-3">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-900">
              {latestQuarter ? latestQuarter.label : "—"}
            </span>
            <span className="text-[10px] text-slate-400">Latest</span>
          </div>
          {/* Quarter coverage */}
          <div className="flex flex-col items-center gap-1 px-3">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-900">
              {quarterCount}
            </span>
            <span className="text-[10px] text-slate-400">Quarters</span>
          </div>
          {/* Peer count */}
          <div className="flex flex-col items-center gap-1 px-3">
            <Users className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-900">
              {readiness.peerCount}
            </span>
            <span className="text-[10px] text-slate-400">Peers</span>
          </div>
        </div>
      </div>

      {/* Peer type selector */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Peer Type
        </label>
        <select
          value={company.peerType}
          onChange={(e) => handlePeerTypeChange(e.target.value as PeerType)}
          disabled={peerUpdating}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
        >
          {PEER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Append flow */}
      {showAppendFlow && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4">
          <QuarterAppendFlow
            prefilledTicker={company.ticker}
            onAppended={(timeline, count) => {
              setShowAppendFlow(false);
              // Refresh workspace readiness
              if (ticker) fetchReadiness(ticker);
            }}
            onClose={() => setShowAppendFlow(false)}
          />
        </div>
      )}

      {/* Quarter coverage timeline */}
      {readiness.timeline && readiness.timeline.length > 0 && (
        <QuarterTimeline slots={readiness.timeline} />
      )}

      {/* Quarter history (period-end dates) */}
      {quartersOnFile.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quarters on File
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {quartersOnFile.map((q) => (
              <span
                key={q}
                className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Peer coverage */}
      {peerCoverage.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Peer Coverage
          </h4>
          <div className="space-y-1.5">
            {peerCoverage.map((p) => (
              <div
                key={p.ticker}
                className="flex items-center justify-between text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">
                    {p.ticker}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-400">
                    {PEER_TYPE_LABELS[p.peerType]}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    p.quarterCount > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {p.quarterCount}Q
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis modules */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Analysis Modules
          </h4>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              canBeginAnalysis
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {readyCount}/{modules.length} ready
          </span>
        </div>
        <div>
          {modules.map((m) => (
            <ModuleRow key={m.moduleId} m={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
