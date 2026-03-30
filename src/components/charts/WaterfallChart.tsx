"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { BridgeComponent } from "@/lib/bridgeEngine";

interface Props {
  components: BridgeComponent[];
  height?: number;
}

/**
 * Waterfall chart for OP bridge decomposition.
 * Uses stacked bars: invisible base + visible delta.
 */
export function WaterfallChart({ components, height = 280 }: Props) {
  if (components.length === 0) return null;

  // Build chart data: each bar has a base (invisible) and a visible part
  const data = components.map((c) => {
    if (c.type === "start" || c.type === "end") {
      return {
        name: c.label,
        base: 0,
        value: c.value,
        raw: c.value,
        type: c.type,
      };
    }
    // Delta bar
    const base = c.value >= 0 ? c.runningTotal - c.value : c.runningTotal;
    return {
      name: c.label,
      base: Math.max(0, base),
      value: Math.abs(c.value),
      raw: c.value,
      type: c.type,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
          formatter={(_, name, props) => {
            const raw = props.payload?.raw as number;
            const sign = raw > 0 ? "+" : "";
            return [`$${sign}${raw.toLocaleString()}MM`, name === "value" ? "Amount" : ""];
          }}
        />
        <ReferenceLine y={0} stroke="#94a3b8" />
        {/* Invisible base bar */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" />
        {/* Visible value bar */}
        <Bar dataKey="value" stackId="waterfall" radius={[2, 2, 0, 0]}>
          {data.map((entry, index) => {
            let fill: string;
            if (entry.type === "start" || entry.type === "end") {
              fill = "#3b82f6"; // blue for totals
            } else if (entry.raw >= 0) {
              fill = "#10b981"; // emerald for positive deltas
            } else {
              fill = "#ef4444"; // red for negative deltas
            }
            return <Cell key={index} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
