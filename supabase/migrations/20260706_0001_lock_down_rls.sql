-- Replace permissive "phase1 compat" RLS policies that allowed any anon-key
-- holder (i.e. anyone, since NEXT_PUBLIC_SUPABASE_ANON_KEY ships in the JS
-- bundle) to read/update/delete every row in analysis_history, adjustments,
-- and manual_data regardless of ownership or auth state.
--
-- analysis_history has a user_id column -> scope strictly to the owner,
-- matching the pattern already used correctly by profiles/chat_threads.
--
-- adjustments/manual_data are keyed by ticker only (shared company workbook
-- data, no owner column) -> at minimum require a signed-in session so
-- anonymous/logged-out callers can no longer read or mutate them.

-- ============================================================
-- analysis_history: owner-only
-- ============================================================
drop policy if exists "Allow all for analysis_history (phase1 compat)" on public.analysis_history;

create policy "analysis_history_owner_select"
on public.analysis_history for select
using (auth.uid() = user_id);

create policy "analysis_history_owner_insert"
on public.analysis_history for insert
with check (auth.uid() = user_id);

create policy "analysis_history_owner_update"
on public.analysis_history for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "analysis_history_owner_delete"
on public.analysis_history for delete
using (auth.uid() = user_id);

-- ============================================================
-- adjustments: authenticated-only (shared by ticker, no owner column)
-- ============================================================
drop policy if exists "Allow all for adjustments" on public.adjustments;

create policy "adjustments_authenticated_all"
on public.adjustments for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- ============================================================
-- manual_data: authenticated-only (shared by ticker, no owner column)
-- ============================================================
drop policy if exists "Allow all for manual_data" on public.manual_data;

create policy "manual_data_authenticated_all"
on public.manual_data for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
