-- ============================================================
-- Profiles + Google-ready user mirror  (v2: personalization)
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

-- v2: add personalisation columns safely
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
