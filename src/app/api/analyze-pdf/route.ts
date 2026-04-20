import { NextResponse } from "next/server";
import { shouldRunExtraction } from "@/lib/llmExtractionGuards";
import { runAnalyzePdfPipeline } from "@/lib/analyzePdf/runPipeline";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured on server." },
      { status: 503 }
    );
  }

  let body: { text?: string; fileName?: string; pages?: number; chars?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filingText = body.text?.trim() ?? "";
  if (!shouldRunExtraction(filingText)) {
    return NextResponse.json({ error: "NO_VALID_FILING_TEXT" }, { status: 400 });
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const result = await runAnalyzePdfPipeline({
    filingText,
    fileName: body.fileName,
    pages: body.pages,
    chars: body.chars,
    apiKey,
    model,
  });

  if (result.outcome === "error") {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  if (result.outcome === "degraded") {
    return NextResponse.json({
      analysis: result.analysis,
      degraded: true,
      warning: result.warning,
    });
  }

  return NextResponse.json({ analysis: result.analysis });
}
