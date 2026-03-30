"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ChartSeries } from "@/types/slideBlocks";

interface Props {
  series: ChartSeries[];
  height?: number;
}

/**
 * Margin gap chart: two margin lines (subject vs peer) + gap bar.
 * Expects 2 line series (subject, peer). Gap is computed automatically.
 */
export function MarginGapChart({ series, height = 280 }: Props) {
  if (series.length < 1) return null;

  const subjectSeries = series[0];
  const peerSeries = series[1];

  // Build data array with gap
  const data = subjectSeries.data.map((d, i) => {
    const peerVal = peerSeries?.data[i]?.value ?? null;
    const gap =
      d.value != null && peerVal != null
        ? Math.round((d.value - peerVal) * 10) // bps
        : null;
    return {
      label: d.label,
      [subjectSeries.name]: d.value,
      ...(peerSeries ? { [peerSeries.name]: peerVal } : {}),
      gap,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          yAxisId="margin"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          yAxisId="gap"
          orientation="right"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}bps`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(value, name) => {
            const v = typeof value === "number" ? value : 0;
            if (name === "gap") return [`${v}bps`, "Gap"];
            return [`${v.toFixed(1)}%`, String(name)];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        <ReferenceLine yAxisId="gap" y={0} stroke="#94a3b8" strokeDasharray="3 3" />
        <Bar
          yAxisId="gap"
          dataKey="gap"
          fill="#94a3b8"
          opacity={0.3}
          radius={[2, 2, 0, 0]}
          maxBarSize={30}
          name="gap"
        />
        <Line
          yAxisId="margin"
          type="monotone"
          dataKey={subjectSeries.name}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
        />
        {peerSeries && (
          <Line
            yAxisId="margin"
            type="monotone"
            dataKey={peerSeries.name}
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3, fill: "#f97316" }}
            strokeDasharray="5 3"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
