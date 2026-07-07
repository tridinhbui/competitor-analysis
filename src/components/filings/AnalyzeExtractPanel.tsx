"use client";

/**
 * /analyze idle UI — PDF extract entry only.
 * No backfill, quiz, or idle chat here (those live elsewhere).
 */

import type { RefObject } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdfExtractionProfile } from "@/lib/pdfAnalysis";

interface AnalyzeExtractPanelProps {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  aiEnabled?: boolean;
  onToggleAi?: () => void;
  extractionProfile?: PdfExtractionProfile;
  onExtractionProfileChange?: (profile: PdfExtractionProfile) => void;
}

export function AnalyzeExtractPanel({
  dragOver,
  setDragOver,
  handleDrop,
  handleFileInput,
  inputRef,
  aiEnabled = true,
  onToggleAi,
  extractionProfile,
  onExtractionProfileChange,
}: AnalyzeExtractPanelProps) {
  const updateProfile = (patch: PdfExtractionProfile) => {
    onExtractionProfileChange?.({
      businessType: extractionProfile?.businessType ?? "general",
      periodPreference: extractionProfile?.periodPreference ?? "auto",
      scaleOverride: extractionProfile?.scaleOverride ?? "auto",
      strictConsolidatedOnly: extractionProfile?.strictConsolidatedOnly ?? true,
      ...patch,
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-2 py-8 sm:px-4 sm:py-10">
      <div className="mb-6 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#cc521d] sm:text-base">Quick Analyze</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Extract from filings</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
          Upload a <strong className="font-semibold text-slate-800">10-Q PDF</strong>, map the main metrics, and review the result.
        </p>
        <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-3 rounded-3xl border border-[#e7c7b7]/80 bg-[#fffaf6] px-4 py-4 text-sm text-[#3b4043] sm:px-5">
          <p className="font-semibold text-[#cc521d]">How it works</p>
          <p className="text-xs text-slate-600">Upload, review, continue into the workbook.</p>
        </div>
        {onToggleAi ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={onToggleAi}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                aiEnabled
                  ? "border-[#e7c7b7] bg-white text-[#cc521d] hover:bg-[#fff6f1]"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-white"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI extraction {aiEnabled ? "on" : "off"}
              <span className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                aiEnabled ? "bg-slate-200 text-slate-900" : "bg-slate-200 text-slate-500"
              )}>{aiEnabled ? "enabled" : "disabled"}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="flex min-h-[26rem] rounded-3xl border border-[#e7c7b7]/60 bg-white p-5 shadow-sm sm:min-h-[30rem] sm:p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-10",
              dragOver ? "border-[#cc521d] bg-[#fff6f1] shadow-sm" : "border-[#e3e5e7] bg-white/80 shadow-subtle hover:border-[#e7c7b7] hover:bg-white"
            )}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            aria-label="Upload a 10-Q PDF for analysis"
          >
            <div
              className={cn(
                "mb-1 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors sm:h-14 sm:w-14",
                dragOver ? "bg-white text-[#cc521d]" : "bg-white text-[#5a6065]"
              )}
            >
              <FileUp className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-slate-900 sm:text-base">Drop your 10-Q PDF here</p>
            <p className="text-xs text-slate-500 sm:text-sm">Parsed in-browser.</p>
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
          </div>
        </div>

        <aside className="rounded-3xl border border-[#e7c7b7]/60 bg-white p-5 shadow-sm sm:p-6">
          <p className="inline-flex items-center gap-1 rounded-full bg-[#fff6f1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#cc521d]">
            <Sparkles className="h-3 w-3" aria-hidden />
            What happens next
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p>Upload the filing, verify the extraction, then continue into the workbook.</p>
            <p className="rounded-xl border border-[#e7c7b7]/80 bg-white p-3 text-sm text-[#cc521d]">Use PDF for exact filings and Data Source for SEC history.</p>
          </div>
          {extractionProfile && onExtractionProfileChange ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                Extraction profile
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Tune parsing for the business model before upload. Auto works for most filings; override when numbers look off.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Business type
                  <select
                    value={extractionProfile.businessType ?? "general"}
                    onChange={(event) =>
                      updateProfile({ businessType: event.target.value as PdfExtractionProfile["businessType"] })
                    }
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#cc521d]/15"
                  >
                    <option value="general">Auto / general</option>
                    <option value="manufacturing">Manufacturing / CPG</option>
                    <option value="retail">Retail</option>
                    <option value="software">Software / SaaS</option>
                    <option value="financial">Bank / financial</option>
                    <option value="insurance">Insurance</option>
                    <option value="real-estate">Real estate / REIT</option>
                    <option value="energy">Energy</option>
                    <option value="healthcare">Healthcare</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Period
                    <select
                      value={extractionProfile.periodPreference ?? "auto"}
                      onChange={(event) =>
                        updateProfile({ periodPreference: event.target.value as PdfExtractionProfile["periodPreference"] })
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#cc521d]/15"
                    >
                      <option value="auto">Auto</option>
                      <option value="quarter">Quarter</option>
                      <option value="ytd">YTD</option>
                      <option value="annual">Annual</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Scale
                    <select
                      value={extractionProfile.scaleOverride ?? "auto"}
                      onChange={(event) =>
                        updateProfile({ scaleOverride: event.target.value as PdfExtractionProfile["scaleOverride"] })
                      }
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-[#cc521d]/15"
                    >
                      <option value="auto">Auto</option>
                      <option value="thousands">Thousands</option>
                      <option value="millions">Millions</option>
                      <option value="billions">Billions</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={extractionProfile.strictConsolidatedOnly !== false}
                    onChange={(event) => updateProfile({ strictConsolidatedOnly: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#cc521d]"
                  />
                  <span>
                    <span className="block font-semibold text-slate-800">Prefer consolidated totals</span>
                    Avoid segment, adjusted, percentage, per-share, and non-GAAP rows unless that metric explicitly asks for them.
                  </span>
                </label>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
