"use client";

import type { TimelineSlot } from "@/types/competitor";

interface Props {
  slots: TimelineSlot[];
}

export function QuarterTimeline({ slots }: Props) {
  if (slots.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Quarter Coverage (Q1 2023 – Present)
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((slot) => (
          <div
            key={slot.label}
            title={
              slot.present
                ? `${slot.label} · ${slot.periodEnd} (${slot.source})`
                : `${slot.label} · missing`
            }
            className={`flex h-8 items-center justify-center rounded-md px-2 text-[10px] font-semibold transition ${
              slot.present
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-slate-50 text-slate-400 ring-1 ring-slate-100"
            }`}
          >
            {slot.label}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
          On file
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-50 ring-1 ring-slate-100" />
          Missing
        </span>
      </div>
    </div>
  );
}
