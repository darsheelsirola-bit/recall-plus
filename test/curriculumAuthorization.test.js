import test from 'node:test'
import assert from 'node:assert/strict'
import {
  authorizeInsightsFromWorkspace,
  authorizeQuizFromWorkspace,
  authorizeTimetableFromWorkspace,
  loadAuthorizedCurriculum,
} from '../server/curriculumAuthorization.js'

const PHYSICS = 'cbse-2026-27-xi-042'
const CHEMISTRY = 'cbse-2026-27-xi-043'
const VERSION = 'cbse-2026-27-xi-v1'

function workspace() {
  return {
    profile: { curriculum_version_id: VERSION, onboarding_completed: true },
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

function curriculumClient(calls) {
  const activeSubjects = workspace().subjects
  const rows = {
    user_academic_profiles: {
      user_id: 'learner-1',
      curriculum_version_id: VERSION,
      onboarding_completed: true,
    },
    user_subjects: activeSubjects.map((subject) => ({
      curriculum_subject_id: subject.id,
      subject_position: subject.subjectPosition,
      selection_type: 'main',
    })),
    curriculum_subjects: activeSubjects.map((subject) => ({
      id: subject.id,
      curriculum_version_id: VERSION,
      name: subject.name,
      short_name: subject.name,
      subject_code: subject.id.slice(-3),
      active: true,
    })),
    curriculum_nodes: workspace().nodes.filter((node) => node.subject_id === PHYSICS),
  }

  return {
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      const query = {
        select() { return query },
        eq(column, value) { call.filters.push({ method: 'eq', column, value }); return query },
        is(column, value) { call.filters.push({ method: 'is', column, value }); return query },
        in(column, value) { call.filters.push({ method: 'in', column, value }); return query },
        order() { return query },
        maybeSingle() { return Promise.resolve({ data: rows[table], error: null }) },
        then(resolve, reject) {
          return Promise.resolve({ data: rows[table], error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
}

test('curriculum loading fetches nodes only for subjects required by the request', async () => {
  const calls = []
  const loaded = await loadAuthorizedCurriculum(
    { id: 'learner-1', accessToken: 'session-token' },
    { nodeSubjectIds: [PHYSICS, PHYSICS] },
    () => curriculumClient(calls),
  )

  assert.deepEqual(new Set(loaded.nodes.map((node) => node.subject_id)), new Set([PHYSICS]))
  const nodeQuery = calls.find((call) => call.table === 'curriculum_nodes')
  assert.deepEqual(
    nodeQuery.filters.find((filter) => filter.method === 'in'),
    { method: 'in', column: 'subject_id', value: [PHYSICS] },
  )
})

test('timetable curriculum loading skips curriculum nodes entirely', async () => {
  const calls = []
  const loaded = await loadAuthorizedCurriculum(
    { id: 'learner-1', accessToken: 'session-token' },
    { includeNodes: false },
    () => curriculumClient(calls),
  )

  assert.equal(loaded.nodes.length, 0)
  assert.equal(calls.some((call) => call.table === 'curriculum_nodes'), false)
})

test('curriculum loading rejects an unselected node subject before catalogue queries', async () => {
  const calls = []
  await assert.rejects(
    loadAuthorizedCurriculum(
      { id: 'learner-1', accessToken: 'session-token' },
      { nodeSubjectIds: ['cbse-2026-27-xi-027'] },
      () => curriculumClient(calls),
    ),
    (error) => error.code === 'CURRICULUM_ACCESS_DENIED' && error.statusCode === 403,
  )
  assert.equal(calls.some((call) => call.table === 'curriculum_subjects'), false)
  assert.equal(calls.some((call) => call.table === 'curriculum_nodes'), false)
})

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
  assert.equal(authorized.curriculumVersionId, VERSION)
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
  assert.equal(authorized.curriculumVersionId, VERSION)
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
  assert.equal(authorized.chapterContexts[0].curriculumVersionId, VERSION)

  assert.throws(
    () => authorizeInsightsFromWorkspace({
      chapterContexts: [{ ...base, weakTopics: [{ topic: 'Injected topic', weakestScore: 1 }] }],
    }, workspace()),
    (error) => error.code === 'CURRICULUM_ACCESS_DENIED',
  )
})
