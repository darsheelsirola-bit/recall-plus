const DEFAULT_TIMEOUT_MS = 20_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 30_000

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
export async function fetchGroq(input, init) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), configuredTimeout())

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('Groq took too long to respond. Please try again.')
      timeoutError.code = 'GROQ_TIMEOUT'
      timeoutError.statusCode = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
