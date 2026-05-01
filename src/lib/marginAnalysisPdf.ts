import PDFDocument from "pdfkit";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import {
  Chart,
  registerables,
  type ChartConfiguration,
  type Plugin,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";

Chart.register(...registerables, ChartDataLabels);

const COLORS = {
  navy: "#0f1f4b",
  blue: "#1e3a8a",
  accent: "#2563eb",
  lightGrid: "#e5e7eb",
  text: "#111827",
  subtext: "#4b5563",
  red: "#dc2626",
};

function toPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function buildPointHighlightPlugin(latestIndex: number): Plugin {
  return {
    id: "latest-point-highlight",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const area = chart.chartArea;
      if (!area) return;
      chart.data.datasets.forEach((_, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        const point = meta.data[latestIndex];
        if (!point) return;
        const p = point.getProps(["x", "y"], true);
        const w = 34;
        const h = 24;
        const x = Math.max(area.left + 2, Math.min(area.right - w - 2, p.x - w / 2));
        const y = Math.max(area.top + 2, Math.min(area.bottom - h - 2, p.y - h / 2));
        ctx.save();
        ctx.strokeStyle = COLORS.red;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      });
    },
  };
}

async function renderMarginGapChart(
  quarters: string[],
  marginGap: number[]
): Promise<Buffer> {
  const width = 1800;
  const height = 520;
  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: "white" });
  const latestIndex = Math.max(marginGap.length - 1, 0);
  const maxAbs = Math.max(2, ...marginGap.map((v) => Math.abs(v)));
  const yBound = Math.ceil(maxAbs * 1.2);

  const cfg: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels: quarters,
      datasets: [
        {
          label: "Margin Gap",
          data: marginGap,
          borderColor: COLORS.blue,
          backgroundColor: COLORS.blue,
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 4,
        },
      ],
    },
    plugins: [buildPointHighlightPlugin(latestIndex)],
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Margin Gap Favorable/(Unfavorable)",
          color: COLORS.text,
          font: { size: 22, weight: "bold" },
          padding: { top: 6, bottom: 8 },
        },
        datalabels: {
          color: "#ffffff",
          backgroundColor: COLORS.blue,
          borderRadius: 3,
          padding: { top: 3, bottom: 3, left: 6, right: 6 },
          align: (ctx) => ((ctx.dataset.data[ctx.dataIndex] as number) >= 0 ? "top" : "bottom"),
          offset: 6,
          formatter: (v) => `${Number(v).toFixed(2)}%`,
          font: (ctx) => ({ size: 11, weight: ctx.dataIndex === latestIndex ? "bold" : "normal" }),
          clip: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.subtext, maxRotation: 0, minRotation: 0, font: { size: 11 } },
        },
        y: {
          min: -yBound,
          max: yBound,
          grid: { color: COLORS.lightGrid, lineWidth: 1 },
          ticks: {
            color: COLORS.subtext,
            callback: (v) => `${v}%`,
            font: { size: 11 },
          },
        },
      },
    },
  };
  return chart.renderToBuffer(cfg, "image/png");
}

async function renderOperatingMarginChart(
  quarters: string[],
  companyALabel: string,
  companyA: number[],
  companyBLabel: string,
  companyB: number[]
): Promise<Buffer> {
  const width = 1800;
  const height = 520;
  const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: "white" });
  const latestIndex = Math.max(companyA.length - 1, 0);
  const maxVal = Math.max(12, ...companyA, ...companyB);
  const minVal = Math.min(0, ...companyA, ...companyB);

  const cfg: ChartConfiguration<"line"> = {
    type: "line",
    data: {
      labels: quarters,
      datasets: [
        {
          label: companyALabel,
          data: companyA,
          borderColor: COLORS.blue,
          backgroundColor: COLORS.blue,
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
        },
        {
          label: companyBLabel,
          data: companyB,
          borderColor: COLORS.accent,
          backgroundColor: COLORS.accent,
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
        },
      ],
    },
    plugins: [buildPointHighlightPlugin(latestIndex)],
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { color: COLORS.text, boxWidth: 12, font: { size: 11 } },
        },
        title: {
          display: true,
          text: "OP Margin",
          color: COLORS.text,
          font: { size: 22, weight: "bold" },
          padding: { top: 6, bottom: 8 },
        },
        datalabels: {
          color: "#ffffff",
          backgroundColor: (ctx) => (ctx.datasetIndex === 0 ? COLORS.blue : COLORS.accent),
          borderRadius: 3,
          padding: { top: 3, bottom: 3, left: 6, right: 6 },
          align: (ctx) => ((ctx.dataset.data[ctx.dataIndex] as number) >= 0 ? "top" : "bottom"),
          offset: 6,
          formatter: (v) => `${Number(v).toFixed(2)}%`,
          font: (ctx) => ({ size: 11, weight: ctx.dataIndex === latestIndex ? "bold" : "normal" }),
          clip: true,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.subtext, maxRotation: 0, minRotation: 0, font: { size: 11 } },
        },
        y: {
          min: Math.floor(minVal - 1),
          max: Math.ceil(maxVal + 1),
          grid: { color: COLORS.lightGrid, lineWidth: 1 },
          ticks: {
            color: COLORS.subtext,
            callback: (v) => `${v}%`,
            font: { size: 11 },
          },
        },
      },
    },
  };
  return chart.renderToBuffer(cfg, "image/png");
}

export async function generateMarginAnalysisPdf(result: CompanyComparisonPayload): Promise<Buffer> {
  const quarters = result.trends.operatingMargin.map((p) => p.quarterLabel);
  const companyA = result.trends.operatingMargin.map((p) => p.companyA ?? 0);
  const companyB = result.trends.operatingMargin.map((p) => p.companyB ?? 0);
  const revenueA = result.trends.revenue.map((p) => p.companyA ?? 0);
  const revenueB = result.trends.revenue.map((p) => p.companyB ?? 0);
  const revenueQuarters = result.trends.revenue.map((p) => p.quarterLabel);

  const commonLength = Math.min(quarters.length, companyA.length, companyB.length);
  const q = quarters.slice(-commonLength);
  const a = companyA.slice(-commonLength);
  const b = companyB.slice(-commonLength);
  const gap = a.map((v, i) => v - b[i]);

  const revenueLen = Math.min(revenueQuarters.length, revenueA.length, revenueB.length);
  const rq = revenueQuarters.slice(-revenueLen);
  const ra = revenueA.slice(-revenueLen);
  const rb = revenueB.slice(-revenueLen);

  const gapChart = await renderMarginGapChart(q, gap);
  const opChart = await renderOperatingMarginChart(rq, result.companyA.ticker, ra, result.companyB.ticker, rb);

  const wins = gap.filter((v) => v > 0).length;
  const total = gap.length;

  const doc = new PDFDocument({
    autoFirstPage: true,
    size: [1280, 720],
    margin: 30,
    info: {
      Title: "margin_analysis",
      Author: "Competitor Analysis",
    },
  });

  doc.rect(0, 0, 1280, 720).fill("#ffffff");
  doc.fillColor(COLORS.text);
  doc.font("Helvetica-Bold").fontSize(40).text("SFD US vs JBS USA Pork Operating Profit %", 48, 36, { width: 1184 });
  doc.font("Helvetica-Oblique").fontSize(20).fillColor(COLORS.subtext).text(
    `${result.companyA.ticker} outperformed ${result.companyB.ticker} in ${wins} of last ${total} quarters`,
    48,
    92,
    { width: 1184 }
  );

  doc.image(gapChart, 50, 132, { fit: [1180, 250], align: "center" });
  doc.image(opChart, 50, 395, { fit: [1180, 250], align: "center" });

  doc.font("Helvetica").fontSize(11).fillColor("#6b7280").text(
    "Source: company filings, normalized margin trends, generated chart analytics.",
    48,
    672,
    { width: 750 }
  );
  doc.font("Helvetica").fontSize(11).fillColor("#6b7280").text(
    "Notes: Margin Gap = Company A OP Margin - Company B OP Margin. Latest quarter highlighted with dashed red marker.",
    48,
    688,
    { width: 1180 }
  );

  return toPdfBuffer(doc);
}

