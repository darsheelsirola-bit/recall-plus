import { requestQuiz, validateRequest as validateQuizRequest } from './groq.js'
import { requestInsights, validateInsightsRequest } from './insights.js'
import { requestTimetable } from './timetable.js'
import { validateTimetableProfile } from '../shared/timetableValidation.js'
import { AppError, ERROR_CODES } from './errors.js'
import {
  GENERATION_FEATURES,
  createGenerationRequestHash,
  getGenerationStatus,
  getIdempotencyKey,
  publicUsage,
  runLimitedGeneration,
} from './generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from './http.js'
import { isSupabaseConfigured, verifySupabaseUser } from './supabase.js'

async function authenticatedUser(request) {
  return verifySupabaseUser(request)
}

export function handleAiStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)
  return response.status(200).json({
    configured: Boolean(process.env.GROQ_QUIZ_API_KEY && process.env.GROQ_TIMETABLE_API_KEY),
    quizConfigured: Boolean(process.env.GROQ_QUIZ_API_KEY),
    timetableConfigured: Boolean(process.env.GROQ_TIMETABLE_API_KEY),
    rateLimitConfigured: isSupabaseConfigured(),
    provider: 'Groq',
  })
}

export async function handleGenerationStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)

  try {
    const user = await authenticatedUser(request)
    const state = await getGenerationStatus(user.id)
    return response.status(200).json({
      quiz: publicUsage(state.quiz),
      timetable: publicUsage(state.timetable),
    })
  } catch (error) {
    return sendError(response, error)
  }
}

export async function handleQuizGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const user = await authenticatedUser(request)
    if (!validateQuizRequest(request.body)) {
      throw new AppError('Please choose a valid subject, chapter, and topic.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }

    const requestId = getIdempotencyKey(request)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.QUIZ, {
      subject: request.body.subject,
      chapter: request.body.chapter,
      topic: request.body.topic,
      count: Number(request.body.count),
      level: request.body.level ?? 'mixed',
    })
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await runLimitedGeneration({
      userId: user.id,
      feature: GENERATION_FEATURES.QUIZ,
      requestId,
      requestHash,
      generate: async () => ({ questions: await requestQuiz(request.body) }),
    })
    return response.status(200).json({
      ...limited.result,
      remaining: limited.usage.remaining,
      limit: limited.usage.limit,
      resetAt: limited.usage.resetAt,
      localDate: limited.usage.localDate,
    })
  } catch (error) {
    return sendError(response, error)
  }
}

export async function handleTimetableGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const user = await authenticatedUser(request)
    const profile = request.body?.profile
    if (!validateTimetableProfile(profile)) {
      throw new AppError('Please submit a complete daily routine first.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }

    const requestId = getIdempotencyKey(request)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.TIMETABLE, profile)
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await runLimitedGeneration({
      userId: user.id,
      feature: GENERATION_FEATURES.TIMETABLE,
      requestId,
      requestHash,
      generate: () => requestTimetable(profile),
    })
    return response.status(200).json({
      ...limited.result,
      remaining: limited.usage.remaining,
      limit: limited.usage.limit,
      resetAt: limited.usage.resetAt,
      localDate: limited.usage.localDate,
    })
  } catch (error) {
    return sendError(response, error)
  }
}

export async function handleInsightGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    await authenticatedUser(request)
    if (!validateInsightsRequest(request.body)) {
      throw new AppError('Please provide valid chapter context for insights.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    const data = await requestInsights(request.body.chapterContexts)
    return response.status(200).json(data)
  } catch (error) {
    return sendError(response, error)
  }
}
