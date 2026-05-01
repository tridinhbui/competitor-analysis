/**
 * Tests for segmentExtractionHeuristics - especially column-oriented segment tables
 * like Tyson's 10-K note where segments are headers and metrics are rows.
 *
 * Run with: npx tsx --test tests/segmentExtractionHeuristics.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractSegmentsHeuristic } from "../src/lib/segmentExtractionHeuristics";

describe("extractSegmentsHeuristic", () => {
  it("extracts Tyson-style columnar segment tables", () => {
    const text = `
NOTE 17: SEGMENT REPORTING
Information on segments and a reconciliation to income from continuing operations before income taxes are as follows for fiscal years ended 2024, 2023 and 2022 (in millions):
Beef Pork Chicken Prepared Foods International/Other Intersegment Sales Consolidated
2024
Sales$20,479 $5,903 $16,425 $9,851 $2,353 $(1,702) $53,309
Operating Income (Loss)(381)(40)988 879 (37)1,409
Depreciation and amortization164 125 639 389 71 1,388
Total Assets3,730 1,570 12,121 15,138 4,541 37,100
Additions to property, plant and equipment138 41 505 334 114 1,132
`;

    const segments = extractSegmentsHeuristic(text);

    assert.equal(segments.length, 5);
    assert.deepEqual(
      segments.map((segment) => ({
        name: segment.segmentName,
        revenue: segment.revenue,
        operatingIncome: segment.operatingIncome,
      })),
      [
        { name: "Beef", revenue: 20479, operatingIncome: -381 },
        { name: "Pork", revenue: 5903, operatingIncome: -40 },
        { name: "Chicken", revenue: 16425, operatingIncome: 988 },
        { name: "Prepared Foods", revenue: 9851, operatingIncome: 879 },
        { name: "International/Other", revenue: 2353, operatingIncome: -37 },
      ]
    );
    assert.equal(segments[0]?.totalAssets, 3730);
    assert.equal(segments[2]?.depreciation, 639);
    assert.equal(segments[3]?.capitalExpenditures, 334);
  });

  it("still supports row-oriented segment tables", () => {
    const text = `
Retail | 1,858 | 123 | 6.6%
Foodservice | 987 | 141 | 14.3%
`;

    const segments = extractSegmentsHeuristic(text);

    assert.deepEqual(
      segments.map((segment) => ({
        name: segment.segmentName,
        revenue: segment.revenue,
        operatingIncome: segment.operatingIncome,
      })),
      [
        { name: "Retail", revenue: 1858, operatingIncome: 123 },
        { name: "Foodservice", revenue: 987, operatingIncome: 141 },
      ]
    );
  });
});
