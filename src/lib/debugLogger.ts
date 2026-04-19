// ---------------------------------------------------------------------------
// Conditional Debug Logger
// Suppresses verbose extraction debug logs in production to keep logs clean.
// Only emits output when NODE_ENV !== "production".
// ---------------------------------------------------------------------------

const isDebug = process.env.NODE_ENV !== "production";

/**
 * Log a debug message. Suppressed in production (NODE_ENV === "production").
 * Drop-in replacement for console.log in extraction heuristics and AI pipelines.
 */
export function debugLog(...args: unknown[]): void {
  if (isDebug) {
    console.log(...args);
  }
}

/**
 * Log a warning. Always emitted regardless of environment.
 */
export function warnLog(...args: unknown[]): void {
  console.warn(...args);
}
