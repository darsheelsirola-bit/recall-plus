import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { CBSE_2026_27_XI_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-11/catalogue.ts'
import { CBSE_2026_27_XII_SUBJECTS } from '../src/data/curriculum/cbse/2026-27/class-12/catalogue.ts'

const reviewedCodes = new Set(['034', '049', '066', '118', '837', '843'])
const sources = new Map<string, { title: string, sha256: string }>()

for (const subject of [...CBSE_2026_27_XI_SUBJECTS, ...CBSE_2026_27_XII_SUBJECTS]) {
  const sha256 = subject.source.sha256
  if (!reviewedCodes.has(subject.subjectCode || '') || !sha256) continue
  const previous = sources.get(subject.source.url)
  if (previous) {
    assert.equal(previous.sha256, sha256, `conflicting hashes for ${subject.source.url}`)
  } else {
    sources.set(subject.source.url, {
      title: subject.source.title,
      sha256,
    })
  }
}

assert.equal(sources.size, 8, 'expected eight distinct newly reviewed CBSE sources')

for (const [url, source] of sources) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'RecallPlus-Curriculum-Integrity/1.0' },
    signal: AbortSignal.timeout(30_000),
  })
  assert.equal(response.status, 200, `${source.title} returned HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')), `${source.title} is not a PDF`)
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  assert.equal(actualHash, source.sha256, `${source.title} SHA-256 changed`)
  console.log(`Verified ${source.title}: HTTP 200, SHA-256 matched.`)
}

console.log(`Verified ${sources.size} distinct official CBSE curriculum sources.`)
