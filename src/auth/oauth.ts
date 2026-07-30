import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isSupabaseConfigured,
  readSupabaseOAuthProviderEnabled,
  supabase,
} from '../lib/supabase.ts'
import {
  isOAuthProviderFeatureEnabled,
  isRecallOAuthProvider,
  type RecallOAuthProvider,
} from './oauthConfig.ts'
import { friendlyOAuthError, logOAuthError } from './oauthErrors.ts'
import {
  AUTH_CALLBACK_PATH,
  clearOAuthContext,
  rememberOAuthContext,
} from '../utils/oauthRedirect.ts'

export type { RecallOAuthProvider } from './oauthConfig.ts'

export interface OAuthStartResult {
  error: string
}

let activeOAuthStart: Promise<OAuthStartResult> | null = null

interface OAuthStartDependencies {
  configured: boolean
  featureEnabled: (provider: RecallOAuthProvider) => boolean
  providerEnabledInSupabase: (provider: RecallOAuthProvider) => Promise<boolean>
  client: Pick<SupabaseClient, 'auth'>
  origin: string
  storage: Storage
  navigate: (url: string) => void
}

function browserDependencies(): OAuthStartDependencies | null {
  if (typeof window === 'undefined') return null
  return {
    configured: isSupabaseConfigured,
    featureEnabled: isOAuthProviderFeatureEnabled,
    providerEnabledInSupabase: readSupabaseOAuthProviderEnabled,
    client: supabase,
    origin: window.location.origin,
    storage: window.sessionStorage,
    navigate: (url) => window.location.assign(url),
  }
}

async function performOAuthSignIn(
  providerValue: unknown,
  returnTo: string,
  dependencies: OAuthStartDependencies | null,
): Promise<OAuthStartResult> {
  if (!isRecallOAuthProvider(providerValue)) {
    return { error: 'This sign-in option is not supported.' }
  }
  const provider = providerValue
  if (!dependencies) {
    return { error: 'Social sign-in is only available in a browser.' }
  }
  if (!dependencies.configured) {
    return { error: 'Supabase is not configured for this Recall+ installation.' }
  }
  if (!dependencies.featureEnabled(provider)) {
    return { error: friendlyOAuthError('provider_not_enabled', provider, 'start') }
  }

  try {
    rememberOAuthContext(dependencies.storage, returnTo, provider)
    const providerEnabled = await dependencies.providerEnabledInSupabase(provider)
    if (!providerEnabled) {
      const error = { code: 'provider_not_enabled' }
      logOAuthError(error, provider, 'start')
      clearOAuthContext(dependencies.storage)
      return { error: friendlyOAuthError(error, provider, 'start') }
    }

    const redirectTo = new URL(AUTH_CALLBACK_PATH, dependencies.origin).toString()
    const { data, error } = await dependencies.client.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })
    if (error) {
      logOAuthError(error, provider, 'start')
      clearOAuthContext(dependencies.storage)
      return { error: friendlyOAuthError(error, provider, 'start') }
    }
    if (!data.url) throw new Error('OAuth callback URL was not returned.')
    dependencies.navigate(data.url)
    return { error: '' }
  } catch (error) {
    logOAuthError(error, provider, 'start')
    clearOAuthContext(dependencies.storage)
    return { error: friendlyOAuthError(error, provider, 'start') }
  }
}

export function startOAuthSignIn(
  providerValue: unknown,
  returnTo: string,
  dependencies: OAuthStartDependencies | null = browserDependencies(),
): Promise<OAuthStartResult> {
  if (activeOAuthStart) return activeOAuthStart

  const operation = performOAuthSignIn(
    providerValue,
    returnTo,
    dependencies,
  )
  const sharedOperation = operation.finally(() => {
    if (activeOAuthStart === sharedOperation) activeOAuthStart = null
  })
  activeOAuthStart = sharedOperation
  return sharedOperation
}
