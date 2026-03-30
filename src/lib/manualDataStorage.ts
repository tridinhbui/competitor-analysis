/**
 * Supabase-backed storage for manual data entries.
 *
 * CRUD operations for the manual_data table.
 */

import { supabase } from "./supabase";
import type { ManualDataRecord, ManualDataType } from "@/types/manualData";

// ---------------------------------------------------------------------------
// List — all manual data for a company, optionally filtered by type
// ---------------------------------------------------------------------------

export async function listManualData(
  ticker: string,
  dataType?: ManualDataType,
  periodEnd?: string
): Promise<ManualDataRecord[]> {
  let query = supabase
    .from("manual_data")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .order("updated_at", { ascending: false });

  if (dataType) query = query.eq("data_type", dataType);
  if (periodEnd) query = query.eq("period_end", periodEnd);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map(mapRow);
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

export async function getManualData(id: string): Promise<ManualDataRecord | null> {
  const { data, error } = await supabase
    .from("manual_data")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapRow(data) : null;
}

// ---------------------------------------------------------------------------
// Upsert — create or update based on (ticker, period_end, data_type) unique key
// ---------------------------------------------------------------------------

export async function upsertManualData(
  record: ManualDataRecord
): Promise<ManualDataRecord> {
  const row = {
    ticker: record.ticker.toUpperCase(),
    period_end: record.periodEnd,
    data_type: record.dataType,
    data: record.data,
    source_note: record.sourceNote,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("manual_data")
    .upsert(row, { onConflict: "ticker,period_end,data_type" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteManualData(id: string): Promise<void> {
  const { error } = await supabase
    .from("manual_data")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ManualDataRecord {
  return {
    id: row.id,
    ticker: row.ticker,
    periodEnd: row.period_end,
    dataType: row.data_type as ManualDataType,
    data: row.data,
    sourceNote: row.source_note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
