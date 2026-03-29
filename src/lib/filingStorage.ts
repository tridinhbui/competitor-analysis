/**
 * Filesystem-based storage for quarterly filings and company registry.
 *
 * Layout:
 *   filings/
 *     companies.json          — CompanyRegistry
 *     {TICKER}/
 *       {periodEnd}.json      — Filing
 *
 * All functions are server-only (Node.js fs).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { FullAnalysis } from "@/types/analysis";
import type {
  Company,
  CompanyRegistry,
  Filing,
  PeerType,
} from "@/types/competitor";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FILINGS_ROOT = path.join(process.cwd(), "filings");
const REGISTRY_PATH = path.join(FILINGS_ROOT, "companies.json");

function tickerDir(ticker: string): string {
  return path.join(FILINGS_ROOT, ticker.toUpperCase());
}

function filingPath(ticker: string, periodEnd: string): string {
  return path.join(tickerDir(ticker), `${periodEnd}.json`);
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export async function loadRegistry(): Promise<CompanyRegistry> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, "utf8");
    return JSON.parse(raw) as CompanyRegistry;
  } catch {
    return { version: "1.0", companies: [], updatedAt: new Date().toISOString() };
  }
}

export async function saveRegistry(registry: CompanyRegistry): Promise<void> {
  await ensureDir(FILINGS_ROOT);
  registry.updatedAt = new Date().toISOString();
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf8");
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
  const registry = await loadRegistry();
  const upper = ticker.toUpperCase();
  let company = registry.companies.find((c) => c.ticker === upper);
  const now = new Date().toISOString();

  if (company) {
    // Update name if we have a better one
    if (name && name !== upper) company.name = name;
    if (peerType) company.peerType = peerType;
    company.updatedAt = now;
  } else {
    company = {
      ticker: upper,
      name: name || upper,
      peerType: peerType ?? "diversified-protein",
      createdAt: now,
      updatedAt: now,
    };
    registry.companies.push(company);
  }

  await saveRegistry(registry);
  return company;
}

/**
 * Update the peer type for an existing company.
 */
export async function setCompanyPeerType(
  ticker: string,
  peerType: PeerType
): Promise<Company | null> {
  const registry = await loadRegistry();
  const company = registry.companies.find(
    (c) => c.ticker === ticker.toUpperCase()
  );
  if (!company) return null;
  company.peerType = peerType;
  company.updatedAt = new Date().toISOString();
  await saveRegistry(registry);
  return company;
}

// ---------------------------------------------------------------------------
// Filings
// ---------------------------------------------------------------------------

/**
 * Save a filing to disk and ensure the company is in the registry.
 */
export async function saveFiling(
  ticker: string,
  periodEnd: string,
  source: "sec" | "pdf",
  analysis: FullAnalysis
): Promise<Filing> {
  const upper = ticker.toUpperCase();
  const filing: Filing = {
    ticker: upper,
    periodEnd,
    source,
    savedAt: new Date().toISOString(),
    analysis,
  };

  await ensureDir(tickerDir(upper));
  await fs.writeFile(
    filingPath(upper, periodEnd),
    JSON.stringify(filing, null, 2),
    "utf8"
  );

  // Ensure company is registered
  await upsertCompany(upper, analysis.meta.companyName ?? upper);

  return filing;
}

/**
 * Load a single filing by ticker + periodEnd.
 */
export async function loadFiling(
  ticker: string,
  periodEnd: string
): Promise<Filing | null> {
  try {
    const raw = await fs.readFile(
      filingPath(ticker.toUpperCase(), periodEnd),
      "utf8"
    );
    return JSON.parse(raw) as Filing;
  } catch {
    return null;
  }
}

/**
 * List all period-end dates on file for a company, sorted descending.
 */
export async function listQuarters(ticker: string): Promise<string[]> {
  try {
    const dir = tickerDir(ticker.toUpperCase());
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.replace(".json", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Load all filings for a company, sorted by periodEnd descending.
 */
export async function loadAllFilings(ticker: string): Promise<Filing[]> {
  const periods = await listQuarters(ticker);
  const filings: Filing[] = [];
  for (const p of periods) {
    const f = await loadFiling(ticker, p);
    if (f) filings.push(f);
  }
  return filings;
}
