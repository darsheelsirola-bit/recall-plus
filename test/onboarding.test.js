import test from 'node:test'
import assert from 'node:assert/strict'
import {
  academicRouteDestination,
  arrangeSubjectSelections,
  defaultOnboardingDraft,
  draftStorageKey,
  PATHWAY_PRESETS,
  presetSubjectIds,
  readOnboardingDraft,
  recommendedSubjects,
  shouldPersistOnboardingProgress,
  writeOnboardingDraft,
} from '../src/academic/onboarding.ts'
import {
  CBSE_2026_27_XI_SUBJECTS_BY_CODE,
  validateCbse2026ClassXiCombination,
} from '../src/data/curriculum/index.ts'

function ids(...codes) {
  return codes.map((code) => {
    const subject = CBSE_2026_27_XI_SUBJECTS_BY_CODE.get(code)
    assert.ok(subject, `missing subject ${code}`)
    return subject.id
  })
}

function memoryStorage() {
  const values = new Map()
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
  }
}

test('academic route guard requires onboarding and protects completed setup', () => {
  assert.equal(
    academicRouteDestination(false, '/', false),
    '/onboarding',
  )
  assert.equal(
    academicRouteDestination(false, '/quiz', false),
    '/onboarding',
  )
  assert.equal(
    academicRouteDestination(false, '/onboarding', false),
    null,
  )
  assert.equal(
    academicRouteDestination(true, '/onboarding', false),
    '/',
  )
  assert.equal(
    academicRouteDestination(true, '/onboarding', true),
    null,
  )
  assert.equal(academicRouteDestination(true, '/', false), null)
})

test('completed-profile editing keeps draft progress local until final confirmation', () => {
  assert.equal(shouldPersistOnboardingProgress(false), true)
  assert.equal(shouldPersistOnboardingProgress(true), false)
})

test('onboarding exposes all required pathway choices and presets', () => {
  assert.deepEqual(Object.keys(PATHWAY_PRESETS), [
    'science',
    'commerce',
    'humanities',
  ])
  assert.deepEqual(
    PATHWAY_PRESETS.science.map((preset) => preset.id),
    ['pcm', 'pcb', 'pcmb', 'custom'],
  )
  assert.deepEqual(
    PATHWAY_PRESETS.commerce.map((preset) => preset.id),
    ['mathematics', 'appliedMathematics', 'withoutMathematics', 'custom'],
  )
  assert.deepEqual(
    new Set(presetSubjectIds('science', 'pcm')),
    new Set(ids('042', '043', '041')),
  )
  assert.deepEqual(
    new Set(presetSubjectIds('science', 'pcb')),
    new Set(ids('042', '043', '044')),
  )
  assert.deepEqual(
    new Set(presetSubjectIds('science', 'pcmb')),
    new Set(ids('042', '043', '041', '044')),
  )
  assert.deepEqual(
    new Set(presetSubjectIds('commerce', 'appliedMathematics')),
    new Set(ids('055', '054', '030', '241')),
  )
  assert.equal(
    presetSubjectIds('commerce', 'appliedMathematics')
      .includes(ids('041')[0]),
    false,
  )
})

test('subject arranger produces official five-main and optional-sixth positions', () => {
  const science = arrangeSubjectSelections(
    ids('301', '042', '043', '041', '048', '843'),
  )
  assert.ok(science)
  assert.equal(science.length, 6)
  assert.deepEqual(
    science.map((selection) => selection.selectionType),
    ['main', 'main', 'main', 'main', 'main', 'additional'],
  )
  assert.equal(validateCbse2026ClassXiCombination(science).valid, true)

  const humanities = arrangeSubjectSelections(
    ids('301', '027', '028', '037', '039'),
  )
  assert.ok(humanities)
  assert.equal(validateCbse2026ClassXiCombination(humanities).valid, true)
})

test('subject arranger rejects incomplete and conflicting combinations', () => {
  assert.equal(
    arrangeSubjectSelections(ids('301', '042', '043', '041')),
    null,
  )
  assert.equal(
    arrangeSubjectSelections(ids('301', '055', '054', '041', '241')),
    null,
  )
  assert.equal(
    recommendedSubjects('science').some((subject) => subject.subjectCode === '065'),
    false,
  )
  assert.equal(
    recommendedSubjects('science').every((subject) =>
      ['301', '302', '118'].includes(subject.subjectCode) || subject.subjectGroup !== 'L'),
    true,
  )
})

test('onboarding draft can store Class XII for academic-year setup', () => {
  const storage = memoryStorage()
  const draft = defaultOnboardingDraft(null, '', [], 'XII')
  assert.equal(draft.grade, 'XII')
  writeOnboardingDraft(storage, 'owner-a', draft)
  assert.equal(readOnboardingDraft(storage, 'owner-a')?.grade, 'XII')
})

test('onboarding progress is owner-scoped and discards corrupted drafts', () => {
  const storage = memoryStorage()
  const pcm = defaultOnboardingDraft(
    'science',
    'Recall School',
    ids('301', '042', '043', '041', '048'),
  )
  pcm.step = 5
  writeOnboardingDraft(storage, 'owner-a', pcm)

  assert.deepEqual(readOnboardingDraft(storage, 'owner-a'), pcm)
  assert.equal(readOnboardingDraft(storage, 'owner-b'), null)
  assert.notEqual(draftStorageKey('owner-a'), draftStorageKey('owner-b'))

  storage.setItem(draftStorageKey('owner-a'), '{not-json')
  assert.equal(readOnboardingDraft(storage, 'owner-a'), null)
})
