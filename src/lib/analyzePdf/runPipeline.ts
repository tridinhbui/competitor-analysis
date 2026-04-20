import { assembleAnalysis } from "@/lib/analysisEngine";
import { extractNonRecurringItems } from "@/lib/filingTextExtractor";
import {
  resolveRnDExpense,
  extractShareRepurchasesHeuristic,
  extractTotalEquityHeuristic,
  computeBalanceGapPct,
} from "@/lib/heuristics";
import { callChatCompletion, safeJsonParse } from "@/lib/openai/chatJsonRunner";
import { BS_PROMPT } from "@/lib/prompts/analyzePdf/balanceSheetPrompt";
import { IS_CF_PROMPT } from "@/lib/prompts/analyzePdf/incomeCashFlowPrompt";
import { QUALITATIVE_PROMPT } from "@/lib/prompts/analyzePdf/qualitativePrompt";
import { SEGMENT_PROMPT } from "@/lib/prompts/analyzePdf/segmentsPrompt";
import type { BSItem, FootnoteItem, EarningsNarrative, FullAnalysis } from "@/types/analysis";
import type { VolumeUnitType } from "@/types/segments";
import { debugLog, warnLog } from "@/lib/debugLogger";
import {
  dedupeByTagPreferPdf,
  normalizeScaleNote,
  parseAiEnvelope,
  rawAiToBSItem,
} from "./aiItems";
import {
  BS_TAG_SET,
  CF_TAG_SET,
  type BsExtraction,
  type IsCfExtraction,
  type QualExtraction,
  type SegmentExtraction,
} from "./extractionTypes";
import { repairCriticalFinancialValue } from "./repairFinancial";
import { extractSections } from "./sectionExtractor";
import { tokensFor } from "./tokensFor";
import { toBsItems } from "./numerics";
import { analyzePdfVerboseLog } from "./verboseLog";

export type AnalyzePdfPipelineInput = {
  filingText: string;
  fileName?: string;
  pages?: number;
  chars?: number;
  apiKey: string;
  model: string;
};

export type AnalyzePdfPipelineResult =
  | { outcome: "success"; analysis: FullAnalysis }
  | { outcome: "degraded"; analysis: FullAnalysis; warning: string }
  | { outcome: "error"; message: string; status: number };

export async function runAnalyzePdfPipeline(
  input: AnalyzePdfPipelineInput
): Promise<AnalyzePdfPipelineResult> {
  const { filingText, fileName, pages, chars, apiKey, model } = input;

  try {
    const { bsText, isCfText, qualText, segmentText } = extractSections(filingText);

    const bsInput = bsText.length > 500 ? bsText : filingText.slice(0, 80_000);
    const isCfInput = isCfText.length > 500 ? isCfText : filingText.slice(0, 80_000);
    const qualInput = qualText.length > 500 ? qualText : filingText.slice(0, 60_000);
    const segInput = segmentText.length > 300 ? segmentText : filingText.slice(0, 60_000);

    const [bsCall, isCfCall, qualCall, segCall, nonRecurringItems] = await Promise.all([
      callChatCompletion({
        step: "analyze-pdf:bs",
        apiKey,
        model,
        systemPrompt: BS_PROMPT,
        userContent: `Extract balance sheet data:\n\n${bsInput}`,
        maxTokens: tokensFor(bsInput),
        temperature: 0.1,
        timeoutMs: 60_000,
      }),
      callChatCompletion({
        step: "analyze-pdf:is-cf",
        apiKey,
        model,
        systemPrompt: IS_CF_PROMPT,
        userContent: `Extract income statement and cash flow data:\n\n${isCfInput}`,
        maxTokens: tokensFor(isCfInput),
        temperature: 0.1,
        timeoutMs: 60_000,
      }),
      callChatCompletion({
        step: "analyze-pdf:qual",
        apiKey,
        model,
        systemPrompt: QUALITATIVE_PROMPT,
        userContent: `Extract qualitative insights:\n\n${qualInput}`,
        maxTokens: tokensFor(qualInput),
        temperature: 0.1,
        timeoutMs: 60_000,
      }),
      callChatCompletion({
        step: "analyze-pdf:segments",
        apiKey,
        model,
        systemPrompt: SEGMENT_PROMPT,
        userContent: `Extract segment data:\n\n${segInput}`,
        maxTokens: tokensFor(segInput, 1000, 3000),
        temperature: 0.1,
        timeoutMs: 60_000,
      }),
      extractNonRecurringItems(filingText, apiKey, model),
    ]);

    const aiErrors = [bsCall, isCfCall, qualCall, segCall]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));

    if (aiErrors.length > 0) {
      warnLog("[analyze-pdf] OpenAI extraction warnings:", aiErrors);
    }

    const bsExtraction = safeJsonParse<BsExtraction>(bsCall.content, {});
    const isCfExtraction = safeJsonParse<IsCfExtraction>(isCfCall.content, {});
    const qualExtraction = safeJsonParse<QualExtraction>(qualCall.content, {});
    const segExtraction = safeJsonParse<SegmentExtraction>(segCall.content, {});

    const bsParsed = parseAiEnvelope(bsExtraction);
    const isCfParsed = parseAiEnvelope(isCfExtraction);

    const period =
      bsParsed.meta.periodEnd ??
      isCfParsed.meta.periodEnd ??
      bsExtraction.periodEnd ??
      new Date().toISOString().slice(0, 10);

    const mergedScaleRaw =
      bsParsed.meta.scaleNote ??
      bsExtraction.scaleNote ??
      isCfParsed.meta.scaleNote;
    const scaleForHeuristics =
      normalizeScaleNote(mergedScaleRaw) ?? bsExtraction.scaleNote;

    const mergedCompanyName =
      bsParsed.meta.companyName ??
      isCfParsed.meta.companyName ??
      bsExtraction.companyName ??
      null;

    const bsFromParsed = bsParsed.items
      .filter((it) => BS_TAG_SET.has(String(it.tag ?? "")))
      .map((it) => rawAiToBSItem(it, period, "bs"))
      .filter((x): x is BSItem => x != null);
    const bsFromLegacy = toBsItems(
      (bsExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => BS_TAG_SET.has(String(it.tag ?? ""))),
      period,
      "AI:bs"
    );
    const bsItems: BSItem[] = dedupeByTagPreferPdf([...bsFromParsed, ...bsFromLegacy]);

    const existingEquityItem = bsItems.find((item) => item.tag === "StockholdersEquity");
    const equityMissing = existingEquityItem == null || Math.abs(existingEquityItem.value) === 0;
    if (equityMissing) {
      const equityCandidate = extractTotalEquityHeuristic(filingText, scaleForHeuristics);
      if (equityCandidate.totalEquity != null) {
        const assetsValue = bsItems.find((item) => item.tag === "Assets")?.value ?? null;
        const liabilitiesValue = bsItems.find((item) => item.tag === "Liabilities")?.value ?? null;
        const existingEquityValue = existingEquityItem?.value ?? null;
        const existingEquityLooksCompanySpecific = existingEquityItem
          ? /^company\s+shareholders?['\u2019]?\s+equity/i.test(existingEquityItem.label)
          : false;

        const currentGap = computeBalanceGapPct(assetsValue, liabilitiesValue, existingEquityValue);
        const candidateGap = computeBalanceGapPct(assetsValue, liabilitiesValue, equityCandidate.totalEquity);

        const shouldUseCandidate =
          existingEquityItem == null ||
          existingEquityValue === 0 ||
          existingEquityLooksCompanySpecific ||
          (Number.isFinite(candidateGap) &&
            (!Number.isFinite(currentGap) || candidateGap < currentGap)) ||
          (equityCandidate.confidence === "high" && !Number.isFinite(currentGap));

        if (shouldUseCandidate) {
          if (existingEquityItem) {
            existingEquityItem.value = equityCandidate.totalEquity;
            existingEquityItem.label = equityCandidate.labelUsed ?? existingEquityItem.label;
            existingEquityItem.source = `heuristic:equity:${equityCandidate.confidence}`;
          } else {
            bsItems.push({
              tag: "StockholdersEquity",
              label: equityCandidate.labelUsed ?? "Total equity",
              value: equityCandidate.totalEquity,
              period,
              source: `heuristic:equity:${equityCandidate.confidence}`,
            });
          }
        }

        analyzePdfVerboseLog("[equity:heuristic-candidate]", {
          selectedLabel: equityCandidate.labelUsed,
          selectedValue: equityCandidate.totalEquity,
          confidence: equityCandidate.confidence,
          shouldUseCandidate,
          currentGap,
          candidateGap,
        });
      }
    }

    const cfFromParsed = isCfParsed.items
      .filter((it) => CF_TAG_SET.has(String(it.tag ?? "")))
      .map((it) => rawAiToBSItem(it, period, "cf"))
      .filter((x): x is BSItem => x != null);
    const cfFromLegacy = toBsItems(
      (isCfExtraction.items as Array<{ tag: string; label: string; value: number | string | null }> | undefined)
        ?.filter((it) => CF_TAG_SET.has(String(it.tag ?? ""))),
      period,
      "AI:cf"
    );
    const cfItems: BSItem[] = dedupeByTagPreferPdf([...cfFromParsed, ...cfFromLegacy]);

    for (const metric of ["totalAssets", "cashAndEquivalents"] as const) {
      repairCriticalFinancialValue(bsItems, metric, filingText, scaleForHeuristics, period);
    }
    for (const metric of [
      "revenue",
      "costOfRevenue",
      "grossProfit",
      "operatingIncome",
      "netIncome",
      "operatingCashFlow",
      "capitalExpenditures",
    ] as const) {
      repairCriticalFinancialValue(cfItems, metric, filingText, scaleForHeuristics, period);
    }

    const existingRepurchase = cfItems.find(
      (i) => i.tag === "PaymentsForRepurchaseOfCommonStock"
    );
    const hasValidRepurchase =
      existingRepurchase != null && Math.abs(existingRepurchase.value) > 0;
    debugLog("[repurchase:guard] hasValidRepurchase:", hasValidRepurchase, "existing value:", existingRepurchase?.value ?? "none");
    if (!hasValidRepurchase) {
      const heuristicValue = extractShareRepurchasesHeuristic(
        filingText,
        scaleForHeuristics
      );
      debugLog("[repurchase:heuristic] heuristicValue:", heuristicValue);
      if (heuristicValue != null && heuristicValue > 0) {
        if (existingRepurchase) {
          existingRepurchase.value = heuristicValue;
          existingRepurchase.label = "Share repurchases (heuristic)";
          existingRepurchase.source = "heuristic:repurchase_overwrite";
        } else {
          cfItems.push({
            tag: "PaymentsForRepurchaseOfCommonStock",
            label: "Share repurchases (heuristic)",
            value: heuristicValue,
            period,
            source: "heuristic:repurchase",
          });
        }
      }
    }
    analyzePdfVerboseLog("[repurchase:final-cfItem]", cfItems.find((i) => i.tag === "PaymentsForRepurchaseOfCommonStock") ?? null);

    const directLtDebtRepayItem = cfItems.find(
      (i) => i.tag === "RepaymentsOfLongTermDebt" && Math.abs(i.value) > 0
    );
    const paymentsOnDebtItem = cfItems.find(
      (i) => i.tag === "RepaymentsOfDebt" && Math.abs(i.value) > 0
    );
    const hasShortTermRepayments =
      cfItems.some(
        (i) =>
          i.tag === "RepaymentsOfCommercialPaper" &&
          Math.abs(i.value) > 0
      ) ||
      cfItems.some(
        (i) => i.tag === "RepaymentsOfShortTermDebt" && Math.abs(i.value) > 0
      );
    const hasConflictingDebtBreakdown =
      hasShortTermRepayments ||
      cfItems.some(
        (i) =>
          i.tag === "RepaymentsOfLongTermDebt" &&
          i !== directLtDebtRepayItem &&
          Math.abs(i.value) > 0
      );

    let debtRepaymentLabel = "unknown";
    if (directLtDebtRepayItem) {
      debtRepaymentLabel = "direct";
      directLtDebtRepayItem.source =
        directLtDebtRepayItem.source || "direct";
    } else if (
      paymentsOnDebtItem &&
      !hasShortTermRepayments &&
      !hasConflictingDebtBreakdown
    ) {
      debtRepaymentLabel = "proxy_from_payments_on_debt";
      cfItems.push({
        tag: "RepaymentsOfLongTermDebt",
        label: "LT debt repayments (proxy from payments on debt)",
        value: Math.abs(paymentsOnDebtItem.value),
        period,
        source: "proxy_from_payments_on_debt",
      });
    } else if (paymentsOnDebtItem) {
      debtRepaymentLabel = "mixed_debt_repayment";
      paymentsOnDebtItem.label = "Total debt repayments (mixed)";
      paymentsOnDebtItem.source = "mixed_debt_repayment";
    }
    analyzePdfVerboseLog("[debt-repay:classification]", {
      label: debtRepaymentLabel,
      directLt: directLtDebtRepayItem?.value ?? null,
      paymentsOnDebt: paymentsOnDebtItem?.value ?? null,
      hasShortTermRepayments,
      hasConflictingDebtBreakdown,
    });

    const existingRdItem = cfItems.find(
      (i) => i.tag === "ResearchAndDevelopmentExpense"
    );
    const hasValidRd = existingRdItem != null && Math.abs(existingRdItem.value) > 0;
    const revenueItem = cfItems.find((i) =>
      [
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
      ].includes(i.tag)
    );
    const rdResolution = resolveRnDExpense({
      text: filingText,
      scaleNote: scaleForHeuristics,
      companyName: mergedCompanyName,
      existingRd: hasValidRd ? existingRdItem!.value : null,
      currentRevenue: revenueItem != null ? Math.abs(revenueItem.value) : null,
    });
    analyzePdfVerboseLog("[rd:resolution]", rdResolution);

    if (
      !hasValidRd &&
      rdResolution.rAndDExpense != null &&
      rdResolution.rAndDExpense > 0 &&
      rdResolution.method === "extracted"
    ) {
      const rdExpense = rdResolution.rAndDExpense;
      const basisPart = rdResolution.rAndDPeriodBasis
        ? `:basis=${rdResolution.rAndDPeriodBasis}`
        : "";
      const source = `heuristic:rd:extracted${basisPart}`;

      if (existingRdItem) {
        existingRdItem.value = rdExpense;
        existingRdItem.label = "R&D expense";
        existingRdItem.source = source;
      } else {
        cfItems.push({
          tag: "ResearchAndDevelopmentExpense",
          label: "R&D expense",
          value: rdExpense,
          period,
          source,
        });
      }
    } else if (!hasValidRd) {
      analyzePdfVerboseLog("[rd:skip-backfill]", {
        reason: "non-explicit or unavailable R&D value",
        method: rdResolution.method,
        candidate: rdResolution.rAndDExpense,
      });
    }
    analyzePdfVerboseLog(
      "[rd:final-cfItem]",
      cfItems.find((i) => i.tag === "ResearchAndDevelopmentExpense") ?? null
    );

    const hasCoreBalanceSheet = bsItems.some((i) =>
      ["Assets", "Liabilities", "StockholdersEquity", "LiabilitiesAndStockholdersEquity"].includes(i.tag)
    );
    const hasCoreIncomeOrCashFlow = cfItems.some((i) =>
      ["Revenues", "NetIncomeLoss", "OperatingIncomeLoss", "NetCashProvidedByOperatingActivities"].includes(i.tag)
    );
    const totalFinancialLineItems = bsItems.length + cfItems.length;

    if (totalFinancialLineItems < 6 || !hasCoreBalanceSheet || !hasCoreIncomeOrCashFlow) {
      const reasons: string[] = [];
      if (totalFinancialLineItems < 6) {
        reasons.push(`only ${totalFinancialLineItems} financial lines extracted`);
      }
      if (!hasCoreBalanceSheet) {
        reasons.push("missing core balance sheet lines");
      }
      if (!hasCoreIncomeOrCashFlow) {
        reasons.push("missing core income/cash flow lines");
      }
      if (aiErrors.length > 0) {
        reasons.push(`upstream AI errors: ${aiErrors.join(" | ")}`);
      }

      const degradedAnalysis = assembleAnalysis(bsItems, cfItems, {
        source: "pdf",
        companyName: mergedCompanyName ?? undefined,
        fileName,
        pagesRead: pages,
        charsExtracted: chars ?? filingText.length,
        periodEnd: period,
        confidence: "low",
        extractionMethod: "pdf-ai-partial",
      });

      warnLog("[analyze-pdf] Degraded extraction mode:", reasons);

      return {
        outcome: "degraded",
        analysis: degradedAnalysis,
        warning: `AI extraction coverage low (${reasons.join("; ")}). Returned partial analysis instead of failing request.`,
      };
    }

    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: mergedCompanyName ?? undefined,
      fileName,
      pagesRead: pages,
      charsExtracted: chars ?? filingText.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });
    analyzePdfVerboseLog(
      "[repurchase:final-render-value]",
      analysis.cashFlow.shareRepurchases
    );

    if (qualExtraction.footnotes && Array.isArray(qualExtraction.footnotes)) {
      const validTypes = new Set(["debt", "contingency", "segment", "accounting-policy", "tax", "revenue", "other"]);
      analysis.footnotes = qualExtraction.footnotes.map((fn) => ({
        id: fn.id || `note-${Math.random().toString(36).slice(2, 8)}`,
        title: fn.title || "Note",
        summary: fn.summary || "",
        significance: (["high", "medium", "low"].includes(fn.significance) ? fn.significance : "medium") as "high" | "medium" | "low",
        type: (validTypes.has(fn.type) ? fn.type : "other") as FootnoteItem["type"],
      }));
    }

    if (qualExtraction.earningsNarrative) {
      const en = qualExtraction.earningsNarrative;
      if (en.summary || en.keyThemes?.length) {
        analysis.earningsNarrative = {
          result: en.result || "N/A",
          summary: en.summary || "",
          priorGuidance: en.priorGuidance ?? null,
          currentGuidance: en.currentGuidance ?? null,
          keyThemes: Array.isArray(en.keyThemes) ? en.keyThemes.slice(0, 5) : [],
          tone: (["bullish", "neutral", "cautious", "unknown"].includes(en.tone ?? "")
            ? en.tone
            : "unknown") as EarningsNarrative["tone"],
          source: "pdf-text",
        };
      }
    }

    if (qualExtraction.adjustedMetrics && Array.isArray(qualExtraction.adjustedMetrics)) {
      analysis.adjustedMetrics = qualExtraction.adjustedMetrics;
    }

    if (nonRecurringItems.length > 0) {
      analysis.nonRecurringItems = nonRecurringItems;
    }

    if (segExtraction.segments && Array.isArray(segExtraction.segments) && segExtraction.segments.length > 0) {
      const validVolumeTypes = new Set(["head", "cwt", "lbs", "cases"]);
      analysis.segments = segExtraction.segments.map((seg) => {
        const revenue = seg.revenue != null ? Math.round(Number(seg.revenue)) : null;
        const operatingIncome = seg.operatingIncome != null ? Math.round(Number(seg.operatingIncome)) : null;
        const opMargin = revenue && operatingIncome ? Math.round((operatingIncome / revenue) * 1000) / 10 : null;
        const volType = seg.volumeUnitType && validVolumeTypes.has(seg.volumeUnitType) ? seg.volumeUnitType : null;
        const volUnits = seg.volumeUnits != null ? Number(seg.volumeUnits) : null;
        const revPerUnit = volUnits && volUnits > 0 && revenue ? Math.round((revenue / volUnits) * 100) / 100 : null;
        const opPerUnit = volUnits && volUnits > 0 && operatingIncome ? Math.round((operatingIncome / volUnits) * 100) / 100 : null;

        return {
          segmentName: seg.segmentName || "Unknown Segment",
          segmentType: (seg.segmentType === "business" || seg.segmentType === "channel" || seg.segmentType === "geography") ? seg.segmentType : "business" as const,
          revenue,
          costOfRevenue: null,
          grossProfit: null,
          sgaExpense: null,
          operatingIncome,
          operatingMargin: opMargin,
          depreciation: seg.depreciation != null ? Math.round(Number(seg.depreciation)) : null,
          capitalExpenditures: seg.capitalExpenditures != null ? Math.round(Number(seg.capitalExpenditures)) : null,
          totalAssets: seg.totalAssets != null ? Math.round(Number(seg.totalAssets)) : null,
          intercompanyEliminations: null,
          volumeUnits: volUnits,
          volumeUnitType: volType as VolumeUnitType | null,
          revenuePerUnit: revPerUnit,
          operatingIncomePerUnit: opPerUnit,
        };
      });
    }

    return { outcome: "success", analysis };
  } catch (e) {
    return {
      outcome: "error",
      message: e instanceof Error ? e.message : "OpenAI call failed",
      status: 502,
    };
  }
}
