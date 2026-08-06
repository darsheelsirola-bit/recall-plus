import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const academicProfileSource = await readFile(
  new URL('../src/academic/academicProfile.ts', import.meta.url),
  'utf8',
)
const providerSource = await readFile(
  new URL('../src/academic/AcademicProfileProvider.tsx', import.meta.url),
  'utf8',
)
const homeSource = await readFile(
  new URL('../src/pages/Home.jsx', import.meta.url),
  'utf8',
)
const syllabusSource = await readFile(
  new URL('../src/pages/Syllabus.jsx', import.meta.url),
  'utf8',
)

test('authenticated workspace startup remains curriculum-tree free', () => {
  assert.doesNotMatch(academicProfileSource, /loadClientCurriculumNodes/)
  assert.match(academicProfileSource, /curriculumNodes:\s*\[\]/)
  assert.doesNotMatch(homeSource, /useCurriculumSubjects/)
})

test('curriculum modules are requested per opened subject', () => {
  assert.match(providerSource, /loadClientCurriculumNodes\(\[subjectId\]\)/)
  assert.match(syllabusSource, /useCurriculumSubjects\(\[activeSubject\]\)/)
})
