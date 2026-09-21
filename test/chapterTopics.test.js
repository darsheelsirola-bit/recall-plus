import test from 'node:test'
import assert from 'node:assert/strict'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'
import { CBSE_2026_27_XII_NODES } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'
import topics from '../src/data/curriculum/cbse/2026-27/chapter-topics.json' with { type: 'json' }
import sources from '../src/data/curriculum/cbse/2026-27/chapter-topic-sources.json' with { type: 'json' }
import { normalizeQuizRequest } from '../server/quizGeneration.js'

const nodes = [...CBSE_2026_27_XI_NODES, ...CBSE_2026_27_XII_NODES]

test('source-backed chapter and leaf-unit topics stay in their own subject', () => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  assert.equal(byId.size, nodes.length)
  for (const node of nodes.filter((n) => ['chapter', 'unit'].includes(n.nodeType))) {
    const children = nodes.filter((n) => n.parentId === node.id)
    // Hindi textbook lessons are authoritative navigable leaves, but the supplied
    // sources do not authorize invented per-lesson study-topic labels. Unit nodes
    // may still contain their source-backed chapter children.
    if (node.subjectId.endsWith('-302')) {
      assert.ok(children.every((child) => child.subjectId === node.subjectId))
      assert.ok(children.every((child) => child.nodeType !== 'topic'), `Unexpected invented Hindi topic: ${node.title}`)
      continue
    }
    assert.ok(children.length, `Missing topics: ${node.subjectId} / ${node.title}`)
    assert.ok(children.every((n) => n.subjectId === node.subjectId))
  }
  const sourceMap = new Map(sources.map((source) => [source.url, source.sha256]))
  for (const topic of topics) {
    assert.ok(byId.has(topic.parentId), topic.title)
    assert.match(sourceMap.get(topic.sourceUrl) || '', /^[a-f0-9]{64}$/)
    assert.ok(topic.sourcePage > 0)
  }
})

test('every existing curriculum topic identifier fits the API request bounds', () => {
  for (const node of nodes.filter((n) => n.nodeType === 'topic')) {
    assert.ok(normalizeQuizRequest({
      curriculumSubjectId: node.subjectId,
      chapterNodeIds: [node.parentId], topicNodeIds: [node.id], count: 5,
    }), `Rejected curriculum reference: ${node.title}`)
  }
  assert.equal(normalizeQuizRequest({
    curriculumSubjectId: 'test', chapterNodeIds: ['chapter'], topicNodeIds: ['x'.repeat(513)], count: 5,
  }), null)
})

test('Class XII AI includes the five mandatory employability and eight subject units', () => {
  const units = CBSE_2026_27_XII_NODES.filter((n) => n.subjectId.endsWith('-843') && n.nodeType === 'unit')
  assert.equal(units.length, 13)
  assert.deepEqual(units.slice(0, 5).map((unit) => unit.title), [
    'Communication Skills-IV',
    'Self-Management Skills-IV',
    'ICT Skills-IV',
    'Entrepreneurial Skills-IV',
    'Green Skills-IV',
  ])
  assert.ok(units.some((n) => n.title === 'Generative AI'))
  assert.ok(units.some((n) => n.title === 'Making Machines See'))
  assert.equal(units.filter((n) => n.title.includes('practical assessment')).length, 2)
})

test('corrected Hindi, French, and AI structures retain deterministic identities', () => {
  const xiHindi = CBSE_2026_27_XI_NODES.filter((node) => node.subjectId.endsWith('-302') && node.nodeType === 'chapter')
  const xiiHindi = CBSE_2026_27_XII_NODES.filter((node) => node.subjectId.endsWith('-302') && node.nodeType === 'chapter')
  assert.equal(xiHindi.length, 26)
  assert.equal(xiiHindi.length, 24)
  assert.ok(xiHindi.some(({ title }) => title === 'नमक का दारोगा'))
  assert.ok(xiiHindi.some(({ title }) => title === 'श्रम विभाजन और जाति-प्रथा, मेरी कल्पना का आदर्श समाज'))

  const xiiFrench = CBSE_2026_27_XII_NODES.filter((node) => node.subjectId.endsWith('-118'))
  assert.equal(xiiFrench.some(({ title }) => title === 'Lessons 18-23'), true)
  assert.equal(xiiFrench.some(({ title }) => title === 'Lessons 13-23'), false)

  const xiAi = CBSE_2026_27_XI_NODES.filter((node) => node.subjectId.endsWith('-843'))
  assert.ok(xiAi.some(({ id }) => id === 'node-cbse-2026-27-xi-843:unit:01:introduction-artificial-intelligence-for-everyone'))
  assert.ok(xiAi.some(({ id }) => id === 'node-cbse-2026-27-xi-843:unit:09:communication-skills-iii'))
  const xiiAi = CBSE_2026_27_XII_NODES.filter((node) => node.subjectId.endsWith('-843'))
  assert.ok(xiiAi.some(({ id }) => id === 'node-cbse-2026-27-xii-843:unit:01:Python-Programming-II-practical-assessment'))
  assert.ok(xiiAi.some(({ id }) => id === 'node-cbse-2026-27-xii-843:unit:09:Communication-Skills-IV'))
})
