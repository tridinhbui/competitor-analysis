import type { DataSourceRow } from "@/types/dataSource";
import { METRIC_COLUMNS } from "@/types/dataSource";
import {
  buildCategorySections,
  type FilingCategorySection,
  type FilingMetricRow,
  metricLabelForField,
  unitForField,
  valueFromRow,
} from "@/lib/financialModelFromFiling";

const SKIP_KEYS = new Set<keyof DataSourceRow>([
  "id",
  "workflowOrigin",
  "ticker",
  "companyName",
  "periodEnd",
  "quarterLabel",
  "savedAt",
]);

export interface AiFinancialBoardPlan {
  headline: string;
  sections: Array<{
    title: string;
    sectionId?: string | null;
    metrics: Array<{ field: string; label?: string }>;
  }>;
}

function getRowNumber(row: DataSourceRow, field: keyof DataSourceRow): number | null {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidMetricField(field: string): field is keyof DataSourceRow {
  return METRIC_COLUMNS.some((col) => col.key === field);
}

function orderedPeriodRows(rows: DataSourceRow[]): DataSourceRow[] {
  const ttm = rows.find((r) => r.periodEnd === "TTM");
  const quarters = rows
    .filter((r) => r.periodEnd !== "TTM")
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  return [...(ttm ? [ttm] : []), ...quarters];
}

function periodLabel(row: DataSourceRow): string {
  return row.periodEnd === "TTM" ? "TTM" : row.quarterLabel?.trim() || row.periodEnd;
}

/** Compact payload for the AI — numbers only, no invented fields. */
export function buildFinancialBoardAiPayload(
  rows: DataSourceRow[],
  company: { ticker: string; companyName: string } | null,
): Record<string, unknown> {
  const periods = orderedPeriodRows(rows).map((row) => {
    const metrics: Record<string, number> = {};
    for (const col of METRIC_COLUMNS) {
      if (SKIP_KEYS.has(col.key)) continue;
      const v = getRowNumber(row, col.key);
      if (v != null) metrics[col.key] = v;
    }
    return {
      periodEnd: row.periodEnd,
      label: periodLabel(row),
      metrics,
    };
  });

  const availableFields = [...new Set(periods.flatMap((p) => Object.keys(p.metrics)))];

  return {
    ticker: company?.ticker ?? rows[0]?.ticker ?? "",
    companyName: company?.companyName ?? rows[0]?.companyName ?? "",
    availableFields,
    periods,
  };
}

function periodsForFields(rows: DataSourceRow[], fields: Array<keyof DataSourceRow>) {
  const cols: Array<{ label: string; row: DataSourceRow }> = [];
  for (const row of orderedPeriodRows(rows)) {
    const label = periodLabel(row);
    if (fields.some((field) => valueFromRow(row, field) != null)) {
      cols.push({ label, row });
    }
  }
  return cols;
}

/** Turn AI grouping plan into grid sections — values always from workbook rows. */
export function sectionsFromAiPlan(plan: AiFinancialBoardPlan, rows: DataSourceRow[]): FilingCategorySection[] {
  const used = new Set<keyof DataSourceRow>();
  const sections: FilingCategorySection[] = [];

  for (const section of plan.sections) {
    const fields: Array<keyof DataSourceRow> = [];
    const metricRows: FilingMetricRow[] = [];

    for (const metric of section.metrics) {
      if (!isValidMetricField(metric.field)) continue;
      const field = metric.field;
      if (used.has(field)) continue;
      if (!rows.some((row) => valueFromRow(row, field) != null)) continue;
      used.add(field);
      fields.push(field);
    }

    if (fields.length === 0) continue;

    const periodCols = periodsForFields(rows, fields);
    if (periodCols.length === 0) continue;

    for (const field of fields) {
      const meta = section.metrics.find((m) => m.field === field);
      metricRows.push({
        label: meta?.label?.trim() || metricLabelForField(field),
        sourceField: field,
        unit: unitForField(field),
        values: periodCols.map((p) => valueFromRow(p.row, field)),
      });
    }

    sections.push({
      title: section.title.toUpperCase(),
      sectionId: section.sectionId ?? undefined,
      columnHeaders: ["Line item", ...periodCols.map((p) => p.label)],
      rows: metricRows,
    });
  }

  const leftoverFields = METRIC_COLUMNS.map((col) => col.key).filter(
    (field) =>
      !SKIP_KEYS.has(field) &&
      !used.has(field) &&
      rows.some((row) => valueFromRow(row, field) != null),
  );

  if (leftoverFields.length > 0) {
    const periodCols = periodsForFields(rows, leftoverFields);
    if (periodCols.length > 0) {
      sections.push({
        title: "ADDITIONAL METRICS",
        columnHeaders: ["Line item", ...periodCols.map((p) => p.label)],
        rows: leftoverFields.map((field) => ({
          label: metricLabelForField(field),
          sourceField: field,
          unit: unitForField(field),
          values: periodCols.map((p) => valueFromRow(p.row, field)),
        })),
      });
    }
  }

  return sections.length > 0 ? sections : buildCategorySections(rows);
}

export async function generateAiFinancialBoard(
  rows: DataSourceRow[],
  company: { ticker: string; companyName: string } | null,
): Promise<{ headline: string; sections: FilingCategorySection[]; usedAi: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || rows.length === 0) {
    return {
      headline: "Grouped from extracted filing metrics",
      sections: buildCategorySections(rows),
      usedAi: false,
    };
  }

  const payload = buildFinancialBoardAiPayload(rows, company);
  if ((payload.availableFields as string[]).length === 0) {
    return {
      headline: "Analyze a filing to populate the financial board",
      sections: buildCategorySections(rows),
      usedAi: false,
    };
  }

  const systemPrompt = `You are a CFO building an underwriting financial board for investors.
Organize extracted quarterly metrics into 3–6 thematic sections. Group RELATED numbers together (e.g. revenue with margins, operating cash flow with capex and free cash flow, debt with cash and leverage ratios).

RULES:
- Use ONLY field keys listed in availableFields — never invent keys or dollar amounts.
- Each field appears in at most one section.
- Prefer insight-oriented section titles (e.g. "Profitability & margin structure", "Cash generation & capital deployment") — not generic "Income statement".
- Assign sectionId when it fits: "operating-cash-flow", "investment-cash-flow", "reversion-cash-flow", or null.
- Optional shorter row labels (label) — must describe the same metric as the field.
- Return ONLY valid JSON.`;

  const userPrompt = `Organize this company's metrics into a financial board:

${JSON.stringify(payload, null, 2)}

Return JSON:
{
  "headline": "one sentence on overall financial posture using only provided numbers",
  "sections": [
    {
      "title": "Thematic section name",
      "sectionId": "operating-cash-flow" | "investment-cash-flow" | "reversion-cash-flow" | null,
      "metrics": [{ "field": "exactKeyFromAvailableFields", "label": "optional display label" }]
    }
  ]
}`;

  const models = [process.env.OPENAI_MODEL?.trim(), "gpt-4o-mini", "gpt-4o"].filter(
    (m): m is string => Boolean(m),
  );

  for (const model of [...new Set(models)]) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (res.status === 429) continue;
      if (!res.ok) continue;

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content) as Partial<AiFinancialBoardPlan>;

      if (!parsed.sections || !Array.isArray(parsed.sections)) continue;

      const plan: AiFinancialBoardPlan = {
        headline: typeof parsed.headline === "string" ? parsed.headline : "",
        sections: parsed.sections
          .filter((s) => s && typeof s.title === "string" && Array.isArray(s.metrics))
          .map((s) => ({
            title: s.title as string,
            sectionId: s.sectionId ?? null,
            metrics: (s.metrics as Array<{ field?: string; label?: string }>)
              .filter((m) => m && typeof m.field === "string")
              .map((m) => ({ field: m.field as string, label: m.label })),
          })),
      };

      const sections = sectionsFromAiPlan(plan, rows);
      return {
        headline: plan.headline || "AI-grouped financial board",
        sections,
        usedAi: true,
      };
    } catch {
      continue;
    }
  }

  return {
    headline: "Grouped from extracted filing metrics",
    sections: buildCategorySections(rows),
    usedAi: false,
  };
}
