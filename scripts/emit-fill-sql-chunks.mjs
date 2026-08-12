import { writeFileSync } from 'node:fs'
import { CBSE_2026_27_XI_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-11/catalogue.ts'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'

const CODES = new Set(['034', '049', '066', '118', '837'])
const subjects = CBSE_2026_27_XI_SUBJECTS.filter((subject) =>
  CODES.has(subject.subjectCode ?? ''))
const subjectIds = new Set(subjects.map((subject) => subject.id))
const nodes = CBSE_2026_27_XI_NODES.filter((node) => subjectIds.has(node.subjectId))

function sqlStr(value) {
  if (value == null) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}
function sqlBool(value) {
  if (value == null) return 'null'
  return value ? 'true' : 'false'
}

const subjectSql = subjects.map((subject) => `update public.curriculum_subjects set
  has_theory = ${sqlBool(subject.hasTheory)},
  has_practical = ${sqlBool(subject.hasPractical)},
  has_internal_assessment = ${sqlBool(subject.hasInternalAssessment)},
  source_url = ${sqlStr(subject.source.url)},
  source_title = ${sqlStr(subject.source.title)},
  source_hash = ${sqlStr(subject.source.sha256)},
  content_status = ${sqlStr(subject.contentStatus)},
  updated_at = clock_timestamp()
where id = ${sqlStr(subject.id)};`).join('\n')

const deactivateSql = `update public.curriculum_nodes set active = false, updated_at = clock_timestamp()
where subject_id in (${[...subjectIds].map(sqlStr).join(', ')}) and active;`

const insertPass1 = nodes.map((node) => `insert into public.curriculum_nodes (
  id, subject_id, parent_id, node_type, title, description, official_order,
  marks_weightage, source_page, source_url, external_key, active
) values (
  ${sqlStr(node.id)}, ${sqlStr(node.subjectId)}, null, ${sqlStr(node.nodeType)},
  ${sqlStr(node.title)}, ${sqlStr(node.description)}, ${node.officialOrder},
  ${node.marksWeightage == null ? 'null' : node.marksWeightage},
  ${node.sourcePage == null ? 'null' : node.sourcePage},
  ${sqlStr(node.sourceUrl)}, ${sqlStr(node.externalKey)}, true
)
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
  updated_at = clock_timestamp();`).join('\n')

const parentSql = nodes
  .filter((node) => node.parentId)
  .map((node) => `update public.curriculum_nodes set parent_id = ${sqlStr(node.parentId)}, updated_at = clock_timestamp() where id = ${sqlStr(node.id)};`)
  .join('\n')

writeFileSync('tmp-fill-subjects.sql', subjectSql)
writeFileSync('tmp-fill-deactivate.sql', deactivateSql)
writeFileSync('tmp-fill-nodes-pass1.sql', insertPass1)
writeFileSync('tmp-fill-nodes-parents.sql', parentSql)

for (const subject of subjects) {
  const subjectNodes = nodes.filter((node) => node.subjectId === subject.id)
  const pass1 = subjectNodes.map((node) => `insert into public.curriculum_nodes (
  id, subject_id, parent_id, node_type, title, description, official_order,
  marks_weightage, source_page, source_url, external_key, active
) values (
  ${sqlStr(node.id)}, ${sqlStr(node.subjectId)}, null, ${sqlStr(node.nodeType)},
  ${sqlStr(node.title)}, ${sqlStr(node.description)}, ${node.officialOrder},
  ${node.marksWeightage == null ? 'null' : node.marksWeightage},
  ${node.sourcePage == null ? 'null' : node.sourcePage},
  ${sqlStr(node.sourceUrl)}, ${sqlStr(node.externalKey)}, true
)
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
  updated_at = clock_timestamp();`).join('\n')
  const parents = subjectNodes
    .filter((node) => node.parentId)
    .map((node) => `update public.curriculum_nodes set parent_id = ${sqlStr(node.parentId)}, updated_at = clock_timestamp() where id = ${sqlStr(node.id)};`)
    .join('\n')
  writeFileSync(`tmp-fill-${subject.subjectCode}.sql`, `${pass1}\n${parents}`)
}

console.log({
  subjects: subjectSql.length,
  deactivate: deactivateSql.length,
  pass1: insertPass1.length,
  parents: parentSql.length,
  nodeCount: nodes.length,
})
