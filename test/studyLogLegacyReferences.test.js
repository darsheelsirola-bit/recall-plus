import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateStudyLogCurriculum } from '../src/utils/studyLogCurriculumMigration.js'

test('obsolete English references migrate without losing historical study data', () => {
  const log = {
    id: 'historical-log', subject: 'English Core', book: 'Hornbill',
    curriculumSubjectId: 'cbse-2026-27-xi-301', curriculumVersionId: 'cbse-2026-27-xi-v1',
    curriculumNodeIds: ['node-cbse-2026-27-xi-301:book:03:hornbill', 'historical-chapter'],
    chapter: 'The Portrait of a Lady', topics: ['Character sketch'], date: '2026-08-10', timeSpent: 45,
  }
  const [migrated] = migrateStudyLogCurriculum([log])
  assert.deepEqual(migrated.legacyCurriculumNodeIds, log.curriculumNodeIds)
  assert.deepEqual({ ...migrated, curriculumNodeIds: log.curriculumNodeIds, legacyCurriculumNodeIds: undefined }, { ...log, legacyCurriculumNodeIds: undefined })
  assert.equal(migrated.curriculumNodeIds.length, 2)
  assert.match(migrated.curriculumNodeIds[1], /topic:01:hornbill$/)
  const stable = [migrated]
  assert.equal(migrateStudyLogCurriculum(stable), stable)
  const other = [{ ...log, curriculumSubjectId: 'cbse-2026-27-xi-041' }]
  assert.equal(migrateStudyLogCurriculum(other), other)
})
