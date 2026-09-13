import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('quiz preparation reports only completed milestones and paints 100% before activation', () => {
  const page = read('src/pages/Quiz.jsx')
  const service = read('src/services/quizService.js')
  const preparation = page.slice(page.indexOf('async function prepareAndStart'), page.indexOf('async function submit'))

  assert.doesNotMatch(preparation, /value: 5/)
  assert.match(preparation, /if \(!ready && !curriculumSelection\) throw new Error/)
  assert.match(preparation, /value: 10, label: ready \? 'Saved test confirmed' : 'Selections confirmed'/)
  assert.match(service, /const responsePromise = authenticatedFetch\([\s\S]*?onProgress\?\.\(\{ value: 25, label: 'Secure request sent' \}\)\s*const response = await responsePromise/)
  assert.match(service, /if \(!response\.ok\) \{[\s\S]*?throw apiError[\s\S]*?\}\s*onProgress\?\.\(\{ value: 60, label: 'Quiz response received' \}\)/)
  assert.match(service, /validatePublicQuizQuestions\(data\.questions, count\)[\s\S]*?onProgress\?\.\(\{ value: 80, label: 'Safe question format confirmed' \}\)/)
  assert.match(preparation, /saveDataForUserOrThrow\(ownerId, storageKey, generated\)\s*setGenerationProgress\(\{ value: 90, label: 'Verified test saved' \}\)/)

  const complete = preparation.indexOf("flushSync(() => setGenerationProgress({ value: 100, label: 'Your test is ready' }))")
  const painted = preparation.indexOf('await waitForCompletedPreparationPaint()')
  const active = preparation.indexOf("setMode('active')")
  assert.ok(complete >= 0 && complete < painted && painted < active)
  assert.match(page, /window\.requestAnimationFrame\(\(\) => \{\s*window\.requestAnimationFrame\(resolve\)/)
})
