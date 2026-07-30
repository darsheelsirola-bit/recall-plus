import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_SUBJECTS,
  CBSE_2026_27_XI_VERSION,
} from '../src/data/curriculum/index.ts'
import { validateCheckedInCbseCurriculum } from './validate-cbse-curriculum.ts'

const jsonPath = resolve('reports/curriculum/cbse-2026-27-xi-coverage.json')
const markdownPath = resolve('reports/curriculum/cbse-2026-27-xi-coverage.md')

async function writeIfChanged(path: string, content: string): Promise<void> {
  let previous = ''
  try {
    previous = await readFile(path, 'utf8')
  } catch {
    // The report does not exist before its first deterministic generation.
  }
  if (previous === content) return
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const validation = validateCheckedInCbseCurriculum()
if (!validation.valid) {
  throw new Error(
    `Coverage report stopped: ${validation.issues.map((issue) => issue.message).join(' ')}`,
  )
}

const coverage = CBSE_2026_27_XI_SUBJECTS.map((subject) => {
  const nodes = CBSE_2026_27_XI_NODES.filter((node) => node.subjectId === subject.id)
  const nodeTypes = Object.fromEntries(
    ['unit', 'chapter', 'topic', 'subtopic', 'practical', 'project', 'activity', 'assessment_area']
      .map((type) => [type, nodes.filter((node) => node.nodeType === type).length]),
  )
  return {
    subjectCode: subject.subjectCode,
    subjectName: subject.name,
    group: subject.subjectGroup,
    status: subject.contentStatus,
    nodeCount: nodes.length,
    nodeTypes,
    sourceUrl: subject.source.url,
    sourceHash: subject.source.sha256,
  }
})

const report = {
  schemaVersion: 1,
  curriculumVersion: CBSE_2026_27_XI_VERSION,
  validation: validation.counts,
  groupCounts: Object.fromEntries(
    ['L', 'A', 'S', 'IA'].map((group) => [
      group,
      coverage.filter((subject) => subject.group === group).length,
    ]),
  ),
  statusCounts: {
    verifiedOutline: coverage.filter((subject) => subject.status === 'verified_outline').length,
    pendingVerification: coverage.filter((subject) => subject.status === 'pending_verification').length,
  },
  coverage,
  missingOrIncomplete: coverage
    .filter((subject) => subject.status !== 'verified_outline')
    .map(({ subjectCode, subjectName, group, status, sourceUrl }) => ({
      subjectCode,
      subjectName,
      group,
      status,
      sourceUrl,
    })),
}

const markdownRows = coverage.map((subject) =>
  `| ${subject.subjectCode || 'IA'} | ${subject.subjectName.replaceAll('|', '\\|')} | `
  + `${subject.group} | ${subject.status} | ${subject.nodeCount} | [Official source](${subject.sourceUrl}) |`)

const markdown = `# CBSE 2026-27 Class XI curriculum coverage

- Curriculum version: \`${CBSE_2026_27_XI_VERSION.id}\`
- Selectable official subject codes: ${validation.counts.selectableSubjects}
- Internal-assessment areas: ${coverage.filter((subject) => subject.group === 'IA').length}
- Reviewed subject outlines: ${validation.counts.reviewedSubjects}
- Curriculum nodes: ${validation.counts.nodes}
- Pending subject-level outline verification: ${report.statusCounts.pendingVerification}

\`verified_outline\` means the official source PDF and the checked-in outline were reviewed. It does
not claim textbook-level completeness. \`pending_verification\` subjects are selectable but deliberately
contain no fabricated chapter or topic nodes.

| Code | Subject | Group | Status | Nodes | Source |
| --- | --- | --- | --- | ---: | --- |
${markdownRows.join('\n')}
`

await Promise.all([
  writeIfChanged(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  writeIfChanged(markdownPath, markdown),
])
console.log(`Generated ${jsonPath} and ${markdownPath}.`)
