-- Restore the authenticated-user bootstrap RPC that hydrate and academic
-- profile loading call when profile rows are missing. Production never
-- received 20260809180000_auth_bootstrap_self_heal.

create or replace function public.ensure_recall_user_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_anonymous boolean := coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  );
  v_display_name text;
  v_created_profile boolean := false;
  v_created_app_data boolean := false;
  v_created_academic boolean := false;
begin
  if v_uid is null or v_is_anonymous then
    raise exception 'Authenticated session required.'
      using errcode = '42501';
  end if;

  select left(btrim(candidate.value), 50)
  into v_display_name
  from auth.users as users
  cross join lateral (
    values
      (1, users.raw_user_meta_data ->> 'full_name'),
      (2, users.raw_user_meta_data ->> 'name'),
      (3, users.raw_user_meta_data ->> 'user_name'),
      (4, users.raw_user_meta_data ->> 'preferred_username')
  ) as candidate(priority, value)
  where users.id = v_uid
    and char_length(btrim(coalesce(candidate.value, ''))) >= 2
  order by candidate.priority
  limit 1;

  v_display_name := coalesce(v_display_name, 'Recall+ User');

  insert into public.recall_profiles (
    id,
    display_name,
    timezone,
    timezone_initialized
  )
  values (
    v_uid,
    v_display_name,
    'Asia/Kolkata',
    true
  )
  on conflict (id) do nothing;
  v_created_profile := found;

  insert into public.user_app_data (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;
  v_created_app_data := found;

  insert into public.user_academic_profiles (
    user_id,
    board,
    grade,
    academic_year,
    curriculum_version_id,
    pathway,
    timezone,
    school_name,
    onboarding_completed,
    onboarding_completed_at
  )
  values (
    v_uid,
    'CBSE',
    'XI',
    '2026-27',
    'cbse-2026-27-xi-v1',
    null,
    'Asia/Kolkata',
    null,
    false,
    null
  )
  on conflict (user_id) do nothing;
  v_created_academic := found;

  return jsonb_build_object(
    'userId', v_uid,
    'createdProfile', v_created_profile,
    'createdAppData', v_created_app_data,
    'createdAcademicProfile', v_created_academic
  );
end;
$$;

comment on function public.ensure_recall_user_bootstrap() is
  'Ensures the authenticated caller has minimum Recall+ profile rows without overwriting existing data.';

revoke all on function public.ensure_recall_user_bootstrap()
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_recall_user_bootstrap()
  to authenticated;
