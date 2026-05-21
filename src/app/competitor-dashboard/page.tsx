import { RequireAuth } from "@/components/auth/RequireAuth";
import { CompetitorDashboard } from "@/components/competitor-dashboard/CompetitorDashboard";

export default function CompetitorDashboardPage() {
  return (
    <RequireAuth>
      <CompetitorDashboard />
    </RequireAuth>
  );
}
