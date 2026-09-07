/**
 * Generates an additive production migration that:
 * - allows node_type = book
 * - deactivates subjects outside the Recall+ allowlist
 * - replaces outline nodes from the current seed for allowlist subjects
 * - updates study-log validation to accept book roots
 *
 * Does NOT rewrite 20260730120000 (already applied in production).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  RECALL_XI_ALLOWLIST_CODES,
  RECALL_XI_LANGUAGE_CODES,
} from '../src/data/curriculum/cbse/2026-27/class-11/catalogue.ts'

const seedPath = resolve('reports/curriculum/cbse-2026-27-xi-seed.json')
const outputPath = resolve(
  'supabase/migrations/20260807210000_curriculum_allowlist_and_books.sql',
)

const seed = JSON.parse(await readFile(seedPath, 'utf8'))
const allowlist = [...RECALL_XI_ALLOWLIST_CODES]
const languages = [...RECALL_XI_LANGUAGE_CODES]
const allowlistSql = allowlist.map((code) => `'${code}'`).join(', ')
const languagesSql = languages.map((code) => `'${code}'`).join(', ')

const payload = {
  schemaVersion: seed.schemaVersion,
  idempotencyKey: seed.idempotencyKey,
  subjects: seed.subjects,
  nodes: seed.nodes,
}
const payloadJson = JSON.stringify(payload)
if (payloadJson.includes('$payload$')) {
  throw new Error('Seed payload unexpectedly contains SQL dollar-quote tag $payload$.')
}

const sql = `-- Recall+ Class XI allowlist + book hierarchy (additive, production-safe)
-- Academic year: 2026-27
-- Does not truncate user data. Non-allowlist subjects are deactivated, not deleted.

begin;

create temporary table recall_allowlist_seed_payload (
  value jsonb not null
) on commit drop;

insert into recall_allowlist_seed_payload (value)
values ($payload$${payloadJson}$payload$::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Allow book nodes in the curriculum tree
-- ---------------------------------------------------------------------------
alter table public.curriculum_nodes
  drop constraint if exists curriculum_nodes_type_check;

alter table public.curriculum_nodes
  add constraint curriculum_nodes_type_check
  check (node_type in (
    'book',
    'unit',
    'chapter',
    'topic',
    'subtopic',
    'practical',
    'project',
    'activity',
    'assessment_area'
  ));

-- ---------------------------------------------------------------------------
-- 2. Deactivate subjects outside the Recall+ allowlist (preserve history)
-- ---------------------------------------------------------------------------
update public.curriculum_subjects as subjects
set
  active = false,
  updated_at = clock_timestamp()
where subjects.curriculum_version_id = 'cbse-2026-27-xi-v1'
  and (
    subjects.subject_code is null
    or subjects.subject_code <> all (array[${allowlistSql}]::text[])
  )
  and subjects.active;

update public.user_subjects as selections
set
  archived_at = coalesce(selections.archived_at, clock_timestamp())
from public.curriculum_subjects as subjects
where selections.curriculum_subject_id = subjects.id
  and subjects.curriculum_version_id = 'cbse-2026-27-xi-v1'
  and subjects.active = false
  and selections.archived_at is null;

-- ---------------------------------------------------------------------------
-- 3. Upsert allowlist subject catalogue metadata from the current seed
-- ---------------------------------------------------------------------------
with subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from recall_allowlist_seed_payload
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
  value ->> 'id',
  value ->> 'curriculumVersionId',
  value ->> 'subjectCode',
  value ->> 'name',
  value ->> 'shortName',
  value ->> 'subjectGroup',
  value ->> 'category',
  (value ->> 'hasTheory')::boolean,
  (value ->> 'hasPractical')::boolean,
  (value ->> 'hasInternalAssessment')::boolean,
  array(
    select jsonb_array_elements_text(value -> 'pathwayTags')
  ),
  value -> 'source' ->> 'url',
  value -> 'source' ->> 'title',
  value -> 'source' ->> 'sha256',
  value ->> 'contentStatus',
  (value ->> 'officialOrder')::integer,
  true
from subjects
on conflict (id) do update
set
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
  active = true,
  updated_at = clock_timestamp();

-- ---------------------------------------------------------------------------
-- 4. Replace outline nodes for allowlist subjects from the current seed
-- ---------------------------------------------------------------------------
update public.curriculum_nodes as nodes
set
  active = false,
  updated_at = clock_timestamp()
where nodes.subject_id in (
  select subjects.id
  from public.curriculum_subjects as subjects
  where subjects.curriculum_version_id = 'cbse-2026-27-xi-v1'
    and subjects.subject_code = any (array[${allowlistSql}]::text[])
)
and nodes.active;

-- Pass 1: upsert nodes without parent links (avoids FK order issues)
with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_allowlist_seed_payload
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
  value ->> 'id',
  value ->> 'subjectId',
  null,
  value ->> 'nodeType',
  value ->> 'title',
  value ->> 'description',
  (value ->> 'officialOrder')::integer,
  (value ->> 'marksWeightage')::numeric,
  (value ->> 'sourcePage')::integer,
  value ->> 'sourceUrl',
  value ->> 'externalKey',
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

-- Pass 2: restore parent links
with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_allowlist_seed_payload
)
update public.curriculum_nodes as target
set
  parent_id = nullif(nodes.value ->> 'parentId', ''),
  updated_at = clock_timestamp()
from nodes
where target.id = nodes.value ->> 'id';

-- ---------------------------------------------------------------------------
-- 5. Study-log validation: accept book / assessment / practical roots
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

-- ---------------------------------------------------------------------------
-- 6. Guards
-- ---------------------------------------------------------------------------
do $$
declare
  v_active_count integer;
  v_language_count integer;
  v_book_count integer;
  v_archived_selections integer;
begin
  select count(*)::integer
  into v_active_count
  from public.curriculum_subjects
  where curriculum_version_id = 'cbse-2026-27-xi-v1'
    and active
    and subject_group <> 'IA';

  if v_active_count <> ${allowlist.length} then
    raise exception 'Expected ${allowlist.length} active allowlist subjects; found %', v_active_count;
  end if;

  select count(*)::integer
  into v_language_count
  from public.curriculum_subjects
  where curriculum_version_id = 'cbse-2026-27-xi-v1'
    and active
    and subject_group = 'L'
    and subject_code = any (array[${languagesSql}]::text[]);

  if v_language_count <> ${languages.length} then
    raise exception 'Expected ${languages.length} active language subjects; found %', v_language_count;
  end if;

  if exists (
    select 1
    from public.curriculum_subjects
    where curriculum_version_id = 'cbse-2026-27-xi-v1'
      and active
      and subject_group = 'L'
      and subject_code <> all (array[${languagesSql}]::text[])
  ) then
    raise exception 'Active language catalogue contains a non-allowlist language.';
  end if;

  select count(*)::integer
  into v_book_count
  from public.curriculum_nodes
  where active
    and node_type = 'book'
    and subject_id in (
      'cbse-2026-27-xi-301',
      'cbse-2026-27-xi-302',
      'cbse-2026-27-xi-029'
    );

  if v_book_count < 5 then
    raise exception 'Expected English/Hindi/Geography book nodes; found %', v_book_count;
  end if;

  select count(*)::integer
  into v_archived_selections
  from public.user_subjects
  where archived_at is not null;

  raise notice 'Allowlist migration complete. Active subjects=%, language subjects=%, book nodes(sample)=%, archived selections=%',
    v_active_count, v_language_count, v_book_count, v_archived_selections;
end;
$$;

commit;
`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, sql, 'utf8')
console.log(`Wrote ${outputPath} (${sql.length} bytes).`)
