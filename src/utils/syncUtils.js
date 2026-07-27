export const SYNC_RETRY_BASE_MS = 650
export const SYNC_RETRY_MAX_MS = 30_000
export const SYNC_RETRY_LIMIT = 5

export function getSyncRetryDelay(attempt) {
  const normalizedAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.floor(attempt))
    : 0
  return Math.min(SYNC_RETRY_BASE_MS * (2 ** normalizedAttempt), SYNC_RETRY_MAX_MS)
}

export function isDataVersionConflictError(error) {
  if (!error || error.code !== 'P0001') return false
  return [error.message, error.details, error.hint]
    .some((value) => typeof value === 'string' && value.includes('USER_DATA_VERSION_CONFLICT'))
}
