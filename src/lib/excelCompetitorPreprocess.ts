import * as XLSX from "xlsx";
import type { FullAnalysis, BSItem, DataConfidence } from "@/types/analysis";
import type { Filing } from "@/types/competitor";
import { deriveQuarter } from "@/lib/competitorService";
import { normalizeCompanyName, resolveTicker } from "@/lib/filingIdentity";
import type { SegmentData, VolumeUnitType } from "@/types/segments";

interface WorkbookCompanyAlias {
  patterns: string[];
  ticker: string;
  companyName: string;
}

const WORKBOOK_COMPANY_ALIASES: WorkbookCompanyAlias[] = [
  { patterns: ["smithfield foods", "smithfield", "smf", "sfd"], ticker: "SFD", companyName: "Smithfield" },
  { patterns: ["tyson foods", "tyson", "tysons", "tsn"], ticker: "TSN", companyName: "Tyson Foods" },
  { patterns: ["hormel foods", "hormel", "hrl"], ticker: "HRL", companyName: "Hormel Foods" },
  { patterns: ["pilgrim's pride", "pilgrims pride", "pilgrims", "ppc"], ticker: "PPC", companyName: "Pilgrim's Pride" },
  { patterns: ["seaboard", "seaboard foods", "seb"], ticker: "SEB", companyName: "Seaboard" },
  { patterns: ["jbs"], ticker: "JBS", companyName: "JBS" },
  { patterns: ["maple leaf", "ml"], ticker: "ML", companyName: "Maple Leaf Foods" },
];

const QUARTER_ENDS: Record<1 | 2 | 3 | 4, string> = {
  1: "-03-31",
  2: "-06-30",
  3: "-09-30",
  4: "-12-31",
};

const SMITHFIELD_TYSON_FAMILY_SHEETS = [
  "tsn input",
  "usfp_query",
  "uspm_query",
  "ushp_query",
  "us pork_query",
  "tsn pl",
  "sfd historical_v2",
  "tyson",
  "jbs & seaboard",
  "us segments",
] as const;

const SHEET_PRIORITY: Record<string, number> = {
  "tsn input": 160,
  "us pork_query": 155,
  "usfp_query": 150,
  "uspm_query": 150,
  "ushp_query": 150,
  "tsn pl": 130,
  "seg prof usfp": 60,
  "seg prof uspm": 60,
  "seg prof ushp": 60,
  "overview no adj": 45,
  "sfd historical": 30,
  "sfd historical_v2": 30,
  "tsn historical": 20,
  "tyson": 15,
  "jbs & seaboard": 15,
  "us segments": 15,
};

type WorkbookFamily = "generic_flat_table" | "smithfield_tyson_competitor_model";
type ExtractionBasis = "reported" | "adjusted" | "derived";
type CompanyMetricField = "revenue" | "grossProfit" | "sgaExpense" | "operatingIncome" | "operatingMargin";

interface ParsedQuarterLabel {
  fiscalQuarter: 1 | 2 | 3 | 4;
  fiscalYear: number;
  label: string;
  periodEnd: string;
}

interface ParsedQuarterColumn extends ParsedQuarterLabel {
  colIndex: number;
}

interface DetectedComparisonHeader {
  companyCol: number;
  sourcePeriodCol: number | null;
  alignedPeriodCol: number;
  revenueCol: number;
  operatingIncomeCol: number;
  volumeCol: number | null;
}

interface SheetLookupEntry {
  rawName: string;
  sheet: XLSX.WorkSheet;
  normalizedName: string;
}

interface CapturedMetricSeries {
  field: CompanyMetricField | "volumeUnits";
  rowNumber: number;
  basis?: ExtractionBasis;
  volumeUnitType?: VolumeUnitType | null;
  values: Map<number, number | null>;
}

interface MatrixMetricSpec {
  field: CompanyMetricField | "volumeUnits";
  aliases: string[];
  divideBy?: number;
  basis?: ExtractionBasis;
  volumeUnitType?: VolumeUnitType | null;
}

interface MatrixSegmentExtractorConfig {
  sheetName: string;
  ticker: string;
  companyName: string;
  segmentName: string;
  rawSegmentName?: string;
  metricSpecs: MatrixMetricSpec[];
  priority: number;
}

interface TsnInputSectionConfig {
  segmentName: string;
  rawSegmentName: string;
  operatingIncomePreference: Array<{
    alias: string;
    basis: ExtractionBasis;
    useWhen: (quarter: ParsedQuarterColumn) => boolean;
  }>;
  volumeMetric?: {
    alias: string;
    unit: VolumeUnitType;
  };
}

interface DetectedSegmentMeta {
  segmentName: string;
  rawSegmentName: string;
}

interface SectionMetricDescriptor {
  field: CompanyMetricField | "volumeUnits";
  basis: ExtractionBasis;
  volumeUnitType: VolumeUnitType | null;
}

interface SectionMetricCapture {
  segment: DetectedSegmentMeta;
  metric: SectionMetricDescriptor;
  quarters: ParsedQuarterColumn[];
}

export interface ExcelCompetitorQuarterRow {
  ticker: string;
  companyName: string;
  quarterLabel: string;
  periodEnd: string;
  originalPeriodLabel: string;
  alignedPeriodLabel: string;
  revenue: number | null;
  grossProfit: number | null;
  sgaExpense: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  volume: number | null;
  volumeUnitType: VolumeUnitType | null;
  basis: ExtractionBasis;
  sourceSheet: string;
  sourceTableLabel: string;
  sourceRowNumber: number;
  sourceSheetPriority: number;
}

export interface ExcelCompetitorSegmentRow {
  ticker: string;
  companyName: string;
  segmentName: string;
  rawSegmentName: string;
  quarterLabel: string;
  periodEnd: string;
  originalPeriodLabel: string;
  alignedPeriodLabel: string;
  revenue: number | null;
  grossProfit: number | null;
  sgaExpense: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  volumeUnits: number | null;
  volumeUnitType: VolumeUnitType | null;
  revenuePerUnit: number | null;
  operatingIncomePerUnit: number | null;
  basis: ExtractionBasis;
  sourceSheet: string;
  sourceTableLabel: string;
  sourceRowNumber: number;
  sourceSheetPriority: number;
}

export interface ExcelCompetitorSheetMatch {
  sheetName: string;
  tableLabel: string;
  rowCount: number;
  priority: number;
}

export interface ExcelCompetitorCompanySummary {
  ticker: string;
  companyName: string;
  quarterCount: number;
  latestQuarter: string;
  latestPeriodEnd: string;
}

export interface ExcelCompetitorPreprocessResult {
  workbookFamily: WorkbookFamily;
  sourceFileName: string;
  primarySheet: string | null;
  comparisonTickers: string[];
  quarterlyRows: ExcelCompetitorQuarterRow[];
  segmentRows: ExcelCompetitorSegmentRow[];
  sheetMatches: ExcelCompetitorSheetMatch[];
  companies: ExcelCompetitorCompanySummary[];
  warnings: string[];
  processedWorkbookBytes: Uint8Array;
  virtualFilings: Filing[];
}

interface GrowthAnalysisMetrics {
  qoqRevenueGrowth: number | null;
  yoyRevenueGrowth: number | null;
  qoqOperatingIncomeGrowth: number | null;
  yoyOperatingIncomeGrowth: number | null;
  qoqMarginChange: number | null;
  yoyMarginChange: number | null;
  qoqBasePeriodEnd: string | null;
  yoyBasePeriodEnd: string | null;
}

interface DataQualityIssue {
  severity: "info" | "warning" | "error";
  scope: "Workbook" | "Company" | "Segment" | "Comparison";
  ticker: string;
  companyName: string;
  quarterLabel: string;
  periodEnd: string;
  segmentName: string;
  issue: string;
  details: string;
  sourceSheet: string;
}

interface WorkbookInsightRow {
  priority: number;
  category: string;
  ticker: string;
  quarterLabel: string;
  periodEnd: string;
  segmentName: string;
  insight: string;
  support: string;
}

interface ComparisonWorkbookRow {
  ticker: string;
  companyName: string;
  quarterLabel: string;
  periodEnd: string;
  segmentName: string;
  revenue: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  volume: number | null;
  volumeUnitType: VolumeUnitType | null;
  revenuePerUnit: number | null;
  operatingIncomePerUnit: number | null;
}

function normalizeCellText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSheetName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function rowLooksBlank(row: unknown[]): boolean {
  return row.every((cell) => String(cell ?? "").trim().length === 0);
}

function rowDisplayText(row: unknown[]): string {
  return row
    .map((cell) => String(cell ?? "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ");
}

function normalizeYear(yearToken: string): number | null {
  if (!/^\d{2,4}$/.test(yearToken)) return null;
  const raw = Number(yearToken);
  if (!Number.isFinite(raw)) return null;
  if (yearToken.length === 4) return raw >= 2000 && raw <= 2100 ? raw : null;
  return 2000 + raw;
}

function parseQuarterLabel(rawValue: unknown): ParsedQuarterLabel | null {
  const value = String(rawValue ?? "").trim().toUpperCase();
  if (!value) return null;

  const patterns: Array<RegExp> = [
    /\bQ([1-4])\s*(?:FISCAL|FY)?\s*(20\d{2}|\d{2})\b/g,
    /\b([1-4])Q\s*(20\d{2}|\d{2})\b/g,
    /\bQ([1-4])([0-9]{2,4})\b/g,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(value.matchAll(pattern));
    const match = matches[matches.length - 1];
    if (!match) continue;
    const quarter = Number(match[1]) as 1 | 2 | 3 | 4;
    const year = normalizeYear(match[2]);
    if (!year) continue;
    return {
      fiscalQuarter: quarter,
      fiscalYear: year,
      label: `Q${quarter} ${year}`,
      periodEnd: `${year}${QUARTER_ENDS[quarter]}`,
    };
  }

  const yearlyPatterns: Array<RegExp> = [
    /\bFY\s*(20\d{2}|\d{2})\b/g,
    /\bFISCAL\s+YEAR\s*(20\d{2}|\d{2})\b/g,
    /^\s*(20\d{2})\s*$/g,
  ];

  for (const pattern of yearlyPatterns) {
    const matches = Array.from(value.matchAll(pattern));
    const match = matches[matches.length - 1];
    if (!match) continue;
    const year = normalizeYear(match[1]);
    if (!year) continue;
    return {
      fiscalQuarter: 4,
      fiscalYear: year,
      label: `FY ${year}`,
      periodEnd: `${year}${QUARTER_ENDS[4]}`,
    };
  }

  return null;
}

const GENERIC_SEGMENT_ALIASES: Array<{ aliases: string[]; segmentName: string }> = [
  {
    aliases: [
      "integrated pork",
      "us pork total",
      "fresh pork + packaged",
      "prepared foods + pork",
      "packaged meats + fresh pork",
      "fp + pm",
      "pork total",
    ],
    segmentName: "Integrated Pork",
  },
  { aliases: ["packaged meats", "prepared foods", "packaged comparison"], segmentName: "Packaged Meats" },
  { aliases: ["fresh pork", "pork"], segmentName: "Fresh Pork" },
  { aliases: ["hog production", "hog"], segmentName: "Hog Production" },
  { aliases: ["consolidated", "overview", "company total", "total company"], segmentName: "Company Total" },
];

function detectWorkbookCompanyAlias(rawValue: unknown): WorkbookCompanyAlias | null {
  const normalized = normalizeCellText(rawValue);
  if (!normalized) return null;
  return (
    WORKBOOK_COMPANY_ALIASES.find((alias) => alias.patterns.some((pattern) => normalized.includes(pattern))) ?? null
  );
}

function detectGenericSegmentMeta(rawValue: unknown): DetectedSegmentMeta | null {
  const text = String(rawValue ?? "").trim();
  const normalized = normalizeCellText(text);
  if (!normalized) return null;

  for (const segment of GENERIC_SEGMENT_ALIASES) {
    if (segment.aliases.some((alias) => normalized.includes(alias))) {
      return {
        segmentName: segment.segmentName,
        rawSegmentName: text,
      };
    }
  }

  return null;
}

function detectVolumeUnitType(rawValue: string): VolumeUnitType | null {
  if (rawValue.includes("head") || rawValue.includes("swine")) return "head";
  if (rawValue.includes("cwt")) return "cwt";
  if (rawValue.includes("case")) return "cases";
  if (rawValue.includes("lb") || rawValue.includes("pound")) return "lbs";
  return null;
}

function detectSectionMetricDescriptor(rawValue: unknown): SectionMetricDescriptor | null {
  const normalized = normalizeCellText(rawValue);
  if (!normalized) return null;
  if (
    normalized.includes("margin gap") ||
    normalized.includes("sales development") ||
    normalized.includes("yoy change") ||
    normalized.includes("diff to") ||
    normalized.includes("vs ")
  ) {
    return null;
  }

  const basis: ExtractionBasis = normalized.includes("adj") || normalized.includes("adjusted") ? "adjusted" : "reported";

  if (
    normalized.includes("operating profit margin") ||
    normalized.includes("operating margin") ||
    normalized.includes("op mgn") ||
    normalized.includes("op margin") ||
    normalized.includes("margin %") ||
    normalized === "sp mgn"
  ) {
    return { field: "operatingMargin", basis, volumeUnitType: null };
  }

  if (
    normalized.includes("seg prof") ||
    normalized.includes("segment profit") ||
    normalized.includes("operating income") ||
    normalized.includes("operating profit") ||
    normalized.includes("op adj") ||
    normalized.includes("adj op") ||
    normalized.includes("op seg profit")
  ) {
    return { field: "operatingIncome", basis, volumeUnitType: null };
  }

  if (normalized.includes("gross profit") || normalized.includes("gr profit")) {
    return { field: "grossProfit", basis, volumeUnitType: null };
  }

  if (normalized.includes("sga")) {
    return { field: "sgaExpense", basis, volumeUnitType: null };
  }

  if (
    normalized.includes("sales") ||
    normalized.includes("revenue")
  ) {
    return { field: "revenue", basis, volumeUnitType: null };
  }

  if (
    normalized.includes("volume") ||
    normalized.includes("pounds sold") ||
    normalized.includes("lbs sold") ||
    normalized.includes("head slaughtered") ||
    normalized.includes("head harvest") ||
    normalized.includes("market swine") ||
    normalized.includes("cases")
  ) {
    return {
      field: "volumeUnits",
      basis,
      volumeUnitType: detectVolumeUnitType(normalized),
    };
  }

  return null;
}

function parseNumericCell(rawValue: unknown): number | null {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;

  const text = String(rawValue ?? "").trim();
  if (!text || text === "—" || text === "–") return null;

  const negativeWrapped = text.startsWith("(") && text.endsWith(")");
  const normalized = negativeWrapped ? `-${text.slice(1, -1)}` : text;
  const cleaned = normalized.replace(/[$,%\s]/g, "").replace(/,/g, "");

  if (!cleaned || cleaned === "-" || /^-+$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function divideNumber(value: number | null, divisor?: number): number | null {
  if (value == null) return null;
  if (!divisor || divisor === 1) return value;
  return round(value / divisor, 4);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function safePct(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return round((num / den) * 100, 2);
}

function safePerUnit(value: number | null, volumeUnits: number | null): number | null {
  if (value == null || volumeUnits == null || volumeUnits === 0) return null;
  return round(value / volumeUnits, 2);
}

function diffPct(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null || baseline === 0) return null;
  return round(((current - baseline) / Math.abs(baseline)) * 100, 2);
}

function marginChange(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null) return null;
  return round(current - baseline, 2);
}

function normalizedVolumeUnitLabel(unit: VolumeUnitType | null): string {
  if (!unit) return "";
  return unit;
}

function isFiscalYearLabel(label: string): boolean {
  return /^\s*FY\b/i.test(label);
}

function priorYearPeriodEnd(periodEnd: string): string | null {
  const match = periodEnd.match(/^(\d{4})(-\d{2}-\d{2})$/);
  if (!match) return null;
  return `${Number(match[1]) - 1}${match[2]}`;
}

function priorQuarterPeriodEnd(row: Pick<ExcelCompetitorQuarterRow, "quarterLabel">): string | null {
  if (isFiscalYearLabel(row.quarterLabel)) return null;
  const parsed = parseQuarterLabel(row.quarterLabel);
  if (!parsed) return null;

  if (parsed.fiscalQuarter === 1) {
    return `${parsed.fiscalYear - 1}${QUARTER_ENDS[4]}`;
  }

  return `${parsed.fiscalYear}${QUARTER_ENDS[(parsed.fiscalQuarter - 1) as 1 | 2 | 3 | 4]}`;
}

function buildWorkbookCompanyIdentity(rawCompanyName: string, fileName: string): { ticker: string; companyName: string } {
  const normalized = normalizeCellText(rawCompanyName);

  for (const alias of WORKBOOK_COMPANY_ALIASES) {
    if (alias.patterns.some((pattern) => normalized.includes(pattern))) {
      return { ticker: alias.ticker, companyName: alias.companyName };
    }
  }

  const ticker = resolveTicker({
    companyName: rawCompanyName,
    fileName,
  });
  const companyName = normalizeCompanyName({
    candidate: rawCompanyName,
    fileName,
    ticker,
  });
  return { ticker, companyName };
}

function buildSheetLookup(workbook: XLSX.WorkBook): Map<string, SheetLookupEntry> {
  const lookup = new Map<string, SheetLookupEntry>();
  for (const rawName of workbook.SheetNames) {
    const sheet = workbook.Sheets[rawName];
    if (!sheet) continue;
    const normalizedName = normalizeSheetName(rawName);
    if (!lookup.has(normalizedName)) {
      lookup.set(normalizedName, { rawName, sheet, normalizedName });
    }
  }
  return lookup;
}

function sheetRows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
}

function detectWorkbookFamily(sheetLookup: Map<string, SheetLookupEntry>): WorkbookFamily {
  let matches = 0;
  for (const key of SMITHFIELD_TYSON_FAMILY_SHEETS) {
    if (sheetLookup.has(key)) matches += 1;
  }
  return matches >= 4 ? "smithfield_tyson_competitor_model" : "generic_flat_table";
}

function sheetPriority(sheetName: string, tableLabel: string): number {
  const normalizedSheet = normalizeSheetName(sheetName);
  const explicit = SHEET_PRIORITY[normalizedSheet];
  if (explicit != null) return explicit;

  const normalized = `${sheetName} ${tableLabel}`.toLowerCase();
  let score = 10;

  if (normalized.includes("data-pm")) score += 25;
  if (normalized.includes("prepared foods")) score += 10;
  if (normalized.includes("packaged")) score += 5;
  if (normalized.includes("data-cons")) score += 15;
  if (normalized.includes("cache")) score -= 50;
  if (normalized.includes("sga")) score -= 20;

  return score;
}

function detectQuarterColumns(rows: unknown[][], maxHeaderRows = 24): { rowIndex: number; quarters: ParsedQuarterColumn[] } | null {
  let best: { rowIndex: number; quarters: ParsedQuarterColumn[] } | null = null;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, maxHeaderRows); rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const quarters: ParsedQuarterColumn[] = [];

    row.forEach((cell, colIndex) => {
      const parsed = parseQuarterLabel(cell);
      if (!parsed) return;
      quarters.push({ ...parsed, colIndex });
    });

    if (quarters.length < 2) continue;
    if (!best || quarters.length > best.quarters.length) {
      best = { rowIndex, quarters };
    }
  }

  return best;
}

function createSegmentRow(input: {
  ticker: string;
  companyName: string;
  segmentName: string;
  rawSegmentName?: string;
  quarter: ParsedQuarterColumn;
  revenue: number | null;
  grossProfit: number | null;
  sgaExpense: number | null;
  operatingIncome: number | null;
  operatingMargin: number | null;
  volumeUnits: number | null;
  volumeUnitType: VolumeUnitType | null;
  basis: ExtractionBasis;
  sourceSheet: string;
  sourceTableLabel: string;
  sourceRowNumber: number;
  sourceSheetPriority: number;
}): ExcelCompetitorSegmentRow {
  const operatingMargin = input.operatingMargin ?? safePct(input.operatingIncome, input.revenue);

  return {
    ticker: input.ticker,
    companyName: input.companyName,
    segmentName: input.segmentName,
    rawSegmentName: input.rawSegmentName ?? input.segmentName,
    quarterLabel: input.quarter.label,
    periodEnd: input.quarter.periodEnd,
    originalPeriodLabel: input.quarter.label,
    alignedPeriodLabel: input.quarter.label,
    revenue: input.revenue,
    grossProfit: input.grossProfit,
    sgaExpense: input.sgaExpense,
    operatingIncome: input.operatingIncome,
    operatingMargin,
    volumeUnits: input.volumeUnits,
    volumeUnitType: input.volumeUnitType,
    revenuePerUnit: safePerUnit(input.revenue, input.volumeUnits),
    operatingIncomePerUnit: safePerUnit(input.operatingIncome, input.volumeUnits),
    basis: input.basis,
    sourceSheet: input.sourceSheet,
    sourceTableLabel: input.sourceTableLabel,
    sourceRowNumber: input.sourceRowNumber,
    sourceSheetPriority: input.sourceSheetPriority,
  };
}

function extractMatrixSegmentRows(rows: unknown[][], config: MatrixSegmentExtractorConfig): ExcelCompetitorSegmentRow[] {
  const header = detectQuarterColumns(rows);
  if (!header) return [];

  const specMatches = new Map<string, MatrixMetricSpec>();
  for (const spec of config.metricSpecs) {
    for (const alias of spec.aliases) {
      specMatches.set(normalizeCellText(alias), spec);
    }
  }

  const captured = new Map<string, CapturedMetricSeries>();
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const firstCell = row[0];
    const normalizedFirstCell = normalizeCellText(firstCell);
    if (!normalizedFirstCell) continue;

    const spec =
      Array.from(specMatches.entries()).find(([alias]) =>
        normalizedFirstCell === alias || normalizedFirstCell.includes(alias)
      )?.[1] ?? null;
    if (!spec) continue;

    const values = new Map<number, number | null>();
    for (const quarter of header.quarters) {
      const parsed = parseNumericCell(row[quarter.colIndex]);
      values.set(quarter.colIndex, divideNumber(parsed, spec.divideBy));
    }

    captured.set(spec.field, {
      field: spec.field,
      rowNumber: rowIndex + 1,
      basis: spec.basis,
      volumeUnitType: spec.volumeUnitType ?? null,
      values,
    });
  }

  const revenueSeries = captured.get("revenue");
  const grossProfitSeries = captured.get("grossProfit");
  const sgaSeries = captured.get("sgaExpense");
  const operatingSeries = captured.get("operatingIncome");
  const marginSeries = captured.get("operatingMargin");
  const volumeSeries = captured.get("volumeUnits");

  const extracted: ExcelCompetitorSegmentRow[] = [];
  for (const quarter of header.quarters) {
    const revenue = revenueSeries?.values.get(quarter.colIndex) ?? null;
    const grossProfit = grossProfitSeries?.values.get(quarter.colIndex) ?? null;
    const sgaExpense = sgaSeries?.values.get(quarter.colIndex) ?? null;
    const operatingIncome = operatingSeries?.values.get(quarter.colIndex) ?? null;
    const operatingMargin = marginSeries?.values.get(quarter.colIndex) ?? null;
    const volumeUnits = volumeSeries?.values.get(quarter.colIndex) ?? null;

    if (
      revenue == null &&
      grossProfit == null &&
      sgaExpense == null &&
      operatingIncome == null &&
      operatingMargin == null &&
      volumeUnits == null
    ) {
      continue;
    }

    extracted.push(
      createSegmentRow({
        ticker: config.ticker,
        companyName: config.companyName,
        segmentName: config.segmentName,
        rawSegmentName: config.rawSegmentName,
        quarter,
        revenue,
        grossProfit,
        sgaExpense,
        operatingIncome,
        operatingMargin,
        volumeUnits,
        volumeUnitType: volumeSeries?.volumeUnitType ?? null,
        basis: operatingSeries?.basis ?? "reported",
        sourceSheet: config.sheetName,
        sourceTableLabel: config.segmentName,
        sourceRowNumber:
          operatingSeries?.rowNumber ??
          revenueSeries?.rowNumber ??
          grossProfitSeries?.rowNumber ??
          volumeSeries?.rowNumber ??
          header.rowIndex + 1,
        sourceSheetPriority: config.priority,
      })
    );
  }

  return extracted;
}

function extractTsnInputSegmentRows(rows: unknown[][], sheetName: string): ExcelCompetitorSegmentRow[] {
  const header = detectQuarterColumns(rows, 8);
  if (!header) return [];

  const companyName = "Tyson Foods";
  const ticker = "TSN";
  const priority = sheetPriority(sheetName, "Tyson Input");

  const sectionConfigs: Record<string, TsnInputSectionConfig> = {
    "fresh pork": {
      segmentName: "Fresh Pork",
      rawSegmentName: "Fresh Pork",
      operatingIncomePreference: [
        {
          alias: "op seg profit",
          basis: "reported",
          useWhen: (quarter) => quarter.periodEnd >= "2024-03-31",
        },
        {
          alias: "op adj",
          basis: "adjusted",
          useWhen: (quarter) => quarter.periodEnd < "2024-03-31",
        },
        {
          alias: "op seg profit",
          basis: "reported",
          useWhen: () => true,
        },
      ],
      volumeMetric: { alias: "head slaughtered", unit: "head" },
    },
    "packaged meats": {
      segmentName: "Packaged Meats",
      rawSegmentName: "Packaged Meats",
      operatingIncomePreference: [
        {
          alias: "operating profit adj",
          basis: "adjusted",
          useWhen: () => true,
        },
      ],
      volumeMetric: { alias: "pounds sold", unit: "lbs" },
    },
    "us pork total fp pm": {
      segmentName: "Integrated Pork",
      rawSegmentName: "US Pork Total (FP + PM)",
      operatingIncomePreference: [
        {
          alias: "operating profit adj",
          basis: "adjusted",
          useWhen: () => true,
        },
      ],
    },
  };

  type SectionCapture = {
    config: TsnInputSectionConfig;
    revenue?: CapturedMetricSeries;
    opAdjusted?: CapturedMetricSeries;
    opReported?: CapturedMetricSeries;
    volume?: CapturedMetricSeries;
  };

  const captures = new Map<string, SectionCapture>();
  let currentSection: string | null = null;

  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const label = normalizeCellText(row[0]);
    if (!label) continue;

    if (sectionConfigs[label]) {
      currentSection = label;
      if (!captures.has(label)) {
        captures.set(label, { config: sectionConfigs[label] });
      }
      continue;
    }

    if (!currentSection) continue;
    const capture = captures.get(currentSection);
    if (!capture) continue;

    const values = new Map<number, number | null>();
    for (const quarter of header.quarters) {
      values.set(quarter.colIndex, parseNumericCell(row[quarter.colIndex]));
    }

    if (label.includes("sales")) {
      capture.revenue = {
        field: "revenue",
        rowNumber: rowIndex + 1,
        values,
      };
      continue;
    }

    if (label.includes("op seg profit")) {
      capture.opReported = {
        field: "operatingIncome",
        rowNumber: rowIndex + 1,
        basis: "reported",
        values,
      };
      continue;
    }

    if (label.includes("op adj") || label.includes("operating profit adj")) {
      capture.opAdjusted = {
        field: "operatingIncome",
        rowNumber: rowIndex + 1,
        basis: "adjusted",
        values,
      };
      continue;
    }

    if (capture.config.volumeMetric && label.includes(normalizeCellText(capture.config.volumeMetric.alias))) {
      capture.volume = {
        field: "volumeUnits",
        rowNumber: rowIndex + 1,
        volumeUnitType: capture.config.volumeMetric.unit,
        values,
      };
    }
  }

  const extracted: ExcelCompetitorSegmentRow[] = [];
  for (const capture of captures.values()) {
    for (const quarter of header.quarters) {
      const revenue = capture.revenue?.values.get(quarter.colIndex) ?? null;
      let operatingIncome: number | null = null;
      let basis: ExtractionBasis = "reported";

      for (const preference of capture.config.operatingIncomePreference) {
        if (!preference.useWhen(quarter)) continue;
        const series =
          preference.alias.includes("seg profit")
            ? capture.opReported
            : capture.opAdjusted;
        const value = series?.values.get(quarter.colIndex) ?? null;
        if (value == null) continue;
        operatingIncome = value;
        basis = preference.basis;
        break;
      }

      const volumeUnits = capture.volume?.values.get(quarter.colIndex) ?? null;
      if (revenue == null && operatingIncome == null && volumeUnits == null) continue;

      extracted.push(
        createSegmentRow({
          ticker,
          companyName,
          segmentName: capture.config.segmentName,
          rawSegmentName: capture.config.rawSegmentName,
          quarter,
          revenue,
          grossProfit: null,
          sgaExpense: null,
          operatingIncome,
          operatingMargin: null,
          volumeUnits,
          volumeUnitType: capture.volume?.volumeUnitType ?? null,
          basis,
          sourceSheet: sheetName,
          sourceTableLabel: capture.config.segmentName,
          sourceRowNumber:
            capture.opReported?.rowNumber ??
            capture.opAdjusted?.rowNumber ??
            capture.revenue?.rowNumber ??
            capture.volume?.rowNumber ??
            header.rowIndex + 1,
          sourceSheetPriority: priority,
        })
      );
    }
  }

  return extracted;
}

function extractTsnPlSegmentRows(rows: unknown[][], sheetName: string): ExcelCompetitorSegmentRow[] {
  const header = detectQuarterColumns(rows, 10);
  if (!header) return [];

  const targetSegments = new Map<string, { segmentName: string; rawSegmentName: string }>([
    ["pork", { segmentName: "Fresh Pork", rawSegmentName: "Pork" }],
    ["prepared foods", { segmentName: "Packaged Meats", rawSegmentName: "Prepared Foods" }],
  ]);

  const blocks = new Map<
    string,
    {
      revenue?: CapturedMetricSeries;
      operatingIncome?: CapturedMetricSeries;
      rowNumber: number;
      meta: { segmentName: string; rawSegmentName: string };
    }
  >();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const firstCell = normalizeCellText(row[0]);
    const meta = targetSegments.get(firstCell);
    if (!meta) continue;

    const block = {
      rowNumber: rowIndex + 1,
      meta,
    } as {
      revenue?: CapturedMetricSeries;
      operatingIncome?: CapturedMetricSeries;
      rowNumber: number;
      meta: { segmentName: string; rawSegmentName: string };
    };

    for (let inner = rowIndex + 1; inner < Math.min(rows.length, rowIndex + 16); inner += 1) {
      const metricRow = rows[inner] ?? [];
      const metricLabel = normalizeCellText(metricRow[0]);
      if (!metricLabel) continue;
      if (targetSegments.has(metricLabel)) break;

      const values = new Map<number, number | null>();
      for (const quarter of header.quarters) {
        values.set(quarter.colIndex, parseNumericCell(metricRow[quarter.colIndex]));
      }

      if (metricLabel === "revenue") {
        block.revenue = { field: "revenue", rowNumber: inner + 1, values };
      } else if (metricLabel === "operating income") {
        block.operatingIncome = {
          field: "operatingIncome",
          rowNumber: inner + 1,
          basis: "reported",
          values,
        };
      }
    }

    blocks.set(meta.segmentName, block);
  }

  const extracted: ExcelCompetitorSegmentRow[] = [];
  const priority = sheetPriority(sheetName, "TSN PL");
  for (const block of blocks.values()) {
    for (const quarter of header.quarters) {
      const revenue = block.revenue?.values.get(quarter.colIndex) ?? null;
      const operatingIncome = block.operatingIncome?.values.get(quarter.colIndex) ?? null;
      if (revenue == null && operatingIncome == null) continue;

      extracted.push(
        createSegmentRow({
          ticker: "TSN",
          companyName: "Tyson Foods",
          segmentName: block.meta.segmentName,
          rawSegmentName: block.meta.rawSegmentName,
          quarter,
          revenue,
          grossProfit: null,
          sgaExpense: null,
          operatingIncome,
          operatingMargin: null,
          volumeUnits: null,
          volumeUnitType: null,
          basis: "reported",
          sourceSheet: sheetName,
          sourceTableLabel: block.meta.rawSegmentName,
          sourceRowNumber: block.operatingIncome?.rowNumber ?? block.revenue?.rowNumber ?? block.rowNumber,
          sourceSheetPriority: priority,
        })
      );
    }
  }

  return extracted;
}

function scoreSegmentRow(row: ExcelCompetitorSegmentRow): number {
  let score = row.sourceSheetPriority;
  if (row.revenue != null) score += 3;
  if (row.operatingIncome != null) score += 3;
  if (row.operatingMargin != null) score += 1;
  if (row.grossProfit != null) score += 1;
  if (row.volumeUnits != null) score += 1;
  if (row.basis === "reported") score += 1;
  return score;
}

function dedupeSegmentRows(rows: ExcelCompetitorSegmentRow[]): ExcelCompetitorSegmentRow[] {
  const byKey = new Map<string, ExcelCompetitorSegmentRow>();

  for (const row of rows) {
    const key = `${row.ticker}:${row.segmentName}:${row.periodEnd}`;
    const current = byKey.get(key);
    if (!current || scoreSegmentRow(row) > scoreSegmentRow(current)) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.periodEnd !== right.periodEnd) return right.periodEnd.localeCompare(left.periodEnd);
    if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
    return left.segmentName.localeCompare(right.segmentName);
  });
}

function deriveIntegratedSegmentRows(rows: ExcelCompetitorSegmentRow[]): ExcelCompetitorSegmentRow[] {
  const byQuarter = new Map<string, Map<string, ExcelCompetitorSegmentRow>>();
  for (const row of rows) {
    const key = `${row.ticker}:${row.periodEnd}`;
    if (!byQuarter.has(key)) byQuarter.set(key, new Map());
    byQuarter.get(key)!.set(row.segmentName, row);
  }

  const derived: ExcelCompetitorSegmentRow[] = [];
  for (const [groupKey, segments] of byQuarter.entries()) {
    if (segments.has("Integrated Pork")) continue;

    const fresh = segments.get("Fresh Pork");
    const packaged = segments.get("Packaged Meats");
    if (!fresh || !packaged) continue;

    const [ticker] = groupKey.split(":");
    derived.push({
      ticker,
      companyName: fresh.companyName,
      segmentName: "Integrated Pork",
      rawSegmentName: `${fresh.rawSegmentName} + ${packaged.rawSegmentName}`,
      quarterLabel: fresh.quarterLabel,
      periodEnd: fresh.periodEnd,
      originalPeriodLabel: fresh.originalPeriodLabel,
      alignedPeriodLabel: fresh.alignedPeriodLabel,
      revenue: round((fresh.revenue ?? 0) + (packaged.revenue ?? 0), 4),
      grossProfit:
        fresh.grossProfit != null || packaged.grossProfit != null
          ? round((fresh.grossProfit ?? 0) + (packaged.grossProfit ?? 0), 4)
          : null,
      sgaExpense:
        fresh.sgaExpense != null || packaged.sgaExpense != null
          ? round((fresh.sgaExpense ?? 0) + (packaged.sgaExpense ?? 0), 4)
          : null,
      operatingIncome:
        fresh.operatingIncome != null || packaged.operatingIncome != null
          ? round((fresh.operatingIncome ?? 0) + (packaged.operatingIncome ?? 0), 4)
          : null,
      operatingMargin: safePct(
        (fresh.operatingIncome ?? 0) + (packaged.operatingIncome ?? 0),
        (fresh.revenue ?? 0) + (packaged.revenue ?? 0)
      ),
      volumeUnits: null,
      volumeUnitType: null,
      revenuePerUnit: null,
      operatingIncomePerUnit: null,
      basis: "derived",
      sourceSheet: `${fresh.sourceSheet} + ${packaged.sourceSheet}`,
      sourceTableLabel: "Integrated Pork",
      sourceRowNumber: Math.min(fresh.sourceRowNumber, packaged.sourceRowNumber),
      sourceSheetPriority: Math.min(fresh.sourceSheetPriority, packaged.sourceSheetPriority) - 1,
    });
  }

  return derived;
}

function buildCompanyQuarterRows(segmentRows: ExcelCompetitorSegmentRow[]): ExcelCompetitorQuarterRow[] {
  const rows = segmentRows
    .filter((row) => row.segmentName === "Integrated Pork")
    .map<ExcelCompetitorQuarterRow>((row) => ({
      ticker: row.ticker,
      companyName: row.companyName,
      quarterLabel: row.quarterLabel,
      periodEnd: row.periodEnd,
      originalPeriodLabel: row.originalPeriodLabel,
      alignedPeriodLabel: row.alignedPeriodLabel,
      revenue: row.revenue,
      grossProfit: row.grossProfit,
      sgaExpense: row.sgaExpense,
      operatingIncome: row.operatingIncome,
      operatingMargin: row.operatingMargin,
      volume: row.volumeUnits,
      volumeUnitType: row.volumeUnitType,
      basis: row.basis,
      sourceSheet: row.sourceSheet,
      sourceTableLabel: row.sourceTableLabel,
      sourceRowNumber: row.sourceRowNumber,
      sourceSheetPriority: row.sourceSheetPriority,
    }));

  const byKey = new Map<string, ExcelCompetitorQuarterRow>();
  for (const row of rows) {
    const key = `${row.ticker}:${row.periodEnd}`;
    const current = byKey.get(key);
    if (!current || row.sourceSheetPriority > current.sourceSheetPriority) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
    return right.periodEnd.localeCompare(left.periodEnd);
  });
}

function buildGenericCompanyRowsFromSegmentRows(segmentRows: ExcelCompetitorSegmentRow[]): {
  rows: ExcelCompetitorQuarterRow[];
  aggregatedPeriods: string[];
} {
  const grouped = new Map<string, ExcelCompetitorSegmentRow[]>();

  for (const row of segmentRows) {
    const key = `${row.ticker}:${row.periodEnd}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const aggregatedPeriods: string[] = [];
  const rows: ExcelCompetitorQuarterRow[] = [];

  const sumNullable = (values: Array<number | null>): number | null => {
    const present = values.filter((value): value is number => value != null);
    if (present.length === 0) return null;
    return round(present.reduce((sum, value) => sum + value, 0), 4);
  };

  for (const [groupKey, companyRows] of grouped.entries()) {
    const preferred = companyRows
      .filter((row) => row.segmentName === "Company Total" || row.segmentName === "Integrated Pork")
      .sort((left, right) => scoreSegmentRow(right) - scoreSegmentRow(left))[0];

    if (preferred) {
      rows.push({
        ticker: preferred.ticker,
        companyName: preferred.companyName,
        quarterLabel: preferred.quarterLabel,
        periodEnd: preferred.periodEnd,
        originalPeriodLabel: preferred.originalPeriodLabel,
        alignedPeriodLabel: preferred.alignedPeriodLabel,
        revenue: preferred.revenue,
        grossProfit: preferred.grossProfit,
        sgaExpense: preferred.sgaExpense,
        operatingIncome: preferred.operatingIncome,
        operatingMargin: preferred.operatingMargin,
        volume: preferred.volumeUnits,
        volumeUnitType: preferred.volumeUnitType,
        basis: preferred.basis,
        sourceSheet: preferred.sourceSheet,
        sourceTableLabel: preferred.segmentName,
        sourceRowNumber: preferred.sourceRowNumber,
        sourceSheetPriority: preferred.sourceSheetPriority,
      });
      continue;
    }

    const bestSource = companyRows.sort((left, right) => scoreSegmentRow(right) - scoreSegmentRow(left))[0];
    if (!bestSource) continue;

    const unitTypes = Array.from(
      new Set(companyRows.map((row) => row.volumeUnitType).filter((unit): unit is VolumeUnitType => unit != null))
    );

    if (companyRows.length > 1) aggregatedPeriods.push(groupKey);

    rows.push({
      ticker: bestSource.ticker,
      companyName: bestSource.companyName,
      quarterLabel: bestSource.quarterLabel,
      periodEnd: bestSource.periodEnd,
      originalPeriodLabel: bestSource.originalPeriodLabel,
      alignedPeriodLabel: bestSource.alignedPeriodLabel,
      revenue: sumNullable(companyRows.map((row) => row.revenue)),
      grossProfit: sumNullable(companyRows.map((row) => row.grossProfit)),
      sgaExpense: sumNullable(companyRows.map((row) => row.sgaExpense)),
      operatingIncome: sumNullable(companyRows.map((row) => row.operatingIncome)),
      operatingMargin: safePct(
        sumNullable(companyRows.map((row) => row.operatingIncome)),
        sumNullable(companyRows.map((row) => row.revenue))
      ),
      volume: unitTypes.length <= 1 ? sumNullable(companyRows.map((row) => row.volumeUnits)) : null,
      volumeUnitType: unitTypes.length === 1 ? unitTypes[0] : null,
      basis: companyRows.some((row) => row.basis === "reported") ? "reported" : "derived",
      sourceSheet: bestSource.sourceSheet,
      sourceTableLabel:
        companyRows.length > 1 ? `Derived from ${companyRows.length} segment rows` : bestSource.segmentName,
      sourceRowNumber: Math.min(...companyRows.map((row) => row.sourceRowNumber)),
      sourceSheetPriority: Math.max(...companyRows.map((row) => row.sourceSheetPriority)) - 1,
    });
  }

  return {
    rows: rows.sort((left, right) => {
      if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
      return right.periodEnd.localeCompare(left.periodEnd);
    }),
    aggregatedPeriods,
  };
}

function summarizeCompanies(rows: ExcelCompetitorQuarterRow[]): ExcelCompetitorCompanySummary[] {
  const map = new Map<string, ExcelCompetitorCompanySummary>();

  for (const row of rows) {
    const current = map.get(row.ticker);
    if (!current) {
      map.set(row.ticker, {
        ticker: row.ticker,
        companyName: row.companyName,
        quarterCount: 1,
        latestQuarter: row.quarterLabel,
        latestPeriodEnd: row.periodEnd,
      });
      continue;
    }

    current.quarterCount += 1;
    if (row.periodEnd > current.latestPeriodEnd) {
      current.latestPeriodEnd = row.periodEnd;
      current.latestQuarter = row.quarterLabel;
    }
  }

  return Array.from(map.values()).sort((left, right) => left.ticker.localeCompare(right.ticker));
}

function summarizeSheetMatchesFromSegmentRows(rows: ExcelCompetitorSegmentRow[]): ExcelCompetitorSheetMatch[] {
  const map = new Map<string, ExcelCompetitorSheetMatch>();

  for (const row of rows) {
    const key = `${row.sourceSheet}:${row.sourceTableLabel}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        sheetName: row.sourceSheet,
        tableLabel: row.sourceTableLabel,
        rowCount: 1,
        priority: row.sourceSheetPriority,
      });
      continue;
    }

    current.rowCount += 1;
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return right.rowCount - left.rowCount;
  });
}

function mergeSheetMatches(
  ...groups: ExcelCompetitorSheetMatch[][]
): ExcelCompetitorSheetMatch[] {
  const merged = new Map<string, ExcelCompetitorSheetMatch>();

  for (const group of groups) {
    for (const match of group) {
      const key = `${match.sheetName}:${match.tableLabel}`;
      const current = merged.get(key);
      if (!current) {
        merged.set(key, { ...match });
        continue;
      }

      current.rowCount += match.rowCount;
      current.priority = Math.max(current.priority, match.priority);
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return right.rowCount - left.rowCount;
  });
}

function primarySheetFromRows(rows: Array<{ sourceSheet: string; sourceSheetPriority: number }>): string | null {
  if (rows.length === 0) return null;

  const counts = new Map<string, { sheetName: string; score: number; rows: number }>();
  for (const row of rows) {
    const current = counts.get(row.sourceSheet) ?? {
      sheetName: row.sourceSheet,
      score: row.sourceSheetPriority,
      rows: 0,
    };
    current.rows += 1;
    current.score = Math.max(current.score, row.sourceSheetPriority);
    counts.set(row.sourceSheet, current);
  }

  return Array.from(counts.values())
    .sort((left, right) => right.score - left.score || right.rows - left.rows || left.sheetName.localeCompare(right.sheetName))[0]
    ?.sheetName ?? null;
}

function confidenceForRow(row: ExcelCompetitorQuarterRow): DataConfidence {
  if (row.revenue != null && row.operatingIncome != null) return "high";
  if (row.revenue != null || row.operatingIncome != null) return "medium";
  return "low";
}

function nullNumber(): number {
  return null as unknown as number;
}

function buildCfItem(
  tag: string,
  label: string,
  value: number,
  periodEnd: string,
  source: string,
  confidence: DataConfidence,
): BSItem {
  return {
    tag,
    label,
    value,
    period: periodEnd,
    source,
    period_type: "quarter",
    confidence,
  };
}

function buildSegmentData(row: ExcelCompetitorSegmentRow): SegmentData {
  return {
    segmentName: row.segmentName,
    segmentType: "business",
    revenue: row.revenue,
    costOfRevenue:
      row.revenue != null && row.grossProfit != null ? round(row.revenue - row.grossProfit, 4) : null,
    grossProfit: row.grossProfit,
    sgaExpense: row.sgaExpense,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.operatingMargin,
    depreciation: null,
    capitalExpenditures: null,
    totalAssets: null,
    intercompanyEliminations: null,
    volumeUnits: row.volumeUnits,
    volumeUnitType: row.volumeUnitType,
    revenuePerUnit: row.revenuePerUnit,
    operatingIncomePerUnit: row.operatingIncomePerUnit,
  };
}

function buildExcelDerivedAnalysis(
  row: ExcelCompetitorQuarterRow,
  segmentRows: ExcelCompetitorSegmentRow[],
  fileName: string,
  comparisonScope: string | null,
): FullAnalysis {
  const confidence = confidenceForRow(row);
  const provenance = `Excel:${row.sourceSheet}:row${row.sourceRowNumber}`;

  const cfItems: BSItem[] = [];
  if (row.revenue != null) {
    cfItems.push(buildCfItem("Revenues", "Revenue", row.revenue, row.periodEnd, provenance, confidence));
  }
  if (row.grossProfit != null) {
    cfItems.push(buildCfItem("GrossProfit", "Gross Profit", row.grossProfit, row.periodEnd, provenance, confidence));
  }
  if (row.sgaExpense != null) {
    cfItems.push(
      buildCfItem(
        "SellingGeneralAndAdministrativeExpense",
        "SG&A",
        row.sgaExpense,
        row.periodEnd,
        provenance,
        confidence,
      )
    );
  }
  if (row.operatingIncome != null) {
    cfItems.push(
      buildCfItem("OperatingIncomeLoss", "Operating Income", row.operatingIncome, row.periodEnd, provenance, confidence)
    );
  }

  const segments = segmentRows.map(buildSegmentData);

  return {
    meta: {
      source: "pdf",
      workflowOrigin: "competitor",
      ticker: row.ticker,
      companyName: row.companyName,
      filingType: "10-Q",
      filingDate: row.periodEnd,
      periodEnd: row.periodEnd,
      fileName,
      confidence,
      extractionRepairs: comparisonScope
        ? [
            `Derived from Excel competitor preprocessing (${row.sourceSheet} / ${row.sourceTableLabel}).`,
            `Company-level rows represent the ${comparisonScope} comparison scope used for the workbook, not consolidated enterprise filings.`,
          ]
        : [`Derived from Excel competitor preprocessing (${row.sourceSheet} / ${row.sourceTableLabel}).`],
    },
    balanceSheet: {
      totalAssets: nullNumber(),
      totalLiabilities: nullNumber(),
      totalEquity: nullNumber(),
      cashAndEquivalents: nullNumber(),
      retainedEarnings: null,
      originalTotalLiabilities: null,
      originalTotalEquity: null,
      unexplainedGap: null,
      items: [],
    },
    debtStructure: {
      shortTermDebt: nullNumber(),
      longTermDebt: nullNumber(),
      totalDebt: nullNumber(),
      netDebt: nullNumber(),
      operatingLeaseLiabilities: null,
      financeLeaseLiabilities: null,
      leaseAdjustedDebt: null,
      leaseAdjustedNetDebt: null,
      items: [],
    },
    cashFlow: {
      operatingCashFlow: null,
      capitalExpenditures: null,
      freeCashFlow: null,
      dividendsPaid: null,
      netIncome: null,
      shareRepurchases: null,
      investingCashFlow: null,
      financingCashFlow: null,
      debtIssued: null,
      debtRepaid: null,
    },
    incomeStatement: {
      revenue: row.revenue,
      costOfRevenue: row.revenue != null && row.grossProfit != null ? round(row.revenue - row.grossProfit, 4) : null,
      grossProfit: row.grossProfit,
      grossMargin: safePct(row.grossProfit, row.revenue),
      sgaExpense: row.sgaExpense,
      rdExpense: null,
      operatingExpenses:
        row.grossProfit != null && row.operatingIncome != null ? round(row.grossProfit - row.operatingIncome, 4) : null,
      operatingIncome: row.operatingIncome,
      operatingMargin: row.operatingMargin,
      ebit: row.operatingIncome,
      ebitMargin: row.operatingMargin,
      depreciation: null,
      amortization: null,
      ebitda: null,
      ebitdaMargin: null,
      ebitdaGaap: null,
      ebitdaAdjusted: null,
      interestExpense: null,
      incomeTax: null,
      netIncome: null,
      netMargin: null,
      epsBasic: null,
      epsDiluted: null,
      weightedAverageSharesBasic: null,
      weightedAverageSharesDiluted: null,
    },
    ratios: {
      debtToEquity: null,
      debtToCapital: null,
      netDebtToEbitda: null,
      interestCoverage: null,
      currentRatio: null,
      grossMargin: safePct(row.grossProfit, row.revenue),
      operatingMargin: row.operatingMargin,
      netMargin: null,
      ebitdaMargin: null,
      returnOnEquity: null,
      returnOnAssets: null,
      returnOnInvestedCapital: null,
      assetTurnover: null,
      inventoryTurnover: null,
      receivablesTurnover: null,
      daysSalesOutstanding: null,
      daysInventoryOutstanding: null,
      daysPayableOutstanding: null,
      cashConversionCycle: null,
      fcfYield: null,
      fcfConversion: null,
      capexAsPercentRevenue: null,
      dividendPayoutRatio: null,
      buybackPayoutRatio: null,
      totalPayoutRatio: null,
      effectiveTaxRate: null,
      leaseAdjustedDebtToEbitda: null,
      leaseAdjustedNetDebtToEbitda: null,
      workingCapital: null,
      workingCapitalRatio: null,
    },
    dividendAnalysis: {
      verdict: "unknown",
      headline: "Excel-derived competitor comparison input",
      bullets: [
        `Workbook source: ${row.sourceSheet}`,
        `Aligned period: ${row.alignedPeriodLabel}`,
        `Basis: ${row.basis}`,
      ],
      payoutRatioNI: null,
      payoutRatioFCF: null,
      fcfCoverageYears: null,
      cashCoverageYears: null,
    },
    cfItems,
    validation: {
      passed: row.revenue != null && row.operatingIncome != null,
      checks: [
        {
          name: "Revenue captured",
          passed: row.revenue != null,
          note: row.revenue != null ? "Quarterly revenue mapped from workbook." : "Revenue missing in source row.",
        },
        {
          name: "Operating income captured",
          passed: row.operatingIncome != null,
          note:
            row.operatingIncome != null
              ? "Operating income mapped from workbook."
              : "Operating income missing in source row.",
        },
        {
          name: "Segment comparison rows attached",
          passed: segments.length > 0,
          note:
            segments.length > 0
              ? `Attached ${segments.length} segment row(s) for competitor comparison.`
              : "No segment rows available for this company-quarter.",
        },
      ],
    },
    segments,
  };
}

function buildVirtualFilings(
  rows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  fileName: string,
  comparisonScope: string | null,
): Filing[] {
  const segmentMap = new Map<string, ExcelCompetitorSegmentRow[]>();
  for (const segmentRow of segmentRows) {
    const key = `${segmentRow.ticker}:${segmentRow.periodEnd}`;
    if (!segmentMap.has(key)) segmentMap.set(key, []);
    segmentMap.get(key)!.push(segmentRow);
  }

  return rows.map((row) => ({
    ticker: row.ticker,
    periodEnd: row.periodEnd,
    source: "pdf",
    savedAt: new Date().toISOString(),
    analysis: buildExcelDerivedAnalysis(
      row,
      segmentMap.get(`${row.ticker}:${row.periodEnd}`) ?? [],
      fileName,
      comparisonScope,
    ),
    filingType: "10-Q",
    filingDate: row.periodEnd,
    quarter: deriveQuarter(row.periodEnd),
  }));
}

function buildCompetitorComparisonSheetRows(segmentRows: ExcelCompetitorSegmentRow[]): Array<Array<string | number>> {
  const grouped = new Map<string, { sfd?: ExcelCompetitorSegmentRow; tsn?: ExcelCompetitorSegmentRow }>();

  for (const row of segmentRows) {
    if (row.ticker !== "SFD" && row.ticker !== "TSN") continue;
    const key = `${row.periodEnd}:${row.segmentName}`;
    const current = grouped.get(key) ?? {};
    if (row.ticker === "SFD") current.sfd = row;
    if (row.ticker === "TSN") current.tsn = row;
    grouped.set(key, current);
  }

  const output: Array<Array<string | number>> = [[
    "Quarter",
    "Period End",
    "Segment",
    "SFD Revenue",
    "TSN Revenue",
    "Revenue Gap",
    "SFD Operating Income",
    "TSN Operating Income",
    "Op Income Gap",
    "SFD Operating Margin %",
    "TSN Operating Margin %",
    "Margin Gap pp",
    "Volume Unit",
    "SFD Volume",
    "TSN Volume",
    "SFD Revenue / Unit",
    "TSN Revenue / Unit",
    "SFD Op / Unit",
    "TSN Op / Unit",
  ]];

  const rows = Array.from(grouped.entries()).sort((left, right) => {
    const [leftPeriod, leftSegment] = left[0].split(":");
    const [rightPeriod, rightSegment] = right[0].split(":");
    if (leftPeriod !== rightPeriod) return rightPeriod.localeCompare(leftPeriod);
    return leftSegment.localeCompare(rightSegment);
  });

  for (const [, pair] of rows) {
    const sample = pair.sfd ?? pair.tsn;
    if (!sample) continue;
    output.push([
      sample.quarterLabel,
      sample.periodEnd,
      sample.segmentName,
      pair.sfd?.revenue ?? "",
      pair.tsn?.revenue ?? "",
      pair.sfd?.revenue != null && pair.tsn?.revenue != null ? round(pair.sfd.revenue - pair.tsn.revenue, 4) : "",
      pair.sfd?.operatingIncome ?? "",
      pair.tsn?.operatingIncome ?? "",
      pair.sfd?.operatingIncome != null && pair.tsn?.operatingIncome != null
        ? round(pair.sfd.operatingIncome - pair.tsn.operatingIncome, 4)
        : "",
      pair.sfd?.operatingMargin ?? "",
      pair.tsn?.operatingMargin ?? "",
      pair.sfd?.operatingMargin != null && pair.tsn?.operatingMargin != null
        ? round(pair.sfd.operatingMargin - pair.tsn.operatingMargin, 2)
        : "",
      pair.sfd?.volumeUnitType ?? pair.tsn?.volumeUnitType ?? "",
      pair.sfd?.volumeUnits ?? "",
      pair.tsn?.volumeUnits ?? "",
      pair.sfd?.revenuePerUnit ?? "",
      pair.tsn?.revenuePerUnit ?? "",
      pair.sfd?.operatingIncomePerUnit ?? "",
      pair.tsn?.operatingIncomePerUnit ?? "",
    ]);
  }

  return output;
}

function buildSmithfieldTysonProcessedWorkbook(
  sourceFileName: string,
  primarySheet: string | null,
  companyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  sheetMatches: ExcelCompetitorSheetMatch[],
  companies: ExcelCompetitorCompanySummary[],
  warnings: string[],
): Uint8Array {
  return buildStandardizedProcessedWorkbook({
    workbookFamily: "smithfield_tyson_competitor_model",
    sourceFileName,
    primarySheet,
    quarterlyRows: companyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
  });
}

function preprocessSmithfieldTysonWorkbook(
  workbook: XLSX.WorkBook,
  sourceFileName: string,
): ExcelCompetitorPreprocessResult {
  const sheetLookup = buildSheetLookup(workbook);
  const rawSegmentRows: ExcelCompetitorSegmentRow[] = [];

  const matrixConfigs: Array<{ sheetName: string; config: Omit<MatrixSegmentExtractorConfig, "sheetName" | "priority"> }> = [
    {
      sheetName: "USFP_Query",
      config: {
        ticker: "SFD",
        companyName: "Smithfield",
        segmentName: "Fresh Pork",
        rawSegmentName: "FP_MGT / USFP",
        metricSpecs: [
          { field: "revenue", aliases: ["sales total"], divideBy: 1_000_000 },
          { field: "grossProfit", aliases: ["gr profit"], divideBy: 1_000_000 },
          { field: "sgaExpense", aliases: ["sga total"], divideBy: 1_000_000 },
          { field: "operatingIncome", aliases: ["seg prof"], divideBy: 1_000_000, basis: "reported" },
          { field: "volumeUnits", aliases: ["head harvest"], divideBy: 1_000_000, volumeUnitType: "head" },
        ],
      },
    },
    {
      sheetName: "USPM_Query",
      config: {
        ticker: "SFD",
        companyName: "Smithfield",
        segmentName: "Packaged Meats",
        rawSegmentName: "PM_MGT / USPM",
        metricSpecs: [
          { field: "revenue", aliases: ["sales total"], divideBy: 1_000_000 },
          { field: "grossProfit", aliases: ["gr profit"], divideBy: 1_000_000 },
          { field: "sgaExpense", aliases: ["sga total"], divideBy: 1_000_000 },
          { field: "operatingIncome", aliases: ["seg prof"], divideBy: 1_000_000, basis: "reported" },
          { field: "volumeUnits", aliases: ["tot lbs sold"], divideBy: 1_000_000, volumeUnitType: "lbs" },
        ],
      },
    },
    {
      sheetName: "USHP_Query",
      config: {
        ticker: "SFD",
        companyName: "Smithfield",
        segmentName: "Hog Production",
        rawSegmentName: "HOG_MGT / USHP",
        metricSpecs: [
          { field: "revenue", aliases: ["sales total"], divideBy: 1_000_000 },
          { field: "grossProfit", aliases: ["gr profit"], divideBy: 1_000_000 },
          { field: "sgaExpense", aliases: ["sga total"], divideBy: 1_000_000 },
          { field: "operatingIncome", aliases: ["seg prof"], divideBy: 1_000_000, basis: "reported" },
          { field: "volumeUnits", aliases: ["hd mrkt swine total"], divideBy: 1_000_000, volumeUnitType: "head" },
        ],
      },
    },
    {
      sheetName: "US Pork_Query",
      config: {
        ticker: "SFD",
        companyName: "Smithfield",
        segmentName: "Integrated Pork",
        rawSegmentName: "US_PORK",
        metricSpecs: [
          { field: "revenue", aliases: ["sales total"], divideBy: 1_000_000 },
          { field: "grossProfit", aliases: ["gr profit"], divideBy: 1_000_000 },
          { field: "sgaExpense", aliases: ["sga total"], divideBy: 1_000_000 },
          { field: "operatingIncome", aliases: ["seg prof"], divideBy: 1_000_000, basis: "reported" },
        ],
      },
    },
  ];

  for (const { sheetName, config } of matrixConfigs) {
    const entry = sheetLookup.get(normalizeSheetName(sheetName));
    if (!entry) continue;
    rawSegmentRows.push(
      ...extractMatrixSegmentRows(sheetRows(entry.sheet), {
        ...config,
        sheetName: entry.rawName,
        priority: sheetPriority(entry.rawName, config.segmentName),
      })
    );
  }

  const tsnInput = sheetLookup.get("tsn input");
  if (tsnInput) {
    rawSegmentRows.push(...extractTsnInputSegmentRows(sheetRows(tsnInput.sheet), tsnInput.rawName));
  }

  const tsnPl = sheetLookup.get("tsn pl");
  if (tsnPl) {
    rawSegmentRows.push(...extractTsnPlSegmentRows(sheetRows(tsnPl.sheet), tsnPl.rawName));
  }

  if (rawSegmentRows.length === 0) {
    throw new Error(
      "No supported Smithfield/Tyson competitor sheets were found. Expected TSN Input, USFP/USPM/USHP query sheets, or TSN PL."
    );
  }

  const dedupedSegmentRows = dedupeSegmentRows(rawSegmentRows);
  const segmentRows = dedupeSegmentRows([...dedupedSegmentRows, ...deriveIntegratedSegmentRows(dedupedSegmentRows)]);
  const quarterlyRows = buildCompanyQuarterRows(segmentRows);
  const companies = summarizeCompanies(quarterlyRows);
  const comparisonTickers = companies.map((company) => company.ticker);
  const sheetMatches = summarizeSheetMatchesFromSegmentRows(rawSegmentRows);
  const primarySheet = primarySheetFromRows(segmentRows);
  const warnings: string[] = [
    "Company-quarter rows represent the integrated pork comparison scope from the workbook, not consolidated enterprise filings.",
  ];

  const removedDuplicates = rawSegmentRows.length - dedupedSegmentRows.length;
  if (removedDuplicates > 0) {
    warnings.push(`Removed ${removedDuplicates} overlapping segment row(s) using sheet priority and metric coverage.`);
  }
  if (comparisonTickers.length < 2) {
    warnings.push("Fewer than two companies were detected, so competitor comparison output may be limited.");
  }
  if (sheetLookup.has("tsn historical")) {
    warnings.push("TSN Historical was skipped because its taxonomy does not map cleanly to Pork / Prepared Foods comparison rows.");
  }
  if (segmentRows.some((row) => row.revenue == null || row.operatingIncome == null)) {
    warnings.push("Some segment rows are missing revenue or operating income; those comparisons will show gaps.");
  }
  if (segmentRows.some((row) => row.segmentName === "Hog Production")) {
    warnings.push("Hog Production is included for SFD context, but it is not a clean 1:1 Tyson segment comparison.");
  }

  const virtualFilings = buildVirtualFilings(quarterlyRows, segmentRows, sourceFileName, "integrated pork");
  const processedWorkbookBytes = buildSmithfieldTysonProcessedWorkbook(
    sourceFileName,
    primarySheet,
    quarterlyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
  );

  return {
    workbookFamily: "smithfield_tyson_competitor_model",
    sourceFileName,
    primarySheet,
    comparisonTickers,
    quarterlyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
    processedWorkbookBytes,
    virtualFilings,
  };
}

function detectComparisonHeader(row: unknown[]): DetectedComparisonHeader | null {
  const normalized = row.map((cell) => normalizeCellText(cell));
  const companyCol = normalized.findIndex((cell) => cell === "company");
  if (companyCol === -1) return null;

  const revenueCol = normalized.findIndex((cell) => cell.includes("sales") || cell.includes("revenue"));
  const operatingIncomeCol = normalized.findIndex(
    (cell) =>
      cell.includes("seg prof") ||
      cell.includes("segment profit") ||
      cell.includes("op prof") ||
      cell.includes("operating income")
  );
  if (revenueCol === -1 || operatingIncomeCol === -1) return null;

  const periodCols: number[] = [];
  normalized.forEach((cell, index) => {
    if (cell.includes("period")) periodCols.push(index);
  });
  if (periodCols.length === 0) return null;

  const periodBeforeRevenue = periodCols.filter((index) => index < revenueCol);
  const alignedPeriodCol = periodBeforeRevenue.length > 0
    ? periodBeforeRevenue[periodBeforeRevenue.length - 1]
    : periodCols[periodCols.length - 1];
  const sourcePeriodCol = periodCols.length > 1 ? periodCols[0] : null;
  const volumeCol = normalized.findIndex((cell) => cell.includes("volume"));

  return {
    companyCol,
    sourcePeriodCol,
    alignedPeriodCol,
    revenueCol,
    operatingIncomeCol,
    volumeCol: volumeCol === -1 ? null : volumeCol,
  };
}

function findTableLabel(rows: unknown[][], headerRowIndex: number): string {
  for (let index = headerRowIndex - 1; index >= 0; index -= 1) {
    if (rowLooksBlank(rows[index] ?? [])) continue;
    const label = rowDisplayText(rows[index] ?? []);
    if (label) return label;
  }
  return "Workbook comparison table";
}

function extractRowsFromFlatSheet(rows: unknown[][], sheetName: string, fileName: string): ExcelCompetitorQuarterRow[] {
  const extracted: ExcelCompetitorQuarterRow[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const header = detectComparisonHeader(rows[rowIndex] ?? []);
    if (!header) continue;

    const tableLabel = findTableLabel(rows, rowIndex);
    const priority = sheetPriority(sheetName, tableLabel);
    let rowsAfterHeader = 0;

    for (let dataIndex = rowIndex + 1; dataIndex < rows.length; dataIndex += 1) {
      const row = rows[dataIndex] ?? [];
      if (detectComparisonHeader(row)) break;
      if (rowLooksBlank(row)) {
        if (rowsAfterHeader > 0) break;
        continue;
      }

      const companyLabel = String(row[header.companyCol] ?? "").trim();
      if (!companyLabel) continue;

      const alignedPeriodLabel = String(row[header.alignedPeriodCol] ?? "").trim();
      const sourcePeriodLabel = header.sourcePeriodCol == null
        ? alignedPeriodLabel
        : String(row[header.sourcePeriodCol] ?? "").trim();
      const parsedQuarter = parseQuarterLabel(alignedPeriodLabel) ?? parseQuarterLabel(sourcePeriodLabel);
      if (!parsedQuarter) continue;

      const revenue = parseNumericCell(row[header.revenueCol]);
      const operatingIncome = parseNumericCell(row[header.operatingIncomeCol]);
      if (revenue == null && operatingIncome == null) continue;

      const volume = header.volumeCol == null ? null : parseNumericCell(row[header.volumeCol]);
      const identity = buildWorkbookCompanyIdentity(companyLabel, fileName);

      extracted.push({
        ticker: identity.ticker,
        companyName: identity.companyName,
        quarterLabel: parsedQuarter.label,
        periodEnd: parsedQuarter.periodEnd,
        originalPeriodLabel: sourcePeriodLabel || parsedQuarter.label,
        alignedPeriodLabel: alignedPeriodLabel || parsedQuarter.label,
        revenue,
        grossProfit: null,
        sgaExpense: null,
        operatingIncome,
        operatingMargin: safePct(operatingIncome, revenue),
        volume,
        volumeUnitType: null,
        basis: "reported",
        sourceSheet: sheetName,
        sourceTableLabel: tableLabel,
        sourceRowNumber: dataIndex + 1,
        sourceSheetPriority: priority,
      });
      rowsAfterHeader += 1;
    }
  }

  return extracted;
}

function detectQuarterColumnsInRow(row: unknown[]): ParsedQuarterColumn[] {
  const quarters: ParsedQuarterColumn[] = [];

  row.forEach((cell, colIndex) => {
    const parsed = parseQuarterLabel(cell);
    if (!parsed) return;
    quarters.push({ ...parsed, colIndex });
  });

  return quarters;
}

function detectCompanyIdentityFromSectionRow(
  row: unknown[],
): { cellIndex: number; ticker: string; companyName: string } | null {
  for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
    const alias = detectWorkbookCompanyAlias(row[cellIndex]);
    if (!alias) continue;
    return {
      cellIndex,
      ticker: alias.ticker,
      companyName: alias.companyName,
    };
  }

  return null;
}

function detectCompanyAliasesInRow(
  row: unknown[],
): Array<{ colIndex: number; ticker: string; companyName: string }> {
  const matches: Array<{ colIndex: number; ticker: string; companyName: string }> = [];

  for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
    const alias = detectWorkbookCompanyAlias(row[colIndex]);
    if (!alias) continue;
    matches.push({
      colIndex,
      ticker: alias.ticker,
      companyName: alias.companyName,
    });
  }

  return matches;
}

function metricReplacementScore(basis: ExtractionBasis): number {
  if (basis === "adjusted") return 3;
  if (basis === "reported") return 2;
  return 1;
}

function extractRowsFromCompanyColumnMatrixSheet(
  rows: unknown[][],
  sheetName: string,
): ExcelCompetitorSegmentRow[] {
  const segmentMeta = detectGenericSegmentMeta(sheetName) ?? {
    segmentName: "Company Total",
    rawSegmentName: sheetName,
  };
  const priority = sheetPriority(sheetName, segmentMeta.segmentName);
  const extracted = new Map<
    string,
    {
      row: ExcelCompetitorSegmentRow;
      fieldBasis: Partial<Record<CompanyMetricField | "volumeUnits", ExtractionBasis>>;
    }
  >();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const quarterHeaders = detectQuarterColumnsInRow(rows[rowIndex] ?? []);
    if (quarterHeaders.length === 0) continue;

    let headerRowIndex = -1;
    let companyColumns: Array<{
      quarter: ParsedQuarterColumn;
      colIndex: number;
      ticker: string;
      companyName: string;
    }> = [];

    for (let lookahead = rowIndex; lookahead < Math.min(rows.length, rowIndex + 4); lookahead += 1) {
      const aliasCells = detectCompanyAliasesInRow(rows[lookahead] ?? []);
      if (aliasCells.length < 2) continue;

      const mapped: typeof companyColumns = [];
      for (let quarterIndex = 0; quarterIndex < quarterHeaders.length; quarterIndex += 1) {
        const quarter = quarterHeaders[quarterIndex];
        const nextQuarterCol = quarterHeaders[quarterIndex + 1]?.colIndex ?? Number.POSITIVE_INFINITY;
        for (const aliasCell of aliasCells) {
          if (aliasCell.colIndex < quarter.colIndex || aliasCell.colIndex >= nextQuarterCol) continue;
          mapped.push({
            quarter,
            colIndex: aliasCell.colIndex,
            ticker: aliasCell.ticker,
            companyName: aliasCell.companyName,
          });
        }
      }

      if (mapped.length < 2) continue;
      headerRowIndex = lookahead;
      companyColumns = mapped;
      break;
    }

    if (headerRowIndex === -1 || companyColumns.length === 0) continue;

    const minMappedCol = Math.min(...companyColumns.map((entry) => entry.colIndex));
    let blankStreak = 0;

    for (let dataRowIndex = headerRowIndex + 1; dataRowIndex < Math.min(rows.length, headerRowIndex + 36); dataRowIndex += 1) {
      const row = rows[dataRowIndex] ?? [];
      if (rowLooksBlank(row)) {
        blankStreak += 1;
        if (blankStreak >= 3) break;
        continue;
      }
      blankStreak = 0;

      const nestedQuarterHeaders = detectQuarterColumnsInRow(row);
      if (nestedQuarterHeaders.length > 0 && dataRowIndex > headerRowIndex + 1) {
        break;
      }

      const label = row
        .slice(0, Math.max(minMappedCol, 1))
        .map((cell) => String(cell ?? "").trim())
        .filter(Boolean)
        .join(" ");
      const metric = detectSectionMetricDescriptor(label);
      if (!metric) continue;

      for (const companyColumn of companyColumns) {
        const value = parseNumericCell(row[companyColumn.colIndex]);
        if (value == null) continue;

        const key = `${companyColumn.ticker}:${segmentMeta.segmentName}:${companyColumn.quarter.periodEnd}`;
        const current = extracted.get(key);
        const nextRow =
          current?.row ??
          createSegmentRow({
            ticker: companyColumn.ticker,
            companyName: companyColumn.companyName,
            segmentName: segmentMeta.segmentName,
            rawSegmentName: segmentMeta.rawSegmentName,
            quarter: companyColumn.quarter,
            revenue: null,
            grossProfit: null,
            sgaExpense: null,
            operatingIncome: null,
            operatingMargin: null,
            volumeUnits: null,
            volumeUnitType: metric.volumeUnitType,
            basis: metric.basis,
            sourceSheet: sheetName,
            sourceTableLabel: segmentMeta.segmentName,
            sourceRowNumber: dataRowIndex + 1,
            sourceSheetPriority: priority,
          });
        const fieldBasis = current?.fieldBasis ?? {};
        const existingBasis = fieldBasis[metric.field];
        const shouldReplace =
          nextRow[metric.field === "volumeUnits" ? "volumeUnits" : metric.field] == null ||
          existingBasis == null ||
          metricReplacementScore(metric.basis) >= metricReplacementScore(existingBasis);
        if (!shouldReplace) continue;

        if (metric.field === "revenue") nextRow.revenue = value;
        if (metric.field === "grossProfit") nextRow.grossProfit = value;
        if (metric.field === "sgaExpense") nextRow.sgaExpense = value;
        if (metric.field === "operatingIncome") nextRow.operatingIncome = value;
        if (metric.field === "operatingMargin") nextRow.operatingMargin = value;
        if (metric.field === "volumeUnits") {
          nextRow.volumeUnits = value;
          nextRow.volumeUnitType = metric.volumeUnitType;
        }

        fieldBasis[metric.field] = metric.basis;
        nextRow.basis =
          nextRow.basis === "adjusted" || metric.basis === "adjusted"
            ? "adjusted"
            : nextRow.basis === "reported" || metric.basis === "reported"
              ? "reported"
              : "derived";
        nextRow.sourceRowNumber = Math.min(nextRow.sourceRowNumber, dataRowIndex + 1);
        nextRow.operatingMargin = nextRow.operatingMargin ?? safePct(nextRow.operatingIncome, nextRow.revenue);
        nextRow.revenuePerUnit = safePerUnit(nextRow.revenue, nextRow.volumeUnits);
        nextRow.operatingIncomePerUnit = safePerUnit(nextRow.operatingIncome, nextRow.volumeUnits);
        extracted.set(key, { row: nextRow, fieldBasis });
      }
    }

    rowIndex = headerRowIndex;
  }

  return Array.from(extracted.values())
    .map((entry) => entry.row)
    .filter(
      (row) =>
        row.revenue != null ||
        row.grossProfit != null ||
        row.sgaExpense != null ||
        row.operatingIncome != null ||
        row.operatingMargin != null ||
        row.volumeUnits != null
    );
}

function extractRowsFromSectionedSheet(
  rows: unknown[][],
  sheetName: string,
): ExcelCompetitorSegmentRow[] {
  const extracted = new Map<string, ExcelCompetitorSegmentRow>();
  const fallbackSegment = detectGenericSegmentMeta(sheetName) ?? {
    segmentName: "Company Total",
    rawSegmentName: sheetName,
  };

  let currentSegment: DetectedSegmentMeta = fallbackSegment;
  let currentMetric: SectionMetricDescriptor | null = null;
  let activeCapture: SectionMetricCapture | null = null;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    if (rowLooksBlank(row)) continue;

    const rowLabel = rowDisplayText(row);
    const segmentFromRow =
      detectGenericSegmentMeta(row[0]) ??
      detectGenericSegmentMeta(row[1]) ??
      detectGenericSegmentMeta(rowLabel);
    const metricFromRow =
      detectSectionMetricDescriptor(row[0]) ??
      detectSectionMetricDescriptor(row[1]) ??
      detectSectionMetricDescriptor(rowLabel);
    const quarterColumns = detectQuarterColumnsInRow(row);
    const company = detectCompanyIdentityFromSectionRow(row);

    if (segmentFromRow && !company && quarterColumns.length < 2) {
      currentSegment = segmentFromRow;
      activeCapture = null;
      if (!metricFromRow) continue;
    }

    if (metricFromRow && !company) {
      currentMetric = metricFromRow;
      activeCapture = null;
    }

    if (quarterColumns.length >= 2 && currentMetric) {
      activeCapture = {
        segment: currentSegment,
        metric: currentMetric,
        quarters: quarterColumns,
      };
      continue;
    }

    if (!activeCapture || !company) continue;

    const values = activeCapture.quarters.map((quarter) => ({
      quarter,
      value: parseNumericCell(row[quarter.colIndex]),
    }));
    if (values.every((entry) => entry.value == null)) continue;

    for (const { quarter, value } of values) {
      if (value == null) continue;

      const key = `${company.ticker}:${activeCapture.segment.segmentName}:${quarter.periodEnd}`;
      const existing = extracted.get(key);
      const draft =
        existing ??
        createSegmentRow({
          ticker: company.ticker,
          companyName: company.companyName,
          segmentName: activeCapture.segment.segmentName,
          rawSegmentName: activeCapture.segment.rawSegmentName,
          quarter,
          revenue: null,
          grossProfit: null,
          sgaExpense: null,
          operatingIncome: null,
          operatingMargin: null,
          volumeUnits: null,
          volumeUnitType: activeCapture.metric.volumeUnitType,
          basis: activeCapture.metric.basis,
          sourceSheet: sheetName,
          sourceTableLabel: activeCapture.segment.segmentName,
          sourceRowNumber: rowIndex + 1,
          sourceSheetPriority: sheetPriority(sheetName, activeCapture.segment.segmentName),
        });

      if (activeCapture.metric.field === "revenue") draft.revenue = value;
      if (activeCapture.metric.field === "grossProfit") draft.grossProfit = value;
      if (activeCapture.metric.field === "sgaExpense") draft.sgaExpense = value;
      if (activeCapture.metric.field === "operatingIncome") draft.operatingIncome = value;
      if (activeCapture.metric.field === "operatingMargin") draft.operatingMargin = value;
      if (activeCapture.metric.field === "volumeUnits") {
        draft.volumeUnits = value;
        draft.volumeUnitType = activeCapture.metric.volumeUnitType;
      }

      draft.basis = draft.basis === "reported" || activeCapture.metric.basis === "reported"
        ? "reported"
        : activeCapture.metric.basis;
      draft.sourceRowNumber = Math.min(draft.sourceRowNumber, rowIndex + 1);
      draft.operatingMargin = draft.operatingMargin ?? safePct(draft.operatingIncome, draft.revenue);
      draft.revenuePerUnit = safePerUnit(draft.revenue, draft.volumeUnits);
      draft.operatingIncomePerUnit = safePerUnit(draft.operatingIncome, draft.volumeUnits);
      extracted.set(key, draft);
    }
  }

  return Array.from(extracted.values()).filter(
    (row) =>
      row.revenue != null ||
      row.grossProfit != null ||
      row.sgaExpense != null ||
      row.operatingIncome != null ||
      row.operatingMargin != null ||
      row.volumeUnits != null
  );
}

function dedupeQuarterRows(rows: ExcelCompetitorQuarterRow[]): ExcelCompetitorQuarterRow[] {
  const byKey = new Map<string, ExcelCompetitorQuarterRow>();

  const scoreRow = (row: ExcelCompetitorQuarterRow): number => {
    let score = row.sourceSheetPriority;
    if (row.revenue != null) score += 3;
    if (row.operatingIncome != null) score += 3;
    if (row.operatingMargin != null) score += 1;
    if (row.volume != null) score += 1;
    return score;
  };

  for (const row of rows) {
    const key = `${row.ticker}:${row.periodEnd}`;
    const current = byKey.get(key);
    if (!current || scoreRow(row) > scoreRow(current)) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
    return right.periodEnd.localeCompare(left.periodEnd);
  });
}

function summarizeSheetMatchesFromQuarterRows(rows: ExcelCompetitorQuarterRow[]): ExcelCompetitorSheetMatch[] {
  const map = new Map<string, ExcelCompetitorSheetMatch>();

  for (const row of rows) {
    const key = `${row.sourceSheet}:${row.sourceTableLabel}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        sheetName: row.sourceSheet,
        tableLabel: row.sourceTableLabel,
        rowCount: 1,
        priority: row.sourceSheetPriority,
      });
      continue;
    }

    current.rowCount += 1;
  }

  return Array.from(map.values()).sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return right.rowCount - left.rowCount;
  });
}

function growthPct(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return round(((current - prior) / Math.abs(prior)) * 100, 2);
}

function buildGrowthAnalysisLookup(rows: ExcelCompetitorQuarterRow[]): Map<string, GrowthAnalysisMetrics> {
  const byTicker = new Map<string, ExcelCompetitorQuarterRow[]>();
  const rowLookup = new Map<string, ExcelCompetitorQuarterRow>();

  for (const row of rows) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, []);
    byTicker.get(row.ticker)!.push(row);
    rowLookup.set(`${row.ticker}:${row.periodEnd}`, row);
  }

  const lookup = new Map<string, GrowthAnalysisMetrics>();
  for (const [ticker, tickerRows] of byTicker.entries()) {
    const ordered = [...tickerRows].sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));

    for (const row of ordered) {
      const qoqKey = priorQuarterPeriodEnd(row);
      const yoyKey = priorYearPeriodEnd(row.periodEnd);
      const qoqRow = qoqKey ? rowLookup.get(`${ticker}:${qoqKey}`) ?? null : null;
      const yoyRow = yoyKey ? rowLookup.get(`${ticker}:${yoyKey}`) ?? null : null;

      const validQoqPair =
        qoqRow != null &&
        !isFiscalYearLabel(row.quarterLabel) &&
        !isFiscalYearLabel(qoqRow.quarterLabel);
      const validYoyPair =
        yoyRow != null &&
        isFiscalYearLabel(row.quarterLabel) === isFiscalYearLabel(yoyRow.quarterLabel);

      lookup.set(`${ticker}:${row.periodEnd}`, {
        qoqRevenueGrowth: validQoqPair ? growthPct(row.revenue, qoqRow.revenue) : null,
        yoyRevenueGrowth: validYoyPair ? growthPct(row.revenue, yoyRow.revenue) : null,
        qoqOperatingIncomeGrowth: validQoqPair ? growthPct(row.operatingIncome, qoqRow.operatingIncome) : null,
        yoyOperatingIncomeGrowth: validYoyPair ? growthPct(row.operatingIncome, yoyRow.operatingIncome) : null,
        qoqMarginChange: validQoqPair ? marginChange(row.operatingMargin, qoqRow.operatingMargin) : null,
        yoyMarginChange: validYoyPair ? marginChange(row.operatingMargin, yoyRow.operatingMargin) : null,
        qoqBasePeriodEnd: validQoqPair ? qoqRow.periodEnd : null,
        yoyBasePeriodEnd: validYoyPair ? yoyRow.periodEnd : null,
      });
    }
  }

  return lookup;
}

function buildComparisonWorkbookRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
): ComparisonWorkbookRow[] {
  if (segmentRows.length > 0) {
    return segmentRows.map((row) => ({
      ticker: row.ticker,
      companyName: row.companyName,
      quarterLabel: row.quarterLabel,
      periodEnd: row.periodEnd,
      segmentName: row.segmentName,
      revenue: row.revenue,
      operatingIncome: row.operatingIncome,
      operatingMargin: row.operatingMargin,
      volume: row.volumeUnits,
      volumeUnitType: row.volumeUnitType,
      revenuePerUnit: row.revenuePerUnit,
      operatingIncomePerUnit: row.operatingIncomePerUnit,
    }));
  }

  return quarterlyRows.map((row) => ({
    ticker: row.ticker,
    companyName: row.companyName,
    quarterLabel: row.quarterLabel,
    periodEnd: row.periodEnd,
    segmentName: "Company Total",
    revenue: row.revenue,
    operatingIncome: row.operatingIncome,
    operatingMargin: row.operatingMargin,
    volume: row.volume,
    volumeUnitType: row.volumeUnitType,
    revenuePerUnit: safePerUnit(row.revenue, row.volume),
    operatingIncomePerUnit: safePerUnit(row.operatingIncome, row.volume),
  }));
}

function buildMetadataSheetRows(input: {
  workbookFamily: WorkbookFamily;
  sourceFileName: string;
  primarySheet: string | null;
  quarterlyRows: ExcelCompetitorQuarterRow[];
  segmentRows: ExcelCompetitorSegmentRow[];
  sheetMatches: ExcelCompetitorSheetMatch[];
  companies: ExcelCompetitorCompanySummary[];
  warnings: string[];
}): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ["Competitor Workbook Metadata", ""],
    ["Workbook family", input.workbookFamily],
    ["Source workbook", input.sourceFileName],
    ["Processed at", new Date().toISOString()],
    ["Primary sheet", input.primarySheet ?? "N/A"],
    ["Detected companies", input.companies.map((company) => company.ticker).join(", ") || "None"],
    ["Company quarter rows", input.quarterlyRows.length],
    ["Segment rows", input.segmentRows.length],
    [],
    ["Used sheets", ""],
    ["Sheet", "Table", "Rows", "Priority"],
    ...input.sheetMatches.map((match) => [match.sheetName, match.tableLabel, match.rowCount, match.priority]),
  ];

  if (input.warnings.length > 0) {
    rows.push([]);
    rows.push(["Warnings", ""]);
    input.warnings.forEach((warning) => rows.push([warning, ""]));
  }

  return rows;
}

function buildCompanySummarySheetRows(
  companies: ExcelCompetitorCompanySummary[],
  quarterlyRows: ExcelCompetitorQuarterRow[],
  growthLookup: Map<string, GrowthAnalysisMetrics>,
): Array<Array<string | number>> {
  const latestRowByTicker = new Map<string, ExcelCompetitorQuarterRow>();
  for (const row of quarterlyRows) {
    const current = latestRowByTicker.get(row.ticker);
    if (!current || row.periodEnd > current.periodEnd) {
      latestRowByTicker.set(row.ticker, row);
    }
  }

  return [
    ["Metric", ...companies.map((company) => company.ticker)],
    ["Company", ...companies.map((company) => company.companyName)],
    ["Latest Quarter", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.quarterLabel ?? "")],
    ["Period End", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.periodEnd ?? "")],
    ["Revenue", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.revenue ?? "")],
    ["Operating Income", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.operatingIncome ?? "")],
    ["Margin", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.operatingMargin ?? "")],
    ["Volume", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.volume ?? "")],
    ["Volume Unit", ...companies.map((company) => normalizedVolumeUnitLabel(latestRowByTicker.get(company.ticker)?.volumeUnitType ?? null))],
    [
      "QoQ Revenue Growth %",
      ...companies.map((company) => {
        const row = latestRowByTicker.get(company.ticker);
        return row ? growthLookup.get(`${company.ticker}:${row.periodEnd}`)?.qoqRevenueGrowth ?? "" : "";
      }),
    ],
    [
      "YoY Revenue Growth %",
      ...companies.map((company) => {
        const row = latestRowByTicker.get(company.ticker);
        return row ? growthLookup.get(`${company.ticker}:${row.periodEnd}`)?.yoyRevenueGrowth ?? "" : "";
      }),
    ],
    [
      "QoQ Margin Change pp",
      ...companies.map((company) => {
        const row = latestRowByTicker.get(company.ticker);
        return row ? growthLookup.get(`${company.ticker}:${row.periodEnd}`)?.qoqMarginChange ?? "" : "";
      }),
    ],
    ["Basis", ...companies.map((company) => latestRowByTicker.get(company.ticker)?.basis ?? "")],
  ];
}

function buildCompanyQuarterlyDataSheetRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
): Array<Array<string | number>> {
  return [
    [
      "Ticker",
      "Company",
      "Quarter",
      "Period End",
      "Original Period",
      "Aligned Period",
      "Revenue",
      "Gross Profit",
      "SG&A",
      "Operating Income",
      "Operating Margin %",
      "Volume",
      "Volume Unit",
      "Basis",
      "Source Sheet",
      "Source Table",
      "Source Row",
    ],
    ...[...quarterlyRows]
      .sort((left, right) => {
        if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
        return right.periodEnd.localeCompare(left.periodEnd);
      })
      .map((row) => [
        row.ticker,
        row.companyName,
        row.quarterLabel,
        row.periodEnd,
        row.originalPeriodLabel,
        row.alignedPeriodLabel,
        row.revenue ?? "",
        row.grossProfit ?? "",
        row.sgaExpense ?? "",
        row.operatingIncome ?? "",
        row.operatingMargin ?? "",
        row.volume ?? "",
        normalizedVolumeUnitLabel(row.volumeUnitType),
        row.basis,
        row.sourceSheet,
        row.sourceTableLabel,
        row.sourceRowNumber,
      ]),
  ];
}

function buildSegmentDataSheetRows(segmentRows: ExcelCompetitorSegmentRow[]): Array<Array<string | number>> {
  return [
    [
      "Ticker",
      "Company",
      "Segment",
      "Raw Segment",
      "Quarter",
      "Period End",
      "Original Period",
      "Aligned Period",
      "Revenue",
      "Gross Profit",
      "SG&A",
      "Operating Income",
      "Operating Margin %",
      "Volume",
      "Volume Unit",
      "Revenue / Unit",
      "Op / Unit",
      "Basis",
      "Source Sheet",
      "Source Table",
      "Source Row",
    ],
    ...[...segmentRows]
      .sort((left, right) => {
        if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
        if (left.periodEnd !== right.periodEnd) return right.periodEnd.localeCompare(left.periodEnd);
        return left.segmentName.localeCompare(right.segmentName);
      })
      .map((row) => [
        row.ticker,
        row.companyName,
        row.segmentName,
        row.rawSegmentName,
        row.quarterLabel,
        row.periodEnd,
        row.originalPeriodLabel,
        row.alignedPeriodLabel,
        row.revenue ?? "",
        row.grossProfit ?? "",
        row.sgaExpense ?? "",
        row.operatingIncome ?? "",
        row.operatingMargin ?? "",
        row.volumeUnits ?? "",
        normalizedVolumeUnitLabel(row.volumeUnitType),
        row.revenuePerUnit ?? "",
        row.operatingIncomePerUnit ?? "",
        row.basis,
        row.sourceSheet,
        row.sourceTableLabel,
        row.sourceRowNumber,
      ]),
  ];
}

function buildStandardizedCompetitorComparisonSheetRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  companies: ExcelCompetitorCompanySummary[],
): Array<Array<string | number>> {
  const companyTickers = companies.map((company) => company.ticker);
  const baseRows = buildComparisonWorkbookRows(quarterlyRows, segmentRows);
  const grouped = new Map<
    string,
    Map<string, ComparisonWorkbookRow>
  >();

  for (const row of baseRows) {
    const key = `${row.periodEnd}:${row.segmentName}`;
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key)!.set(row.ticker, row);
  }

  const firstTicker = companyTickers[0] ?? null;
  const secondTicker = companyTickers[1] ?? null;

  return [
    [
      "Quarter",
      "Period End",
      "Segment",
      ...companyTickers.flatMap((ticker) => [
        `${ticker} Revenue`,
        `${ticker} Operating Income`,
        `${ticker} Operating Margin %`,
        `${ticker} Volume`,
        `${ticker} Volume Unit`,
        `${ticker} Revenue / Unit`,
        `${ticker} Op / Unit`,
      ]),
      ...(firstTicker && secondTicker
        ? [
            `${firstTicker} vs ${secondTicker} Revenue Gap`,
            `${firstTicker} vs ${secondTicker} Revenue Gap %`,
            `${firstTicker} vs ${secondTicker} Op Income Gap`,
            `${firstTicker} vs ${secondTicker} Margin Gap pp`,
            `${firstTicker} vs ${secondTicker} Margin Gap %`,
          ]
        : []),
    ],
    ...Array.from(grouped.entries())
      .sort((left, right) => {
        const [leftPeriod, leftSegment] = left[0].split(":");
        const [rightPeriod, rightSegment] = right[0].split(":");
        if (leftPeriod !== rightPeriod) return rightPeriod.localeCompare(leftPeriod);
        return leftSegment.localeCompare(rightSegment);
      })
      .map(([key, byTicker]) => {
        const [periodEnd, segmentName] = key.split(":");
        const quarterLabel =
          byTicker.get(companyTickers[0] ?? "")?.quarterLabel ??
          Array.from(byTicker.values())[0]?.quarterLabel ??
          periodEnd;
        const firstCompany = firstTicker ? byTicker.get(firstTicker) ?? null : null;
        const secondCompany = secondTicker ? byTicker.get(secondTicker) ?? null : null;

        return [
          quarterLabel,
          periodEnd,
          segmentName,
          ...companyTickers.flatMap((ticker) => {
            const row = byTicker.get(ticker);
            return [
              row?.revenue ?? "",
              row?.operatingIncome ?? "",
              row?.operatingMargin ?? "",
              row?.volume ?? "",
              normalizedVolumeUnitLabel(row?.volumeUnitType ?? null),
              row?.revenuePerUnit ?? "",
              row?.operatingIncomePerUnit ?? "",
            ];
          }),
          ...(firstCompany && secondCompany
            ? [
                firstCompany.revenue != null && secondCompany.revenue != null
                  ? round(firstCompany.revenue - secondCompany.revenue, 4)
                  : "",
                diffPct(firstCompany.revenue, secondCompany.revenue) ?? "",
                firstCompany.operatingIncome != null && secondCompany.operatingIncome != null
                  ? round(firstCompany.operatingIncome - secondCompany.operatingIncome, 4)
                  : "",
                firstCompany.operatingMargin != null && secondCompany.operatingMargin != null
                  ? round(firstCompany.operatingMargin - secondCompany.operatingMargin, 2)
                  : "",
                diffPct(firstCompany.operatingMargin, secondCompany.operatingMargin) ?? "",
              ]
            : []),
        ];
      }),
  ];
}

function buildGrowthAnalysisSheetRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
  growthLookup: Map<string, GrowthAnalysisMetrics>,
): Array<Array<string | number>> {
  return [
    [
      "Ticker",
      "Company",
      "Quarter",
      "Period End",
      "Revenue",
      "QoQ Revenue Growth %",
      "YoY Revenue Growth %",
      "Operating Income",
      "QoQ Op Income Growth %",
      "YoY Op Income Growth %",
      "Operating Margin %",
      "QoQ Margin Change pp",
      "YoY Margin Change pp",
      "QoQ Base Period",
      "YoY Base Period",
    ],
    ...[...quarterlyRows]
      .sort((left, right) => {
        if (left.ticker !== right.ticker) return left.ticker.localeCompare(right.ticker);
        return right.periodEnd.localeCompare(left.periodEnd);
      })
      .map((row) => {
        const growth = growthLookup.get(`${row.ticker}:${row.periodEnd}`);
        return [
          row.ticker,
          row.companyName,
          row.quarterLabel,
          row.periodEnd,
          row.revenue ?? "",
          growth?.qoqRevenueGrowth ?? "",
          growth?.yoyRevenueGrowth ?? "",
          row.operatingIncome ?? "",
          growth?.qoqOperatingIncomeGrowth ?? "",
          growth?.yoyOperatingIncomeGrowth ?? "",
          row.operatingMargin ?? "",
          growth?.qoqMarginChange ?? "",
          growth?.yoyMarginChange ?? "",
          growth?.qoqBasePeriodEnd ?? "",
          growth?.yoyBasePeriodEnd ?? "",
        ];
      }),
  ];
}

function buildAiInsightsSheetRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  companies: ExcelCompetitorCompanySummary[],
  growthLookup: Map<string, GrowthAnalysisMetrics>,
): Array<Array<string | number>> {
  const insights: WorkbookInsightRow[] = [];
  const quarterLookup = new Map(quarterlyRows.map((row) => [`${row.ticker}:${row.periodEnd}`, row]));
  const companyTickers = companies.map((company) => company.ticker);

  for (const row of quarterlyRows) {
    const growth = growthLookup.get(`${row.ticker}:${row.periodEnd}`);
    if (!growth) continue;

    if (growth.qoqRevenueGrowth != null && Math.abs(growth.qoqRevenueGrowth) >= 2) {
      insights.push({
        priority: 70 + Math.abs(growth.qoqRevenueGrowth),
        category: "Growth",
        ticker: row.ticker,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        insight: `${row.ticker} revenue ${growth.qoqRevenueGrowth >= 0 ? "increased" : "declined"} ${Math.abs(growth.qoqRevenueGrowth).toFixed(2)}% QoQ in ${row.quarterLabel}.`,
        support: `Revenue ${row.revenue ?? "n/a"} vs ${growth.qoqBasePeriodEnd ?? "prior quarter"}.`,
      });
    }

    if (growth.yoyRevenueGrowth != null && Math.abs(growth.yoyRevenueGrowth) >= 2) {
      insights.push({
        priority: 75 + Math.abs(growth.yoyRevenueGrowth),
        category: "Growth",
        ticker: row.ticker,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        insight: `${row.ticker} revenue ${growth.yoyRevenueGrowth >= 0 ? "increased" : "declined"} ${Math.abs(growth.yoyRevenueGrowth).toFixed(2)}% YoY in ${row.quarterLabel}.`,
        support: `Revenue ${row.revenue ?? "n/a"} vs ${growth.yoyBasePeriodEnd ?? "prior year"}.`,
      });
    }

    if (growth.qoqMarginChange != null && Math.abs(growth.qoqMarginChange) >= 0.5) {
      insights.push({
        priority: 90 + Math.abs(growth.qoqMarginChange) * 5,
        category: "Margin",
        ticker: row.ticker,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        insight: `${row.ticker} margin ${growth.qoqMarginChange >= 0 ? "increased" : "decreased"} ${Math.abs(growth.qoqMarginChange).toFixed(2)} pp QoQ in ${row.quarterLabel}.`,
        support: `Operating margin ${row.operatingMargin ?? "n/a"}% vs ${growth.qoqBasePeriodEnd ?? "prior quarter"}.`,
      });
    }
  }

  const firstTicker = companyTickers[0] ?? null;
  const secondTicker = companyTickers[1] ?? null;
  if (firstTicker && secondTicker) {
    const commonPeriods = [...new Set(quarterlyRows.map((row) => row.periodEnd))]
      .filter((periodEnd) => quarterLookup.has(`${firstTicker}:${periodEnd}`) && quarterLookup.has(`${secondTicker}:${periodEnd}`))
      .sort((left, right) => right.localeCompare(left));
    const latestCommonPeriod = commonPeriods[0] ?? null;

    if (latestCommonPeriod) {
      const firstRow = quarterLookup.get(`${firstTicker}:${latestCommonPeriod}`)!;
      const secondRow = quarterLookup.get(`${secondTicker}:${latestCommonPeriod}`)!;
      const revenueDiffPct = diffPct(firstRow.revenue, secondRow.revenue);
      const marginDiffPct = diffPct(firstRow.operatingMargin, secondRow.operatingMargin);

      if (revenueDiffPct != null) {
        const leader = revenueDiffPct >= 0 ? firstRow : secondRow;
        const laggard = revenueDiffPct >= 0 ? secondRow : firstRow;
        insights.push({
          priority: 100 + Math.abs(revenueDiffPct),
          category: "Peer Comparison",
          ticker: leader.ticker,
          quarterLabel: leader.quarterLabel,
          periodEnd: leader.periodEnd,
          segmentName: "Company Total",
          insight: `${leader.ticker} revenue leads ${laggard.ticker} by ${Math.abs(revenueDiffPct).toFixed(2)}% in ${leader.quarterLabel}.`,
          support: `${leader.ticker}: ${leader.revenue ?? "n/a"} vs ${laggard.ticker}: ${laggard.revenue ?? "n/a"}.`,
        });
      }

      if (marginDiffPct != null) {
        const leader = marginDiffPct >= 0 ? firstRow : secondRow;
        const laggard = marginDiffPct >= 0 ? secondRow : firstRow;
        insights.push({
          priority: 95 + Math.abs(marginDiffPct),
          category: "Peer Comparison",
          ticker: leader.ticker,
          quarterLabel: leader.quarterLabel,
          periodEnd: leader.periodEnd,
          segmentName: "Company Total",
          insight: `${leader.ticker} margin is ${Math.abs((leader.operatingMargin ?? 0) - (laggard.operatingMargin ?? 0)).toFixed(2)} pp above ${laggard.ticker} in ${leader.quarterLabel}.`,
          support: `${leader.ticker}: ${leader.operatingMargin ?? "n/a"}% vs ${laggard.ticker}: ${laggard.operatingMargin ?? "n/a"}%.`,
        });
      }
    }

    const segmentComparisonRows = buildComparisonWorkbookRows(quarterlyRows, segmentRows)
      .filter((row) => row.ticker === firstTicker || row.ticker === secondTicker);
    const segmentGroups = new Map<string, { first?: ComparisonWorkbookRow; second?: ComparisonWorkbookRow }>();

    for (const row of segmentComparisonRows) {
      const key = `${row.periodEnd}:${row.segmentName}`;
      const current = segmentGroups.get(key) ?? {};
      if (row.ticker === firstTicker) current.first = row;
      if (row.ticker === secondTicker) current.second = row;
      segmentGroups.set(key, current);
    }

    const widestMarginGap = Array.from(segmentGroups.values())
      .filter((group): group is { first: ComparisonWorkbookRow; second: ComparisonWorkbookRow } => !!group.first && !!group.second)
      .filter((group) => group.first.segmentName !== "Company Total")
      .sort((left, right) => {
        const leftGap = Math.abs((left.first.operatingMargin ?? 0) - (left.second.operatingMargin ?? 0));
        const rightGap = Math.abs((right.first.operatingMargin ?? 0) - (right.second.operatingMargin ?? 0));
        if (right.first.periodEnd !== left.first.periodEnd) return right.first.periodEnd.localeCompare(left.first.periodEnd);
        return rightGap - leftGap;
      })[0];

    if (widestMarginGap?.first && widestMarginGap.second) {
      const leader =
        (widestMarginGap.first.operatingMargin ?? Number.NEGATIVE_INFINITY) >=
        (widestMarginGap.second.operatingMargin ?? Number.NEGATIVE_INFINITY)
          ? widestMarginGap.first
          : widestMarginGap.second;
      const laggard = leader.ticker === widestMarginGap.first.ticker ? widestMarginGap.second : widestMarginGap.first;
      insights.push({
        priority: 85 + Math.abs((leader.operatingMargin ?? 0) - (laggard.operatingMargin ?? 0)),
        category: "Segment",
        ticker: leader.ticker,
        quarterLabel: leader.quarterLabel,
        periodEnd: leader.periodEnd,
        segmentName: leader.segmentName,
        insight: `${leader.ticker} holds a ${Math.abs((leader.operatingMargin ?? 0) - (laggard.operatingMargin ?? 0)).toFixed(2)} pp margin advantage in ${leader.segmentName} for ${leader.quarterLabel}.`,
        support: `${leader.ticker}: ${leader.operatingMargin ?? "n/a"}% vs ${laggard.ticker}: ${laggard.operatingMargin ?? "n/a"}%.`,
      });
    }
  }

  const deduped = Array.from(
    new Map(
      insights
        .sort((left, right) => right.priority - left.priority)
        .map((insight) => [`${insight.category}:${insight.insight}`, insight]),
    ).values(),
  ).slice(0, 12);

  return [
    ["Priority", "Category", "Ticker", "Quarter", "Period End", "Segment", "Insight", "Support"],
    ...(deduped.length > 0
      ? deduped.map((insight) => [
          round(insight.priority, 2),
          insight.category,
          insight.ticker,
          insight.quarterLabel,
          insight.periodEnd,
          insight.segmentName,
          insight.insight,
          insight.support,
        ])
      : [[0, "Info", "", "", "", "", "No rule-based insights were generated from the extracted workbook rows.", ""]]),
  ];
}

function buildDataQualitySheetRows(
  quarterlyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  companies: ExcelCompetitorCompanySummary[],
  warnings: string[],
): Array<Array<string | number>> {
  const issues: DataQualityIssue[] = [];
  const companyTickers = companies.map((company) => company.ticker);

  const pushIssue = (issue: DataQualityIssue) => {
    issues.push(issue);
  };

  warnings.forEach((warning) =>
    pushIssue({
      severity: "warning",
      scope: "Workbook",
      ticker: "",
      companyName: "",
      quarterLabel: "",
      periodEnd: "",
      segmentName: "",
      issue: "Preprocess warning",
      details: warning,
      sourceSheet: "",
    }),
  );

  const collectNonFiniteFields = (entries: Array<[string, number | null]>): string[] =>
    entries
      .filter(([, value]) => value != null && !Number.isFinite(value))
      .map(([field]) => field);

  for (const row of quarterlyRows) {
    const missingFields = [
      row.revenue == null ? "Revenue" : null,
      row.operatingIncome == null ? "Operating Income" : null,
      row.operatingMargin == null ? "Operating Margin" : null,
    ].filter((field): field is string => field != null);

    if (missingFields.length > 0) {
      pushIssue({
        severity: missingFields.length >= 2 ? "warning" : "info",
        scope: "Company",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        issue: "Incomplete company quarter row",
        details: `Missing ${missingFields.join(", ")}.`,
        sourceSheet: row.sourceSheet,
      });
    }

    const nonFiniteFields = collectNonFiniteFields([
      ["Revenue", row.revenue],
      ["Gross Profit", row.grossProfit],
      ["SG&A", row.sgaExpense],
      ["Operating Income", row.operatingIncome],
      ["Operating Margin", row.operatingMargin],
      ["Volume", row.volume],
    ]);
    if (nonFiniteFields.length > 0) {
      pushIssue({
        severity: "error",
        scope: "Company",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        issue: "Non-finite numeric values",
        details: nonFiniteFields.join(", "),
        sourceSheet: row.sourceSheet,
      });
    }

    if (row.volume != null && !row.volumeUnitType) {
      pushIssue({
        severity: "info",
        scope: "Company",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: "Company Total",
        issue: "Missing normalized volume unit",
        details: "Volume value exists but no canonical unit label was detected.",
        sourceSheet: row.sourceSheet,
      });
    }
  }

  for (const row of segmentRows) {
    const missingFields = [
      row.revenue == null ? "Revenue" : null,
      row.operatingIncome == null ? "Operating Income" : null,
      row.operatingMargin == null ? "Operating Margin" : null,
    ].filter((field): field is string => field != null);

    if (missingFields.length > 0) {
      pushIssue({
        severity: missingFields.length >= 2 ? "warning" : "info",
        scope: "Segment",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: row.segmentName,
        issue: "Incomplete segment row",
        details: `Missing ${missingFields.join(", ")}.`,
        sourceSheet: row.sourceSheet,
      });
    }

    const nonFiniteFields = collectNonFiniteFields([
      ["Revenue", row.revenue],
      ["Gross Profit", row.grossProfit],
      ["SG&A", row.sgaExpense],
      ["Operating Income", row.operatingIncome],
      ["Operating Margin", row.operatingMargin],
      ["Volume", row.volumeUnits],
      ["Revenue / Unit", row.revenuePerUnit],
      ["Op / Unit", row.operatingIncomePerUnit],
    ]);
    if (nonFiniteFields.length > 0) {
      pushIssue({
        severity: "error",
        scope: "Segment",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: row.segmentName,
        issue: "Non-finite numeric values",
        details: nonFiniteFields.join(", "),
        sourceSheet: row.sourceSheet,
      });
    }

    if (row.volumeUnits != null && !row.volumeUnitType) {
      pushIssue({
        severity: "info",
        scope: "Segment",
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        segmentName: row.segmentName,
        issue: "Missing normalized volume unit",
        details: "Segment volume exists but no canonical unit label was detected.",
        sourceSheet: row.sourceSheet,
      });
    }
  }

  const unitGroups = new Map<string, { ticker: string; companyName: string; quarterLabel: string; periodEnd: string; units: Set<string>; sheets: Set<string> }>();
  for (const row of segmentRows) {
    const key = `${row.ticker}:${row.periodEnd}`;
    const current =
      unitGroups.get(key) ??
      {
        ticker: row.ticker,
        companyName: row.companyName,
        quarterLabel: row.quarterLabel,
        periodEnd: row.periodEnd,
        units: new Set<string>(),
        sheets: new Set<string>(),
      };
    if (row.volumeUnitType) current.units.add(normalizedVolumeUnitLabel(row.volumeUnitType));
    current.sheets.add(row.sourceSheet);
    unitGroups.set(key, current);
  }

  for (const group of unitGroups.values()) {
    if (group.units.size > 1) {
      pushIssue({
        severity: "warning",
        scope: "Company",
        ticker: group.ticker,
        companyName: group.companyName,
        quarterLabel: group.quarterLabel,
        periodEnd: group.periodEnd,
        segmentName: "Mixed Units",
        issue: "Multiple normalized volume units in the same company period",
        details: Array.from(group.units).join(", "),
        sourceSheet: Array.from(group.sheets).join("; "),
      });
    }
  }

  const comparisonRows = buildComparisonWorkbookRows(quarterlyRows, segmentRows);
  const comparisonGroups = new Map<string, Set<string>>();
  for (const row of comparisonRows) {
    const key = `${row.periodEnd}:${row.segmentName}`;
    if (!comparisonGroups.has(key)) comparisonGroups.set(key, new Set());
    comparisonGroups.get(key)!.add(row.ticker);
  }

  for (const [key, presentTickers] of comparisonGroups.entries()) {
    if (presentTickers.size === 0 || presentTickers.size >= companyTickers.length) continue;
    const [periodEnd, segmentName] = key.split(":");
    const missingTickers = companyTickers.filter((ticker) => !presentTickers.has(ticker));
    pushIssue({
      severity: "info",
      scope: "Comparison",
      ticker: "",
      companyName: "",
      quarterLabel: "",
      periodEnd,
      segmentName,
      issue: "Incomplete comparison set",
      details: `Missing ${missingTickers.join(", ")}.`,
      sourceSheet: "",
    });
  }

  return [
    ["Metric", "Value"],
    ["Total issues", issues.length],
    ["Warnings", issues.filter((issue) => issue.severity === "warning").length],
    ["Errors", issues.filter((issue) => issue.severity === "error").length],
    ["Infos", issues.filter((issue) => issue.severity === "info").length],
    [],
    ["Severity", "Scope", "Ticker", "Company", "Quarter", "Period End", "Segment", "Issue", "Details", "Source Sheet"],
    ...issues.map((issue) => [
      issue.severity,
      issue.scope,
      issue.ticker,
      issue.companyName,
      issue.quarterLabel,
      issue.periodEnd,
      issue.segmentName,
      issue.issue,
      issue.details,
      issue.sourceSheet,
    ]),
  ];
}

function buildStandardizedProcessedWorkbook(input: {
  workbookFamily: WorkbookFamily;
  sourceFileName: string;
  primarySheet: string | null;
  quarterlyRows: ExcelCompetitorQuarterRow[];
  segmentRows: ExcelCompetitorSegmentRow[];
  sheetMatches: ExcelCompetitorSheetMatch[];
  companies: ExcelCompetitorCompanySummary[];
  warnings: string[];
}): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const growthLookup = buildGrowthAnalysisLookup(input.quarterlyRows);

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildMetadataSheetRows(input)), "Metadata");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildCompanySummarySheetRows(input.companies, input.quarterlyRows, growthLookup)),
    "Company_Summary",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildCompanyQuarterlyDataSheetRows(input.quarterlyRows)),
    "Company_Quarterly_Data",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildSegmentDataSheetRows(input.segmentRows)),
    "Segment_Data",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(
      buildStandardizedCompetitorComparisonSheetRows(input.quarterlyRows, input.segmentRows, input.companies),
    ),
    "Competitor_Comparison",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildGrowthAnalysisSheetRows(input.quarterlyRows, growthLookup)),
    "Growth_Analysis",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildAiInsightsSheetRows(input.quarterlyRows, input.segmentRows, input.companies, growthLookup)),
    "AI_Insights",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(buildDataQualitySheetRows(input.quarterlyRows, input.segmentRows, input.companies, input.warnings)),
    "Data_Quality",
  );

  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(bytes);
}

function buildGenericProcessedWorkbook(
  sourceFileName: string,
  primarySheet: string | null,
  quarterlyRows: ExcelCompetitorQuarterRow[],
  segmentRows: ExcelCompetitorSegmentRow[],
  sheetMatches: ExcelCompetitorSheetMatch[],
  companies: ExcelCompetitorCompanySummary[],
  warnings: string[],
): Uint8Array {
  return buildStandardizedProcessedWorkbook({
    workbookFamily: "generic_flat_table",
    sourceFileName,
    primarySheet,
    quarterlyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
  });
}

function preprocessGenericWorkbook(
  workbook: XLSX.WorkBook,
  sourceFileName: string,
): ExcelCompetitorPreprocessResult {
  const extractedRows: ExcelCompetitorQuarterRow[] = [];
  const extractedSegmentRows: ExcelCompetitorSegmentRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (/pb_cache/i.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = sheetRows(sheet);
    extractedRows.push(...extractRowsFromFlatSheet(rows, sheetName, sourceFileName));
    extractedSegmentRows.push(...extractRowsFromCompanyColumnMatrixSheet(rows, sheetName));
    extractedSegmentRows.push(...extractRowsFromSectionedSheet(rows, sheetName));
  }

  if (extractedRows.length === 0 && extractedSegmentRows.length === 0) {
    throw new Error(
      "No supported competitor sections were found. Expected either flat Company/Period/Sales tables or sectioned sheets with segment, metric, and quarter blocks."
    );
  }

  const dedupedFlatRows = dedupeQuarterRows(extractedRows);
  const dedupedSectionRows = dedupeSegmentRows(extractedSegmentRows);
  const sectionedCompanyRows = buildGenericCompanyRowsFromSegmentRows(dedupedSectionRows);
  const quarterlyRows = dedupeQuarterRows([...dedupedFlatRows, ...sectionedCompanyRows.rows]);
  const segmentRows = dedupedSectionRows;
  const companies = summarizeCompanies(quarterlyRows);
  const comparisonTickers = companies.map((company) => company.ticker);
  const sheetMatches = mergeSheetMatches(
    summarizeSheetMatchesFromQuarterRows(extractedRows),
    summarizeSheetMatchesFromSegmentRows(extractedSegmentRows),
  );
  const primarySheet = primarySheetFromRows(segmentRows.length > 0 ? segmentRows : quarterlyRows);
  const warnings: string[] = [];

  const duplicateCount = extractedRows.length - dedupedFlatRows.length;
  if (duplicateCount > 0) {
    warnings.push(`Removed ${duplicateCount} duplicate quarter row(s) using sheet priority and field coverage.`);
  }
  const sectionDuplicateCount = extractedSegmentRows.length - dedupedSectionRows.length;
  if (sectionDuplicateCount > 0) {
    warnings.push(`Removed ${sectionDuplicateCount} overlapping section row(s) using sheet priority and metric coverage.`);
  }
  if (sectionedCompanyRows.aggregatedPeriods.length > 0) {
    warnings.push(
      `Built ${sectionedCompanyRows.aggregatedPeriods.length} company-period row(s) by summing detected segment blocks because no company-total row was available.`
    );
  }
  const mergedCompanyOverlapCount = dedupedFlatRows.length + sectionedCompanyRows.rows.length - quarterlyRows.length;
  if (mergedCompanyOverlapCount > 0) {
    warnings.push(
      `Merged ${mergedCompanyOverlapCount} overlapping company-period row(s) across flat-table and sectioned-sheet detection.`
    );
  }
  if (comparisonTickers.length < 2) {
    warnings.push("Fewer than two companies were detected, so comparison output may be limited.");
  }
  if (quarterlyRows.some((row) => row.revenue == null || row.operatingIncome == null)) {
    warnings.push("Some quarter rows are missing revenue or operating income; those comparisons will show gaps.");
  }
  if (segmentRows.length === 0) {
    warnings.push("Segment-level sections were not detected, so Segment_Comparison is based on company-level rows only.");
  }

  const virtualFilings = buildVirtualFilings(quarterlyRows, segmentRows, sourceFileName, null);
  const processedWorkbookBytes = buildGenericProcessedWorkbook(
    sourceFileName,
    primarySheet,
    quarterlyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
  );

  return {
    workbookFamily: "generic_flat_table",
    sourceFileName,
    primarySheet,
    comparisonTickers,
    quarterlyRows,
    segmentRows,
    sheetMatches,
    companies,
    warnings,
    processedWorkbookBytes,
    virtualFilings,
  };
}

export function preprocessCompetitorWorkbookFromArrayBuffer(
  buffer: ArrayBuffer,
  sourceFileName: string,
): ExcelCompetitorPreprocessResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetLookup = buildSheetLookup(workbook);
  const family = detectWorkbookFamily(sheetLookup);

  if (family === "smithfield_tyson_competitor_model") {
    return preprocessSmithfieldTysonWorkbook(workbook, sourceFileName);
  }

  return preprocessGenericWorkbook(workbook, sourceFileName);
}
