import { writeFileSync } from 'node:fs'
import { CBSE_2026_27_XII_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-12/catalogue.ts'

function s(value) {
  if (value == null) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}
function b(value) {
  if (value == null) return 'null'
  return value ? 'true' : 'false'
}
function a(values) {
  if (!values?.length) return `'{}'::text[]`
  return `ARRAY[${values.map(s).join(', ')}]::text[]`
}

const values = CBSE_2026_27_XII_SUBJECTS.map((x) => `(${[
  s(x.id),
  s(x.curriculumVersionId),
  s(x.subjectCode),
  s(x.name),
  s(x.shortName),
  s(x.subjectGroup),
  s(x.category),
  b(x.hasTheory),
  b(x.hasPractical),
  b(x.hasInternalAssessment),
  a(x.pathwayTags),
  s(x.source?.url),
  s(x.source?.title),
  s(x.source?.sha256),
  s(x.contentStatus),
  x.officialOrder,
  b(x.active ?? true),
].join(', ')})`).join(',\n')

const sql = `insert into public.curriculum_subjects (
  id, curriculum_version_id, subject_code, name, short_name, subject_group, category,
  has_theory, has_practical, has_internal_assessment, pathway_tags,
  source_url, source_title, source_hash, content_status, official_order, active
) values
${values}
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
  updated_at = clock_timestamp();`

writeFileSync('tmp-xii/subjects-compact.sql', sql)
console.log(sql.length)
