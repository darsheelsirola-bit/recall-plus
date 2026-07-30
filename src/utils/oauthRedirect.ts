import {
  isRecallOAuthProvider,
  type RecallOAuthProvider,
} from '../auth/oauthConfig.ts'

export const AUTH_CALLBACK_PATH = '/auth/callback'
export const DEFAULT_POST_LOGIN_PATH = '/'
export const OAUTH_RETURN_TO_KEY = 'recall-plus-oauth-return-to'
export const OAUTH_PROVIDER_KEY = 'recall-plus-oauth-provider'

interface StorageLike {
  getItem: (key: string) => string | null
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}

interface LocationLike {
  pathname: string
  search?: string
  hash?: string
}

export function safeOAuthReturnTo(value: string | null | undefined): string {
  const candidate = value?.trim() ?? ''
  if (
    !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
  ) return DEFAULT_POST_LOGIN_PATH

  try {
    const base = new URL('https://recall-plus.invalid')
    const parsed = new URL(candidate, base)
    if (parsed.origin !== base.origin) return DEFAULT_POST_LOGIN_PATH
    if (
      parsed.pathname === AUTH_CALLBACK_PATH
      || parsed.pathname === '/auth'
    ) return DEFAULT_POST_LOGIN_PATH
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return DEFAULT_POST_LOGIN_PATH
  }
}

export function authReturnToFromLocation(location: LocationLike): string {
  return safeOAuthReturnTo(
    `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`,
  )
}

export function rememberOAuthReturnTo(
  storage: StorageLike,
  returnTo: string,
): void {
  try {
    storage.setItem(OAUTH_RETURN_TO_KEY, safeOAuthReturnTo(returnTo))
  } catch {
    // OAuth should still be usable when browser storage is unavailable.
    return
  }
}

export function rememberOAuthContext(
  storage: StorageLike,
  returnTo: string,
  provider: RecallOAuthProvider,
): void {
  rememberOAuthReturnTo(storage, returnTo)
  try {
    storage.setItem(OAUTH_PROVIDER_KEY, provider)
  } catch {
    // The callback will use a generic provider fallback without browser storage.
    return
  }
}

export function readOAuthReturnTo(storage: StorageLike): string {
  try {
    return safeOAuthReturnTo(storage.getItem(OAUTH_RETURN_TO_KEY))
  } catch {
    return DEFAULT_POST_LOGIN_PATH
  }
}

export function clearOAuthReturnTo(storage: StorageLike): void {
  try {
    storage.removeItem(OAUTH_RETURN_TO_KEY)
  } catch {
    // There is nothing else to clean up if browser storage is unavailable.
    return
  }
}

export function readOAuthProvider(storage: StorageLike): RecallOAuthProvider | null {
  try {
    const provider = storage.getItem(OAUTH_PROVIDER_KEY)
    return isRecallOAuthProvider(provider) ? provider : null
  } catch {
    return null
  }
}

export function clearOAuthContext(storage: StorageLike): void {
  clearOAuthReturnTo(storage)
  try {
    storage.removeItem(OAUTH_PROVIDER_KEY)
  } catch {
    // There is nothing else to clean up if browser storage is unavailable.
    return
  }
}

function authErrorParams(search: string, hash: string): URLSearchParams {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  for (const key of ['error', 'error_code', 'error_description']) {
    if (!query.has(key) && fragment.has(key)) {
      query.set(key, fragment.get(key) ?? '')
    }
  }
  return query
}

export interface OAuthCallbackParameters {
  code: string
  error: string
  errorCode: string
  errorDescription: string
}

export function readOAuthCallbackParameters(
  search: string,
  hash: string,
): OAuthCallbackParameters {
  const params = authErrorParams(search, hash)
  return {
    code: params.get('code')?.trim() ?? '',
    error: params.get('error')?.trim() ?? '',
    errorCode: params.get('error_code')?.trim() ?? '',
    errorDescription: params.get('error_description')?.trim() ?? '',
  }
}
