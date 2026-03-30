/**
 * Landscape Engine — builds industry overview tables that merge
 * auto-extracted financials with manual data (plant counts, volumes, etc).
 */

import type { QuarterMetrics } from "./analysisModules";
import type {
  SlideBlock,
  SlideTable,
  SlideTableRow,
  SlideColumn,
  SlideCell,
  HeadlineMetric,
  SlideBlockMetadata,
} from "@/types/slideBlocks";

// ---------------------------------------------------------------------------
// Types for manual landscape data
// ---------------------------------------------------------------------------

export interface LandscapeManualData {
  ticker: string;
  companyName?: string;
  plantCount?: number | null;
  sowInventory?: number | null;
  annualHogSlaughter?: number | null;
  employees?: number | null;
  headquartersLocation?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const formatted = abs >= 1000
    ? `$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${abs.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
  return v < 0 ? `(${formatted})` : formatted;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtInt(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

function cell(display: string, raw: number | null): SlideCell {
  return { display, raw };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildIndustryLandscapeBlock(
  allMetrics: Map<string, QuarterMetrics[]>,
  manualData: LandscapeManualData[],
  subjectTicker: string
): SlideBlock | null {
  if (allMetrics.size === 0) return null;

  // Get latest quarter per company
  const companies: { ticker: string; latest: QuarterMetrics; manual?: LandscapeManualData }[] = [];

  // Subject first
  const subjectM = allMetrics.get(subjectTicker);
  if (subjectM && subjectM.length > 0) {
    companies.push({
      ticker: subjectTicker,
      latest: subjectM[0],
      manual: manualData.find((m) => m.ticker === subjectTicker),
    });
  }

  // Then peers
  for (const [ticker, metrics] of allMetrics) {
    if (ticker === subjectTicker || metrics.length === 0) continue;
    companies.push({
      ticker,
      latest: metrics[0],
      manual: manualData.find((m) => m.ticker === ticker),
    });
  }

  if (companies.length === 0) return null;

  const blockId = `industry-landscape-${subjectTicker}`;

  // Columns: Metric | Company1 | Company2 | ...
  const columns: SlideColumn[] = [
    { header: "", align: "left" },
    ...companies.map((c) => ({
      header: c.manual?.companyName ?? c.latest.companyName ?? c.ticker,
      subHeader: c.ticker,
      align: "right" as const,
    })),
  ];

  const rows: SlideTableRow[] = [];

  // Financial metrics
  rows.push({ label: "Key Financials (Latest Quarter)", rowType: "header", cells: [] });
  rows.push({
    label: "Revenue ($MM)",
    rowType: "metric",
    cells: companies.map((c) => cell(fmtCurrency(c.latest.revenue), c.latest.revenue)),
  });
  rows.push({
    label: "Operating Income ($MM)",
    rowType: "metric",
    cells: companies.map((c) => cell(fmtCurrency(c.latest.operatingIncome), c.latest.operatingIncome)),
  });
  rows.push({
    label: "Operating Margin",
    rowType: "metric",
    cells: companies.map((c) => cell(fmtPct(c.latest.operatingMargin), c.latest.operatingMargin)),
  });
  rows.push({
    label: "Net Income ($MM)",
    rowType: "metric",
    cells: companies.map((c) => cell(fmtCurrency(c.latest.netIncome), c.latest.netIncome)),
  });

  // Manual data rows (only if any company has them)
  const hasManual = companies.some((c) => c.manual);
  if (hasManual) {
    rows.push({ label: "", rowType: "spacer", cells: [] });
    rows.push({ label: "Operations", rowType: "header", cells: [] });

    const hasPlants = companies.some((c) => c.manual?.plantCount != null);
    if (hasPlants) {
      rows.push({
        label: "Plants / Facilities",
        rowType: "metric",
        cells: companies.map((c) => cell(fmtInt(c.manual?.plantCount ?? null), c.manual?.plantCount ?? null)),
      });
    }

    const hasSows = companies.some((c) => c.manual?.sowInventory != null);
    if (hasSows) {
      rows.push({
        label: "Sow Inventory",
        rowType: "metric",
        cells: companies.map((c) => cell(fmtInt(c.manual?.sowInventory ?? null), c.manual?.sowInventory ?? null)),
      });
    }

    const hasSlaughter = companies.some((c) => c.manual?.annualHogSlaughter != null);
    if (hasSlaughter) {
      rows.push({
        label: "Annual Hog Slaughter",
        rowType: "metric",
        cells: companies.map((c) => cell(fmtInt(c.manual?.annualHogSlaughter ?? null), c.manual?.annualHogSlaughter ?? null)),
      });
    }

    const hasEmployees = companies.some((c) => c.manual?.employees != null);
    if (hasEmployees) {
      rows.push({
        label: "Employees",
        rowType: "metric",
        cells: companies.map((c) => cell(fmtInt(c.manual?.employees ?? null), c.manual?.employees ?? null)),
      });
    }

    const hasHQ = companies.some((c) => c.manual?.headquartersLocation);
    if (hasHQ) {
      rows.push({
        label: "Headquarters",
        rowType: "metric",
        cells: companies.map((c) => cell(c.manual?.headquartersLocation ?? "—", null)),
      });
    }
  }

  const missing: string[] = [];
  for (const c of companies) {
    if (!c.manual) missing.push(`${c.ticker}: no manual landscape data`);
  }

  return {
    blockId,
    blockType: "industry-landscape",
    title: "Industry Landscape Overview",
    subtitle: `${companies.length} companies · Latest quarter data`,
    headlines: companies.slice(0, 3).map((c) => ({
      label: c.ticker,
      value: fmtCurrency(c.latest.revenue),
      comparison: "Revenue",
    })),
    table: { columns, rows },
    chartSeries: [],
    footnotes: ["Financial data from SEC filings. Operational data from manual entry."],
    assumptions: [],
    metadata: {
      sourceModule: "industry-landscape",
      subjectTicker,
      peerTickers: companies.filter((c) => c.ticker !== subjectTicker).map((c) => c.ticker),
      quarterRange: {
        from: companies[companies.length - 1]?.latest.quarterLabel ?? "—",
        to: companies[0]?.latest.quarterLabel ?? "—",
      },
      generatedAt: new Date().toISOString(),
      completeness: missing.length === 0 ? "full" : "partial",
      missingData: missing,
    },
  };
}
