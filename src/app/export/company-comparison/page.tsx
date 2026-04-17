import { ComparisonPrintPage } from "@/components/workspace/ComparisonPrintPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  buildCompanyComparisonPayload,
  CompanyComparisonRequestError,
} from "@/lib/companyComparisonPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CompanyComparisonExportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  let result = null;
  let message = "Unable to build comparison report.";
  let isExpected = false;

  try {
    result = await buildCompanyComparisonPayload({
      companyA: firstValue(query.companyA),
      companyB: firstValue(query.companyB),
      periodEndA: firstValue(query.periodEndA),
      periodEndB: firstValue(query.periodEndB),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to build comparison report.";
    isExpected = error instanceof CompanyComparisonRequestError;
  }

  if (result) {
    return (
      <RequireAuth>
        <ComparisonPrintPage result={result} />
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-6 shadow-subtle">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
            {isExpected ? "Export unavailable" : "Unexpected export error"}
          </p>
          <p className="mt-2 text-sm text-slate-700">{message}</p>
        </div>
      </div>
    </RequireAuth>
  );
}
