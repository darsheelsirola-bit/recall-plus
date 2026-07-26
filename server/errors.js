export const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMIT_UNAVAILABLE: 'RATE_LIMIT_UNAVAILABLE',
  DAILY_GENERATION_LIMIT: 'DAILY_GENERATION_LIMIT',
  GENERATION_IN_PROGRESS: 'GENERATION_IN_PROGRESS',
  GENERATION_REPLAY_INVALID: 'GENERATION_REPLAY_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

/**
 * An application error whose public response is deliberately separated from
 * the underlying cause. Supabase and provider errors may contain operational
 * details that must not be returned to the browser.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   code?: string,
   *   statusCode?: number,
   *   cause?: unknown,
   *   details?: Record<string, unknown> | null,
   * }} [options]
   */
  constructor(message, {
    code = ERROR_CODES.INTERNAL_ERROR,
    statusCode = 500,
    cause,
    details = null,
  } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

/**
 * Preserve the existing public generator errors while preventing unexpected
 * implementation failures from leaking stack traces or database details.
 *
 * @param {unknown} error
 * @returns {AppError}
 */
export function toAppError(error) {
  if (error instanceof AppError) return error

  if (error instanceof Error && Number.isInteger(error.statusCode)) {
    return new AppError(error.message || 'The generation request failed.', {
      code: typeof error.code === 'string' ? error.code : ERROR_CODES.INTERNAL_ERROR,
      statusCode: error.statusCode,
      cause: error,
    })
  }

  return new AppError('Something went wrong while processing this request.', {
    cause: error,
  })
}
