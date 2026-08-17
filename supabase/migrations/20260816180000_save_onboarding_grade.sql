begin;

drop function if exists public.save_recall_onboarding_progress(text, text);
drop function if exists recall_private.save_recall_onboarding_progress_impl(text, text);

create function recall_private.save_recall_onboarding_progress_impl(
  p_pathway text,
  p_school_name text,
  p_curriculum_version_id text default 'cbse-2026-27-xi-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_school_name text := nullif(btrim(p_school_name), '');
  v_version_id text := coalesce(nullif(btrim(p_curriculum_version_id), ''), 'cbse-2026-27-xi-v1');
  v_grade text;
  v_profile public.user_academic_profiles%rowtype;
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  if p_pathway is not null
    and p_pathway not in ('science', 'commerce', 'humanities') then
    raise exception 'Invalid academic pathway.'
      using errcode = '22023';
  end if;
  if v_school_name is not null
    and char_length(v_school_name) not between 2 and 160 then
    raise exception 'School name must contain 2 to 160 characters.'
      using errcode = '22023';
  end if;
  if v_version_id not in ('cbse-2026-27-xi-v1', 'cbse-2026-27-xii-v1') then
    raise exception 'Unsupported curriculum version.'
      using errcode = '22023';
  end if;

  select versions.grade
  into v_grade
  from public.curriculum_versions as versions
  where versions.id = v_version_id;
  if v_grade is null then
    raise exception 'Curriculum version was not found.'
      using errcode = '23503';
  end if;

  update public.user_academic_profiles
  set
    pathway = p_pathway,
    school_name = v_school_name,
    grade = v_grade,
    curriculum_version_id = v_version_id
  where user_id = v_user_id
    and not onboarding_completed
  returning * into v_profile;

  if not found then
    raise exception 'Incomplete academic profile not found.'
      using errcode = '23503';
  end if;

  return jsonb_build_object(
    'userId',
    v_profile.user_id,
    'pathway',
    v_profile.pathway,
    'schoolName',
    v_profile.school_name,
    'grade',
    v_profile.grade,
    'curriculumVersionId',
    v_profile.curriculum_version_id,
    'onboardingCompleted',
    v_profile.onboarding_completed
  );
end;
$$;

create function public.save_recall_onboarding_progress(
  p_pathway text,
  p_school_name text,
  p_curriculum_version_id text default 'cbse-2026-27-xi-v1'
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.save_recall_onboarding_progress_impl(
    p_pathway,
    p_school_name,
    p_curriculum_version_id
  );
$$;

revoke all on function public.save_recall_onboarding_progress(text, text, text)
  from public;
grant execute on function public.save_recall_onboarding_progress(text, text, text)
  to authenticated;
revoke all on function recall_private.save_recall_onboarding_progress_impl(text, text, text)
  from public;
grant execute on function recall_private.save_recall_onboarding_progress_impl(text, text, text)
  to authenticated;

commit;
