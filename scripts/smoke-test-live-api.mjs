import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createApp } from '../server/app.js'

// Opt-in only: exercises real provider keys, Auth, RLS and quotas using a
// disposable account. Never logs credentials or touches an existing user.
if (process.env.RECALL_LIVE_API_SMOKE !== '1') process.exit(0)
const url = process.env.SUPABASE_URL
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
const client = createClient(url, process.env.SUPABASE_ANON_KEY, options)
let userId
let server
try {
  const email = `recall-smoke-${randomUUID()}@example.com`
  const password = `Recall!${randomUUID()}Aa9`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { display_name: 'Disposable API test', timezone: 'Asia/Kolkata' } })
  assert.ifError(created.error)
  userId = created.data.user.id
  const signedIn = await client.auth.signInWithPassword({ email, password })
  assert.ifError(signedIn.error)
  assert.equal(signedIn.data.user.id, userId)
  const refreshed = await client.auth.refreshSession()
  assert.ifError(refreshed.error)
  const token = refreshed.data.session.access_token
  console.log('LIVE SMOKE: account provisioning, password sign-in and session refresh passed')
  const academic = await client.rpc('save_recall_academic_profile', {
    p_pathway: 'science', p_school_name: 'Disposable API test',
    p_selections: ['301', '042', '043', '843', '041'].map((code, index) => ({
      curriculumSubjectId: `cbse-2026-27-xi-${code}`, subjectPosition: index + 1, selectionType: 'main',
    })),
  })
  assert.ifError(academic.error)
  let base = 'https://recall-plus.vercel.app'
  if (process.env.RECALL_SMOKE_USE_PRODUCTION !== '1') {
    server = createApp().listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  }
  async function request(route, body, requestId = randomUUID()) {
    const result = await fetch(base + route, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    })
    const data = await result.json()
    assert.equal(result.status, 200, `${route}: ${result.status} ${data.code || ''} ${typeof data.error === 'string' ? data.error : ''}`)
    return data
  }
  await request('/api/generation-usage')
  const failures = []
  async function check(task, run) {
    try { await run() } catch (error) {
      failures.push(error)
      console.error(`LIVE SMOKE: ${task} failed: ${error.message}`)
    }
  }
  const quizId = randomUUID()
  const quizInput = {
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    chapterNodeIds: ['node-cbse-2026-27-xi-042:unit:01:physical-world-and-measurement'],
    topicNodeIds: ['node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:01:physical-world-and-measurement:chapter:01:units-and-measurements'],
    count: 5, level: 'easy', purpose: 'practice',
  }
  await check('practice quiz', async () => {
  const quiz = await request('/api/generate-quiz', quizInput, quizId)
  assert.equal(quiz.questions.length, 5)
  const replay = await request('/api/generate-quiz', quizInput, quizId)
  assert.deepEqual(replay.questions, quiz.questions)
  assert.equal(replay.remaining, quiz.remaining)
  console.log('LIVE SMOKE: authenticated quiz API returned 5 questions; quota and idempotent replay passed')
  })
  await check('recall quiz', async () => {
  const recall = await request('/api/generate-quiz', { ...quizInput, purpose: 'recall' })
  assert.equal(recall.questions.length, 5)
  console.log('LIVE SMOKE: separate recall key returned 5 verified recall questions')
  })
  await check('insights', async () => {
  const insights = await request('/api/generate-insights', { chapterContexts: [{
    curriculumSubjectId: quizInput.curriculumSubjectId,
    chapterNodeId: quizInput.chapterNodeIds[0], topicNodeIds: quizInput.topicNodeIds,
    subject: 'Physics', chapter: 'Physical World and Measurement',
    syllabusTopics: ['Units and Measurements'], studiedTopics: ['Units and Measurements'],
    unstudiedTopics: [], weakTopics: [], studyMinutes: 45, recentNotes: [], missedQuestions: [], dueReviews: 0,
  }] })
  assert.equal(insights.source, 'groq', 'Insights must come from the provider, not a local fallback')
  assert.equal(insights.chapters.length, 1)
  console.log('LIVE SMOKE: separate insights key returned provider-generated chapter insights')
  })
  await check('timetable', async () => {
  const timetable = await request('/api/generate-timetable', { profile: {
    wakeTime: '06:00', sleepTime: '22:00',
    school: { days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '14:00' },
    tuition: { days: [0, 2, 4], startTime: '17:00', endTime: '18:30' },
    sports: { enabled: false, sessions: [] }, mostActivePeriod: 'evening', freeTimeDescription: '',
  } })
  assert.ok(timetable.blocks.length >= 6 && timetable.blocks.length <= 10)
  console.log(`LIVE SMOKE: authenticated timetable API returned ${timetable.blocks.length} validated blocks`)
  })
  if (failures.length) throw new AggregateError(failures, `${failures.length} live API checks failed`)
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await client.auth.signOut()
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId)
    assert.ifError(removed.error)
    console.log('LIVE SMOKE: disposable account and its test data removed')
  }
}
