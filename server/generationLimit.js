import { createHash, randomUUID } from 'node:crypto'
import { AppError, ERROR_CODES } from './errors.js'
import { getRequestHeader } from './http.js'
import { assertJsonValueWithinLimits } from './requestValidation.js'
import { getSupabaseAdminClient } from './supabase.js'

export const DAILY_GENERATION_LIMIT = 10
export const GENERATION_FEATURES = Object.freeze({
  QUIZ: 'quiz',
  TIMETABLE: 'timetable',
  INSIGHTS: 'insights',
})
const SUCCESS_LIMITED_FEATURES = new Set([
  GENERATION_FEATURES.QUIZ,
  GENERATION_FEATURES.TIMETABLE,
])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const LIMIT_MESSAGE = 'You have reached today\u2019s limit of 10 generations. Try again tomorrow.'

/**
 * @typedef {{
 *   allowed: boolean,
 *   reservationId: string | null,
 *   remaining: number,
 *   used: number,
 *   limit: number,
 *   resetAt: string | null,
 *   localDate: string | null,
 *   inProgress: boolean,
 *   reason: string,
 *   replay: boolean,
 *   result: unknown,
 * }} GenerationLimitState
 */

function requireFeature(feature) {
  if (!Object.values(GENERATION_FEATURES).includes(feature)) {
    throw new AppError('Unknown generation feature.', {
      code: ERROR_CODES.INVALID_REQUEST,
      statusCode: 400,
    })
  }
  return feature
}

function requireSuccessLimitedFeature(feature) {
  requireFeature(feature)
  if (!SUCCESS_LIMITED_FEATURES.has(feature)) {
    throw new AppError('Unknown success-limited generation feature.', {
      code: ERROR_CODES.INVALID_REQUEST,
      statusCode: 400,
    })
  }
  return feature
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`

  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
  return `{${entries.join(',')}}`
}

export function createGenerationRequestHash(feature, payload) {
  requireFeature(feature)
  assertJsonValueWithinLimits(payload, {
    maxBytes: 64 * 1024,
    maxDepth: 8,
    maxNodes: 2_000,
  })
  return createHash('sha256')
    .update(stableJson({ feature, payload }))
    .digest('hex')
}

/**
 * @param {unknown} value
 */
function normalizeRpcPayload(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

/**
 * @param {unknown} value
 * @returns {GenerationLimitState}
 */
function normalizeState(value) {
  const data = normalizeRpcPayload(value)
  if (!data) {
    throw new AppError('Generation limits returned an invalid response.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }

  const remaining = Number(data.remaining)
  const limit = Number(data.limit)
  if (!Number.isInteger(remaining) || !Number.isInteger(limit) || limit <= 0) {
    throw new AppError('Generation limits returned an invalid response.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }

  return {
    allowed: data.allowed === true,
    reservationId: typeof data.reservationId === 'string' ? data.reservationId : null,
    remaining: Math.max(0, remaining),
    used: Number.isInteger(Number(data.used))
      ? Math.max(0, Number(data.used))
      : Math.max(0, limit - remaining),
    limit,
    resetAt: typeof data.resetAt === 'string' ? data.resetAt : null,
    localDate: typeof data.localDate === 'string' ? data.localDate : null,
    inProgress: data.inProgress === true,
    reason: typeof data.reason === 'string' ? data.reason : 'unknown',
    replay: data.replay === true,
    result: data.result ?? null,
  }
}

async function callLimitRpc(name, args) {
  let response
  try {
    response = await getSupabaseAdminClient().rpc(name, args)
  } catch (error) {
    throw new AppError('Could not verify your generation limit. Please try again.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      cause: error,
      details: { retryable: true },
    })
  }

  if (response.error) {
    throw mapLimiterRpcError(response.error)
  }

  return normalizeRpcPayload(response.data)
}

export function mapLimiterRpcError(error) {
  if (
    error?.code === '23505'
    && (
      error?.message === 'Request id is already owned by another generation.'
      || error?.message === 'Request id is already bound to a different request payload.'
    )
  ) {
    return new AppError('This generation request key is already bound to another request.', {
      code: ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
      statusCode: 409,
      cause: error,
    })
  }
  if (
    error?.code === 'P0001'
    && error?.message === 'GENERATION_ATTEMPT_LIMIT'
  ) {
    let detail
    try {
      detail = typeof error.details === 'string'
        ? JSON.parse(error.details)
        : error.details
    } catch {
      detail = null
    }
    const safeDetails = detail && typeof detail === 'object'
      ? {
        retryAt: typeof detail.retryAt === 'string' ? detail.retryAt : undefined,
        attemptLimit: Number.isInteger(Number(detail.attemptLimit))
          ? Number(detail.attemptLimit)
          : undefined,
        attemptWindowSeconds: Number.isInteger(Number(detail.attemptWindowSeconds))
          ? Number(detail.attemptWindowSeconds)
          : undefined,
      }
      : null
    return new AppError('Too many AI generation attempts. Please wait a few minutes and try again.', {
      code: ERROR_CODES.GENERATION_ATTEMPT_LIMIT,
      statusCode: 429,
      cause: error,
      details: safeDetails,
    })
  }
  return new AppError('Could not verify your generation limit. Please try again.', {
    code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
    statusCode: 503,
    cause: error,
    details: { retryable: true },
  })
}

/**
 * A client-provided UUID makes retries recoverable. For older clients that do
 * not yet send one, a server UUID still keeps the database protocol valid.
 *
 * @param {import('node:http').IncomingMessage | any} request
 * @param {Record<string, unknown>} [body]
 */
export function getIdempotencyKey(request, body = request.body) {
  const supplied = getRequestHeader(request, 'idempotency-key')
    || getRequestHeader(request, 'x-idempotency-key')
    || body?.requestId
  if (supplied == null || supplied === '') return randomUUID()

  const value = String(supplied).trim()
  if (!UUID_PATTERN.test(value)) {
    throw new AppError('The idempotency key must be a valid UUID.', {
      code: ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
      statusCode: 400,
    })
  }
  return value
}

/**
 * @param {string} userId
 */
export async function getGenerationStatus(userId) {
  const data = await callLimitRpc('get_generation_status', {
    p_user_id: userId,
  })
  if (!data?.quiz || !data?.timetable) {
    throw new AppError('Generation limits returned an invalid response.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }
  return {
    quiz: normalizeState(data.quiz),
    timetable: normalizeState(data.timetable),
  }
}

async function reserveGeneration(userId, feature, requestId, requestHash) {
  if (!SHA256_PATTERN.test(requestHash)) {
    throw new AppError('The generation request fingerprint is invalid.', {
      code: ERROR_CODES.INVALID_REQUEST,
      statusCode: 400,
    })
  }
  const data = await callLimitRpc('reserve_generation', {
    p_user_id: userId,
    p_feature: requireSuccessLimitedFeature(feature),
    p_request_id: requestId,
    p_request_hash: requestHash,
  })
  return normalizeState(data)
}

async function commitGeneration(userId, feature, requestId, result) {
  const data = await callLimitRpc('commit_generation', {
    p_user_id: userId,
    p_feature: requireSuccessLimitedFeature(feature),
    p_request_id: requestId,
    p_result: result,
  })
  return normalizeState(data)
}

async function releaseGeneration(userId, feature, requestId, errorCode) {
  const data = await callLimitRpc('release_generation', {
    p_user_id: userId,
    p_feature: requireSuccessLimitedFeature(feature),
    p_request_id: requestId,
    p_error_code: errorCode || null,
  })
  return normalizeState(data)
}

function normalizeInsightState(value) {
  const data = normalizeRpcPayload(value)
  if (!data) {
    throw new AppError('Insight generation limits returned an invalid response.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }
  return {
    allowed: data.allowed === true,
    reservationId: typeof data.reservationId === 'string' ? data.reservationId : null,
    inProgress: data.inProgress === true,
    reason: typeof data.reason === 'string' ? data.reason : 'unknown',
    replay: data.replay === true,
    result: data.result ?? null,
  }
}

async function reserveInsightGeneration(userId, requestId, requestHash) {
  if (!SHA256_PATTERN.test(requestHash)) {
    throw new AppError('The generation request fingerprint is invalid.', {
      code: ERROR_CODES.INVALID_REQUEST,
      statusCode: 400,
    })
  }
  return normalizeInsightState(await callLimitRpc('reserve_insight_generation', {
    p_user_id: userId,
    p_request_id: requestId,
    p_request_hash: requestHash,
  }))
}

async function commitInsightGeneration(userId, requestId, result) {
  return normalizeInsightState(await callLimitRpc('commit_insight_generation', {
    p_user_id: userId,
    p_request_id: requestId,
    p_result: result,
  }))
}

async function releaseInsightGeneration(userId, requestId, errorCode) {
  return normalizeInsightState(await callLimitRpc('release_insight_generation', {
    p_user_id: userId,
    p_request_id: requestId,
    p_error_code: errorCode || null,
  }))
}

export function publicUsage(state) {
  return {
    remaining: state.remaining,
    used: state.used,
    limit: state.limit,
    resetAt: state.resetAt,
    localDate: state.localDate,
    inProgress: state.inProgress,
  }
}

function reservationError(state) {
  if (state.reason === 'daily_limit' || state.remaining <= 0) {
    return new AppError(LIMIT_MESSAGE, {
      code: ERROR_CODES.DAILY_GENERATION_LIMIT,
      statusCode: 429,
      details: publicUsage(state),
    })
  }

  if (state.reason === 'in_progress' || state.inProgress) {
    return new AppError('A generation is already in progress. Please wait for it to finish.', {
      code: ERROR_CODES.GENERATION_IN_PROGRESS,
      statusCode: 409,
      details: publicUsage(state),
    })
  }

  if (state.reason === 'request_failed') {
    return new AppError('The previous generation attempt failed. Please try again.', {
      code: ERROR_CODES.GENERATION_REQUEST_FAILED,
      statusCode: 409,
      details: publicUsage(state),
    })
  }

  return new AppError('Could not reserve a generation. Please try again.', {
    code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
    statusCode: 503,
    details: { retryable: true, ...publicUsage(state) },
  })
}

/**
 * Reserve before the provider call, count only after a validated result, and
 * release on provider/validation failure. The database RPCs are the atomic,
 * cross-instance authority; this function never relies on server memory.
 *
 * @template T
 * @param {{
 *   userId: string,
 *   feature: 'quiz' | 'timetable',
 *   requestId: string,
 *   requestHash: string,
 *   generate: () => Promise<T>,
 * }} options
 * @param {{
 *   reserve?: typeof reserveGeneration,
 *   commit?: typeof commitGeneration,
 *   release?: typeof releaseGeneration,
 * }} [operations]
 * @returns {Promise<{result: T, usage: ReturnType<typeof publicUsage>, replay: boolean}>}
 */
export async function runLimitedGeneration({
  userId,
  feature,
  requestId,
  requestHash,
  generate,
}, operations = {}) {
  const reserve = operations.reserve ?? reserveGeneration
  const commit = operations.commit ?? commitGeneration
  const release = operations.release ?? releaseGeneration
  const reservation = await reserve(userId, feature, requestId, requestHash)

  if (reservation.replay) {
    if (reservation.result == null) {
      throw new AppError('The saved generation result could not be recovered.', {
        code: ERROR_CODES.GENERATION_REPLAY_INVALID,
        statusCode: 503,
        details: { retryable: true, ...publicUsage(reservation) },
      })
    }
    return {
      result: /** @type {T} */ (reservation.result),
      usage: publicUsage(reservation),
      replay: true,
    }
  }

  if (!reservation.allowed) throw reservationError(reservation)

  let result
  try {
    result = await generate()
  } catch (error) {
    try {
      await release(userId, feature, requestId, error?.code || 'generation_failed')
    } catch (releaseError) {
      // The lease expires server-side. Do not mask the original generation
      // error, and never call the provider again while release is uncertain.
      console.error('Generation reservation release failed', {
        requestId,
        feature,
        code: releaseError?.code || ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      })
    }
    throw error
  }

  let completed
  try {
    completed = await commit(userId, feature, requestId, result)
  } catch {
    // Completion is idempotent. A second call resolves the ambiguous case
    // where the first database commit succeeded but its response was lost.
    try {
      completed = await commit(userId, feature, requestId, result)
    } catch (secondError) {
      throw new AppError('Your result was generated, but could not be saved safely. Please retry.', {
        code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
        statusCode: 503,
        cause: secondError,
        details: { retryable: true, requestId },
      })
    }
  }

  return {
    result,
    usage: publicUsage(completed),
    replay: false,
  }
}

/**
 * Insights have no successful-generation daily quota. They still use the
 * durable per-user attempt throttle, one-active-request lease, and a
 * content-hash replay cache so repeated dashboard loads do not call Groq.
 *
 * @template T
 * @param {{
 *   userId: string,
 *   requestId: string,
 *   requestHash: string,
 *   generate: () => Promise<T>,
 * }} options
 * @param {{
 *   reserve?: typeof reserveInsightGeneration,
 *   commit?: typeof commitInsightGeneration,
 *   release?: typeof releaseInsightGeneration,
 * }} [operations]
 */
export async function runLimitedInsightGeneration({
  userId,
  requestId,
  requestHash,
  generate,
}, operations = {}) {
  const reserve = operations.reserve ?? reserveInsightGeneration
  const commit = operations.commit ?? commitInsightGeneration
  const release = operations.release ?? releaseInsightGeneration
  const reservation = await reserve(userId, requestId, requestHash)

  if (reservation.replay) {
    if (reservation.result == null) {
      throw new AppError('The saved insight result could not be recovered.', {
        code: ERROR_CODES.GENERATION_REPLAY_INVALID,
        statusCode: 503,
        details: { retryable: true },
      })
    }
    return { result: /** @type {T} */ (reservation.result), replay: true }
  }

  if (!reservation.allowed) {
    if (reservation.reason === 'in_progress' || reservation.inProgress) {
      throw new AppError('Insight generation is already in progress. Please wait for it to finish.', {
        code: ERROR_CODES.GENERATION_IN_PROGRESS,
        statusCode: 409,
      })
    }
    if (reservation.reason === 'request_failed') {
      throw new AppError('The previous insight attempt failed. Please try again.', {
        code: ERROR_CODES.GENERATION_REQUEST_FAILED,
        statusCode: 409,
      })
    }
    throw new AppError('Could not reserve insight generation. Please try again.', {
      code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      statusCode: 503,
      details: { retryable: true },
    })
  }

  let result
  try {
    result = await generate()
  } catch (error) {
    try {
      await release(userId, requestId, error?.code || 'generation_failed')
    } catch (releaseError) {
      console.error('Insight reservation release failed', {
        requestId,
        code: releaseError?.code || ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
      })
    }
    throw error
  }

  try {
    await commit(userId, requestId, result)
  } catch {
    try {
      await commit(userId, requestId, result)
    } catch (secondError) {
      throw new AppError('Your insights were generated, but could not be cached safely. Please retry.', {
        code: ERROR_CODES.RATE_LIMIT_UNAVAILABLE,
        statusCode: 503,
        cause: secondError,
        details: { retryable: true, requestId },
      })
    }
  }

  return { result, replay: false }
}
