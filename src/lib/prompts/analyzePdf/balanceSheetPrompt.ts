import { STRICT_PROVENANCE_EXTRACTOR_SYSTEM } from "@/lib/prompts/strictProvenanceExtractor";

export const BS_PROMPT =
  STRICT_PROVENANCE_EXTRACTOR_SYSTEM +
  `
CALL-SPECIFIC: BALANCE SHEET ONLY
Return JSON with "meta" and "items" exactly as defined in the system rules (provenance fields required per item).

Items MUST use ONLY these EXACT tags (do not output income or cash flow tags in this call):
- Assets -> Total assets
- AssetsCurrent -> Total current assets
- AssetsNoncurrent -> Total non-current assets
- CashAndCashEquivalentsAtCarryingValue -> Cash and cash equivalents
- ShortTermInvestments -> Short-term investments / marketable securities
- AccountsReceivableNet -> Accounts receivable, net (trade receivables)
- AccountsReceivableNetCurrent -> Accounts receivable current
- InventoryNet -> Inventories
- PrepaidExpenseAndOtherAssetsCurrent -> Prepaid expenses & other current assets
- PropertyPlantAndEquipmentNet -> Property, plant & equipment, net
- Goodwill -> Goodwill
- IntangibleAssetsNet -> Intangible assets, net
- OtherAssetsNoncurrent -> Other non-current assets
- DeferredIncomeTaxAssetsNet -> Deferred income tax assets
- Liabilities -> Total liabilities
- LiabilitiesCurrent -> Total current liabilities
- LiabilitiesNoncurrent -> Total non-current / long-term liabilities
- AccountsPayable -> Accounts payable (trade payables)
- AccruedLiabilitiesCurrent -> Accrued expenses / accrued liabilities
- DeferredRevenueCurrent -> Deferred revenue (current)
- DebtCurrent -> Current portion of long-term debt / short-term borrowings / notes payable current
- LongTermDebtNoncurrent -> Long-term debt (non-current portion)
- LongTermDebt -> Long-term debt (if only one debt line is shown)
- ShortTermBorrowings -> Short-term borrowings / revolving credit (if separate from current portion of LT debt)
- LongTermDebtCurrent -> Current maturities of long-term debt (if shown as separate line from DebtCurrent)
- OperatingLeaseLiabilityNoncurrent -> Operating lease liabilities (non-current)
- FinanceLeaseLiabilityNoncurrent -> Finance lease obligations (non-current portion)
- PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent -> Pension / OPEB obligations (non-current)
- RedeemableNoncontrollingInterestEquityCarryingAmount -> Redeemable noncontrolling interests (mezzanine)
- StockholdersEquity -> Total stockholders' equity / shareholders' equity (NET after treasury & AOCI)
- CommonStockValue -> Common stock
- AdditionalPaidInCapital -> Additional paid-in capital / APIC
- RetainedEarningsAccumulatedDeficit -> Retained earnings / accumulated deficit
- TreasuryStockValue -> Treasury stock (NEGATIVE when parenthesized)
- AccumulatedOtherComprehensiveIncomeLoss -> AOCI
- LiabilitiesAndStockholdersEquity -> Total liabilities and stockholders' equity
- MinorityInterest -> Noncontrolling interests inside total equity

Balance-sheet rules:
- Extract the most recent balance sheet column (latest "As of" / rightmost data column if clearly labeled).
- For every item set statementType to "balance_sheet".
- periodBasis: use "unknown" for typical point-in-time balances unless clearly fiscal year-end only.
- If a line item matches multiple tags, pick the most specific one.
- ALL parenthesized values (1,234) are NEGATIVE where applicable (TreasuryStockValue, AOCI, etc.).
- TreasuryStockValue MUST be negative when shown in parentheses.
- StockholdersEquity: prefer the FINAL total line; if Company vs Total exist, choose TOTAL (includes NCI).
- Validate Assets ~ Liabilities + Equity; if mismatch, re-check StockholdersEquity.
- Do NOT invent numbers.
`;
