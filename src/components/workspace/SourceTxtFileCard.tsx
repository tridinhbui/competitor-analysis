"use client";

import { useState } from "react";
import { ChevronRight, FileText, X } from "lucide-react";
import { formatTxtFileSize, truncateTxtFileName } from "@/lib/textTxtFile";
import { cn } from "@/lib/utils";

interface SourceTxtFileCardProps {
  fileName: string;
  sizeBytes?: number;
  content?: string;
  onRemove?: () => void;
  expandLabel?: string;
  className?: string;
  /** When true and content is set, body stays hidden until the user expands. */
  startCollapsed?: boolean;
  /** Opens the paste textarea instead of inline preview (input screen). */
  onExpandRequest?: () => void;
}

export function SourceTxtFileCard({
  fileName,
  sizeBytes,
  content,
  onRemove,
  expandLabel = "Show in text field",
  className,
  startCollapsed = false,
  onExpandRequest,
}: SourceTxtFileCardProps) {
  const hasContent = Boolean(content?.trim());
  const [expanded, setExpanded] = useState(!startCollapsed || !hasContent);
  const showExpandLink = (hasContent && !expanded) || Boolean(onExpandRequest);

  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-subtle", className)}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#3b82f6] text-white shadow-sm"
          aria-hidden
        >
          <FileText className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900" title={fileName}>
            {truncateTxtFileName(fileName)}
          </p>
          <p className="text-xs text-slate-500">
            {sizeBytes != null ? `${formatTxtFileSize(sizeBytes)} · ` : ""}
            Document
          </p>
          {showExpandLink && !expanded ? (
            <button
              type="button"
              onClick={() => {
                if (onExpandRequest) {
                  onExpandRequest();
                  return;
                }
                setExpanded(true);
              }}
              className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700"
            >
              {expandLabel}
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
            </button>
          ) : null}
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Remove ${fileName}`}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {expanded && hasContent ? (
        <div className="mt-3 max-h-[min(74vh,32rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{content}</p>
          {startCollapsed ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
            >
              Hide text
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
