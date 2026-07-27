import { normalizeQuizRequest, requestQuiz } from './groq.js'
import { normalizeInsightsRequest, requestInsights } from './insights.js'
import { requestTimetable } from './timetable.js'
import { normalizeTimetableProfile } from '../shared/timetableValidation.js'
import { AppError, ERROR_CODES } from './errors.js'
import {
  GENERATION_FEATURES,
  createGenerationRequestHash,
  getGenerationStatus,
  getIdempotencyKey,
  publicUsage,
  runLimitedGeneration,
  runLimitedInsightGeneration,
} from './generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from './http.js'
import { isSupabaseConfigured, verifySupabaseUser } from './supabase.js'
import { hasOnlyKeys, readBoundedJsonBody } from './requestValidation.js'

async function authenticatedUser(request) {
  return verifySupabaseUser(request)
}

function injected(operations, name, fallback) {
  return operations?.[name] ?? fallback
}

export function handleAiStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)
  return response.status(200).json({
    configured: Boolean(
      process.env.GROQ_QUIZ_API_KEY
      && process.env.GROQ_TIMETABLE_API_KEY
      && isSupabaseConfigured()
    ),
    provider: 'Groq',
  })
}

export async function handleGenerationStatus(request, response, operations = {}) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)

  try {
    const user = await injected(operations, 'authenticatedUser', authenticatedUser)(request)
    const state = await injected(operations, 'getGenerationStatus', getGenerationStatus)(user.id)
    return response.status(200).json({
      quiz: publicUsage(state.quiz),
      timetable: publicUsage(state.timetable),
    })
  } catch (error) {
    return sendError(response, error)
  }
}

export async function handleQuizGeneration(request, response, operations = {}) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await injected(operations, 'authenticatedUser', authenticatedUser)(request)
    const input = normalizeQuizRequest(body)
    if (!input) {
      throw new AppError('Please choose a valid subject, chapter, and topic.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }

    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.QUIZ, input)
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await injected(
      operations,
      'runLimitedGeneration',
      runLimitedGeneration,
    )({
      userId: user.id,
      feature: GENERATION_FEATURES.QUIZ,
      requestId,
      requestHash,
      generate: async () => ({
        questions: await injected(operations, 'requestQuiz', requestQuiz)(input),
      }),
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

export async function handleTimetableGeneration(request, response, operations = {}) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await injected(operations, 'authenticatedUser', authenticatedUser)(request)
    const profile = hasOnlyKeys(body, ['profile', 'requestId'])
      ? normalizeTimetableProfile(body.profile)
      : null
    if (!profile) {
      throw new AppError('Please submit a complete daily routine first.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }

    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.TIMETABLE, profile)
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await injected(
      operations,
      'runLimitedGeneration',
      runLimitedGeneration,
    )({
      userId: user.id,
      feature: GENERATION_FEATURES.TIMETABLE,
      requestId,
      requestHash,
      generate: () => injected(operations, 'requestTimetable', requestTimetable)(profile),
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

export async function handleInsightGeneration(request, response, operations = {}) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await injected(operations, 'authenticatedUser', authenticatedUser)(request)
    const input = normalizeInsightsRequest(body)
    if (!input) {
      throw new AppError('Please provide valid chapter context for insights.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(
      GENERATION_FEATURES.INSIGHTS,
      input,
    )
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await injected(
      operations,
      'runLimitedInsightGeneration',
      runLimitedInsightGeneration,
    )({
      userId: user.id,
      requestId,
      requestHash,
      generate: () => injected(operations, 'requestInsights', requestInsights)(
        input.chapterContexts,
      ),
    })
    response.setHeader('X-Idempotent-Replay', limited.replay ? 'true' : 'false')
    return response.status(200).json(limited.result)
  } catch (error) {
    return sendError(response, error)
  }
}
