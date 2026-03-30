"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { ChartSeries } from "@/types/slideBlocks";

const BAR_COLORS = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#10b981", // emerald
  "#8b5cf6", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
];

interface Props {
  series: ChartSeries[];
  height?: number;
  showChangeLabels?: boolean;
  valueFormat?: "currency" | "percent" | "number";
}

function formatTick(value: number, fmt: "currency" | "percent" | "number"): string {
  if (fmt === "currency") {
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}B`;
    return `$${value.toLocaleString()}M`;
  }
  if (fmt === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function formatLabel(value: number | null, prior: number | null, fmt: "currency" | "percent" | "number"): string {
  if (value == null || prior == null || prior === 0) return "";
  if (fmt === "percent") {
    const diff = value - prior;
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(1)}pp`;
  }
  const pctChange = ((value - prior) / Math.abs(prior)) * 100;
  const sign = pctChange > 0 ? "+" : "";
  return `${sign}${pctChange.toFixed(1)}%`;
}

/**
 * Grouped bar chart — side-by-side bars for period comparisons.
 * Each ChartSeries becomes one bar group. When exactly 2 series exist
 * and showChangeLabels is true, delta labels appear on the second bar.
 */
export function GroupedBarChart({
  series,
  height = 280,
  showChangeLabels = false,
  valueFormat = "number",
}: Props) {
  if (series.length === 0) return null;

  // Build unified data keyed by label
  const labelSet = new Set<string>();
  for (const s of series) for (const d of s.data) labelSet.add(d.label);
  const labels = Array.from(labelSet);

  const data = labels.map((label) => {
    const entry: Record<string, string | number | null> = { label };
    for (const s of series) {
      const point = s.data.find((d) => d.label === label);
      entry[s.name] = point?.value ?? null;
    }
    // Compute change label for the second series
    if (showChangeLabels && series.length === 2) {
      const v0 = series[0].data.find((d) => d.label === label)?.value ?? null;
      const v1 = series[1].data.find((d) => d.label === label)?.value ?? null;
      entry["__changeLabel"] = formatLabel(v1, v0, valueFormat);
    }
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
          angle={labels.length > 6 ? -20 : 0}
          textAnchor={labels.length > 6 ? "end" : "middle"}
          height={labels.length > 6 ? 50 : 30}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatTick(v, valueFormat)}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(value) => {
            const v = typeof value === "number" ? value : 0;
            return formatTick(v, valueFormat);
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Bar
            key={s.name}
            dataKey={s.name}
            fill={BAR_COLORS[i % BAR_COLORS.length]}
            radius={[2, 2, 0, 0]}
            maxBarSize={50}
          >
            {showChangeLabels && i === series.length - 1 && series.length === 2 && (
              <LabelList
                dataKey="__changeLabel"
                position="top"
                style={{ fontSize: 9, fill: "#475569", fontWeight: 600 }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
