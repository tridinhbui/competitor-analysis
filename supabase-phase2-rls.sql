-- ============================================================
-- PHASE 2: RLS owner-only for analysis_history
-- Run ONLY after Supabase Auth is fully enabled and all
-- API routes send Authorization: Bearer <token>.
-- ============================================================

-- Step 1: Drop permissive phase-1 policy
DROP POLICY IF EXISTS "Allow all for analysis_history (phase1 compat)" ON public.analysis_history;

-- Step 2: Create strict owner-only policies
CREATE POLICY "history_select_own" ON public.analysis_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "history_insert_own" ON public.analysis_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "history_update_own" ON public.analysis_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "history_delete_own" ON public.analysis_history
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- PHASE 2: Handle legacy rows with user_id IS NULL
-- Choose one strategy below:
-- ============================================================

-- Strategy A: Archive legacy rows to a separate table
-- CREATE TABLE IF NOT EXISTS analysis_history_archive AS
--   SELECT * FROM public.analysis_history WHERE user_id IS NULL;
-- DELETE FROM public.analysis_history WHERE user_id IS NULL;

-- Strategy B: Assign all legacy rows to a specific admin user UUID
-- UPDATE public.analysis_history
--   SET user_id = '<your-admin-user-uuid>'
--   WHERE user_id IS NULL;

-- Strategy C: Leave legacy rows (they will be invisible to all users
-- under owner-only RLS — safe to clean up later)
-- No action needed, rows are simply inaccessible.

-- ============================================================
-- Verify phase 2 is active
-- ============================================================
SELECT policyname, cmd, permissive, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'analysis_history';
