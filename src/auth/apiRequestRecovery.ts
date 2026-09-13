interface RequestIdentity {
  userId: string
  accessToken: string
}

interface AuthenticatedFetchRecoveryOptions {
  identity: RequestIdentity
  request: (identity: RequestIdentity) => Promise<Response>
  refreshIdentity: (expectedUserId: string) => Promise<RequestIdentity | null>
  assertIdentityCurrent?: (expectedUserId: string) => Promise<void>
  accountChangedError?: () => Error
  wait?: (milliseconds: number) => Promise<void>
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

export async function runAuthenticatedFetchWithRecovery({
  identity,
  request,
  refreshIdentity,
  assertIdentityCurrent = async () => {},
  accountChangedError = () => new Error('Your signed-in account changed. Please try again.'),
  wait = defaultWait,
}: AuthenticatedFetchRecoveryOptions): Promise<Response> {
  const first = await request(identity)
  if (first.status !== 401) return first

  await wait(1_000)
  await assertIdentityCurrent(identity.userId)
  const second = await request(identity)
  if (second.status !== 401) return second

  let refreshed: RequestIdentity | null
  try {
    refreshed = await refreshIdentity(identity.userId)
  } catch {
    return second
  }
  if (!refreshed) return second
  if (refreshed.userId !== identity.userId) throw accountChangedError()

  await wait(1_000)
  await assertIdentityCurrent(identity.userId)
  return request(refreshed)
}
