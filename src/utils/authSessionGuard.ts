interface SessionUser {
  id?: string
}

interface SessionValue {
  user?: SessionUser | null
}

interface SessionResult {
  data: {
    session?: SessionValue | null
  }
  error: {
    message?: string
  } | null
}

interface SessionAuthReader {
  getSession: () => Promise<SessionResult>
}

export const AUTH_SESSION_CHANGED_CODE = 'AUTH_SESSION_CHANGED'

export class AuthSessionChangedError extends Error {
  readonly code = AUTH_SESSION_CHANGED_CODE

  constructor() {
    super('Your signed-in account changed. Please try again.')
    this.name = 'AuthSessionChangedError'
  }
}

export async function assertExpectedSessionUser(
  auth: SessionAuthReader,
  expectedUserId: string,
): Promise<void> {
  const { data, error } = await auth.getSession()
  if (error) {
    throw new Error(
      `Could not verify your signed-in account: ${error.message || 'Unknown authentication error.'}`,
      { cause: error },
    )
  }

  const currentUserId = data.session?.user?.id ?? ''
  if (!expectedUserId || currentUserId !== expectedUserId) {
    throw new AuthSessionChangedError()
  }
}

/**
 * Verifies the authenticated subject both before and after an awaited
 * Supabase operation. Callers can safely perform follow-up local or remote
 * mutations only after this helper resolves.
 */
export async function runForExpectedSessionUser<T>(
  auth: SessionAuthReader,
  expectedUserId: string,
  operation: () => PromiseLike<T>,
): Promise<T> {
  await assertExpectedSessionUser(auth, expectedUserId)
  const result = await operation()
  await assertExpectedSessionUser(auth, expectedUserId)
  return result
}
