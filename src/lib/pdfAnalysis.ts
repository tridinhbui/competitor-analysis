/**
 * PDF → FullAnalysis pipeline.
 *
 * 1. Extract all text from PDF using pdf.js (client-side).
 * 2. Send full text to /api/analyze-pdf which uses OpenAI to parse financials.
 * 3. Fallback to heuristic extraction if API fails.
 */

import type { BSItem, FullAnalysis, StepEvent } from "@/types/analysis";
import { PIPELINE_STEPS } from "@/types/analysis";
import { assembleAnalysis } from "./analysisEngine";

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

export async function extractPdfLines(
  file: File
): Promise<{ lines: PdfLine[]; pages: number; rawChars: number; fullText: string }> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = doc.numPages;
  const allLines: PdfLine[] = [];
  let rawChars = 0;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const buckets = new Map<number, string[]>();
    const lineTexts: string[] = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      rawChars += item.str.length;
      const yKey = Math.round(
        "transform" in item ? (item.transform as number[])[5] : 0
      );
      if (!buckets.has(yKey)) buckets.set(yKey, []);
      buckets.get(yKey)!.push(item.str);
    }

    const sortedYs = [...buckets.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const text = buckets.get(y)!.join(" ").trim();
      if (text) {
        allLines.push({ page: p, y, text });
        lineTexts.push(text);
      }
    }
    pageTexts.push(lineTexts.join("\n"));
  }

  return { lines: allLines, pages, rawChars, fullText: pageTexts.join("\n\n--- Page Break ---\n\n") };
}

// ===========================================================================
// 2. AI-powered extraction via /api/analyze-pdf
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

  const data = (await resp.json()) as { analysis?: FullAnalysis; error?: string };
  if (!data.analysis) {
    throw new Error(data.error ?? "No analysis result from API");
  }
  return data.analysis;
}

// ===========================================================================
// 3. Heuristic fallback (simplified from previous version)
// ===========================================================================

type Scale = 1 | 1_000 | 1_000_000 | 1_000_000_000;

function detectScale(lines: PdfLine[]): Scale {
  const sample = lines
    .slice(0, Math.min(lines.length, 120))
    .map((l) => l.text.toLowerCase())
    .join(" ");

  if (/in\s+billions/i.test(sample)) return 1_000_000_000;
  if (/in\s+millions|\(millions\)|amounts?\s+in\s+millions/i.test(sample)) return 1_000_000;
  if (/in\s+thousands|\(thousands\)|amounts?\s+in\s+thousands/i.test(sample)) return 1_000;
  return 1;
}

type Section = "unknown" | "balance_sheet" | "income" | "cash_flow" | "equity" | "comprehensive_income" | "notes";

const SECTION_PATTERNS: [RegExp, Section][] = [
  [/consolidated\s+balance\s+sheet/i, "balance_sheet"],
  [/condensed\s+consolidated\s+balance\s+sheet/i, "balance_sheet"],
  [/balance\s+sheet/i, "balance_sheet"],
  [/financial\s+position/i, "balance_sheet"],
  [/consolidated\s+statements?\s+of\s+(operations?|income|earnings)/i, "income"],
  [/condensed\s+consolidated\s+statements?\s+of\s+(operations?|income)/i, "income"],
  [/statements?\s+of\s+income/i, "income"],
  [/consolidated\s+statements?\s+of\s+cash\s+flow/i, "cash_flow"],
  [/condensed\s+consolidated\s+statements?\s+of\s+cash\s+flow/i, "cash_flow"],
  [/cash\s+flow/i, "cash_flow"],
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
    const t = lines[i].text;
    for (const [re, sec] of SECTION_PATTERNS) {
      if (re.test(t)) {
        if (cur !== "unknown") spans.push({ section: cur, startIdx, endIdx: i });
        cur = sec;
        startIdx = i;
        break;
      }
    }
  }
  if (cur !== "unknown") spans.push({ section: cur, startIdx, endIdx: lines.length });
  return spans;
}

interface ParsedLine { label: string; numbers: number[]; raw: string; page: number; lineIdx: number; }

const NUM_RE = /\(?\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*\)?|—|–|-\s*$/g;

function parseMoneyToken(raw: string): number | null {
  const s0 = raw.trim();
  if (s0 === "—" || s0 === "–" || s0 === "-") return 0;
  let s = s0.replace(/[$,\s]/g, "");
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) { s = s.slice(1, -1); neg = true; }
  if (s.startsWith("-")) { s = s.slice(1); neg = true; }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
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
  { tag: "Assets", label: "Total assets", keywords: [/^total\s+assets$/i], section: ["balance_sheet"] },
  { tag: "AssetsCurrent", label: "Current assets", keywords: [/^total\s+current\s+assets$/i, /^current\s+assets$/i], section: ["balance_sheet"] },
  { tag: "CashAndCashEquivalentsAtCarryingValue", label: "Cash & equivalents", keywords: [/^cash\s+and\s+(cash\s+)?equivalents/i] },
  { tag: "AccountsReceivableNet", label: "Accounts receivable", keywords: [/^(trade\s+)?accounts?\s+receivable/i, /^receivables/i] },
  { tag: "InventoryNet", label: "Inventories", keywords: [/^inventor(y|ies)/i] },
  { tag: "PropertyPlantAndEquipmentNet", label: "PP&E, net", keywords: [/^property.*equipment.*net/i, /^pp&e/i] },
  { tag: "Goodwill", label: "Goodwill", keywords: [/^goodwill$/i] },
  { tag: "Liabilities", label: "Total liabilities", keywords: [/^total\s+liabilities$/i], section: ["balance_sheet"] },
  { tag: "LiabilitiesCurrent", label: "Current liabilities", keywords: [/^total\s+current\s+liabilities$/i, /^current\s+liabilities$/i] },
  { tag: "DebtCurrent", label: "Current debt", keywords: [/^current\s+portion.*long-?term\s+debt/i, /^short-?term\s+(debt|borrowings?)/i, /^current\s+debt/i] },
  { tag: "LongTermDebtNoncurrent", label: "Long-term debt", keywords: [/^long-?term\s+debt/i, /^non-?current.*debt/i] },
  { tag: "StockholdersEquity", label: "Total stockholders' equity", keywords: [/^total\s+(stock|share)holders.?\s+equity/i, /^total\s+equity/i] },
  { tag: "RetainedEarningsAccumulatedDeficit", label: "Retained earnings", keywords: [/^retained\s+earnings/i, /^accumulated\s+deficit/i] },
  { tag: "LiabilitiesAndStockholdersEquity", label: "Total liab. + equity", keywords: [/^total\s+liabilities\s+(and|&)\s+(stock|share)holders/i] },
];

const CF_DEFS: ItemDef[] = [
  { tag: "Revenues", label: "Revenue", keywords: [/^(total\s+)?(net\s+)?revenue/i, /^net\s+sales/i], section: ["income"] },
  { tag: "GrossProfit", label: "Gross profit", keywords: [/^gross\s+(profit|margin)/i] },
  { tag: "OperatingIncomeLoss", label: "Operating income", keywords: [/^operating\s+(income|loss)/i] },
  { tag: "InterestExpense", label: "Interest expense", keywords: [/^interest\s+expense/i] },
  { tag: "NetIncomeLoss", label: "Net income", keywords: [/^net\s+(income|loss|earnings)/i], section: ["income"] },
  { tag: "NetCashProvidedByOperatingActivities", label: "Operating cash flow", keywords: [/^(net\s+)?cash\s+(provided|generated|used).*operating/i], section: ["cash_flow"] },
  { tag: "PaymentsToAcquirePropertyPlantAndEquipment", label: "Capital expenditures", keywords: [/^(capital\s+expenditures?|purchases?\s+of\s+property)/i], abs: true },
  { tag: "PaymentsOfDividends", label: "Dividends paid", keywords: [/^(payments?\s+of\s+)?dividends?\s+paid/i], abs: true },
];

function heuristicExtract(lines: PdfLine[], fileName: string): { bs: BSItem[]; cf: BSItem[] } {
  const scale = detectScale(lines);
  const sections = detectSections(lines);
  const periodLabel = detectPeriod(lines);
  const parsed = lines.map((l, i) => parseLine(l, i));

  function sectionOf(lineIdx: number): Section {
    for (const s of sections) { if (lineIdx >= s.startIdx && lineIdx < s.endIdx) return s.section; }
    return "unknown";
  }

  function matchDef(def: ItemDef, pl: ParsedLine): boolean {
    if (pl.numbers.length === 0) return false;
    const sec = sectionOf(pl.lineIdx);
    if (def.section?.length && !def.section.includes(sec) && sec !== "unknown") return false;
    return def.keywords.some((re) => re.test(pl.label));
  }

  function extractValue(def: ItemDef, pl: ParsedLine): number {
    const idx = def.numIdx ?? 0;
    let v = pl.numbers[Math.min(idx, pl.numbers.length - 1)] ?? 0;
    if (def.abs) v = Math.abs(v);
    if (scale >= 1_000_000) return Math.round(v);
    if (scale === 1_000) return Math.round(v / 1_000);
    return Math.round(v / 1_000_000);
  }

  const found = new Set<string>();
  const bs: BSItem[] = [];
  const cf: BSItem[] = [];

  for (const pl of parsed) {
    for (const def of BS_DEFS) {
      if (found.has(def.tag) || !matchDef(def, pl)) continue;
      found.add(def.tag);
      bs.push({ tag: def.tag, label: def.label, value: extractValue(def, pl), period: periodLabel, source: `PDF:p${pl.page}:"${pl.label.slice(0, 60)}"` });
    }
    for (const def of CF_DEFS) {
      if (found.has(def.tag) || !matchDef(def, pl)) continue;
      found.add(def.tag);
      cf.push({ tag: def.tag, label: def.label, value: extractValue(def, pl), period: periodLabel, source: `PDF:p${pl.page}:"${pl.label.slice(0, 60)}"` });
    }
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

  // Step 2: Resolve — extract text
  const t1 = performance.now();
  onStep({ step: "resolve", label: pipeLabel("resolve"), status: "running", message: "Extracting all text from PDF pages…" });

  const { lines, pages, rawChars, fullText } = await extractPdfLines(file);
  onStep({
    step: "resolve", label: pipeLabel("resolve"), status: "done",
    message: `${pages} pages · ${lines.length.toLocaleString()} lines · ${rawChars.toLocaleString()} chars extracted`,
    durationMs: elapsed(t1),
    detail: { pages, lines: lines.length, chars: rawChars, avgLinesPerPage: Math.round(lines.length / Math.max(pages, 1)) },
  });

  // Step 3: AI analysis (or heuristic fallback)
  onStep({ step: "fetch_xbrl", label: pipeLabel("fetch_xbrl"), status: "running", message: "Sending extracted text to AI for financial analysis…" });

  const tAi = performance.now();
  let analysis: FullAnalysis;
  let usedAI = false;

  try {
    analysis = await analyzeWithAI(fullText, file.name, pages, rawChars);
    usedAI = true;

    const bsCount = analysis.balanceSheet.items.length;
    const cfCount = analysis.cfItems?.length ?? 0;

    onStep({
      step: "fetch_xbrl", label: pipeLabel("fetch_xbrl"), status: "done",
      message: `AI extracted ${bsCount + cfCount} financial line items`,
      durationMs: elapsed(tAi),
      detail: { method: "OpenAI", balanceSheetItems: bsCount, cashFlowItems: cfCount, model: "gpt-4o-mini" },
    });
  } catch (aiErr) {
    onStep({
      step: "fetch_xbrl", label: pipeLabel("fetch_xbrl"), status: "error",
      message: `AI unavailable: ${aiErr instanceof Error ? aiErr.message : "error"} — falling back to heuristic`,
      durationMs: elapsed(tAi),
      detail: { error: aiErr instanceof Error ? aiErr.message : String(aiErr) },
    });

    const tH = performance.now();
    onStep({ step: "extract_bs", label: pipeLabel("extract_bs"), status: "running", message: "Heuristic: detecting scale & statement boundaries…" });

    const { bs, cf } = heuristicExtract(lines, file.name);
    onStep({
      step: "extract_bs", label: pipeLabel("extract_bs"), status: "done",
      message: `Heuristic found ${bs.length} balance sheet items`,
      durationMs: elapsed(tH),
      detail: { method: "heuristic", bsItems: bs.length, tags: bs.map(b => b.tag) },
    });

    onStep({
      step: "extract_cf", label: pipeLabel("extract_cf"), status: "done",
      message: `Heuristic found ${cf.length} cash flow / income items`,
      durationMs: elapsed(tH),
      detail: { method: "heuristic", cfItems: cf.length, tags: cf.map(c => c.tag) },
    });

    analysis = assembleAnalysis(bs, cf, {
      source: "pdf", fileName: file.name, pagesRead: pages,
      charsExtracted: rawChars, periodEnd: detectPeriod(lines),
      confidence: "low",
      extractionMethod: "pdf-heuristic",
    });
  }

  // Steps 4-5: Extract (for AI path, report what was extracted)
  if (usedAI) {
    const bsCount = analysis.balanceSheet.items.length;
    const cfCount = analysis.cfItems?.length ?? 0;
    const bsTags = analysis.balanceSheet.items.map(i => i.tag);
    const cfTags = (analysis.cfItems ?? []).map(i => i.tag);

    onStep({
      step: "extract_bs", label: pipeLabel("extract_bs"), status: "done",
      message: `${bsCount} balance sheet items extracted via AI`,
      durationMs: 0,
      detail: { items: bsCount, tags: bsTags, topItems: analysis.balanceSheet.items.slice(0, 5).map(i => `${i.label}: ${i.value}M`) },
    });
    onStep({
      step: "extract_cf", label: pipeLabel("extract_cf"), status: "done",
      message: `${cfCount} cash flow / P&L items extracted via AI`,
      durationMs: 0,
      detail: { items: cfCount, tags: cfTags, topItems: (analysis.cfItems ?? []).slice(0, 5).map(i => `${i.label}: ${i.value}M`) },
    });
  }

  // Steps 6-10: Compute & validate
  const computeSteps: { id: string; msg: () => string; detailFn: () => Record<string, unknown> }[] = [
    {
      id: "compute_capital",
      msg: () => `Assets: $${analysis.balanceSheet.totalAssets.toLocaleString()}M · Equity: $${analysis.balanceSheet.totalEquity.toLocaleString()}M`,
      detailFn: () => ({
        totalAssets: `$${analysis.balanceSheet.totalAssets.toLocaleString()}M`,
        totalLiabilities: `$${analysis.balanceSheet.totalLiabilities.toLocaleString()}M`,
        totalEquity: `$${analysis.balanceSheet.totalEquity.toLocaleString()}M`,
        cash: `$${analysis.balanceSheet.cashAndEquivalents.toLocaleString()}M`,
        retainedEarnings: `$${analysis.balanceSheet.retainedEarnings.toLocaleString()}M`,
      }),
    },
    {
      id: "compute_debt",
      msg: () => `Net debt: $${analysis.debtStructure.netDebt.toLocaleString()}M · Total debt: $${analysis.debtStructure.totalDebt.toLocaleString()}M`,
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
        if (r.debtToEquity != null) parts.push(`D/E: ${r.debtToEquity}`);
        if (r.currentRatio != null) parts.push(`Current: ${r.currentRatio}`);
        if (r.interestCoverage != null) parts.push(`Int. coverage: ${r.interestCoverage}x`);
        return parts.length > 0 ? parts.join(" · ") : "Ratios computed";
      },
      detailFn: () => {
        const r = analysis.ratios;
        const d: Record<string, unknown> = {};
        if (r.debtToEquity != null) d["Debt/Equity"] = r.debtToEquity;
        if (r.debtToCapital != null) d["Debt/Capital"] = r.debtToCapital;
        if (r.netDebtToEbitda != null) d["Net Debt/EBITDA"] = r.netDebtToEbitda;
        if (r.interestCoverage != null) d["Interest Coverage"] = `${r.interestCoverage}x`;
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
        fcfCoverage: analysis.dividendAnalysis.fcfCoverageYears != null ? `${analysis.dividendAnalysis.fcfCoverageYears} years` : "N/A",
        cashCoverage: analysis.dividendAnalysis.cashCoverageYears != null ? `${analysis.dividendAnalysis.cashCoverageYears} years` : "N/A",
      }),
    },
    {
      id: "validate",
      msg: () => {
        const p = analysis.validation.checks.filter(c => c.passed).length;
        const t = analysis.validation.checks.length;
        return `${p}/${t} checks passed`;
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

  // Final complete step
  const totalItems = analysis.balanceSheet.items.length + (analysis.cfItems?.length ?? 0);
  onStep({
    step: "complete", label: pipeLabel("complete"), status: "done",
    message: `${usedAI ? "AI" : "Heuristic"} analysis — ${totalItems} items in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
    durationMs: elapsed(t0),
    detail: {
      method: usedAI ? "AI (OpenAI)" : "Heuristic",
      totalItems,
      totalDuration: `${((performance.now() - t0) / 1000).toFixed(1)}s`,
      company: analysis.meta.companyName ?? "Unknown",
      period: analysis.meta.periodEnd ?? "Unknown",
    },
  });

  return analysis;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function elapsed(start: number) { return Math.round(performance.now() - start); }
