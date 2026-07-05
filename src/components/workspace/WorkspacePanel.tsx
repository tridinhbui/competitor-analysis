"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type {
  WorkspaceReadiness,
  ModuleReadiness,
  TimelineSlot,
} from "@/types/competitor";
import { QuarterTimeline } from "./QuarterTimeline";
import { QuarterAppendFlow } from "./QuarterAppendFlow";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import { StatusPill } from "@/components/ui/status-pill";
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
  RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Module readiness row
// ---------------------------------------------------------------------------

function ModuleRow({ m }: { m: ModuleReadiness }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => !m.ready && m.reasons.length > 0 && setOpen(!open)}
        className="workspace-interactive flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-slate-50"
      >
        {m.ready ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-slate-300" />
        )}
        <span
          title={m.moduleName}
          className={`min-w-0 flex-1 whitespace-normal break-words text-[11px] leading-tight ${
            m.ready ? "font-medium text-slate-900" : "text-slate-500"
          }`}
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
          <StatusPill variant="success" size="xs" className="ml-auto">
            Ready
          </StatusPill>
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
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-500">
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
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          {summary ? <p className="mt-1 text-[10px] text-slate-400">{summary}</p> : null}
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
          <div className="border-t border-slate-100 px-4 py-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main workspace panel
// ---------------------------------------------------------------------------

export interface WorkspacePanelActions {
  upload: () => void;
  reset: () => void;
  refresh: () => void;
}

interface WorkspacePanelProps {
  /** Ticker to show workspace for. If null, shows the company selector. */
  ticker: string | null;
  showAnalysisModules?: boolean;
  hideHeader?: boolean;
  onReadinessLoaded?: ((readiness: (WorkspaceReadiness & { timeline?: TimelineSlot[] }) | null) => void) | undefined;
  onActionsReady?: (actions: WorkspacePanelActions) => void;
}

interface AnalysisModulesSidebarProps {
  modules: ModuleReadiness[];
  readyCount: number;
  open: boolean;
  onToggle: () => void;
}

export function AnalysisModulesSidebar({
  modules,
  readyCount,
  open,
  onToggle,
}: AnalysisModulesSidebarProps) {
  return (
    <CollapsiblePanel
      title="Analysis Modules"
      summary={`${readyCount}/${modules.length} ready`}
      open={open}
      onToggle={onToggle}
    >
      <div className="rounded-lg border border-slate-100">
        {modules.map((m) => (
          <ModuleRow key={m.moduleId} m={m} />
        ))}
      </div>
    </CollapsiblePanel>
  );
}

export function WorkspacePanel({
  ticker,
  showAnalysisModules = true,
  hideHeader = false,
  onReadinessLoaded,
  onActionsReady,
}: WorkspacePanelProps) {
  const [readiness, setReadiness] = useState<(WorkspaceReadiness & { timeline?: TimelineSlot[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<TimelineSlot | null>(null);
  const [autoOpenPicker, setAutoOpenPicker] = useState(false);
  const [resettingUploads, setResettingUploads] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openBlocks, setOpenBlocks] = useState({
    quarterCoverage: false,
    analysisModules: false,
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
    onReadinessLoaded?.(readiness);
  }, [onReadinessLoaded, readiness]);

  useEffect(() => {
    setActiveSlot(null);
    setAutoOpenPicker(false);
    setActionError(null);
    setOpenBlocks({
      quarterCoverage: false,
      analysisModules: false,
    });
  }, [ticker]);

  useEffect(() => {
    if (!activeSlot || !autoOpenPicker) return;
    appendFlowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeSlot, autoOpenPicker]);

  const handleResetUploads = useCallback(async () => {
    if (!ticker || resettingUploads) return;

    const confirmed = window.confirm(
      `Clear all uploaded workspace quarters for ${ticker}? Data Source rows will stay unchanged.`
    );
    if (!confirmed) return;

    setResettingUploads(true);
    setActionError(null);
    try {
      const resp = await fetchWithAuth("/api/workspace/reset", {
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

  useEffect(() => {
    if (!ticker || !onActionsReady) return;
    onActionsReady({
      upload: () => {
        const firstMissing = readiness?.timeline?.find((s) => !s.present) ?? readiness?.timeline?.[0] ?? null;
        setActiveSlot(firstMissing ?? null);
        setAutoOpenPicker(false);
      },
      reset: handleResetUploads,
      refresh: () => fetchReadiness(ticker),
    });
  }, [ticker, readiness, onActionsReady, handleResetUploads, fetchReadiness]);

  // No ticker selected
  if (!ticker) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-subtle">
        <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">
          Competitor Analysis Workspace
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Run Quick Analyze on a company first to open its workspace.
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

  const { company, latestQuarter, quarterCount, modules } = readiness;

  const readyCount = modules.filter((m) => m.ready).length;

  return (
    <div className="space-y-3">
      {/* Header card — two rows: name + buttons | stats */}
      {!hideHeader && <div className="workspace-card-hover workspace-section-enter workspace-stagger-1 rounded-xl border border-slate-200 bg-white shadow-subtle">
        {/* Row 1: company name */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-tight text-slate-900">{company.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{company.ticker}</p>
            </div>
            <button
              type="button"
              onClick={handleResetUploads}
              disabled={resettingUploads}
              className="workspace-interactive workspace-press inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Clear workspace upload history for this company only"
            >
              {resettingUploads ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {/* Row 2: three stats */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 px-1 pb-2.5 pt-2">
          <div className="flex items-center gap-1.5 px-3">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[11px] font-semibold leading-none text-slate-900">
                {latestQuarter ? latestQuarter.label : "—"}
              </p>
              <p className="text-[10px] text-slate-400">Latest</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div>
              <p className="text-xs font-semibold leading-none text-slate-900">{quarterCount}</p>
              <p className="text-[10px] text-slate-400">Quarters</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div>
              <p className="text-xs font-semibold leading-none text-slate-900">{readiness.peerCount}</p>
              <p className="text-[10px] text-slate-400">Peers</p>
            </div>
          </div>
        </div>
        {actionError ? (
          <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-red-600">
            {actionError}
          </div>
        ) : null}
      </div>}

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
          summary={`${latestQuarter?.label ?? "—"} · ${readiness.timeline.filter((slot) => slot.present).length}/${readiness.timeline.length} quarters loaded`}
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

      {showAnalysisModules ? (
        <AnalysisModulesSidebar
          modules={modules}
          readyCount={readyCount}
          open={openBlocks.analysisModules}
          onToggle={() => setOpenBlocks((prev) => ({ ...prev, analysisModules: !prev.analysisModules }))}
        />
      ) : null}
    </div>
  );
}
