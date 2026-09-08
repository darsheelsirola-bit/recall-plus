import test from 'node:test'
import assert from 'node:assert/strict'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'
import { CBSE_2026_27_XII_NODES } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'
import topics from '../src/data/curriculum/cbse/2026-27/chapter-topics.json' with { type: 'json' }
import sources from '../src/data/curriculum/cbse/2026-27/chapter-topic-sources.json' with { type: 'json' }
import { normalizeQuizRequest } from '../server/quizGeneration.js'

const nodes = [...CBSE_2026_27_XI_NODES, ...CBSE_2026_27_XII_NODES]

test('all current chapters and leaf units have study topics in their own subject', () => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  assert.equal(byId.size, nodes.length)
  for (const node of nodes.filter((n) => ['chapter', 'unit'].includes(n.nodeType))) {
    const children = nodes.filter((n) => n.parentId === node.id)
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

test('Class XII AI uses the eight current CBSE units and preserves practical labels', () => {
  const units = CBSE_2026_27_XII_NODES.filter((n) => n.subjectId.endsWith('-843') && n.nodeType === 'unit')
  assert.equal(units.length, 8)
  assert.ok(units.some((n) => n.title === 'Generative AI'))
  assert.ok(units.some((n) => n.title === 'Making Machines See'))
  assert.equal(units.filter((n) => n.title.includes('practical assessment')).length, 2)
})
