"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { MarketStrip } from "./MarketStrip";
import { LandingHero } from "./LandingHero";
import { DemoDropZone, type DemoRunState } from "./DemoDropZone";
import { FeatureGrid } from "./FeatureGrid";
import { ProblemSolutionSection } from "./ProblemSolutionSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { PricingSection } from "./PricingSection";
import { PaymentSection } from "./PaymentSection";
import { DisclaimerSection } from "./DisclaimerSection";
import { EXTRACTION_STEPS } from "./ExtractionTimeline";

export function HomeLanding() {
  const [dragOver, setDragOver] = useState(false);
  const [demoRunState, setDemoRunState] = useState<DemoRunState>("idle");
  const [demoTimelineIndex, setDemoTimelineIndex] = useState(-1);
  const [demoFileLabel, setDemoFileLabel] = useState<string | null>(null);
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearDemoTimers = useCallback(() => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
  }, []);

  const resetDemo = useCallback(() => {
    clearDemoTimers();
    setDemoRunState("idle");
    setDemoTimelineIndex(-1);
    setDemoFileLabel(null);
  }, [clearDemoTimers]);

  const startDemo = useCallback((droppedName?: string | null) => {
    clearDemoTimers();
    setDemoRunState("running");
    setDemoFileLabel(droppedName?.trim() || "DemoCo_10Q_Q3-2025.pdf");
    setDemoTimelineIndex(0);

    const stepMs = [450, 950, 1450, 2000, 2550, 3100];
    stepMs.forEach((ms, idx) => {
      const id = setTimeout(() => setDemoTimelineIndex(idx + 1), ms);
      demoTimers.current.push(id);
    });

    const doneId = setTimeout(() => {
      setDemoTimelineIndex(EXTRACTION_STEPS.length);
      setDemoRunState("complete");
    }, 3600);
    demoTimers.current.push(doneId);
  }, [clearDemoTimers]);

  useEffect(() => () => clearDemoTimers(), [clearDemoTimers]);

  const scrollToDemoAndRun = useCallback(() => {
    document.getElementById("landing-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(startDemo, 450);
  }, [startDemo]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onDropDemo = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      const name = file?.type === "application/pdf" ? file.name : null;
      startDemo(name);
    },
    [startDemo]
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Rhythm block 1: Hero + demo */}
      <section>
        <MarketStrip />
        <LandingHero onTryDemo={scrollToDemoAndRun} />

        <div id="landing-demo" className="mt-10 scroll-mt-20">
          <DemoDropZone
            demoOnly
            dragOver={dragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDropDemo}
            onPickFile={() => startDemo()}
            demoTimelineIndex={demoTimelineIndex}
            demoRunState={demoRunState}
            demoFileLabel={demoFileLabel}
            onResetDemo={resetDemo}
          />
        </div>
      </section>

      {/* Rhythm block 2: Problem/solution + core features */}
      <section className="mt-6 border-t border-slate-200/70 pt-4 sm:mt-8 sm:pt-6">
        <ProblemSolutionSection />
        <FeatureGrid />
      </section>

      {/* Rhythm block 3: How-it-works + monetization + trust/disclaimer */}
      <section className="mt-2 border-t border-slate-200/70 pt-4 sm:mt-4 sm:pt-6">
        <HowItWorksSection />
        <PricingSection />
        <PaymentSection />

        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 text-xs text-slate-600 shadow-subtle">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <p className="font-semibold text-slate-800">Built for real filings</p>
              <p className="mt-1 leading-relaxed">
                The strip at the top is <span className="font-medium text-slate-800">demo-only</span>. SEC calls use a proper User-Agent on the server; PDFs
                parse in the browser on the Analyze page.
              </p>
            </div>
          </div>
        </div>
        <DisclaimerSection />
      </section>
    </div>
  );
}
