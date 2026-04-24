"use client";

import { useCallback, useEffect, useState } from "react";

export const AI_EXTRACTION_STORAGE_KEY = "analyze-ai-enabled";
export const AI_EXTRACTION_EVENT = "analyze-ai-enabled-changed";

export function readAiExtractionEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(AI_EXTRACTION_STORAGE_KEY);
  return stored === null ? true : stored !== "false";
}

export function writeAiExtractionEnabled(next: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_EXTRACTION_STORAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent(AI_EXTRACTION_EVENT, { detail: next }));
}

export function useAiExtractionEnabled(): [boolean, () => void] {
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => readAiExtractionEnabled());

  useEffect(() => {
    const sync = () => setAiEnabled(readAiExtractionEnabled());
    window.addEventListener(AI_EXTRACTION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AI_EXTRACTION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleAi = useCallback(() => {
    const next = !readAiExtractionEnabled();
    writeAiExtractionEnabled(next);
  }, []);

  return [aiEnabled, toggleAi];
}
