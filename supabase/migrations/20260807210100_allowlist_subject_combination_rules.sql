-- Recall+ allowlist subject-combination rules (additive)
-- Aligns public.validate_recall_subject_combination with English Core / Hindi Core / French only.

begin;

create or replace function public.validate_recall_subject_combination(
  p_selections jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_count integer;
  v_group text;
  v_code text;
  v_conflict_codes text[];
begin
  if (select auth.uid()) is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    return jsonb_build_object(
      'valid',
      false,
      'errors',
      jsonb_build_array(jsonb_build_object(
        'code',
        'INVALID_PAYLOAD',
        'message',
        'Subject selections must be provided as a JSON array.',
        'subjectCodes',
        '[]'::jsonb
      ))
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where jsonb_typeof(entries.value) <> 'object'
      or (
        select count(*)
        from jsonb_object_keys(entries.value) as keys(key)
        where keys.key not in ('curriculumSubjectId', 'subjectPosition', 'selectionType')
      ) > 0
      or coalesce(entries.value ->> 'curriculumSubjectId', '') = ''
      or coalesce(entries.value ->> 'subjectPosition', '') !~ '^[1-6]$'
      or coalesce(entries.value ->> 'selectionType', '') not in ('main', 'additional')
  ) then
    return jsonb_build_object(
      'valid',
      false,
      'errors',
      jsonb_build_array(jsonb_build_object(
        'code',
        'INVALID_PAYLOAD',
        'message',
        'Each selection must contain only a subject ID, position, and selection type.',
        'subjectCodes',
        '[]'::jsonb
      ))
    );
  end if;

  v_count := jsonb_array_length(p_selections);
  if v_count not in (5, 6) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_COUNT',
      'message',
      'Select exactly five main subjects and, optionally, one additional subject.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct entries.value ->> 'curriculumSubjectId')
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'DUPLICATE_SUBJECT',
      'message',
      'Each subject can be selected only once.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct (entries.value ->> 'subjectPosition')::integer)
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MAIN_POSITION',
      'message',
      'Subject positions must be unique whole numbers from 1 to 6.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if v_count in (5, 6)
    and (
      select array_agg(
        (entries.value ->> 'subjectPosition')::integer
        order by (entries.value ->> 'subjectPosition')::integer
      )
      from jsonb_array_elements(p_selections) as entries(value)
    ) is distinct from (
      case
        when v_count = 5 then array[1, 2, 3, 4, 5]
        else array[1, 2, 3, 4, 5, 6]
      end
    ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_POSITION_SEQUENCE',
      'message',
      'Five subjects must use positions 1 to 5; a sixth subject uses position 6.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where (
      (entries.value ->> 'subjectPosition')::integer between 1 and 5
      and entries.value ->> 'selectionType' <> 'main'
    ) or (
      (entries.value ->> 'subjectPosition')::integer = 6
      and entries.value ->> 'selectionType' <> 'additional'
    )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SELECTION_POSITION',
      'message',
      'Subjects 1 to 5 must be main and Subject 6 must be additional.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    left join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.id is null
      or subjects.curriculum_version_id <> 'cbse-2026-27-xi-v1'
      or not subjects.active
      or subjects.subject_group = 'IA'
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'UNKNOWN_SUBJECT',
      'message',
      'One or more subjects are unavailable in the active CBSE Class XI catalogue.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 1;

  if v_group is distinct from 'L'
    or v_code is null
    or v_code not in ('301', '302', '118') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_ONE_LANGUAGE',
      'message',
      'Subject 1 must be English Core, Hindi Core, or French.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 2;

  if v_group is null or v_group not in ('L', 'A') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_TWO_GROUP',
      'message',
      'Subject 2 must be another Group-L language or a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer in (3, 4)
      and subjects.subject_group not in ('A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MAIN_SUBJECT_GROUP',
      'message',
      'Subjects 3 and 4 must be Group-A academic or Group-S skill electives.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 5;

  if v_group is distinct from 'A' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_FIVE_GROUP',
      'message',
      'Subject 5 must be a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer = 6
      and subjects.subject_group not in ('L', 'A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'ADDITIONAL_SUBJECT_GROUP',
      'message',
      'The additional subject must be a Group-L, Group-A, or Group-S subject.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.subject_code in ('301', '302', '118')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'REQUIRED_LANGUAGE',
      'message',
      'Your combination must include English Core, Hindi Core, or French.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  select array_agg(subjects.subject_code order by subjects.subject_code)
  into v_conflict_codes
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where subjects.subject_code in ('041', '241');
  if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MATH_CONFLICT',
      'message',
      'You cannot select both Mathematics and Applied Mathematics.',
      'subjectCodes',
      to_jsonb(v_conflict_codes)
    ));
  end if;

  return jsonb_build_object(
    'valid',
    jsonb_array_length(v_errors) = 0,
    'errors',
    v_errors
  );
end;
$$;

comment on function public.validate_recall_subject_combination(jsonb) is
  'Validates one Recall+ Class XI five-or-six-subject combination using the approved allowlist language and conflict rules.';

commit;
