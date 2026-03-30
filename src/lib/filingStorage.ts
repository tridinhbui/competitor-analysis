/**
 * Supabase-backed storage for quarterly filings and company registry.
 *
 * Tables:
 *   companies — Company records (ticker PK)
 *   filings   — Filing records with analysis JSONB
 *
 * API surface is identical to the original filesystem version.
 */

import { supabase } from "./supabase";
import { deriveQuarter } from "./competitorService";
import type { FullAnalysis } from "@/types/analysis";
import type {
  Company,
  CompanyRegistry,
  Filing,
  PeerType,
} from "@/types/competitor";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export async function loadRegistry(): Promise<CompanyRegistry> {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("ticker");

  if (error) {
    console.warn("[filingStorage] loadRegistry error:", error.message);
    return { version: "1.0", companies: [], updatedAt: new Date().toISOString() };
  }

  const companies: Company[] = (data ?? []).map((row) => ({
    ticker: row.ticker,
    name: row.name,
    industry: row.industry ?? undefined,
    peerType: row.peer_type as PeerType,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return {
    version: "1.0",
    companies,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveRegistry(_registry: CompanyRegistry): Promise<void> {
  // No-op: companies are managed individually via upsertCompany.
}

/**
 * Ensure a company exists in the registry. Creates if missing, updates name
 * if already present. Returns the company record.
 */
export async function upsertCompany(
  ticker: string,
  name: string,
  peerType?: PeerType
): Promise<Company> {
  const upper = ticker.toUpperCase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("companies")
    .select("*")
    .eq("ticker", upper)
    .single();

  if (existing) {
    const updates: Record<string, unknown> = { updated_at: now };
    if (name && name !== upper) updates.name = name;
    if (peerType) updates.peer_type = peerType;

    await supabase.from("companies").update(updates).eq("ticker", upper);

    return {
      ticker: upper,
      name: name && name !== upper ? name : existing.name,
      industry: existing.industry ?? undefined,
      peerType: peerType ?? existing.peer_type,
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }

  const newCompany = {
    ticker: upper,
    name: name || upper,
    peer_type: peerType ?? "diversified-protein",
    created_at: now,
    updated_at: now,
  };

  await supabase.from("companies").insert(newCompany);

  return {
    ticker: upper,
    name: newCompany.name,
    peerType: newCompany.peer_type as PeerType,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update the peer type for an existing company.
 */
export async function setCompanyPeerType(
  ticker: string,
  peerType: PeerType
): Promise<Company | null> {
  const upper = ticker.toUpperCase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("companies")
    .select("*")
    .eq("ticker", upper)
    .single();

  if (!existing) return null;

  await supabase
    .from("companies")
    .update({ peer_type: peerType, updated_at: now })
    .eq("ticker", upper);

  return {
    ticker: upper,
    name: existing.name,
    industry: existing.industry ?? undefined,
    peerType,
    createdAt: existing.created_at,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Filings
// ---------------------------------------------------------------------------

/**
 * Save a filing to Supabase and ensure the company is in the registry.
 */
export async function saveFiling(
  ticker: string,
  periodEnd: string,
  source: "sec" | "pdf",
  analysis: FullAnalysis
): Promise<Filing> {
  const upper = ticker.toUpperCase();
  const quarter = deriveQuarter(periodEnd);
  const now = new Date().toISOString();

  // Ensure company exists
  await upsertCompany(upper, analysis.meta.companyName ?? upper);

  // Upsert filing
  const row = {
    ticker: upper,
    period_end: periodEnd,
    fiscal_year: quarter.fiscalYear,
    fiscal_quarter: quarter.fiscalQuarter,
    quarter_label: quarter.label,
    source,
    filing_type: "10-Q",
    filing_date: analysis.meta.filingDate ?? now.split("T")[0],
    analysis: analysis as unknown,
    saved_at: now,
  };

  await supabase.from("filings").upsert(row, { onConflict: "ticker,period_end" });

  return {
    ticker: upper,
    periodEnd,
    source,
    savedAt: now,
    analysis,
    filingType: "10-Q",
    filingDate: analysis.meta.filingDate,
    quarter,
  };
}

/**
 * Load a single filing by ticker + periodEnd.
 */
export async function loadFiling(
  ticker: string,
  periodEnd: string
): Promise<Filing | null> {
  const { data, error } = await supabase
    .from("filings")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .eq("period_end", periodEnd)
    .single();

  if (error || !data) return null;

  return rowToFiling(data);
}

/**
 * List all period-end dates on file for a company, sorted descending.
 */
export async function listQuarters(ticker: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("filings")
    .select("period_end")
    .eq("ticker", ticker.toUpperCase())
    .order("period_end", { ascending: false });

  if (error || !data) return [];

  return data.map((r) => r.period_end);
}

/**
 * Load all filings for a company, sorted by periodEnd descending.
 */
export async function loadAllFilings(ticker: string): Promise<Filing[]> {
  const { data, error } = await supabase
    .from("filings")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("period_end", { ascending: false });

  if (error || !data) return [];

  return data.map(rowToFiling);
}

// ---------------------------------------------------------------------------
// Row → Filing mapping
// ---------------------------------------------------------------------------

function rowToFiling(row: Record<string, unknown>): Filing {
  return {
    ticker: row.ticker as string,
    periodEnd: row.period_end as string,
    source: row.source as "sec" | "pdf",
    savedAt: row.saved_at as string,
    analysis: row.analysis as FullAnalysis,
    filingType: (row.filing_type as "10-Q" | "10-K") ?? "10-Q",
    filingDate: row.filing_date as string | undefined,
    quarter: {
      periodEnd: row.period_end as string,
      fiscalYear: row.fiscal_year as number,
      fiscalQuarter: row.fiscal_quarter as number,
      label: row.quarter_label as string,
    },
  };
}
