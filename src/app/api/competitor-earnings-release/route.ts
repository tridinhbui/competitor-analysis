import {
  buildCompetitorEarningsReleasePayload,
} from "@/lib/competitorEarningsRelease";
import { requireAuthedUser } from "@/lib/serverAuth";
import type {
  ComparisonNarrative,
  NormalizedCompanyMetrics,
} from "@/lib/companyComparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompetitorReleaseRequestBody {
  benchmark?: NormalizedCompanyMetrics;
  competitor?: NormalizedCompanyMetrics;
  narrative?: ComparisonNarrative;
}

export async function POST(request: Request) {
  const authResult = await requireAuthedUser(request);
  if (authResult instanceof Response) return authResult;

  try {
    const body = (await request.json()) as CompetitorReleaseRequestBody;
    if (!body.benchmark || !body.competitor || !body.narrative) {
      return Response.json(
        { error: "benchmark, competitor, and narrative are required." },
        { status: 400 }
      );
    }

    const payload = await buildCompetitorEarningsReleasePayload({
      benchmark: body.benchmark,
      competitor: body.competitor,
      narrative: body.narrative,
    });

    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
