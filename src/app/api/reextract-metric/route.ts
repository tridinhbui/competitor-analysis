import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  extractPdfFinancialValue,
  type PdfFinancialMetric,
} from "@/lib/pdfFinancialValueExtractor";
import type { FullAnalysis } from "@/types/analysis";

export const runtime = "nodejs";

const TAG_TO_METRIC: Record<string, PdfFinancialMetric> = {
  Assets: "totalAssets",
  AssetsCurrent: "totalCurrentAssets",
  LiabilitiesCurrent: "totalCurrentLiabilities",
  LongTermDebtNoncurrent: "longTermDebtNoncurrent",
  LongTermDebtCurrent: "currentMaturitiesLongTermDebt",
  ShortTermBorrowings: "shortTermBorrowings",
  InventoryNet: "inventories",
  AccountsReceivableNetCurrent: "accountsReceivable",
  AccountsReceivableNet: "accountsReceivable",
  PropertyPlantAndEquipmentNet: "propertyPlantAndEquipment",
  RetainedEarningsAccumulatedDeficit: "retainedEarnings",
  Goodwill: "goodwill",
  AccountsPayableCurrent: "accountsPayable",
  AccountsPayable: "accountsPayable",
  Revenues: "revenue",
  CostOfGoodsSold: "costOfRevenue",
  CostOfRevenue: "costOfRevenue",
  GrossProfit: "grossProfit",
  NetIncomeLoss: "netIncome",
  SellingGeneralAndAdministrativeExpense: "sgaExpense",
  OperatingIncomeLoss: "operatingIncome",
  NetCashProvidedByOperatingActivities: "operatingCashFlow",
  PaymentsToAcquirePropertyPlantAndEquipment: "capitalExpenditures",
  PaymentsOfDividends: "dividendsPaid",
  ShareBasedCompensation: "stockBasedCompensation",
  DepreciationDepletionAndAmortization: "depreciationDepletionAndAmortization",
  InterestExpense: "interestExpense",
  IncomeTaxExpenseBenefit: "incomeTaxExpense",
  IncomeBeforeIncomeTaxes: "incomeBeforeIncomeTaxes",
  EBITDA: "ebitda",
  GrossDebt: "grossDebt",
  TotalNetDebtSupplemental: "supplementalNetDebt",
};

const LABEL_TO_METRIC: Record<string, PdfFinancialMetric> = {
  Revenue: "revenue",
  "Cost of Revenue": "costOfRevenue",
  "Gross Profit": "grossProfit",
  "Net Income": "netIncome",
  "SG&A Expense": "sgaExpense",
  "Operating Income": "operatingIncome",
  "Operating CF": "operatingCashFlow",
  "Operating Cash Flow": "operatingCashFlow",
  "Capital Expenditures": "capitalExpenditures",
  "Dividends Paid": "dividendsPaid",
  "Accounts Receivable": "accountsReceivable",
  "PP&E (Net)": "propertyPlantAndEquipment",
  "Long-Term Debt": "longTermDebtNoncurrent",
  "Short-Term Debt": "shortTermBorrowings",
  "Current Assets": "totalCurrentAssets",
  "Current Liabilities": "totalCurrentLiabilities",
  Inventories: "inventories",
  Goodwill: "goodwill",
  "Accounts Payable": "accountsPayable",
};

function detectScaleFromText(text: string): string | undefined {
  const first8000 = text.slice(0, 8000);
  if (/in\s+thousands?,\s+except\s+(?:per\s+share|share)/i.test(first8000)) {
    return "thousands";
  }
  if (/amounts?\s+in\s+thousands/i.test(first8000)) return "thousands";
  if (/\(\s*in\s+thousands?\s*\)/i.test(first8000)) return "thousands";
  if (/in\s+millions?,\s+except\s+(?:per\s+share|share)/i.test(first8000)) {
    return "millions";
  }
  if (/\(\s*in\s+millions?\s*\)/i.test(first8000)) return "millions";
  return undefined;
}

function findExistingValue(analysis: FullAnalysis, metricTag?: string, metricLabel?: string): number | null {
  if (metricTag) {
    const byTag =
      analysis.cfItems?.find((i) => i.tag === metricTag)?.value ??
      analysis.balanceSheet.items.find((i) => i.tag === metricTag)?.value;
    if (byTag != null) return byTag;
  }
  if (!metricLabel) return null;
  const direct: Record<string, number | null> = {
    "Accounts Receivable": analysis.ratios.receivablesTurnover != null
      ? (analysis.cfItems?.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
         analysis.balanceSheet.items.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
         analysis.balanceSheet.items.find((i) => i.tag === "AccountsReceivableNet")?.value ??
         null)
      : (analysis.cfItems?.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
         analysis.balanceSheet.items.find((i) => i.tag === "AccountsReceivableNetCurrent")?.value ??
         analysis.balanceSheet.items.find((i) => i.tag === "AccountsReceivableNet")?.value ??
         null),
    "PP&E (Net)": analysis.balanceSheet.items.find((i) => i.tag === "PropertyPlantAndEquipmentNet")?.value ?? null,
    "Long-Term Debt": analysis.debtStructure.longTermDebt ?? null,
  };
  return direct[metricLabel] ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      ticker?: string;
      periodEnd?: string;
      metricTag?: string;
      metricLabel?: string;
    };
    const ticker = body.ticker?.trim().toUpperCase();
    const periodEnd = body.periodEnd?.trim();
    const metricTag = body.metricTag?.trim();
    const metricLabel = body.metricLabel?.trim();

    if (!ticker || !periodEnd || (!metricTag && !metricLabel)) {
      return NextResponse.json(
        { error: "ticker, periodEnd, and metricTag or metricLabel are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("filings")
      .select("analysis")
      .eq("ticker", ticker)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (error || !data?.analysis) {
      return NextResponse.json(
        { error: "Filing not found. Please re-upload and analyze this PDF first." },
        { status: 404 }
      );
    }

    const analysis = data.analysis as FullAnalysis;
    const filingText = analysis.meta.rawFilingText;
    if (!filingText || filingText.trim().length < 500) {
      return NextResponse.json(
        { error: "Raw filing text unavailable for this period. Please re-upload the PDF." },
        { status: 404 }
      );
    }

    const metric =
      (metricTag ? TAG_TO_METRIC[metricTag] : undefined) ??
      (metricLabel ? LABEL_TO_METRIC[metricLabel] : undefined);

    if (!metric) {
      return NextResponse.json(
        { error: `Unsupported metric for re-extraction: ${metricTag ?? metricLabel}` },
        { status: 400 }
      );
    }

    const scale = detectScaleFromText(filingText);
    const extracted = extractPdfFinancialValue(filingText, metric, scale);
    if (!extracted) {
      return NextResponse.json(
        { error: "Could not re-extract this metric from stored filing text." },
        { status: 404 }
      );
    }

    const oldValue = findExistingValue(analysis, metricTag, metricLabel);
    return NextResponse.json({
      ok: true,
      ticker,
      periodEnd,
      metricTag: metricTag ?? extracted.tag,
      metricLabel: metricLabel ?? extracted.label,
      oldValue,
      newValue: extracted.value,
      confidence: extracted.confidence,
      source: extracted.source,
      raw: extracted.raw,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

