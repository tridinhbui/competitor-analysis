import { extractPdfFinancialValue, type PdfFinancialMetric } from "@/lib/pdfFinancialValueExtractor";
import type { BSItem } from "@/types/analysis";
import { analyzePdfVerboseLog } from "./verboseLog";

export function repairCriticalFinancialValue(
  items: BSItem[],
  metric: PdfFinancialMetric,
  text: string,
  scaleNote: string | undefined,
  period: string
): void {
  const repaired = extractPdfFinancialValue(text, metric, scaleNote);
  if (!repaired || Math.abs(repaired.value) <= 1) return;

  const existing = items.find((item) => item.tag === repaired.tag);
  const existingValue = existing?.value ?? null;
  if (existingValue != null && Math.abs(existingValue) > 1) return;

  if (existing) {
    analyzePdfVerboseLog("[analyze-pdf:repair]", {
      metric,
      previous: existing.value,
      repaired: repaired.value,
      confidence: repaired.confidence,
      raw: repaired.raw,
    });
    existing.value = repaired.value;
    existing.label = repaired.label;
    existing.source = repaired.source;
  } else {
    analyzePdfVerboseLog("[analyze-pdf:repair]", {
      metric,
      previous: null,
      repaired: repaired.value,
      confidence: repaired.confidence,
      raw: repaired.raw,
    });
    items.push({
      tag: repaired.tag,
      label: repaired.label,
      value: repaired.value,
      period,
      source: repaired.source,
    });
  }
}
