"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CompanyAdjustments,
  InsightAdjustment,
  BlockAdjustment,
  FootnoteAdjustment,
} from "@/types/adjustments";
import { emptyAdjustments } from "@/types/adjustments";
import type { SlideBlock, SlideBlocksResponse } from "@/types/slideBlocks";
import type { Insight } from "@/lib/insightEngine";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import {
  Pencil,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  MessageSquare,
  StickyNote,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  ticker: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InsightEditor({
  insight,
  adjustment,
  onUpdate,
}: {
  insight: { blockId: string; statement: string };
  adjustment: InsightAdjustment | undefined;
  onUpdate: (adj: InsightAdjustment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(adjustment?.editedStatement ?? insight.statement);
  const [note, setNote] = useState(adjustment?.analystNote ?? "");
  const isLocked = adjustment?.locked ?? false;
  const isEdited = adjustment?.editedStatement != null;

  const handleSave = () => {
    onUpdate({
      blockId: insight.blockId,
      editedStatement: draft !== insight.statement ? draft : null,
      locked: isLocked,
      analystNote: note || undefined,
      editedAt: now(),
    });
    setEditing(false);
  };

  const handleToggleLock = () => {
    onUpdate({
      blockId: insight.blockId,
      editedStatement: adjustment?.editedStatement ?? null,
      locked: !isLocked,
      analystNote: adjustment?.analystNote,
      editedAt: now(),
    });
  };

  const handleReset = () => {
    setDraft(insight.statement);
    setNote("");
    onUpdate({
      blockId: insight.blockId,
      editedStatement: null,
      locked: false,
      analystNote: undefined,
      editedAt: now(),
    });
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-slate-150 bg-white p-3">
      <div className="flex items-start gap-2">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {insight.blockId}
            </span>
            {isEdited && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                EDITED
              </span>
            )}
            {isLocked && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                LOCKED
              </span>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
              />
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Analyst note (optional)..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 focus:border-primary focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  <Save className="h-3 w-3" /> Save
                </button>
                <button
                  onClick={() => {
                    setDraft(adjustment?.editedStatement ?? insight.statement);
                    setEditing(false);
                  }}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-700 leading-relaxed">
              {adjustment?.editedStatement ?? insight.statement}
            </p>
          )}

          {adjustment?.analystNote && !editing && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 italic">
              <StickyNote className="h-3 w-3" />
              {adjustment.analystNote}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditing(!editing)}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Edit insight"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleToggleLock}
            className={`rounded-md p-1 transition ${
              isLocked
                ? "text-blue-500 hover:bg-blue-50"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            }`}
            title={isLocked ? "Unlock (allow regeneration)" : "Lock (prevent regeneration)"}
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          {isEdited && (
            <button
              onClick={handleReset}
              className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
              title="Reset to original"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockOverrideRow({
  block,
  adjustment,
  onUpdate,
}: {
  block: SlideBlock;
  adjustment: BlockAdjustment | undefined;
  onUpdate: (adj: BlockAdjustment) => void;
}) {
  const isHidden = adjustment?.hidden ?? false;
  const hasOverride = adjustment?.overrideTitle != null || adjustment?.overrideSubtitle != null;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(adjustment?.overrideTitle ?? block.title);
  const [subtitleDraft, setSubtitleDraft] = useState(adjustment?.overrideSubtitle ?? (block.subtitle ?? ""));

  const handleToggleVisibility = () => {
    onUpdate({
      blockId: block.blockId,
      overrideTitle: adjustment?.overrideTitle ?? null,
      overrideSubtitle: adjustment?.overrideSubtitle ?? null,
      hidden: !isHidden,
      pinnedPosition: adjustment?.pinnedPosition ?? null,
      editedAt: now(),
    });
  };

  const handleSaveTitle = () => {
    onUpdate({
      blockId: block.blockId,
      overrideTitle: titleDraft !== block.title ? titleDraft : null,
      overrideSubtitle: subtitleDraft !== (block.subtitle ?? "") ? subtitleDraft : null,
      hidden: isHidden,
      pinnedPosition: adjustment?.pinnedPosition ?? null,
      editedAt: now(),
    });
    setEditingTitle(false);
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
        isHidden ? "border-red-100 bg-red-50/30 opacity-60" : "border-slate-150 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        {editingTitle ? (
          <div className="space-y-1.5">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800 focus:border-primary focus:outline-none"
            />
            <input
              value={subtitleDraft}
              onChange={(e) => setSubtitleDraft(e.target.value)}
              placeholder="Subtitle..."
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 focus:border-primary focus:outline-none"
            />
            <div className="flex gap-1">
              <button
                onClick={handleSaveTitle}
                className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                Save
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800">
                {adjustment?.overrideTitle ?? block.title}
              </span>
              {hasOverride && (
                <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700">
                  CUSTOM
                </span>
              )}
              {isHidden && (
                <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700">
                  HIDDEN
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">
              {adjustment?.overrideSubtitle ?? block.subtitle}
            </p>
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditingTitle(!editingTitle)}
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          title="Edit title"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleToggleVisibility}
          className={`rounded-md p-1 transition ${
            isHidden
              ? "text-red-500 hover:bg-red-50"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          }`}
          title={isHidden ? "Show block" : "Hide block"}
        >
          {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function FootnoteEditor({
  block,
  adjustments,
  onAdd,
  onRemove,
}: {
  block: SlideBlock;
  adjustments: FootnoteAdjustment[];
  onAdd: (blockId: string, text: string) => void;
  onRemove: (blockId: string, footnoteIndex: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const blockAdjs = adjustments.filter((a) => a.blockId === block.blockId);
  const removedIndices = new Set(
    blockAdjs.filter((a) => a.action === "remove").map((a) => a.footnoteIndex)
  );
  const addedFootnotes = blockAdjs.filter((a) => a.action === "add");

  const handleAdd = () => {
    if (draft.trim()) {
      onAdd(block.blockId, draft.trim());
      setDraft("");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Footnotes — {block.blockId}
      </p>
      {block.footnotes.map((fn, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 text-[10px] ${
            removedIndices.has(i) ? "line-through opacity-40" : "text-slate-600"
          }`}
        >
          <span className="flex-1">{fn}</span>
          {removedIndices.has(i) ? (
            <span className="text-[9px] text-red-400">removed</span>
          ) : (
            <button
              onClick={() => onRemove(block.blockId, i)}
              className="rounded p-0.5 text-slate-300 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {addedFootnotes.map((a, i) => (
        <div key={`added-${i}`} className="flex items-center gap-2 text-[10px] text-emerald-700">
          <Plus className="h-3 w-3 shrink-0" />
          <span className="flex-1">{a.text}</span>
        </div>
      ))}
      {adding ? (
        <div className="flex gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New footnote..."
            className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] focus:border-primary focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            className="rounded bg-primary px-2 py-1 text-[9px] font-bold text-white"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="rounded border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Add footnote
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function AdjustmentPanel({ ticker }: Props) {
  const [adjustments, setAdjustments] = useState<CompanyAdjustments | null>(null);
  const [blocks, setBlocks] = useState<SlideBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<"insights" | "blocks" | "footnotes">("insights");
  const [expanded, setExpanded] = useState(true);

  // Mock insights derived from block IDs (since we don't have real insight data from the API yet)
  const mockInsights = blocks.map((b) => ({
    blockId: b.blockId,
    statement: `Auto-generated insight for ${b.title}`,
  }));

  const fetchData = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [adjResp, blockResp] = await Promise.all([
        fetchWithAuth(`/api/adjustments?ticker=${encodeURIComponent(t)}`),
        fetch(`/api/slide-blocks?ticker=${encodeURIComponent(t)}`),
      ]);
      if (adjResp.ok) {
        setAdjustments(await adjResp.json());
      } else {
        setAdjustments(emptyAdjustments(t));
      }
      if (blockResp.ok) {
        const data: SlideBlocksResponse = await blockResp.json();
        setBlocks(data.blocks);
      }
    } catch {
      setAdjustments(emptyAdjustments(t));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchData(ticker);
  }, [ticker, fetchData]);

  const saveAdjustments = useCallback(async (adj: CompanyAdjustments) => {
    setSaving(true);
    setSaved(false);
    try {
      const resp = await fetchWithAuth("/api/adjustments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adj),
      });
      if (resp.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const updateInsight = useCallback(
    (adj: InsightAdjustment) => {
      if (!adjustments) return;
      const updated = { ...adjustments };
      const idx = updated.insights.findIndex((a) => a.blockId === adj.blockId);
      if (idx >= 0) {
        updated.insights[idx] = adj;
      } else {
        updated.insights.push(adj);
      }
      updated.updatedAt = now();
      setAdjustments(updated);
      saveAdjustments(updated);
    },
    [adjustments, saveAdjustments]
  );

  const updateBlock = useCallback(
    (adj: BlockAdjustment) => {
      if (!adjustments) return;
      const updated = { ...adjustments };
      const idx = updated.blocks.findIndex((a) => a.blockId === adj.blockId);
      if (idx >= 0) {
        updated.blocks[idx] = adj;
      } else {
        updated.blocks.push(adj);
      }
      updated.updatedAt = now();
      setAdjustments(updated);
      saveAdjustments(updated);
    },
    [adjustments, saveAdjustments]
  );

  const addFootnote = useCallback(
    (blockId: string, text: string) => {
      if (!adjustments) return;
      const updated = { ...adjustments };
      updated.footnotes.push({ blockId, action: "add", text, editedAt: now() });
      updated.updatedAt = now();
      setAdjustments(updated);
      saveAdjustments(updated);
    },
    [adjustments, saveAdjustments]
  );

  const removeFootnote = useCallback(
    (blockId: string, footnoteIndex: number) => {
      if (!adjustments) return;
      const updated = { ...adjustments };
      updated.footnotes.push({ blockId, action: "remove", footnoteIndex, editedAt: now() });
      updated.updatedAt = now();
      setAdjustments(updated);
      saveAdjustments(updated);
    },
    [adjustments, saveAdjustments]
  );

  if (!ticker) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-subtle">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-slate-500">Loading adjustments...</span>
      </div>
    );
  }

  if (!adjustments || blocks.length === 0) return null;

  const insightCount = adjustments.insights.filter((a) => a.editedStatement != null || a.locked).length;
  const blockCount = adjustments.blocks.filter((a) => a.hidden || a.overrideTitle != null).length;
  const footnoteCount = adjustments.footnotes.length;
  const totalAdj = insightCount + blockCount + footnoteCount;

  return (
    <div className="space-y-3">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <Pencil className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-slate-900">Analyst Adjustments</h3>
        {totalAdj > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            {totalAdj} override{totalAdj !== 1 ? "s" : ""}
          </span>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        {saved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </button>

      {expanded && (
        <>
          {/* Section tabs */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { key: "insights" as const, label: "Insights", count: insightCount },
                { key: "blocks" as const, label: "Blocks", count: blockCount },
                { key: "footnotes" as const, label: "Footnotes", count: footnoteCount },
              ] as const
            ).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                  activeSection === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[9px] font-bold text-amber-600">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeSection === "insights" && (
            <div className="space-y-2">
              <p className="text-[10px] text-slate-400">
                Edit auto-generated insights, lock them from regeneration, or add analyst notes.
              </p>
              {mockInsights.map((insight) => (
                <InsightEditor
                  key={insight.blockId}
                  insight={insight}
                  adjustment={adjustments.insights.find((a) => a.blockId === insight.blockId)}
                  onUpdate={updateInsight}
                />
              ))}
            </div>
          )}

          {activeSection === "blocks" && (
            <div className="space-y-2">
              <p className="text-[10px] text-slate-400">
                Override block titles, hide blocks from output, or reorder.
              </p>
              {blocks.map((block) => (
                <BlockOverrideRow
                  key={block.blockId}
                  block={block}
                  adjustment={adjustments.blocks.find((a) => a.blockId === block.blockId)}
                  onUpdate={updateBlock}
                />
              ))}
            </div>
          )}

          {activeSection === "footnotes" && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Add custom footnotes or remove auto-generated ones.
              </p>
              {blocks.map((block) => (
                <FootnoteEditor
                  key={block.blockId}
                  block={block}
                  adjustments={adjustments.footnotes}
                  onAdd={addFootnote}
                  onRemove={removeFootnote}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
