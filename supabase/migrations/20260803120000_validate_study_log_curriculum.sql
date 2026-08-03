begin;

create function recall_private.enforce_user_app_data_curriculum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_subject_id text;
  v_subject_name text;
  v_node_ids text[];
  v_root_ids text[];
  v_node_id text;
  v_has_valid_ancestor boolean;
begin
  if not coalesce(
    (
      select profiles.onboarding_completed
      from public.user_academic_profiles as profiles
      where profiles.user_id = new.user_id
    ),
    false
  ) then
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
      and nodes.node_type in ('unit', 'chapter');

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

revoke all on function recall_private.enforce_user_app_data_curriculum()
from public, anon, authenticated;

drop trigger if exists user_app_data_validate_curriculum
on public.user_app_data;

create trigger user_app_data_validate_curriculum
before insert or update of data
on public.user_app_data
for each row
execute function recall_private.enforce_user_app_data_curriculum();

comment on function recall_private.enforce_user_app_data_curriculum() is
  'Preserves untouched legacy snapshots and rejects new or changed post-onboarding study logs unless their official subject and node IDs belong to the owner active curriculum.';

commit;
