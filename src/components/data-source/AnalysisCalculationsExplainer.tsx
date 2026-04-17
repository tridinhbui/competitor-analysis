/**
 * Explains how metrics shown on the Data Source grid are produced from Analyze
 * (SEC/XBRL or PDF extraction → FullAnalysis → extractMetrics / API).
 */

export function AnalysisCalculationsExplainer() {
  return (
    <section
      className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
      aria-labelledby="calc-methodology-heading"
    >
      <h2
        id="calc-methodology-heading"
        className="text-sm font-bold text-slate-900"
      >
        How calculated fields work
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Rows come from each filing’s analysis (Analyze tab / SEC or PDF pipeline) stored in{" "}
        <strong>Supabase</strong> when configured. Dollar amounts are in <strong>$ millions</strong> unless noted.
        Edits you save here override stored values for that ticker and period where applicable.
      </p>

      <div className="mt-4 grid gap-4 text-xs text-slate-700 md:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-800">Margins</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>Gross margin</strong> = Gross profit ÷ Revenue × 100
            </li>
            <li>
              <strong>Operating margin</strong> = Operating income ÷ Revenue × 100
            </li>
            <li>
              <strong>Net margin</strong> = Net income ÷ Revenue × 100
            </li>
            <li>
              <strong>EBITDA margin</strong> = EBITDA ÷ Revenue × 100 (when EBITDA is available)
            </li>
            <li>
              <strong>FCF margin</strong> = Free cash flow ÷ Revenue × 100
            </li>
            <li>
              <strong>SG&amp;A %</strong> = SG&amp;A expense ÷ Revenue × 100
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-800">Cash flow</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>Free cash flow</strong> = Operating cash flow − Capital expenditures (CapEx shown as a
              positive dollar amount)
            </li>
            <li>
              Operating CF and CapEx are taken from the cash flow statement lines in the extracted filing.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-800">Balance sheet &amp; leverage</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>Total debt</strong> ≈ Short-term debt + Long-term debt (as reported)
            </li>
            <li>
              <strong>Debt / Equity</strong> = Total debt ÷ Total equity
            </li>
            <li>
              <strong>Current ratio</strong> = Current assets ÷ Current liabilities
            </li>
            <li>
              Totals may be reconciled in analysis so that <em>Assets ≈ Liabilities + Equity</em>.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-800">Returns &amp; profitability ratios</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>ROE</strong> = Net income ÷ Total equity (expressed as % in the grid)
            </li>
            <li>
              <strong>ROA</strong> = Net income ÷ Total assets
            </li>
            <li>
              <strong>EBIT</strong> typically matches operating income from the income statement.
            </li>
            <li>
              <strong>EBITDA</strong> ≈ EBIT + depreciation &amp; amortization (from cash-flow or income
              statement lines when D&amp;A is split out).
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-800">Per-unit metrics (protein / packaged peers)</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>OP / Head ($)</strong> = Operating income × 1,000 ÷ Volume (000 heads)
            </li>
            <li>
              <strong>OP / cwt ($)</strong> = Operating income ÷ Volume (M cwt)
            </li>
            <li>
              Adjusted variants use <strong>Adj. operating income</strong> after manual adjustment items (ERC,
              legal, transfer, corporate allocation) when you enter them.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-slate-800">Per share</h3>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
            <li>
              <strong>EPS (Basic / Diluted)</strong> come from the filing as dollars per share (not $M).
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
