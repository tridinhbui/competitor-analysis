import { NextRequest, NextResponse } from "next/server";
import { generateAiFinancialBoard } from "@/lib/financialModelAiBoard";
import type { DataSourceRow } from "@/types/dataSource";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: {
    rows?: DataSourceRow[];
    company?: { ticker: string; companyName: string } | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  const company = body.company ?? null;

  const result = await generateAiFinancialBoard(rows, company);

  return NextResponse.json({
    headline: result.headline,
    categorySections: result.sections,
    usedAi: result.usedAi,
  });
}
