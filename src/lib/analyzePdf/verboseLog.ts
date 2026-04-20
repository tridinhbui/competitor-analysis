import { debugLog } from "@/lib/debugLogger";

/**
 * Verbose pipeline logs (large objects, raw snippets). Off in production.
 * In development, set ANALYZE_PDF_DEBUG=1 to enable (reduces default dev noise).
 */
export function analyzePdfVerboseLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.ANALYZE_PDF_DEBUG !== "1") return;
  debugLog(...args);
}
