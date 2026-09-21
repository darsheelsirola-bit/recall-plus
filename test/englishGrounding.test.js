import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEnglishGrounding, loadEnglishChapterFacts, normalizeEnglishChapterFacts } from '../server/ai/englishGrounding.js'
import { normalizeQuizQuestions } from '../server/quizGeneration.js'

const portraitReference = 'node-cbse-2026-27-xi-301:portrait'
const grounding = buildEnglishGrounding({
  curriculumVersionId: 'cbse-2026-27-xi-v1',
  subject: 'English Core',
  chapterTitles: ['The Portrait of a Lady'],
  chapterNodeIds: [portraitReference],
})
const validQuestion = {
  id: 'q1',
  difficulty: 'medium',
  questionType: 'theory',
  question: 'Which routine is stated in the supplied fact?',
  options: ['Morning prayer', 'Market trading', 'Sea navigation', 'Court debate'],
  answer: 'Morning prayer',
  explanation: 'The selected fact states the routine.',
  sourceReference: portraitReference,
  calculation: null,
  factId: 'xi-portrait-03',
}

test('English grounding maps exact reviewed facts to an authorized chapter reference', () => {
  assert.ok(grounding)
  assert.equal(grounding.grade, '11')
  assert.equal(grounding.factsById.get('xi-portrait-03').sourceReference, portraitReference)
  assert.ok(loadEnglishChapterFacts().every(({ facts }) => facts.length >= 8))
})

test('Class XII English grounding covers every current Flamingo and Vistas selection', async () => {
  const { CBSE_2026_27_XII_NODES } = await import('../src/data/curriculum/cbse/2026-27/class-12/outlines.ts')
  const chapters = CBSE_2026_27_XII_NODES.filter(
    (node) => node.subjectId === 'cbse-2026-27-xii-301' && node.nodeType === 'chapter',
  )
  assert.equal(chapters.length, 19)
  const xiiGrounding = buildEnglishGrounding({
    curriculumVersionId: 'cbse-2026-27-xii-v1',
    subject: 'English Core',
    chapterTitles: chapters.map(({ title }) => title),
    chapterNodeIds: chapters.map(({ id }) => id),
  })
  assert.ok(xiiGrounding)
  assert.equal(xiiGrounding.grade, '12')
  assert.equal(xiiGrounding.chapters.length, 19)
  assert.equal(xiiGrounding.facts.length, 152)
})

test('grounded quiz normalization rejects a wrong fact ID and wrong source reference', () => {
  assert.equal(normalizeQuizQuestions(
    [{ ...validQuestion, factId: 'not-an-official-fact' }],
    1,
    'medium',
    new Set([portraitReference]),
    grounding,
  ), null)
  assert.equal(normalizeQuizQuestions(
    [{ ...validQuestion, sourceReference: 'another-authorized-chapter' }],
    1,
    'medium',
    new Set([portraitReference, 'another-authorized-chapter']),
    grounding,
  ), null)
})

test('English fact normalization rejects duplicate fact identities', () => {
  assert.deepEqual(normalizeEnglishChapterFacts([
    { grade: 11, chapter: 'A', sourceUrl: 'https://example.test/a', facts: [{ id: 'same', text: 'A' }] },
    { grade: 12, chapter: 'B', sourceUrl: 'https://example.test/b', facts: [{ id: 'same', text: 'B' }] },
  ]), [])
})
