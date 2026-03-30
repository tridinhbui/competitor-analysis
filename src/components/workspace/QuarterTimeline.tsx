"use client";

import type { TimelineSlot } from "@/types/competitor";
import { Upload, RefreshCw } from "lucide-react";

interface Props {
  slots: TimelineSlot[];
  onSelectSlot?: (slot: TimelineSlot) => void;
  activeSlotLabel?: string | null;
}

export function QuarterTimeline({ slots, onSelectSlot, activeSlotLabel }: Props) {
  if (slots.length === 0) return null;

  const years = [...new Set(slots.map((slot) => slot.fiscalYear))].sort((a, b) => b - a);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-subtle">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quarter Coverage
          </h4>
          <p className="mt-1 text-[11px] text-slate-400">
            Upload quarter-by-quarter. The selected slot determines the saved period.
          </p>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-slate-400 sm:flex">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            On file
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />
            Missing
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {years.map((year) => {
          const yearSlots = slots
            .filter((slot) => slot.fiscalYear === year)
            .sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);

          return (
            <div
              key={year}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{year}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    Quarterly upload slots
                  </p>
                </div>
                <div className="text-[10px] text-slate-400">
                  {yearSlots.filter((slot) => slot.present).length}/4 complete
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {yearSlots.map((slot) => (
                  <div
                    key={slot.label}
                    title={
                      slot.present
                        ? `${slot.label} · ${slot.periodEnd} (${slot.source})`
                        : `${slot.label} · missing`
                    }
                    className={`rounded-lg border bg-white p-3 transition ${
                      slot.present
                        ? "border-emerald-200"
                        : "border-slate-200"
                    } ${activeSlotLabel === slot.label ? "ring-2 ring-primary/20" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          Q{slot.fiscalQuarter}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">{slot.periodEnd}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          slot.present
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {slot.present ? "Ready" : "Empty"}
                      </span>
                    </div>

                    {onSelectSlot ? (
                      <button
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                        className={`mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition ${
                          slot.present
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        {slot.present ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        {slot.present ? "Replace PDF" : "Add PDF"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
