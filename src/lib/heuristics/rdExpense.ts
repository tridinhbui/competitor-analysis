// ---------------------------------------------------------------------------
// R&D Expense Resolution Heuristic
// Extracts research & development expense from filing text via regex patterns,
// with fallback to revenue-ratio estimation.
// ---------------------------------------------------------------------------

export type RdMethod =
  | "extracted"
  | "derived_from_rd_tax_or_capitalization"
  | "estimated_from_revenue_ratio";

export interface RdResolution {
  rAndDExpense: number | null;
  method: RdMethod | null;
  rAndDPercentUsed: number | null;
  rAndDPeriodBasis: "quarterly" | "ytd" | "annual" | null;
}

export function resolveRnDExpense(opts: {
  text: string;
  scaleNote: string | undefined;
  companyName: string | null | undefined;
  existingRd: number | null;
  currentRevenue: number | null;
}): RdResolution {
  const { text, scaleNote, companyName, existingRd, currentRevenue } = opts;

  if (existingRd != null && Math.abs(existingRd) > 0) {
    return {
      rAndDExpense: Math.abs(existingRd),
      method: "extracted",
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  let scale = 1;
  if (scaleNote === "thousands") scale = 0.001;
  else if (scaleNote === "billions") scale = 1000;

  const toMillions = (v: number): number => Math.round(v * scale * 100) / 100;
  const isYearLike = (n: number): boolean => n >= 1900 && n <= 2100;

  function numsFrom(s: string): number[] {
    const out: number[] = [];
    const re = /\(?([\d,]+(?:\.\d+)?)\)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(n) && !isYearLike(n)) out.push(n);
    }
    return out;
  }

  function window(arr: string[], i: number, ahead = 3): string {
    return arr.slice(i, i + 1 + ahead).join(" ");
  }

  function detectBasis(s: string): "quarterly" | "ytd" | "annual" {
    const hasYtd =
      /(?:nine|six)\s+months?\s+ended|year[-\s]*to[-\s]*date|ytd/i.test(s);
    const hasQuarter =
      /three\s+months?\s+ended|quarter(?:ly)?\s+(?:period|ended)?/i.test(s);
    if (hasYtd) return "ytd";
    if (hasQuarter) return "quarterly";
    return "annual";
  }

  function selectByBasis(
    nums: number[],
    basis: "quarterly" | "ytd" | "annual"
  ): number | null {
    if (nums.length === 0) return null;
    if (basis === "ytd") {
      if (nums.length >= 3) return nums[2];
      if (nums.length >= 2) return nums[1];
      return nums[0];
    }
    if (basis === "quarterly") {
      if (nums.length >= 1) return nums[0];
      return null;
    }
    if (nums.length >= 1) return nums[0];
    return null;
  }

  function selectPriorByBasis(
    nums: number[],
    basis: "quarterly" | "ytd" | "annual"
  ): number | null {
    if (nums.length < 2) return null;
    if (basis === "ytd") {
      if (nums.length >= 4) return nums[3];
      return nums[1];
    }
    return nums[1];
  }

  function findRowValues(
    chunk: string,
    rowPattern: RegExp,
    excludePattern?: RegExp
  ): number[] {
    const lines = chunk.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!rowPattern.test(lines[i])) continue;
      const candidate = window(lines, i, 2);
      if (excludePattern && excludePattern.test(candidate)) continue;
      const tailMatch = candidate.match(
        /(?:research\s+and\s+development(?:\s+expense)?|r&d(?:\s+expense)?|product\s+development(?:\s+expense)?|revenues?|sales)(.*)/i
      );
      const tail = tailMatch ? tailMatch[1] : candidate;
      const nums = numsFrom(tail).filter((n) => Math.abs(n) >= 0.1);
      if (nums.length > 0) return nums;
    }
    return [];
  }

  const incomeSlice =
    text.match(
      /(?:condensed\s+)?(?:consolidated\s+)?statements?\s+of\s+(?:operations?|income|earnings)[\s\S]{0,18000}/i
    )?.[0] ?? "";
  const notesSlice =
    text.match(
      /notes\s+to\s+(?:the\s+)?(?:condensed\s+)?(?:consolidated\s+)?financial\s+statements[\s\S]{0,24000}/i
    )?.[0] ?? "";

  // Step 1: explicit R&D extraction (highest priority)
  const directRowPattern =
    /(?:research\s+and\s+development(?:\s+expense)?|r&d(?:\s+expense)?|product\s+development(?:\s+expense)?)/i;
  const cluePattern =
    /(capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit|capitalized)/i;

  for (const chunk of [incomeSlice, notesSlice, text]) {
    if (!chunk) continue;
    const nums = findRowValues(chunk, directRowPattern, cluePattern);
    if (nums.length > 0) {
      return {
        rAndDExpense: toMillions(Math.abs(nums[0])),
        method: "extracted",
        rAndDPercentUsed: null,
        rAndDPeriodBasis: null,
      };
    }
  }

  // Step 2: capitalization / tax clue-derived proxy
  const derivedPattern =
    /(?:(?:research\s+and\s+development|r&d).*(?:capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit))|(?:(?:capitaliz|deferred\s+tax|tax\s+benefit|tax\s+credit).*(?:research\s+and\s+development|r&d))/i;
  for (const chunk of [notesSlice, text]) {
    if (!chunk) continue;
    const nums = findRowValues(chunk, derivedPattern);
    if (nums.length > 0) {
      return {
        rAndDExpense: toMillions(Math.abs(nums[0])),
        method: "derived_from_rd_tax_or_capitalization",
        rAndDPercentUsed: null,
        rAndDPeriodBasis: null,
      };
    }
  }

  // Step 3: estimate from revenue ratio fallback
  const basis = detectBasis(text);
  // Only trust injected currentRevenue when basis is not YTD.
  let revenue =
    basis !== "ytd" && currentRevenue != null && currentRevenue > 0
      ? currentRevenue
      : null;
  if (revenue == null) {
    const revenueNums = findRowValues(
      incomeSlice || text,
      /^(?:\s*)(?:total\s+)?(?:net\s+)?(?:revenues?|sales)\b/i
    );
    const selectedRevenue = selectByBasis(revenueNums, basis);
    if (selectedRevenue != null && selectedRevenue > 0) {
      revenue = toMillions(Math.abs(selectedRevenue));
    }
  }

  if (revenue == null || revenue <= 0) {
    return {
      rAndDExpense: null,
      method: null,
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  // Try historical intensity (prior period R&D / prior period revenue)
  let pctUsed = 0;
  const rdSeries = findRowValues(incomeSlice || text, directRowPattern, cluePattern);
  const revSeries = findRowValues(
    incomeSlice || text,
    /(?:total\s+)?(?:net\s+)?(?:revenues?|sales)\b/i
  );
  const rdPrior = selectPriorByBasis(rdSeries, basis);
  const revPrior = selectPriorByBasis(revSeries, basis);
  if (rdPrior != null && revPrior != null && Math.abs(revPrior) > 0) {
    pctUsed = (Math.abs(rdPrior) / Math.abs(revPrior)) * 100;
  } else {
    const name = (companyName ?? "").toLowerCase();
    if (name.includes("tyson")) pctUsed = 0.2;
    else if (name.includes("smithfield")) pctUsed = 1.0;
    else pctUsed = 0.6;
  }

  const estimated = Math.round((revenue * (pctUsed / 100)) * 100) / 100;
  if (estimated <= 0) {
    return {
      rAndDExpense: null,
      method: null,
      rAndDPercentUsed: null,
      rAndDPeriodBasis: null,
    };
  }

  return {
    rAndDExpense: estimated,
    method: "estimated_from_revenue_ratio",
    rAndDPercentUsed: Math.round(pctUsed * 1000) / 1000,
    rAndDPeriodBasis: basis,
  };
}
