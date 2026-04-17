/**
 * GET /api/analyze?ticker=AAPL
 *
 * Streams SSE events as the SEC XBRL pipeline progresses,
 * ending with the full FullAnalysis JSON.
 */

import { assembleAnalysis } from "@/lib/analysisEngine";
import {
  resolveTicker,
  fetchCompanyFacts,
  extractAllFacts,
  type CompanyFacts,
} from "@/lib/secEdgar";
import { saveFiling } from "@/lib/filingStorage";
import {
  fetchLatestFilingText,
  extractFootnotesAndAdjusted,
  extractEarningsNarrative,
  extractSegments,
  extractNonRecurringItems,
} from "@/lib/filingTextExtractor";
import { shouldRunExtraction } from "@/lib/llmExtractionGuards";
import type { StepEvent, FullAnalysis } from "@/types/analysis";
import { PIPELINE_STEPS } from "@/types/analysis";

function labelFor(id: string): string {
  return PIPELINE_STEPS.find((s) => s.id === id)?.label ?? id;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return new Response(
      JSON.stringify({ error: "Missing ?ticker= parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: StepEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)
        );
      };

      const sendResult = (result: FullAnalysis) => {
        controller.enqueue(
          encoder.encode(
            `event: result\ndata: ${JSON.stringify(result)}\n\n`
          )
        );
      };

      const t0 = Date.now();
      const elapsed = () => Date.now() - t0;

      try {
        send({
          step: "ingest",
          label: labelFor("ingest"),
          status: "running",
          message: `Received ticker: ${ticker}`,
        });
        send({
          step: "ingest",
          label: labelFor("ingest"),
          status: "done",
          message: `Ticker: ${ticker}`,
          durationMs: elapsed(),
          detail: { ticker, source: "SEC EDGAR" },
        });

        const t2 = Date.now();
        send({
          step: "resolve",
          label: labelFor("resolve"),
          status: "running",
          message: `Looking up CIK for ${ticker} via SEC…`,
        });

        const { cik, name } = await resolveTicker(ticker);
        send({
          step: "resolve",
          label: labelFor("resolve"),
          status: "done",
          message: `${name} · CIK ${cik}`,
          durationMs: Date.now() - t2,
          detail: { cik, companyName: name, ticker },
        });

        const t3 = Date.now();
        let facts: CompanyFacts;
        try {
          facts = await fetchCompanyFacts(cik);
        } catch (err) {
          send({
            step: "extract_bs",
            label: labelFor("extract_bs"),
            status: "error",
            message: `Company facts error: ${err instanceof Error ? err.message : String(err)}`,
            durationMs: Date.now() - t3,
            detail: { error: err instanceof Error ? err.message : String(err) },
          });
          controller.close();
          return;
        }

        const t4 = Date.now();
        send({
          step: "extract_bs",
          label: labelFor("extract_bs"),
          status: "running",
          message: "Extracting balance sheet data from XBRL…",
        });

        const extracted = extractAllFacts(facts);
        send({
          step: "extract_bs",
          label: labelFor("extract_bs"),
          status: "done",
          message: `Extracted ${extracted.bs.length} balance sheet items`,
          durationMs: Date.now() - t4,
          detail: {
            items: extracted.bs.length,
            tags: extracted.bs.map(b => b.tag),
            topItems: extracted.bs.slice(0, 5).map(i => `${i.label}: ${i.value}M`),
          },
        });

        const t5 = Date.now();
        send({
          step: "extract_cf",
          label: labelFor("extract_cf"),
          status: "running",
          message: "Extracting cash flow & income statement from XBRL…",
        });

        send({
          step: "extract_cf",
          label: labelFor("extract_cf"),
          status: "done",
          message: `Extracted ${extracted.cf.length} cash flow / income items`,
          durationMs: Date.now() - t5,
          detail: {
            items: extracted.cf.length,
            tags: extracted.cf.map(c => c.tag),
            topItems: extracted.cf.slice(0, 5).map(i => `${i.label}: ${i.value}M`),
          },
        });

        const result = assembleAnalysis(extracted.bs, extracted.cf, {
          source: "sec",
          ticker,
          cik,
          companyName: facts.entityName,
          periodEnd: extracted.meta.latestPeriod,
          filingDate: extracted.meta.latestFiled,
          confidence: "high",
        });

        const computeSteps: { id: string; msg: () => string; detailFn: () => Record<string, unknown> }[] = [
          {
            id: "compute_capital",
            msg: () => {
              const inc = result.incomeStatement;
              const parts = [`Assets: $${result.balanceSheet.totalAssets.toLocaleString()}M`];
              if (inc.revenue != null) parts.push(`Revenue: $${inc.revenue.toLocaleString()}M`);
              if (inc.grossMargin != null) parts.push(`Gross margin: ${inc.grossMargin}%`);
              if (inc.ebitda != null) parts.push(`EBITDA: $${inc.ebitda.toLocaleString()}M`);
              return parts.join(" · ");
            },
            detailFn: () => {
              const inc = result.incomeStatement;
              return {
                totalAssets: `$${result.balanceSheet.totalAssets.toLocaleString()}M`,
                totalEquity: `$${result.balanceSheet.totalEquity.toLocaleString()}M`,
                revenue: inc.revenue != null ? `$${inc.revenue.toLocaleString()}M` : "N/A",
                grossProfit: inc.grossProfit != null ? `$${inc.grossProfit.toLocaleString()}M` : "N/A",
                grossMargin: inc.grossMargin != null ? `${inc.grossMargin}%` : "N/A",
                operatingIncome: inc.operatingIncome != null ? `$${inc.operatingIncome.toLocaleString()}M` : "N/A",
                ebitda: inc.ebitda != null ? `$${inc.ebitda.toLocaleString()}M` : "N/A",
                netIncome: inc.netIncome != null ? `$${inc.netIncome.toLocaleString()}M` : "N/A",
              };
            },
          },
          {
            id: "compute_debt",
            msg: () => `Net debt: $${result.debtStructure.netDebt.toLocaleString()}M · Total: $${result.debtStructure.totalDebt.toLocaleString()}M`,
            detailFn: () => ({
              shortTermDebt: `$${result.debtStructure.shortTermDebt.toLocaleString()}M`,
              longTermDebt: `$${result.debtStructure.longTermDebt.toLocaleString()}M`,
              totalDebt: `$${result.debtStructure.totalDebt.toLocaleString()}M`,
              netDebt: `$${result.debtStructure.netDebt.toLocaleString()}M`,
            }),
          },
          {
            id: "compute_ratios",
            msg: () => {
              const r = result.ratios;
              const parts: string[] = [];
              if (r.grossMargin != null) parts.push(`GM: ${r.grossMargin}%`);
              if (r.operatingMargin != null) parts.push(`OP: ${r.operatingMargin}%`);
              if (r.returnOnEquity != null) parts.push(`ROE: ${r.returnOnEquity}%`);
              if (r.debtToEquity != null) parts.push(`D/E: ${r.debtToEquity}`);
              if (r.currentRatio != null) parts.push(`Current: ${r.currentRatio}`);
              return parts.length ? parts.join(" · ") : "Ratios computed";
            },
            detailFn: () => {
              const r = result.ratios;
              const d: Record<string, unknown> = {};
              if (r.grossMargin != null) d["Gross Margin"] = `${r.grossMargin}%`;
              if (r.operatingMargin != null) d["Operating Margin"] = `${r.operatingMargin}%`;
              if (r.ebitdaMargin != null) d["EBITDA Margin"] = `${r.ebitdaMargin}%`;
              if (r.netMargin != null) d["Net Margin"] = `${r.netMargin}%`;
              if (r.returnOnEquity != null) d["ROE"] = `${r.returnOnEquity}%`;
              if (r.returnOnAssets != null) d["ROA"] = `${r.returnOnAssets}%`;
              if (r.returnOnInvestedCapital != null) d["ROIC"] = `${r.returnOnInvestedCapital}%`;
              if (r.debtToEquity != null) d["Debt/Equity"] = r.debtToEquity;
              if (r.netDebtToEbitda != null) d["Net Debt/EBITDA"] = r.netDebtToEbitda;
              if (r.interestCoverage != null) d["Interest Coverage"] = `${r.interestCoverage}x`;
              if (r.currentRatio != null) d["Current Ratio"] = r.currentRatio;
              if (r.fcfYield != null) d["FCF Yield"] = `${r.fcfYield}%`;
              return d;
            },
          },
          {
            id: "dividend_assessment",
            msg: () => result.dividendAnalysis.headline,
            detailFn: () => ({
              verdict: result.dividendAnalysis.verdict,
              payoutNI: result.dividendAnalysis.payoutRatioNI != null ? `${result.dividendAnalysis.payoutRatioNI}%` : "N/A",
              payoutFCF: result.dividendAnalysis.payoutRatioFCF != null ? `${result.dividendAnalysis.payoutRatioFCF}%` : "N/A",
              fcfCoverage: result.dividendAnalysis.fcfCoverageYears != null ? `${result.dividendAnalysis.fcfCoverageYears} yrs` : "N/A",
              cashCoverage: result.dividendAnalysis.cashCoverageYears != null ? `${result.dividendAnalysis.cashCoverageYears} yrs` : "N/A",
            }),
          },
          {
            id: "validate",
            msg: () => {
              const p = result.validation.checks.filter(c => c.passed).length;
              return `${p}/${result.validation.checks.length} checks passed`;
            },
            detailFn: () => {
              const d: Record<string, unknown> = {};
              for (const c of result.validation.checks) {
                d[c.name] = c.passed ? `PASS: ${c.note}` : `FAIL: ${c.note}`;
              }
              return d;
            },
          },
        ];

        for (const s of computeSteps) {
          send({
            step: s.id,
            label: labelFor(s.id),
            status: "running",
            message: "Computing…",
          });
          await new Promise((r) => setTimeout(r, 120));
          send({
            step: s.id,
            label: labelFor(s.id),
            status: "done",
            message: s.msg(),
            durationMs: 120,
            detail: s.detailFn(),
          });
        }

        // Extract footnotes + adjusted metrics from the actual filing document (non-blocking)
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (apiKey) {
          send({
            step: "extract_footnotes",
            label: labelFor("extract_footnotes"),
            status: "running",
            message: "Fetching filing document for footnotes & adjusted metrics…",
          });
          const tFn = Date.now();
          try {
            const filingDoc = await fetchLatestFilingText(cik);
            if (filingDoc) {
              if (!shouldRunExtraction(filingDoc.text)) {
                send({
                  step: "extract_footnotes",
                  label: labelFor("extract_footnotes"),
                  status: "skipped",
                  message: "NO_VALID_FILING_TEXT",
                  durationMs: Date.now() - tFn,
                  detail: {
                    error: "NO_VALID_FILING_TEXT",
                    form: filingDoc.form,
                    reportDate: filingDoc.reportDate,
                  },
                });
              } else {
                const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
                // Run all 4 AI extractions in parallel
                const [footnotesResult, earningsNarrative, segments, nonRecurring] =
                  await Promise.all([
                    extractFootnotesAndAdjusted(filingDoc.text, apiKey, model),
                    extractEarningsNarrative(filingDoc.text, ticker, apiKey, model),
                    extractSegments(filingDoc.text, apiKey, model),
                    extractNonRecurringItems(filingDoc.text, apiKey, model),
                  ]);
                const { footnotes, adjustedMetrics } = footnotesResult;
                result.footnotes = footnotes;
                result.adjustedMetrics = adjustedMetrics;
                result.earningsNarrative = earningsNarrative ?? undefined;
                if (segments.length > 0) {
                  result.segments = segments;
                }
                if (nonRecurring.length > 0) {
                  result.nonRecurringItems = nonRecurring;
                }
                send({
                  step: "extract_footnotes",
                  label: labelFor("extract_footnotes"),
                  status: "done",
                  message: `Extracted ${footnotes.length} footnotes, ${adjustedMetrics.length} adjusted metrics, ${segments.length} segments, ${nonRecurring.length} adjustments`,
                  durationMs: Date.now() - tFn,
                  detail: {
                    footnotes: footnotes.length,
                    adjustedMetrics: adjustedMetrics.length,
                    segments: segments.length,
                    nonRecurringItems: nonRecurring.length,
                    form: filingDoc.form,
                    reportDate: filingDoc.reportDate,
                  },
                });
              }
            } else {
              send({
                step: "extract_footnotes",
                label: labelFor("extract_footnotes"),
                status: "skipped",
                message: "Filing document not available",
                durationMs: Date.now() - tFn,
              });
            }
          } catch {
            send({
              step: "extract_footnotes",
              label: labelFor("extract_footnotes"),
              status: "skipped",
              message: "Could not extract footnotes (non-critical)",
              durationMs: Date.now() - tFn,
            });
          }
        } else {
          send({
            step: "extract_footnotes",
            label: labelFor("extract_footnotes"),
            status: "skipped",
            message: "OPENAI_API_KEY not set — skipping footnote extraction",
          });
        }

        send({
          step: "complete",
          label: labelFor("complete"),
          status: "done",
          message: `Analysis of ${ticker} complete in ${elapsed()}ms`,
          durationMs: elapsed(),
          detail: {
            ticker,
            company: facts.entityName,
            period: extracted.meta.latestPeriod,
            totalDuration: `${elapsed()}ms`,
            bsItems: extracted.bs.length,
            cfItems: extracted.cf.length,
          },
        });

        // Persist filing for competitor analysis workspace
        try {
          await saveFiling(
            ticker,
            result.meta.periodEnd ?? new Date().toISOString().split("T")[0],
            "sec",
            result
          );
        } catch (saveErr) {
          // Don't fail the analysis if storage fails — log and continue
          console.warn("[filing-save] Failed to persist filing:", saveErr);
        }

        sendResult(result);
      } catch (err) {
        send({
          step: "error",
          label: "Error",
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
