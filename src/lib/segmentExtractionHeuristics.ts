import type { SegmentType, VolumeUnitType } from "@/types/segments";

export interface HeuristicSegmentExtraction {
  segmentName: string;
  segmentType: SegmentType;
  revenue: number | null;
  operatingIncome: number | null;
  depreciation: number | null;
  capitalExpenditures: number | null;
  totalAssets: number | null;
  volumeUnits: number | null;
  volumeUnitType: VolumeUnitType | null;
}

const NUMERIC_TOKEN_RE = /\(?\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?\)?/g;

const COLUMN_SEGMENT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Prepared Foods", pattern: /prepared\s+foods?/i },
  { label: "International/Other", pattern: /international\s*\/\s*other/i },
  { label: "Industrial and Other", pattern: /industrial\s+and\s+other(?:\([a-z]\))?/i },
  { label: "Foodservice", pattern: /foodservice(?:\([a-z]\))?/i },
  { label: "Retail", pattern: /retail(?:\([a-z]\))?/i },
  { label: "Chicken", pattern: /chicken/i },
  { label: "Pork", pattern: /pork/i },
  { label: "Beef", pattern: /beef/i },
  { label: "International", pattern: /international(?:\([a-z]\))?/i },
];

const COLUMN_HEADER_REJECT_PATTERNS = [
  /\bwe\s+operate\b/i,
  /\bdescription\s+of\s+segments\b/i,
  /\bincludes?\s+our\s+operations\b/i,
  /\bcontribution\s+of\s+each\s+segment\b/i,
];

function titleCaseSegmentName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) =>
      part
        .split("/")
        .map((token) =>
          token ? token[0]!.toUpperCase() + token.slice(1).toLowerCase() : token
        )
        .join("/")
    )
    .join(" ");
}

export function classifySegmentType(name: string): SegmentType {
  const normalized = name.toLowerCase();
  if (
    /\b(retail|foodservice|e-?commerce|club|wholesale|distribution|channel|industrial)\b/i.test(
      normalized
    )
  ) {
    return "channel";
  }
  if (
    /\b(international|north america|latin america|europe|asia|china|apac|emea|u\.?s\.?|us)\b/i.test(
      normalized
    )
  ) {
    return "geography";
  }
  return "business";
}

export function parseSegmentNumberToken(raw: string): number | null {
  const token = raw.trim();
  if (!token || /^-+$/.test(token)) return null;
  const isNegative = token.startsWith("(") && token.endsWith(")");
  const normalized = token.replace(/[(),$]/g, "").replace(/\s+/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(isNegative ? -value : value);
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);
}

function extractHeaderSegmentNames(line: string): string[] {
  const hits: Array<{ label: string; start: number; end: number }> = [];

  for (const { label, pattern } of COLUMN_SEGMENT_PATTERNS) {
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    );
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(line)) !== null) {
      hits.push({
        label,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const selected: Array<{ label: string; start: number; end: number }> = [];
  for (const hit of hits) {
    if (selected.some((item) => item.label === hit.label)) continue;
    if (selected.some((item) => !(hit.end <= item.start || hit.start >= item.end))) continue;
    selected.push(hit);
  }

  return selected.sort((a, b) => a.start - b.start).map((item) => item.label);
}

function findMetricNumbers(
  lines: string[],
  startIndex: number,
  patterns: RegExp[],
  lookahead = 20
): number[] | null {
  const endIndex = Math.min(lines.length, startIndex + lookahead + 1);
  for (let i = startIndex + 1; i < endIndex; i++) {
    const line = lines[i]!;
    if (patterns.every((pattern) => !pattern.test(line))) continue;
    const numbers = (line.match(NUMERIC_TOKEN_RE) ?? [])
      .map(parseSegmentNumberToken)
      .filter((value): value is number => value != null);
    if (numbers.length > 0) return numbers;
    // PDF extraction often splits label from values across adjacent lines.
    // If the label matched but the line has no numbers, check the next line.
    if (i + 1 < endIndex) {
      const nextLine = lines[i + 1]!;
      const nextNumbers = (nextLine.match(NUMERIC_TOKEN_RE) ?? [])
        .map(parseSegmentNumberToken)
        .filter((value): value is number => value != null);
      if (nextNumbers.length > 0) return nextNumbers;
    }
  }
  return null;
}

function buildHeuristicSegment(
  segmentName: string,
  values: Partial<
    Pick<
      HeuristicSegmentExtraction,
      "revenue" | "operatingIncome" | "depreciation" | "capitalExpenditures" | "totalAssets"
    >
  >
): HeuristicSegmentExtraction {
  return {
    segmentName,
    segmentType: classifySegmentType(segmentName),
    revenue: values.revenue ?? null,
    operatingIncome: values.operatingIncome ?? null,
    depreciation: values.depreciation ?? null,
    capitalExpenditures: values.capitalExpenditures ?? null,
    totalAssets: values.totalAssets ?? null,
    volumeUnits: null,
    volumeUnitType: null,
  };
}

const REVENUE_PATTERNS = [/^(?:net\s+)?sales\b/i, /^(?:net\s+)?revenues?\b/i];
const OPERATING_INCOME_PATTERNS = [
  /^(?:segment\s+)?operating\s+income(?:\s*\(loss\))?\b/i,
  /^(?:segment\s+)?(?:profit|income)\b/i,
  /^income\s+from\s+operations\b/i,
];
const DEPRECIATION_PATTERNS = [/^depreciation(?:\s+and\s+amortization)?(?=\d|\b)/i];
const TOTAL_ASSETS_PATTERNS = [/^total\s+assets(?=\d|\b)/i];
const CAPEX_PATTERNS = [/^additions?\s+to\s+property,\s*plant\s+and\s+equipment(?=\d|\b)/i];

function buildSegmentsFromHeaderIndex(
  lines: string[],
  headerEndIndex: number,
  segmentNames: string[]
): HeuristicSegmentExtraction[] {
  const revenueNumbers = findMetricNumbers(lines, headerEndIndex, REVENUE_PATTERNS);
  const operatingIncomeNumbers = findMetricNumbers(lines, headerEndIndex, OPERATING_INCOME_PATTERNS);
  if (!revenueNumbers && !operatingIncomeNumbers) return [];

  const depreciationNumbers = findMetricNumbers(lines, headerEndIndex, DEPRECIATION_PATTERNS);
  const totalAssetNumbers = findMetricNumbers(lines, headerEndIndex, TOTAL_ASSETS_PATTERNS);
  const capexNumbers = findMetricNumbers(lines, headerEndIndex, CAPEX_PATTERNS);

  return segmentNames
    .map((segmentName, index) =>
      buildHeuristicSegment(segmentName, {
        revenue: revenueNumbers?.[index] ?? null,
        operatingIncome: operatingIncomeNumbers?.[index] ?? null,
        depreciation: depreciationNumbers?.[index] ?? null,
        capitalExpenditures: capexNumbers?.[index] ?? null,
        totalAssets: totalAssetNumbers?.[index] ?? null,
      })
    )
    .filter((segment) => segment.revenue != null || segment.operatingIncome != null);
}

function extractColumnarSegments(text: string): HeuristicSegmentExtraction[] {
  const lines = normalizeLines(text);

  // Strategy A: all segment names appear on one header line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (COLUMN_HEADER_REJECT_PATTERNS.some((pattern) => pattern.test(line))) continue;

    const segmentNames = extractHeaderSegmentNames(line);
    if (segmentNames.length < 2) continue;

    const segments = buildSegmentsFromHeaderIndex(lines, i, segmentNames);
    if (segments.length >= 2) return segments;
  }

  // Strategy B: each segment name appears on its own line (multi-line header block)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/\d/.test(line)) continue;
    if (COLUMN_HEADER_REJECT_PATTERNS.some((p) => p.test(line))) continue;

    const firstNames = extractHeaderSegmentNames(line);
    if (firstNames.length !== 1) continue;

    const accNames: string[] = [firstNames[0]!];
    let j = i + 1;
    while (j < i + 10 && j < lines.length) {
      const nextLine = lines[j]!;
      if (/\d/.test(nextLine)) break;
      if (COLUMN_HEADER_REJECT_PATTERNS.some((p) => p.test(nextLine))) break;
      const nextNames = extractHeaderSegmentNames(nextLine);
      if (nextNames.length !== 1) break;
      accNames.push(nextNames[0]!);
      j++;
    }

    if (accNames.length < 2) { continue; }

    const headerEndIndex = j - 1;
    const segments = buildSegmentsFromHeaderIndex(lines, headerEndIndex, accNames);
    if (segments.length >= 2) return segments;
    i = j - 1;
  }

  return [];
}

function extractRowOrientedSegments(text: string): HeuristicSegmentExtraction[] {
  const candidateRows: Array<{
    segmentName: string;
    revenue: number | null;
    operatingIncome: number | null;
  }> = [];
  const rows = normalizeLines(text);
  const badNamePatterns = [
    /^(total|consolidated|subtotal|three months ended|nine months ended|segment results|reportable segments?)\b/i,
    /^(net sales|sales|revenue|operating income|gross profit|assets|liabilities|equity)\b/i,
    /\b(eliminations?|corporate|other)\b/i,
  ];

  for (const row of rows) {
    const firstNumber = row.search(/\(?\$?\d/);
    if (firstNumber <= 1) continue;
    const segmentName = row
      .slice(0, firstNumber)
      .replace(/\([a-z]\)$/i, "")
      .replace(/[$|:–\-]\s*$/, "")
      .trim();
    if (!segmentName || segmentName.length > 40) continue;
    if (badNamePatterns.some((pattern) => pattern.test(segmentName))) continue;
    if (!/[a-z]/i.test(segmentName)) continue;

    const numbers = (row.match(NUMERIC_TOKEN_RE) ?? [])
      .map(parseSegmentNumberToken)
      .filter((value): value is number => value != null);
    if (numbers.length < 2) continue;

    const revenue = numbers[0] > 0 ? numbers[0] : null;
    const operatingIncome = numbers[1] ?? null;
    if (revenue == null) continue;
    if (Math.abs(revenue) < 10 || Math.abs(revenue) > 1_000_000) continue;

    candidateRows.push({ segmentName, revenue, operatingIncome });
  }

  const deduped = new Map<string, { revenue: number | null; operatingIncome: number | null }>();
  for (const row of candidateRows) {
    const key = row.segmentName.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || (row.revenue ?? 0) > (existing.revenue ?? 0)) {
      deduped.set(key, { revenue: row.revenue, operatingIncome: row.operatingIncome });
    }
  }

  return Array.from(deduped.entries())
    .map(([name, values]) =>
      buildHeuristicSegment(titleCaseSegmentName(name), {
        revenue: values.revenue,
        operatingIncome: values.operatingIncome,
      })
    )
    .slice(0, 8);
}

export function extractSegmentsHeuristic(text: string): HeuristicSegmentExtraction[] {
  const columnarSegments = extractColumnarSegments(text);
  if (columnarSegments.length > 0) return columnarSegments;
  return extractRowOrientedSegments(text);
}
