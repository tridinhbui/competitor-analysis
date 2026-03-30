/**
 * POST /api/migrate
 *
 * One-time migration: reads filings from the old filesystem storage
 * and writes them to Supabase.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { supabase } from "@/lib/supabase";
import { deriveQuarter } from "@/lib/competitorService";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

const FILINGS_ROOT = path.join(process.cwd(), "filings");

interface OldCompany {
  ticker: string;
  name: string;
  peerType: string;
  createdAt: string;
  updatedAt: string;
  industry?: string;
}

interface OldRegistry {
  companies: OldCompany[];
}

interface OldFiling {
  ticker: string;
  periodEnd: string;
  source: "sec" | "pdf";
  savedAt: string;
  analysis: FullAnalysis;
  filingType?: string;
  filingDate?: string;
}

export async function POST() {
  try {
    // Read old registry
    const registryPath = path.join(FILINGS_ROOT, "companies.json");
    const registryRaw = await fs.readFile(registryPath, "utf8");
    const registry: OldRegistry = JSON.parse(registryRaw);

    const results: Array<{ ticker: string; quarters: number; status: string }> = [];

    for (const company of registry.companies) {
      // Upsert company into Supabase
      const { error: companyError } = await supabase.from("companies").upsert(
        {
          ticker: company.ticker,
          name: company.name,
          industry: company.industry ?? null,
          peer_type: company.peerType ?? "diversified-protein",
          created_at: company.createdAt,
          updated_at: company.updatedAt,
        },
        { onConflict: "ticker" }
      );

      if (companyError) {
        results.push({ ticker: company.ticker, quarters: 0, status: `Company error: ${companyError.message}` });
        continue;
      }

      // Read all filings for this company
      const tickerDir = path.join(FILINGS_ROOT, company.ticker);
      let entries: string[];
      try {
        entries = await fs.readdir(tickerDir);
      } catch {
        results.push({ ticker: company.ticker, quarters: 0, status: "No filings directory" });
        continue;
      }

      let migrated = 0;
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const periodEnd = entry.replace(".json", "");

        try {
          const raw = await fs.readFile(path.join(tickerDir, entry), "utf8");
          const filing: OldFiling = JSON.parse(raw);
          const quarter = deriveQuarter(periodEnd);

          const { error: filingError } = await supabase.from("filings").upsert(
            {
              ticker: company.ticker,
              period_end: periodEnd,
              fiscal_year: quarter.fiscalYear,
              fiscal_quarter: quarter.fiscalQuarter,
              quarter_label: quarter.label,
              source: filing.source ?? "pdf",
              filing_type: filing.filingType ?? "10-Q",
              filing_date: filing.filingDate ?? filing.savedAt?.split("T")[0] ?? null,
              analysis: filing.analysis,
              saved_at: filing.savedAt ?? new Date().toISOString(),
            },
            { onConflict: "ticker,period_end" }
          );

          if (filingError) {
            console.error(`Migration error for ${company.ticker}/${periodEnd}:`, filingError.message);
          } else {
            migrated++;
          }
        } catch (e) {
          console.error(`Failed to read ${entry}:`, e);
        }
      }

      results.push({ ticker: company.ticker, quarters: migrated, status: "ok" });
    }

    return Response.json({ migrated: results });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Migration failed" },
      { status: 500 }
    );
  }
}
