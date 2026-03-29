"use client";

import { useState } from "react";
import type { AppendReview } from "@/types/competitor";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Calendar,
  Database,
  Tag,
} from "lucide-react";

interface Props {
  review: AppendReview;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}

const STATUS_CONFIG = {
  new: {
    label: "New Quarter",
    color: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: CheckCircle2,
  },
  duplicate: {
    label: "Duplicate — Will Overwrite",
    color: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: AlertTriangle,
  },
  "out-of-sequence": {
    label: "Out of Sequence",
    color: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: AlertTriangle,
  },
  replacement: {
    label: "Replacement (same FQ, different date)",
    color: "bg-blue-50 text-blue-700 ring-blue-200",
    icon: Info,
  },
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};
const SEVERITY_COLOR = {
  info: "text-blue-500 bg-blue-50",
  warning: "text-amber-500 bg-amber-50",
  error: "text-red-500 bg-red-50",
};

export function QuarterReviewPanel({
  review,
  onConfirm,
  onCancel,
  confirming,
}: Props) {
  const [showLineItems, setShowLineItems] = useState(false);
  const statusCfg = STATUS_CONFIG[review.status];
  const StatusIcon = statusCfg.icon;

  const presentCount = review.completeness.filter((c) => c.present).length;
  const totalChecks = review.completeness.length;

  return (
    <div className="space-y-4">
      {/* Header with status badge */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Review: {review.companyName}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {review.ticker} · {review.quarter.label}
              </p>
            </div>
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusCfg.color}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusCfg.label}
            </div>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          <MetaCell
            icon={Calendar}
            label="Period End"
            value={review.quarter.periodEnd}
          />
          <MetaCell
            icon={Calendar}
            label="Filing Date"
            value={review.filingDate}
          />
          <MetaCell
            icon={FileCheck}
            label="Filing Type"
            value={review.filingType}
          />
          <MetaCell
            icon={Database}
            label="Source"
            value={review.source === "sec" ? "SEC EDGAR" : "PDF Upload"}
          />
        </div>
      </div>

      {/* Completeness checks */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-subtle">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data Completeness
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                presentCount === totalChecks
                  ? "bg-emerald-50 text-emerald-700"
                  : presentCount >= totalChecks - 2
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
              }`}
            >
              {presentCount}/{totalChecks}
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {review.completeness.map((check) => (
            <div
              key={check.field}
              className="flex items-center gap-2 px-4 py-2 text-sm"
            >
              {check.present ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <span
                className={
                  check.present ? "text-slate-700" : "text-slate-400"
                }
              >
                {check.label}
              </span>
              {check.present && check.value != null && (
                <span className="ml-auto tabular-nums text-xs text-slate-500">
                  {typeof check.value === "number"
                    ? `$${check.value.toLocaleString()}M`
                    : String(check.value)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Segment labels */}
      {review.segmentLabels.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
          <button
            onClick={() => setShowLineItems(!showLineItems)}
            className="flex w-full items-center justify-between"
          >
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Tag className="h-3.5 w-3.5" />
              Extracted Line Items ({review.lineItemCount})
            </h4>
            {showLineItems ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {showLineItems && (
            <div className="mt-2 flex flex-wrap gap-1">
              {review.segmentLabels.map((label) => (
                <span
                  key={label}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {review.warnings.length > 0 && (
        <div className="space-y-2">
          {review.warnings.map((w, i) => {
            const Icon = SEVERITY_ICON[w.severity];
            const color = SEVERITY_COLOR[w.severity];
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${color}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{w.message}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Quarter gaps */}
      {review.gaps.length > 0 && review.gaps.length <= 8 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Missing Quarters
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {review.gaps.map((gap) => (
              <span
                key={gap.expected}
                className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600 ring-1 ring-red-100"
              >
                {gap.expected}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onConfirm}
          disabled={!review.canAppend || confirming}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-40"
        >
          {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
          {review.status === "duplicate" ? "Overwrite & Append" : "Confirm Append"}
        </button>
        <button
          onClick={onCancel}
          disabled={confirming}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-subtle transition hover:bg-slate-50"
        >
          Cancel
        </button>
        {!review.canAppend && (
          <span className="text-xs text-red-500">
            Cannot append — too many missing fields.
          </span>
        )}
      </div>
    </div>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
