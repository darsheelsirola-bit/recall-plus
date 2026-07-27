-- Recall+ profile identity and canonical India daily-reset timezone
--
-- Profile names are user-editable presentation data. Quota boundaries are
-- product policy, so they must not depend on browser or user metadata.

update public.recall_profiles
set display_name = case
  when display_name is null
    or pg_catalog.char_length(pg_catalog.btrim(display_name)) < 2
    then 'Student'
  else pg_catalog.left(pg_catalog.btrim(display_name), 50)
end;

alter table public.recall_profiles
  drop constraint if exists recall_profiles_display_name_length_check;

alter table public.recall_profiles
  alter column display_name set not null,
  alter column timezone set default 'Asia/Kolkata';

update public.recall_profiles
set
  timezone = 'Asia/Kolkata',
  timezone_initialized = true
where timezone is distinct from 'Asia/Kolkata'
  or not timezone_initialized;

alter table public.recall_profiles
  add constraint recall_profiles_display_name_check
    check (
      display_name = pg_catalog.btrim(display_name)
      and pg_catalog.char_length(display_name) between 2 and 50
    ),
  add constraint recall_profiles_india_timezone_check
    check (timezone = 'Asia/Kolkata');

comment on table public.recall_profiles is
  'Recall+ profile data. display_name is owner-editable; all daily limits use the fixed Asia/Kolkata product timezone.';

create or replace function public.handle_new_recall_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := pg_catalog.left(
    pg_catalog.btrim(
      coalesce(
        nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(pg_catalog.btrim(pg_catalog.split_part(coalesce(new.email, ''), '@', 1)), ''),
        'Student'
      )
    ),
    50
  );
  if pg_catalog.char_length(v_display_name) < 2 then
    v_display_name := 'Student';
  end if;

  insert into public.recall_profiles (
    id,
    display_name,
    timezone,
    timezone_initialized
  )
  values (new.id, v_display_name, 'Asia/Kolkata', true)
  on conflict (id) do nothing;

  insert into public.user_app_data (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_recall_user() is
  'Creates user-owned Recall+ rows with a validated display name and the fixed Asia/Kolkata quota timezone.';
revoke all on function public.handle_new_recall_user()
  from public, anon, authenticated, service_role;

create or replace function public.initialize_recall_timezone(
  p_user_id uuid,
  p_timezone text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := (select auth.uid());
begin
  if v_authenticated_user_id is null
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_timezone is null
    or pg_catalog.octet_length(p_timezone) > 128
    or p_timezone is distinct from 'Asia/Kolkata' then
    raise exception 'Invalid IANA timezone.'
      using errcode = '22023';
  end if;

  update public.recall_profiles
  set
    timezone = 'Asia/Kolkata',
    timezone_initialized = true
  where id = p_user_id;

  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id
      using errcode = '23503';
  end if;

  return 'Asia/Kolkata';
end;
$$;

comment on function public.initialize_recall_timezone(uuid, text) is
  'Verifies the explicitly named authenticated user and enforces the canonical Asia/Kolkata quota timezone.';
revoke all on function public.initialize_recall_timezone(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_recall_timezone(uuid, text)
  to authenticated;
