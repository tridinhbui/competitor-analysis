import {
  buildCompanyComparisonPayload,
  CompanyComparisonRequestError,
} from "@/lib/companyComparisonPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const payload = await buildCompanyComparisonPayload({
      companyA: searchParams.get("companyA"),
      companyB: searchParams.get("companyB"),
      periodEndA: searchParams.get("periodEndA"),
      periodEndB: searchParams.get("periodEndB"),
    });

    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof CompanyComparisonRequestError ? error.status : 500;

    return Response.json({ error: message }, { status });
  }
}
