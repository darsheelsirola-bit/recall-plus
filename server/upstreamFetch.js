import { AppError, ERROR_CODES } from './errors.js'

const DEFAULT_TIMEOUT_MS = 20_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 30_000
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024
const MAX_RETRY_DELAY_MS = 1_500
const providerResponseGuards = new WeakMap()

export const MAX_PROVIDER_ATTEMPTS = 3
export const PROVIDER_TOTAL_DEADLINE_MS = 45_000

function configuredTimeout() {
  const requested = Number(process.env.GROQ_REQUEST_TIMEOUT_MS)
  if (!Number.isFinite(requested)) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(requested)))
}

/**
 * Bound each provider attempt so an abandoned function cannot hold a quota
 * reservation indefinitely. The database lease is longer than the maximum
 * complete retry sequence.
 *
 * @param {string | URL} input
 * @param {RequestInit} init
 */
function providerUnavailable(message, {
  cause,
  statusCode = 503,
  upstreamStatus,
  retryAfterMs,
} = {}) {
  const error = new AppError(message, {
    code: ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
    statusCode,
    cause,
    details: { retryable: true },
  })
  error.upstreamStatus = upstreamStatus
  error.retryAfterMs = retryAfterMs
  return error
}

function retryAfterMilliseconds(response) {
  const raw = response.headers?.get?.('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000)
  const date = Date.parse(raw)
  return Number.isFinite(date)
    ? Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()))
    : null
}

function releaseProviderResponse(response) {
  const guard = response && providerResponseGuards.get(response)
  if (!guard) return
  clearTimeout(guard.timeoutId)
  providerResponseGuards.delete(response)
}

/**
 * Convert an upstream status into a stable, public-safe application error.
 * Provider bodies are intentionally not read here.
 */
export function providerHttpError(response) {
  const status = Number(response?.status)
  const rateLimited = status === 429
  const error = providerUnavailable(
    rateLimited
      ? 'The AI service is busy right now. Please try again shortly.'
      : 'The AI service is temporarily unavailable. Please try again.',
    {
      statusCode: status >= 500 || status === 401 || status === 403 || rateLimited ? 503 : 502,
      upstreamStatus: status,
      retryAfterMs: rateLimited ? retryAfterMilliseconds(response) : null,
    },
  )
  releaseProviderResponse(response)
  response?.body?.cancel?.().catch?.(() => {})
  return error
}

export function providerResponseInvalid(cause) {
  return new AppError('The AI service returned an invalid response. Please try again.', {
    code: ERROR_CODES.AI_PROVIDER_RESPONSE_INVALID,
    statusCode: 502,
    cause,
    details: { retryable: true },
  })
}

export async function readProviderJson(response, maxBytes = MAX_PROVIDER_RESPONSE_BYTES) {
  const guard = response && providerResponseGuards.get(response)
  try {
    let text = ''
    if (response.body?.getReader) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let bytesRead = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytesRead += value.byteLength
          if (bytesRead > maxBytes) {
            await reader.cancel()
            throw providerResponseInvalid()
          }
          text += decoder.decode(value, { stream: true })
        }
        text += decoder.decode()
      } finally {
        reader.releaseLock()
      }
    } else {
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > maxBytes) throw providerResponseInvalid()
      text = new TextDecoder().decode(buffer)
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      throw providerResponseInvalid(error)
    }
  } catch (error) {
    if (guard?.controller.signal.aborted) {
      throw providerUnavailable('The AI service took too long to respond. Please try again.', {
        cause: error,
        statusCode: 504,
      })
    }
    if (error instanceof AppError) throw error
    throw providerResponseInvalid(error)
  } finally {
    releaseProviderResponse(response)
  }
}

export async function waitBeforeProviderRetry(error, attemptNumber, deadlineAt) {
  const exponential = Math.min(MAX_RETRY_DELAY_MS, 250 * (2 ** Math.max(0, attemptNumber - 1)))
  const desired = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : exponential
  const remaining = deadlineAt - Date.now()
  const waitMs = Math.min(desired, Math.max(0, remaining - 100))
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
}

export async function fetchGroq(input, init, { deadlineAt = Date.now() + PROVIDER_TOTAL_DEADLINE_MS } = {}) {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) {
    throw providerUnavailable('The AI service took too long to respond. Please try again.', {
      statusCode: 504,
    })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.min(configuredTimeout(), remaining)),
  )

  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    providerResponseGuards.set(response, { controller, timeoutId })
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted) {
      throw providerUnavailable('The AI service took too long to respond. Please try again.', {
        cause: error,
        statusCode: 504,
      })
    }
    throw providerUnavailable('The AI service is temporarily unavailable. Please try again.', {
      cause: error,
    })
  }
}
