-- Boulio profile completion support
-- Adds the missing nullable fields needed for service readiness.

alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists user_mode text;

alter table public.profiles
  drop constraint if exists profiles_user_mode_check;

alter table public.profiles
  add constraint profiles_user_mode_check
    check (user_mode is null or user_mode in ('haiti_user', 'diaspora_supporter'));

create index if not exists profiles_user_mode_idx
  on public.profiles (user_mode);

create index if not exists profiles_phone_number_idx
  on public.profiles (phone_number);

-- The app treats these fields as profile completion signals.
-- Full service actions still need a real profile record; public browsing remains open.
