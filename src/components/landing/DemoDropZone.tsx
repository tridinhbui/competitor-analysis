"use client";

import type { RefObject } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ExtractionTimeline, EXTRACTION_STEPS } from "./ExtractionTimeline";
import { MockResultPreview } from "./MockResultPreview";

export type DemoRunState = "idle" | "running" | "complete";

interface DemoDropZoneProps {
  /** When true, no file input—zone is for marketing demo only. */
  demoOnly?: boolean;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onPickFile: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** -1 = no step highlighted as current; 0..5 = timeline */
  demoTimelineIndex: number;
  demoRunState: DemoRunState;
  demoFileLabel: string | null;
  onResetDemo: () => void;
}

export function DemoDropZone({
  demoOnly = false,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPickFile,
  inputRef,
  onFileChange,
  demoTimelineIndex,
  demoRunState,
  demoFileLabel,
  onResetDemo,
}: DemoDropZoneProps) {
  const showTimeline = demoRunState === "running" || demoRunState === "complete";
  const showPreview = demoRunState === "complete";
  const dropActive = dragOver || demoRunState === "running";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-2">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)] lg:items-stretch">
        <motion.div
          layout
          className="relative overflow-hidden rounded-3xl border border-border bg-white/85 shadow-elevation backdrop-blur-sm"
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPickFile();
              }
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onPickFile}
            className={cn(
              "relative cursor-pointer p-8 transition-all duration-300 sm:p-10",
              dragOver && "bg-primary/[0.04]",
              demoRunState === "running" && "bg-secondary/85"
            )}
            aria-label={demoOnly ? "Interactive demo: simulate 10-Q extraction" : "Upload a 10-Q PDF for analysis"}
          >
            <AnimatePresence mode="wait">
              {demoRunState === "idle" && !dragOver && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col items-center text-center"
                >
                  <div
                    className={cn(
                      "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 sm:h-16 sm:w-16",
                      "bg-gradient-to-br from-secondary to-white text-muted-foreground ring-1 ring-border"
                    )}
                  >
                    <FileUp className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
                  </div>
                  <p className="text-base font-bold text-foreground sm:text-lg">
                    {demoOnly ? "See how a 10-Q flows through extraction" : "Drop your 10-Q PDF here"}
                  </p>
                  <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {demoOnly
                      ? "Simulated pipeline for this page only. Upload real filings on Analyze."
                      : "Live analysis runs in the app—this zone accepts your filing and opens the extraction pipeline."}
                  </p>
                  <span className="mt-5 inline-flex rounded-full bg-secondary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {demoOnly ? "Or click to run demo" : "Or click to browse"}
                  </span>
                </motion.div>
              )}
              {(dragOver || demoRunState !== "idle") && (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col items-center text-center"
                >
                  <div
                    className={cn(
                      "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 sm:h-16 sm:w-16",
                      dropActive ? "bg-primary/15 text-primary ring-2 ring-primary/25" : "bg-secondary text-muted-foreground"
                    )}
                  >
                    <FileUp className="h-7 w-7 sm:h-8 sm:w-8" aria-hidden />
                  </div>
                  {demoFileLabel ? (
                    <p className="text-sm font-semibold text-foreground sm:text-base">{demoFileLabel}</p>
                  ) : (
                    <p className="text-sm font-semibold text-foreground sm:text-base">
                      {demoOnly ? "Release to simulate" : "Release to analyze"}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {demoRunState === "running"
                      ? demoOnly
                        ? "Demo only — same stages run on real uploads in Analyze."
                        : "Simulated pipeline — your real PDF follows the same stages."
                      : demoOnly
                        ? "Open Analyze to run this on your actual PDF or ticker."
                        : "Your PDF will open next to the dashboard."}
                  </p>
                  {demoRunState === "complete" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResetDemo();
                      }}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-foreground shadow-subtle transition hover:bg-secondary"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Reset demo
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {demoRunState === "running" && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-secondary"
                aria-hidden
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-primary/40 via-primary to-primary/60"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3.4, ease: "easeInOut" }}
                />
              </div>
            )}

            {/* Shimmer overlay while “extracting” */}
            <AnimatePresence>
              {demoRunState === "running" && demoTimelineIndex >= 0 && demoTimelineIndex < EXTRACTION_STEPS.length - 1 && (
                <motion.div
                  key="shimmer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  <motion.div
                    className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    initial={{ x: "-60%" }}
                    animate={{ x: "220%" }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {!demoOnly && inputRef && onFileChange && (
              <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onFileChange} />
            )}
          </div>
        </motion.div>

        <div className="flex flex-col gap-4">
          <div
            className={cn(
              "rounded-3xl border border-border bg-white/90 p-5 shadow-subtle backdrop-blur-sm transition-opacity duration-300",
              !showTimeline && "opacity-60"
            )}
          >
            <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Extraction timeline</p>
            {showTimeline ? (
              <ExtractionTimeline activeIndex={demoTimelineIndex} />
            ) : (
              <div className="space-y-3" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-lg bg-secondary/90" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            )}
          </div>
          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.4 }}
              >
                <MockResultPreview />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
