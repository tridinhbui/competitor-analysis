import { RequireAuth } from "@/components/auth/RequireAuth";
import { EarningsScriptAnalysisPanel } from "@/components/workspace/EarningsScriptAnalysisPanel";

export default function EarningsAnalysisPage() {
  return (
    <RequireAuth>
      <EarningsScriptAnalysisPanel />
    </RequireAuth>
  );
}

