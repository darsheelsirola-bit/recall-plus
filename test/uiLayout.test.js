import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

test('PageHeader pins actions to the top-right on every breakpoint', () => {
  const source = read('src/components/PageHeader.jsx')
  assert.match(source, /items-start justify-between/)
  assert.match(source, /ml-auto/)
  assert.match(source, /justify-end/)
  assert.match(source, /gap-3/)
  assert.doesNotMatch(source, /flex-col/)
})

test('BackButton is a compact header control', () => {
  const source = read('src/components/BackButton.jsx')
  assert.match(source, /variant="outline"/)
  assert.match(source, /shrink-0/)
})

test('page-level back controls live in the top-right header', () => {
  const pages = {
    'src/pages/PastTestResults.jsx': /actions=\{<BackButton/,
    'src/pages/PsychologyTechniqueDetail.jsx': /actions=\{<BackButton/,
    'src/pages/Progress.jsx': /actions=\{view \? <BackButton/,
    'src/pages/Quiz.jsx': /<BackButton[\s\S]*label="Go back"/,
    'src/pages/StudyLogsPage.jsx': /<BackButton to="\/" \/>/,
    'src/pages/AddLog.jsx': /actions=\{<BackButton to="\/logs"/,
  }

  for (const [file, pattern] of Object.entries(pages)) {
    assert.match(read(file), pattern, `${file} should put BackButton in the page header actions`)
  }

  const legal = read('src/pages/Legal.tsx')
  assert.match(legal, /flex items-center justify-between gap-4/)
  assert.match(legal, /Back to Recall\+/)
  assert.doesNotMatch(legal, /mt-8 inline-flex[\s\S]{0,120}Back to Recall/)

  const onboarding = read('src/pages/Onboarding.tsx')
  const headerStart = onboarding.indexOf('flex items-start justify-between gap-4')
  const footerStart = onboarding.indexOf('mt-8 flex justify-end border-t')
  const backClick = onboarding.indexOf('onClick={goBack}')
  assert.notEqual(headerStart, -1, 'onboarding step header should keep a top-right row')
  assert.notEqual(footerStart, -1, 'onboarding continue action should stay bottom-right')
  assert.ok(backClick > headerStart && backClick < footerStart, 'onboarding Back should sit in the top-right of the step card')
})
