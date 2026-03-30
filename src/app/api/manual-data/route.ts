import { NextRequest, NextResponse } from "next/server";
import {
  listManualData,
  upsertManualData,
  deleteManualData,
} from "@/lib/manualDataStorage";
import type { ManualDataType } from "@/types/manualData";

/**
 * GET /api/manual-data?ticker=XYZ&type=narrative&periodEnd=2025-12-27
 * Lists manual data entries. ticker is required; type and periodEnd are optional filters.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const dataType = req.nextUrl.searchParams.get("type") as ManualDataType | null;
  const periodEnd = req.nextUrl.searchParams.get("periodEnd");

  try {
    const records = await listManualData(
      ticker,
      dataType ?? undefined,
      periodEnd ?? undefined
    );
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/manual-data
 * Body: ManualDataRecord (without id)
 * Creates or updates a manual data entry.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.ticker || !body.dataType) {
    return NextResponse.json(
      { error: "ticker and dataType required" },
      { status: 400 }
    );
  }

  try {
    const record = await upsertManualData({
      ticker: body.ticker,
      periodEnd: body.periodEnd ?? null,
      dataType: body.dataType,
      data: body.data,
      sourceNote: body.sourceNote ?? "",
    });
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/manual-data?id=UUID
 * Deletes a manual data entry by ID.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    await deleteManualData(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
