import {
  buildCompanyComparisonPayload,
  CompanyComparisonRequestError,
} from "@/lib/companyComparisonPayload";
import { generateCompanyComparisonPptx } from "@/lib/companyComparisonPptx";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilenamePart(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 160);
}

function buildAttachmentFilename(result: CompanyComparisonPayload): string {
  if (result.comparisonMode === "multi" && result.multiCompanies?.length) {
    const tickers = result.multiCompanies.map((c) => c.ticker).join(" ");
    return `${sanitizeFilenamePart(tickers)} peer comparison.pptx`;
  }
  const a = result.companyA.ticker;
  const b = result.companyB.ticker;
  return `${sanitizeFilenamePart(`${a} vs ${b}`)}.pptx`;
}

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

    const buffer = await generateCompanyComparisonPptx(payload);
    const filename = buildAttachmentFilename(payload);
    const encoded = encodeURIComponent(filename);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof CompanyComparisonRequestError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}
