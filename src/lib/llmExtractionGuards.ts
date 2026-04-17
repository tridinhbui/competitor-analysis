/**
 * Guards for OpenAI-based filing extraction: skip the model when PDF/HTML text
 * is missing, too short, or lacks recognizable financial-statement content.
 */

export function hasFinancialTableIndicators(text: string): boolean {
  const indicators = [
    "balance sheets",
    "consolidated balance sheets",
    "statements of operations",
    "statements of income",
    "statements of earnings",
    "statements of cash flows",
    "total assets",
    "total liabilities",
    "total stockholders' equity",
    "net sales",
    "net income",
    "operating activities",
  ];

  const lower = text.toLowerCase();
  return indicators.some((i) => lower.includes(i));
}

export function shouldRunExtraction(text?: string | null): boolean {
  if (!text) return false;
  if (text.trim().length < 500) return false;
  return hasFinancialTableIndicators(text);
}
