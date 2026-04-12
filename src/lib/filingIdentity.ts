/**
 * Shared helpers for PDF filing identity normalization:
 * - Ticker resolution
 * - Company name cleanup
 * - Fiscal quarter hint extraction from labels/filenames
 */

export interface FiscalQuarterHint {
  fiscalYear: number;
  fiscalQuarter: 1 | 2 | 3 | 4;
  label: string;
}

const PLACEHOLDER_TICKERS = new Set(["UNKNOWN", "N/A", "UNDEFINED", "NULL", "NONE"]);

const GENERIC_FILE_TOKENS = new Set([
  "10Q",
  "10K",
  "QTR",
  "QTRLY",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "FY",
  "FORM",
  "SEC",
  "EDGAR",
  "ANNUAL",
  "QUARTERLY",
  "REPORT",
  "STATEMENT",
  "FILING",
  "PDF",
  "FILE",
  "UPLOAD",
  "DOCUMENT",
  "UNAUDITED",
  "CONSOLIDATED",
]);

const COMPANY_SUFFIX_TOKENS = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LTD",
  "LIMITED",
  "PLC",
  "LLC",
  "HOLDINGS",
  "GROUP",
]);

function stripPdfExtension(value: string): string {
  return value.replace(/\.pdf$/i, "");
}

function tokenize(value: string): string[] {
  return stripPdfExtension(value)
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isYearToken(token: string): boolean {
  return /^20\d{2}$/.test(token);
}

function isQuarterToken(token: string): boolean {
  return /^Q[1-4]$/.test(token.toUpperCase());
}

function formatWord(word: string): string {
  if (!word) return word;
  if (/^[A-Z0-9]+$/.test(word)) {
    return word.length <= 6 ? word : word[0] + word.slice(1).toLowerCase();
  }
  if (/^[a-z0-9]+$/.test(word)) return word[0].toUpperCase() + word.slice(1);
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function cleanCompanyText(value: string): string | null {
  const tokens = tokenize(
    value
      .replace(/&/g, " and ")
      .replace(/[()]/g, " ")
  );

  const filtered = tokens.filter((token) => {
    const upper = token.toUpperCase();
    if (GENERIC_FILE_TOKENS.has(upper)) return false;
    if (COMPANY_SUFFIX_TOKENS.has(upper)) return false;
    if (isYearToken(upper)) return false;
    if (isQuarterToken(upper)) return false;
    return /[A-Za-z]/.test(token);
  });

  if (filtered.length === 0) return null;
  return filtered.slice(0, 4).map(formatWord).join(" ").trim() || null;
}

export function normalizeTickerCandidate(value?: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  if (!upper || PLACEHOLDER_TICKERS.has(upper)) return null;
  return upper;
}

export function tickerFromFileName(fileName?: string | null): string | null {
  if (!fileName) return null;
  const tokens = tokenize(fileName).map((t) => t.toUpperCase());

  for (const token of tokens) {
    if (GENERIC_FILE_TOKENS.has(token)) continue;
    if (isYearToken(token) || isQuarterToken(token)) continue;
    if (/^[A-Z]{1,6}$/.test(token)) return token;
  }

  const fallbackToken = tokens.find(
    (token) =>
      !GENERIC_FILE_TOKENS.has(token) &&
      !isYearToken(token) &&
      !isQuarterToken(token) &&
      /^[A-Z][A-Z0-9]{2,15}$/.test(token)
  );
  if (fallbackToken) return fallbackToken.slice(0, 6);

  return null;
}

export function tickerFromCompanyName(companyName?: string | null): string | null {
  if (!companyName) return null;
  const cleaned = cleanCompanyText(companyName);
  if (!cleaned) return null;

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const initials = parts.slice(0, 4).map((p) => p[0]).join("").toUpperCase();
    if (/^[A-Z]{2,6}$/.test(initials)) return initials;
  }

  const first = parts[0]?.toUpperCase();
  if (first && /^[A-Z][A-Z0-9]{1,15}$/.test(first)) return first.slice(0, 6);
  return null;
}

export function stableTickerFallback(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const token = Math.abs(hash).toString(36).toUpperCase().slice(0, 6);
  return `PDF${token || "UPLOAD"}`;
}

export function resolveTicker(input: {
  inputTicker?: string | null;
  metaTicker?: string | null;
  fileName?: string | null;
  companyName?: string | null;
}): string {
  return (
    normalizeTickerCandidate(input.inputTicker) ??
    normalizeTickerCandidate(input.metaTicker) ??
    tickerFromFileName(input.fileName) ??
    tickerFromCompanyName(input.companyName) ??
    stableTickerFallback(`${input.fileName ?? ""}|${input.companyName ?? ""}`)
  );
}

export function normalizeCompanyName(input: {
  candidate?: string | null;
  fileName?: string | null;
  ticker: string;
}): string {
  const fromFile = input.fileName ? cleanCompanyText(input.fileName) : null;
  if (fromFile) return fromFile;

  const fromCandidate = input.candidate ? cleanCompanyText(input.candidate) : null;
  if (fromCandidate) return fromCandidate;

  return input.ticker;
}

function parseQuarterToken(token: string): 1 | 2 | 3 | 4 | null {
  const m = token.toUpperCase().match(/^Q([1-4])$/);
  if (!m) return null;
  return Number(m[1]) as 1 | 2 | 3 | 4;
}

function parseQuarterHintFromText(value: string): FiscalQuarterHint | null {
  const normalized = stripPdfExtension(value).replace(/[_\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const patterns: Array<{ re: RegExp; qIndex: number; yIndex: number }> = [
    { re: /\bQ([1-4])\s*(20\d{2})\b/i, qIndex: 1, yIndex: 2 },
    { re: /\b(20\d{2})\s*Q([1-4])\b/i, qIndex: 2, yIndex: 1 },
    { re: /\bFY\s*(20\d{2})\s*Q([1-4])\b/i, qIndex: 2, yIndex: 1 },
    { re: /\bQ([1-4])\s*FY\s*(20\d{2})\b/i, qIndex: 1, yIndex: 2 },
  ];

  for (const pattern of patterns) {
    const m = normalized.match(pattern.re);
    if (!m) continue;
    const q = Number(m[pattern.qIndex]);
    const y = Number(m[pattern.yIndex]);
    if (Number.isNaN(q) || Number.isNaN(y) || q < 1 || q > 4) continue;
    if (y < 2000 || y > 2100) continue;
    return {
      fiscalQuarter: q as 1 | 2 | 3 | 4,
      fiscalYear: y,
      label: `Q${q} ${y}`,
    };
  }

  const tokens = tokenize(normalized).map((t) => t.toUpperCase());
  for (let i = 0; i < tokens.length - 1; i++) {
    const q = parseQuarterToken(tokens[i]);
    if (!q) continue;
    if (!isYearToken(tokens[i + 1])) continue;
    const y = Number(tokens[i + 1]);
    return { fiscalQuarter: q, fiscalYear: y, label: `Q${q} ${y}` };
  }

  return null;
}

export function extractFiscalQuarterHint(
  ...values: Array<string | null | undefined>
): FiscalQuarterHint | null {
  for (const value of values) {
    if (!value) continue;
    const hint = parseQuarterHintFromText(value);
    if (hint) return hint;
  }
  return null;
}
