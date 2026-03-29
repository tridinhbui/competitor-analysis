import { NextResponse } from "next/server";
import { assembleAnalysis } from "@/lib/analysisEngine";
import type { BSItem } from "@/types/analysis";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANALYSIS_PROMPT = `You are a financial data extraction engine. Given raw text extracted from a 10-Q or 10-K SEC filing PDF, extract ALL financial line items you can find.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "companyName": "string or null",
  "periodEnd": "YYYY-MM-DD or null",
  "scaleNote": "millions/thousands/billions/units",
  "bs": [
    {"tag": "Assets", "label": "Total assets", "value": <number in USD millions>},
    ...
  ],
  "cf": [
    {"tag": "NetIncomeLoss", "label": "Net income", "value": <number in USD millions>},
    ...
  ]
}

CRITICAL RULES:
1. ALL values MUST be in USD millions. If the filing uses thousands, divide by 1000. If billions, multiply by 1000.
2. For parenthesized numbers like (1,234), treat as NEGATIVE.
3. Use these EXACT tags for balance sheet items:
   Assets, AssetsCurrent, AssetsNoncurrent, CashAndCashEquivalentsAtCarryingValue, ShortTermInvestments, AccountsReceivableNet, InventoryNet, PropertyPlantAndEquipmentNet, Goodwill, IntangibleAssetsNet, Liabilities, LiabilitiesCurrent, LiabilitiesNoncurrent, AccountsPayable, AccruedLiabilitiesCurrent, DeferredRevenueCurrent, DebtCurrent, LongTermDebtNoncurrent, LongTermDebt, OperatingLeaseLiabilityNoncurrent, StockholdersEquity, CommonStockValue, AdditionalPaidInCapital, RetainedEarningsAccumulatedDeficit, TreasuryStockValue, AccumulatedOtherComprehensiveIncomeLoss, LiabilitiesAndStockholdersEquity
4. Use these EXACT tags for income/cash flow items:
   Revenues, CostOfGoodsSold, GrossProfit, ResearchAndDevelopmentExpense, SellingGeneralAndAdministrativeExpense, OperatingExpenses, OperatingIncomeLoss, InterestExpense, InterestIncome, IncomeTaxExpense, NetIncomeLoss, EarningsPerShareBasic, EarningsPerShareDiluted, DepreciationAndAmortization, NetCashProvidedByOperatingActivities, NetCashProvidedByFinancingActivities, NetCashProvidedByInvestingActivities, PaymentsToAcquirePropertyPlantAndEquipment, PaymentsOfDividends, ShareBasedCompensation, RepaymentsOfDebt, ProceedsFromDebt, PaymentsForRepurchaseOfCommonStock
5. For items NOT found in the text, do NOT include them.
6. Extract the MOST RECENT period values (usually the first/leftmost column of numbers).
7. Capital expenditures and dividends paid should be POSITIVE numbers (absolute values).
8. If you find additional financial line items beyond the listed tags, include them with descriptive tags.`;

interface AiExtraction {
  companyName?: string | null;
  periodEnd?: string | null;
  scaleNote?: string;
  bs?: { tag: string; label: string; value: number }[];
  cf?: { tag: string; label: string; value: number }[];
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY chưa được cấu hình trên server." },
      { status: 503 }
    );
  }

  let body: { text?: string; fileName?: string; pages?: number; chars?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body không hợp lệ" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text || text.length < 200) {
    return NextResponse.json(
      { error: "Văn bản trích xuất quá ngắn hoặc trống" },
      { status: 400 }
    );
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const truncatedText = text.slice(0, 120_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          {
            role: "user",
            content: `Extract all financial data from this 10-Q/10-K filing text (${body.pages ?? "?"} pages, ${body.chars ?? text.length} characters):\n\n${truncatedText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg =
        (errData as { error?: { message?: string } }).error?.message ??
        `OpenAI trả về ${res.status}`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return NextResponse.json(
        { error: "OpenAI trả về nội dung rỗng" },
        { status: 502 }
      );
    }

    let extraction: AiExtraction;
    try {
      extraction = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Không parse được JSON từ OpenAI", raw: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    const period = extraction.periodEnd ?? new Date().toISOString().slice(0, 10);

    const bsItems: BSItem[] = (extraction.bs ?? []).map((item) => ({
      tag: item.tag,
      label: item.label,
      value: Math.round(item.value),
      period,
      source: `AI:${item.tag}`,
    }));

    const cfItems: BSItem[] = (extraction.cf ?? []).map((item) => ({
      tag: item.tag,
      label: item.label,
      value: Math.round(item.value),
      period,
      source: `AI:${item.tag}`,
    }));

    const analysis = assembleAnalysis(bsItems, cfItems, {
      source: "pdf",
      companyName: extraction.companyName ?? undefined,
      fileName: body.fileName,
      pagesRead: body.pages,
      charsExtracted: body.chars ?? text.length,
      periodEnd: period,
      confidence: "medium",
      extractionMethod: "pdf-ai",
    });

    return NextResponse.json({ analysis });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lỗi gọi OpenAI" },
      { status: 502 }
    );
  }
}
