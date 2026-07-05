import {
  buildCompanyComparisonPayloadFromFilings,
  CompanyComparisonRequestError,
} from "@/lib/companyComparisonPayload";
import { preprocessCompetitorWorkbookFromArrayBuffer } from "@/lib/excelCompetitorPreprocess";
import { requireAuthedUser } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResult = await requireAuthedUser(request);
  if (authResult instanceof Response) return authResult;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Upload an Excel workbook first." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(lowerName)) {
      return Response.json(
        { error: "Only .xlsx, .xls, and .csv files are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const processed = preprocessCompetitorWorkbookFromArrayBuffer(arrayBuffer, file.name);
    const comparison =
      processed.comparisonTickers.length >= 2
        ? await buildCompanyComparisonPayloadFromFilings({
            filings: processed.virtualFilings,
            tickers: processed.comparisonTickers.join(","),
          })
        : null;

    return Response.json({
      ok: true,
      sourceFileName: processed.sourceFileName,
      processedWorkbookFileName:
        file.name.replace(/\.(xlsx|xls|csv)$/i, "") + "-processed-competitor-data.xlsx",
      processedWorkbookBase64: Buffer.from(processed.processedWorkbookBytes).toString("base64"),
      primarySheet: processed.primarySheet,
      comparisonTickers: processed.comparisonTickers,
      companies: processed.companies,
      sheetMatches: processed.sheetMatches,
      warnings: processed.warnings,
      rowCount: processed.quarterlyRows.length,
      rowPreview: processed.quarterlyRows.slice(0, 12),
      comparison,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error instanceof CompanyComparisonRequestError ? error.status : 500;

    return Response.json({ error: message }, { status });
  }
}
