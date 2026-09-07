import { mkdirSync, writeFileSync } from 'node:fs'
import { CBSE_2026_27_XII_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-12/catalogue.ts'
import { CBSE_2026_27_XII_NODES } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'
import { CBSE_2026_27_XII_VERSION } from '../src/data/curriculum/cbse/2026-27/class-12/version.ts'

function sqlStr(value) {
  if (value == null) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlNum(value) {
  return value == null ? 'null' : String(value)
}

function sqlBool(value) {
  if (value == null) return 'null'
  return value ? 'true' : 'false'
}

function sqlTextArray(values) {
  if (!values?.length) return `'{}'::text[]`
  return `ARRAY[${values.map(sqlStr).join(', ')}]::text[]`
}

const outDir = 'tmp-xii'
mkdirSync(outDir, { recursive: true })

const versionSql = `insert into public.curriculum_versions (
  id, board, academic_year, grade, version, status,
  source_url, source_title, source_hash, imported_at, verified_at
) values (
  ${sqlStr(CBSE_2026_27_XII_VERSION.id)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.board)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.academicYear)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.grade)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.version)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.status)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.sourceUrl)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.sourceTitle)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.sourceHash)},
  ${sqlStr(CBSE_2026_27_XII_VERSION.importedAt)}::timestamptz,
  ${sqlStr(CBSE_2026_27_XII_VERSION.verifiedAt)}::timestamptz
)
on conflict (id) do update set
  board = excluded.board,
  academic_year = excluded.academic_year,
  grade = excluded.grade,
  version = excluded.version,
  status = excluded.status,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  imported_at = excluded.imported_at,
  verified_at = excluded.verified_at;`

writeFileSync(`${outDir}/version.sql`, versionSql)

const subjectSql = CBSE_2026_27_XII_SUBJECTS.map((subject) => `insert into public.curriculum_subjects (
  id, curriculum_version_id, subject_code, name, short_name, subject_group, category,
  has_theory, has_practical, has_internal_assessment, pathway_tags,
  source_url, source_title, source_hash, content_status, official_order, active
) values (
  ${sqlStr(subject.id)}, ${sqlStr(subject.curriculumVersionId)}, ${sqlStr(subject.subjectCode)},
  ${sqlStr(subject.name)}, ${sqlStr(subject.shortName)}, ${sqlStr(subject.subjectGroup)},
  ${sqlStr(subject.category)}, ${sqlBool(subject.hasTheory)}, ${sqlBool(subject.hasPractical)},
  ${sqlBool(subject.hasInternalAssessment)}, ${sqlTextArray(subject.pathwayTags)},
  ${sqlStr(subject.source?.url)}, ${sqlStr(subject.source?.title)}, ${sqlStr(subject.source?.sha256)},
  ${sqlStr(subject.contentStatus)}, ${sqlNum(subject.officialOrder)}, ${sqlBool(subject.active ?? true)}
)
on conflict (id) do update set
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
  updated_at = clock_timestamp();`).join('\n')

writeFileSync(`${outDir}/subjects.sql`, subjectSql)

const conflict = `on conflict (id) do update set
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
  updated_at = clock_timestamp()`

const summary = []
for (const subject of CBSE_2026_27_XII_SUBJECTS) {
  const nodes = CBSE_2026_27_XII_NODES.filter((node) => node.subjectId === subject.id)
  const values = nodes.map((node) => `(${[
    sqlStr(node.id),
    sqlStr(node.subjectId),
    'null',
    sqlStr(node.nodeType),
    sqlStr(node.title),
    sqlStr(node.description),
    sqlNum(node.officialOrder),
    sqlNum(node.marksWeightage),
    sqlNum(node.sourcePage),
    sqlStr(node.sourceUrl),
    sqlStr(node.externalKey),
    'true',
  ].join(', ')})`).join(',\n')
  const parents = nodes
    .filter((node) => node.parentId)
    .map((node) => `update public.curriculum_nodes set parent_id = ${sqlStr(node.parentId)}, updated_at = clock_timestamp() where id = ${sqlStr(node.id)};`)
    .join('\n')
  const sql = nodes.length
    ? `insert into public.curriculum_nodes (
  id, subject_id, parent_id, node_type, title, description, official_order,
  marks_weightage, source_page, source_url, external_key, active
) values
${values}
${conflict};
${parents}`
    : `-- no nodes for ${subject.subjectCode}`
  writeFileSync(`${outDir}/${subject.subjectCode}.sql`, sql)
  summary.push({
    code: subject.subjectCode,
    name: subject.name,
    nodes: nodes.length,
    parents: nodes.filter((node) => node.parentId).length,
    bytes: sql.length,
  })
}

writeFileSync(`${outDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify({
  versionBytes: versionSql.length,
  subjectBytes: subjectSql.length,
  subjects: CBSE_2026_27_XII_SUBJECTS.length,
  nodes: CBSE_2026_27_XII_NODES.length,
  summary,
}, null, 2))
