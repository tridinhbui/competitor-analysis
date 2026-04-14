import { supabase } from "./supabase";
import type { Filing } from "@/types/competitor";
import { emptyAdjustments } from "@/types/adjustments";

interface AdjustmentData {
  workspaceResetAt?: string;
  [key: string]: unknown;
}

function normalizeAdjustmentData(ticker: string, value: unknown): AdjustmentData {
  const base = emptyAdjustments(ticker);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...base };
  }
  return {
    ...base,
    ...(value as Record<string, unknown>),
  };
}

function parseIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function getWorkspaceResetAt(ticker: string): Promise<string | null> {
  const upper = ticker.toUpperCase();
  const { data, error } = await supabase
    .from("adjustments")
    .select("data")
    .eq("ticker", upper)
    .maybeSingle();

  if (error || !data?.data) return null;
  const payload = normalizeAdjustmentData(upper, data.data);
  return parseIsoOrNull(payload.workspaceResetAt);
}

export async function setWorkspaceResetAt(ticker: string, resetAtIso?: string): Promise<string> {
  const upper = ticker.toUpperCase();
  const resetAt = parseIsoOrNull(resetAtIso) ?? new Date().toISOString();

  const { data: existing } = await supabase
    .from("adjustments")
    .select("data")
    .eq("ticker", upper)
    .maybeSingle();

  const payload = normalizeAdjustmentData(upper, existing?.data);
  payload.ticker = upper;
  payload.updatedAt = new Date().toISOString();
  payload.workspaceResetAt = resetAt;

  const { error } = await supabase
    .from("adjustments")
    .upsert(
      {
        ticker: upper,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ticker" }
    );

  if (error) {
    throw new Error(`[workspace-reset] failed to save reset marker: ${error.message}`);
  }

  return resetAt;
}

export function filterFilingsForWorkspace(
  filings: Filing[],
  resetAtIso: string | null
): Filing[] {
  if (!resetAtIso) return filings;
  const resetMs = new Date(resetAtIso).getTime();
  if (Number.isNaN(resetMs)) return filings;

  return filings.filter((filing) => {
    if (!filing.savedAt) return true;
    const savedMs = new Date(filing.savedAt).getTime();
    if (Number.isNaN(savedMs)) return true;
    return savedMs >= resetMs;
  });
}
