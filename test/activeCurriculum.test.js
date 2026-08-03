import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeSubjectNameSet,
  buildActiveSyllabus,
  curriculumRequestSelection,
  filterActiveSubjectRecords,
  isActiveSubjectRecord,
  mergeActiveRecordUpdates,
} from '../src/academic/activeCurriculumData.js'
import { CBSE_2026_27_XI_SUBJECTS_BY_CODE } from '../src/data/curriculum/index.ts'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'

function selection(code, position) {
  const subject = CBSE_2026_27_XI_SUBJECTS_BY_CODE.get(code)
  assert.ok(subject, `Missing test subject ${code}`)
  return {
    curriculumSubjectId: subject.id,
    subjectPosition: position,
    selectionType: position === 6 ? 'additional' : 'main',
    subject,
  }
}

test('active syllabus preserves the selected PCB combination and excludes Mathematics', () => {
  const selected = [
    selection('301', 1),
    selection('042', 2),
    selection('043', 3),
    selection('044', 4),
    selection('048', 5),
  ]
  const syllabus = buildActiveSyllabus(selected, CBSE_2026_27_XI_NODES)

  assert.deepEqual(
    syllabus.map((item) => item.subject),
    ['English Core', 'Physics', 'Chemistry', 'Biology', 'Physical Education'],
  )
  assert.equal(syllabus.some((item) => item.subject === 'Mathematics'), false)
  assert.ok(syllabus.find((item) => item.subject === 'Biology')?.chapters.length)
})

test('quiz selections resolve to stable subject, chapter, and topic node IDs', () => {
  const syllabus = buildActiveSyllabus([
    selection('301', 1),
    selection('042', 2),
    selection('043', 3),
    selection('041', 4),
    selection('083', 5),
  ], CBSE_2026_27_XI_NODES)
  const physics = syllabus.find((item) => item.subject === 'Physics')
  const chapter = physics.chapters.find((item) => item.topicNodes.length)
  const topic = chapter.topicNodes[0]
  const resolved = curriculumRequestSelection(
    syllabus,
    physics.subject,
    [chapter.name],
    [topic.name],
  )

  assert.equal(resolved.curriculumSubjectId, physics.subjectId)
  assert.deepEqual(resolved.chapterNodeIds, [chapter.id])
  assert.deepEqual(resolved.topicNodeIds, [topic.id])
  assert.equal(curriculumRequestSelection(syllabus, 'History', [chapter.name], [topic.name]), null)
})

test('active subject filters exclude removed subjects without deleting history', () => {
  const selected = [
    selection('301', 1),
    selection('027', 2),
    selection('028', 3),
    selection('037', 4),
    selection('039', 5),
  ]
  const activeNames = activeSubjectNameSet(selected)
  const history = [
    { id: 'active', subject: 'History' },
    { id: 'archived', subject: 'Physics' },
  ]

  const activeIds = new Set(selected.map((item) => item.curriculumSubjectId))
  assert.deepEqual(filterActiveSubjectRecords(history, activeNames, activeIds), [
    { id: 'active', subject: 'History' },
  ])
  assert.equal(isActiveSubjectRecord({
    id: 'mislabeled',
    curriculumSubjectId: selected[1].curriculumSubjectId,
    subject: 'Physics',
  }, activeNames, activeIds), true)
  assert.equal(isActiveSubjectRecord({
    id: 'stale-id',
    curriculumSubjectId: selection('042', 2).curriculumSubjectId,
    subject: 'History',
  }, activeNames, activeIds), false)
  assert.equal(history.length, 2)
})

test('active updates preserve archived history and remove only active records omitted by the update', () => {
  const existing = [
    { id: 'active-keep', subject: 'History', value: 1 },
    { id: 'active-remove', subject: 'Psychology', value: 1 },
    { id: 'archived', subject: 'Physics', value: 1 },
  ]
  const nextActive = [
    { id: 'new-active', subject: 'Sociology', value: 1 },
    { id: 'active-keep', subject: 'History', value: 2 },
  ]
  const activeNames = new Set(['History', 'Psychology', 'Sociology'])

  assert.deepEqual(
    mergeActiveRecordUpdates(existing, nextActive, (record) => activeNames.has(record.subject)),
    [
      { id: 'new-active', subject: 'Sociology', value: 1 },
      { id: 'active-keep', subject: 'History', value: 2 },
      { id: 'archived', subject: 'Physics', value: 1 },
    ],
  )
})
