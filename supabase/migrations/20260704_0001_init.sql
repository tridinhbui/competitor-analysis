-- Combined Supabase schema for competitor analysis
-- Safe for a fresh project; idempotent where possible.

-- Extensions
create extension if not exists pgcrypto;

-- ============================================================
-- Companies table
-- ============================================================
create table if not exists public.companies (
  ticker text primary key,
  name text not null,
  industry text,
  peer_type text not null default 'diversified-protein',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Filings table
-- ============================================================
create table if not exists public.filings (
  id uuid default gen_random_uuid() primary key,
  ticker text not null references public.companies(ticker) on delete cascade,
  period_end text not null,
  fiscal_year int not null,
  fiscal_quarter int not null,
  quarter_label text not null,
  source text not null default 'sec',
  filing_type text default '10-Q',
  filing_date text,
  analysis jsonb not null,
  saved_at timestamptz default now(),
  unique(ticker, period_end)
);

create index if not exists idx_filings_ticker on public.filings(ticker);
create index if not exists idx_filings_period on public.filings(period_end);
create index if not exists idx_filings_quarter on public.filings(fiscal_year, fiscal_quarter);

-- ============================================================
-- Profiles table
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text not null default 'email',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists role text check (role in ('analyst','investor','founder','student')),
  add column if not exists language text not null default 'en' check (language in ('en','vi')),
  add column if not exists timezone text,
  add column if not exists default_analysis_depth text not null default 'standard' check (default_analysis_depth in ('quick','standard','deep')),
  add column if not exists default_output_style text not null default 'bullet' check (default_output_style in ('bullet','executive','report')),
  add column if not exists favorite_modules text[] not null default '{}';

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_provider text;
begin
  resolved_provider := coalesce(new.raw_app_meta_data ->> 'provider', '');
  if resolved_provider = '' and (new.raw_app_meta_data -> 'providers') ? 'google' then
    resolved_provider := 'google';
  end if;
  if resolved_provider = '' then
    resolved_provider := 'email';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    resolved_provider
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    provider = coalesce(nullif(public.profiles.provider, ''), excluded.provider),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

-- ============================================================
-- Analysis history table
-- ============================================================
create table if not exists public.analysis_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid null,
  ticker text,
  company_name text,
  source text not null default 'sec',
  period_end text,
  quarter_label text,
  title text not null default 'Untitled Analysis',
  analysis jsonb not null,
  events jsonb,
  created_at timestamptz default now()
);

alter table public.analysis_history
  add column if not exists user_id uuid,
  add column if not exists ticker text,
  add column if not exists company_name text,
  add column if not exists source text default 'sec',
  add column if not exists period_end text,
  add column if not exists quarter_label text,
  add column if not exists title text default 'Untitled Analysis',
  add column if not exists analysis jsonb,
  add column if not exists events jsonb,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analysis_history_user_id_fkey'
  ) then
    alter table public.analysis_history
      add constraint analysis_history_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

alter table public.analysis_history
  alter column analysis set not null,
  alter column source set not null,
  alter column title set not null;

create index if not exists idx_analysis_history_created_at on public.analysis_history(created_at desc);
create index if not exists idx_analysis_history_user_created_at on public.analysis_history(user_id, created_at desc);
create index if not exists idx_analysis_history_ticker on public.analysis_history(ticker);

alter table public.analysis_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_history'
      and policyname = 'Allow all for analysis_history (phase1 compat)'
  ) then
    create policy "Allow all for analysis_history (phase1 compat)" on public.analysis_history
      for all using (true) with check (true);
  end if;
end $$;

-- ============================================================
-- Adjustments table
-- ============================================================
create table if not exists public.adjustments (
  ticker text primary key references public.companies(ticker) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.adjustments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adjustments'
      and policyname = 'Allow all for adjustments'
  ) then
    create policy "Allow all for adjustments" on public.adjustments
      for all using (true) with check (true);
  end if;
end $$;

-- ============================================================
-- Manual data table
-- ============================================================
create table if not exists public.manual_data (
  id uuid default gen_random_uuid() primary key,
  ticker text not null references public.companies(ticker) on delete cascade,
  period_end text,
  data_type text not null,
  data jsonb not null default '{}'::jsonb,
  source_note text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(ticker, period_end, data_type)
);

create index if not exists idx_manual_data_ticker on public.manual_data(ticker);
create index if not exists idx_manual_data_type on public.manual_data(data_type);

alter table public.manual_data enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'manual_data'
      and policyname = 'Allow all for manual_data'
  ) then
    create policy "Allow all for manual_data" on public.manual_data
      for all using (true) with check (true);
  end if;
end $$;

-- ============================================================
-- Chat schema
-- ============================================================
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'data-source-workbook')),
  title text not null default 'New chat',
  company_ticker text,
  company_name text,
  source_thread_id uuid references public.chat_threads(id) on delete set null,
  workbook_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_user_updated on public.chat_threads(user_id, updated_at desc);
create index if not exists idx_chat_threads_user_kind_company_updated on public.chat_threads(user_id, kind, company_ticker, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread_created on public.chat_messages(thread_id, created_at asc);
create index if not exists idx_chat_messages_user_created on public.chat_messages(user_id, created_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_threads'
      and policyname = 'chat_threads_owner'
  ) then
    create policy "chat_threads_owner" on public.chat_threads
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_owner'
  ) then
    create policy "chat_messages_owner" on public.chat_messages
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
