/**
 * GET /api/analyze/history?ticker=TSN&quarters=12&since=2022-01-01
 *
 * Backfills historical quarterly filings for a ticker.
 * Streams SSE events — one per quarter processed.
 * Saves each quarter to the filings table automatically.
 */

import { assembleAnalysis } from "@/lib/analysisEngine";
import {
  resolveTicker,
  fetchCompanyFacts,
  extractFactsForPeriod,
  listAvailablePeriods,
} from "@/lib/secEdgar";
import { saveFiling } from "@/lib/filingStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();
  const maxQuarters = Math.min(
    parseInt(searchParams.get("quarters") ?? "12", 10),
    20
  );
  const since =
    searchParams.get("since") ??
    new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]; // Default: 3 years back

  if (!ticker) {
    return new Response(
      JSON.stringify({ error: "Missing ?ticker= parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };

      try {
        // 1. Resolve ticker → CIK
        send({ step: "resolve", status: "running", message: `Resolving ${ticker}…` });
        const { cik, name } = await resolveTicker(ticker);
        send({ step: "resolve", status: "done", message: `${name} · CIK ${cik}` });

        // 2. Fetch company facts (XBRL) once — reuse for all quarters
        send({ step: "fetch_xbrl", status: "running", message: "Fetching XBRL facts…" });
        const facts = await fetchCompanyFacts(cik);
        send({ step: "fetch_xbrl", status: "done", message: `XBRL loaded for ${facts.entityName}` });

        // 3. List available periods
        const periods = listAvailablePeriods(facts, { since, forms: ["10-Q", "10-K"] });
        const toProcess = periods.slice(0, maxQuarters);

        send({
          step: "periods",
          status: "done",
          message: `Found ${toProcess.length} quarters to process`,
          detail: { periods: toProcess.map((p) => p.periodEnd) },
        });

        let saved = 0;
        let skipped = 0;

        // 4. Process each quarter
        for (const period of toProcess) {
          const { periodEnd, form } = period;

          send({
            step: "quarter",
            status: "running",
            message: `Processing ${periodEnd} (${form})…`,
            detail: { periodEnd, form },
          });

          try {
            const extracted = extractFactsForPeriod(facts, periodEnd, form);

            // Need at least assets and revenue to be useful
            const hasData = extracted.bs.length >= 3 && extracted.cf.length >= 2;
            if (!hasData) {
              send({
                step: "quarter",
                status: "skipped",
                message: `${periodEnd} — insufficient XBRL data (${extracted.bs.length} BS, ${extracted.cf.length} CF items)`,
                detail: { periodEnd },
              });
              skipped++;
              continue;
            }

            const result = assembleAnalysis(extracted.bs, extracted.cf, {
              source: "sec",
              ticker,
              cik,
              companyName: facts.entityName,
              periodEnd,
              confidence: "high",
              extractionMethod: "sec",
            });

            await saveFiling(ticker, periodEnd, "sec", result);
            saved++;

            send({
              step: "quarter",
              status: "done",
              message: `${periodEnd} saved — ${extracted.bs.length} BS items, ${extracted.cf.length} CF items`,
              detail: {
                periodEnd,
                form,
                bsItems: extracted.bs.length,
                cfItems: extracted.cf.length,
                revenue: result.cashFlow.netIncome,
              },
            });
          } catch (err) {
            send({
              step: "quarter",
              status: "error",
              message: `${periodEnd} failed: ${err instanceof Error ? err.message : String(err)}`,
              detail: { periodEnd },
            });
          }
        }

        send({
          step: "complete",
          status: "done",
          message: `Backfill complete: ${saved} saved, ${skipped} skipped of ${toProcess.length} quarters`,
          detail: { ticker, saved, skipped, total: toProcess.length },
        });
      } catch (err) {
        send({
          step: "error",
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
