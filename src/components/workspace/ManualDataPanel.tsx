"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ManualDataRecord,
  ManualDataType,
  IndustryLandscapeEntry,
  GuidanceEntry,
  NarrativeEntry,
  NarrativeType,
  UnitVolumeEntry,
  SegmentOverrideEntry,
} from "@/types/manualData";
import type { VolumeUnitType } from "@/types/segments";
import {
  Database,
  Plus,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  BarChart3,
  Factory,
  Target,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Props & state
// ---------------------------------------------------------------------------

interface Props {
  ticker: string | null;
}

const DATA_TYPE_TABS: Array<{
  key: ManualDataType;
  label: string;
  icon: typeof Database;
}> = [
  { key: "segment-override", label: "Segments", icon: BarChart3 },
  { key: "narrative", label: "Narratives", icon: MessageSquare },
  { key: "industry-landscape", label: "Landscape", icon: Factory },
  { key: "guidance", label: "Guidance", icon: Target },
  { key: "unit-volume", label: "Volumes", icon: FileText },
];

// ---------------------------------------------------------------------------
// Generic form field helpers
// ---------------------------------------------------------------------------

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 focus:border-primary focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Segment Override Form
// ---------------------------------------------------------------------------

function SegmentOverrideForm({
  onSave,
  saving,
  periodEnd,
}: {
  onSave: (data: SegmentOverrideEntry, periodEnd: string, source: string) => void;
  saving: boolean;
  periodEnd: string;
}) {
  const [pe, setPe] = useState(periodEnd);
  const [name, setName] = useState("");
  const [revenue, setRevenue] = useState<number | null>(null);
  const [operatingIncome, setOperatingIncome] = useState<number | null>(null);
  const [costOfRevenue, setCostOfRevenue] = useState<number | null>(null);
  const [sgaExpense, setSgaExpense] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Segment Name">
          <TextInput value={name} onChange={setName} placeholder="e.g. US Pork" />
        </FormField>
        <FormField label="Period End">
          <TextInput value={pe} onChange={setPe} placeholder="2025-12-27" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Revenue ($MM)">
          <NumberInput value={revenue} onChange={setRevenue} />
        </FormField>
        <FormField label="Operating Income ($MM)">
          <NumberInput value={operatingIncome} onChange={setOperatingIncome} />
        </FormField>
        <FormField label="Cost of Revenue ($MM)">
          <NumberInput value={costOfRevenue} onChange={setCostOfRevenue} />
        </FormField>
        <FormField label="SG&A ($MM)">
          <NumberInput value={sgaExpense} onChange={setSgaExpense} />
        </FormField>
      </div>
      <FormField label="Reason for Override">
        <TextInput value={reason} onChange={setReason} placeholder="e.g. Manual entry from 10-Q Note 17" />
      </FormField>
      <button
        onClick={() => {
          if (!name || !pe) return;
          onSave(
            {
              segment: {
                segmentName: name,
                segmentType: "business",
                revenue,
                costOfRevenue,
                grossProfit: revenue != null && costOfRevenue != null ? revenue - costOfRevenue : null,
                sgaExpense,
                operatingIncome,
                operatingMargin: revenue && operatingIncome ? Math.round((operatingIncome / revenue) * 1000) / 10 : null,
                depreciation: null,
                capitalExpenditures: null,
                totalAssets: null,
                intercompanyEliminations: null,
                volumeUnits: null,
                volumeUnitType: null,
                revenuePerUnit: null,
                operatingIncomePerUnit: null,
              },
              reason,
            },
            pe,
            reason
          );
        }}
        disabled={saving || !name || !pe}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Segment
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrative Form
// ---------------------------------------------------------------------------

function NarrativeForm({
  onSave,
  saving,
}: {
  onSave: (data: NarrativeEntry, periodEnd: string, source: string) => void;
  saving: boolean;
}) {
  const [type, setType] = useState<NarrativeType>("earnings-summary");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [date, setDate] = useState("");
  const [stockReaction, setStockReaction] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Type">
          <SelectInput
            value={type}
            onChange={(v) => setType(v as NarrativeType)}
            options={[
              { value: "earnings-summary", label: "Earnings Summary" },
              { value: "analyst-qa", label: "Analyst Q&A" },
              { value: "methodology-note", label: "Methodology Note" },
              { value: "general", label: "General" },
            ]}
          />
        </FormField>
        <FormField label="Date">
          <TextInput value={date} onChange={setDate} placeholder="2026-03-02" />
        </FormField>
      </div>
      <FormField label="Title">
        <TextInput value={title} onChange={setTitle} placeholder="e.g. Tyson Q4 Earnings Release" />
      </FormField>
      <FormField label="Body (Markdown)">
        <TextArea value={body} onChange={setBody} placeholder="Narrative content..." rows={8} />
      </FormField>
      <FormField label="Stock Price Reaction">
        <TextInput value={stockReaction} onChange={setStockReaction} placeholder="e.g. +0.6% on day" />
      </FormField>
      <button
        onClick={() => {
          if (!title || !body || !date) return;
          onSave(
            { type, title, body, stockPriceReaction: stockReaction || undefined, date },
            date,
            `Narrative: ${type}`
          );
        }}
        disabled={saving || !title || !body}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Narrative
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Industry Landscape Form
// ---------------------------------------------------------------------------

function LandscapeForm({
  onSave,
  saving,
}: {
  onSave: (data: IndustryLandscapeEntry, periodEnd: string, source: string) => void;
  saving: boolean;
}) {
  const [plantCount, setPlantCount] = useState<number | null>(null);
  const [plantDetail, setPlantDetail] = useState("");
  const [sowCount, setSowCount] = useState<number | null>(null);
  const [annualHogRaised, setAnnualHogRaised] = useState<number | null>(null);
  const [slaughterCap, setSlaughterCap] = useState<number | null>(null);
  const [farmCount, setFarmCount] = useState<number | null>(null);
  const [ttmVolume, setTtmVolume] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <FormField label="# Plants">
          <NumberInput value={plantCount} onChange={setPlantCount} />
        </FormField>
        <FormField label="# Sows">
          <NumberInput value={sowCount} onChange={setSowCount} />
        </FormField>
        <FormField label="# Farms">
          <NumberInput value={farmCount} onChange={setFarmCount} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Annual Hog Raised">
          <NumberInput value={annualHogRaised} onChange={setAnnualHogRaised} placeholder="MM" />
        </FormField>
        <FormField label="Annual Slaughter Capacity (Hd)">
          <NumberInput value={slaughterCap} onChange={setSlaughterCap} placeholder="MM" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="TTM Volume (Lbs)">
          <NumberInput value={ttmVolume} onChange={setTtmVolume} placeholder="B" />
        </FormField>
        <FormField label="Plant Detail">
          <TextInput value={plantDetail} onChange={setPlantDetail} placeholder="e.g. 8 Harvest, 2 Value Add" />
        </FormField>
      </div>
      <FormField label="Notes">
        <TextArea value={notes} onChange={setNotes} rows={2} />
      </FormField>
      <button
        onClick={() => {
          onSave(
            {
              plantCount,
              plantDetail: plantDetail || undefined,
              sowCount,
              annualHogRaised,
              slaughterCapacityAnnual: slaughterCap,
              farmCount,
              farmDetail: undefined,
              ttmVolumeLbs: ttmVolume,
              notes,
            },
            "",
            "Industry landscape data"
          );
        }}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Landscape Data
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guidance Form
// ---------------------------------------------------------------------------

function GuidanceForm({
  onSave,
  saving,
}: {
  onSave: (data: GuidanceEntry, periodEnd: string, source: string) => void;
  saving: boolean;
}) {
  const [fiscalYear, setFiscalYear] = useState(2026);
  const [metric, setMetric] = useState("adj-operating-income");
  const [metricLabel, setMetricLabel] = useState("Adj. Operating Income");
  const [low, setLow] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [unit, setUnit] = useState<string>("dollars-mm");
  const [asOfDate, setAsOfDate] = useState("");
  const [source, setSource] = useState("");
  const [consensus, setConsensus] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Fiscal Year">
          <NumberInput value={fiscalYear} onChange={(v) => setFiscalYear(v ?? 2026)} />
        </FormField>
        <FormField label="Metric ID">
          <SelectInput
            value={metric}
            onChange={(v) => {
              setMetric(v);
              const labels: Record<string, string> = {
                "net-sales": "Net Sales",
                "adj-operating-income": "Adj. Operating Income",
                "adj-eps": "Adj. Diluted EPS",
              };
              setMetricLabel(labels[v] ?? v);
            }}
            options={[
              { value: "net-sales", label: "Net Sales" },
              { value: "adj-operating-income", label: "Adj. Operating Income" },
              { value: "adj-eps", label: "Adj. Diluted EPS" },
            ]}
          />
        </FormField>
        <FormField label="Unit">
          <SelectInput
            value={unit}
            onChange={setUnit}
            options={[
              { value: "dollars-mm", label: "$MM" },
              { value: "dollars-b", label: "$B" },
              { value: "eps", label: "EPS" },
              { value: "percent", label: "%" },
            ]}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Low">
          <NumberInput value={low} onChange={setLow} />
        </FormField>
        <FormField label="High">
          <NumberInput value={high} onChange={setHigh} />
        </FormField>
        <FormField label="Midpoint">
          <NumberInput
            value={low != null && high != null ? (low + high) / 2 : null}
            onChange={() => {}}
            placeholder="Auto"
          />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="As-of Date">
          <TextInput value={asOfDate} onChange={setAsOfDate} placeholder="2026-02-06" />
        </FormField>
        <FormField label="Consensus">
          <NumberInput value={consensus} onChange={setConsensus} />
        </FormField>
        <FormField label="Actual">
          <NumberInput value={actual} onChange={setActual} />
        </FormField>
      </div>
      <FormField label="Source">
        <TextInput value={source} onChange={setSource} placeholder="e.g. Q4 earnings call" />
      </FormField>
      <button
        onClick={() => {
          if (!asOfDate) return;
          onSave(
            {
              fiscalYear,
              metric,
              metricLabel,
              low,
              high,
              midpoint: low != null && high != null ? (low + high) / 2 : null,
              unit: unit as GuidanceEntry["unit"],
              asOfDate,
              source,
              consensus,
              actual,
            },
            asOfDate,
            `Guidance: FY${fiscalYear} ${metricLabel}`
          );
        }}
        disabled={saving || !asOfDate}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Guidance
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit Volume Form
// ---------------------------------------------------------------------------

function UnitVolumeForm({
  onSave,
  saving,
}: {
  onSave: (data: UnitVolumeEntry, periodEnd: string, source: string) => void;
  saving: boolean;
}) {
  const [segmentName, setSegmentName] = useState("");
  const [volume, setVolume] = useState<number | null>(null);
  const [unitType, setUnitType] = useState<VolumeUnitType>("head");
  const [periodType, setPeriodType] = useState<"quarterly" | "ttm" | "annual">("quarterly");
  const [periodEnd, setPeriodEnd] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Segment Name">
          <TextInput value={segmentName} onChange={setSegmentName} placeholder="e.g. US Pork" />
        </FormField>
        <FormField label="Period End">
          <TextInput value={periodEnd} onChange={setPeriodEnd} placeholder="2025-12-27" />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Volume">
          <NumberInput value={volume} onChange={setVolume} />
        </FormField>
        <FormField label="Unit Type">
          <SelectInput
            value={unitType}
            onChange={(v) => setUnitType(v as VolumeUnitType)}
            options={[
              { value: "head", label: "Head" },
              { value: "cwt", label: "Cwt" },
              { value: "lbs", label: "Lbs" },
              { value: "cases", label: "Cases" },
            ]}
          />
        </FormField>
        <FormField label="Period Type">
          <SelectInput
            value={periodType}
            onChange={(v) => setPeriodType(v as "quarterly" | "ttm" | "annual")}
            options={[
              { value: "quarterly", label: "Quarterly" },
              { value: "ttm", label: "TTM" },
              { value: "annual", label: "Annual" },
            ]}
          />
        </FormField>
      </div>
      <button
        onClick={() => {
          if (!segmentName || !volume || !periodEnd) return;
          onSave(
            { segmentName, volumeUnits: volume, unitType, periodType },
            periodEnd,
            `Volume: ${segmentName}`
          );
        }}
        disabled={saving || !segmentName || !volume}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-subtle transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save Volume
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Record list
// ---------------------------------------------------------------------------

function RecordList({
  records,
  onDelete,
}: {
  records: ManualDataRecord[];
  onDelete: (id: string) => void;
}) {
  if (records.length === 0) {
    return (
      <p className="py-4 text-center text-[11px] text-slate-400">
        No entries yet. Use the form above to add data.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-60 overflow-y-auto">
      {records.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-700 truncate">
              {r.dataType}
              {r.periodEnd && (
                <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                  {r.periodEnd}
                </span>
              )}
            </div>
            {r.sourceNote && (
              <p className="text-[10px] text-slate-400 truncate">{r.sourceNote}</p>
            )}
          </div>
          <button
            onClick={() => r.id && onDelete(r.id)}
            className="shrink-0 rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export function ManualDataPanel({ ticker }: Props) {
  const [records, setRecords] = useState<ManualDataRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<ManualDataType>("segment-override");
  const [expanded, setExpanded] = useState(false);

  const fetchRecords = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/manual-data?ticker=${encodeURIComponent(t)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        setRecords(data.records ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchRecords(ticker);
  }, [ticker, fetchRecords]);

  const handleSave = useCallback(
    async (
      data: unknown,
      periodEnd: string,
      sourceNote: string
    ) => {
      if (!ticker) return;
      setSaving(true);
      setSaved(false);
      try {
        const resp = await fetch("/api/manual-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            periodEnd: periodEnd || null,
            dataType: activeTab,
            data,
            sourceNote,
          }),
        });
        if (resp.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          fetchRecords(ticker);
        }
      } finally {
        setSaving(false);
      }
    },
    [ticker, activeTab, fetchRecords]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!ticker) return;
      await fetch(`/api/manual-data?id=${id}`, { method: "DELETE" });
      fetchRecords(ticker);
    },
    [ticker, fetchRecords]
  );

  if (!ticker) return null;

  const filteredRecords = records.filter((r) => r.dataType === activeTab);

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
        <Database className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-slate-900">Manual Data Entry</h3>
        {records.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {records.length} entries
          </span>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        {saved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </button>

      {expanded && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {DATA_TYPE_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${
                  activeTab === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-subtle">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {activeTab === "segment-override" && (
                  <SegmentOverrideForm
                    onSave={(data, pe, src) => handleSave(data, pe, src)}
                    saving={saving}
                    periodEnd=""
                  />
                )}
                {activeTab === "narrative" && (
                  <NarrativeForm
                    onSave={(data, pe, src) => handleSave(data, pe, src)}
                    saving={saving}
                  />
                )}
                {activeTab === "industry-landscape" && (
                  <LandscapeForm
                    onSave={(data, pe, src) => handleSave(data, pe, src)}
                    saving={saving}
                  />
                )}
                {activeTab === "guidance" && (
                  <GuidanceForm
                    onSave={(data, pe, src) => handleSave(data, pe, src)}
                    saving={saving}
                  />
                )}
                {activeTab === "unit-volume" && (
                  <UnitVolumeForm
                    onSave={(data, pe, src) => handleSave(data, pe, src)}
                    saving={saving}
                  />
                )}

                {/* Existing records */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Saved Entries ({filteredRecords.length})
                  </p>
                  <RecordList records={filteredRecords} onDelete={handleDelete} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
