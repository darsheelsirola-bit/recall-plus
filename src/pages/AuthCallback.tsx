import { useEffect, useState } from 'react'
import { CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { exchangeOAuthCallback } from '../auth/oauthCallback'
import { friendlyOAuthError, logOAuthError } from '../auth/oauthErrors'
import type { RecallOAuthProvider } from '../auth/oauthConfig'
import Logo from '../components/Logo'
import { Button } from '../components/ui/button'
import { supabase } from '../lib/supabase'
import {
  AUTH_CALLBACK_PATH,
  clearOAuthContext,
  DEFAULT_POST_LOGIN_PATH,
  readOAuthProvider,
} from '../utils/oauthRedirect'

function stripCallbackParameters(): void {
  window.history.replaceState(window.history.state, '', AUTH_CALLBACK_PATH)
}

export default function AuthCallback() {
  const {
    dataError,
    dataReady,
    loading,
    retryDataSync,
    session,
    signOut,
    user,
  } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const [exchangeComplete, setExchangeComplete] = useState(false)
  const [callbackError, setCallbackError] = useState('')
  const [provider] = useState<RecallOAuthProvider | null>(
    () => readOAuthProvider(window.sessionStorage),
  )

  useEffect(() => {
    stripCallbackParameters()

    let active = true
    void exchangeOAuthCallback(
      location.search,
      location.hash,
      supabase.auth,
    ).then((result) => {
      if (!active) return
      if (result.status === 'success') {
        setExchangeComplete(true)
        return
      }
      if (result.reason === 'missing_code') {
        setCallbackError(
          'Recall+ did not receive a valid sign-in response. Return to Sign In and try again.',
        )
        return
      }
      if (result.reason === 'missing_session') {
        setCallbackError(
          'Recall+ could not confirm your secure session. Return to Sign In and try again.',
        )
        return
      }
      logOAuthError(result.error, provider, 'callback')
      setCallbackError(friendlyOAuthError(result.error, provider, 'callback'))
    })

    return () => {
      active = false
    }
  }, [location.hash, location.search, provider])

  useEffect(() => {
    if (
      callbackError
      || !exchangeComplete
      || loading
      || !session
      || !user
      || !dataReady
    ) return
    clearOAuthContext(window.sessionStorage)
    navigate(DEFAULT_POST_LOGIN_PATH, { replace: true })
  }, [
    callbackError,
    dataReady,
    exchangeComplete,
    loading,
    navigate,
    session,
    user,
  ])

  async function returnToSignIn() {
    if (leaving) return
    setLeaving(true)
    clearOAuthContext(window.sessionStorage)
    stripCallbackParameters()
    if (session) await signOut()
    navigate('/auth', { replace: true })
  }

  const workspaceError = exchangeComplete && session && user && !loading && !dataReady && dataError
    ? (
      dataError.includes('profile')
        ? 'Your account is signed in, but Recall+ could not load your profile. Please retry.'
        : dataError.includes('connect') || dataError.includes('network') || dataError.includes('Failed to fetch')
          ? 'Your account is signed in, but Recall+ could not connect. Check your connection and try again.'
          : dataError.includes('expired') || dataError.includes('session')
            ? 'Your session could not be confirmed. Please sign in again.'
            : 'Your account is signed in, but Recall+ could not finish opening your workspace. Please retry.'
    )
    : ''
  const missingSessionError = exchangeComplete && !loading && !callbackError && !session
    ? 'Recall+ could not confirm your secure session. Return to Sign In and try again.'
    : ''
  const error = callbackError || workspaceError || missingSessionError

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4 sm:p-6">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-lift sm:p-8">
        <div className="mx-auto flex justify-center">
          <Logo />
        </div>

        {error ? (
          <>
            <span className="mx-auto mt-8 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <CircleAlert className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
              We could not finish signing you in
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="alert">
              {error}
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {workspaceError ? (
                <Button
                  type="button"
                  variant="outline"
                  className=""
                  nativeButton
                  render={undefined}
                  onClick={retryDataSync}
                >
                  <RefreshCw data-icon="inline-start" />
                  Retry
                </Button>
              ) : null}
              <Button
                type="button"
                className={workspaceError ? '' : 'sm:col-span-2'}
                nativeButton
                render={undefined}
                onClick={() => { void returnToSignIn() }}
                disabled={leaving}
              >
                {leaving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Return to Sign In
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="mx-auto mt-8 grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
              <Loader2 className="size-6 animate-spin" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
              Finishing your secure sign-in
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">
              Restoring your Recall+ session and opening your study workspace…
            </p>
          </>
        )}
      </section>
    </main>
  )
}
