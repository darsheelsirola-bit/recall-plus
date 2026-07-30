export const RECALL_OAUTH_PROVIDER_IDS = ['google', 'github', 'apple'] as const

export type RecallOAuthProvider = (typeof RECALL_OAUTH_PROVIDER_IDS)[number]

type OAuthFeatureFlag =
  | 'VITE_AUTH_GOOGLE_ENABLED'
  | 'VITE_AUTH_GITHUB_ENABLED'
  | 'VITE_AUTH_APPLE_ENABLED'

type PublicEnvironment = Partial<Record<OAuthFeatureFlag, string>>

const providerFlags: Record<RecallOAuthProvider, OAuthFeatureFlag> = {
  google: 'VITE_AUTH_GOOGLE_ENABLED',
  github: 'VITE_AUTH_GITHUB_ENABLED',
  apple: 'VITE_AUTH_APPLE_ENABLED',
}

const runtimeEnvironment = (
  import.meta as ImportMeta & { env?: PublicEnvironment }
).env ?? {}

export function isRecallOAuthProvider(value: unknown): value is RecallOAuthProvider {
  return typeof value === 'string'
    && RECALL_OAUTH_PROVIDER_IDS.includes(value as RecallOAuthProvider)
}

export function isOAuthProviderFeatureEnabled(
  provider: RecallOAuthProvider,
  environment: PublicEnvironment = runtimeEnvironment,
): boolean {
  // Google is Recall+'s primary social sign-in and is always presented.
  // Supabase's live provider-settings gate still prevents a broken redirect
  // if the project-side Google credentials are unavailable.
  if (provider === 'google') return true
  return environment[providerFlags[provider]]?.trim().toLowerCase() === 'true'
}
