import {
  buildCompanyComparisonPayload,
  CompanyComparisonRequestError,
} from "@/lib/companyComparisonPayload";
import { generateMarginAnalysisPdf } from "@/lib/marginAnalysisPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  try {
    const payload = await buildCompanyComparisonPayload({
      companyA: searchParams.get("companyA"),
      companyB: searchParams.get("companyB"),
      tickers: searchParams.get("tickers"),
      periodEndA: searchParams.get("periodEndA"),
      periodEndB: searchParams.get("periodEndB"),
      periodEnd: searchParams.get("periodEnd"),
      periodEnds: searchParams.get("periodEnds"),
    });

    if (payload.comparisonMode === "multi") {
      return Response.json(
        { error: "margin analysis pdf currently supports pair comparison only." },
        { status: 400 }
      );
    }

    const buffer = await generateMarginAnalysisPdf(payload);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"margin_analysis.pdf\"",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof CompanyComparisonRequestError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}

