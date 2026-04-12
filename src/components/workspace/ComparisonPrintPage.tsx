"use client";

import { useEffect } from "react";
import type { CompanyComparisonPayload } from "@/lib/companyComparison";
import { ComparisonReportContent } from "@/components/workspace/ComparisonReportContent";

export function ComparisonPrintPage({ result }: { result: CompanyComparisonPayload }) {
  useEffect(() => {
    let timeoutId = 0;

    const triggerPrint = async () => {
      try {
        if ("fonts" in document) {
          await document.fonts.ready;
        }
      } catch {
        // Ignore font loading issues and continue with print.
      }

      timeoutId = window.setTimeout(() => {
        window.print();
      }, 300);
    };

    void triggerPrint();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        @page {
          size: auto;
          margin: 12mm;
        }

        @media print {
          html,
          body {
            background: #ffffff;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .comparison-print-shell {
            padding: 0 !important;
            background: #ffffff !important;
          }

          .comparison-print-root .comparison-card,
          .comparison-print-root .comparison-report-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .comparison-print-root .comparison-report-section {
            break-before: page;
            page-break-before: always;
          }

          .comparison-print-root .comparison-report-section:first-of-type {
            break-before: auto;
            page-break-before: auto;
          }
        }
      `}</style>

      <div className="comparison-print-shell min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:px-0 print:py-0">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="print:hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-subtle">
            Print dialog should open automatically. Choose <span className="font-semibold text-slate-900">Save as PDF</span> to download the report.
          </div>

          <ComparisonReportContent result={result} printMode />
        </div>
      </div>
    </>
  );
}
