-- Create exactly one owner-scoped profile and app-data row for every new Auth
-- user, including Google, Apple, and GitHub identities. Presentation metadata
-- is never used for authorization and existing profile rows are never updated
-- by a returning sign-in.

create or replace function public.handle_new_recall_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  select pg_catalog.left(pg_catalog.btrim(candidate.value), 50)
  into v_display_name
  from (
    values
      (1, new.raw_user_meta_data ->> 'full_name'),
      (2, new.raw_user_meta_data ->> 'name'),
      (3, new.raw_user_meta_data ->> 'user_name'),
      (4, new.raw_user_meta_data ->> 'preferred_username')
  ) as candidate(priority, value)
  where pg_catalog.char_length(pg_catalog.btrim(candidate.value)) >= 2
  order by candidate.priority
  limit 1;

  v_display_name := pg_catalog.coalesce(v_display_name, 'Recall+ User');

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
  'Creates one owner-scoped Recall+ profile and app-data row for email or OAuth users without overwriting returning users.';

revoke all on function public.handle_new_recall_user()
  from public, anon, authenticated, service_role;
