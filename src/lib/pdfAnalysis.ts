/**
 * PDF → FullAnalysis pipeline (client-side).
 *
 * 1. Extract text from PDF using pdf.js
 * 2. Send to /api/analyze-pdf which runs 5 parallel AI calls:
 *    - Balance Sheet extraction (exact XBRL tags)
 *    - Income Statement + Cash Flow extraction (exact XBRL tags)
 *    - Qualitative: footnotes, earnings narrative, adjusted metrics
 *    - Segments: business/channel/geography segment breakdown
 *    - Non-recurring items: legal, restructuring, impairment, etc.
 * 3. Fallback to heuristic regex extraction if AI unavailable
 */

import type { BSItem, FullAnalysis, StepEvent } from "@/types/analysis";
import { PIPELINE_STEPS } from "@/types/analysis";
import { assembleAnalysis } from "./analysisEngine";

// ---------------------------------------------------------------------------
// Load pdfjs from /public via native browser ESM import (bypasses webpack).
// /* webpackIgnore: true */ tells webpack to skip bundling this import —
// the browser loads /pdf.min.mjs directly as a native ESM module.
// ---------------------------------------------------------------------------

interface PdfjsMinimal {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{
          items: Array<{ str?: string; transform?: number[] }>;
        }>;
      }>;
    }>;
  };
}

let _pdfjsBrowserPromise: Promise<PdfjsMinimal> | null = null;

async function loadPdfjsBrowser(): Promise<PdfjsMinimal> {
  if (_pdfjsBrowserPromise) return _pdfjsBrowserPromise;
  _pdfjsBrowserPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
    const lib: PdfjsMinimal = mod.default ?? mod;
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return lib;
  })();
  _pdfjsBrowserPromise.catch(() => { _pdfjsBrowserPromise = null; });
  return _pdfjsBrowserPromise;
}

function pipeLabel(stepId: string): string {
  return PIPELINE_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
}

// ===========================================================================
// 1. PDF text extraction — LINE-AWARE
// ===========================================================================

interface PdfLine {
  page: number;
  y: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Row normalization
//
// Given a raw joined row string like:
//   "$ 11,523 $ 11,054 Total assets"   (items arrived in wrong order from pdf.js)
// After X-sort we get:
//   "Total assets $ 11,523 $ 11,054"
// After normalize we get:
//   "Total assets 11,523 11,054"
//
// This lets label regexes like /^total assets\b/i match cleanly.
// ---------------------------------------------------------------------------
function normalizeRow(raw: string): string {
  return raw
    .trim()
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    // Remove isolated currency symbols (standalone $ not part of a number)
    .replace(/\$\s+(?=\d)/g, "")   // "$ 11,523" → "11,523"
    .replace(/(?<!\d)\$(?!\d)/g, "") // stray $ not adjacent to digits
    .trim()
    .replace(/\s{2,}/g, " ");
}

export async function extractPdfLines(
  file: File
): Promise<{ lines: PdfLine[]; pages: number; rawChars: number; fullText: string }> {
  const pdfjsLib = await loadPdfjsBrowser();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = doc.numPages;
  const allLines: PdfLine[] = [];
  let rawChars = 0;
  const pageTexts: string[] = [];

  // Y-tolerance: items within this many units are considered the same row.
  // PDF coordinates are in points (72 pts = 1 inch). A tolerance of 3 handles
  // slight baseline shifts between label and number columns in financial tables.
  const Y_TOLERANCE = 3;

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Collect all items with (x, y, str)
    const items: Array<{ x: number; y: number; str: string }> = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const s = item.str;
      if (typeof s !== "string" || !s.trim()) continue;
      rawChars += s.length;
      const t = "transform" in item ? (item.transform as number[]) : null;
      items.push({ x: t ? t[4] : 0, y: t ? t[5] : 0, str: s });
    }

    // Bucket by Y with tolerance: merge items whose Y is within Y_TOLERANCE of
    // an existing bucket key.
    const buckets: Array<{ yKey: number; items: Array<{ x: number; str: string }> }> = [];
    for (const item of items) {
      const existing = buckets.find(b => Math.abs(b.yKey - item.y) <= Y_TOLERANCE);
      if (existing) {
        existing.items.push({ x: item.x, str: item.str });
      } else {
        buckets.push({ yKey: item.y, items: [{ x: item.x, str: item.str }] });
      }
    }

    // Sort rows top-to-bottom (higher Y = higher on page in PDF coordinates)
    buckets.sort((a, b) => b.yKey - a.yKey);

    const lineTexts: string[] = [];
    for (const bucket of buckets) {
      // Sort items left-to-right by X within each row
      const sorted = bucket.items.sort((a, b) => a.x - b.x);
      const raw = sorted.map(i => i.str).join(" ").trim();
      const text = normalizeRow(raw);
      if (text) {
        allLines.push({ page: p, y: bucket.yKey, text });
        lineTexts.push(text);
      }
    }
    pageTexts.push(lineTexts.join("\n"));
  }

  return { lines: allLines, pages, rawChars, fullText: pageTexts.join("\n\n--- Page Break ---\n\n") };
}

// ===========================================================================
// 2. AI-powered extraction via /api/analyze-pdf (3 parallel calls)
// ===========================================================================

async function analyzeWithAI(
  fullText: string,
  fileName: string,
  pages: number,
  chars: number
): Promise<FullAnalysis> {
  const resp = await fetch("/api/analyze-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fullText, fileName, pages, chars }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error((err as { error?: string }).error ?? `API returned ${resp.status}`);
  }

  const data = (await resp.json()) as {
    analysis?: FullAnalysis;
    error?: string;
    degraded?: boolean;
  };
  if (!data.analysis) {
    throw new Error(data.error ?? "No analysis result from API");
  }
  // Server returns 200 with partial AI data; client must not treat that as success or UI shows $0M.
  if (data.degraded) {
    throw new Error(
      "AI extraction coverage was too low; using deterministic PDF heuristics instead."
    );
  }
  return data.analysis;
}

// ===========================================================================
// 3. Heuristic fallback
// ===========================================================================

type Scale = 1 | 1_000 | 1_000_000 | 1_000_000_000;

function detectScale(lines: PdfLine[]): Scale {
  const BILLIONS = /in\s+billions/i;
  const MILLIONS =
    /in\s+millions|\(millions\)|amounts?\s+in\s+millions|millions\s+of\s+dollars|dollars?\s+in\s+millions|presented\s+in\s+millions|except\s+per\s+share/i;
  const THOUSANDS = /in\s+thousands|\(thousands\)|amounts?\s+in\s+thousands/i;

  // First pass: find scale indicators near financial section headers (most accurate).
  // Scale notes like "(in millions)" typically appear within a few lines of the statement title.
  for (let i = 0; i < lines.length; i++) {
    if (/balance\s+sheet|statement.*(?:income|operations?|cash\s+flow)|cash\s+flow\s+statement/i.test(lines[i].text)) {
      const ctx = lines
        .slice(Math.max(0, i - 3), Math.min(lines.length, i + 25))
        .map((l) => l.text)
        .join(" ");
      if (BILLIONS.test(ctx)) return 1_000_000_000;
      if (MILLIONS.test(ctx)) return 1_000_000;
      if (THOUSANDS.test(ctx)) return 1_000;
    }
  }

  // Second pass: scan the entire document as a fallback.
  const fullSample = lines.map((l) => l.text).join(" ");
  if (BILLIONS.test(fullSample)) return 1_000_000_000;
  if (MILLIONS.test(fullSample)) return 1_000_000;
  if (THOUSANDS.test(fullSample)) return 1_000;

  // Third pass: SEC large-cap 10-Q/K tables are almost always stated in millions even when
  // the "(in millions)" line is split across PDF text runs and missed by pdf.js row join.
  const head = lines.slice(0, Math.min(lines.length, 200)).map((l) => l.text).join(" ");
  if (MILLIONS.test(head)) return 1_000_000;

  return 1;
}

/** When explicit scale text is missing, infer "already in millions" from typical row magnitudes. */
function inferScaleFromMagnitude(lines: PdfLine[]): Scale {
  const scan = lines.slice(0, Math.min(lines.length, 1200));
  for (let i = 0; i < scan.length; i++) {
    const pl = parseLine(scan[i], i);
    const hit =
      /^total\s+assets\b/i.test(pl.label) ||
      /^total\s+liabilities\b/i.test(pl.label) ||
      /^net\s+sales\b/i.test(pl.label) ||
      /^sales$/i.test(pl.label) ||
      /^(total\s+)?(net\s+)?revenues?\b/i.test(pl.label);
    if (!hit || pl.numbers.length === 0) continue;
    const n = Math.abs(pl.numbers[0]);
    // Raw values in the thousands–low hundreds of millions range match "millions" units for major filers.
    if (n >= 100 && n < 500_000_000) return 1_000_000;
  }
  return 1;
}

type Section = "unknown" | "balance_sheet" | "income" | "cash_flow" | "equity" | "comprehensive_income" | "notes";

const SECTION_PATTERNS: [RegExp, Section][] = [
  // Balance sheet — handle singular AND plural ("Balance Sheet" vs "Balance Sheets")
  [/condensed\s+consolidated\s+balance\s+sheets?/i, "balance_sheet"],
  [/consolidated\s+balance\s+sheets?/i, "balance_sheet"],
  [/balance\s+sheets?/i, "balance_sheet"],
  [/financial\s+position/i, "balance_sheet"],
  // Income statement
  [/condensed\s+consolidated\s+statements?\s+of\s+(operations?|income|earnings)/i, "income"],
  [/consolidated\s+statements?\s+of\s+(operations?|income|earnings)/i, "income"],
  [/statements?\s+of\s+(income|operations?|earnings)/i, "income"],
  [/statements?\s+of\s+income\s+and\s+comprehensive/i, "income"],
  // Cash flow — handle singular AND plural ("Cash Flow" vs "Cash Flows")
  [/condensed\s+consolidated\s+statements?\s+of\s+cash\s+flows?/i, "cash_flow"],
  [/consolidated\s+statements?\s+of\s+cash\s+flows?/i, "cash_flow"],
  [/statements?\s+of\s+cash\s+flows?/i, "cash_flow"],
  [/cash\s+flows?\s+statement/i, "cash_flow"],
  // Equity / other
  [/stockholders.?\s+equity/i, "equity"],
  [/shareholders.?\s+equity/i, "equity"],
  [/comprehensive\s+income/i, "comprehensive_income"],
  [/notes\s+to\s+(the\s+)?(consolidated\s+)?financial/i, "notes"],
];

interface SectionSpan { section: Section; startIdx: number; endIdx: number; }

function detectSections(lines: PdfLine[]): SectionSpan[] {
  const spans: SectionSpan[] = [];
  let cur: Section = "unknown";
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    // pdf.js often splits a single statement title across adjacent short lines — stitch a window.
    const from = Math.max(0, i - 5);
    const to = Math.min(lines.length - 1, i + 2);
    const stitched = lines.slice(from, to + 1).map((l) => l.text).join(" ");
    const t = lines[i].text;

    let matched: Section | null = null;
    for (const [re, sec] of SECTION_PATTERNS) {
      if (re.test(t) || re.test(stitched)) {
        matched = sec;
        break;
      }
    }
    if (matched != null && matched !== cur) {
      if (cur !== "unknown") spans.push({ section: cur, startIdx, endIdx: i });
      cur = matched;
      startIdx = i;
    }
  }
  if (cur !== "unknown") spans.push({ section: cur, startIdx, endIdx: lines.length });
  return spans;
}

interface ParsedLine { label: string; numbers: number[]; raw: string; page: number; lineIdx: number; }

// After normalizeRow, $ signs before numbers are already removed.
// This regex matches: plain numbers, parenthesized negatives, and dash placeholders.
const NUM_RE = /\([\d,]+(?:\.\d+)?\)|\d{1,3}(?:,\d{3})*(?:\.\d+)?|—|–|-\s*$/g;

function parseMoneyToken(raw: string): number | null {
  const s0 = raw.trim();
  if (s0 === "—" || s0 === "–" || s0 === "-") return 0;
  // Strip currency symbols and spaces (normalizeRow already removed most, but be safe)
  let s = s0.replace(/[$,\s]/g, "");
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { s = s.slice(1, -1); neg = true; }
  if (s.startsWith("-")) { s = s.slice(1); neg = true; }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // Sanity: reject suspiciously large raw numbers that are likely page/year artifacts
  // (e.g. "2025", "2024" from column headers). Values > 999,999 in a millions-scale
  // filing are legitimate, but bare 4-digit years are not financial values.
  if (n >= 1900 && n <= 2100 && !raw.includes(",")) return null;
  return neg ? -n : n;
}

function parseLine(line: PdfLine, idx: number): ParsedLine {
  const matches = line.text.match(NUM_RE) ?? [];
  const numbers: number[] = [];
  for (const m of matches) { const v = parseMoneyToken(m); if (v != null) numbers.push(v); }
  const label = line.text.replace(NUM_RE, "").replace(/\s{2,}/g, " ").trim();
  return { label, numbers, raw: line.text, page: line.page, lineIdx: idx };
}

interface ItemDef {
  tag: string; label: string; keywords: RegExp[];
  section?: Section[]; abs?: boolean; numIdx?: number;
}

const BS_DEFS: ItemDef[] = [
  // No section restriction on Assets/Liabilities totals — section detection can miss plural headers
  // ("BALANCE SHEETS" plural). The specific label uniquely identifies these lines.
  { tag: "Assets", label: "Total assets", keywords: [/^total\s+assets$/i, /^total\s+assets\s*\(/i] },
  { tag: "AssetsCurrent", label: "Current assets", keywords: [/^total\s+current\s+assets$/i, /^current\s+assets,?\s+total$/i] },
  { tag: "CashAndCashEquivalentsAtCarryingValue", label: "Cash & equivalents", keywords: [/^cash\s+and\s+(cash\s+)?equivalents/i] },
  { tag: "AccountsReceivableNet", label: "Accounts receivable", keywords: [/^(trade\s+)?accounts?\s+receivable/i, /^receivables/i] },
  { tag: "InventoryNet", label: "Inventories", keywords: [/^inventor(y|ies)/i] },
  {
    tag: "PropertyPlantAndEquipmentNet",
    label: "PP&E, net",
    keywords: [
      // Common SEC balance-sheet label variants
      /^net\s+property,\s*plant\s+and\s+equipment/i,
      /^property,\s*plant\s+and\s+equipment,\s*net/i,
      /^property.*equipment.*net/i,
      /^pp&e(\s*\(net\))?/i,
    ],
  },
  { tag: "Goodwill", label: "Goodwill", keywords: [/^goodwill$/i] },
  { tag: "Liabilities", label: "Total liabilities", keywords: [/^total\s+liabilities$/i, /^total\s+liabilities\s*\(/i] },
  { tag: "LiabilitiesCurrent", label: "Current liabilities", keywords: [/^total\s+current\s+liabilities$/i, /^current\s+liabilities,?\s+total$/i] },
  { tag: "LiabilitiesNoncurrent", label: "Non-current liabilities", keywords: [/^total\s+non-?current\s+liabilities$/i, /^non-?current\s+liabilities,?\s+total$/i] },
  { tag: "DebtCurrent", label: "Current debt", keywords: [/^current\s+portion.*long-?term\s+debt/i, /^short-?term\s+(debt|borrowings?)/i, /^current\s+debt/i, /^notes?\s+payable/i] },
  { tag: "LongTermDebtNoncurrent", label: "Long-term debt", keywords: [/^long-?term\s+debt/i, /^non-?current.*debt/i] },
  { tag: "OperatingLeaseLiabilityNoncurrent", label: "Long-term operating lease obligations", keywords: [/^long-?term\s+operating\s+lease\s+obligations?/i, /^operating\s+lease\s+liabilit(y|ies).*non-?current/i] },
  { tag: "FinanceLeaseLiabilityNoncurrent", label: "Long-term finance lease obligations", keywords: [/^long-?term\s+finance\s+lease\s+obligations?/i, /^finance\s+lease\s+liabilit(y|ies).*non-?current/i] },
  { tag: "DeferredIncomeTaxLiabilitiesNet", label: "Deferred income taxes", keywords: [/^deferred\s+income\s+tax(es)?(?:,\s*net)?$/i, /^deferred\s+tax(es)?/i] },
  { tag: "PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent", label: "Net long-term pension obligation", keywords: [/^net\s+long-?term\s+pension\s+obligation/i, /^pension.*obligation/i, /^pension.*liabilit/i] },
  { tag: "OtherLiabilitiesNoncurrent", label: "Other liabilities", keywords: [/^other\s+liabilities$/i, /^other\s+non-?current\s+liabilities$/i] },
  { tag: "AccountsPayable", label: "Accounts payable", keywords: [/^accounts?\s+payable/i, /^trade\s+payable/i] },
  {
    tag: "StockholdersEquity",
    label: "Total stockholders' equity",
    keywords: [
      /^total\s+(stock|share)holders.?\s+equity/i,
      /^total\s+(stock|share)holders.?\s+investment/i,
      /^total\s+equity/i,
      /^(stock|share)holders.?\s+investment/i,
    ],
  },
  { tag: "RedeemableNoncontrollingInterestEquityCarryingAmount", label: "Redeemable noncontrolling interests", keywords: [/^redeemable\s+noncontrolling\s+interests?/i] },
  { tag: "RetainedEarningsAccumulatedDeficit", label: "Retained earnings", keywords: [/^retained\s+earnings/i, /^accumulated\s+deficit/i] },
  { tag: "LiabilitiesAndStockholdersEquity", label: "Total liab. + equity", keywords: [/^total\s+liabilities\s+(and|&)\s+(stock|share)holders/i, /^total\s+liabilities\s+(and|&)\s+equity/i] },
  { tag: "AccumulatedOtherComprehensiveIncomeLoss", label: "AOCI", keywords: [/^accumulated\s+other\s+comprehensive/i] },
  { tag: "AdditionalPaidInCapital", label: "APIC", keywords: [/^additional\s+paid-?in\s+capital/i] },
  { tag: "IntangibleAssetsNet", label: "Intangible assets", keywords: [/^intangible\s+assets/i] },
  { tag: "AccruedLiabilitiesCurrent", label: "Accrued liabilities", keywords: [/^accrued\s+(expenses?|liabilities)/i] },
];

const CF_DEFS: ItemDef[] = [
  {
    tag: "Revenues", label: "Revenue",
    // "Sales" alone (top line in meat/food filings like Smithfield, Tyson), "Net revenues", "Net sales", "Total revenue"
    // No section restriction — label patterns are specific enough
    keywords: [
      /^sales$/i,
      /^total\s+sales\b/i,
      /^net\s+sales\b/i,
      /^(total\s+)?(net\s+)?revenues?\b/i,
      /^(total\s+)?revenues?\b/i,
    ],
  },
  {
    tag: "CostOfGoodsSold", label: "Cost of goods sold",
    // "Cost of sales", "Cost of products sold", "Cost of products" — common in CPG/food companies
    // No section restriction — label is unique enough and section detection may miss plural headers
    keywords: [/^cost\s+of\s+(goods?\s+sold|sales|revenue)/i, /^cost\s+of\s+products?\s+(sold)?/i],
  },
  { tag: "GrossProfit", label: "Gross profit", keywords: [/^gross\s+profit/i] },
  { tag: "SellingGeneralAndAdministrativeExpense", label: "SG&A", keywords: [/^selling.?\s*general/i, /^sg&a/i] },
  { tag: "ResearchAndDevelopmentExpense", label: "R&D", keywords: [/^research\s+and\s+development/i, /^r&d/i] },
  { tag: "OperatingExpenses", label: "Operating expenses", keywords: [/^total\s+operating\s+expenses/i] },
  {
    tag: "OperatingIncomeLoss", label: "Operating income",
    // "Operating profit" = common synonym (Smithfield, many UK-style filers)
    keywords: [/^operating\s+(income|loss|profit|earnings)/i, /^income\s+from\s+operations/i, /^(total\s+)?operating\s+profit/i],
  },
  { tag: "InterestExpense", label: "Interest expense", keywords: [/^interest\s+expense/i] },
  { tag: "IncomeTaxExpenseBenefit", label: "Income tax", keywords: [/^(income\s+tax|provision\s+for\s+income\s+tax)/i] },
  {
    tag: "NetIncomeLoss", label: "Net income",
    // Do not restrict to "income" section: pdf.js row ordering can leave statement rows under the wrong span.
    keywords: [/^net\s+(income|loss|earnings)/i, /^net\s+(income|earnings)\s+attributable/i],
  },
  { tag: "EarningsPerShareBasic", label: "EPS (basic)", keywords: [/^(basic\s+)?earnings?\s+per\s+share.*basic/i, /^basic\s+(net\s+)?(income|earnings)\s+per/i] },
  { tag: "EarningsPerShareDiluted", label: "EPS (diluted)", keywords: [/^(diluted\s+)?earnings?\s+per\s+share.*diluted/i, /^diluted\s+(net\s+)?(income|earnings)\s+per/i] },
  { tag: "DepreciationDepletionAndAmortization", label: "Depreciation & amortization", keywords: [/^depreciation\s+(and|&)\s+amortization/i, /^depreciation,?\s+depletion/i] },
  {
    tag: "NetCashProvidedByOperatingActivities", label: "Operating cash flow",
    // "Net cash flows from operating activities of continuing operations" — Smithfield variant
    // No section restriction — plural "CASH FLOWS" header may not be detected
    keywords: [
      /^(net\s+)?cash\s+(provided|generated|used).*operating/i,
      /^net\s+cash\s+flows?\s+from\s+operating\s+activities/i,
      /operating\s+activities\s+of\s+continuing\s+operations/i,
    ],
  },
  {
    tag: "PaymentsToAcquirePropertyPlantAndEquipment", label: "Capital expenditures",
    keywords: [/^(capital\s+expenditures?|purchases?\s+of\s+property)/i, /^additions?\s+to\s+property/i, /^capital\s+additions?/i],
    abs: true,
  },
  {
    tag: "PaymentsOfDividends", label: "Dividends paid",
    // "Payment of dividends" (singular, Smithfield style) and standard variants
    keywords: [/^payments?\s+of\s+dividends?/i, /^dividends?\s+paid/i, /^dividends?\s+to\s+(common\s+)?stock/i, /^payment\s+of\s+dividends?/i],
    abs: true,
  },
  {
    tag: "PaymentsForRepurchaseOfCommonStock",
    label: "Share repurchases",
    keywords: [
      // Purchase of Class A/B common stock (equity statement and CF variants)
      /^(repurchases?|buybacks?|purchases?)\s+of\s+(?:(?:[a-z0-9&.,'-]+\s+){0,6})?(?:class\s+[ab]\s+)?common\s+stock\b/i,
      /^treasury\s+stock\s+(acquired|purchased)/i,
    ],
    abs: true,
  },
  // Note-table variant: "Total share repurchases 0.4 26 0.2 13 ..." -> quarterly dollars = numbers[1]
  { tag: "PaymentsForRepurchaseOfCommonStock", label: "Share repurchases", keywords: [/^total\s+share\s+repurchases?\b/i], abs: true, numIdx: 1 },
  { tag: "ProceedsFromIssuanceOfLongTermDebt", label: "LT debt issuance", keywords: [/^proceeds\s+from\s+(issuance\s+of\s+)?(long-?term\s+)?debt/i, /^(long-?term\s+)?debt\s+borrowings/i], abs: true },
  {
    tag: "RepaymentsOfLongTermDebt",
    label: "LT debt repayments",
    keywords: [
      /^repayments?\s+of\s+long-?term\s+debt/i,
      /^repayment\s+of\s+term\s+loan/i,
      /^principal\s+payments?\s+on\s+long-?term\s+debt/i,
      /^long-?term\s+debt\s+repayments?/i,
      /^repayments?\s+of\s+non-?current\s+notes?/i,
    ],
    abs: true,
  },
  {
    tag: "RepaymentsOfShortTermDebt",
    label: "ST debt repayments",
    keywords: [
      /^repayments?\s+of\s+short-?term\s+(debt|borrowings?)/i,
      /^repayments?\s+of\s+revolving\s+credit/i,
      /^short-?term\s+debt\s+repayments?/i,
    ],
    abs: true,
  },
  {
    tag: "RepaymentsOfDebt",
    label: "Total debt repayments",
    keywords: [
      /^payments?\s+on\s+debt/i,
      /^repayments?\s+of\s+debt/i,
      /^debt\s+payments?/i,
    ],
    abs: true,
  },
  {
    tag: "RepaymentsOfCommercialPaper",
    label: "Commercial paper repayments",
    keywords: [/^repayments?\s+of\s+commercial\s+paper/i],
    abs: true,
  },
  {
    tag: "NetCashProvidedByInvestingActivities",
    label: "Investing cash flow",
    keywords: [
      /^(net\s+)?cash\s+(provided|generated|used).*investing/i,
      /^net\s+cash\s+flows?\s+from\s+investing/i,
    ],
  },
  {
    tag: "NetCashProvidedByFinancingActivities",
    label: "Financing cash flow",
    keywords: [
      /^(net\s+)?cash\s+(provided|generated|used).*financing/i,
      /^net\s+cash\s+flows?\s+from\s+financing/i,
    ],
  },
  { tag: "ShareBasedCompensation", label: "Stock-based comp", keywords: [/^(stock|share)-?based\s+compensation/i, /^stock\s+compensation\s+expense/i] },
];

function heuristicExtract(lines: PdfLine[]): { bs: BSItem[]; cf: BSItem[] } {
  let scale = detectScale(lines);
  if (scale === 1) scale = inferScaleFromMagnitude(lines);
  const sections = detectSections(lines);
  const periodLabel = detectPeriod(lines);
  const parsed = lines.map((l, i) => parseLine(l, i));

  function sectionOf(lineIdx: number): Section {
    for (const s of sections) { if (lineIdx >= s.startIdx && lineIdx < s.endIdx) return s.section; }
    return "unknown";
  }

  // If no sections were detected at all (section detection completely failed),
  // ignore section restrictions and match anywhere in the document.
  const noSectionsDetected = sections.length === 0;

  function extractValue(def: ItemDef, pl: ParsedLine): number {
    const idx = def.numIdx ?? 0;
    let v = pl.numbers[Math.min(idx, pl.numbers.length - 1)] ?? 0;
    if (def.abs) v = Math.abs(v);
    if (scale >= 1_000_000) return Math.round(v);
    if (scale === 1_000) return Math.round(v / 1_000);
    return Math.round(v / 1_000_000);
  }

  function toMillions(v: number): number {
    if (scale >= 1_000_000) return Math.round(v);
    if (scale === 1_000) return Math.round(v / 1_000);
    return Math.round(v / 1_000_000);
  }

  // Lookahead: when a label matches a tag but its line has no numbers (multi-column
  // PDF layout splits labels and values onto different Y-coordinates), scan the next
  // few lines for a numbers-only row and borrow its values.
  function resolveNumbers(pl: ParsedLine, lineIdx: number): ParsedLine {
    if (pl.numbers.length > 0) return pl;
    for (let j = lineIdx + 1; j <= Math.min(lineIdx + 4, parsed.length - 1); j++) {
      const next = parsed[j];
      // A "numbers row" has numbers and only short/empty label text (≤ 3 chars)
      if (next.numbers.length > 0 && next.label.length <= 3) return next;
    }
    return pl;
  }

  const found = new Set<string>();
  const bs: BSItem[] = [];
  const cf: BSItem[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const pl = parsed[i];
    for (const def of BS_DEFS) {
      if (found.has(def.tag)) continue;
      // Check label match (allow zero numbers — will lookahead below)
      if (!def.keywords.some((re) => re.test(pl.label))) continue;
      if (!noSectionsDetected) {
        const sec = sectionOf(pl.lineIdx);
        if (def.section?.length && !def.section.includes(sec) && sec !== "unknown") continue;
      }
      const effective = resolveNumbers(pl, i);
      if (effective.numbers.length === 0) continue;
      found.add(def.tag);
      bs.push({ tag: def.tag, label: def.label, value: extractValue(def, effective), period: periodLabel, source: `PDF:p${pl.page}:"${pl.label.slice(0, 60)}"` });
    }
    for (const def of CF_DEFS) {
      if (found.has(def.tag)) continue;
      if (!def.keywords.some((re) => re.test(pl.label))) continue;
      if (!noSectionsDetected) {
        const sec = sectionOf(pl.lineIdx);
        if (def.section?.length && !def.section.includes(sec) && sec !== "unknown") continue;
      }
      const effective = resolveNumbers(pl, i);
      if (effective.numbers.length === 0) continue;
      found.add(def.tag);
      cf.push({ tag: def.tag, label: def.label, value: extractValue(def, effective), period: periodLabel, source: `PDF:p${pl.page}:"${pl.label.slice(0, 60)}"` });
    }
  }

  // Repair path for total equity:
  // Prefer the FINAL total line in the equity section (e.g., "Total shareholders' equity"),
  // and prefer "total" over company-only equity lines.
  function balanceGapPct(
    assets: number | null,
    liabilities: number | null,
    equity: number | null
  ): number {
    if (assets == null || liabilities == null || equity == null || assets === 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.abs(assets - (liabilities + equity)) / Math.abs(assets);
  }

  interface EquityCandidate {
    idx: number;
    label: string;
    value: number;
    isTotal: boolean;
    isCompanySpecific: boolean;
  }

  const liabilitiesAndEquityPattern =
    /^total\s+liabilities\s+(and|&)\s+((stock|share)holders?.?\s+equity|equity)\b/i;
  const totalLiabilitiesPattern = /^total\s+liabilities\b/i;
  const companySpecificEquityPattern =
    /^company\s+shareholders?.?\s+equity\b/i;
  const equityPatterns: Array<{ pattern: RegExp; isTotal: boolean }> = [
    { pattern: /^total\s+(stock|share)holders?.?\s+equity\b/i, isTotal: true },
    { pattern: /^total\s+(stock|share)holders?.?\s+investment\b/i, isTotal: true },
    { pattern: /^total\s+equity\b/i, isTotal: true },
    { pattern: /^(stock|share)holders?.?\s+investment\b/i, isTotal: false },
  ];

  let finalLiabilitiesAndEquityIdx = -1;
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (liabilitiesAndEquityPattern.test(parsed[i].label)) {
      finalLiabilitiesAndEquityIdx = i;
      break;
    }
  }

  let equityStartIdx = 0;
  let equityEndIdx = parsed.length - 1;
  if (finalLiabilitiesAndEquityIdx !== -1) {
    equityStartIdx = Math.max(0, finalLiabilitiesAndEquityIdx - 160);
    equityEndIdx = finalLiabilitiesAndEquityIdx;
    for (let i = finalLiabilitiesAndEquityIdx; i >= equityStartIdx; i--) {
      if (totalLiabilitiesPattern.test(parsed[i].label)) {
        equityStartIdx = i;
        break;
      }
    }
  }

  const equityCandidates: EquityCandidate[] = [];
  for (let i = equityStartIdx; i <= equityEndIdx; i++) {
    const row = parsed[i];
    const matched = equityPatterns.find((p) => p.pattern.test(row.label));
    const isCompanySpecific = companySpecificEquityPattern.test(row.label);
    if (!matched && !isCompanySpecific) continue;

    const effective = resolveNumbers(row, i);
    if (effective.numbers.length === 0) continue;

    equityCandidates.push({
      idx: i,
      label: row.label,
      value: toMillions(effective.numbers[0]),
      isTotal: matched?.isTotal ?? false,
      isCompanySpecific,
    });
  }

  if (equityCandidates.length > 0) {
    const preferredTotals = equityCandidates.filter(
      (candidate) => candidate.isTotal && !candidate.isCompanySpecific
    );
    const preferredNonCompany = equityCandidates.filter(
      (candidate) => !candidate.isCompanySpecific
    );
    const selectedEquity =
      preferredTotals[preferredTotals.length - 1] ??
      preferredNonCompany[preferredNonCompany.length - 1] ??
      equityCandidates[equityCandidates.length - 1];

    const equityItem = bs.find((item) => item.tag === "StockholdersEquity");
    const assetsValue = bs.find((item) => item.tag === "Assets")?.value ?? null;
    const liabilitiesValue =
      bs.find((item) => item.tag === "Liabilities")?.value ?? null;
    const currentGap = balanceGapPct(
      assetsValue,
      liabilitiesValue,
      equityItem?.value ?? null
    );
    const selectedGap = balanceGapPct(
      assetsValue,
      liabilitiesValue,
      selectedEquity.value
    );

    const shouldRepairEquity =
      !equityItem ||
      equityItem.value === 0 ||
      /^company\s+shareholders?.?\s+equity/i.test(equityItem.label) ||
      (Number.isFinite(selectedGap) &&
        (!Number.isFinite(currentGap) || selectedGap < currentGap));

    if (shouldRepairEquity) {
      if (equityItem) {
        equityItem.value = selectedEquity.value;
        equityItem.label = selectedEquity.label;
        equityItem.source = "PDF:heuristic:equity_final_total";
      } else {
        bs.push({
          tag: "StockholdersEquity",
          label: selectedEquity.label,
          value: selectedEquity.value,
          period: periodLabel,
          source: "PDF:heuristic:equity_final_total",
        });
      }
      console.log("[equity:pdf-heuristic] repaired", {
        label: selectedEquity.label,
        value: selectedEquity.value,
        currentGap,
        selectedGap,
      });
    }
  }

  // Repair path for share repurchases when initial matching yields 0 / missing.
  // This protects against column misalignment where the "shares" column (e.g. 0.4)
  // can be read instead of dollars (e.g. 26).
  const repurchase = cf.find(i => i.tag === "PaymentsForRepurchaseOfCommonStock");
  console.log("[repurchase:pdf-heuristic] extracted", repurchase ?? null);
  if (!repurchase || Math.abs(repurchase.value) < 1) {
    console.log("[repurchase:pdf-heuristic] attempting repair from parsed rows");
    let repaired: number | null = null;

    // Priority 1: "Purchase(s) of ... Class A/B common stock" row.
    const purchaseRow = parsed.find((pl) =>
      /^(?:purchases?|repurchases?)\s+of\s+(?:(?:[a-z0-9&.,'-]+\s+){0,6})?(?:class\s+[ab]\s+)?common\s+stock\b/i.test(pl.label)
    );
    if (purchaseRow) {
      const n = purchaseRow.numbers.find((v) => Math.abs(v) >= 1);
      console.log("[repurchase:pdf-heuristic] purchase-row", {
        page: purchaseRow.page,
        label: purchaseRow.label,
        numbers: purchaseRow.numbers,
      });
      if (n != null) repaired = Math.abs(n);
    }

    // Priority 2: note table row "Total share repurchases 0.4 26 ..."
    if (repaired == null) {
      const totalRow = parsed.find((pl) => /^total\s+share\s+repurchases?\b/i.test(pl.label));
      if (totalRow) {
        console.log("[repurchase:pdf-heuristic] total-row", {
          page: totalRow.page,
          label: totalRow.label,
          numbers: totalRow.numbers,
        });
        if (totalRow.numbers.length >= 2 && Math.abs(totalRow.numbers[1]) >= 1) {
          repaired = Math.abs(totalRow.numbers[1]);
        } else {
          const n = totalRow.numbers.find((v) => Math.abs(v) >= 1);
          if (n != null) repaired = Math.abs(n);
        }
      }
    }

    if (repaired != null) {
      if (repurchase) {
        repurchase.value = repaired;
        repurchase.source = "PDF:heuristic:repurchase_repair";
      } else {
        cf.push({
          tag: "PaymentsForRepurchaseOfCommonStock",
          label: "Share repurchases",
          value: repaired,
          period: periodLabel,
          source: "PDF:heuristic:repurchase_repair",
        });
      }
      console.log("[repurchase:pdf-heuristic] repaired", repaired);
    }
  }

  // R&D fallback chain:
  // Only keep explicit R&D lines. If not explicitly found, keep it missing ("—").
  const existingRd = cf.find((i) => i.tag === "ResearchAndDevelopmentExpense");
  const hasValidRd = existingRd != null && Math.abs(existingRd.value) > 0;
  if (!hasValidRd) {
    const directPattern =
      /^(?:research\s+and\s+development(?:\s+expense)?|r&d(?:\s+expense)?|product\s+development(?:\s+expense)?)/i;
    const cluePattern =
      /(capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit|capitalized)/i;

    let resolvedValue: number | null = null;
    let resolvedSource = "";
    let basisUsed: "quarterly" | "ytd" | "annual" | null = null;

    const fullTextLower = lines.map((l) => l.text).join(" ").toLowerCase();
    const detectedBasis: "quarterly" | "ytd" | "annual" =
      /(?:nine|six)\s+months?\s+ended|year[-\s]*to[-\s]*date|ytd/i.test(fullTextLower)
        ? "ytd"
        : /three\s+months?\s+ended|quarter(?:ly)?\s+(?:period|ended)?/i.test(fullTextLower)
          ? "quarterly"
          : "annual";

    function selectByBasis(nums: number[], basis: "quarterly" | "ytd" | "annual"): number | null {
      if (nums.length === 0) return null;
      if (basis === "ytd") {
        if (nums.length >= 3) return nums[2];
        if (nums.length >= 2) return nums[1];
        return nums[0];
      }
      if (basis === "quarterly") return nums[0] ?? null;
      return nums[0] ?? null;
    }

    // Step 1: direct R&D rows
    for (let i = 0; i < parsed.length && resolvedValue == null; i++) {
      const pl = parsed[i];
      if (!directPattern.test(pl.label) || cluePattern.test(pl.label)) continue;
      const effective = resolveNumbers(pl, i);
      const n = selectByBasis(effective.numbers, detectedBasis);
      if (n != null) {
        resolvedValue = toMillions(Math.abs(n));
        resolvedSource = "heuristic:rd:extracted";
        basisUsed = detectedBasis;
      }
    }

    if (resolvedValue != null && resolvedValue > 0 && resolvedSource === "heuristic:rd:extracted") {
      if (existingRd) {
        existingRd.value = resolvedValue;
        existingRd.label = "R&D";
        existingRd.source = resolvedSource;
      } else {
        cf.push({
          tag: "ResearchAndDevelopmentExpense",
          label: "R&D",
          value: resolvedValue,
          period: periodLabel,
          source: resolvedSource,
        });
      }
    } else {
      resolvedValue = null;
      resolvedSource = "";
    }
    console.log("[rd:pdf-heuristic]", {
      resolvedValue,
      source: resolvedSource || null,
      basisUsed,
      final: cf.find((i) => i.tag === "ResearchAndDevelopmentExpense") ?? null,
    });
  }
  return { bs, cf };
}

function detectPeriod(lines: PdfLine[]): string {
  const sample = lines.slice(0, 80).map((l) => l.text).join(" ");
  const datePatterns = [
    /(?:as\s+of|ended)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  ];
  for (const re of datePatterns) {
    const m = sample.match(re);
    if (m) {
      try {
        const d = new Date(m[0].replace(/^(as\s+of|ended)\s+/i, ""));
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch { /* fall through */ }
    }
  }
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// Main pipeline
// ===========================================================================

export async function analyzePdf(
  file: File,
  onStep: (event: StepEvent) => void
): Promise<FullAnalysis> {
  const t0 = performance.now();

  // Step 1: Ingest
  onStep({ step: "ingest", label: pipeLabel("ingest"), status: "running", message: `Reading "${file.name}" (${(file.size / 1024).toFixed(0)} KB)…` });
  await sleep(150);
  onStep({
    step: "ingest", label: pipeLabel("ingest"), status: "done",
    message: `File accepted: ${file.name}`,
    durationMs: elapsed(t0),
    detail: { file: file.name, sizeKB: Math.round(file.size / 1024), type: file.type },
  });

  // Step 2: Extract text
  const t1 = performance.now();
  onStep({ step: "resolve", label: pipeLabel("resolve"), status: "running", message: "Extracting all text from PDF pages…" });

  const { lines, pages, rawChars, fullText } = await extractPdfLines(file);
  onStep({
    step: "resolve", label: pipeLabel("resolve"), status: "done",
    message: `${pages} pages · ${lines.length.toLocaleString()} lines · ${rawChars.toLocaleString()} chars extracted`,
    durationMs: elapsed(t1),
    detail: { pages, lines: lines.length, chars: rawChars },
  });

  // Step 3: AI extraction (5 parallel calls) or heuristic fallback — surfaced as extract_bs
  onStep({
    step: "extract_bs",
    label: pipeLabel("extract_bs"),
    status: "running",
    message: "Running 5 parallel AI extractions (BS, IS/CF, qualitative, segments, non-recurring)…",
  });

  const tAi = performance.now();
  let analysis: FullAnalysis;
  let usedAI = false;

  try {
    analysis = await analyzeWithAI(fullText, file.name, pages, rawChars);
    usedAI = true;

    const bsCount = analysis.balanceSheet.items.length;
    const cfCount = analysis.cfItems?.length ?? 0;

    const segCount = analysis.segments?.length ?? 0;
    const fnCount = analysis.footnotes?.length ?? 0;
    const nrCount = analysis.nonRecurringItems?.length ?? 0;

    onStep({
      step: "extract_bs",
      label: pipeLabel("extract_bs"),
      status: "done",
      message: `AI extracted ${bsCount} BS + ${cfCount} IS/CF + ${segCount} segments + ${fnCount} footnotes + ${nrCount} adjustments`,
      durationMs: elapsed(tAi),
      detail: { method: "5-call-parallel", balanceSheetItems: bsCount, cashFlowItems: cfCount, segments: segCount, footnotes: fnCount, nonRecurring: nrCount },
    });
  } catch (aiErr) {
    onStep({
      step: "extract_bs",
      label: pipeLabel("extract_bs"),
      status: "error",
      message: `AI unavailable: ${aiErr instanceof Error ? aiErr.message : "error"} — falling back to heuristic`,
      durationMs: elapsed(tAi),
    });

    const tH = performance.now();
    onStep({ step: "extract_bs", label: pipeLabel("extract_bs"), status: "running", message: "Heuristic extraction…" });

    const { bs, cf } = heuristicExtract(lines);
    console.log(
      "[repurchase:pdf-heuristic-cf-items]",
      cf.map((i) => ({ tag: i.tag, label: i.label, value: i.value, source: i.source }))
    );
    onStep({
      step: "extract_bs", label: pipeLabel("extract_bs"), status: "done",
      message: `Heuristic found ${bs.length} BS + ${cf.length} CF items`,
      durationMs: elapsed(tH),
    });
    onStep({
      step: "extract_cf", label: pipeLabel("extract_cf"), status: "done",
      message: `Heuristic found ${cf.length} cash flow / income items`,
      durationMs: elapsed(tH),
    });

    analysis = assembleAnalysis(bs, cf, {
      source: "pdf", fileName: file.name, pagesRead: pages,
      charsExtracted: rawChars, periodEnd: detectPeriod(lines),
      confidence: "low",
      extractionMethod: "pdf-heuristic",
    });
  }

  if (usedAI) {
    const cfCount = analysis.cfItems?.length ?? 0;
    onStep({
      step: "extract_cf",
      label: pipeLabel("extract_cf"),
      status: "done",
      message: `${cfCount} income / cash flow items`,
      durationMs: 0,
      detail: { items: cfCount, tags: (analysis.cfItems ?? []).map((i) => i.tag) },
    });
  }

  // Compute & validate steps
  const computeSteps: { id: string; msg: () => string; detailFn: () => Record<string, unknown> }[] = [
    {
      id: "compute_capital",
      msg: () => `Assets: $${analysis.balanceSheet.totalAssets.toLocaleString()}M · Equity: $${analysis.balanceSheet.totalEquity.toLocaleString()}M`,
      detailFn: () => ({
        totalAssets: `$${analysis.balanceSheet.totalAssets.toLocaleString()}M`,
        totalLiabilities: `$${analysis.balanceSheet.totalLiabilities.toLocaleString()}M`,
        totalEquity: `$${analysis.balanceSheet.totalEquity.toLocaleString()}M`,
        cash: `$${analysis.balanceSheet.cashAndEquivalents.toLocaleString()}M`,
      }),
    },
    {
      id: "compute_debt",
      msg: () => `Net debt: $${analysis.debtStructure.netDebt.toLocaleString()}M · Total: $${analysis.debtStructure.totalDebt.toLocaleString()}M`,
      detailFn: () => ({
        shortTermDebt: `$${analysis.debtStructure.shortTermDebt.toLocaleString()}M`,
        longTermDebt: `$${analysis.debtStructure.longTermDebt.toLocaleString()}M`,
        totalDebt: `$${analysis.debtStructure.totalDebt.toLocaleString()}M`,
        netDebt: `$${analysis.debtStructure.netDebt.toLocaleString()}M`,
      }),
    },
    {
      id: "compute_ratios",
      msg: () => {
        const r = analysis.ratios;
        const parts: string[] = [];
        if (r.grossMargin != null) parts.push(`GM: ${r.grossMargin}%`);
        if (r.operatingMargin != null) parts.push(`OP: ${r.operatingMargin}%`);
        if (r.debtToEquity != null) parts.push(`D/E: ${r.debtToEquity}`);
        if (r.currentRatio != null) parts.push(`Current: ${r.currentRatio}`);
        return parts.length > 0 ? parts.join(" · ") : "Ratios computed";
      },
      detailFn: () => {
        const r = analysis.ratios;
        const d: Record<string, unknown> = {};
        if (r.grossMargin != null) d["Gross Margin"] = `${r.grossMargin}%`;
        if (r.operatingMargin != null) d["Operating Margin"] = `${r.operatingMargin}%`;
        if (r.netMargin != null) d["Net Margin"] = `${r.netMargin}%`;
        if (r.returnOnEquity != null) d["ROE"] = `${r.returnOnEquity}%`;
        if (r.debtToEquity != null) d["Debt/Equity"] = r.debtToEquity;
        if (r.currentRatio != null) d["Current Ratio"] = r.currentRatio;
        return d;
      },
    },
    {
      id: "dividend_assessment",
      msg: () => analysis.dividendAnalysis.headline,
      detailFn: () => ({
        verdict: analysis.dividendAnalysis.verdict,
        payoutNI: analysis.dividendAnalysis.payoutRatioNI != null ? `${analysis.dividendAnalysis.payoutRatioNI}%` : "N/A",
        payoutFCF: analysis.dividendAnalysis.payoutRatioFCF != null ? `${analysis.dividendAnalysis.payoutRatioFCF}%` : "N/A",
      }),
    },
    {
      id: "validate",
      msg: () => {
        const p = analysis.validation.checks.filter(c => c.passed).length;
        return `${p}/${analysis.validation.checks.length} checks passed`;
      },
      detailFn: () => {
        const d: Record<string, unknown> = {};
        for (const c of analysis.validation.checks) {
          d[c.name] = c.passed ? `PASS: ${c.note}` : `FAIL: ${c.note}`;
        }
        return d;
      },
    },
  ];

  for (const s of computeSteps) {
    onStep({ step: s.id, label: pipeLabel(s.id), status: "running", message: "Computing…" });
    await sleep(120);
    onStep({ step: s.id, label: pipeLabel(s.id), status: "done", message: s.msg(), durationMs: 120, detail: s.detailFn() });
  }

  // Footnotes + qualitative step
  {
    const fnLen = analysis.footnotes?.length ?? 0;
    const segLen = analysis.segments?.length ?? 0;
    const nrLen = analysis.nonRecurringItems?.length ?? 0;
    const hasNarrative = !!analysis.earningsNarrative;
    const adjLen = analysis.adjustedMetrics?.length ?? 0;

    if (fnLen || hasNarrative || segLen || nrLen || adjLen) {
      const parts: string[] = [];
      if (fnLen) parts.push(`${fnLen} footnotes`);
      if (segLen) parts.push(`${segLen} segments`);
      if (nrLen) parts.push(`${nrLen} non-recurring items`);
      if (adjLen) parts.push(`${adjLen} adjusted metrics`);
      if (hasNarrative) parts.push("Earnings narrative");
      onStep({
        step: "extract_footnotes", label: pipeLabel("extract_footnotes"), status: "done",
        message: parts.join(" · "),
        durationMs: 0,
        detail: { footnotes: fnLen, segments: segLen, nonRecurring: nrLen, adjustedMetrics: adjLen, narrative: hasNarrative },
      });
    } else {
      onStep({
        step: "extract_footnotes", label: pipeLabel("extract_footnotes"), status: "skipped",
        message: "Qualitative data not available",
      });
    }
  }

  // Complete
  const totalItems = analysis.balanceSheet.items.length + (analysis.cfItems?.length ?? 0);
  const totalSegments = analysis.segments?.length ?? 0;
  const totalFootnotes = analysis.footnotes?.length ?? 0;
  const totalNonRecurring = analysis.nonRecurringItems?.length ?? 0;
  onStep({
    step: "complete", label: pipeLabel("complete"), status: "done",
    message: `${usedAI ? "AI (5-call)" : "Heuristic"} — ${totalItems} financials + ${totalSegments} segments + ${totalFootnotes} notes + ${totalNonRecurring} adjustments in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
    durationMs: elapsed(t0),
    detail: {
      method: usedAI ? "5-call parallel AI" : "Heuristic",
      totalItems,
      segments: totalSegments,
      footnotes: totalFootnotes,
      nonRecurring: totalNonRecurring,
      company: analysis.meta.companyName ?? "Unknown",
      period: analysis.meta.periodEnd ?? "Unknown",
    },
  });

  return analysis;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function elapsed(start: number) { return Math.round(performance.now() - start); }
