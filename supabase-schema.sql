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
-- Analysis history table — per-run thread log (user-owned ready)
-- ============================================================
CREATE TABLE IF NOT EXISTS analysis_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL,
  ticker TEXT,
  company_name TEXT,
  source TEXT NOT NULL DEFAULT 'sec',
  period_end TEXT,
  quarter_label TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled Analysis',
  analysis JSONB NOT NULL,
  events JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure shape is safe even if table existed before this script.
ALTER TABLE analysis_history
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS ticker TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sec',
  ADD COLUMN IF NOT EXISTS period_end TEXT,
  ADD COLUMN IF NOT EXISTS quarter_label TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Untitled Analysis',
  ADD COLUMN IF NOT EXISTS analysis JSONB,
  ADD COLUMN IF NOT EXISTS events JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analysis_history_user_id_fkey'
  ) THEN
    ALTER TABLE analysis_history
      ADD CONSTRAINT analysis_history_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE analysis_history
  ALTER COLUMN analysis SET NOT NULL,
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN title SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_history_created_at
  ON analysis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_user_created_at
  ON analysis_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_ticker
  ON analysis_history(ticker);

-- ============================================================
-- Row Level Security — permissive (internal tool)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'Allow all for companies'
  ) THEN
    CREATE POLICY "Allow all for companies" ON companies
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'filings'
      AND policyname = 'Allow all for filings'
  ) THEN
    CREATE POLICY "Allow all for filings" ON filings
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analysis_history'
      AND policyname = 'Allow all for analysis_history (phase1 compat)'
  ) THEN
    CREATE POLICY "Allow all for analysis_history (phase1 compat)" ON analysis_history
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- PHASE 2 (when auth is fully enabled):
-- 1) Drop permissive policy above
-- DROP POLICY IF EXISTS "Allow all for analysis_history (phase1 compat)" ON analysis_history;
--
-- 2) Enforce owner-only policies
-- CREATE POLICY "history_select_own" ON analysis_history
--   FOR SELECT USING (auth.uid() = user_id);
--
-- CREATE POLICY "history_insert_own" ON analysis_history
--   FOR INSERT WITH CHECK (auth.uid() = user_id);
--
-- CREATE POLICY "history_update_own" ON analysis_history
--   FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--
-- CREATE POLICY "history_delete_own" ON analysis_history
--   FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Adjustments table — human-in-the-loop overrides per company
-- ============================================================
CREATE TABLE IF NOT EXISTS adjustments (
  ticker TEXT PRIMARY KEY REFERENCES companies(ticker) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'adjustments'
      AND policyname = 'Allow all for adjustments'
  ) THEN
    CREATE POLICY "Allow all for adjustments" ON adjustments
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'manual_data'
      AND policyname = 'Allow all for manual_data'
  ) THEN
    CREATE POLICY "Allow all for manual_data" ON manual_data
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
