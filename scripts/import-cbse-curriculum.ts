import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import {
  CBSE_2026_27_XI_NODES,
  CBSE_2026_27_XI_SUBJECTS,
  CBSE_2026_27_XI_VERSION,
} from '../src/data/curriculum/index.ts'
import { validateCheckedInCbseCurriculum } from './validate-cbse-curriculum.ts'

const outputPath = resolve('reports/curriculum/cbse-2026-27-xi-seed.json')

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  let previous = ''
  try {
    previous = await readFile(path, 'utf8')
  } catch {
    // First deterministic import creates the generated seed artifact.
  }
  if (previous === content) return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return true
}

async function verifyReviewedSourceHashes(sourceDirectory: string | null): Promise<void> {
  const sources = new Map<string, string>()
  CBSE_2026_27_XI_SUBJECTS.forEach((subject) => {
    if (subject.contentStatus === 'verified_outline' && subject.source.sha256) {
      sources.set(subject.source.url, subject.source.sha256)
    }
  })

  for (const [url, expectedHash] of sources) {
    let bytes: Uint8Array
    if (sourceDirectory) {
      const sourcePath = resolve(sourceDirectory, basename(new URL(url).pathname))
      bytes = new Uint8Array(await readFile(sourcePath))
    } else {
      const response = await fetch(url, {
        headers: { 'user-agent': 'RecallPlus-Curriculum-Importer/1.0' },
      })
      if (!response.ok) {
        throw new Error(`Official source returned ${response.status}: ${url}`)
      }
      bytes = new Uint8Array(await response.arrayBuffer())
    }
    const actualHash = createHash('sha256').update(bytes).digest('hex')
    if (actualHash !== expectedHash) {
      throw new Error(
        `Official source hash changed for ${url}. Expected ${expectedHash}; received ${actualHash}. `
        + 'Review the new source manually and create a new curriculum version.',
      )
    }
  }
}

const validation = validateCheckedInCbseCurriculum()
if (!validation.valid) {
  throw new Error(
    `Curriculum import stopped: ${validation.issues.map((issue) => issue.message).join(' ')}`,
  )
}

const sourceDirectoryFlag = process.argv.indexOf('--source-dir')
const sourceDirectory = sourceDirectoryFlag >= 0
  ? process.argv[sourceDirectoryFlag + 1]
  : null
if (sourceDirectoryFlag >= 0 && !sourceDirectory) {
  throw new Error('--source-dir requires a directory containing the official source PDF filenames.')
}
if (process.argv.includes('--refresh-source') || sourceDirectory) {
  await verifyReviewedSourceHashes(sourceDirectory)
  console.log(
    `Verified reviewed-source SHA-256 hashes from ${sourceDirectory || 'the official CBSE URLs'}.`,
  )
}

const payload = {
  schemaVersion: 1,
  idempotencyKey: CBSE_2026_27_XI_VERSION.id,
  version: CBSE_2026_27_XI_VERSION,
  subjects: CBSE_2026_27_XI_SUBJECTS,
  nodes: CBSE_2026_27_XI_NODES,
}
const changed = await writeIfChanged(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
console.log(
  `${changed ? 'Generated' : 'Unchanged'} ${outputPath} `
  + `(${payload.subjects.length} subjects, ${payload.nodes.length} nodes).`,
)
