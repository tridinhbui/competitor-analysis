import { STRICT_PROVENANCE_EXTRACTOR_SYSTEM } from "@/lib/prompts/strictProvenanceExtractor";

export const IS_CF_PROMPT =
  STRICT_PROVENANCE_EXTRACTOR_SYSTEM +
  `
CALL-SPECIFIC: INCOME STATEMENT + CASH FLOW (+ equity-statement SBC if only shown there)
Return JSON with "meta" and "items" exactly as defined in the system rules (provenance fields required per item).

Items MUST use ONLY these EXACT tags:

INCOME STATEMENT:
- Revenues -> Net sales / sales / net revenue / total revenue (food companies often label "Sales")
- CostOfGoodsSold -> Cost of goods sold / cost of sales / cost of products sold
- CostOfGoodsAndServicesSold -> Cost of goods and services sold
- CostOfRevenue -> Cost of revenue (exact label)
- GrossProfit -> Gross profit (or compute Revenues - COGS if clearly implied)
- SellingGeneralAndAdministrativeExpense -> SG&A
- ResearchAndDevelopmentExpense -> R&D
- OperatingExpenses -> Total operating expenses (if shown as a total)
- OperatingIncomeLoss -> Operating income / income from operations / operating profit
- InterestExpense -> Interest expense (positive)
- InterestIncome -> Interest income
- IncomeTaxExpenseBenefit -> Income tax expense / provision for income taxes
- NetIncomeLoss -> Net income / net earnings / attributable lines
- EarningsPerShareBasic -> Basic EPS (per-share; unit per-share; NOT millions)
- EarningsPerShareDiluted -> Diluted EPS (per-share; unit per-share)
- WeightedAverageSharesBasic -> Weighted average shares basic (millions; unit shares-millions)
- WeightedAverageSharesDiluted -> Weighted average shares diluted (millions; unit shares-millions)

CASH FLOW:
- DepreciationDepletionAndAmortization -> D&A
- DepreciationAndAmortization -> alternative D&A tag
- Depreciation -> Depreciation only
- AmortizationOfIntangibleAssets -> Amortization of intangibles
- ShareBasedCompensation -> SBC (check equity statement if missing from CF)
- NetCashProvidedByOperatingActivities -> Net cash from operating activities (continuing if split)
- PaymentsToAcquirePropertyPlantAndEquipment -> CapEx (POSITIVE outflow magnitude)
- NetCashProvidedByInvestingActivities -> Net cash from investing activities
- ProceedsFromIssuanceOfLongTermDebt -> Debt issuance (POSITIVE)
- RepaymentsOfLongTermDebt -> LT debt repayments ONLY when label explicitly long-term (POSITIVE)
- RepaymentsOfShortTermDebt -> ST debt repayments (POSITIVE)
- RepaymentsOfDebt -> Mixed / ambiguous debt payments (POSITIVE)
- RepaymentsOfCommercialPaper -> Commercial paper repayments (POSITIVE)
- PaymentsOfDividends -> Dividends paid (POSITIVE even if filing shows negative)
- PaymentsOfDividendsCommonStock -> Common dividends (POSITIVE)
- PaymentsForRepurchaseOfCommonStock -> Share repurchases / buybacks (POSITIVE; prefer financing CF dollars)
- NetCashProvidedByFinancingActivities -> Net cash from financing activities

IS/CF rules:
- For a quarterly 10-Q dashboard, prefer **Three months ended** column (periodBasis "quarter"), not YTD, unless only YTD is available.
- CapEx, debt repayments, dividends, buybacks: POSITIVE magnitudes as specified above.
- Interest expense POSITIVE.
- Operating income and net income may be negative (losses).
- "Sales" at top of consolidated income statement = Revenues; do not confuse with SG&A segment "sales".
- FCF is computed downstream from OCF and CapEx only.
- Debt repayment tag rules: ambiguous "Payments on debt" -> RepaymentsOfDebt; explicit LT -> RepaymentsOfLongTermDebt; commercial paper -> RepaymentsOfCommercialPaper.
- Do NOT invent numbers.
`;
