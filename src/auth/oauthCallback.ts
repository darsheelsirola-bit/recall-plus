import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { readOAuthCallbackParameters } from '../utils/oauthRedirect.ts'

type CallbackAuthClient = Pick<SupabaseClient['auth'], 'exchangeCodeForSession'>
const activeCodeExchanges = new Map<string, Promise<OAuthCallbackResult>>()

export type OAuthCallbackResult =
  | { status: 'success'; session: Session }
  | {
    status: 'error'
    reason: 'provider' | 'missing_code' | 'exchange' | 'missing_session'
    error?: unknown
  }

async function performCodeExchange(
  code: string,
  auth: CallbackAuthClient,
): Promise<OAuthCallbackResult> {
  try {
    const { data, error } = await auth.exchangeCodeForSession(code)
    if (error) return { status: 'error', reason: 'exchange', error }
    if (!data.session?.user) return { status: 'error', reason: 'missing_session' }
    return { status: 'success', session: data.session }
  } catch (error) {
    return { status: 'error', reason: 'exchange', error }
  }
}

export function exchangeOAuthCallback(
  search: string,
  hash: string,
  auth: CallbackAuthClient,
): Promise<OAuthCallbackResult> {
  const parameters = readOAuthCallbackParameters(search, hash)
  if (parameters.error || parameters.errorCode) {
    return Promise.resolve({
      status: 'error',
      reason: 'provider',
      error: {
        error: parameters.error,
        error_code: parameters.errorCode,
        description: parameters.errorDescription,
      },
    })
  }
  if (!parameters.code) {
    return Promise.resolve({ status: 'error', reason: 'missing_code' })
  }

  const existing = activeCodeExchanges.get(parameters.code)
  if (existing) return existing

  const operation = performCodeExchange(parameters.code, auth)
  const sharedOperation = operation.finally(() => {
    globalThis.setTimeout(() => {
      if (activeCodeExchanges.get(parameters.code) === sharedOperation) {
        activeCodeExchanges.delete(parameters.code)
      }
    }, 0)
  })
  activeCodeExchanges.set(parameters.code, sharedOperation)
  return sharedOperation
}
