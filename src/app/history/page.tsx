import { RequireAuth } from "@/components/auth/RequireAuth";
import { AnalysisHistoryPanel } from "@/components/history/AnalysisHistoryPanel";

export default function HistoryPage() {
  return (
    <RequireAuth>
      <AnalysisHistoryPanel />
    </RequireAuth>
  );
}
