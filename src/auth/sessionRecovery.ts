interface SessionUser {
  id?: string
}

interface RefreshSessionResult {
  data: {
    session?: {
      user?: SessionUser | null
    } | null
  }
  error: unknown
}

interface SessionRecoveryOptions<T> {
  expectedUserId: string
  operation: () => Promise<T>
  refreshSession: () => Promise<RefreshSessionResult>
  wait?: (milliseconds: number) => Promise<void>
}

const CLOCK_SKEW_SETTLE_MS = 1_000

function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return String(error)

  const value = error as Record<string, unknown>
  return [value.message, value.details, value.hint, value.code, errorText(value.cause)]
    .filter((part): part is string => typeof part === 'string' && Boolean(part))
    .join(' ')
}

export function isJwtIssuedAtFutureError(error: unknown): boolean {
  return /\bjwt\s+issued\s+at\s+future\b/i.test(errorText(error))
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

/**
 * PostgREST can briefly reject a newly issued Supabase access token when the
 * Auth and database clocks are settling. Keep the user on the loading screen,
 * retry once with the current token, then refresh the session and retry once.
 */
export async function runWithJwtClockSkewRecovery<T>({
  expectedUserId,
  operation,
  refreshSession,
  wait = defaultWait,
}: SessionRecoveryOptions<T>): Promise<T> {
  try {
    return await operation()
  } catch (firstError) {
    if (!isJwtIssuedAtFutureError(firstError)) throw firstError

    await wait(CLOCK_SKEW_SETTLE_MS)
    try {
      return await operation()
    } catch (secondError) {
      if (!isJwtIssuedAtFutureError(secondError)) throw secondError

      const refreshed = await refreshSession()
      const refreshedUserId = refreshed.data.session?.user?.id ?? ''
      if (refreshed.error || !refreshedUserId) {
        throw new Error('Your secure session could not be refreshed. Please sign in again.', {
          cause: refreshed.error || secondError,
        })
      }
      if (refreshedUserId !== expectedUserId) {
        throw new Error('Your signed-in account changed. Please try again.')
      }

      await wait(CLOCK_SKEW_SETTLE_MS)
      try {
        return await operation()
      } catch (finalError) {
        if (!isJwtIssuedAtFutureError(finalError)) throw finalError
        throw new Error('Your secure session is still synchronizing. Please retry in a moment.', {
          cause: finalError,
        })
      }
    }
  }
}
