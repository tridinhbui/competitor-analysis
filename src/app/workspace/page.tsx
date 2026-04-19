"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { AnalysisResults } from "@/components/workspace/AnalysisResults";
import { SlideBlocksPanel } from "@/components/workspace/SlideBlocksPanel";
import { PeerModulePanel } from "@/components/workspace/PeerModulePanel";
import { AdjustmentPanel } from "@/components/workspace/AdjustmentPanel";
import { ManualDataPanel } from "@/components/workspace/ManualDataPanel";
import { PeerComparisonView } from "@/components/workspace/PeerComparisonView";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { MacroInsightsPanel } from "@/components/workspace/MacroInsightsPanel";
import type { CompanyRegistry, PeerType } from "@/types/competitor";
import {
  Boxes,
  ArrowLeft,
  Loader2,
  Building2,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react";

const PEER_OPTIONS: { value: PeerType; label: string }[] = [
  { value: "subject", label: "Subject Company" },
  { value: "packaged-meats", label: "Packaged Meats" },
  { value: "pork-fresh", label: "Pork / Fresh" },
  { value: "diversified-protein", label: "Diversified Protein" },
  { value: "methodology-change", label: "Methodology Change" },
  { value: "spinoff-structural", label: "Spin-off / Structural" },
];

export default function WorkspacePage() {
  type WorkspaceSection = "overview" | "analysis" | "slides" | "data" | "modules" | "macro";
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("overview");
  const [loading, setLoading] = useState(true);
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");
  const [newPeerType, setNewPeerType] = useState<PeerType>("subject");
  const [addingCompany, setAddingCompany] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [companiesOpen, setCompaniesOpen] = useState(true);

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

  const sectionTabs: Array<{ id: WorkspaceSection; label: string; hint: string }> = [
    { id: "overview", label: "Overview", hint: "Quarter Coverage + Peer Comparison" },
    { id: "analysis", label: "Analysis Results", hint: "Tables and comparative outputs" },
    { id: "slides", label: "Slide Blocks", hint: "Deck block generation" },
    { id: "data", label: "Data Entry", hint: "Manual data adjustments" },
    { id: "modules", label: "Module Setup", hint: "Peer and adjustment modules" },
    { id: "macro", label: "Macro Insights", hint: "Context and macro layer" },
  ];

  const createCompany = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticker = newTicker.trim().toUpperCase();
    const name = newName.trim();
    if (!ticker || !name) return;

    setAddingCompany(true);
    setCompanyError("");
    try {
      const resp = await fetch("/api/filings/peer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name, peerType: newPeerType }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      setNewTicker("");
      setNewName("");
      setNewPeerType("subject");
      await loadRegistry(ticker);
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : "Failed to add company");
    } finally {
      setAddingCompany(false);
    }
  };

  return (
    <RequireAuth>
    <div className="workspace-page mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
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
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          {/* Company sidebar */}
          <div className="space-y-1">
            <form
              onSubmit={createCompany}
              className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-subtle workspace-section-enter"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Add Company
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Company name"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <input
                  type="text"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  placeholder="Ticker"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <select
                  value={newPeerType}
                  onChange={(e) => setNewPeerType(e.target.value as PeerType)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                >
                  {PEER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={addingCompany || !newTicker.trim() || !newName.trim()}
                  className="workspace-interactive inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {addingCompany ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add to workspace
                </button>
                {companyError ? (
                  <p className="text-[11px] text-red-600">{companyError}</p>
                ) : null}
              </div>
            </form>
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

            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-subtle backdrop-blur">
              <p className="mb-2 px-2 [font-family:var(--font-body)] text-[10px] font-semibold uppercase tracking-widest text-slate-400">Sections</p>
              <div className="space-y-2">
                {sectionTabs.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`workspace-interactive group w-full rounded-full px-4 py-2.5 text-left ${
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/30"
                        : "bg-slate-100/70 text-slate-700 hover:-translate-y-[1px] hover:bg-slate-200/70"
                    }`}
                  >
                    <p
                      className={`[font-family:var(--font-body)] text-center text-[13px] font-semibold leading-tight ${
                        activeSection === section.id ? "text-primary-foreground" : "text-slate-700"
                      }`}
                    >
                      {section.label}
                    </p>
                    <p
                      className={`[font-family:var(--font-body)] mt-0.5 text-center text-[10px] leading-tight transition-opacity duration-200 ${
                        activeSection === section.id
                          ? "text-primary-foreground/85 opacity-100"
                          : "text-slate-500 opacity-80 group-hover:opacity-100"
                      }`}
                    >
                      {section.hint}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Focused workspace pages */}
          <div className="space-y-6">
            {activeSection === "overview" ? (
              <div className="space-y-6 workspace-section-enter">
                <WorkspacePanel ticker={selectedTicker} />
                <PeerComparisonView />
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

            {activeSection === "data" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Manual Data Entry</p>
                  <p className="mt-1 text-xs text-slate-500">Use this page when you need to override or complete specific rows.</p>
                </div>
                <ManualDataPanel ticker={selectedTicker} />
              </div>
            ) : null}

            {activeSection === "modules" ? (
              <div className="space-y-4 workspace-section-enter">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
                  <p className="text-sm font-semibold text-slate-900">Module Setup</p>
                  <p className="mt-1 text-xs text-slate-500">Configure peer module readiness and adjustment behavior here.</p>
                </div>
                <PeerModulePanel ticker={selectedTicker} />
                <AdjustmentPanel ticker={selectedTicker} />
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5" />
                <span>
                  Main page focus: <span className="font-semibold text-slate-700">Quarter Coverage + Peer Comparison</span>. Detailed tables are split into the pages above.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequireAuth>
  );
}
