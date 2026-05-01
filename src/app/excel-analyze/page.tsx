import { RequireAuth } from "@/components/auth/RequireAuth";
import { ExcelAnalyzePanel } from "@/components/workspace/ExcelAnalyzePanel";

export default function ExcelAnalyzePage() {
  return (
    <RequireAuth>
      <ExcelAnalyzePanel />
    </RequireAuth>
  );
}

