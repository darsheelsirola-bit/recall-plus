-- Recall+ auth bootstrap self-heal + conflict-safe empty snapshot writes
-- Additive, production-safe. Does not modify existing user data rows.

-- ---------------------------------------------------------------------------
-- 1. Idempotent bootstrap for authenticated users missing profile rows
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Allow expected_version = 0 to adopt an empty trigger-created snapshot
-- ---------------------------------------------------------------------------
create or replace function recall_private.upsert_recall_app_data_impl(
  p_user_id uuid,
  p_data jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := (select auth.uid());
  v_row public.user_app_data%rowtype;
begin
  if v_authenticated_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    )
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Snapshot data must be a JSON object.'
      using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 1048576 then
    raise exception 'USER_DATA_TOO_LARGE'
      using
        errcode = '22023',
        detail = '{"maxBytes":1048576}';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Expected snapshot version must be zero or greater.'
      using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.user_app_data (user_id, data, version)
    values (p_user_id, p_data, 1)
    on conflict (user_id) do update
      set
        data = excluded.data,
        version = public.user_app_data.version + 1,
        updated_at = clock_timestamp()
      where public.user_app_data.version = 1
        and public.user_app_data.data = '{}'::jsonb
    returning * into v_row;
  else
    update public.user_app_data
    set
      data = p_data,
      version = version + 1,
      updated_at = clock_timestamp()
    where user_id = p_user_id
      and version = p_expected_version
    returning * into v_row;
  end if;

  if not found then
    raise exception 'USER_DATA_VERSION_CONFLICT'
      using
        errcode = 'P0001',
        detail = jsonb_build_object(
          'expectedVersion',
          p_expected_version,
          'currentVersion',
          (
            select app_data.version
            from public.user_app_data as app_data
            where app_data.user_id = p_user_id
          )
        )::text;
  end if;

  return jsonb_build_object(
    'data',
    v_row.data,
    'version',
    v_row.version,
    'updatedAt',
    v_row.updated_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Study-log validation: accept book / assessment / practical roots
-- ---------------------------------------------------------------------------
create or replace function recall_private.enforce_user_app_data_curriculum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_curriculum_version_id text;
  v_onboarding_completed boolean;
  v_subject_id text;
  v_subject_name text;
  v_node_ids text[];
  v_root_ids text[];
  v_node_id text;
  v_has_valid_ancestor boolean;
begin
  select
    profiles.curriculum_version_id,
    profiles.onboarding_completed
  into
    v_curriculum_version_id,
    v_onboarding_completed
  from public.user_academic_profiles as profiles
  where profiles.user_id = new.user_id;

  if not coalesce(v_onboarding_completed, false) then
    return new;
  end if;

  if new.data ? 'recall_plus_study_logs'
    and jsonb_typeof(new.data -> 'recall_plus_study_logs') <> 'array' then
    raise exception 'INVALID_STUDY_LOG_CURRICULUM'
      using errcode = '22023';
  end if;

  for v_entry in
    select entries.value
    from jsonb_array_elements(
      coalesce(new.data -> 'recall_plus_study_logs', '[]'::jsonb)
    ) as entries(value)
  loop
    if tg_op = 'UPDATE' and exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(old.data -> 'recall_plus_study_logs') = 'array'
            then old.data -> 'recall_plus_study_logs'
          else '[]'::jsonb
        end
      ) as previous(value)
      where previous.value = v_entry
    ) then
      continue;
    end if;

    if jsonb_typeof(v_entry) <> 'object'
      or coalesce(btrim(v_entry ->> 'id'), '') = ''
      or v_entry ->> 'curriculumVersionId' is distinct from v_curriculum_version_id
      or coalesce(btrim(v_entry ->> 'curriculumSubjectId'), '') = ''
      or jsonb_typeof(v_entry -> 'curriculumNodeIds') <> 'array'
      or jsonb_array_length(v_entry -> 'curriculumNodeIds') < 2
      or jsonb_array_length(v_entry -> 'curriculumNodeIds') > 64 then
      raise exception 'INVALID_STUDY_LOG_CURRICULUM'
        using errcode = '22023';
    end if;

    v_subject_id := btrim(v_entry ->> 'curriculumSubjectId');
    select subjects.name
    into v_subject_name
    from public.user_subjects as selections
    join public.curriculum_subjects as subjects
      on subjects.id = selections.curriculum_subject_id
    where selections.user_id = new.user_id
      and selections.curriculum_subject_id = v_subject_id
      and selections.archived_at is null
      and subjects.curriculum_version_id = v_curriculum_version_id
      and subjects.active;

    if v_subject_name is null
      or v_entry ->> 'subject' is distinct from v_subject_name then
      raise exception 'INVALID_STUDY_LOG_CURRICULUM'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_entry -> 'curriculumNodeIds') as nodes(value)
      where jsonb_typeof(nodes.value) <> 'string'
        or coalesce(btrim(nodes.value #>> '{}'), '') = ''
    ) then
      raise exception 'INVALID_STUDY_LOG_CURRICULUM'
        using errcode = '22023';
    end if;

    select array_agg(nodes.value #>> '{}' order by nodes.ordinality)
    into v_node_ids
    from jsonb_array_elements(v_entry -> 'curriculumNodeIds')
      with ordinality as nodes(value, ordinality);

    if cardinality(v_node_ids) <> cardinality(array(select distinct unnest(v_node_ids)))
      or cardinality(v_node_ids) <> (
        select count(*)
        from public.curriculum_nodes as nodes
        where nodes.id = any(v_node_ids)
          and nodes.subject_id = v_subject_id
          and nodes.active
      ) then
      raise exception 'INVALID_STUDY_LOG_CURRICULUM'
        using errcode = '22023';
    end if;

    select array_agg(nodes.id)
    into v_root_ids
    from public.curriculum_nodes as nodes
    where nodes.id = any(v_node_ids)
      and nodes.subject_id = v_subject_id
      and nodes.parent_id is null
      and nodes.node_type in (
        'book',
        'unit',
        'chapter',
        'assessment_area',
        'practical',
        'project'
      );

    if coalesce(cardinality(v_root_ids), 0) = 0 then
      raise exception 'INVALID_STUDY_LOG_CURRICULUM'
        using errcode = '22023';
    end if;

    foreach v_node_id in array v_node_ids
    loop
      if v_node_id = any(v_root_ids) then
        continue;
      end if;

      with recursive ancestors as (
        select nodes.parent_id
        from public.curriculum_nodes as nodes
        where nodes.id = v_node_id
          and nodes.subject_id = v_subject_id

        union all

        select parent.parent_id
        from public.curriculum_nodes as parent
        join ancestors
          on parent.id = ancestors.parent_id
        where parent.subject_id = v_subject_id
      )
      select exists (
        select 1
        from ancestors
        where parent_id = any(v_root_ids)
      )
      into v_has_valid_ancestor;

      if not v_has_valid_ancestor then
        raise exception 'INVALID_STUDY_LOG_CURRICULUM'
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

comment on function recall_private.enforce_user_app_data_curriculum() is
  'Preserves untouched legacy snapshots and rejects new or changed post-onboarding study logs unless their official subject and node IDs belong to the owner active allowlist curriculum (book/unit/chapter roots allowed).';
