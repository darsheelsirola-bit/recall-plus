import { createHash } from 'node:crypto'
import { validateVerifiedQuizQuestions } from '../shared/quizValidation.js'
import { AppError, ERROR_CODES } from './errors.js'
import { getSupabaseAdminClient } from './supabase.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function scoringUnavailable(cause) {
  return new AppError('Your quiz could not be scored right now. Please try again.', {
    code: ERROR_CODES.QUIZ_SCORE_UNAVAILABLE,
    statusCode: 503,
    cause,
    details: { retryable: true },
  })
}

export function normalizeQuizSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (Object.keys(body).some((key) => !['quizId', 'answers'].includes(key))) return null
  if (typeof body.quizId !== 'string' || !UUID_PATTERN.test(body.quizId)) return null
  if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return null

  const entries = Object.entries(body.answers)
  if (entries.length < 1 || entries.length > 30) return null
  if (entries.some(([id, answer]) => (
    !id || id.length > 160 || (
      answer !== null
      && (typeof answer !== 'string' || !answer.trim() || answer.length > 1000)
    )
  ))) return null

  return {
    quizId: body.quizId.toLowerCase(),
    answers: Object.fromEntries(entries.map(([id, answer]) => [id, answer])),
  }
}

function answersHash(answers) {
  const canonical = Object.keys(answers)
    .sort()
    .map((id) => [id, answers[id]])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function reviewedResult(questions, answers) {
  const reviewedQuestions = questions.map((question) => ({
    id: question.id,
    difficulty: question.difficulty,
    question: question.question,
    options: question.options,
    selectedAnswer: answers[question.id],
    answer: question.answer,
    explanation: question.explanation,
    correct: answers[question.id] === question.answer,
  }))
  const score = reviewedQuestions.filter((question) => question.correct).length
  const totalQuestions = reviewedQuestions.length
  return {
    score,
    totalQuestions,
    percentage: Math.round((score / totalQuestions) * 100),
    questions: reviewedQuestions,
  }
}

async function existingSubmission(admin, userId, quizId) {
  const response = await admin
    .from('quiz_submissions')
    .select('answers_hash')
    .eq('request_id', quizId)
    .eq('user_id', userId)
    .maybeSingle()
  if (response.error) throw scoringUnavailable(response.error)
  return response.data
}

export async function scoreQuizSubmission(userId, input, operations = {}) {
  const admin = operations.admin ?? getSupabaseAdminClient()
  const attemptResponse = await admin
    .from('generation_attempts')
    .select('result')
    .eq('request_id', input.quizId)
    .eq('user_id', userId)
    .eq('feature', 'quiz')
    .eq('status', 'succeeded')
    .maybeSingle()
  if (attemptResponse.error) throw scoringUnavailable(attemptResponse.error)
  const questions = attemptResponse.data?.result?.questions
  if (!attemptResponse.data || !validateVerifiedQuizQuestions(questions)) {
    throw new AppError('This generated quiz is unavailable or has expired.', {
      code: ERROR_CODES.QUIZ_NOT_FOUND,
      statusCode: 404,
    })
  }

  const questionIds = questions.map((question) => String(question.id)).sort()
  const answerIds = Object.keys(input.answers).sort()
  if (
    questionIds.length !== answerIds.length
    || questionIds.some((id, index) => id !== answerIds[index])
    || questions.some((question) => (
      input.answers[question.id] !== null
      && !question.options.includes(input.answers[question.id])
    ))
  ) {
    throw new AppError('Submit exactly one valid option for every quiz question.', {
      code: ERROR_CODES.QUIZ_SUBMISSION_INVALID,
      statusCode: 400,
    })
  }

  const hash = answersHash(input.answers)
  const reviewed = reviewedResult(questions, input.answers)
  const existing = await existingSubmission(admin, userId, input.quizId)
  if (existing) {
    if (existing.answers_hash !== hash) {
      throw new AppError('This quiz has already been submitted.', {
        code: ERROR_CODES.QUIZ_ALREADY_SUBMITTED,
        statusCode: 409,
      })
    }
    return { ...reviewed, replay: true }
  }

  const insert = await admin.from('quiz_submissions').insert({
    request_id: input.quizId,
    user_id: userId,
    answers_hash: hash,
    answers: input.answers,
    score: reviewed.score,
    question_count: reviewed.totalQuestions,
  })
  if (insert.error) {
    if (insert.error.code === '23505') {
      const raced = await existingSubmission(admin, userId, input.quizId)
      if (raced?.answers_hash === hash) return { ...reviewed, replay: true }
      throw new AppError('This quiz has already been submitted.', {
        code: ERROR_CODES.QUIZ_ALREADY_SUBMITTED,
        statusCode: 409,
      })
    }
    throw scoringUnavailable(insert.error)
  }
  return { ...reviewed, replay: false }
}
