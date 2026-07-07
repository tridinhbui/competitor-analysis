/**
 * Post-extraction repairs before assembleAnalysis:
 * derive missing equity from A−L or equity walk components, liabilities from A−E,
 * suppress absurd R&D rows, derive EBITDA when possible.
 */

import type { BSItem, IncomeStatement } from "@/types/analysis";

function findItem(items: BSItem[], tag: string): BSItem | undefined {
  return items.find((i) => i.tag === tag);
}

const REV_TAGS_FOR_SCALE_CHECK = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
] as const;

function extractRevenueForScaleCheck(cf: BSItem[]): number | null {
  for (const t of REV_TAGS_FOR_SCALE_CHECK) {
    const it = findItem(cf, t);
    if (!it || !Number.isFinite(it.value)) continue;
    const v = Math.abs(it.value);
    if (v > 100) return v;
  }
  return null;
}

/**
 * Large-filer PDF/AI slips sometimes multiply EVERYTHING by 1000 twice (classic "triple thousands"
 * or mis-mapped supplemental row). Symptoms: EBITDA >> revenue and total assets / revenue ratios
 * that look like percentages were stored as inflated millions.
 *
 * Divides offending items by 1000 once — fixes ROE / ROA denoms and EBITDA margin exploding.
 */
function repairMegaScaleThousandsDuplicate(
  bs: BSItem[],
  cf: BSItem[],
  repairs: string[]
): { bs: BSItem[]; cf: BSItem[] } {
  const revenue = extractRevenueForScaleCheck(cf);
  const taRow = findItem(bs, "Assets");
  const ta = taRow && Number.isFinite(taRow.value) ? Math.abs(taRow.value) : null;
  if (!revenue || revenue < 800 || ta == null) return { bs, cf };
  const ratio = ta / revenue;
  if (ratio < 45) return { bs, cf };

  repairs.push(
    `Scale repair (÷1000): balance sheet totals were ~${Math.round(ratio)}× consolidated revenue (${ta.toLocaleString()}M TA vs ${revenue.toLocaleString()}M Rev); diluted mega BS rows (+ selected IS/CF lines) by one thousands step.`
  );

  const div1000 = (it: BSItem): BSItem => ({
    ...it,
    value: Math.round(it.value * 0.001 * 100) / 100,
  });

  const minBsAbs = Math.max(500, revenue * 0.025);
  const nextBs = bs.map((it) => {
    if (!Number.isFinite(it.value)) return it;
    if (Math.abs(it.value) < minBsAbs) return it;
    return div1000(it);
  });

  /** Do not blanket-scale COGS/Revenue-tier CF lines—they can legitimately rival revenue ($M basis). */
  const cfMegaTags = new Set([
    "EBITDA",
    "EarningsBeforeInterestTaxesDepreciationAmortization",
    "OperatingIncomeLoss",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
    "IncomeBeforeIncomeTaxes",
    "NetIncomeLoss",
    "IncomeTaxExpenseBenefit",
    "InterestExpense",
    "InterestExpenseNet",
    "InterestExpenseDebt",
    "InterestAndDebtExpense",
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "Depreciation",
    "AmortizationOfIntangibleAssets",
  ]);
  const minCfMega = Math.max(1800, revenue * 0.035);

  const nextCf = cf.map((it) => {
    if (!cfMegaTags.has(it.tag) || !Number.isFinite(it.value)) return it;
    if (Math.abs(it.value) < minCfMega) return it;
    return div1000(it);
  });

  return { bs: nextBs, cf: nextCf };
}

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2019']/g, "'")
    .trim();
}

/** AI often leaves `label` empty; row text is in PDF provenance `PDF:pN:"..."`. */
export function effectiveRowLabel(it: BSItem): string {
  const lab = (it.label || "").trim();
  if (lab.length >= 4) return lab;
  const src = it.source || "";
  const m = src.match(/^PDF:p\d+:"([^"]{1,240})"/i);
  if (m?.[1]?.trim()) return m[1].trim();
  return lab;
}

function resolveCashMagnitude(bs: BSItem[]): number | null {
  for (const tag of [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashAndCashEquivalents",
  ] as const) {
    const it = findItem(bs, tag);
    if (it != null && Number.isFinite(it.value) && Math.abs(it.value) > 1) {
      return Math.abs(it.value);
    }
  }
  return null;
}

/**
 * When AI maps the right dollar amount to the wrong tag, recover totals from row labels.
 */
export function coalesceBalanceSheetTotalsFromLabels(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const out = [...bs];
  const period = findItem(out, "Assets")?.period ?? "";

  const tryPatch = (kind: "L" | "E") => {
    const needL = !findItem(out, "Liabilities") || Math.abs(findItem(out, "Liabilities")!.value) < 50;
    const needE =
      !findItem(out, "StockholdersEquity") ||
      Math.abs(findItem(out, "StockholdersEquity")!.value) < 50;

    for (const it of out) {
      const lab = normLabel(it.label || "");
      if (!lab || Math.abs(it.value) < 300) continue;

      if (
        kind === "L" &&
        needL &&
        /\btotal\s+liabilit(?:y|ies)\b/.test(lab) &&
        !/\band\b.*\b(stock|share)holders\b/.test(lab) &&
        it.tag !== "Liabilities"
      ) {
        repairs.push(
          `Used row "${it.label?.slice(0, 80)}" (${Math.abs(it.value).toLocaleString()}M) as total liabilities.`
        );
        const existingIdx = out.findIndex((x) => x.tag === "Liabilities");
        if (existingIdx >= 0) {
          out[existingIdx] = {
            ...out[existingIdx],
            value: Math.abs(it.value),
            source: `${it.source}|label:total_liabilities`,
          };
        } else {
          out.push({
            tag: "Liabilities",
            label: "Total liabilities (from label match)",
            value: Math.abs(it.value),
            period: period || it.period,
            source: `${it.source}|label:total_liabilities`,
          });
        }
        return true;
      }

      if (
        kind === "E" &&
        needE &&
        /(\btotal\s+.{1,140}?\b(stockholders|shareholders)\s+['']?equity\b)|\btotal\s+equity\b/i.test(
          lab
        ) &&
        it.tag !== "StockholdersEquity"
      ) {
        repairs.push(
          `Used row "${it.label?.slice(0, 80)}" (${Math.abs(it.value).toLocaleString()}M) as total equity.`
        );
        const existingIdx = out.findIndex((x) => x.tag === "StockholdersEquity");
        if (existingIdx >= 0) {
          out[existingIdx] = {
            ...out[existingIdx],
            value: it.value,
            source: `${it.source}|label:total_equity`,
          };
        } else {
          out.push({
            tag: "StockholdersEquity",
            label: "Total stockholders' equity (from label match)",
            value: it.value,
            period: period || it.period,
            source: `${it.source}|label:total_equity`,
          });
        }
        return true;
      }
    }
    return false;
  };

  tryPatch("L");
  tryPatch("E");
  return out;
}

/**
 * "Total liabilities and stockholders' equity" equals Assets and equals L+E.
 * If we have a walk sum for E, infer L = bind − E and fill both totals when missing.
 */
export function deriveLiabilitiesAndEquityFromBindLine(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const assets = findItem(bs, "Assets");
  const bind = findItem(bs, "LiabilitiesAndStockholdersEquity");
  if (!assets || !bind || assets.value < 500) return bs;

  const A = assets.value;
  const B = bind.value;
  if (Math.abs(A - B) / A > 0.04) return bs;

  const liab = findItem(bs, "Liabilities");
  const equity = findItem(bs, "StockholdersEquity");
  const hasL = liab && liab.value > 100;
  const hasE = equity && Math.abs(equity.value) > 50;
  if (hasL && hasE) return bs;

  // bind = L + E = A. If we have one total, infer the other.
  if (hasL && !hasE) {
    const e = Math.round(B - liab!.value);
    if (e > 50 && e < A * 1.02) {
      repairs.push(
        `Derived stockholders' equity ${e.toLocaleString()}M (combined L+E total − liabilities).`
      );
      const period = assets.period;
      let out = [...bs];
      const idx = out.findIndex((x) => x.tag === "StockholdersEquity");
      if (idx >= 0) {
        out[idx] = { ...out[idx], value: e, source: `${out[idx].source}|derived:bind_minus_L` };
      } else {
        out.push({
          tag: "StockholdersEquity",
          label: "Total stockholders' equity (from bind)",
          value: e,
          period,
          source: "derived:bind_minus_liabilities",
        });
      }
      return out;
    }
  }
  if (hasE && !hasL) {
    const l = Math.round(B - equity!.value);
    if (l > 100 && l < A * 1.02) {
      repairs.push(
        `Derived total liabilities ${l.toLocaleString()}M (combined L+E total − equity).`
      );
      const period = assets.period;
      let out = [...bs];
      const idx = out.findIndex((x) => x.tag === "Liabilities");
      if (idx >= 0) {
        out[idx] = { ...out[idx], value: l, source: `${out[idx].source}|derived:bind_minus_E` };
      } else {
        out.push({
          tag: "Liabilities",
          label: "Total liabilities (from bind)",
          value: l,
          period,
          source: "derived:bind_minus_equity",
        });
      }
      return out;
    }
  }

  let sumE = 0;
  let any = false;
  for (const tag of EQUITY_WALK_TAGS) {
    const it = findItem(bs, tag);
    if (it && typeof it.value === "number") {
      any = true;
      sumE += it.value;
    }
  }
  const eRounded = Math.round(sumE * 100) / 100;
  if (!any || Math.abs(eRounded) < 80 || Math.abs(eRounded) >= A * 1.05) return bs;

  const impliedL = Math.round(B - eRounded);
  if (impliedL < 100 || impliedL > A * 1.05) return bs;

  repairs.push(
    `Split total liabilities + equity line: equity ${eRounded.toLocaleString()}M (component sum), liabilities ${impliedL.toLocaleString()}M (= combined total − equity).`
  );

  let out = [...bs];
  const period = assets.period;

  const patch = (tag: string, value: number, label: string, src: string) => {
    const idx = out.findIndex((x) => x.tag === tag);
    if (idx >= 0) {
      out[idx] = { ...out[idx], value, source: `${out[idx].source}|${src}` };
    } else {
      out.push({ tag, label, value, period, source: src });
    }
  };

  if (!hasE) patch("StockholdersEquity", eRounded, "Total stockholders' equity (from bind)", "derived:bind_minus_walk");
  if (!hasL) patch("Liabilities", impliedL, "Total liabilities (from bind)", "derived:bind_minus_equity_walk");

  return out;
}

/** Tags that roll into total shareholders' equity when the total line is missing. */
const EQUITY_WALK_TAGS: string[] = [
  "CommonStockValue",
  "AdditionalPaidInCapital",
  "RetainedEarningsAccumulatedDeficit",
  "TreasuryStockValue",
  "AccumulatedOtherComprehensiveIncomeLoss",
  "MinorityInterest",
];

/**
 * When "Total liabilities" / "Stockholders' equity" totals are missing but walk lines exist,
 * sum equity components (treasury often negative) and patch StockholdersEquity.
 */
export function deriveEquityFromWalkComponents(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const assets = findItem(bs, "Assets");
  if (!assets || assets.value < 500) return bs;

  const existing = findItem(bs, "StockholdersEquity");
  if (existing && Math.abs(existing.value) > 100) return bs;

  let sum = 0;
  let any = false;
  for (const tag of EQUITY_WALK_TAGS) {
    const it = findItem(bs, tag);
    if (it && typeof it.value === "number") {
      any = true;
      sum += it.value;
    }
  }
  if (!any) return bs;

  const rounded = Math.round(sum * 100) / 100;
  if (Math.abs(rounded) < 80 || Math.abs(rounded) >= assets.value * 1.05) return bs;

  repairs.push(
    `Estimated stockholders' equity ${rounded.toLocaleString()}M from equity statement components (common stock, APIC, retained earnings, AOCI, treasury, NCI).`
  );

  if (existing) {
    return bs.map((i) =>
      i.tag === "StockholdersEquity"
        ? {
            ...i,
            value: rounded,
            source: `${i.source}|derived:equity_walk`,
          }
        : i
    );
  }

  return [
    ...bs,
    {
      tag: "StockholdersEquity",
      label: "Total stockholders' equity (from components)",
      value: rounded,
      period: assets.period,
      source: "derived:equity_walk_components",
    },
  ];
}

/**
 * Many filings show "Total current liabilities" + "Total non-current liabilities" without one "Total liabilities" line.
 */
export function deriveLiabilitiesFromCurrentAndNoncurrent(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const existing = findItem(bs, "Liabilities");
  if (existing && existing.value > 100) return bs;

  const cur = findItem(bs, "LiabilitiesCurrent");
  const ncur = findItem(bs, "LiabilitiesNoncurrent");
  if (!cur || !ncur) return bs;
  if (cur.value < 50 || ncur.value < 50) return bs;

  const sum = Math.round(cur.value + ncur.value);
  if (sum < 200) return bs;

  repairs.push(
    `Estimated total liabilities ${sum.toLocaleString()}M (current + non-current liabilities).`
  );

  if (existing) {
    return bs.map((i) =>
      i.tag === "Liabilities"
        ? { ...i, value: sum, source: `${i.source}|derived:current_plus_noncurrent` }
        : i
    );
  }

  const assets = findItem(bs, "Assets");
  const row = {
    tag: "Liabilities",
    label: "Total liabilities (from components)",
    value: sum,
    period: assets?.period ?? "",
    source: "derived:liabilities_current_plus_noncurrent",
  } satisfies BSItem;
  return [...bs, row];
}

export function deriveLiabilitiesFromAssetsMinusEquity(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const assets = findItem(bs, "Assets");
  const liab = findItem(bs, "Liabilities");
  const equity = findItem(bs, "StockholdersEquity");
  if (!assets || assets.value < 500) return bs;
  if (liab && liab.value > 100) return bs;
  const eVal = equity?.value ?? 0;
  if (Math.abs(eVal) < 50) return bs;

  const derived = Math.round(assets.value - eVal);
  if (derived < 100 || derived > assets.value) return bs;

  repairs.push(
    `Derived total liabilities ${derived.toLocaleString()}M (Assets − Equity).`
  );

  if (liab) {
    return bs.map((i) =>
      i.tag === "Liabilities"
        ? {
            ...i,
            value: derived,
            source: `${i.source}|derived:A_minus_E`,
          }
        : i
    );
  }

  return [
    ...bs,
    {
      tag: "Liabilities",
      label: "Total liabilities (derived)",
      value: derived,
      period: assets.period,
      source: "derived:assets_minus_equity",
    },
  ];
}

/** Prefer largest revenue among consolidated tags (same idea as analysisEngine). */
function pickRevenue(cf: BSItem[]): number | null {
  const tags = [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ];
  const vals = cf
    .filter((i) => tags.includes(i.tag))
    .map((i) => i.value)
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => (b > a ? b : a));
}

/**
 * If liabilities and assets are well populated but equity is missing/zero, set E = A − L.
 * Typical when AI omits the equity line but captures the other two totals.
 */
export function deriveEquityFromAccountingIdentity(
  bs: BSItem[],
  repairs: string[]
): BSItem[] {
  const assets = findItem(bs, "Assets");
  const liab = findItem(bs, "Liabilities");
  const equity = findItem(bs, "StockholdersEquity");
  if (!assets || assets.value <= 500) return bs;
  if (!liab || liab.value <= 100) return bs;

  const eqVal = equity?.value ?? 0;
  const implied = assets.value - liab.value;
  const gap = Math.abs(implied - eqVal) / assets.value;

  // Replace placeholder/zero equity or large mismatch
  const needsPatch =
    Math.abs(eqVal) < 5 ||
    (Math.abs(eqVal) > 5 && gap > 0.03);

  if (!needsPatch) return bs;

  const derived = Math.round(implied);
  if (derived < 1 || derived >= assets.value) return bs;

  repairs.push(
    `Derived stockholders' equity ${derived.toLocaleString()}M (Assets − Liabilities).`
  );

  if (equity) {
    return bs.map((i) =>
      i.tag === "StockholdersEquity"
        ? {
            ...i,
            value: derived,
            source: i.source.includes("derived:")
              ? i.source
              : `${i.source}|derived:A_minus_L`,
          }
        : i
    );
  }

  return [
    ...bs,
    {
      tag: "StockholdersEquity",
      label: "Total stockholders' equity (derived)",
      value: derived,
      period: assets.period,
      source: "derived:assets_minus_liabilities",
    },
  ];
}

/** Food / protein processors rarely exceed ~25% R&D / revenue; huge values are almost always mis-tags. */
export function suppressRdOutliers(cf: BSItem[], repairs: string[]): BSItem[] {
  const rev = pickRevenue(cf);
  if (rev == null || rev < 100) return cf;

  return cf.filter((i) => {
    if (i.tag !== "ResearchAndDevelopmentExpense") return true;
    const ratio = Math.abs(i.value) / rev;
    if (ratio > 0.25) {
      repairs.push(
        `Excluded R&D line (${Math.abs(i.value).toLocaleString()}M vs revenue ${rev.toLocaleString()}M) as likely extraction error.`
      );
      return false;
    }
    return true;
  });
}

function findOrNullCf(cf: BSItem[], ...tags: string[]): number | null {
  for (const t of tags) {
    const it = findItem(cf, t);
    if (it) return it.value;
  }
  return null;
}

/** When canonical tags miss D&A, take the largest plausible line by label (e.g. "Depreciation and amortization"). */
function inferDaFromCfLineLabels(
  cf: BSItem[],
  revenue: number | null
): number | null {
  let best = 0;
  for (const i of cf) {
    const lab = (i.label || "").toLowerCase();
    if (!/(depreciation|amortization)/i.test(lab)) continue;
    if (/net\s+cash\s+provided|cash\s+flows?\s+from/i.test(lab)) continue;
    const v = Math.abs(i.value);
    if (v < 40) continue;
    if (revenue != null && v > revenue * 0.45) continue;
    if (v > best) best = v;
  }
  return best >= 40 ? best : null;
}

/**
 * EBITDA ≈ Net income + Interest + Income taxes + D&A (expense magnitudes).
 * Used when direct EBITDA lines were not mapped but components exist on cfItems.
 */
export function deriveEbitdaIfMissing(
  inc: IncomeStatement,
  cf: BSItem[]
): IncomeStatement {
  if (cf.some((i) => (i.source || "").includes("label:key_measures_ebitda"))) {
    return inc;
  }

  if (inc.ebitda != null && Math.abs(inc.ebitda) > 1) return inc;

  const dep =
    inc.depreciation ??
    (() => {
      const v = findOrNullCf(
        cf,
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
        "Depreciation",
        "CostDepreciationAmortizationAndDepletion"
      );
      return v != null ? Math.abs(v) : null;
    })();

  const amort =
    inc.amortization ??
    (() => {
      const v = findOrNullCf(cf, "AmortizationOfIntangibleAssets");
      return v != null ? Math.abs(v) : null;
    })();

  let da = (dep ?? 0) + (amort ?? 0);
  if (da < 1) {
    const inferred = inferDaFromCfLineLabels(cf, inc.revenue ?? null);
    if (inferred != null) da = inferred;
  }

  // Path A: Operating income + D&A (works when interest/tax lines missing from extract)
  if (inc.operatingIncome != null && da >= 1) {
    const ebitda = Math.round((inc.operatingIncome + da) * 100) / 100;
    if (Number.isFinite(ebitda) && Math.abs(ebitda) >= 1) {
      const margin =
        inc.revenue != null && inc.revenue !== 0
          ? Math.round((ebitda / inc.revenue) * 1000) / 10
          : null;
      return {
        ...inc,
        ebitda,
        ebitdaMargin: margin,
        ebitdaGaap: inc.ebitdaGaap ?? ebitda,
      };
    }
  }

  // Path B: Net income + interest + tax + D&A
  const ni = inc.netIncome;
  if (ni == null) return inc;

  const interest =
    inc.interestExpense ??
    (() => {
      const v = findOrNullCf(
        cf,
        "InterestExpense",
        "InterestExpenseNet",
        "InterestAndDebtExpense"
      );
      return v != null ? Math.abs(v) : null;
    })();

  const tax =
    inc.incomeTax ??
    (() => {
      const v = findOrNullCf(cf, "IncomeTaxExpenseBenefit");
      return v != null ? Math.abs(v) : null;
    })();

  if (interest == null || tax == null || da < 1) return inc;

  const ebitda = Math.round((ni + interest + tax + da) * 100) / 100;
  if (!Number.isFinite(ebitda) || Math.abs(ebitda) < 1) return inc;

  const margin =
    inc.revenue != null && inc.revenue !== 0
      ? Math.round((ebitda / inc.revenue) * 1000) / 10
      : null;

  return {
    ...inc,
    ebitda,
    ebitdaMargin: margin,
    ebitdaGaap: inc.ebitdaGaap ?? ebitda,
  };
}

function scoreEbitdaSourceItem(it: BSItem, revenue: number | null): number {
  let s = 0;
  const src = (it.source || "").toLowerCase();
  const lab = (it.label || "").toLowerCase();
  const combined = `${src} ${lab}`;
  if (/key financial|other key financial|supplemental|non-gaap/i.test(combined)) s += 120;
  if (/contractual|obligation|maturity|ebitda\s+margin|net\s+debt.*ebitda/i.test(combined)) s -= 100;
  if (revenue != null && revenue > 0) {
    const v = Math.abs(it.value);
    if (v > revenue * 0.45) s -= 120;
    if (v < 40) s -= 40;
  }
  return s;
}

/** Row reads as operating income / OI — not disclosed EBITDA even if mis-tagged. */
function labelLooksLikeOperatingIncome(lab: string): boolean {
  return /\boperating\s+income\b|\bincome\s+from\s+operations\b|\boperating\s+profit\b/i.test(normLabel(lab));
}

/**
 * Standalone "EBITDA" / "Adjusted EBITDA" measure row (excludes margin, ratios, definitions).
 * Labels are often long ("Other Key Financial Measures — EBITDA (calculated sum)").
 */
function labelIsStandaloneEbitdaRowFromText(text: string): boolean {
  const n = normLabel(text);
  if (!n || n.length < 4) return false;
  if (!/\bebitda\b/i.test(n)) return false;
  if (
    /ebitda\s+is\s+(?:defined|calculated|determined)\b|ebitda\s+represents|definition\s+of\s+ebitda/i.test(
      n
    )
  ) {
    return false;
  }
  if (
    /\bmargin\b|\bebitda\s+margin\b|\bratio\b|ebitda\s+to\b|net\s+debt\s*\/?\s*ebitda|conversion\b|coverage\b/i.test(
      n
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Prefer company-disclosed EBITDA from tagged line items when multiple exist (e.g. IS vs Key Financial Measures).
 */
export function pickDisclosedEbitdaValue(items: BSItem[], revenue: number | null): number | null {
  const oi = items.find((i) => i.tag === "OperatingIncomeLoss");
  const oiVal = oi != null && Number.isFinite(oi.value) ? Math.abs(oi.value) : null;

  let tagged = items.filter((i) => {
    if (i.tag !== "EBITDA" && i.tag !== "EarningsBeforeInterestTaxesDepreciationAmortization") return false;
    const vAbs = Math.abs(i.value ?? 0);
    if (
      revenue != null &&
      revenue > 500 &&
      vAbs > revenue * 3
    ) {
      return false;
    }
    const el = effectiveRowLabel(i);
    if (labelLooksLikeOperatingIncome(el)) return false;
    if (
      oiVal != null &&
      oiVal > 1 &&
      Math.abs(Math.abs(i.value) - oiVal) <= Math.max(oiVal * 0.004, 0.5) &&
      !labelIsStandaloneEbitdaRowFromText(el)
    ) {
      return false;
    }
    return true;
  });

  if (tagged.length === 0) return null;
  if (tagged.length === 1) {
    const v = Math.abs(tagged[0].value);
    if (revenue != null && revenue > 500 && v > revenue * 3) return null;
    return v;
  }

  tagged = [...tagged].sort((a, b) => {
    const d = scoreEbitdaSourceItem(b, revenue) - scoreEbitdaSourceItem(a, revenue);
    if (d !== 0) return d;
    return Math.abs(a.value) - Math.abs(b.value);
  });
  const chosen = tagged[0];
  const vOut = Math.abs(chosen?.value ?? 0);
  if (revenue != null && revenue > 500 && vOut > revenue * 3) return null;
  return vOut;
}

/**
 * "Other Key Financial Measures" (and similar) often report EBITDA that differs from Operating Income + D&A.
 * Patch or append a GrossDebt-style EBITDA line when we can read it from row labels.
 */
export function coalesceEbitdaFromLabels(
  cf: BSItem[],
  bs: BSItem[],
  repairs: string[]
): { cf: BSItem[]; bs: BSItem[] } {
  const all = [...cf, ...bs];
  const rev =
    findItem(cf, "Revenues")?.value ??
    findItem(cf, "SalesRevenueGoodsNet")?.value ??
    findItem(cf, "SalesRevenueNet")?.value;
  const revenue = rev != null && Math.abs(rev) > 100 ? Math.abs(rev) : null;

  const candidates = all.filter((it) => {
    if (!labelIsStandaloneEbitdaRowFromText(effectiveRowLabel(it))) return false;
    if (Math.abs(it.value) < 50) return false;
    return true;
  });

  if (candidates.length === 0) return { cf, bs };

  candidates.sort((a, b) => {
    const d = scoreEbitdaSourceItem(b, revenue) - scoreEbitdaSourceItem(a, revenue);
    if (d !== 0) return d;
    return Math.abs(b.value) - Math.abs(a.value);
  });

  const best = candidates[0];
  const vBest = Math.abs(best.value);
  if (revenue != null && revenue > 500 && vBest > revenue * 3) {
    return { cf, bs };
  }

  const tagged = all.filter(
    (i) => i.tag === "EBITDA" || i.tag === "EarningsBeforeInterestTaxesDepreciationAmortization"
  );
  for (const t of tagged) {
    const tv = Math.abs(t.value);
    if (tv > 1 && Math.abs(tv - vBest) / vBest < 0.02) return { cf, bs };
  }

  repairs.push(
    `EBITDA: used "${best.label?.slice(0, 70)}" (${vBest.toLocaleString()}M) from disclosed/key-measures label match.`
  );

  const period = findItem(cf, "Revenues")?.period ?? findItem(bs, "Assets")?.period ?? best.period;
  const row: BSItem = {
    tag: "EBITDA",
    label: best.label ?? "EBITDA",
    value: vBest,
    period: period || best.period,
    source: `${best.source}|label:key_measures_ebitda`,
  };

  let nextCf = [...cf];
  let nextBs = [...bs];
  const idxC = nextCf.findIndex((x) => x.tag === "EBITDA" || x.tag === "EarningsBeforeInterestTaxesDepreciationAmortization");
  const idxB = nextBs.findIndex((x) => x.tag === "EBITDA" || x.tag === "EarningsBeforeInterestTaxesDepreciationAmortization");

  if (idxC >= 0) {
    nextCf[idxC] = row;
  } else if (idxB >= 0) {
    nextBs[idxB] = row;
  } else {
    nextCf = [...nextCf, row];
  }

  return { cf: nextCf, bs: nextBs };
}

/**
 * Supplemental "Total gross debt" / "Total debt" often appear in CF-extracted tables (Key Financial Measures),
 * not on the face balance sheet. Scan BS + CF and replace a weak GrossDebt tag.
 */
export function coalesceGrossDebtFromLabels(
  bs: BSItem[],
  cf: BSItem[],
  repairs: string[]
): BSItem[] {
  const all = [...bs, ...cf];
  type Cand = { it: BSItem; score: number; v: number };
  const cands: Cand[] = [];

  for (const it of all) {
    const lab = normLabel(effectiveRowLabel(it));
    if (!lab || Math.abs(it.value) < 400) continue;
    if (/^total\s+long[\s-]*term\s+debt\b/i.test(lab)) continue;
    if (/^total\s+net\s+debt\b/i.test(lab)) continue;

    const isGrossTotal =
      /^total\s+gross\s+debt\b/i.test(lab) ||
      (/^total\s+debt\b/i.test(lab) && !/\blong[\s-]*term\b/i.test(lab));

    if (!isGrossTotal) continue;

    let score = 0;
    const blob = `${(it.source || "").toLowerCase()} ${lab}`;
    if (/key financial|other key financial|gross\s+debt|debt\s+footnote/i.test(blob)) score += 45;
    const v = Math.abs(it.value);
    cands.push({ it, score, v });
  }

  if (cands.length === 0) return bs;

  cands.sort((a, b) => b.score - a.score || b.v - a.v);
  const best = cands[0];
  const vBest = best.v;

  const existing = findItem(bs, "GrossDebt");
  if (existing != null && Math.abs(Math.abs(existing.value) - vBest) / vBest < 0.015) {
    return bs;
  }

  repairs.push(
    `Debt total: used "${effectiveRowLabel(best.it).slice(0, 70)}" (${vBest.toLocaleString()}M) as gross total debt.`
  );

  const period = findItem(bs, "Assets")?.period ?? best.it.period;
  const row: BSItem = {
    tag: "GrossDebt",
    label: effectiveRowLabel(best.it).slice(0, 120) || "Total debt (gross)",
    value: vBest,
    period,
    source: `${best.it.source}|label:gross_debt`,
  };

  const idx = bs.findIndex((x) => x.tag === "GrossDebt");
  if (idx >= 0) {
    const next = [...bs];
    next[idx] = row;
    return next;
  }
  return [...bs, row];
}

/**
 * Same-table convention: total net debt + cash & equivalents ≈ total gross debt.
 * Recovers gross when only LT debt was tagged (e.g. 7,921) but supplemental shows 7,601 net and 1,229 cash.
 */
export function inferGrossDebtFromNetDebtRow(bs: BSItem[], cf: BSItem[], repairs: string[]): BSItem[] {
  const cash = resolveCashMagnitude(bs);
  if (cash == null || cash < 1) return bs;

  const all = [...bs, ...cf];
  let bestNet: BSItem | null = null;
  let bestScore = -1;

  for (const it of all) {
    if (Math.abs(it.value) < 100) continue;

    if (it.tag === "TotalNetDebtSupplemental") {
      let s = 70;
      const lab = normLabel(effectiveRowLabel(it));
      if (/key financial|other key financial/i.test(`${(it.source || "").toLowerCase()} ${lab}`)) s += 20;
      if (s > bestScore) {
        bestScore = s;
        bestNet = it;
      }
      continue;
    }

    const lab = normLabel(effectiveRowLabel(it));
    if (!lab) continue;
    if (!/^total\s+net\s+debt\b/i.test(lab)) continue;
    if (/\bratio\b|net\s+debt\s+to\b/i.test(lab)) continue;

    let s = 0;
    if (/key financial|other key financial/i.test(`${(it.source || "").toLowerCase()} ${lab}`)) s += 55;
    const v = Math.abs(it.value);
    if (v + cash > 2500 && v + cash < 100000) s += 15;
    if (s > bestScore) {
      bestScore = s;
      bestNet = it;
    }
  }

  if (bestNet == null) return bs;

  const vNet = Math.abs(bestNet.value);
  const impliedGross = Math.round((vNet + cash) * 100) / 100;

  if (impliedGross < 2000 || impliedGross > 100000) return bs;

  const existing = findItem(bs, "GrossDebt");
  if (
    existing != null &&
    Math.abs(Math.abs(existing.value) - impliedGross) / impliedGross < 0.02
  ) {
    return bs;
  }

  repairs.push(
    `Debt total: derived gross ${impliedGross.toLocaleString()}M from total net debt (${vNet.toLocaleString()}M) + cash (${cash.toLocaleString()}M).`
  );

  const period = findItem(bs, "Assets")?.period ?? bestNet.period;
  const row: BSItem = {
    tag: "GrossDebt",
    label: "Total gross debt (from net debt + cash)",
    value: impliedGross,
    period,
    source: `${bestNet.source}|derived:net_plus_cash`,
  };

  const idx = bs.findIndex((x) => x.tag === "GrossDebt");
  if (idx >= 0) {
    const next = [...bs];
    next[idx] = row;
    return next;
  }
  return [...bs, row];
}

export function applyExtractionRepairs(
  bs: BSItem[],
  cf: BSItem[]
): { bs: BSItem[]; cf: BSItem[]; repairs: string[] } {
  const repairs: string[] = [];
  let cf1 = suppressRdOutliers(cf, repairs);
  let bs1 = coalesceBalanceSheetTotalsFromLabels(bs, repairs);
  bs1 = coalesceGrossDebtFromLabels(bs1, cf1, repairs);
  bs1 = inferGrossDebtFromNetDebtRow(bs1, cf1, repairs);
  const ebitdaM = coalesceEbitdaFromLabels(cf1, bs1, repairs);
  cf1 = ebitdaM.cf;
  bs1 = ebitdaM.bs;
  bs1 = deriveLiabilitiesAndEquityFromBindLine(bs1, repairs);
  bs1 = deriveLiabilitiesFromCurrentAndNoncurrent(bs1, repairs);
  bs1 = deriveEquityFromWalkComponents(bs1, repairs);
  bs1 = deriveEquityFromAccountingIdentity(bs1, repairs);
  bs1 = deriveLiabilitiesFromAssetsMinusEquity(bs1, repairs);
  const megaFixed = repairMegaScaleThousandsDuplicate(bs1, cf1, repairs);
  bs1 = megaFixed.bs;
  cf1 = megaFixed.cf;
  return { bs: bs1, cf: cf1, repairs };
}
