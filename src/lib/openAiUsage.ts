export interface OpenAiCallUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Sums usage across every OpenAI call a single request made — useful for endpoints
 * that fan out to several parallel calls, where per-call usage alone understates cost. */
export function sumUsage(usages: Array<OpenAiCallUsage | null | undefined>): OpenAiCallUsage {
  return usages.reduce<OpenAiCallUsage>(
    (acc, u) => ({
      promptTokens: acc.promptTokens + (u?.promptTokens ?? 0),
      completionTokens: acc.completionTokens + (u?.completionTokens ?? 0),
      totalTokens: acc.totalTokens + (u?.totalTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}
