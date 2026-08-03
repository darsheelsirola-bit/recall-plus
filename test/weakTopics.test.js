import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChapterContext, buildFallbackInsights, findWeakTopics, normalizeTopicResults, weakTopicsFingerprint } from '../src/utils/weakTopics.js'

test('normalizeTopicResults expands multi-topic practice results', () => {
  const entries = normalizeTopicResults([{
    id: '1',
    type: 'practice',
    subject: 'Physics',
    chapter: 'Motion in a Straight Line',
    topic: 'Velocity and Speed, Acceleration',
    topics: ['Velocity and Speed', 'Acceleration'],
    percentage: 40,
    date: '2026-08-01',
  }])
  assert.equal(entries.length, 2)
  assert.equal(entries[0].topic, 'Velocity and Speed')
  assert.equal(entries[1].topic, 'Acceleration')
})

test('findWeakTopics merges recall and practice scores and picks weakest', () => {
  const results = [
    { id: '1', type: 'diagnostic', subject: 'Physics', chapter: 'Motion in a Straight Line', topic: 'Kinematic Equations', percentage: 60, date: '2026-08-02' },
    { id: '2', type: 'practice', subject: 'Physics', chapter: 'Motion in a Straight Line', topic: 'Kinematic Equations', percentage: 30, date: '2026-08-03' },
    { id: '3', type: 'diagnostic', subject: 'Chemistry', chapter: 'Structure of Atom', topic: 'Bohr\'s Model', percentage: 80, date: '2026-08-03' },
  ]
  const weak = findWeakTopics(results, [])
  assert.equal(weak.length, 1)
  assert.equal(weak[0].topic, 'Kinematic Equations')
  assert.equal(weak[0].weakestScore, 30)
  assert.equal(weak[0].recallScore, 60)
  assert.equal(weak[0].practiceScore, 30)
})

test('findWeakTopics excludes topics at or above threshold', () => {
  const results = [
    { id: '1', type: 'diagnostic', subject: 'Maths', chapter: 'Sets', topic: 'Subsets', percentage: 50, date: '2026-08-01' },
    { id: '2', type: 'practice', subject: 'Maths', chapter: 'Sets', topic: 'Operations on Sets', percentage: 49, date: '2026-08-02' },
  ]
  const weak = findWeakTopics(results, [])
  assert.equal(weak.length, 1)
  assert.equal(weak[0].topic, 'Operations on Sets')
})

test('buildChapterContext includes missed questions and study sources', () => {
  const results = [{
    id: 'p1',
    type: 'practice',
    subject: 'Physics',
    chapter: 'Motion in a Straight Line',
    topic: 'Kinematic Equations',
    percentage: 20,
    date: '2026-08-04',
    questionReview: [
      { question: 'What is v = u + at?', chosen: 'A', answer: 'B', correct: false, explanation: 'Use first equation of motion.' },
    ],
  }]
  const logs = [{
    subject: 'Physics',
    chapter: 'Motion in a Straight Line',
    topics: ['Velocity and Speed'],
    timeSpent: 45,
    confidence: 'Low',
    notes: 'Struggled with graphs',
    date: '2026-08-03',
  }]
  const weakTopics = findWeakTopics(results, [])
  const context = buildChapterContext(
    { subject: 'Physics', chapter: 'Motion in a Straight Line', weakTopics },
    {
      results,
      logs,
      reviews: [],
      statuses: {},
      syllabus: [{
        subject: 'Physics',
        chapters: [{
          name: 'Motion in a Straight Line',
          topics: ['Velocity and Speed', 'Acceleration', 'Kinematic Equations'],
        }],
      }],
    },
  )
  assert.ok(context.studySources?.ncert?.book.includes('NCERT'))
  assert.equal(context.studiedTopics.includes('Velocity and Speed'), true)
  assert.equal(context.missedQuestions.length, 1)
  assert.equal(context.studyMinutes, 45)
  assert.ok(context.unstudiedTopics.length > 0)
})

test('weakTopicsFingerprint changes when scores change', () => {
  const base = [{
    subject: 'Physics',
    chapter: 'Motion in a Straight Line',
    syllabusTopics: ['Kinematic Equations'],
    weakTopics: [{ topic: 'Kinematic Equations', weakestScore: 30, recallScore: 30, practiceScore: null }],
    missedQuestions: [],
    studyMinutes: 0,
  }]
  const changed = [{
    ...base[0],
    weakTopics: [{ topic: 'Kinematic Equations', weakestScore: 20, recallScore: 20, practiceScore: null }],
  }]
  assert.notEqual(weakTopicsFingerprint(base), weakTopicsFingerprint(changed))
})

test('buildFallbackInsights creates chapter cards from real weak topic data', () => {
  const results = [
    { id: '1', type: 'diagnostic', subject: 'Physics', chapter: 'Motion in a Straight Line', topic: 'Kinematic Equations', percentage: 30, date: '2026-08-01' },
  ]
  const weak = findWeakTopics(results, [])
  const ctx = buildChapterContext({ subject: 'Physics', chapter: 'Motion in a Straight Line', weakTopics: weak }, { results, logs: [], reviews: [], statuses: {} })
  const fallback = buildFallbackInsights([{ ...ctx, curriculumVersionId: 'cbse-2026-27-xi-v1' }])
  assert.equal(fallback.chapters.length, 1)
  assert.equal(fallback.chapters[0].curriculumVersionId, 'cbse-2026-27-xi-v1')
  assert.ok(fallback.chapters[0].studyFrom.primary.includes('NCERT'))
  assert.ok(fallback.chapters[0].prioritizedTopics[0].topic.includes('Kinematic'))
  assert.ok(fallback.chapters[0].basedOn.includes('30%'))
})
