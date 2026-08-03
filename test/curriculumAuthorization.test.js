import test from 'node:test'
import assert from 'node:assert/strict'
import {
  authorizeInsightsFromWorkspace,
  authorizeQuizFromWorkspace,
  authorizeTimetableFromWorkspace,
} from '../server/curriculumAuthorization.js'

const PHYSICS = 'cbse-2026-27-xi-042'
const CHEMISTRY = 'cbse-2026-27-xi-043'

function workspace() {
  return {
    profile: { onboarding_completed: true },
    subjects: [
      { id: 'cbse-2026-27-xi-301', name: 'English Core', subjectPosition: 1 },
      { id: PHYSICS, name: 'Physics', subjectPosition: 2 },
      { id: CHEMISTRY, name: 'Chemistry', subjectPosition: 3 },
      { id: 'cbse-2026-27-xi-041', name: 'Mathematics', subjectPosition: 4 },
      { id: 'cbse-2026-27-xi-083', name: 'Computer Science', subjectPosition: 5 },
    ],
    nodes: [
      { id: 'physics-motion', subject_id: PHYSICS, parent_id: null, node_type: 'chapter', title: 'Motion' },
      { id: 'physics-velocity', subject_id: PHYSICS, parent_id: 'physics-motion', node_type: 'topic', title: 'Velocity' },
      { id: 'physics-speed', subject_id: PHYSICS, parent_id: 'physics-motion', node_type: 'topic', title: 'Speed' },
      { id: 'chemistry-atoms', subject_id: CHEMISTRY, parent_id: null, node_type: 'chapter', title: 'Structure of Atom' },
      { id: 'chemistry-orbitals', subject_id: CHEMISTRY, parent_id: 'chemistry-atoms', node_type: 'topic', title: 'Atomic Orbitals' },
    ],
  }
}

test('quiz authorization resolves official labels only from active subject nodes', () => {
  const authorized = authorizeQuizFromWorkspace({
    curriculumSubjectId: PHYSICS,
    chapterNodeIds: ['physics-motion'],
    topicNodeIds: ['physics-velocity'],
    count: 5,
    level: 'mixed',
    purpose: 'practice',
  }, workspace())

  assert.equal(authorized.subject, 'Physics')
  assert.equal(authorized.chapter, 'Motion')
  assert.equal(authorized.topic, 'Velocity')
  assert.equal(authorized.curriculumSubjectId, PHYSICS)
})

test('quiz authorization rejects unselected subjects and cross-subject nodes', () => {
  assert.throws(
    () => authorizeQuizFromWorkspace({
      curriculumSubjectId: 'cbse-2026-27-xi-027',
      chapterNodeIds: ['history-world'],
      topicNodeIds: ['history-topic'],
    }, workspace()),
    (error) => error.code === 'CURRICULUM_ACCESS_DENIED' && error.statusCode === 403,
  )

  assert.throws(
    () => authorizeQuizFromWorkspace({
      curriculumSubjectId: PHYSICS,
      chapterNodeIds: ['physics-motion'],
      topicNodeIds: ['chemistry-orbitals'],
    }, workspace()),
    (error) => error.code === 'CURRICULUM_ACCESS_DENIED' && error.statusCode === 403,
  )
})

test('timetable authorization derives the exact active subject set', () => {
  const authorized = authorizeTimetableFromWorkspace({ wakeTime: '06:00' }, workspace())
  assert.deepEqual(
    authorized.subjects.map((subject) => subject.name),
    ['English Core', 'Physics', 'Chemistry', 'Mathematics', 'Computer Science'],
  )
  assert.deepEqual(authorized.profile, { wakeTime: '06:00' })
})

test('insight authorization replaces browser labels and rejects unofficial evidence topics', () => {
  const base = {
    curriculumSubjectId: PHYSICS,
    chapterNodeId: 'physics-motion',
    topicNodeIds: ['physics-velocity', 'physics-speed'],
    subject: 'Attacker label',
    chapter: 'Attacker chapter',
    syllabusTopics: ['fabricated'],
    studiedTopics: ['Velocity'],
    unstudiedTopics: ['Speed'],
    weakTopics: [{ topic: 'Velocity', weakestScore: 40 }],
    studyMinutes: 20,
    recentNotes: [],
    missedQuestions: [],
    studySources: null,
    dueReviews: 1,
  }
  const authorized = authorizeInsightsFromWorkspace({ chapterContexts: [base] }, workspace())
  assert.equal(authorized.chapterContexts[0].subject, 'Physics')
  assert.equal(authorized.chapterContexts[0].chapter, 'Motion')
  assert.deepEqual(authorized.chapterContexts[0].syllabusTopics, ['Velocity', 'Speed'])

  assert.throws(
    () => authorizeInsightsFromWorkspace({
      chapterContexts: [{ ...base, weakTopics: [{ topic: 'Injected topic', weakestScore: 1 }] }],
    }, workspace()),
    (error) => error.code === 'CURRICULUM_ACCESS_DENIED',
  )
})
