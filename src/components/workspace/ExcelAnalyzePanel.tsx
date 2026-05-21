"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  FileScan,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { AnalyzeLandingShell } from "@/components/workspace/AnalyzeLandingShell";
import { ExcelWorkbookEditor } from "@/components/workspace/ExcelWorkbookEditor";
import { cn } from "@/lib/utils";
import {
  buildEditableWorkbookFromArrayBuffer,
  serializeWorkbookForAnalysis,
} from "@/lib/excelWorkbook";
import type { EditableWorkbook } from "@/lib/excelWorkbook";

type ExcelAnalyzeResult = {
  sessionTitle: string;
  companyFocus: string;
  quarter: string;
  executiveTakeaway?: string;
  summary?: string;
  growth?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  profitability?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  investment?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  riskAnalysis?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  demandSignals?: Array<{ finding: string; metric: string; context: string; investorImplication: string }>;
  extractedMetrics?: Array<{ metric: string; value: string; context: string }>;
  generatedAt: string;
};

export function ExcelAnalyzePanel() {
  const [inputMode, setInputMode] = useState<"excel" | "paste">("excel");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelWorkbook, setExcelWorkbook] = useState<EditableWorkbook | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsingWorkbook, setParsingWorkbook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExcelAnalyzeResult | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const canAnalyze = useMemo(() => {
    if (inputMode === "excel") return !!excelWorkbook;
    return script.trim().length >= 120;
  }, [excelWorkbook, inputMode, script]);

  async function assignExcelFile(file: File | null) {
    setExcelFile(null);
    setExcelWorkbook(null);
    setError(null);
    if (!file) return;

    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!validExt) {
      setError("Only Excel/CSV files are supported (.xlsx, .xls, .csv).");
      return;
    }

    setParsingWorkbook(true);
    try {
      const buffer = await file.arrayBuffer();
      setExcelWorkbook(buildEditableWorkbookFromArrayBuffer(buffer));
      setExcelFile(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to open the workbook.");
    } finally {
      setParsingWorkbook(false);
    }
  }

  async function analyze() {
    setLoading(true);
    setError(null);

    try {
      let text = script.trim();
      if (inputMode === "excel") {
        if (!excelWorkbook) throw new Error("Please upload an Excel file first.");
        text = serializeWorkbookForAnalysis(excelWorkbook);
      }

      const response = await fetch("/api/earnings-script-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceHint: "user-input",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        analysis?: ExcelAnalyzeResult;
        error?: string;
      };

      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      setResult(payload.analysis);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to run Excel Analyze.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AnalyzeLandingShell
        eyebrow="Excel Analyze"
        title="Interpret spreadsheets & pasted context"
        subtitle={
          <>
            Upload <strong className="font-semibold text-slate-800">.xlsx, .xls, or .csv</strong>, or paste
            tabular text. We generate variance-style narrative, risk angles, and meeting-ready summaries.
          </>
        }
        left={
          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setInputMode("excel");
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                  inputMode === "excel"
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                Upload Excel / CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputMode("paste");
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                  inputMode === "paste"
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                Paste text
              </button>
            </div>

            {inputMode === "excel" ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => excelInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      excelInputRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    void assignExcelFile(event.dataTransfer.files?.[0]);
                  }}
                  aria-label="Upload Excel or CSV for analysis"
                  className={cn(
                    "flex min-h-[12rem] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:min-h-[14rem]",
                    dragOver
                      ? "border-primary bg-primary/[0.06] shadow-subtle"
                      : "border-slate-200 bg-white/85 shadow-inner hover:border-primary/35 hover:bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex h-12 w-12 items-center justify-center rounded-2xl sm:h-14 sm:w-14",
                      dragOver ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    <FileSpreadsheet className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 sm:text-base">
                    {parsingWorkbook
                      ? "Opening workbook..."
                      : excelFile
                        ? excelFile.name
                        : "Drop workbook here or click to browse"}
                  </p>
                  <p className="max-w-sm text-xs text-slate-500 sm:text-sm">
                    First sheets and rows run in-browser. Large books are capped to the first 250 rows x 20 columns
                    per sheet for a stable, editable preview.
                  </p>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={(event) => void assignExcelFile(event.target.files?.[0] ?? null)}
                  />
                </div>

                {excelWorkbook ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                      Excel-style preview is live now: use the toolbar for font/number formatting, and right click in
                      the grid for cut, copy, paste, insert row, delete row, and clear.
                    </div>
                    <ExcelWorkbookEditor workbook={excelWorkbook} onChange={setExcelWorkbook} onError={setError} />
                  </div>
                ) : null}

                <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    {parsingWorkbook
                      ? "Building editable workbook preview..."
                      : excelFile
                        ? `${excelFile.name} loaded`
                        : "No file selected"}
                  </p>
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={!canAnalyze || loading || parsingWorkbook}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 sm:text-sm"
                  >
                    {loading || parsingWorkbook ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {parsingWorkbook ? "Preparing workbook" : "Run analysis"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white/90 shadow-inner">
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    placeholder="Paste forecast snippets, KPI tables, or model exports (120+ characters)..."
                    className="min-h-[16rem] w-full flex-1 resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs tabular-nums text-slate-500">{script.trim().length} characters</p>
                  <button
                    type="button"
                    onClick={analyze}
                    disabled={!canAnalyze || loading}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 sm:text-sm"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardPaste className="h-4 w-4" />
                    )}
                    Run analysis
                  </button>
                </div>
              </>
            )}

            {error ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            ) : null}
          </div>
        }
        sidebar={
          <>
            <p className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              What happens next
            </p>
            <ol className="mt-4 space-y-3 text-sm">
              <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="font-semibold text-slate-900">1) Ingest workbook or paste</p>
                <p className="mt-1 text-xs text-slate-600">
                  Sheets are flattened to text safely in-browser; pasted blocks skip file parsing entirely.
                </p>
              </li>
              <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="font-semibold text-slate-900">2) Map numbers to narrative</p>
                <p className="mt-1 text-xs text-slate-600">
                  Growth, profitability, capex/investment cues, risks, and demand signals are synthesized with an
                  analyst-style tone.
                </p>
              </li>
              <li className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="font-semibold text-slate-900">3) Review output</p>
                <p className="mt-1 text-xs text-slate-600">
                  Executive takeaway, thematic bullets, and extracted metrics surface below for screenshots or follow-on
                  work.
                </p>
              </li>
            </ol>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
              <p className="inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Pro tip
              </p>
              <p className="mt-1 leading-relaxed">
                Isolate the worksheet that carries your forward guidance. Focused inputs produce sharper commentary than an
                entire model export.
              </p>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Need audited filing metrics instead? Try{" "}
              <Link href="/analyze" className="font-semibold text-primary hover:underline">
                Quick Analyze
              </Link>{" "}
              with a <strong className="font-semibold text-slate-700">10-Q PDF</strong>.
            </p>
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-slate-500">
              <FileScan className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Same narrative engine as Earnings Script - tuned here for spreadsheets.
            </div>
          </>
        }
      />

      {result ? (
        <div className="mx-auto mb-10 w-full max-w-6xl space-y-4 px-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-subtle sm:p-6">
            <p className="text-sm font-semibold text-slate-900">{result.sessionTitle}</p>
            <p className="mt-1 text-xs text-slate-500">
              {result.companyFocus} | {result.quarter} | {new Date(result.generatedAt).toLocaleString("en-US")}
            </p>
            <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
              {result.executiveTakeaway || result.summary || "No executive summary extracted."}
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key financial signals</p>
                <ul className="space-y-1.5">
                  {(result.growth ?? []).slice(0, 3).map((item, index) => (
                    <li
                      key={`g-${index}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-700"
                    >
                      {item.finding}
                    </li>
                  ))}
                  {(result.profitability ?? []).slice(0, 2).map((item, index) => (
                    <li
                      key={`p-${index}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-700"
                    >
                      {item.finding}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Risks & demand</p>
                <ul className="space-y-1.5">
                  {(result.riskAnalysis ?? []).slice(0, 3).map((item, index) => (
                    <li
                      key={`r-${index}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-700"
                    >
                      {item.finding}
                    </li>
                  ))}
                  {(result.demandSignals ?? []).slice(0, 2).map((item, index) => (
                    <li
                      key={`d-${index}`}
                      className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-700"
                    >
                      {item.finding}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {(result.extractedMetrics ?? []).length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Extracted metrics</p>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Metric</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Value</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.extractedMetrics ?? []).slice(0, 12).map((metric, index) => (
                        <tr key={`${metric.metric}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{metric.metric}</td>
                          <td className="px-3 py-2 text-slate-900">{metric.value}</td>
                          <td className="px-3 py-2 text-slate-600">{metric.context}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
