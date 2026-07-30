import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RecallOAuthProvider } from '../auth/oauthConfig.ts'
import { AUTH_CALLBACK_PATH } from '../utils/oauthRedirect.ts'

const env = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>
  }
).env ?? {}
const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseKey = (
  env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? env.VITE_SUPABASE_ANON_KEY
  ?? ''
).trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

// Keep the export non-null so shared API helpers have one stable typed client.
// The placeholder client is never used for network access while configuration
// is absent; App renders a configuration error before protected content mounts.
const clientUrl = isSupabaseConfigured ? supabaseUrl : 'https://supabase.invalid'
const clientKey = isSupabaseConfigured ? supabaseKey : 'recall-plus-local-only'

export const supabaseAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: typeof window !== 'undefined'
    && window.location.pathname !== AUTH_CALLBACK_PATH,
  flowType: 'pkce' as const,
  storageKey: 'recall-plus-auth',
}

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: supabaseAuthOptions,
})

export async function readSupabaseOAuthProviderEnabled(
  provider: RecallOAuthProvider,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false

  const response = await fetch(new URL('/auth/v1/settings', clientUrl), {
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
    },
  })
  if (!response.ok) {
    const error = new Error('Could not read the Supabase Auth provider settings.')
    error.name = response.status >= 500 ? 'NetworkError' : 'AuthSettingsError'
    throw error
  }

  const settings = await response.json() as {
    external?: Partial<Record<RecallOAuthProvider, boolean>>
  }
  return settings.external?.[provider] === true
}
