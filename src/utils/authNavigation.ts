import { DEFAULT_POST_LOGIN_PATH } from './oauthRedirect.ts'

export type AuthenticationCompletionMode = 'signin' | 'signup' | 'forgot' | 'recovery'

export function completedAuthDestination(
  mode: AuthenticationCompletionMode,
  needsEmailConfirmation = false,
): string | null {
  if (mode === 'forgot' || needsEmailConfirmation) return null
  return DEFAULT_POST_LOGIN_PATH
}
