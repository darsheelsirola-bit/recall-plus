export const DAILY_GENERATION_LIMIT = 10
export const GENERATION_FEATURES = Object.freeze(['quiz', 'timetable'])
export const LIMIT_REACHED_MESSAGE = "You have reached today’s limit of 10 generations. Try again tomorrow."

/**
 * @typedef {'quiz' | 'timetable'} GenerationFeature
 */

/**
 * @typedef {'allowed' | 'daily_limit' | 'in_progress' | 'replay' | 'released' | 'status'} GenerationLimitReason
 */

/**
 * Database-backed generation-limit state returned by the RPC adapter.
 *
 * `remaining` is based only on completed successful generations. An active
 * reservation is represented separately by `inProgress`, so a failed request
 * never appears to consume a successful generation.
 *
 * @typedef {object} GenerationLimitStatus
 * @property {boolean} allowed
 * @property {string | null} reservationId
 * @property {number} remaining
 * @property {number} limit
 * @property {string} resetAt
 * @property {string} localDate
 * @property {boolean} inProgress
 * @property {GenerationLimitReason} reason
 * @property {boolean} replay
 * @property {unknown} [result]
 */

/**
 * Storage adapter implemented by the authenticated server/Supabase layer.
 *
 * @typedef {object} GenerationLimitStore
 * @property {(input: {
 *   userId: string,
 *   feature: GenerationFeature,
 *   requestId: string,
 * }) => Promise<GenerationLimitStatus>} reserve
 * @property {(input: {
 *   userId: string,
 *   feature: GenerationFeature,
 *   requestId: string,
 *   result: unknown,
 * }) => Promise<GenerationLimitStatus>} commit
 * @property {(input: {
 *   userId: string,
 *   feature: GenerationFeature,
 *   requestId: string,
 *   errorCode: string,
 * }) => Promise<GenerationLimitStatus>} release
 */

export class GenerationLimitError extends Error {
  /**
   * @param {string} message
   * @param {{
   *   code: 'DAILY_GENERATION_LIMIT' | 'GENERATION_IN_PROGRESS' | 'GENERATION_LIMIT_UNAVAILABLE',
   *   statusCode: number,
   *   limitStatus?: GenerationLimitStatus,
   *   cause?: unknown,
   * }} options
   */
  constructor(message, { code, statusCode, limitStatus, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'GenerationLimitError'
    this.code = code
    this.statusCode = statusCode
    this.limitStatus = limitStatus
  }
}

/**
 * @param {unknown} feature
 * @returns {asserts feature is GenerationFeature}
 */
export function assertGenerationFeature(feature) {
  if (!GENERATION_FEATURES.includes(feature)) {
    throw new TypeError(`Unsupported generation feature: ${String(feature)}`)
  }
}

/**
 * Runs the existing generation function behind a reservation/commit protocol.
 *
 * The reservation happens before `generate`, while completion happens only
 * after `validate` accepts the output. Any provider or validation failure
 * releases the reservation and leaves the successful-generation count intact.
 *
 * @template T
 * @param {{
 *   store: GenerationLimitStore,
 *   userId: string,
 *   feature: GenerationFeature,
 *   requestId: string,
 *   generate: () => Promise<T>,
 *   validate?: (result: T) => boolean | Promise<boolean>,
 * }} input
 * @returns {Promise<{data: T, limit: GenerationLimitStatus}>}
 */
export async function runLimitedGeneration({
  store,
  userId,
  feature,
  requestId,
  generate,
  validate = () => true,
}) {
  assertGenerationFeature(feature)
  if (!store || typeof store.reserve !== 'function' || typeof store.commit !== 'function' || typeof store.release !== 'function') {
    throw new TypeError('A complete generation-limit store is required.')
  }
  if (typeof userId !== 'string' || !userId) throw new TypeError('A verified user id is required.')
  if (typeof requestId !== 'string' || !requestId) throw new TypeError('A request id is required.')
  if (typeof generate !== 'function' || typeof validate !== 'function') {
    throw new TypeError('Generation and validation functions are required.')
  }

  let reservation
  try {
    reservation = await store.reserve({ userId, feature, requestId })
  } catch (error) {
    throw new GenerationLimitError('Generation limits are temporarily unavailable. Please try again.', {
      code: 'GENERATION_LIMIT_UNAVAILABLE',
      statusCode: 503,
      cause: error,
    })
  }

  if (reservation.replay) {
    return { data: /** @type {T} */ (reservation.result), limit: reservation }
  }
  if (!reservation.allowed) {
    if (reservation.reason === 'daily_limit' || reservation.remaining <= 0) {
      throw new GenerationLimitError(LIMIT_REACHED_MESSAGE, {
        code: 'DAILY_GENERATION_LIMIT',
        statusCode: 429,
        limitStatus: reservation,
      })
    }
    throw new GenerationLimitError('A generation is already in progress. Please wait for it to finish.', {
      code: 'GENERATION_IN_PROGRESS',
      statusCode: 409,
      limitStatus: reservation,
    })
  }

  let completed = false
  try {
    const data = await generate()
    if (!await validate(data)) {
      const validationError = new Error('The generated result did not pass validation. Please try again.')
      validationError.code = 'INVALID_GENERATION_OUTPUT'
      throw validationError
    }

    const completion = await store.commit({ userId, feature, requestId, result: data })
    completed = true
    return {
      data: /** @type {T} */ (completion.result === undefined ? data : completion.result),
      limit: completion,
    }
  } catch (error) {
    if (!completed) {
      // Releasing is best-effort. A database-backed lease also recovers a slot
      // if the process terminates or the release RPC cannot be reached.
      await store.release({
        userId,
        feature,
        requestId,
        errorCode: typeof error?.code === 'string' ? error.code : 'GENERATION_FAILED',
      }).catch(() => {})
    }
    throw error
  }
}

/**
 * Creates a synchronous single-flight guard. React state updates are
 * asynchronous, so checking only `loading` does not prevent two click handlers
 * in the same event turn from starting two requests.
 */
export function createSingleFlight() {
  /** @type {Map<string, Promise<unknown>>} */
  const active = new Map()

  return {
    /**
     * @template T
     * @param {string} key
     * @param {() => Promise<T>} task
     * @returns {Promise<T>}
     */
    run(key, task) {
      if (active.has(key)) return /** @type {Promise<T>} */ (active.get(key))
      const promise = Promise.resolve()
        .then(task)
        .finally(() => {
          if (active.get(key) === promise) active.delete(key)
        })
      active.set(key, promise)
      return promise
    },

    /** @param {string} key */
    isRunning(key) {
      return active.has(key)
    },
  }
}
