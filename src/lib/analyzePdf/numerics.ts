import type { BSItem } from "@/types/analysis";

export function toNumOrNull(v: number | string | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (
      trimmed === "" ||
      trimmed === "-" ||
      trimmed === "\u2013" ||
      trimmed === "\u2014" ||
      trimmed === "\u00e2\u20ac\u201c" ||
      trimmed === "\u00e2\u20ac\u201d" ||
      /^n\/?a$/i.test(trimmed)
    ) {
      return null;
    }

    let normalized = trimmed.replace(/[,$\s]/g, "");
    let negative = false;
    if (normalized.startsWith("(") && normalized.endsWith(")")) {
      normalized = normalized.slice(1, -1);
      negative = true;
    }

    const n = Number(normalized);
    if (Number.isNaN(n)) return null;
    return Math.round(negative ? -n : n);
  }
  return Number.isFinite(v) ? Math.round(v) : null;
}

export function toBsItems(
  items: { tag: string; label: string; value: number | string | null }[] | undefined,
  period: string,
  sourcePrefix: string
): BSItem[] {
  const out: BSItem[] = [];
  for (const item of items ?? []) {
    const value = toNumOrNull(item.value);
    if (value == null) continue;
    out.push({
      tag: item.tag,
      label: item.label,
      value,
      period,
      source: `${sourcePrefix}:${item.tag}`,
    });
  }
  return out;
}
