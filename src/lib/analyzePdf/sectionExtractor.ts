/**
 * Find ALL occurrences of section patterns and combine them.
 * Ensures segment data in multiple places (e.g. segment note + MD&A) is not missed.
 */
export function findSection(text: string, patterns: RegExp[], maxLen: number): string {
  const chunks: string[] = [];
  let totalLen = 0;
  const usedOffsets = new Set<number>();

  for (const re of patterns) {
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = globalRe.exec(text)) !== null) {
      const idx = match.index;
      const rounded = Math.floor(idx / 1000) * 1000;
      if (usedOffsets.has(rounded)) continue;
      usedOffsets.add(rounded);

      const chunkLen = Math.min(maxLen, Math.max(maxLen, 15_000));
      const slice = text.slice(idx, idx + chunkLen);
      chunks.push(slice);
      totalLen += slice.length;
      if (totalLen >= maxLen * 2) break;
    }
    if (totalLen >= maxLen * 2) break;
  }

  return chunks.join("\n\n---\n\n");
}

export function extractSections(text: string): {
  bsText: string;
  isCfText: string;
  qualText: string;
  segmentText: string;
} {
  const bsText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?balance\s+sheet/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?financial\s+position/i,
  ], 22_000);

  const isText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(?:operations?|income|earnings)/i,
    /(?:condensed\s+)?(?:consolidated\s+)?(?:statements?\s+of\s+)?(?:income|earnings)/i,
  ], 18_000);

  const cfText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+cash\s+flow/i,
    /(?:condensed\s+)?(?:consolidated\s+)?cash\s+flow/i,
  ], 18_000);

  const mdaText = findSection(text, [
    /management.?s?\s+discussion\s+and\s+analysis/i,
    /results\s+of\s+operations/i,
  ], 30_000);

  const notesText = findSection(text, [
    /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements/i,
  ], 30_000);

  const segText = findSection(text, [
    /(?:segment|operating\s+segments?)\s+(?:results|information|data|reporting)/i,
    /results\s+of\s+operations\s+(?:by|for)\s+(?:each\s+)?segment/i,
    /segment\s+(?:financial\s+)?(?:results|performance)/i,
    /(?:reportable\s+)?segments/i,
    /(?:beef|pork|chicken|prepared\s+foods?|packaged\s+meats?|international)\s+segment/i,
    /note\s+\d+[\.\:\-\s]+(?:segment|business\s+segment|operating\s+segment)/i,
  ], 25_000);

  // Equity statement — SBC is sometimes only shown here (e.g. recently-IPO'd companies)
  const equityText = findSection(text, [
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(changes\s+in\s+)?(stockholders|shareholders).?\s+equity/i,
    /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+equity/i,
  ], 8_000);

  const isCfText = [isText, cfText, equityText].filter(Boolean).join("\n\n---\n\n");
  const qualText = [mdaText, notesText].filter(Boolean).join("\n\n---\n\n");
  const segmentText = [segText, mdaText].filter(Boolean).join("\n\n---\n\n");

  return { bsText, isCfText, qualText, segmentText };
}
