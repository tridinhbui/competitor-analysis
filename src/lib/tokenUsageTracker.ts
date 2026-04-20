"use client";

export const TOKEN_USAGE_STORAGE_KEY = "app-token-usage-v1";
export const TOKEN_USAGE_EVENT = "app-token-usage-updated";

export interface TokenUsageDelta {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface TokenUsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  updatedAt: string;
}

function cleanNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function readTokenUsage(): TokenUsageSnapshot {
  if (typeof window === "undefined") {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      updatedAt: "",
    };
  }

  try {
    const raw = window.localStorage.getItem(TOKEN_USAGE_STORAGE_KEY);
    if (!raw) {
      return {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requests: 0,
        updatedAt: "",
      };
    }
    const parsed = JSON.parse(raw) as Partial<TokenUsageSnapshot>;
    return {
      promptTokens: cleanNumber(parsed.promptTokens),
      completionTokens: cleanNumber(parsed.completionTokens),
      totalTokens: cleanNumber(parsed.totalTokens),
      requests: cleanNumber(parsed.requests),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      updatedAt: "",
    };
  }
}

function writeTokenUsage(snapshot: TokenUsageSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_USAGE_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(TOKEN_USAGE_EVENT, { detail: snapshot }));
}

export function trackTokenUsage(delta?: TokenUsageDelta | null): TokenUsageSnapshot {
  const current = readTokenUsage();
  if (!delta) return current;

  const prompt = cleanNumber(delta.promptTokens);
  const completion = cleanNumber(delta.completionTokens);
  const providedTotal = cleanNumber(delta.totalTokens);
  const total = providedTotal || prompt + completion;

  if (total === 0 && prompt === 0 && completion === 0) return current;

  const next: TokenUsageSnapshot = {
    promptTokens: current.promptTokens + prompt,
    completionTokens: current.completionTokens + completion,
    totalTokens: current.totalTokens + total,
    requests: current.requests + 1,
    updatedAt: new Date().toISOString(),
  };
  writeTokenUsage(next);
  return next;
}

export function resetTokenUsage() {
  const empty: TokenUsageSnapshot = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
    updatedAt: "",
  };
  writeTokenUsage(empty);
}
