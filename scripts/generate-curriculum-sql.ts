import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XI_SUBJECTS,
  LEGACY_SUBJECT_ALIASES,
} from '../src/data/curriculum/index.ts'

const templatePath = resolve('supabase/templates/curriculum_profiles_and_rls.sql')
const seedPath = resolve('reports/curriculum/cbse-2026-27-xi-seed.json')
const outputPath = resolve(
  'supabase/migrations/20260730120000_curriculum_profiles_and_rls.sql',
)

function normalizeAlias(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const aliases = new Map<string, {
  curriculumSubjectId: string
  confidence: 'exact' | 'alias'
}>()

CBSE_2026_27_XI_SUBJECTS.forEach((subject) => {
  if (!subject.subjectCode) return
  aliases.set(normalizeAlias(subject.name), {
    curriculumSubjectId: subject.id,
    confidence: 'exact',
  })
})
Object.entries(LEGACY_SUBJECT_ALIASES).forEach(([alias, subjectCode]) => {
  const curriculumSubjectId = `cbse-2026-27-xi-${subjectCode}`
  if (!aliases.has(alias)) {
    aliases.set(alias, { curriculumSubjectId, confidence: 'alias' })
  }
})

const [template, seed] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(seedPath, 'utf8'),
])
const aliasPayload = JSON.stringify(
  [...aliases.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([normalizedAlias, value]) => ({ normalizedAlias, ...value })),
)

for (const [tag, content] of [
  ['$curriculum$', seed],
  ['$aliases$', aliasPayload],
] as const) {
  if (content.includes(tag)) {
    throw new Error(`Generated payload unexpectedly contains SQL dollar-quote tag ${tag}.`)
  }
}

const generated = template
  .replaceAll('__CURRICULUM_PAYLOAD__', seed.trim())
  .replaceAll('__ALIAS_PAYLOAD__', aliasPayload)

if (
  generated.includes('__CURRICULUM_PAYLOAD__')
  || generated.includes('__ALIAS_PAYLOAD__')
) {
  throw new Error('Curriculum SQL template replacement was incomplete.')
}

let previous = ''
try {
  previous = await readFile(outputPath, 'utf8')
} catch {
  // The first generation creates the versioned migration.
}
if (process.argv.includes('--check')) {
  if (previous !== generated) {
    throw new Error(
      'Generated curriculum migration is stale. Run npm run curriculum:sql and review the diff.',
    )
  }
  console.log(`Verified generated migration ${outputPath}.`)
  process.exit(0)
}
if (previous !== generated) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, generated, 'utf8')
  console.log(`Generated ${outputPath}.`)
} else {
  console.log(`Unchanged ${outputPath}.`)
}
