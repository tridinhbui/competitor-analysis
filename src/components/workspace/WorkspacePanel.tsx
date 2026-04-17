"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
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
  ChevronRight,
  Loader2,
  AlertTriangle,
  Boxes,
  RefreshCw,
  RotateCcw,
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
        className="workspace-interactive flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
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
            <ChevronRight
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                open ? "rotate-90" : "rotate-0"
              }`}
            />
          </span>
        )}
        {m.ready && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Ready
          </span>
        )}
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open && m.reasons.length > 0 ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
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
        </div>
      </div>
    </div>
  );
}

function CollapsiblePanel({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="workspace-interactive workspace-card-hover workspace-section-enter rounded-xl border border-slate-200 bg-white shadow-subtle">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          {summary ? <p className="mt-1 text-[11px] text-slate-400">{summary}</p> : null}
        </div>
        <ChevronRight
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ComparisonSetup({
  company,
  peerCoverage,
}: {
  company: WorkspaceReadiness["company"];
  peerCoverage: WorkspaceReadiness["peerCoverage"];
}) {
  const subject = company.peerType === "subject"
    ? company
    : peerCoverage.find((peer) => peer.peerType === "subject");

  const comparables = peerCoverage.filter((peer) => peer.ticker !== company.ticker);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Comparison Setup
          </h4>
          <p className="mt-1 text-[11px] text-slate-400">
            The selected company runs analysis against the subject company and the peer group already in the workspace.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
          {comparables.length + 1} companies linked
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Subject company
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {subject?.name ?? "No subject selected"}
          </p>
          <p className="text-[11px] text-slate-500">
            {subject?.ticker ?? "Set one company to Subject Company"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Peer universe
            </p>
            <p className="text-[10px] text-slate-400">
              Modules consume quarter history across this set
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              {company.ticker} active
            </span>
            {comparables.map((peer) => (
              <span
                key={peer.ticker}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
              >
                {peer.ticker} · {peer.quarterCount}Q
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            To make companies interact, keep one company as `Subject Company`, assign the rest as peer types, then upload matching quarters across them. The comparison modules and peer modules use that shared quarter history.
          </p>
        </div>
      </div>
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
  const [activeSlot, setActiveSlot] = useState<TimelineSlot | null>(null);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);
  const [resettingUploads, setResettingUploads] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openBlocks, setOpenBlocks] = useState({
    setup: false,
    quarterCoverage: true,
    quarterHistory: false,
    peerCoverage: false,
    analysisModules: true,
  });
  const appendFlowRef = useRef<HTMLDivElement | null>(null);

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
        setActionError(null);
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

  useEffect(() => {
    setActiveSlot(null);
    setAutoOpenPicker(false);
    setActionError(null);
    setOpenBlocks({
      setup: false,
      quarterCoverage: true,
      quarterHistory: false,
      peerCoverage: false,
      analysisModules: true,
    });
  }, [ticker]);

  useEffect(() => {
    if (!activeSlot || !autoOpenPicker) return;
    appendFlowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeSlot, autoOpenPicker]);

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

  const handleResetUploads = useCallback(async () => {
    if (!ticker || resettingUploads) return;

    const confirmed = window.confirm(
      `Clear all uploaded workspace quarters for ${ticker}? Data Source rows will stay unchanged.`
    );
    if (!confirmed) return;

    setResettingUploads(true);
    setActionError(null);
    try {
      const resp = await fetch("/api/workspace/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      setActiveSlot(null);
      setAutoOpenPicker(false);
      await fetchReadiness(ticker);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reset workspace uploads");
    } finally {
      setResettingUploads(false);
    }
  }, [ticker, resettingUploads, fetchReadiness]);

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
      <div className="workspace-card-hover workspace-section-enter workspace-stagger-1 rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {company.name}
            </h3>
            <p className="text-xs text-slate-500">{company.ticker}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const firstMissing = readiness.timeline?.find((slot) => !slot.present) ?? readiness.timeline?.[0] ?? null;
                setActiveSlot(firstMissing);
                setAutoOpenPicker(false);
              }}
              className="workspace-interactive workspace-press inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-subtle hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Upload Quarter
            </button>
            <button
              type="button"
              onClick={handleResetUploads}
              disabled={resettingUploads}
              className="workspace-interactive workspace-press inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Clear workspace upload history for this company only"
            >
              {resettingUploads ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Reset uploads
            </button>
            <button
              onClick={() => fetchReadiness(company.ticker)}
              className="workspace-interactive workspace-press rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        {actionError ? (
          <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-red-600">
            {actionError}
          </div>
        ) : null}

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
      <div className="workspace-card-hover workspace-section-enter workspace-stagger-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
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

      <CollapsiblePanel
        title="Comparison Setup"
        summary={`${peerCoverage.length + 1} companies linked`}
        open={openBlocks.setup}
        onToggle={() => setOpenBlocks((prev) => ({ ...prev, setup: !prev.setup }))}
      >
        <ComparisonSetup company={company} peerCoverage={peerCoverage} />
      </CollapsiblePanel>

      {/* Append flow */}
      {activeSlot && (
        <div
          ref={appendFlowRef}
          className="workspace-card-hover workspace-section-enter workspace-stagger-3 rounded-xl border border-primary/20 bg-primary/[0.02] p-4"
        >
          <QuarterAppendFlow
            key={`${company.ticker}-${activeSlot.label}`}
            prefilledTicker={company.ticker}
            slot={activeSlot}
            autoOpenPicker={autoOpenPicker}
            onAppended={() => {
              setActiveSlot(null);
              setAutoOpenPicker(false);
              // Refresh workspace readiness
              if (ticker) fetchReadiness(ticker);
            }}
            onClose={() => {
              setActiveSlot(null);
              setAutoOpenPicker(false);
            }}
          />
        </div>
      )}

      {/* Quarter coverage timeline */}
      {readiness.timeline && readiness.timeline.length > 0 && (
        <CollapsiblePanel
          title="Quarter Coverage"
          summary={`${readiness.timeline.filter((slot) => slot.present).length}/${readiness.timeline.length} complete`}
          open={openBlocks.quarterCoverage}
          onToggle={() => setOpenBlocks((prev) => ({ ...prev, quarterCoverage: !prev.quarterCoverage }))}
        >
          <QuarterTimeline
            key={company.ticker}
            slots={readiness.timeline}
            onSelectSlot={(slot) => {
              setActiveSlot(slot);
              setAutoOpenPicker(true);
            }}
            activeSlotLabel={activeSlot?.label ?? null}
          />
        </CollapsiblePanel>
      )}

      {/* Quarter history (period-end dates) */}
      {quartersOnFile.length > 0 && (
        <CollapsiblePanel
          title="Quarters on File"
          summary={`${quartersOnFile.length} quarter-end dates`}
          open={openBlocks.quarterHistory}
          onToggle={() => setOpenBlocks((prev) => ({ ...prev, quarterHistory: !prev.quarterHistory }))}
        >
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
        </CollapsiblePanel>
      )}

      {/* Peer coverage */}
      {peerCoverage.length > 0 && (
        <CollapsiblePanel
          title="Peer Coverage"
          summary={`${peerCoverage.length} peers`}
          open={openBlocks.peerCoverage}
          onToggle={() => setOpenBlocks((prev) => ({ ...prev, peerCoverage: !prev.peerCoverage }))}
        >
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
        </CollapsiblePanel>
      )}

      {/* Analysis modules */}
      <CollapsiblePanel
        title="Analysis Modules"
        summary={`${readyCount}/${modules.length} ready`}
        open={openBlocks.analysisModules}
        onToggle={() => setOpenBlocks((prev) => ({ ...prev, analysisModules: !prev.analysisModules }))}
      >
        <div className="rounded-lg border border-slate-100">
          {modules.map((m) => (
            <ModuleRow key={m.moduleId} m={m} />
          ))}
        </div>
      </CollapsiblePanel>
    </div>
  );
}
