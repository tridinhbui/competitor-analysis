"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnalysisModulesSidebar, WorkspacePanel, type WorkspacePanelActions } from "@/components/workspace/WorkspacePanel";
import { AnalysisResults } from "@/components/workspace/AnalysisResults";
import { SlideBlocksPanel } from "@/components/workspace/SlideBlocksPanel";
import { PeerModulePanel } from "@/components/workspace/PeerModulePanel";
import { PeerComparisonView } from "@/components/workspace/PeerComparisonView";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { MacroInsightsPanel } from "@/components/workspace/MacroInsightsPanel";
import type { CompanyRegistry, ModuleReadiness, TimelineSlot, WorkspaceReadiness } from "@/types/competitor";
import {
  Boxes,
  ArrowLeft,
  Loader2,
  Building2,
  CalendarDays,
  Users,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  RotateCcw,
} from "lucide-react";

export default function WorkspacePage() {
  type WorkspaceSection = "overview" | "analysis" | "slides" | "modules" | "macro";
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("overview");
  const [loading, setLoading] = useState(true);
  const [companiesOpen, setCompaniesOpen] = useState(true);
  const [analysisModulesOpen, setAnalysisModulesOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [overviewReadiness, setOverviewReadiness] = useState<(WorkspaceReadiness & { timeline?: TimelineSlot[] }) | null>(null);
  const panelActionsRef = useRef<WorkspacePanelActions | null>(null);
  const handleActionsReady = useCallback((actions: WorkspacePanelActions) => {
    panelActionsRef.current = actions;
  }, []);

  const loadRegistry = async (nextSelectedTicker?: string) => {
    try {
      const resp = await fetch("/api/filings");
      if (resp.ok) {
        const data: CompanyRegistry = await resp.json();
        setRegistry(data);
        if (nextSelectedTicker) {
          setSelectedTicker(nextSelectedTicker);
        } else if (data.companies.length > 0 && !selectedTicker) {
          setSelectedTicker(data.companies[0].ticker);
        }
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegistry();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveSection("overview");
  }, [selectedTicker]);

  useEffect(() => {
    setAnalysisModulesOpen(true);
    setOverviewReadiness(null);
  }, [selectedTicker]);

  const sectionTabs: Array<{ id: WorkspaceSection; label: string; hint: string }> = [
    { id: "overview", label: "Overview", hint: "Quarter Coverage + Peer Comparison" },
    { id: "analysis", label: "Analysis Results", hint: "Tables and comparative outputs" },
    { id: "slides", label: "Slide Blocks", hint: "Deck block generation" },
    { id: "modules", label: "Module Setup", hint: "Peer module configuration" },
    { id: "macro", label: "Macro Insights", hint: "Context and macro layer" },
  ];

  return (
    <RequireAuth>
    <div className="workspace-page mx-auto max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-4">
        <Link
          href="/"
          className="workspace-interactive inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-subtle hover:border-slate-300 hover:text-slate-900"
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
        <div className={`grid gap-4 ${sidebarCollapsed ? "lg:grid-cols-[56px_1fr]" : "lg:grid-cols-[240px_1fr]"}`}>
          {/* Left sidebar */}
          <div className="space-y-3">
            {/* Collapsed rail: just company initials as buttons */}
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-1.5">
                {registry.companies.map((c) => (
                  <button
                    key={c.ticker}
                    type="button"
                    onClick={() => setSelectedTicker(c.ticker)}
                    title={`${c.name} (${c.ticker})`}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-bold transition ${
                      selectedTicker === c.ticker
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c.ticker.slice(0, 4)}
                  </button>
                ))}
              </div>
            ) : (
              <>
            {/* Company header card — above company list */}
            {activeSection === "overview" && overviewReadiness ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
                <div className="px-3 pt-3 pb-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-tight text-slate-900">
                      {overviewReadiness.company.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">{overviewReadiness.company.ticker}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => panelActionsRef.current?.upload()}
                      className="workspace-interactive inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      <Plus className="h-3 w-3" />
                      Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => panelActionsRef.current?.reset()}
                      className="workspace-interactive inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      title="Reset uploads"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 px-1 py-2">
                  <div className="flex items-center gap-1.5 px-2">
                    <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-[10px] font-semibold leading-none text-slate-900">
                        {overviewReadiness.latestQuarter?.label ?? "—"}
                      </p>
                      <p className="text-[9px] text-slate-400">Latest</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2">
                    <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-[11px] font-semibold leading-none text-slate-900">{overviewReadiness.quarterCount}</p>
                      <p className="text-[9px] text-slate-400">Quarters</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2">
                    <Users className="h-3 w-3 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-[11px] font-semibold leading-none text-slate-900">{overviewReadiness.peerCount}</p>
                      <p className="text-[9px] text-slate-400">Peers</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Company list */}
            <div>
              <button
                type="button"
                onClick={() => setCompaniesOpen((current) => !current)}
                className="workspace-interactive mb-2 flex w-full items-center justify-between rounded-lg px-2 py-1 [font-family:var(--font-body)] text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:bg-slate-50"
              >
                <span>Companies</span>
                {companiesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {companiesOpen ? (
                <div className="space-y-1">
                  {registry.companies.map((c) => (
                    <button
                      key={c.ticker}
                      onClick={() => setSelectedTicker(c.ticker)}
                      className={`workspace-interactive flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left [font-family:var(--font-body)] text-sm ${
                        selectedTicker === c.ticker
                          ? "bg-accent font-semibold text-accent-foreground ring-1 ring-primary/25"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Building2 className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm leading-tight">{c.name}</div>
                        <div className="text-[10px] text-slate-400">{c.ticker}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Analysis modules */}
            {activeSection === "overview" && overviewReadiness?.modules?.length ? (
              <AnalysisModulesSidebar
                modules={overviewReadiness.modules as ModuleReadiness[]}
                readyCount={overviewReadiness.modules.filter((module) => module.ready).length}
                open={analysisModulesOpen}
                onToggle={() => setAnalysisModulesOpen((current) => !current)}
              />
            ) : null}
              </>
            )}
          </div>

          {/* Focused workspace pages */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-subtle backdrop-blur">
              <p className="mb-2 px-2 [font-family:var(--font-body)] text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Sections
              </p>
              <div className="flex gap-1.5">
                {sectionTabs.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`workspace-interactive min-w-0 flex-1 rounded-full px-3 py-2 text-center transition ${
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30"
                        : "bg-slate-100/70 text-slate-700 hover:-translate-y-[1px] hover:bg-slate-200/70"
                    }`}
                  >
                    <p
                      className={`[font-family:var(--font-body)] truncate text-[12px] font-semibold leading-tight ${
                        activeSection === section.id ? "text-primary-foreground" : "text-slate-700"
                      }`}
                    >
                      {section.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {activeSection === "overview" ? (
              <div className="space-y-3 workspace-section-enter">
                <WorkspacePanel
                  ticker={selectedTicker}
                  showAnalysisModules={false}
                  hideHeader
                  onReadinessLoaded={setOverviewReadiness}
                  onActionsReady={handleActionsReady}
                />
                <PeerComparisonView
                  sidebarCollapsed={sidebarCollapsed}
                  onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
                />
              </div>
            ) : null}

            {activeSection === "analysis" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Analysis Results</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Long comparison tables are moved here to keep the main page clean.
                  </p>
                </div>
                <AnalysisResults ticker={selectedTicker} />
              </div>
            ) : null}

            {activeSection === "slides" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Slide Blocks</p>
                  <p className="mt-1 text-xs text-slate-500">
                    All deck block content is separated from the overview for better readability.
                  </p>
                </div>
                <SlideBlocksPanel ticker={selectedTicker} />
              </div>
            ) : null}

            {activeSection === "modules" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Module Setup</p>
                  <p className="mt-1 text-xs text-slate-500">Configure peer module readiness here.</p>
                </div>
                <PeerModulePanel ticker={selectedTicker} />
              </div>
            ) : null}

            {activeSection === "macro" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Macro Insights</p>
                  <p className="mt-1 text-xs text-slate-500">Separate macro context from company-level detail to reduce clutter.</p>
                </div>
                <MacroInsightsPanel />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
    </RequireAuth>
  );
}
