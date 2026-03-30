"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  SlideBlock,
  SlideBlocksResponse,
  SlideCell,
  SlideTableRow,
} from "@/types/slideBlocks";
import type { DeckResponse, DeckSection } from "@/types/deckSection";
import { NarrativeBlockDisplay } from "@/components/slides/NarrativeBlock";
import { DualAxisChart } from "@/components/charts/DualAxisChart";
import { MarginGapChart } from "@/components/charts/MarginGapChart";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { MultiLineTrend } from "@/components/charts/MultiLineTrend";
import { GroupedBarChart } from "@/components/charts/GroupedBarChart";
import {
  Presentation,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Cell display
// ---------------------------------------------------------------------------

function CellDisplay({ cell }: { cell: SlideCell }) {
  if (cell.display === "" || cell.display === "—") {
    return <span className="text-slate-300">—</span>;
  }

  const dirColor =
    cell.direction === "positive"
      ? "text-emerald-600"
      : cell.direction === "negative"
        ? "text-red-500"
        : "";

  return (
    <span className={`tabular-nums ${dirColor}`}>
      {cell.display}
      {cell.change && (
        <span className="ml-1 text-[10px] opacity-70">{cell.change}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Slide table preview
// ---------------------------------------------------------------------------

function SlideTablePreview({ block }: { block: SlideBlock }) {
  const { table } = block;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b-2 border-slate-200">
            {table.columns.map((col, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
              >
                <div>{col.header}</div>
                {col.subHeader && (
                  <div className="font-normal normal-case tracking-normal text-slate-400">
                    {col.subHeader}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <SlideRowDisplay key={ri} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlideRowDisplay({ row }: { row: SlideTableRow }) {
  if (row.rowType === "header") {
    return (
      <tr className="border-t-2 border-slate-200 bg-slate-50">
        <td
          colSpan={row.cells.length + 1}
          className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600"
        >
          {row.label}
        </td>
      </tr>
    );
  }

  if (row.rowType === "spacer") {
    return (
      <tr>
        <td colSpan={row.cells.length + 1} className="h-3" />
      </tr>
    );
  }

  const isBold = row.rowType === "subtotal" || row.rowType === "total";

  return (
    <tr
      className={`border-b border-slate-50 transition hover:bg-slate-50/60 ${
        row.rowType === "total" ? "border-t-2 border-t-slate-300 bg-slate-50/40" : ""
      } ${row.rowType === "subtotal" ? "border-t border-t-slate-200" : ""}`}
    >
      <td
        className={`whitespace-nowrap px-3 py-1.5 ${
          isBold ? "font-bold text-slate-900" : "text-slate-700"
        }`}
      >
        {row.label}
      </td>
      {row.cells.map((c, ci) => (
        <td
          key={ci}
          className={`whitespace-nowrap px-3 py-1.5 text-right ${
            isBold ? "font-bold text-slate-900" : "text-slate-800"
          }`}
        >
          <CellDisplay cell={c} />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Headline badges
// ---------------------------------------------------------------------------

function HeadlineBadges({ block }: { block: SlideBlock }) {
  if (block.headlines.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-2">
      {block.headlines.map((h, i) => {
        const Icon =
          h.direction === "positive"
            ? TrendingUp
            : h.direction === "negative"
              ? TrendingDown
              : Minus;
        const color =
          h.direction === "positive"
            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
            : h.direction === "negative"
              ? "bg-red-50 text-red-800 ring-red-200"
              : "bg-slate-50 text-slate-800 ring-slate-200";

        return (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium opacity-70">
              {h.label}
            </span>
            <span>{h.value}</span>
            {h.comparison && (
              <span className="text-[10px] font-normal opacity-60">
                {h.comparison}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single block card
// ---------------------------------------------------------------------------

const BLOCK_TYPE_LABELS: Record<string, string> = {
  "benchmark-table": "Benchmark",
  "quarterly-trend": "Trend",
  "sequential-comparison": "QoQ",
  "yoy-comparison": "YoY",
  "ttm-comparison": "TTM",
  "sga-comparison": "SG&A",
  "appendix-historical": "Appendix",
  "narrative-block": "Narrative",
  "guidance-table": "Guidance",
  "segment-margin-comparison": "Seg Margin",
  "segment-revenue-composition": "Seg Revenue",
  "margin-gap-trend": "Margin Gap",
  "per-unit-comparison": "Per Unit",
  "op-bridge-qoq": "Bridge QoQ",
  "op-bridge-yoy": "Bridge YoY",
  "op-bridge-ttm": "Bridge TTM",
  "industry-landscape": "Landscape",
  "sga-trend": "SG&A Trend",
  "methodology-comparison": "Methodology",
  "market-data-volume": "Market Vol",
  "market-data-channel": "Mkt Channel",
  "competitive-overlap": "Overlap",
};

function SlideBlockCard({
  block,
  onExport,
}: {
  block: SlideBlock;
  onExport: (block: SlideBlock) => void;
}) {
  const [open, setOpen] = useState(false);

  const completeBadge =
    block.metadata.completeness === "full" ? (
      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
        <AlertTriangle className="h-3 w-3" /> Partial
      </span>
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
      {/* Block header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50/50"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
          {BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900 truncate">
              {block.title}
            </span>
            {completeBadge}
          </div>
          {block.subtitle && (
            <p className="mt-0.5 text-[11px] text-slate-500 truncate">
              {block.subtitle}
            </p>
          )}
        </div>
        <span className="shrink-0 text-slate-400">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-slate-100">
          {/* Headlines */}
          {block.headlines.length > 0 && (
            <div className="px-4 pt-2">
              <HeadlineBadges block={block} />
            </div>
          )}

          {/* Narrative content (for narrative-block type) */}
          {block.blockType === "narrative-block" && (
            <div className="px-4 py-3">
              <NarrativeBlockDisplay block={block} />
            </div>
          )}

          {/* Table */}
          {block.table.rows.length > 0 && (
            <div className="px-4 py-3">
              <SlideTablePreview block={block} />
            </div>
          )}

          {/* Waterfall chart for bridge blocks */}
          {block.bridgeComponents && block.bridgeComponents.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3">
              <WaterfallChart components={block.bridgeComponents} />
            </div>
          )}

          {/* Charts */}
          {block.chartSeries.length > 0 && (() => {
            const bt = block.blockType;
            let chart: React.ReactNode = null;

            if (bt === "margin-gap-trend") {
              chart = <MarginGapChart series={block.chartSeries} />;
            } else if (bt === "sga-trend") {
              chart = <MultiLineTrend series={block.chartSeries} yAxisFormat="percent" />;
            } else if (bt === "segment-revenue-composition") {
              chart = <DualAxisChart series={block.chartSeries} stackBars />;
            } else if (bt === "segment-margin-comparison" || bt === "per-unit-comparison") {
              chart = <DualAxisChart series={block.chartSeries} />;
            } else if (bt === "quarterly-trend") {
              chart = <DualAxisChart series={block.chartSeries} />;
            } else if (bt === "sequential-comparison" || bt === "yoy-comparison") {
              chart = <GroupedBarChart series={block.chartSeries} showChangeLabels valueFormat="currency" />;
            } else if (bt === "ttm-comparison" || bt === "benchmark-table") {
              chart = <GroupedBarChart series={block.chartSeries} valueFormat="currency" />;
            } else if (bt === "methodology-comparison") {
              chart = <GroupedBarChart series={block.chartSeries} showChangeLabels valueFormat="percent" />;
            } else if (bt === "market-data-volume" || bt === "market-data-channel") {
              chart = <GroupedBarChart series={block.chartSeries} valueFormat="percent" />;
            }

            return chart ? (
              <div className="border-t border-slate-100 px-4 py-3">{chart}</div>
            ) : null;
          })()}

          {/* Footnotes & assumptions */}
          {(block.footnotes.length > 0 || block.assumptions.length > 0) && (
            <div className="border-t border-slate-50 px-4 py-2.5 space-y-1">
              {block.footnotes.map((fn, i) => (
                <p key={`fn-${i}`} className="text-[10px] text-slate-400">
                  {fn}
                </p>
              ))}
              {block.assumptions.map((a, i) => (
                <p key={`a-${i}`} className="text-[10px] italic text-slate-400">
                  Assumption: {a}
                </p>
              ))}
            </div>
          )}

          {/* Missing data warnings */}
          {block.metadata.missingData.length > 0 && (
            <div className="border-t border-amber-100 bg-amber-50/50 px-4 py-2">
              {block.metadata.missingData.map((m, i) => (
                <p key={i} className="flex items-center gap-1 text-[10px] text-amber-600">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {m}
                </p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
            <button
              onClick={() => onExport(block)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90"
            >
              <Download className="h-3 w-3" />
              Export JSON
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(block, null, 2));
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-subtle transition hover:bg-slate-50"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
            <span className="ml-auto text-[10px] text-slate-400">
              {block.metadata.quarterRange.from} → {block.metadata.quarterRange.to}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface Props {
  ticker: string | null;
}

export function SlideBlocksPanel({ ticker }: Props) {
  const [data, setData] = useState<SlideBlocksResponse | null>(null);
  const [deckData, setDeckData] = useState<DeckResponse | null>(null);
  const [viewMode, setViewMode] = useState<"blocks" | "deck">("blocks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBlocks = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/slide-blocks?ticker=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setError(body.error || `HTTP ${resp.status}`);
        setData(null);
      } else {
        setData(await resp.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slide blocks");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeck = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/slide-blocks/deck?ticker=${encodeURIComponent(t)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        setError(body.error || `HTTP ${resp.status}`);
        setDeckData(null);
      } else {
        setDeckData(await resp.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deck");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) {
      if (viewMode === "deck") fetchDeck(ticker);
      else fetchBlocks(ticker);
    }
  }, [ticker, viewMode, fetchBlocks, fetchDeck]);

  const handleExport = (block: SlideBlock) => {
    const blob = new Blob([JSON.stringify(block, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${block.blockId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slide-blocks-${data.ticker}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ticker) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-subtle">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">Generating slide blocks…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-800">{error}</p>
      </div>
    );
  }

  const hasBlocks = viewMode === "blocks" ? (data && data.blocks.length > 0) : (deckData && deckData.totalBlocks > 0);
  if (!hasBlocks) return null;

  const blockCount = viewMode === "blocks" ? data!.blocks.length : deckData!.totalBlocks;
  const activeTicker = viewMode === "blocks" ? data!.ticker : deckData!.ticker;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Presentation className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-bold text-slate-900">Slide Blocks</h3>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {blockCount} blocks
          </span>
          {/* View mode toggle */}
          <div className="ml-2 flex rounded-md border border-slate-200 bg-white text-[10px] font-semibold">
            <button
              onClick={() => setViewMode("blocks")}
              className={`px-2 py-1 rounded-l-md transition ${viewMode === "blocks" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Flat
            </button>
            <button
              onClick={() => setViewMode("deck")}
              className={`px-2 py-1 rounded-r-md transition ${viewMode === "deck" ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Deck
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/api/export/pptx?ticker=${encodeURIComponent(activeTicker)}&mode=${viewMode === "deck" ? "deck" : "blocks"}`}
            download
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90"
          >
            <Download className="h-3 w-3" />
            PPTX
          </a>
          <button
            onClick={handleExportAll}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-subtle transition hover:bg-slate-50"
          >
            <Download className="h-3 w-3" />
            JSON
          </button>
          <button
            onClick={() => viewMode === "deck" ? fetchDeck(activeTicker) : fetchBlocks(activeTicker)}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Regenerate"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">
          {viewMode === "blocks" ? data?.companyName : deckData?.companyName}
        </span>
        {" · "}
        {blockCount} slide block(s) generated
        {viewMode === "deck" && deckData && ` · ${deckData.sections.length} sections`}
      </div>

      {/* Block cards — flat or deck view */}
      {viewMode === "blocks" && data ? (
        data.blocks.map((block) => (
          <SlideBlockCard key={block.blockId} block={block} onExport={handleExport} />
        ))
      ) : deckData ? (
        deckData.sections.map((section) => (
          <div key={section.sectionId} className="space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5 pt-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <h4 className="text-xs font-bold text-slate-800">{section.title}</h4>
              {section.subtitle && (
                <span className="text-[10px] text-slate-400">{section.subtitle}</span>
              )}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                {section.blocks.length} slides
              </span>
            </div>
            {section.blocks.map((block) => (
              <SlideBlockCard key={block.blockId} block={block} onExport={handleExport} />
            ))}
          </div>
        ))
      ) : null}
    </div>
  );
}
