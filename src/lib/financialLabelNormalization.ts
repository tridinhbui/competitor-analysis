/**
 * SEC filing financial line-item label normalization: synonyms → standard schema fields.
 * Use for resilient matching when PDF/LLM extraction returns varied wording.
 *
 * Does not extract numbers — only maps label text to canonical keys.
 */

export type FinancialStandardField =
  | "revenue"
  | "cost_of_revenue"
  | "gross_profit"
  | "sga_expense"
  | "rd_expense"
  | "operating_income"
  | "ebitda"
  | "net_income"
  | "total_assets"
  | "total_liabilities"
  | "total_equity"
  | "cash"
  | "short_term_debt"
  | "long_term_debt"
  | "operating_cash_flow"
  | "capital_expenditures";

/** Primary synonyms per standard field (lowercase phrases; match is substring after normalization). */
export const FINANCIAL_LABEL_SYNONYMS: Record<FinancialStandardField, readonly string[]> = {
  revenue: [
    "net sales",
    "total net sales",
    "net revenue",
    "total revenue",
    "total net revenue",
    "sales",
    "total sales",
    "revenues",
    "net revenues",
    "revenue from contracts with customers",
    "revenue from contract with customer",
    "product sales",
    "net product sales",
    "consolidated net sales",
    "consolidated revenues",
    "sales to customers",
    "turnover",
    "total turnover",
  ],
  cost_of_revenue: [
    "cost of sales",
    "cost of products sold",
    "cost of goods sold",
    "cost of goods and services sold",
    "cost of products",
    "cost of revenue",
    "cost of services",
    "cogs",
    "total cost of sales",
    "total cost of goods sold",
    "cost of products sold and cost of services",
  ],
  gross_profit: [
    "gross profit",
    "gross earnings",
    "gross margin",
    "gross income",
    "profit from operations before operating expenses",
  ],
  sga_expense: [
    "selling, general and administrative",
    "selling, general & administrative",
    "selling general and administrative",
    "sg&a",
    "sga",
    "selling and administrative expenses",
    "selling & administrative expenses",
    "general and administrative",
    "general & administrative",
    "selling and marketing expenses",
    "marketing, general and administrative",
    "total selling, general and administrative",
  ],
  rd_expense: [
    "research and development",
    "research & development",
    "r&d",
    "product development",
    "research and development expense",
    "research and engineering",
    "technology and content",
    "in-process research and development",
  ],
  operating_income: [
    "operating income",
    "income from operations",
    "operating profit",
    "operating earnings",
    "income (loss) from operations",
    "operating income (loss)",
    "earnings from operations",
    "profit from operations",
  ],
  ebitda: [
    "ebitda",
    "adjusted ebitda",
    "earnings before interest taxes depreciation and amortization",
    "earnings before interest, taxes, depreciation and amortization",
    "adjusted earnings before interest, taxes, depreciation and amortization",
    "ebitda (non-gaap)",
    "consolidated ebitda",
  ],
  net_income: [
    "net income",
    "net earnings",
    "net profit",
    "profit for the period",
    "net income attributable to",
    "net earnings attributable to",
    "net income (loss)",
    "net loss",
    "earnings",
    "income attributable to common stockholders",
    "income attributable to parent",
    "consolidated net income",
  ],
  total_assets: [
    "total assets",
    "assets total",
    "sum of total assets",
    "consolidated total assets",
  ],
  total_liabilities: [
    "total liabilities",
    "liabilities total",
    "sum of total liabilities",
  ],
  total_equity: [
    "total stockholders' equity",
    "total stockholders’ equity",
    "total shareholders' equity",
    "total shareholders’ equity",
    "total equity",
    "stockholders' equity",
    "stockholders’ equity",
    "shareholders' equity",
    "shareholders’ equity",
    "total shareholders' investment",
    "shareholders' investment",
    "total parent company equity",
    "members' equity",
    "owners' equity",
    "total stockholders equity",
    "total shareholders equity",
    "company share of equity",
  ],
  cash: [
    "cash and cash equivalents",
    "cash & cash equivalents",
    "cash and equivalents",
    "cash, cash equivalents",
    "cash and due from banks",
    "cash and short-term investments",
    "cash",
  ],
  short_term_debt: [
    "short-term debt",
    "short term debt",
    "current portion of long-term debt",
    "current maturities of long-term debt",
    "notes payable, short-term",
    "short-term borrowings",
    "short term borrowings",
    "commercial paper",
    "current portion of debt",
    "revolving credit facility",
    "lines of credit",
    "current debt",
  ],
  long_term_debt: [
    "long-term debt",
    "long term debt",
    "non-current debt",
    "notes payable, long-term",
    "long-term borrowings",
    "long term borrowings",
    "senior notes",
    "term loan",
    "debentures",
    "total long-term debt",
  ],
  operating_cash_flow: [
    "net cash provided by operating activities",
    "net cash from operating activities",
    "cash flows from operating activities",
    "cash provided by operating activities",
    "net cash used in operating activities",
    "cash from operations",
    "operating cash flows",
  ],
  capital_expenditures: [
    "capital expenditures",
    "capital expenditure",
    "purchases of property, plant and equipment",
    "payments for property, plant and equipment",
    "additions to property, plant and equipment",
    "purchases of ppe",
    "capital additions",
    "purchase of property and equipment",
  ],
} as const;

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Flat map: each synonym phrase → standard field (first occurrence wins if building manually). */
export function getFlatNormalizedMapping(): Record<string, FinancialStandardField> {
  const out: Record<string, FinancialStandardField> = {};
  for (const field of Object.keys(FINANCIAL_LABEL_SYNONYMS) as FinancialStandardField[]) {
    for (const phrase of FINANCIAL_LABEL_SYNONYMS[field]) {
      if (!(phrase in out)) {
        out[phrase] = field;
      }
    }
  }
  return out;
}

type PhraseField = { phrase: string; field: FinancialStandardField; len: number };

let _sortedPhrases: PhraseField[] | null = null;

function sortedPhraseList(): PhraseField[] {
  if (_sortedPhrases) return _sortedPhrases;
  const list: PhraseField[] = [];
  for (const field of Object.keys(FINANCIAL_LABEL_SYNONYMS) as FinancialStandardField[]) {
    for (const phrase of FINANCIAL_LABEL_SYNONYMS[field]) {
      const p = normalizeForMatch(phrase);
      list.push({ phrase: p, field, len: p.length });
    }
  }
  list.sort((a, b) => b.len - a.len);
  _sortedPhrases = list;
  return list;
}

/**
 * Map a single line/label (e.g. table row caption) to a standard field, or null.
 * Longer synonym phrases win over shorter ones (e.g. "net sales" before "sales").
 */
export function matchFinancialLabelToField(rawLabel: string): FinancialStandardField | null {
  const n = normalizeForMatch(rawLabel);
  if (!n) return null;
  for (const { phrase, field } of sortedPhraseList()) {
    if (n.includes(phrase)) {
      return field;
    }
  }
  return null;
}

/**
 * Scan raw filing text and return which synonym phrases appear, mapped to standard fields.
 * Original keys are the matched synonym substring (first occurrence position, longest phrase per field wins).
 */
export function findNormalizedMappingsInText(text: string): Record<string, FinancialStandardField> {
  const hay = normalizeForMatch(text);
  const result: Record<string, FinancialStandardField> = {};
  const seenFields = new Set<FinancialStandardField>();

  for (const { phrase, field } of sortedPhraseList()) {
    if (seenFields.has(field)) continue;
    let idx = hay.indexOf(phrase);
    if (idx === -1) continue;
    seenFields.add(field);
    result[phrase] = field;
  }

  return result;
}

/** JSON shape requested for API / LLM consumers. */
export function buildNormalizedMappingJson(): {
  normalized_mapping: Record<string, FinancialStandardField>;
} {
  return { normalized_mapping: getFlatNormalizedMapping() };
}
