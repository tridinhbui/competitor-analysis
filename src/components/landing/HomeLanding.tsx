"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { MarketStrip } from "./MarketStrip";
import { LandingHero } from "./LandingHero";
import { DemoDropZone, type DemoRunState } from "./DemoDropZone";
import { FeatureGrid } from "./FeatureGrid";
import { ProblemSolutionSection } from "./ProblemSolutionSection";
import { ProjectIntroCards } from "./ProjectIntroCards";
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

  useEffect(() => {
    const sessionKey = "landing-initial-entry-seen";
    const isInitialEntry = sessionStorage.getItem(sessionKey) !== "1";
    if (!isInitialEntry) return;

    sessionStorage.setItem(sessionKey, "1");
    if (window.location.hash !== "#pricing") return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
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

      <section className="mt-6 border-t border-border/80 pt-6 sm:mt-8 sm:pt-8">
        <ProblemSolutionSection />
        <ProjectIntroCards />
        <FeatureGrid />
      </section>

      <section className="mt-2 border-t border-border/80 pt-6 sm:mt-4 sm:pt-8">
        <HowItWorksSection />
        <PricingSection />
        <PaymentSection />

        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-white/90 p-4 text-xs text-muted-foreground shadow-subtle">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">Built for executive finance teams</p>
              <p className="mt-1 leading-relaxed">
                Designed for CEO, CFO, investor relations, and strategic finance teams that need one shared source of
                truth before earnings calls, analyst meetings, board reviews, and planning cycles.
              </p>
            </div>
          </div>
        </div>
        <DisclaimerSection />
      </section>
    </div>
  );
}
