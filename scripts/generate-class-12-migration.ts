/**
 * Generates additive Class XII curriculum seed + migration.
 * Does not rewrite applied XI migrations.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XII_NODES,
  CBSE_2026_27_XII_SUBJECTS,
  CBSE_2026_27_XII_VERSION,
  CBSE_2026_27_XII_VERSION_ID,
} from '../src/data/curriculum/cbse/2026-27/class-12/index.ts'

const seedPath = resolve('reports/curriculum/cbse-2026-27-xii-seed.json')
const migrationPath = resolve(
  'supabase/migrations/20260812120000_class_12_curriculum.sql',
)

const payload = {
  schemaVersion: 1,
  idempotencyKey: CBSE_2026_27_XII_VERSION_ID,
  version: CBSE_2026_27_XII_VERSION,
  subjects: CBSE_2026_27_XII_SUBJECTS,
  nodes: CBSE_2026_27_XII_NODES,
}

const payloadJson = JSON.stringify(payload)
if (payloadJson.includes('$payload$')) {
  throw new Error('Seed payload unexpectedly contains SQL dollar-quote tag $payload$.')
}

await mkdir(dirname(seedPath), { recursive: true })
await writeFile(seedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

const sql = `-- Recall+ CBSE Class XII curriculum (additive)
-- Academic year: 2026-27 · version ${CBSE_2026_27_XII_VERSION_ID}
-- Inserts XII catalogue + nodes; updates subject-combination and save RPCs.
-- Does not alter existing Class XI profiles or truncate user data.

begin;

create temporary table recall_xii_seed_payload (
  value jsonb not null
) on commit drop;

insert into recall_xii_seed_payload (value)
values ($payload$${payloadJson}$payload$::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Curriculum version
-- ---------------------------------------------------------------------------
insert into public.curriculum_versions (
  id,
  board,
  academic_year,
  grade,
  version,
  status,
  source_url,
  source_title,
  source_hash,
  imported_at,
  verified_at
)
select
  payload.value -> 'version' ->> 'id',
  payload.value -> 'version' ->> 'board',
  payload.value -> 'version' ->> 'academicYear',
  payload.value -> 'version' ->> 'grade',
  payload.value -> 'version' ->> 'version',
  payload.value -> 'version' ->> 'status',
  payload.value -> 'version' ->> 'sourceUrl',
  payload.value -> 'version' ->> 'sourceTitle',
  payload.value -> 'version' ->> 'sourceHash',
  (payload.value -> 'version' ->> 'importedAt')::timestamptz,
  (payload.value -> 'version' ->> 'verifiedAt')::timestamptz
from recall_xii_seed_payload as payload
on conflict (id) do update
set
  board = excluded.board,
  academic_year = excluded.academic_year,
  grade = excluded.grade,
  version = excluded.version,
  status = excluded.status,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  imported_at = excluded.imported_at,
  verified_at = excluded.verified_at;

-- ---------------------------------------------------------------------------
-- 2. Subjects
-- ---------------------------------------------------------------------------
with subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from recall_xii_seed_payload
)
insert into public.curriculum_subjects (
  id,
  curriculum_version_id,
  subject_code,
  name,
  short_name,
  subject_group,
  category,
  has_theory,
  has_practical,
  has_internal_assessment,
  pathway_tags,
  source_url,
  source_title,
  source_hash,
  content_status,
  official_order,
  active
)
select
  subjects.value ->> 'id',
  subjects.value ->> 'curriculumVersionId',
  nullif(subjects.value ->> 'subjectCode', ''),
  subjects.value ->> 'name',
  subjects.value ->> 'shortName',
  subjects.value ->> 'subjectGroup',
  subjects.value ->> 'category',
  case
    when subjects.value ->> 'hasTheory' is null then null
    else (subjects.value ->> 'hasTheory')::boolean
  end,
  case
    when subjects.value ->> 'hasPractical' is null then null
    else (subjects.value ->> 'hasPractical')::boolean
  end,
  case
    when subjects.value ->> 'hasInternalAssessment' is null then null
    else (subjects.value ->> 'hasInternalAssessment')::boolean
  end,
  coalesce(
    (
      select array_agg(tags.value order by tags.ordinality)
      from jsonb_array_elements_text(subjects.value -> 'pathwayTags')
        with ordinality as tags(value, ordinality)
    ),
    '{}'::text[]
  ),
  subjects.value -> 'source' ->> 'url',
  subjects.value -> 'source' ->> 'title',
  nullif(subjects.value -> 'source' ->> 'sha256', ''),
  subjects.value ->> 'contentStatus',
  (subjects.value ->> 'officialOrder')::integer,
  coalesce((subjects.value ->> 'active')::boolean, true)
from subjects
on conflict (id) do update
set
  curriculum_version_id = excluded.curriculum_version_id,
  subject_code = excluded.subject_code,
  name = excluded.name,
  short_name = excluded.short_name,
  subject_group = excluded.subject_group,
  category = excluded.category,
  has_theory = excluded.has_theory,
  has_practical = excluded.has_practical,
  has_internal_assessment = excluded.has_internal_assessment,
  pathway_tags = excluded.pathway_tags,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  content_status = excluded.content_status,
  official_order = excluded.official_order,
  active = excluded.active,
  updated_at = clock_timestamp();

-- ---------------------------------------------------------------------------
-- 3. Upsert XII outline nodes (two-pass parent links)
-- ---------------------------------------------------------------------------
update public.curriculum_nodes as nodes
set
  active = false,
  updated_at = clock_timestamp()
where nodes.subject_id in (
  select subjects.id
  from public.curriculum_subjects as subjects
  where subjects.curriculum_version_id = '${CBSE_2026_27_XII_VERSION_ID}'
)
and nodes.active;

with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_xii_seed_payload
)
insert into public.curriculum_nodes (
  id,
  subject_id,
  parent_id,
  node_type,
  title,
  description,
  official_order,
  marks_weightage,
  source_page,
  source_url,
  external_key,
  active
)
select
  nodes.value ->> 'id',
  nodes.value ->> 'subjectId',
  null,
  nodes.value ->> 'nodeType',
  nodes.value ->> 'title',
  nullif(nodes.value ->> 'description', ''),
  (nodes.value ->> 'officialOrder')::integer,
  case
    when nodes.value ->> 'marksWeightage' is null then null
    else (nodes.value ->> 'marksWeightage')::numeric
  end,
  case
    when nodes.value ->> 'sourcePage' is null then null
    else (nodes.value ->> 'sourcePage')::integer
  end,
  nodes.value ->> 'sourceUrl',
  nodes.value ->> 'externalKey',
  true
from nodes
on conflict (id) do update
set
  subject_id = excluded.subject_id,
  parent_id = null,
  node_type = excluded.node_type,
  title = excluded.title,
  description = excluded.description,
  official_order = excluded.official_order,
  marks_weightage = excluded.marks_weightage,
  source_page = excluded.source_page,
  source_url = excluded.source_url,
  external_key = excluded.external_key,
  active = true,
  updated_at = clock_timestamp();

with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_xii_seed_payload
)
update public.curriculum_nodes as target
set
  parent_id = nullif(nodes.value ->> 'parentId', ''),
  updated_at = clock_timestamp()
from nodes
where target.id = nodes.value ->> 'id';

-- ---------------------------------------------------------------------------
-- 4. Subject combination validation: accept XI or XII (single version per request)
-- ---------------------------------------------------------------------------
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
  v_version_id text;
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
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'INVALID_PAYLOAD',
        'message', 'Subject selections must be provided as a JSON array.',
        'subjectCodes', '[]'::jsonb
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
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'INVALID_PAYLOAD',
        'message', 'Each selection must contain only a subject ID, position, and selection type.',
        'subjectCodes', '[]'::jsonb
      ))
    );
  end if;

  v_count := jsonb_array_length(p_selections);
  if v_count not in (5, 6) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_COUNT',
      'message', 'Select exactly five main subjects and, optionally, one additional subject.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct entries.value ->> 'curriculumSubjectId')
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'DUPLICATE_SUBJECT',
      'message', 'Each subject can be selected only once.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct (entries.value ->> 'subjectPosition')::integer)
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MAIN_POSITION',
      'message', 'Subject positions must be unique whole numbers from 1 to 6.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'SUBJECT_POSITION_SEQUENCE',
      'message', 'Five subjects must use positions 1 to 5; a sixth subject uses position 6.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'SELECTION_POSITION',
      'message', 'Subjects 1 to 5 must be main and Subject 6 must be additional.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  select subjects.curriculum_version_id
  into v_version_id
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  limit 1;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    left join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.id is null
      or subjects.curriculum_version_id not in (
        'cbse-2026-27-xi-v1',
        'cbse-2026-27-xii-v1'
      )
      or not subjects.active
      or subjects.subject_group = 'IA'
      or subjects.curriculum_version_id is distinct from v_version_id
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'UNKNOWN_SUBJECT',
      'message', 'One or more subjects are unavailable in the selected CBSE Class XI/XII catalogue.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'SUBJECT_ONE_LANGUAGE',
      'message', 'Subject 1 must be English Core, Hindi Core, or French.',
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
      'code', 'SUBJECT_TWO_GROUP',
      'message', 'Subject 2 must be another Group-L language or a Group-A academic elective.',
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
      'code', 'MAIN_SUBJECT_GROUP',
      'message', 'Subjects 3 and 4 must be Group-A academic or Group-S skill electives.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'SUBJECT_FIVE_GROUP',
      'message', 'Subject 5 must be a Group-A academic elective.',
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
      'code', 'ADDITIONAL_SUBJECT_GROUP',
      'message', 'The additional subject must be a Group-L, Group-A, or Group-S subject.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'REQUIRED_LANGUAGE',
      'message', 'Your combination must include English Core, Hindi Core, or French.',
      'subjectCodes', '[]'::jsonb
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
      'code', 'MATH_CONFLICT',
      'message', 'You cannot select both Mathematics and Applied Mathematics.',
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
  'Validates one Recall+ Class XI or XII five-or-six-subject combination using the approved allowlist language and conflict rules.';

-- ---------------------------------------------------------------------------
-- 5. Save academic profile: accept selected curriculum version (XI or XII)
-- ---------------------------------------------------------------------------
drop function if exists public.save_recall_academic_profile(text, text, jsonb);
drop function if exists recall_private.save_recall_academic_profile_impl(text, text, jsonb);

create function recall_private.save_recall_academic_profile_impl(
  p_pathway text,
  p_school_name text,
  p_selections jsonb,
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
  v_validation jsonb;
  v_completed_at timestamptz := clock_timestamp();
  v_version_id text := coalesce(nullif(btrim(p_curriculum_version_id), ''), 'cbse-2026-27-xi-v1');
  v_grade text;
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  if p_pathway is null
    or p_pathway not in ('science', 'commerce', 'humanities') then
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

  v_validation := public.validate_recall_subject_combination(p_selections);
  if not (v_validation ->> 'valid')::boolean then
    raise exception 'INVALID_SUBJECT_COMBINATION'
      using errcode = '22023', detail = v_validation::text;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.curriculum_version_id is distinct from v_version_id
  ) then
    raise exception 'Selected subjects must belong to the chosen curriculum version.'
      using errcode = '23514';
  end if;

  perform 1
  from public.user_academic_profiles
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Academic profile not found for the active curriculum.'
      using errcode = '23503';
  end if;

  update public.user_academic_profiles
  set
    grade = v_grade,
    curriculum_version_id = v_version_id
  where user_id = v_user_id;

  update public.user_subjects as existing
  set archived_at = v_completed_at
  where existing.user_id = v_user_id
    and existing.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(p_selections) as entries(value)
      where entries.value ->> 'curriculumSubjectId' = existing.curriculum_subject_id
        and (entries.value ->> 'subjectPosition')::smallint = existing.subject_position
        and entries.value ->> 'selectionType' = existing.selection_type
    );

  insert into public.user_subjects (
    user_id,
    curriculum_subject_id,
    subject_position,
    selection_type
  )
  select
    v_user_id,
    entries.value ->> 'curriculumSubjectId',
    (entries.value ->> 'subjectPosition')::smallint,
    entries.value ->> 'selectionType'
  from jsonb_array_elements(p_selections) as entries(value)
  where not exists (
    select 1
    from public.user_subjects as existing
    where existing.user_id = v_user_id
      and existing.curriculum_subject_id = entries.value ->> 'curriculumSubjectId'
      and existing.subject_position = (entries.value ->> 'subjectPosition')::smallint
      and existing.selection_type = entries.value ->> 'selectionType'
      and existing.archived_at is null
  );

  update public.user_subject_migration_candidates as candidates
  set
    resolution_status = case
      when exists (
        select 1
        from jsonb_array_elements(p_selections) as entries(value)
        where entries.value ->> 'curriculumSubjectId' = candidates.curriculum_subject_id
      ) then 'confirmed'
      else 'dismissed'
    end,
    resolved_at = v_completed_at
  where candidates.user_id = v_user_id
    and candidates.resolution_status in ('mapped', 'unresolved');

  update public.user_academic_profiles
  set
    pathway = p_pathway,
    school_name = v_school_name,
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, v_completed_at)
  where user_id = v_user_id;

  return jsonb_build_object(
    'userId', v_user_id,
    'pathway', p_pathway,
    'schoolName', v_school_name,
    'curriculumVersionId', v_version_id,
    'grade', v_grade,
    'onboardingCompleted', true,
    'validation', v_validation,
    'subjects', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'curriculumSubjectId', subjects.curriculum_subject_id,
            'subjectPosition', subjects.subject_position,
            'selectionType', subjects.selection_type
          )
          order by subjects.subject_position
        ),
        '[]'::jsonb
      )
      from public.user_subjects as subjects
      where subjects.user_id = v_user_id
        and subjects.archived_at is null
    )
  );
end;
$$;

create function public.save_recall_academic_profile(
  p_pathway text,
  p_school_name text,
  p_selections jsonb,
  p_curriculum_version_id text default 'cbse-2026-27-xi-v1'
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.save_recall_academic_profile_impl(
    p_pathway,
    p_school_name,
    p_selections,
    p_curriculum_version_id
  );
$$;

revoke all on function public.save_recall_academic_profile(text, text, jsonb, text)
  from public;
grant execute on function public.save_recall_academic_profile(text, text, jsonb, text)
  to authenticated;
revoke all on function recall_private.save_recall_academic_profile_impl(text, text, jsonb, text)
  from public;
grant execute on function recall_private.save_recall_academic_profile_impl(text, text, jsonb, text)
  to authenticated;

commit;
`

const nodesMigrationPath = resolve(
  'supabase/migrations/20260812120100_class_12_curriculum_nodes.sql',
)
const subjectsOnlyJson = JSON.stringify({ ...payload, nodes: [] })
const nodesOnlyJson = JSON.stringify({
  schemaVersion: payload.schemaVersion,
  idempotencyKey: payload.idempotencyKey,
  nodes: payload.nodes,
})
const versionSubjectsEnd = sql.indexOf('-- 3. Upsert XII outline nodes')
const rpcStart = sql.indexOf('-- 4. Subject combination validation')
const nodesSection = sql.slice(versionSubjectsEnd, rpcStart)
const rpcAndCommit = sql.slice(rpcStart)
const part1 = `${sql.slice(0, versionSubjectsEnd).replace(
  /\$payload\$[\s\S]*?\$payload\$/,
  `$payload$${subjectsOnlyJson}$payload$`,
)}
-- Node outlines are applied in 20260812120100_class_12_curriculum_nodes.sql

${rpcAndCommit}`
const cleanedNodes = nodesSection.replace(
  /^-- -+\r?\n-- 3\. Upsert XII outline nodes \(two-pass parent links\)\r?\n-- -+\r?\n/,
  '',
)
const part2 = `-- Recall+ CBSE Class XII curriculum nodes (additive)
-- Companion to 20260812120000_class_12_curriculum.sql

begin;

create temporary table recall_xii_seed_payload (
  value jsonb not null
) on commit drop;

insert into recall_xii_seed_payload (value)
values ($payload$${nodesOnlyJson}$payload$::jsonb);

${cleanedNodes}
commit;
`

await writeFile(migrationPath, part1, 'utf8')
await writeFile(nodesMigrationPath, part2, 'utf8')
console.log(
  `Wrote ${seedPath} (${payload.subjects.length} subjects, ${payload.nodes.length} nodes), `
  + `${migrationPath}, and ${nodesMigrationPath}.`,
)
