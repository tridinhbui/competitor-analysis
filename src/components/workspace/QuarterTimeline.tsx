"use client";

import { useEffect, useState } from "react";
import type { TimelineSlot } from "@/types/competitor";
import { Upload, RefreshCw } from "lucide-react";

interface Props {
  slots: TimelineSlot[];
  onSelectSlot?: (slot: TimelineSlot) => void;
  activeSlotLabel?: string | null;
}

export function QuarterTimeline({ slots, onSelectSlot, activeSlotLabel }: Props) {
  const years = [...new Set(slots.map((slot) => slot.fiscalYear))].sort((a, b) => b - a);
  const visibleYears = years;
  const [selectedYear, setSelectedYear] = useState<number>(years[0] ?? 0);

  useEffect(() => {
    if (years.length === 0) return;
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  const selectedYearSlots = slots
    .filter((slot) => slot.fiscalYear === selectedYear)
    .sort((a, b) => a.fiscalQuarter - b.fiscalQuarter);

  if (slots.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Year tabs */}
        <div className="flex flex-wrap gap-1.5">
          {visibleYears.map((year) => {
            const yearSlots = slots.filter((slot) => slot.fiscalYear === year);
            const complete = yearSlots.filter((slot) => slot.present).length;
            const active = year === selectedYear;
            return (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {year}
                <span className={`ml-1 text-[10px] ${active ? "text-primary/70" : "text-slate-400"}`}>
                  {complete}/{yearSlots.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2.5 pt-0.5 text-[9px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-sm bg-emerald-100 ring-1 ring-emerald-200" />
            On file
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-sm bg-slate-50 ring-1 ring-slate-200" />
            Missing
          </span>
        </div>
      </div>

      {/* Quarter chips */}
      <div className="flex gap-1">
        {selectedYearSlots.map((slot) => (
          <button
            key={slot.label}
            type="button"
            disabled={!onSelectSlot}
            onClick={() => onSelectSlot?.(slot)}
            title={slot.present ? `${slot.label} · ${slot.periodEnd} · click to replace` : `${slot.label} · missing · click to upload`}
            className={`flex flex-1 items-center justify-between rounded-md border px-2 py-1.5 text-left transition ${
              slot.present
                ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                : "border-slate-200 bg-white hover:border-primary/30 hover:bg-primary/[0.03]"
            } ${activeSlotLabel === slot.label ? "ring-2 ring-primary/20" : ""} disabled:cursor-default`}
          >
            <div>
              <p className="text-[10px] font-semibold text-slate-800">Q{slot.fiscalQuarter}</p>
              <p className={`text-[9px] leading-tight ${slot.present ? "text-emerald-600" : "text-slate-400"}`}>
                {slot.present ? "Ready" : "Empty"}
              </p>
            </div>
            {onSelectSlot ? (
              <span className="ml-1 shrink-0 text-slate-400">
                {slot.present ? <RefreshCw className="h-2.5 w-2.5" /> : <Upload className="h-2.5 w-2.5" />}
              </span>
            ) : null}
          </button>
        ))}
      </div>

    </div>
  );
}
