export type PdfFinancialMetric =
  | "revenue"
  | "costOfRevenue"
  | "grossProfit"
  | "netIncome"
  | "totalAssets"
  | "cashAndEquivalents"
  | "operatingIncome"
  | "operatingCashFlow"
  | "capitalExpenditures";

type PdfSection =
  | "unknown"
  | "balance_sheet"
  | "income"
  | "cash_flow"
  | "equity"
  | "notes";

export interface PdfFinancialValue {
  metric: PdfFinancialMetric;
  tag: string;
  label: string;
  value: number;
  source: string;
  raw: string;
  confidence: "high" | "medium" | "low";
}

interface MetricConfig {
  tag: string;
  label: string;
  patterns: RegExp[];
  exactLabel: RegExp;
  preferredSections: PdfSection[];
  fallbackSections?: PdfSection[];
  reject?: RegExp;
  abs?: boolean;
}

interface ParsedLine {
  idx: number;
  raw: string;
  label: string;
  numbers: number[];
  dashCount: number;
  section: PdfSection;
}

const METRICS: Record<PdfFinancialMetric, MetricConfig> = {
  revenue: {
    tag: "Revenues",
    label: "Revenue",
    patterns: [
      /^(?:total\s+)?(?:net\s+)?(?:sales|revenues?|revenue)\b/i,
    ],
    exactLabel: /^(?:total\s+)?(?:net\s+)?(?:sales|revenues?|revenue)$/i,
    preferredSections: ["income"],
    fallbackSections: ["notes"],
    reject:
      /\b(cost|segment|intersegment|international|retail|foodservice|expense|margin|receivable|deferred|contract|unearned|growth|increase|decrease)\b/i,
  },
  costOfRevenue: {
    tag: "CostOfGoodsSold",
    label: "Cost of revenue",
    patterns: [
      /^cost\s+of\s+(?:products?\s+sold|goods?\s+sold|sales|revenue)\b/i,
      /^cost\s+of\s+goods\s+and\s+services\s+sold\b/i,
    ],
    exactLabel:
      /^cost\s+of\s+(?:products?\s+sold|goods?\s+sold|sales|revenue|goods\s+and\s+services\s+sold)$/i,
    preferredSections: ["income"],
    reject: /\b(segment|margin|percent|percentage|ratio|inventory)\b/i,
    abs: true,
  },
  grossProfit: {
    tag: "GrossProfit",
    label: "Gross profit",
    patterns: [/^gross\s+profit\b/i, /^gross\s+margin\s+dollars?\b/i],
    exactLabel: /^gross\s+(?:profit|margin\s+dollars?)$/i,
    preferredSections: ["income"],
    reject: /\b(percent|percentage|ratio|segment)\b/i,
  },
  netIncome: {
    tag: "NetIncomeLoss",
    label: "Net income",
    patterns: [
      /^net\s+(?:earnings|income|loss)\b/i,
      /^net\s+(?:earnings|income)\s+attributable\b/i,
    ],
    exactLabel:
      /^net\s+(?:earnings|income|loss)(?:\s+attributable\s+to\s+.*)?$/i,
    preferredSections: ["income"],
    fallbackSections: ["cash_flow"],
    reject:
      /\b(per\s+share|eps|comprehensive|margin|cash\s+flow|adjusted|non-gaap|reconciliation|segment)\b/i,
  },
  totalAssets: {
    tag: "Assets",
    label: "Total assets",
    patterns: [/^total\s+assets\b/i],
    exactLabel: /^total\s+assets$/i,
    preferredSections: ["balance_sheet"],
    reject: /\b(current|segment|pension|plan|under\s+management|asset\s+turnover)\b/i,
  },
  cashAndEquivalents: {
    tag: "CashAndCashEquivalentsAtCarryingValue",
    label: "Cash & equivalents",
    patterns: [
      /^cash\s+and\s+(?:cash\s+)?equivalents\b/i,
      /^cash,\s+cash\s+equivalents\b/i,
    ],
    exactLabel: /^cash\s+and\s+(?:cash\s+)?equivalents(?:\s+at\s+end\s+of\s+period)?$/i,
    preferredSections: ["balance_sheet"],
    fallbackSections: ["cash_flow"],
    reject:
      /\b(beginning\s+of\s+(?:period|year)|net\s+(?:increase|decrease)|provided\s+by|used\s+in|operating\s+activities|investing\s+activities|financing\s+activities|effect\s+of\s+exchange|supplemental)\b/i,
  },
  operatingIncome: {
    tag: "OperatingIncomeLoss",
    label: "Operating income",
    patterns: [
      /^operating\s+(?:income|loss|profit|earnings)\b/i,
      /^income\s+from\s+operations\b/i,
    ],
    exactLabel:
      /^(?:operating\s+(?:income|loss|profit|earnings)|income\s+from\s+operations)$/i,
    preferredSections: ["income"],
    reject:
      /\b(segment|margin|per\s+share|cash\s+flow|adjusted|non-gaap|reconciliation|tax|before\s+income\s+tax)\b/i,
  },
  operatingCashFlow: {
    tag: "NetCashProvidedByOperatingActivities",
    label: "Operating cash flow",
    patterns: [
      /^(?:net\s+)?cash\s+(?:provided|generated|used).*operating/i,
      /^net\s+cash\s+flows?\s+from\s+operating\s+activities/i,
      /operating\s+activities\s+of\s+continuing\s+operations/i,
    ],
    exactLabel:
      /^(?:net\s+)?cash\s+(?:provided|generated|used|flows?\s+from)\s+(?:by\s+|in\s+|for\s+|from\s+)?operating\s+activities(?:\s+of\s+continuing\s+operations)?$/i,
    preferredSections: ["cash_flow"],
    reject: /\b(investing|financing|margin|per\s+share|supplemental)\b/i,
  },
  capitalExpenditures: {
    tag: "PaymentsToAcquirePropertyPlantAndEquipment",
    label: "Capital expenditures",
    patterns: [
      /^capital\s+expenditures?\b/i,
      /^(?:purchases?|payments?|acquisitions?)\s+(?:of|for|to\s+acquire)\s+(?:property|plant|equipment)/i,
      /^additions?\s+to\s+(?:property|plant|equipment)/i,
      /^(?:property,\s*plant\s+and\s+equipment|property\s+and\s+equipment)\s+additions?\b/i,
      /^capital\s+additions?\b/i,
      /^investment\s+in\s+(?:property|plant|equipment)/i,
    ],
    exactLabel:
      /^(?:capital\s+expenditures?|purchases?\s+of\s+(?:property,\s*plant\s+and\s+equipment|property\s+and\s+equipment)|additions?\s+to\s+(?:property,\s*plant\s+and\s+equipment|property\s+and\s+equipment)|capital\s+additions?)$/i,
    preferredSections: ["cash_flow"],
    reject:
      /\b(proceeds|sale|disposal|depreciation|amortization|impairment|lease|right-of-use|held\s+for\s+sale)\b/i,
    abs: true,
  },
};

const SECTION_PATTERNS: Array<[RegExp, PdfSection]> = [
  [/condensed\s+consolidated\s+balance\s+sheets?/i, "balance_sheet"],
  [/consolidated\s+balance\s+sheets?/i, "balance_sheet"],
  [/balance\s+sheets?/i, "balance_sheet"],
  [/statement.*financial\s+position/i, "balance_sheet"],
  [
    /condensed\s+consolidated\s+statements?\s+of\s+(?:operations?|income|earnings)/i,
    "income",
  ],
  [
    /consolidated\s+statements?\s+of\s+(?:operations?|income|earnings)/i,
    "income",
  ],
  [/statements?\s+of\s+(?:operations?|income|earnings)/i, "income"],
  [
    /condensed\s+consolidated\s+statements?\s+of\s+cash\s+flows?/i,
    "cash_flow",
  ],
  [/consolidated\s+statements?\s+of\s+cash\s+flows?/i, "cash_flow"],
  [/statements?\s+of\s+cash\s+flows?/i, "cash_flow"],
  [/cash\s+flows?\s+statement/i, "cash_flow"],
  [/statements?\s+of\s+(?:stockholders|shareholders).?\s+equity/i, "equity"],
  [/statements?\s+of\s+equity/i, "equity"],
  [/notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial/i, "notes"],
];

const NUMBER_RE =
  /\(([\d,]+(?:\.\d+)?)\)|(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)/g;
const DASH_TOKEN_RE = /(^|\s)(?:-|\u2013|\u2014)(?=\s|$)/g;

function normalizeLine(raw: string): string {
  return raw
    .replace(/\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectScaleMultiplier(text: string, scaleNote?: string): number {
  const normalized = scaleNote?.toLowerCase();
  if (normalized === "thousands") return 0.001;
  if (normalized === "billions") return 1000;
  if (normalized === "millions") return 1;

  const sample = text.slice(0, 200_000);
  if (/in\s+billions|\(billions\)|amounts?\s+in\s+billions/i.test(sample)) {
    return 1000;
  }
  if (/in\s+thousands|\(thousands\)|amounts?\s+in\s+thousands/i.test(sample)) {
    return 0.001;
  }
  return 1;
}

function isYearLike(value: number, raw: string): boolean {
  return (
    value >= 1900 &&
    value <= 2100 &&
    !raw.includes(",") &&
    !raw.includes(".")
  );
}

function dropLeadingFootnoteMarker(numbers: number[]): number[] {
  if (
    numbers.length >= 2 &&
    Number.isInteger(numbers[0]) &&
    Math.abs(numbers[0]) <= 3 &&
    Math.abs(numbers[1]) >= 5
  ) {
    return numbers.slice(1);
  }
  return numbers;
}

function parseLine(rawLine: string, idx: number, section: PdfSection): ParsedLine | null {
  const raw = normalizeLine(rawLine);
  if (!raw) return null;

  const numbers: number[] = [];
  let match: RegExpExecArray | null;
  NUMBER_RE.lastIndex = 0;
  while ((match = NUMBER_RE.exec(raw)) !== null) {
    const rawNumber = match[1] ?? match[2] ?? match[3];
    if (!rawNumber) continue;

    const parsed = parseFloat(rawNumber.replace(/,/g, ""));
    if (Number.isNaN(parsed) || isYearLike(parsed, rawNumber)) continue;
    numbers.push(match[1] ? -parsed : parsed);
  }

  const dashCount = (raw.match(DASH_TOKEN_RE) ?? []).length;
  NUMBER_RE.lastIndex = 0;
  DASH_TOKEN_RE.lastIndex = 0;
  const label = raw
    .replace(NUMBER_RE, " ")
    .replace(DASH_TOKEN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    idx,
    raw,
    label,
    numbers: dropLeadingFootnoteMarker(numbers),
    dashCount,
    section,
  };
}

function parseLines(text: string): ParsedLine[] {
  const parsed: ParsedLine[] = [];
  let section: PdfSection = "unknown";

  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeLine(lines[i]);
    for (const [pattern, nextSection] of SECTION_PATTERNS) {
      if (pattern.test(normalized)) {
        section = nextSection;
        break;
      }
    }

    const line = parseLine(lines[i], i, section);
    if (line) parsed.push(line);
  }

  return parsed;
}

function scoreCandidate(line: ParsedLine, config: MetricConfig, value: number): number {
  let score = 20;

  if (config.preferredSections.includes(line.section)) score += 35;
  else if (config.fallbackSections?.includes(line.section)) score += 15;
  else if (line.section === "unknown") score += 10;
  else if (line.section === "notes") score -= 15;
  else score -= 10;

  if (config.exactLabel.test(line.label)) score += 15;
  if (line.numbers.length >= 2) score += 5;
  if (/[0-9],[0-9]/.test(line.raw)) score += 5;

  const tinyValue = Math.abs(value) <= 1;
  if (tinyValue && line.numbers.length <= 1) score -= 35;
  if (tinyValue && line.dashCount > 0) score -= 25;
  if (!tinyValue) score += 10;

  return score;
}

function confidenceFromScore(score: number): PdfFinancialValue["confidence"] {
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function extractPdfFinancialValue(
  text: string,
  metric: PdfFinancialMetric,
  scaleNote?: string
): PdfFinancialValue | null {
  const config = METRICS[metric];
  const parsed = parseLines(text);
  const scale = detectScaleMultiplier(text, scaleNote);

  let best:
    | {
        line: ParsedLine;
        value: number;
        score: number;
      }
    | null = null;

  for (const line of parsed) {
    if (config.reject?.test(line.label)) continue;
    if (!config.patterns.some((pattern) => pattern.test(line.label))) continue;
    if (line.numbers.length === 0) continue;

    const selected = line.numbers[0];
    const rawValue = config.abs ? Math.abs(selected) : selected;
    const value = Math.round(rawValue * scale * 100) / 100;
    const score = scoreCandidate(line, config, value);

    if (!best || score > best.score) {
      best = { line, value, score };
    }
  }

  if (!best || best.score < 35) return null;

  return {
    metric,
    tag: config.tag,
    label: config.label,
    value: best.value,
    source: `heuristic:${metric}:line${best.line.idx + 1}`,
    raw: best.line.raw,
    confidence: confidenceFromScore(best.score),
  };
}
