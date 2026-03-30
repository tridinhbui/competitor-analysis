-- Supabase schema for Dividend Competitor Analysis
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================================
-- Companies table
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  peer_type TEXT NOT NULL DEFAULT 'diversified-protein',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Filings table — stores full analysis as JSONB
-- ============================================================
CREATE TABLE IF NOT EXISTS filings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  period_end TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  fiscal_quarter INT NOT NULL,
  quarter_label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sec',
  filing_type TEXT DEFAULT '10-Q',
  filing_date TEXT,
  analysis JSONB NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, period_end)
);

CREATE INDEX IF NOT EXISTS idx_filings_ticker ON filings(ticker);
CREATE INDEX IF NOT EXISTS idx_filings_period ON filings(period_end);
CREATE INDEX IF NOT EXISTS idx_filings_quarter ON filings(fiscal_year, fiscal_quarter);

-- ============================================================
-- Row Level Security — permissive (internal tool)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for companies" ON companies
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for filings" ON filings
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Adjustments table — human-in-the-loop overrides per company
-- ============================================================
CREATE TABLE IF NOT EXISTS adjustments (
  ticker TEXT PRIMARY KEY REFERENCES companies(ticker) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for adjustments" ON adjustments
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Manual data table — analyst-entered data not from SEC filings
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
  period_end TEXT,
  data_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticker, period_end, data_type)
);

CREATE INDEX IF NOT EXISTS idx_manual_data_ticker ON manual_data(ticker);
CREATE INDEX IF NOT EXISTS idx_manual_data_type ON manual_data(data_type);

ALTER TABLE manual_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for manual_data" ON manual_data
  FOR ALL USING (true) WITH CHECK (true);
