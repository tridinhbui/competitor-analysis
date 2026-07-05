"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileScan,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { AnalyzeLandingShell } from "@/components/workspace/AnalyzeLandingShell";
import { ComparisonReportContent } from "@/components/workspace/ComparisonReportContent";
import { ExcelWorkbookEditor } from "@/components/workspace/ExcelWorkbookEditor";
import { TextTxtAttachment } from "@/components/workspace/TextTxtAttachment";
import { fetchWithAuth } from "@/lib/fetchWithAuth";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";
import { cn } from "@/lib/utils";
import {
  buildEditableWorkbookFromArrayBuffer,
  serializeWorkbookForAnalysis,
} from "@/lib/excelWorkbook";
import type { EditableWorkbook } from "@/lib/excelWorkbook";
import {
  isTextLikeFile,
  normalizeUploadToTxtFile,
  readTxtFileContent,
  TEXT_TXT_AUTO_ATTACH_CHARS,
  textContentToTxtFile,
} from "@/lib/textTxtFile";

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

type ExcelCompetitorPrepPreviewRow = {
  ticker: string;
  companyName: string;
  quarterLabel: string;
  periodEnd: string;
  revenue: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  sourceSheet: string;
  sourceTableLabel: string;
};

type ExcelCompetitorPrepResult = {
  sourceFileName: string;
  processedWorkbookFileName: string;
  processedWorkbookBase64: string;
  primarySheet: string | null;
  comparisonTickers: string[];
  companies: Array<{
    ticker: string;
    companyName: string;
    quarterCount: number;
    latestQuarter: string;
    latestPeriodEnd: string;
  }>;
  sheetMatches: Array<{
    sheetName: string;
    tableLabel: string;
    rowCount: number;
    priority: number;
  }>;
  warnings: string[];
  rowCount: number;
  rowPreview: ExcelCompetitorPrepPreviewRow[];
  comparison: CompanyComparisonPayload | null;
};

export function ExcelAnalyzePanel() {
  const [inputMode, setInputMode] = useState<"excel" | "paste">("excel");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelWorkbook, setExcelWorkbook] = useState<EditableWorkbook | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [script, setScript] = useState("");
  const [textFile, setTextFile] = useState<File | null>(null);
  const [dragOverTxt, setDragOverTxt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingWorkbook, setProcessingWorkbook] = useState(false);
  const [parsingWorkbook, setParsingWorkbook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExcelAnalyzeResult | null>(null);
  const [processedResult, setProcessedResult] = useState<ExcelCompetitorPrepResult | null>(null);
  const [pasteFieldExpanded, setPasteFieldExpanded] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);

  const pasteCharCount = script.trim().length;
  const collapsePasteInput =
    inputMode === "paste" && !!textFile && pasteCharCount >= TEXT_TXT_AUTO_ATTACH_CHARS && !pasteFieldExpanded;

  const canAnalyze = useMemo(() => {
    if (inputMode === "excel") return !!excelWorkbook;
    return pasteCharCount >= 120;
  }, [excelWorkbook, inputMode, pasteCharCount]);

  useEffect(() => {
    if (inputMode !== "paste") return;
    const trimmed = script.trim();
    if (trimmed.length === 0) {
      setTextFile(null);
      return;
    }
    if (trimmed.length < TEXT_TXT_AUTO_ATTACH_CHARS) return;
    const handle = window.setTimeout(() => {
      setTextFile(textContentToTxtFile(trimmed, "spreadsheet-context"));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [inputMode, script]);

  const getPasteSourceText = useCallback(async () => {
    const fromFile = await readTxtFileContent(textFile);
    return (fromFile || script).trim();
  }, [script, textFile]);

  const assignTextUpload = useCallback(async (file: File | null | undefined) => {
    setError(null);
    if (!file) return;
    if (!isTextLikeFile(file)) {
      setError("Only text files are supported (.txt, .md, .csv, or plain text).");
      return;
    }
    try {
      const { file: txt, text } = await normalizeUploadToTxtFile(file);
      setScript(text);
      setTextFile(txt);
    } catch {
      setError("Could not read the text file.");
    }
  }, []);

  const clearTextAttachment = useCallback(() => {
    setTextFile(null);
    setScript("");
    setPasteFieldExpanded(false);
    if (txtInputRef.current) txtInputRef.current.value = "";
  }, []);

  const canProcessWorkbook = useMemo(
    () => inputMode === "excel" && !!excelFile && !parsingWorkbook,
    [excelFile, inputMode, parsingWorkbook]
  );

  async function assignExcelFile(file: File | null) {
    setExcelFile(null);
    setExcelWorkbook(null);
    setError(null);
    setProcessedResult(null);
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
      let text = "";
      if (inputMode === "excel") {
        if (!excelWorkbook) throw new Error("Please upload an Excel file first.");
        text = serializeWorkbookForAnalysis(excelWorkbook);
      } else {
        text = await getPasteSourceText();
      }

      const response = await fetchWithAuth("/api/earnings-script-analysis", {
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

  async function processWorkbookForCompetitorAnalysis() {
    if (!excelFile) {
      setError("Please upload an Excel file first.");
      return;
    }

    setProcessingWorkbook(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", excelFile);

      const response = await fetchWithAuth("/api/excel-preprocess", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ({ error?: string } & Partial<ExcelCompetitorPrepResult>)
        | undefined;

      if (!response.ok || !payload?.processedWorkbookBase64) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      setProcessedResult(payload as ExcelCompetitorPrepResult);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to process workbook for competitor analysis.");
    } finally {
      setProcessingWorkbook(false);
    }
  }

  function downloadProcessedWorkbook() {
    if (!processedResult) return;

    const binary = window.atob(processedResult.processedWorkbookBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = processedResult.processedWorkbookFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <>
      <AnalyzeLandingShell
        eyebrow="Excel Analyze"
        title="Interpret spreadsheets & pasted context"
        subtitle={
          <>
            Upload <strong className="font-semibold text-slate-800">.xlsx, .xls, or .csv</strong>, or paste
            tabular text. We generate variance-style narrative, risk angles, and meeting-ready summaries, or
            split large comparison workbooks into smaller competitor-ready Excel files.
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
                  setTextFile(null);
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
                  setExcelFile(null);
                  setExcelWorkbook(null);
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
                    <ExcelWorkbookEditor
                      workbook={excelWorkbook}
                      onChange={(nextWorkbook) => {
                        setExcelWorkbook(nextWorkbook);
                      }}
                      onError={setError}
                    />
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-xs text-emerald-900">
                      <p className="font-semibold">Competitor-prep workflow</p>
                      <p className="mt-1 leading-relaxed">
                        Use <strong className="font-semibold">Split &amp; Process Excel</strong> to detect sections inside the
                        main sheet, export focused company tabs, and feed the competitor comparison engine without asking AI to
                        read the raw file.
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    {parsingWorkbook
                      ? "Building editable workbook preview..."
                      : excelFile
                        ? `${excelFile.name} loaded`
                        : "No file selected"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={analyze}
                      disabled={!canAnalyze || loading || parsingWorkbook || processingWorkbook}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
                    >
                      {loading || parsingWorkbook ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {parsingWorkbook ? "Preparing workbook" : "Run narrative analysis"}
                    </button>
                    <button
                      type="button"
                      onClick={processWorkbookForCompetitorAnalysis}
                      disabled={!canProcessWorkbook || processingWorkbook || loading}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 sm:text-sm"
                    >
                      {processingWorkbook ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileScan className="h-4 w-4" />
                      )}
                      {processingWorkbook ? "Processing workbook" : "Split & Process Excel"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-2">
                  {textFile ? (
                    <TextTxtAttachment
                      file={textFile}
                      onRemove={clearTextAttachment}
                      onExpandRequest={collapsePasteInput ? () => setPasteFieldExpanded(true) : undefined}
                    />
                  ) : null}
                  {!collapsePasteInput ? (
                  <div
                    className={cn(
                      "flex flex-1 flex-col rounded-2xl border bg-white/90 shadow-inner transition-colors",
                      dragOverTxt ? "border-primary ring-2 ring-primary/15" : "border-slate-200"
                    )}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverTxt(true);
                    }}
                    onDragLeave={() => setDragOverTxt(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOverTxt(false);
                      void assignTextUpload(event.dataTransfer.files?.[0]);
                    }}
                  >
                    <textarea
                      value={script}
                      onChange={(event) => setScript(event.target.value)}
                      placeholder="Paste model notes or drop a .txt file (500+ chars saves as spreadsheet-context.txt)..."
                      className="min-h-[16rem] w-full flex-1 resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary/15"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
                      <p className="text-[10px] text-slate-500">
                        {pasteCharCount >= TEXT_TXT_AUTO_ATTACH_CHARS
                          ? "Saved as .txt attachment"
                          : `${Math.max(0, TEXT_TXT_AUTO_ATTACH_CHARS - pasteCharCount)} more chars for auto .txt`}
                      </p>
                      <button
                        type="button"
                        onClick={() => txtInputRef.current?.click()}
                        className="text-[10px] font-semibold text-primary hover:underline"
                      >
                        Upload text file
                      </button>
                      <input
                        ref={txtInputRef}
                        type="file"
                        accept=".txt,.md,.csv,.log,text/plain"
                        className="hidden"
                        onChange={(event) => void assignTextUpload(event.target.files?.[0])}
                      />
                    </div>
                  </div>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs tabular-nums text-slate-500">
                    {textFile
                      ? `${textFile.name} · ${pasteCharCount.toLocaleString()} characters`
                      : `${pasteCharCount.toLocaleString()} characters`}
                  </p>
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
                  Executive takeaway, thematic bullets, processed workbook exports, and competitor-ready normalized rows
                  surface below for follow-on work.
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

      {processedResult ? (
        <div className="mx-auto mb-10 w-full max-w-6xl space-y-4 px-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-subtle sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Split workbook output</p>
                <p className="mt-1 text-xs text-slate-500">
                  {processedResult.sourceFileName} | {processedResult.rowCount} normalized quarter row(s)
                  {processedResult.primarySheet ? ` | primary sheet: ${processedResult.primarySheet}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={downloadProcessedWorkbook}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" />
                  Download processed workbook
                </button>
                <button
                  type="button"
                  onClick={() => setProcessedResult(null)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Companies detected</p>
                <div className="mt-3 space-y-2">
                  {processedResult.companies.map((company) => (
                    <div key={company.ticker} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">
                          {company.ticker} | {company.companyName}
                        </span>
                        <span className="text-slate-500">{company.quarterCount} quarter(s)</span>
                      </div>
                      <p className="mt-1 text-slate-500">
                        Latest: {company.latestQuarter} ({company.latestPeriodEnd})
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detected sheets</p>
                <div className="mt-3 space-y-2">
                  {processedResult.sheetMatches.map((sheet) => (
                    <div key={`${sheet.sheetName}-${sheet.tableLabel}`} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">{sheet.sheetName}</span>
                        <span className="text-slate-500">{sheet.rowCount} row(s)</span>
                      </div>
                      <p className="mt-1 text-slate-500">{sheet.tableLabel}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {processedResult.warnings.length > 0 ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
                <p className="font-semibold">Preprocess notes</p>
                <ul className="mt-2 space-y-1.5">
                  {processedResult.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {processedResult.rowPreview.length > 0 ? (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Normalized row preview</p>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Ticker</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Quarter</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Revenue</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Op Income</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Op Margin</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedResult.rowPreview.map((row, index) => (
                        <tr key={`${row.ticker}-${row.periodEnd}-${index}`} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{row.ticker}</td>
                          <td className="px-3 py-2 text-slate-700">{row.quarterLabel}</td>
                          <td className="px-3 py-2 text-slate-900">
                            {row.revenue == null ? "N/A" : row.revenue.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-3 py-2 text-slate-900">
                            {row.operatingIncome == null
                              ? "N/A"
                              : row.operatingIncome.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {row.operatingMargin == null ? "N/A" : `${row.operatingMargin.toFixed(1)}%`}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{row.sourceSheet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          {processedResult.comparison ? (
            <ComparisonReportContent result={processedResult.comparison} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-subtle">
              <p className="text-sm font-semibold text-slate-900">Comparison not generated</p>
              <p className="mt-1 text-sm text-slate-500">
                We exported the cleaned workbook, but the processed file did not contain enough company rows to run the
                competitor comparison engine yet.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
