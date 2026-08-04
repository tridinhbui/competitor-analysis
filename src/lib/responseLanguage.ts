export type ResponseLanguage = "en" | "vi";

export function normalizeResponseLanguage(value: unknown): ResponseLanguage {
  return value === "vi" ? "vi" : "en";
}

/**
 * Instruction appended to AI system prompts so generated prose follows the
 * user's language preference.
 *
 * Deliberately keeps tickers, XBRL tags, citation markers, and standard
 * finance abbreviations (EBITDA, FCF, D/E, CAGR…) untranslated: Vietnamese
 * FP&A/IR analysts use those in their English form, and translating them
 * would break the inline [Source] citations the prompts require and make
 * figures harder to tie back to the filing.
 */
export function languageInstruction(language: ResponseLanguage): string {
  if (language !== "vi") return "";
  return `
LANGUAGE (critical):
- Write ALL prose, headers, bullets, and explanations in Vietnamese.
- Do NOT translate: ticker symbols, company names, XBRL tags, citation markers such as [XBRL:Assets] or [computed], or standard finance abbreviations (EBITDA, FCF, EPS, D/E, ROE, ROIC, CAGR, YoY, QoQ, CapEx, OCF).
- Keep all numbers, currency units, and date formats exactly as they appear in the source data — do not localize or reformat them.
- Use natural Vietnamese finance terminology (e.g. "doanh thu", "biên lợi nhuận gộp", "dòng tiền tự do", "đòn bẩy tài chính"), with the English term in parentheses on first use when the Vietnamese term is ambiguous.`;
}
