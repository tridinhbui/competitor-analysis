import { debugLog } from "@/lib/debugLogger";

const OPENAI_CHAT_COMPLETIONS = "https://api.openai.com/v1/chat/completions";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ChatCompletionParams = {
  /** Short label for logs (no PII). */
  step: string;
  apiKey: string;
  model: string;
  systemPrompt?: string | null;
  userContent: string;
  temperature?: number;
  maxTokens: number;
  /** Default 60_000 to match prior analyze-pdf behavior. */
  timeoutMs?: number;
  /** Total attempts including first; default 3. */
  maxRetries?: number;
};

export type ChatCompletionResult = {
  content: string | null;
  error: string | null;
  status: number | null;
};

/** Safe JSON.parse for model output; never throws. */
export function safeJsonParse<T>(content: string | null | undefined, fallback: T): T {
  if (!content) return fallback;
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * OpenAI Chat Completions with json_object format, timeout, and limited retry on 429/5xx.
 * Logs only safe metadata via debugLog (no-op in production).
 */
export async function callChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const timeoutMs = params.timeoutMs ?? 60_000;
  const maxRetries = params.maxRetries ?? 3;
  const temperature = params.temperature ?? 0.1;
  const sys = params.systemPrompt?.trim() ? params.systemPrompt.trim() : null;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: params.userContent });

  let lastError: ChatCompletionResult = {
    content: null,
    error: "OpenAI request failed",
    status: null,
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(OPENAI_CHAT_COMPLETIONS, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          messages,
          temperature,
          max_tokens: params.maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const durationMs = Date.now() - started;

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const compactErr = errBody.replace(/\s+/g, " ").trim().slice(0, 220);
        lastError = {
          content: null,
          error: `OpenAI ${res.status}${compactErr ? `: ${compactErr}` : ""}`,
          status: res.status,
        };
        debugLog("[openai]", params.step, {
          ok: false,
          status: res.status,
          durationMs,
          userLen: params.userContent.length,
          systemLen: sys?.length ?? 0,
          attempt: attempt + 1,
        });
        if (shouldRetry(res.status) && attempt < maxRetries - 1) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        return lastError;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim() ?? null;
      if (!content) {
        lastError = {
          content: null,
          error: "OpenAI returned empty content",
          status: res.status,
        };
        debugLog("[openai]", params.step, {
          ok: false,
          empty: true,
          durationMs,
          userLen: params.userContent.length,
          attempt: attempt + 1,
        });
        return lastError;
      }

      debugLog("[openai]", params.step, {
        ok: true,
        status: res.status,
        durationMs,
        userLen: params.userContent.length,
        systemLen: sys?.length ?? 0,
        contentLen: content.length,
        attempt: attempt + 1,
      });
      return { content, error: null, status: res.status };
    } catch (err) {
      lastError = {
        content: null,
        error: err instanceof Error ? err.message : "OpenAI request failed",
        status: null,
      };
      debugLog("[openai]", params.step, {
        ok: false,
        thrown: true,
        durationMs: Date.now() - started,
        attempt: attempt + 1,
      });
      if (attempt < maxRetries - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
  }

  return lastError;
}
