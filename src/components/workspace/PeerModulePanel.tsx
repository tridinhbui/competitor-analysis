"use client";

import { useCallback, useEffect, useState } from "react";
import type { PeerModuleReadiness } from "@/lib/peerModules";
import type { SlideBlockType } from "@/types/slideBlocks";
import {
  Settings2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Block type labels
// ---------------------------------------------------------------------------

const BLOCK_LABELS: Record<SlideBlockType, string> = {
  "benchmark-table": "Benchmark Table",
  "quarterly-trend": "Quarterly Trend",
  "sequential-comparison": "Sequential (QoQ)",
  "yoy-comparison": "Year-over-Year",
  "ttm-comparison": "Trailing 12 Months",
  "sga-comparison": "SG&A Analysis",
  "appendix-historical": "Appendix Historical",
  "narrative-block": "Narrative",
  "guidance-table": "Guidance Progression",
  "segment-margin-comparison": "Segment Margin Comparison",
  "segment-revenue-composition": "Segment Revenue Composition",
  "margin-gap-trend": "Margin Gap Trend",
  "per-unit-comparison": "Per-Unit Comparison",
  "op-bridge-qoq": "OP Bridge (QoQ)",
  "op-bridge-yoy": "OP Bridge (YoY)",
  "op-bridge-ttm": "OP Bridge (TTM)",
  "industry-landscape": "Industry Landscape",
  "sga-trend": "SG&A Trend (12Q)",
  "methodology-comparison": "Methodology Change",
  "market-data-volume": "Market Data — Volume",
  "market-data-channel": "Market Data — Channel",
  "competitive-overlap": "Competitive Overlap",
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "ready" | "partial" | "insufficient" }) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" /> Partial
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-600 ring-1 ring-red-200">
      <XCircle className="h-3 w-3" /> Insufficient
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  ticker: string | null;
}

interface PeerModuleResponse {
  ticker: string;
  companyName: string;
  peerType: string;
  readiness: PeerModuleReadiness;
}

export function PeerModulePanel({ ticker }: Props) {
  const [data, setData] = useState<PeerModuleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchModule = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/peer-module?ticker=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setError(body.error || `HTTP ${resp.status}`);
        setData(null);
      } else {
        setData(await resp.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load module");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchModule(ticker);
  }, [ticker, fetchModule]);

  if (!ticker) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-6 shadow-subtle">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">Loading module…</span>
      </div>
    );
  }

  if (error || !data) return null;

  const { readiness } = data;
  const { config } = readiness;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">{config.name}</h3>
            <p className="text-[11px] text-slate-500">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={readiness.overallStatus} />
          <button
            onClick={() => fetchModule(data.ticker)}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Block order */}
      <div className="px-4 py-3">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center justify-between text-left"
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Slide Block Order ({readiness.availableBlocks.length}/{config.slideBlockOrder.length})
          </h4>
          {showDetails ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>

        <div className="mt-2 space-y-1">
          {config.slideBlockOrder.map((blockType, i) => {
            const isAvailable = readiness.availableBlocks.includes(blockType);
            const missing = readiness.missingBlocks.find((m) => m.blockType === blockType);

            return (
              <div
                key={blockType}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                  isAvailable ? "bg-emerald-50/50" : "bg-slate-50"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200/60 text-[10px] font-bold text-slate-500">
                  {i + 1}
                </span>
                {isAvailable ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                )}
                <span className={isAvailable ? "font-medium text-slate-800" : "text-slate-400"}>
                  {BLOCK_LABELS[blockType] ?? blockType}
                </span>
                {missing && (
                  <span className="ml-auto text-[10px] text-slate-400">
                    {missing.reason}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {/* Metrics */}
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data Requirements
            </h4>
            <div className="grid grid-cols-2 gap-1">
              {config.requiredMetrics.map((key) => {
                const available = readiness.availableMetrics.includes(key);
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[11px]">
                    {available ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400" />
                    )}
                    <span className={available ? "text-slate-700" : "text-slate-400"}>
                      {key}
                    </span>
                    <span className="text-[9px] text-slate-400">(req)</span>
                  </div>
                );
              })}
              {config.optionalMetrics.map((key) => {
                const available = readiness.availableMetrics.includes(key);
                return (
                  <div key={key} className="flex items-center gap-1.5 text-[11px]">
                    {available ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Minus className="h-3 w-3 text-slate-300" />
                    )}
                    <span className={available ? "text-slate-700" : "text-slate-400"}>
                      {key}
                    </span>
                    <span className="text-[9px] text-slate-400">(opt)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparable scopes */}
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Comparable Scopes
            </h4>
            <div className="flex flex-wrap gap-1">
              {config.comparableScopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>

          {/* Focus metrics */}
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Focus Metrics
            </h4>
            <div className="flex flex-wrap gap-1">
              {config.focusMetrics.map((key) => (
                <span
                  key={key}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {key}
                </span>
              ))}
            </div>
          </div>

          {/* Footnotes */}
          {config.footnotes.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Module Footnotes
              </h4>
              {config.footnotes.map((fn, i) => (
                <p key={i} className="text-[10px] text-slate-400 leading-relaxed">
                  {fn}
                </p>
              ))}
            </div>
          )}

          {/* Normalization notes */}
          {config.normalizationNotes.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Normalization Notes
              </h4>
              {config.normalizationNotes.map((note, i) => (
                <p key={i} className="text-[10px] italic text-amber-600 leading-relaxed">
                  {note}
                </p>
              ))}
            </div>
          )}

          {/* Optional blocks */}
          {config.optionalBlocks.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Optional Analysis Blocks
              </h4>
              {config.optionalBlocks.map((ob) => (
                <div key={ob.id} className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                  <BarChart3 className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  <div>
                    <span className="font-medium text-slate-700">{ob.name}</span>
                    <p className="text-slate-400">{ob.description}</p>
                    <p className="text-[10px] italic text-slate-400">
                      Condition: {ob.condition}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quarter info */}
          <div className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <span className="font-semibold">{readiness.quarterCount}</span> quarter(s) on file
            {!readiness.meetsMinQuarters && (
              <span className="ml-2 text-amber-600">
                (minimum {config.minQuarters} required)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Minus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
