import { useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import {
  startOAuthSignIn,
  type RecallOAuthProvider,
} from '../../auth/oauth'
import { isOAuthProviderFeatureEnabled } from '../../auth/oauthConfig'

interface SocialAuthButtonsProps {
  returnTo: string
}

interface ProviderDetails {
  id: RecallOAuthProvider
  name: string
  Icon: () => React.JSX.Element
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.806.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.957v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.707V4.961H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.039l3.006-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.455 3.44 1.346l2.581-2.58C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.961l3.006 2.332C4.672 5.164 6.656 3.58 9 3.58Z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 .7C5.63.7.47 5.86.47 12.23c0 5.1 3.3 9.42 7.88 10.94.58.1.79-.25.79-.56v-2.02c-3.21.7-3.89-1.36-3.89-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a10.95 10.95 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.79.56A11.54 11.54 0 0 0 23.53 12.23C23.53 5.86 18.37.7 12 .7Z" />
    </svg>
  )
}

const providers: ProviderDetails[] = [
  { id: 'google', name: 'Google', Icon: GoogleIcon },
  { id: 'github', name: 'GitHub', Icon: GitHubIcon },
]

export default function SocialAuthButtons({ returnTo }: SocialAuthButtonsProps) {
  const [pendingProvider, setPendingProvider] = useState<RecallOAuthProvider | null>(null)
  const [error, setError] = useState('')
  const visibleProviders = providers.filter(({ id }) => isOAuthProviderFeatureEnabled(id))

  async function continueWith(provider: RecallOAuthProvider) {
    if (pendingProvider || !isOAuthProviderFeatureEnabled(provider)) return
    setPendingProvider(provider)
    setError('')
    const result = await startOAuthSignIn(provider, returnTo)
    if (result.error) {
      setError(result.error)
      setPendingProvider(null)
    }
  }

  return (
    <div>
      <div className="grid gap-3" aria-label="Social sign-in options">
        {visibleProviders.map(({ id, name, Icon }) => {
          const enabled = isOAuthProviderFeatureEnabled(id)
          const isGoogle = id === 'google'
          return (
            <button
              key={id}
              type="button"
              className={`relative flex h-11 w-full items-center justify-center rounded-xl border px-12 text-sm font-semibold shadow-sm transition active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                isGoogle
                  ? 'border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f7f8f8] focus-visible:border-[#1f1f1f]'
                  : 'border-input bg-card text-foreground hover:border-primary/35 hover:bg-secondary/35 focus-visible:border-primary'
              }`}
              disabled={pendingProvider !== null || !enabled}
              aria-busy={pendingProvider === id}
              aria-label={`Continue with ${name}`}
              style={isGoogle ? { fontFamily: '"Google Sans", Roboto, Arial, sans-serif' } : undefined}
              onClick={() => { void continueWith(id) }}
            >
              <span className="absolute left-4 grid size-5 place-items-center [&>svg]:size-5">
                <Icon />
              </span>
              <span className="whitespace-nowrap">
                {`Continue with ${name}`}
              </span>
              <span className="absolute right-4 grid size-5 place-items-center" aria-hidden="true">
                {pendingProvider === id ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
              </span>
            </button>
          )
        })}
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm leading-5 text-destructive" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="min-h-6 shrink-0 rounded px-1.5 text-xs font-semibold hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
            onClick={() => setError('')}
            aria-label="Dismiss social sign-in error"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}
