import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_SUBJECTS,
} from '../src/data/curriculum/cbse/2026-27/class-11/index.ts'
import {
  CBSE_2026_27_XII_NODES,
  CBSE_2026_27_XII_SUBJECTS,
} from '../src/data/curriculum/cbse/2026-27/class-12/index.ts'

const outputPath = resolve(
  'supabase/migrations/20260921121220_reconcile_verified_2026_27_curriculum.sql',
)
const sourceCodes = new Set(['034', '049', '066', '118', '837', '843'])
const nodeSubjectIds = new Set([
  'cbse-2026-27-xi-066',
  'cbse-2026-27-xi-302',
  'cbse-2026-27-xi-837',
  'cbse-2026-27-xi-843',
  'cbse-2026-27-xii-066',
  'cbse-2026-27-xii-118',
  'cbse-2026-27-xii-302',
  'cbse-2026-27-xii-843',
])

const subjects = [...CBSE_2026_27_XI_SUBJECTS, ...CBSE_2026_27_XII_SUBJECTS]
  .filter((subject) => sourceCodes.has(subject.subjectCode || ''))
const nodes = [...CBSE_2026_27_XI_NODES, ...CBSE_2026_27_XII_NODES]
  .filter((node) => nodeSubjectIds.has(node.subjectId))
const payload = JSON.stringify({ subjects, nodes, nodeSubjectIds: [...nodeSubjectIds].sort() })

if (payload.includes('$curriculum$')) {
  throw new Error('Curriculum reconciliation payload contains the SQL quote delimiter.')
}

const sql = `-- Recall+ verified CBSE 2026-27 curriculum reconciliation
-- Forward-only and idempotent. Historical curriculum nodes remain stored but
-- replaced nodes are made inactive so existing study records are preserved.

begin;

create temporary table recall_verified_curriculum_20260920 (
  value jsonb not null
) on commit drop;

insert into recall_verified_curriculum_20260920 (value)
values ($curriculum$${payload}$curriculum$::jsonb);

with subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from recall_verified_curriculum_20260920
)
insert into public.curriculum_subjects (
  id, curriculum_version_id, subject_code, name, short_name, subject_group,
  category, has_theory, has_practical, has_internal_assessment, pathway_tags,
  source_url, source_title, source_hash, content_status, official_order, active
)
select
  value ->> 'id', value ->> 'curriculumVersionId', value ->> 'subjectCode',
  value ->> 'name', value ->> 'shortName', value ->> 'subjectGroup',
  value ->> 'category', (value ->> 'hasTheory')::boolean,
  (value ->> 'hasPractical')::boolean,
  (value ->> 'hasInternalAssessment')::boolean,
  array(select jsonb_array_elements_text(value -> 'pathwayTags')),
  value -> 'source' ->> 'url', value -> 'source' ->> 'title',
  nullif(value -> 'source' ->> 'sha256', ''), value ->> 'contentStatus',
  (value ->> 'officialOrder')::integer, (value ->> 'active')::boolean
from subjects
on conflict (id) do update set
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  content_status = excluded.content_status,
  active = excluded.active,
  updated_at = clock_timestamp();

update public.curriculum_nodes as existing
set active = false, updated_at = clock_timestamp()
where existing.subject_id in (
  select jsonb_array_elements_text(value -> 'nodeSubjectIds')
  from recall_verified_curriculum_20260920
)
and existing.active;

with nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from recall_verified_curriculum_20260920
)
insert into public.curriculum_nodes (
  id, subject_id, parent_id, node_type, title, description, official_order,
  marks_weightage, source_page, source_url, external_key, active
)
select
  value ->> 'id', value ->> 'subjectId', null, value ->> 'nodeType',
  value ->> 'title', nullif(value ->> 'description', ''),
  (value ->> 'officialOrder')::integer,
  case when value ->> 'marksWeightage' is null then null
    else (value ->> 'marksWeightage')::numeric end,
  case when value ->> 'sourcePage' is null then null
    else (value ->> 'sourcePage')::integer end,
  value ->> 'sourceUrl', value ->> 'externalKey', true
from nodes
on conflict (id) do update set
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
  from recall_verified_curriculum_20260920
)
update public.curriculum_nodes as target
set parent_id = nullif(nodes.value ->> 'parentId', ''),
    updated_at = clock_timestamp()
from nodes
where target.id = nodes.value ->> 'id';

commit;
`

let current = ''
try {
  current = await readFile(outputPath, 'utf8')
} catch {
  // The first generation creates the forward migration.
}

if (process.argv.includes('--check')) {
  if (current !== sql) {
    throw new Error('Verified curriculum reconciliation migration is stale.')
  }
  console.log(`Verified ${outputPath} (${subjects.length} subjects, ${nodes.length} nodes).`)
  process.exit(0)
}

if (current !== sql) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, sql, 'utf8')
  console.log(`Generated ${outputPath} (${subjects.length} subjects, ${nodes.length} nodes).`)
} else {
  console.log(`Unchanged ${outputPath}.`)
}
