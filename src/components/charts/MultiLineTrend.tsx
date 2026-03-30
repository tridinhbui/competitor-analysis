"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ChartSeries } from "@/types/slideBlocks";

const COLORS = [
  "#3b82f6", // blue
  "#f97316", // orange
  "#10b981", // emerald
  "#8b5cf6", // purple
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#ec4899", // pink
];

interface Props {
  series: ChartSeries[];
  height?: number;
  yAxisFormat?: "currency" | "percent" | "per-unit";
  yAxisLabel?: string;
}

/**
 * Multi-company line chart for SG&A trend, margin trend, etc.
 */
export function MultiLineTrend({ series, height = 280, yAxisFormat = "percent", yAxisLabel }: Props) {
  if (series.length === 0) return null;

  // Build unified data array keyed by label
  const labelSet = new Set<string>();
  for (const s of series) for (const d of s.data) labelSet.add(d.label);
  const labels = Array.from(labelSet);

  const data = labels.map((label) => {
    const entry: Record<string, string | number | null> = { label };
    for (const s of series) {
      const point = s.data.find((d) => d.label === label);
      entry[s.name] = point?.value ?? null;
    }
    return entry;
  });

  const yFmt = yAxisFormat === "currency"
    ? (v: number) => `$${v.toLocaleString()}`
    : yAxisFormat === "per-unit"
      ? (v: number) => `$${v.toFixed(2)}`
      : (v: number) => `${v}%`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={40}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yFmt}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#94a3b8" } } : undefined}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color ?? COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
