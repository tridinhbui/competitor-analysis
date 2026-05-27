/**
 * Tests for the Excel competitor preprocessing pipeline.
 *
 * Run with: npx tsx --test tests/excelCompetitorPreprocess.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { preprocessCompetitorWorkbookFromArrayBuffer } from "../src/lib/excelCompetitorPreprocess";

function workbookToArrayBuffer(workbook: XLSX.WorkBook): ArrayBuffer {
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function buildWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const consolidatedSheet = XLSX.utils.aoa_to_sheet([
    ["Tyson vs. Smithfield Financials"],
    ["Tyson Prepared Foods + Pork"],
    ["Company", "Tys Period", "Smfd Period", "Sales", "Seg Prof", "Volume"],
    ["Tyson", "2Q22", "Q1 2022", "$3,958", "$322", ""],
    ["Smithfield", "2Q22", "Q1 2022", "$3,620.1", "$349.5", ""],
    ["Tyson", "Q1 - Q4", "Lst 4 Qtr CY", "$12,912", "$757", ""],
    [],
    ["Company", "Tys Period", "Smfd Period", "Sales", "Seg Prof", "Volume"],
    ["Tyson", "3Q22", "Q2 2022", "$4,066", "$211", ""],
    ["Smithfield", "3Q22", "Q2 2022", "$3,743.2", "$293.6", ""],
  ]);

  const preparedVsPackagedSheet = XLSX.utils.aoa_to_sheet([
    ["Tyson vs. Smithfield Financials Prepared Foods vs. Packaged"],
    ["Tyson Prepared Foods"],
    ["Company", "Tys Period", "Smfd Period", "Sales", "Seg Prof", "Volume"],
    ["Tyson", "2Q22", "Q1 2022", "$2,393", "$263", ""],
    ["Tyson", "3Q22", "Q2 2022", "$2,447", "$186", ""],
    ["Smithfield", "2Q22", "Q1 2022", "$2,184.8", "$292.4", ""],
    ["Smithfield", "3Q22", "Q2 2022", "$2,144.7", "$229.2", ""],
    ["Smithfield", "Q1 - Q4", "Lst 4 Qtr CY", "$8,315", "$700", ""],
  ]);

  XLSX.utils.book_append_sheet(workbook, consolidatedSheet, "Data-Cons");
  XLSX.utils.book_append_sheet(workbook, preparedVsPackagedSheet, "Data-PM vs PF");
  return workbook;
}

function buildSmithfieldTysonWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const tsnInput = XLSX.utils.aoa_to_sheet([
    ["Tyson - Quarterly Input"],
    [],
    ["", "Q4 2025", "Q1 2026"],
    ["FRESH PORK", "", ""],
    ["Sales ($M)", "1,609", "1,579"],
    ["OP - Adj ($M) [thru Q1'24]", "", ""],
    ["OP - Seg Profit ($M) [Q1'24+]", "111", "41"],
    ["Head Slaughtered (M head)", "5.32", "5.18"],
    [],
    ["PACKAGED MEATS", "", ""],
    ["Sales ($M)", "2,673", "2,511"],
    ["Operating Profit - Adj ($M)", "338", "352"],
    ["Pounds Sold (M lbs)", "866.5", "843.3"],
    [],
    ["US PORK TOTAL (FP + PM)", "", ""],
    ["Sales ($M)", "4,282", "4,090"],
    ["Operating Profit - Adj ($M)", "338", "393"],
  ]);

  const makeSfdQuerySheet = (
    row4Label: string,
    sales: number[],
    grossProfit: number[],
    sga: number[],
    segProf: number[],
    volumeLabel: string | null,
    volume: number[] | null,
  ) =>
    XLSX.utils.aoa_to_sheet([
      [],
      ["QTD - Quarter To Date"],
      ["US GAAP"],
      [row4Label],
      [],
      ["", "Q3 Fiscal 25", "Q4 Fiscal 25", "Q1 Fiscal 26"],
      ["SALES_TOTAL", ...sales.map(String)],
      ["GR_PROFIT", ...grossProfit.map(String)],
      ["SGA_TOTAL", ...sga.map(String)],
      ["SEG_PROF", ...segProf.map(String)],
      ...(volumeLabel && volume
        ? [[volumeLabel, ...volume.map(String)]]
        : []),
    ]);

  const usfpQuery = makeSfdQuerySheet(
    "FP_MGT",
    [2_150_000_000, 2_281_000_000, 2_401_000_000],
    [240_000_000, 260_000_000, 210_000_000],
    [60_000_000, 87_000_000, 226_000_000],
    [180_000_000, 173_000_000, -16_000_000],
    "HEAD_HARVEST",
    [8_400_000, 8_650_000, 8_900_000],
  );

  const uspmQuery = makeSfdQuerySheet(
    "PM_MGT",
    [2_050_000_000, 2_233_000_000, 2_196_000_000],
    [310_000_000, 332_000_000, 256_000_000],
    [80_000_000, 31_000_000, 35_000_000],
    [230_000_000, 301_000_000, 221_000_000],
    "TOT_LBS_SOLD",
    [780_000_000, 800_000_000, 790_000_000],
  );

  const ushpQuery = makeSfdQuerySheet(
    "HOG_MGT",
    [150_000_000, 147_000_000, 242_000_000],
    [45_000_000, 41_000_000, 69_000_000],
    [20_000_000, 18_000_000, 16_000_000],
    [25_000_000, 6_000_000, 38_000_000],
    "HD_MRKT_SWINE_TOTAL",
    [3_800_000, 3_900_000, 4_050_000],
  );

  const usPorkQuery = makeSfdQuerySheet(
    "US_PORK",
    [3_520_000_000, 3_611_000_000, 3_618_000_000],
    [570_000_000, 543_000_000, 287_000_000],
    [140_000_000, 69_000_000, 82_000_000],
    [430_000_000, 474_000_000, 205_000_000],
    null,
    null,
  );

  const tsnPlRows = Array.from({ length: 92 }, () => [] as Array<string | number>);
  tsnPlRows[1] = ["Tyson Foods Inc (TSN US) - By Segment"];
  tsnPlRows[3] = ["In Millions of USD except Per Share", "", "Q3 2025", "Q4 2025"];
  tsnPlRows[58] = ["Pork"];
  tsnPlRows[59] = ["Revenue", "", "1,414.0", "1,609.0"];
  tsnPlRows[60] = ["Operating Income", "", "47.0", "111.0"];
  tsnPlRows[77] = ["Prepared Foods"];
  tsnPlRows[78] = ["Revenue", "", "2,612.0", "2,673.0"];
  tsnPlRows[79] = ["Operating Income", "", "278.0", "338.0"];
  const tsnPl = XLSX.utils.aoa_to_sheet(tsnPlRows);

  XLSX.utils.book_append_sheet(workbook, tsnInput, "TSN Input");
  XLSX.utils.book_append_sheet(workbook, usfpQuery, "USFP_Query");
  XLSX.utils.book_append_sheet(workbook, uspmQuery, "USPM_Query ");
  XLSX.utils.book_append_sheet(workbook, ushpQuery, "USHP_Query");
  XLSX.utils.book_append_sheet(workbook, usPorkQuery, "US Pork_Query");
  XLSX.utils.book_append_sheet(workbook, tsnPl, "TSN PL");

  return workbook;
}

function buildMasterSheetWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const masterSheet = XLSX.utils.aoa_to_sheet([
    ["Fresh Pork"],
    ["Operating Profit Margin - Adjusted"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "9.7%", "8.1%"],
    ["Tyson Foods", "6.9%", "3.0%"],
    [],
    ["Sales Figures"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "1,820", "1,760"],
    ["Tyson Foods", "1,609", "1,579"],
    [],
    ["OP - Adj"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "177", "142"],
    ["Tyson Foods", "111", "41"],
    [],
    ["Packaged Meats"],
    ["Operating Profit Margin - Adjusted"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "13.5%", "10.9%"],
    ["Tyson Foods", "12.6%", "14.0%"],
    [],
    ["Sales Figures"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "2,333", "2,196"],
    ["Tyson Foods", "2,673", "2,511"],
    [],
    ["Operating Profit - Adjusted"],
    ["", "FY 2025", "Q1 2026"],
    ["Smithfield Foods", "315", "240"],
    ["Tyson Foods", "338", "352"],
  ]);

  XLSX.utils.book_append_sheet(workbook, masterSheet, "Master Comparison");
  return workbook;
}

function buildMatrixComparisonWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const consolidatedSheet = XLSX.utils.aoa_to_sheet([
    ["Consolidated PBT Comparison", "Q2 2019", "", "", "Q2 2018", "", "", "YOY Change", ""],
    ["", "Smithfield", "Tyson", "", "Smithfield", "Tyson", "", "Smithfield", "Tyson"],
    ["Sales - Actual", "3,970", "10,885", "", "3,852", "10,051", "", "3.1%", "8.3%"],
    ["Sales - Adjusted", "3,970", "10,885", "", "3,852", "10,051", "", "3.1%", "8.3%"],
    ["Operating Profit - Actual", "221", "781", "", "229", "797", "", "-3.5%", "-2.0%"],
    ["Operating Profit - Adjusted", "227", "796", "", "233", "811", "", "-2.6%", "-1.8%"],
    ["Operating Profit Margin - Adjusted", "5.72%", "7.31%", "", "6.05%", "8.07%", "", "(33)", "(76)"],
  ]);

  XLSX.utils.book_append_sheet(workbook, consolidatedSheet, "Consolidated PBT");
  return workbook;
}

describe("preprocessCompetitorWorkbookFromArrayBuffer", () => {
  it("extracts quarterly comparison rows and prefers the higher-priority sheet on duplicates", () => {
    const result = preprocessCompetitorWorkbookFromArrayBuffer(
      workbookToArrayBuffer(buildWorkbook()),
      "SFD vs TSN comparison.xlsx"
    );

    assert.equal(result.primarySheet, "Data-PM vs PF");
    assert.deepEqual(result.comparisonTickers, ["SFD", "TSN"]);
    assert.equal(result.quarterlyRows.length, 4);
    assert.equal(result.virtualFilings.length, 4);

    const tysonQ1 = result.quarterlyRows.find((row) => row.ticker === "TSN" && row.periodEnd === "2022-03-31");
    assert.ok(tysonQ1);
    assert.equal(tysonQ1.sourceSheet, "Data-PM vs PF");
    assert.equal(tysonQ1.revenue, 2393);
    assert.equal(tysonQ1.operatingIncome, 263);

    const periods = result.quarterlyRows.map((row) => row.alignedPeriodLabel);
    assert.ok(!periods.includes("Lst 4 Qtr CY"));
  });

  it("feeds the extracted virtual filings into the comparison payload builder", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { buildCompanyComparisonPayloadFromFilings } = await import("../src/lib/companyComparisonPayload");
    const processed = preprocessCompetitorWorkbookFromArrayBuffer(
      workbookToArrayBuffer(buildWorkbook()),
      "SFD vs TSN comparison.xlsx"
    );

    const comparison = await buildCompanyComparisonPayloadFromFilings({
      filings: processed.virtualFilings,
      tickers: "SFD,TSN",
    });

    assert.equal(comparison.companyA.ticker, "SFD");
    assert.equal(comparison.companyB.ticker, "TSN");
    assert.equal(comparison.companyA.metrics.revenue, 2144.7);
    assert.equal(comparison.companyB.metrics.revenue, 2447);
    assert.equal(comparison.trends.revenue.length, 2);
  });

  it("extracts Smithfield/Tyson workbook-family segment data and exports the cleaned tabs", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const result = preprocessCompetitorWorkbookFromArrayBuffer(
      workbookToArrayBuffer(buildSmithfieldTysonWorkbook()),
      "SMF vs Tyson Comparison Q126.xlsx",
    );

    assert.equal(result.workbookFamily, "smithfield_tyson_competitor_model");
    assert.deepEqual(result.comparisonTickers, ["SFD", "TSN"]);
    assert.ok(result.segmentRows.length >= 10);
    assert.ok(result.quarterlyRows.some((row) => row.ticker === "TSN" && row.periodEnd === "2025-09-30"));

    const latestSfd = result.quarterlyRows.find((row) => row.ticker === "SFD" && row.periodEnd === "2026-03-31");
    assert.ok(latestSfd);
    if (!latestSfd) throw new Error("Expected SFD latest quarter row");
    assert.equal(latestSfd.revenue, 3618);
    assert.equal(latestSfd.operatingIncome, 205);

    const freshPork = result.segmentRows.find(
      (row) => row.ticker === "SFD" && row.segmentName === "Fresh Pork" && row.periodEnd === "2026-03-31",
    );
    assert.ok(freshPork);
    if (!freshPork) throw new Error("Expected SFD Fresh Pork segment row");
    assert.equal(freshPork.revenuePerUnit, 269.78);

    const processedWorkbook = XLSX.read(result.processedWorkbookBytes, { type: "array" });
    assert.deepEqual(processedWorkbook.SheetNames, [
      "Metadata",
      "Company_Summary",
      "Company_Quarterly_Data",
      "Segment_Data",
      "Competitor_Comparison",
      "Growth_Analysis",
      "AI_Insights",
      "Data_Quality",
    ]);

    const comparisonRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.Competitor_Comparison, {
      header: 1,
      raw: true,
      defval: "",
    });
    const comparisonHeader = comparisonRows[0] ?? [];
    const revenueGapPctIndex = comparisonHeader.indexOf("SFD vs TSN Revenue Gap %");
    assert.notEqual(revenueGapPctIndex, -1);

    const integratedPorkRow = comparisonRows.find(
      (row) => row[1] === "2026-03-31" && row[2] === "Integrated Pork",
    );
    assert.ok(integratedPorkRow);
    assert.equal(integratedPorkRow?.[revenueGapPctIndex], -11.54);

    const insightRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.AI_Insights, {
      header: 1,
      raw: true,
      defval: "",
    });
    assert.ok(insightRows.some((row) => String(row[6] ?? "").includes("SFD margin decreased")));

    const { buildCompanyComparisonPayloadFromFilings } = await import("../src/lib/companyComparisonPayload");
    const comparison = await buildCompanyComparisonPayloadFromFilings({
      filings: result.virtualFilings,
      tickers: "SFD,TSN",
    });

    assert.equal(comparison.companyA.metrics.revenue, 3618);
    assert.equal(comparison.companyB.metrics.revenue, 4090);
    const freshComparison = comparison.segmentComparison.find((row) => row.segment === "Fresh Pork");
    assert.ok(freshComparison);
    if (!freshComparison) throw new Error("Expected Fresh Pork comparison row");
    assert.equal(freshComparison.companyAOperatingIncome, -16);
    assert.equal(freshComparison.companyBOperatingIncome, 41);
  });

  it("splits a mixed master sheet into focused company and comparison tabs", () => {
    const result = preprocessCompetitorWorkbookFromArrayBuffer(
      workbookToArrayBuffer(buildMasterSheetWorkbook()),
      "mixed-master-sheet.xlsx",
    );

    assert.deepEqual(result.comparisonTickers, ["SFD", "TSN"]);
    assert.equal(result.segmentRows.length, 8);
    assert.equal(result.quarterlyRows.length, 4);
    assert.ok(result.quarterlyRows.some((row) => row.quarterLabel === "FY 2025"));

    const latestSfd = result.quarterlyRows.find((row) => row.ticker === "SFD" && row.periodEnd === "2026-03-31");
    assert.ok(latestSfd);
    if (!latestSfd) throw new Error("Expected latest SFD company row");
    assert.equal(latestSfd.revenue, 3956);
    assert.equal(latestSfd.operatingIncome, 382);

    const processedWorkbook = XLSX.read(result.processedWorkbookBytes, { type: "array" });
    assert.deepEqual(processedWorkbook.SheetNames, [
      "Metadata",
      "Company_Summary",
      "Company_Quarterly_Data",
      "Segment_Data",
      "Competitor_Comparison",
      "Growth_Analysis",
      "AI_Insights",
      "Data_Quality",
    ]);

    const companyRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.Company_Quarterly_Data, {
      header: 1,
      raw: true,
      defval: "",
    });
    assert.equal(companyRows[1]?.[0], "SFD");
    assert.equal(companyRows[1]?.[6], 3956);

    const summaryRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.Company_Summary, {
      header: 1,
      raw: true,
      defval: "",
    });
    assert.equal(summaryRows[0]?.[0], "Metric");
    assert.equal(summaryRows[0]?.[1], "SFD");
    assert.equal(summaryRows[0]?.[2], "TSN");

    const comparisonRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.Competitor_Comparison, {
      header: 1,
      raw: true,
      defval: "",
    });
    const comparisonHeader = comparisonRows[0] ?? [];
    const revenueGapPctIndex = comparisonHeader.indexOf("SFD vs TSN Revenue Gap %");
    assert.notEqual(revenueGapPctIndex, -1);
    assert.ok(comparisonRows.some((row) => row[2] === "Fresh Pork"));

    const dataQualityRows = XLSX.utils.sheet_to_json<Array<string | number>>(processedWorkbook.Sheets.Data_Quality, {
      header: 1,
      raw: true,
      defval: "",
    });
    assert.equal(dataQualityRows[0]?.[0], "Metric");
  });

  it("extracts matrix comparison sheets where company names are laid out across columns", () => {
    const result = preprocessCompetitorWorkbookFromArrayBuffer(
      workbookToArrayBuffer(buildMatrixComparisonWorkbook()),
      "matrix-comparison.xlsx",
    );

    assert.deepEqual(result.comparisonTickers, ["SFD", "TSN"]);
    assert.equal(result.quarterlyRows.length, 4);

    const sfdQ22019 = result.quarterlyRows.find((row) => row.ticker === "SFD" && row.periodEnd === "2019-06-30");
    assert.ok(sfdQ22019);
    if (!sfdQ22019) throw new Error("Expected SFD Q2 2019 row");
    assert.equal(sfdQ22019.revenue, 3970);
    assert.equal(sfdQ22019.operatingIncome, 227);
    assert.equal(sfdQ22019.operatingMargin, 5.72);

    const processedWorkbook = XLSX.read(result.processedWorkbookBytes, { type: "array" });
    assert.deepEqual(processedWorkbook.SheetNames, [
      "Metadata",
      "Company_Summary",
      "Company_Quarterly_Data",
      "Segment_Data",
      "Competitor_Comparison",
      "Growth_Analysis",
      "AI_Insights",
      "Data_Quality",
    ]);
  });
});
