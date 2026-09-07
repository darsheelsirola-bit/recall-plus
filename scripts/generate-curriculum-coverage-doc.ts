import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_SUBJECTS,
  RECALL_XI_ALLOWLIST_CODES,
  RECALL_XI_LANGUAGE_CODES,
} from '../src/data/curriculum/index.ts'
import { validateCheckedInCbseCurriculum } from './validate-cbse-curriculum.ts'

const outputPath = resolve('docs/CURRICULUM_COVERAGE_2026_27.md')

const validation = validateCheckedInCbseCurriculum()
if (!validation.valid) {
  throw new Error(validation.issues.map((issue) => issue.message).join('\n'))
}

const reviewedSources = new Set(
  CBSE_2026_27_XI_SUBJECTS
    .filter((subject) => subject.contentStatus === 'verified_outline')
    .map((subject) => subject.subjectCode),
)

const rows = [...RECALL_XI_ALLOWLIST_CODES].map((code) => {
  const subject = CBSE_2026_27_XI_SUBJECTS.find((entry) => entry.subjectCode === code)
  if (!subject) {
    return {
      code,
      name: 'MISSING FROM CATALOGUE',
      source: 'n/a',
      books: 0,
      units: 0,
      chapters: 0,
      topics: 0,
      status: 'PENDING VERIFICATION',
      missing: 'Subject missing from catalogue',
      sourceUrl: '',
      academicYear: '2026-27',
    }
  }
  const nodes = CBSE_2026_27_XI_NODES.filter((node) => node.subjectId === subject.id)
  const count = (type: string) => nodes.filter((node) => node.nodeType === type).length
  const books = count('book')
  const units = count('unit') + count('assessment_area')
  const chapters = count('chapter') + count('practical') + count('project')
  const topics = count('topic') + count('subtopic')
  const verified = reviewedSources.has(code) && nodes.length > 0
  const missing = []
  if (!verified) missing.push('Full chapter/topic outline not yet verified against 2026-27 official source')
  if (code === '302' && chapters === 0) missing.push('Hindi Core books present; chapter detail pending NCERT verification')
  if (['034', '049', '066', '118', '837', '048'].includes(code) && !verified) {
    missing.push('Awaiting official unit/chapter import')
  }
  return {
    code,
    name: subject.name,
    source: reviewedSources.has(code) ? 'CBSE 2026-27 syllabus PDF (+ NCERT textbook structure where applicable)' : 'CBSE catalogue / skill list (outline pending)',
    books,
    units,
    chapters,
    topics,
    status: verified
      ? (missing.length ? 'PARTIAL' : 'VERIFIED OUTLINE')
      : 'PENDING VERIFICATION',
    missing: missing.join('; ') || '—',
    sourceUrl: subject.source.url,
    academicYear: '2026-27',
  }
})

const verifiedCount = rows.filter((row) => row.status === 'VERIFIED OUTLINE' || row.status === 'PARTIAL').length

const markdown = `# Recall+ Class XI curriculum coverage (2026–27)

Generated from the in-repo catalogue. Do not treat PENDING VERIFICATION rows as complete chapter/topic coverage.

## Catalogue guards

- Active allowlist codes: **${RECALL_XI_ALLOWLIST_CODES.length}** (\`${[...RECALL_XI_ALLOWLIST_CODES].join(', ')}\`)
- Language codes only: **${RECALL_XI_LANGUAGE_CODES.length}** (\`${[...RECALL_XI_LANGUAGE_CODES].join(', ')}\`)
- Validator: ${validation.valid ? 'passed' : 'FAILED'} (${validation.counts.nodes} nodes, ${validation.counts.reviewedSubjects} reviewed outlines)
- Subjects with imported outlines (verified or partial): **${verifiedCount} / ${rows.length}**

## Subject coverage

| Code | Subject | Source | Books | Units | Chapters | Topics | Status | Missing content | Source URL | Year |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
${rows.map((row) =>
  `| ${row.code} | ${row.name} | ${row.source} | ${row.books} | ${row.units} | ${row.chapters} | ${row.topics} | ${row.status} | ${row.missing} | ${row.sourceUrl} | ${row.academicYear} |`
).join('\n')}

## Notes

- Official primary index: https://cbseacademic.nic.in/curriculum_2027.html
- NCERT textbook index: https://ncert.nic.in/textbook.php
- Hornbill and Snapshots are stored as **books** under English Core, not as topics.
- Geography stores Fundamentals of Physical Geography, India – Physical Environment, and Practical Work as separate books.
- Hindi Core currently stores आरोह and वितान as books; chapter lists are marked pending until verified against the current rationalised NCERT edition.
- Skill subjects without NCERT textbooks (for example Artificial Intelligence 843, Fashion Studies 837) use CBSE Skill Education curriculum material when outlines are imported.
- This report does **not** invent missing chapters or topics to inflate coverage.
`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, markdown, 'utf8')
console.log(`Wrote ${outputPath}`)
