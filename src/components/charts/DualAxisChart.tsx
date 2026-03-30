"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
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

const LINE_COLORS = [
  "#1e40af", // dark blue
  "#c2410c", // dark orange
  "#047857", // dark emerald
  "#6d28d9", // dark purple
];

interface Props {
  series: ChartSeries[];
  height?: number;
  stackBars?: boolean;
}

/**
 * Dual-axis chart: bars on left Y-axis (revenue/OP in $MM),
 * lines on right Y-axis (margin in %).
 *
 * Convention: series with color="line" render as lines on right axis.
 */
export function DualAxisChart({ series, height = 300, stackBars = false }: Props) {
  if (series.length === 0) return null;

  const barSeries = series.filter((s) => s.color !== "line");
  const lineSeries = series.filter((s) => s.color === "line");

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

  const hasLines = lineSeries.length > 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: hasLines ? 40 : 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
        />
        {hasLines && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
        )}
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
        />
        {barSeries.map((s, i) => (
          <Bar
            key={s.name}
            yAxisId="left"
            dataKey={s.name}
            fill={s.color && s.color !== "line" ? s.color : BAR_COLORS[i % BAR_COLORS.length]}
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
            stackId={stackBars ? "stack" : undefined}
          />
        ))}
        {lineSeries.map((s, i) => (
          <Line
            key={s.name}
            yAxisId="right"
            type="monotone"
            dataKey={s.name}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
