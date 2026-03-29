/**
 * Minimal SSE frame parsing for fetch() streams (not EventSource).
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */

import type { FullAnalysis, StepEvent } from "@/types/analysis";

export function parseSseBlock(block: string): { event?: string; data: string } {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return { event, data: dataLines.join("\n") };
}

export function isFullAnalysisPayload(value: unknown): value is FullAnalysis {
  return (
    typeof value === "object" &&
    value !== null &&
    "balanceSheet" in value &&
    "meta" in value
  );
}

export function isStepEventPayload(value: unknown): value is StepEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "step" in value &&
    "status" in value &&
    typeof (value as { step: unknown }).step === "string"
  );
}
