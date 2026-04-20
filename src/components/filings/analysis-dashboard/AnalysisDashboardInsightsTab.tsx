"use client";

import type { FullAnalysis } from "@/types/analysis";
import type { MetricTraceSpec } from "@/lib/metricTraceLabels";
import { useInsightsTabModel } from "./useInsightsTabModel";
import { InsightsTabActionsAndHealthSection } from "./InsightsTabActionsAndHealthSection";
import { InsightsTabTrendsSection } from "./InsightsTabTrendsSection";
import { InsightsTabPeersValuationSection } from "./InsightsTabPeersValuationSection";
import { InsightsTabDeepDiveSection } from "./InsightsTabDeepDiveSection";

export function InsightsTab({
  result,
  onMetricTableRowClick,
}: {
  result: FullAnalysis;
  onMetricTableRowClick?: (label: string, extra?: Record<string, MetricTraceSpec>) => void;
}) {
  const model = useInsightsTabModel(result);

  return (
    <div className="space-y-4">
      <InsightsTabActionsAndHealthSection model={model} />
      <InsightsTabTrendsSection model={model} onMetricTableRowClick={onMetricTableRowClick} />
      <InsightsTabPeersValuationSection model={model} />
      <InsightsTabDeepDiveSection model={model} onMetricTableRowClick={onMetricTableRowClick} />
    </div>
  );
}
