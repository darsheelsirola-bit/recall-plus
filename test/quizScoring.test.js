import assert from 'node:assert/strict'
import test from 'node:test'
import { handleQuizGeneration } from '../server/apiHandlers.js'
import { normalizeQuizSubmission, scoreQuizSubmission } from '../server/quizScoring.js'
import {
  QUIZ_VERIFICATION_VERSION,
  publicQuizQuestions,
  validatePublicQuizQuestions,
} from '../shared/quizValidation.js'

const QUIZ_ID = '00000000-0000-4000-8000-000000000701'

function verifiedQuestions() {
  return ['a', 'b', 'c', 'd', 'e'].map((suffix, index) => ({
    id: `q-${suffix}`,
    difficulty: index < 2 ? 'easy' : index < 4 ? 'medium' : 'hard',
    question: `Question ${suffix}?`,
    options: [`${suffix}-1`, `${suffix}-2`, `${suffix}-3`, `${suffix}-4`],
    answer: `${suffix}-2`,
    explanation: `Explanation ${suffix}`,
    verification: QUIZ_VERIFICATION_VERSION,
  }))
}

function fakeAdmin(questions) {
  const state = { submission: null }
  return {
    state,
    from(table) {
      if (table === 'generation_attempts') {
        return {
          select() { return this },
          eq() { return this },
          async maybeSingle() {
            return { data: { result: { questions } }, error: null }
          },
        }
      }
      if (table === 'quiz_submissions') {
        return {
          select() { return this },
          eq() { return this },
          async maybeSingle() {
            return { data: state.submission, error: null }
          },
          async insert(row) {
            if (state.submission) return { error: { code: '23505' } }
            state.submission = row
            return { error: null }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function mockResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('public generated questions never contain answers, explanations, or verification metadata', async () => {
  const questions = verifiedQuestions()
  const body = {
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    chapterNodeIds: ['physics-motion'],
    topicNodeIds: ['physics-velocity'],
    count: 5,
    level: 'mixed',
  }
  const response = mockResponse()
  await handleQuizGeneration({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      'idempotency-key': QUIZ_ID,
    },
    body,
  }, response, {
    authenticatedUser: async () => ({ id: 'user-1', accessToken: 'token' }),
    authorizeQuizRequest: async () => ({ count: 5 }),
    runLimitedGeneration: async () => ({
      result: { questions },
      usage: { remaining: 9, limit: 10, resetAt: 'tomorrow', localDate: '2026-08-17' },
    }),
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body.quizId, QUIZ_ID)
  assert.equal(validatePublicQuizQuestions(response.body.questions, 5), true)
  assert.deepEqual(response.body.questions, publicQuizQuestions(questions))
  assert.equal(JSON.stringify(response.body).includes('Explanation'), false)
  assert.equal(JSON.stringify(response.body).includes('"answer"'), false)
})

test('server scoring accepts one complete answer map and safely replays identical retries', async () => {
  const questions = verifiedQuestions()
  const admin = fakeAdmin(questions)
  const answers = Object.fromEntries(questions.map((question, index) => [
    question.id,
    index === 4 ? null : question.answer,
  ]))
  const input = normalizeQuizSubmission({ quizId: QUIZ_ID, answers })

  const first = await scoreQuizSubmission('user-1', input, { admin })
  const replay = await scoreQuizSubmission('user-1', input, { admin })
  assert.equal(first.score, 4)
  assert.equal(first.totalQuestions, 5)
  assert.equal(first.percentage, 80)
  assert.equal(first.replay, false)
  assert.equal(replay.replay, true)
  assert.equal(first.questions[4].selectedAnswer, null)
  assert.equal(first.questions[4].correct, false)
})

test('server scoring rejects changed answers after the first submission', async () => {
  const questions = verifiedQuestions()
  const admin = fakeAdmin(questions)
  const firstAnswers = Object.fromEntries(questions.map((question) => [question.id, question.answer]))
  const changedAnswers = { ...firstAnswers, [questions[0].id]: questions[0].options[0] }

  await scoreQuizSubmission('user-1', normalizeQuizSubmission({
    quizId: QUIZ_ID,
    answers: firstAnswers,
  }), { admin })
  await assert.rejects(
    scoreQuizSubmission('user-1', normalizeQuizSubmission({
      quizId: QUIZ_ID,
      answers: changedAnswers,
    }), { admin }),
    (error) => error.code === 'QUIZ_ALREADY_SUBMITTED' && error.statusCode === 409,
  )
})

test('quiz submission validation rejects extra fields and invalid answer shapes', () => {
  assert.equal(normalizeQuizSubmission({ quizId: QUIZ_ID, answers: {}, userId: 'attacker' }), null)
  assert.equal(normalizeQuizSubmission({ quizId: 'not-a-uuid', answers: { q: 'a' } }), null)
  assert.equal(normalizeQuizSubmission({ quizId: QUIZ_ID, answers: { q: {} } }), null)
})
