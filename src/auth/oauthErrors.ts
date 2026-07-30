import type { RecallOAuthProvider } from './oauthConfig.ts'

export type OAuthErrorCategory =
  | 'provider_unavailable'
  | 'redirect_not_allowed'
  | 'access_denied'
  | 'network'
  | 'session_exchange'
  | 'callback'

type OAuthPhase = 'start' | 'callback'

const providerNames: Record<RecallOAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return ''

  const record = error as Record<string, unknown>
  return [
    record.name,
    record.code,
    record.error,
    record.error_code,
    record.message,
    record.msg,
    record.description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function safeCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const record = error as Record<string, unknown>
  const value = record.code ?? record.error_code ?? record.error
  return typeof value === 'string' && /^[a-z0-9_-]{1,80}$/i.test(value)
    ? value
    : ''
}

export function classifyOAuthError(error: unknown): OAuthErrorCategory {
  const normalized = errorText(error).toLowerCase()

  if (
    normalized.includes('unsupported provider')
    || normalized.includes('provider is not enabled')
    || normalized.includes('provider_not_enabled')
    || normalized.includes('invalid provider')
  ) return 'provider_unavailable'

  if (
    normalized.includes('redirect')
    && (
      normalized.includes('not allowed')
      || normalized.includes('not permitted')
      || normalized.includes('mismatch')
      || normalized.includes('invalid')
    )
  ) return 'redirect_not_allowed'

  if (
    normalized.includes('access_denied')
    || normalized.includes('cancel')
    || normalized.includes('denied')
  ) return 'access_denied'

  if (
    normalized.includes('network')
    || normalized.includes('failed to fetch')
    || normalized.includes('fetch failed')
    || normalized.includes('connection')
    || normalized.includes('timeout')
  ) return 'network'

  if (
    normalized.includes('code verifier')
    || normalized.includes('pkce')
    || normalized.includes('exchange')
    || normalized.includes('auth code')
    || normalized.includes('authorization code')
    || normalized.includes('session')
  ) return 'session_exchange'

  return 'callback'
}

export function friendlyOAuthError(
  error: unknown,
  provider: RecallOAuthProvider | null,
  phase: OAuthPhase,
): string {
  const name = provider ? providerNames[provider] : 'Social'
  const category = classifyOAuthError(error)

  if (category === 'provider_unavailable') {
    return `${name} sign-in is not configured yet. Please use email and password or try again later.`
  }
  if (category === 'redirect_not_allowed') {
    return `${name} sign-in is temporarily unavailable because its return address is not approved. Please use email and password for now.`
  }
  if (category === 'access_denied') {
    return `${name} sign-in was cancelled. You can try again or use email and password.`
  }
  if (category === 'network') {
    return `Recall+ could not reach ${name} sign-in. Check your connection and try again, or use email and password.`
  }
  if (category === 'session_exchange') {
    return `${name} sign-in returned, but Recall+ could not create a secure session. Please try again or use email and password.`
  }
  return phase === 'start'
    ? `${name} sign-in could not be started. Please try again or use email and password.`
    : `${name} sign-in could not be completed. Please try again or use email and password.`
}

export function safeOAuthDiagnosticMessage(error: unknown): string {
  return errorText(error)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[token]')
    .replace(
      /(["']?(?:access_token|refresh_token|client_secret|code_verifier)["']?\s*[:=]\s*)["']?[^"',\s}]+["']?/gi,
      '$1[credential]',
    )
    .replace(/\b[A-Za-z0-9_-]{80,}\b/g, '[redacted]')
    .slice(0, 300)
}

export function logOAuthError(
  error: unknown,
  provider: RecallOAuthProvider | null,
  phase: OAuthPhase,
): void {
  const environment = (
    import.meta as ImportMeta & { env?: { DEV?: boolean } }
  ).env
  if (!environment?.DEV) return

  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {}
  const status = typeof record.status === 'number' ? record.status : undefined
  const message = safeOAuthDiagnosticMessage(error)
  console.error('[Recall+ OAuth]', {
    provider,
    phase,
    category: classifyOAuthError(error),
    code: safeCode(error) || undefined,
    status,
    message: message || undefined,
  })
}
