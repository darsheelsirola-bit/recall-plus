export const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_UNAVAILABLE: 'AUTH_UNAVAILABLE',
  ACADEMIC_PROFILE_REQUIRED: 'ACADEMIC_PROFILE_REQUIRED',
  CURRICULUM_ACCESS_DENIED: 'CURRICULUM_ACCESS_DENIED',
  CURRICULUM_UNAVAILABLE: 'CURRICULUM_UNAVAILABLE',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_REQUEST: 'INVALID_REQUEST',
  LENGTH_REQUIRED: 'LENGTH_REQUIRED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PAYLOAD_TOO_COMPLEX: 'PAYLOAD_TOO_COMPLEX',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT_UNAVAILABLE: 'RATE_LIMIT_UNAVAILABLE',
  DAILY_GENERATION_LIMIT: 'DAILY_GENERATION_LIMIT',
  GENERATION_ATTEMPT_LIMIT: 'GENERATION_ATTEMPT_LIMIT',
  GENERATION_IN_PROGRESS: 'GENERATION_IN_PROGRESS',
  GENERATION_REQUEST_FAILED: 'GENERATION_REQUEST_FAILED',
  GENERATION_REPLAY_INVALID: 'GENERATION_REPLAY_INVALID',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  AI_PROVIDER_RESPONSE_INVALID: 'AI_PROVIDER_RESPONSE_INVALID',
  ACCOUNT_DELETE_CONFIRMATION_REQUIRED: 'ACCOUNT_DELETE_CONFIRMATION_REQUIRED',
  ACCOUNT_DELETE_FAILED: 'ACCOUNT_DELETE_FAILED',
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
 * Only explicitly constructed AppErrors are public. In particular, an
 * upstream provider's status and message are never trusted just because an
 * Error happens to carry a statusCode property.
 *
 * @param {unknown} error
 * @returns {AppError}
 */
export function toAppError(error) {
  if (error instanceof AppError) return error

  return new AppError('Something went wrong while processing this request.', {
    cause: error,
  })
}
