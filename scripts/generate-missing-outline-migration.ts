/**
 * Additive migration for previously missing allowlist subject outlines
 * (French 118, Hindustani Vocal 034, Painting 049, Entrepreneurship 066, Fashion Studies 837).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'
import { CBSE_2026_27_XI_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-11/catalogue.ts'
import { CBSE_2026_27_XII_NODES } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'
import { CBSE_2026_27_XII_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-12/catalogue.ts'

const CODES = new Set(['034', '049', '066', '118', '837'])
const migrationPath = resolve(
  'supabase/migrations/20260812130000_fill_missing_allowlist_outlines.sql',
)

const xiSubjects = CBSE_2026_27_XI_SUBJECTS.filter((subject) =>
  CODES.has(subject.subjectCode ?? ''))
const xiiSubjects = CBSE_2026_27_XII_SUBJECTS.filter((subject) =>
  CODES.has(subject.subjectCode ?? ''))
const xiSubjectIds = new Set(xiSubjects.map((subject) => subject.id))
const xiiSubjectIds = new Set(xiiSubjects.map((subject) => subject.id))
const includeXii = process.argv.includes('--with-xii')
const subjects = includeXii ? [...xiSubjects, ...xiiSubjects] : xiSubjects
const nodes = [
  ...CBSE_2026_27_XI_NODES.filter((node) => xiSubjectIds.has(node.subjectId)),
  ...(includeXii
    ? CBSE_2026_27_XII_NODES.filter((node) => xiiSubjectIds.has(node.subjectId))
    : []),
]

const payload = {
  subjects,
  nodes,
}
const payloadJson = JSON.stringify(payload)
if (payloadJson.includes('$payload$')) {
  throw new Error('Seed payload unexpectedly contains SQL dollar-quote tag $payload$.')
}

const sql = `-- Recall+ fill missing allowlist outlines (additive)
-- Subjects: 034, 049, 066, 118, 837 for Class XI and Class XII catalogues.
-- Does not truncate user data.

begin;

create temporary table recall_missing_outline_payload (
  value jsonb not null
) on commit drop;

insert into recall_missing_outline_payload (value)
values ($payload$${payloadJson}$payload$::jsonb);

with subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from recall_missing_outline_payload
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

update public.curriculum_nodes as nodes
set
  active = false,
  updated_at = clock_timestamp()
where nodes.subject_id in (
  select subjects.value ->> 'id'
  from recall_missing_outline_payload as payload
  cross join lateral jsonb_array_elements(payload.value -> 'subjects') as subjects(value)
)
and nodes.active;

with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_missing_outline_payload
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
  from recall_missing_outline_payload
)
update public.curriculum_nodes as target
set
  parent_id = nullif(nodes.value ->> 'parentId', ''),
  updated_at = clock_timestamp()
from nodes
where target.id = nodes.value ->> 'id';

commit;
`

await mkdir(dirname(migrationPath), { recursive: true })
await writeFile(migrationPath, sql, 'utf8')
console.log(
  `Wrote ${migrationPath} (${payload.subjects.length} subjects, ${payload.nodes.length} nodes).`,
)
