import { useState, type FormEvent } from 'react'
import { ArrowRight, Brain, CheckCircle2, Loader2, LockKeyhole, Mail, UserRound, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Logo from '../components/Logo'
import { useAuth } from '../auth/AuthProvider'
import { validateAuthForm } from '../utils/authValidation'
import {
  INDIA_TIMEZONE_DETAIL,
  INDIA_TIMEZONE_NAME,
  PROFILE_NAME_MAX_LENGTH,
} from '../utils/profile'

type AuthMode = 'signin' | 'signup' | 'forgot'
type ActiveAuthMode = AuthMode | 'recovery'

export default function Auth() {
  const {
    passwordRecovery,
    requestPasswordReset,
    signIn,
    signUp,
    updatePassword,
  } = useAuth()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeMode: ActiveAuthMode = passwordRecovery ? 'recovery' : mode

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    setNotice('')

    try {
      const validationError = validateAuthForm({
        mode: activeMode,
        name,
        email,
        password,
        confirmPassword,
      })
      if (validationError) {
        setError(validationError)
        return
      }

      const result = activeMode === 'signup'
        ? await signUp({ name, email, password })
        : activeMode === 'forgot'
          ? await requestPasswordReset(email)
          : activeMode === 'recovery'
            ? await updatePassword(password)
            : await signIn(email, password)

      if (result.error) {
        setError(result.error)
      } else if (activeMode === 'forgot') {
        setNotice('Check your email for a secure password-reset link.')
      } else if (result.needsEmailConfirmation) {
        setNotice('Check your email to confirm your Recall+ account, then sign in here.')
        setMode('signin')
        setPassword('')
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-dvh bg-background p-4 sm:p-6 lg:grid-cols-[minmax(360px,.8fr)_minmax(520px,1.2fr)] lg:p-8">
      <section className="relative hidden overflow-hidden rounded-3xl bg-ink p-10 text-white shadow-lift lg:flex lg:flex-col lg:justify-between">
        <div>
          <Logo inverse />
          <h1 className="mt-16 max-w-md text-5xl font-semibold leading-[1.06] tracking-[-0.04em]">
            Keep every study session working for you.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/60">
            Recall+ turns your study logs into quizzes, spaced recall, and a timetable that follows your real routine.
          </p>
        </div>
        <div className="grid gap-3">
          {[
            'Your progress stays tied to your account.',
            'Quiz and timetable limits reset on India Standard Time.',
            'Pick up your plan on another signed-in device.',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm font-medium text-white/80">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-white"><CheckCircle2 className="size-4" /></span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="grid place-items-center px-1 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><Logo /></div>
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary"><Brain className="size-6" /></span>
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">
            {activeMode === 'signin'
              ? 'Welcome back'
              : activeMode === 'signup'
                ? 'Create your Recall+ account'
                : activeMode === 'forgot'
                  ? 'Reset your password'
                  : 'Choose a new password'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {activeMode === 'signin'
              ? 'Sign in to open your study plan and continue where you left off.'
              : activeMode === 'signup'
                ? 'Your current browser data will be preserved and securely attached to this account.'
                : activeMode === 'forgot'
                  ? 'We will email you a secure link to choose a new password.'
                  : 'Enter a new password to finish recovering your Recall+ account.'}
          </p>

          {activeMode === 'signin' || activeMode === 'signup' ? <div className="mt-7 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'signin'}
              onClick={() => changeMode('signin')}
              className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeMode === 'signin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'signup'}
              onClick={() => changeMode('signup')}
              className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeMode === 'signup' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Create account
            </button>
          </div> : null}

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {activeMode === 'signup' ? (
              <label className="field-label">
                Name
                <span className="relative mt-2 block">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="field !pl-10"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    minLength={2}
                    maxLength={PROFILE_NAME_MAX_LENGTH}
                    required
                  />
                </span>
              </label>
            ) : null}

            {activeMode !== 'recovery' ? <label className="field-label">
              Email
              <span className="relative mt-2 block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field !pl-10"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </span>
            </label> : null}

            {activeMode !== 'forgot' ? <label className="field-label">
              {activeMode === 'recovery' ? 'New password' : 'Password'}
              <span className="relative mt-2 block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field !pl-10"
                  type="password"
                  autoComplete={activeMode === 'signup' || activeMode === 'recovery' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={activeMode === 'signup' || activeMode === 'recovery' ? 'At least 8 characters' : 'Your password'}
                  minLength={activeMode === 'signup' || activeMode === 'recovery' ? 8 : undefined}
                  required
                />
              </span>
            </label> : null}

            {activeMode === 'recovery' ? (
              <label className="field-label">
                Confirm new password
                <span className="relative mt-2 block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="field !pl-10"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    minLength={8}
                    required
                  />
                </span>
              </label>
            ) : null}

            {activeMode === 'signup' || activeMode === 'recovery' ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Use 8 or more characters with lowercase, uppercase, a number, and a symbol.
              </p>
            ) : null}

            {activeMode === 'signin' ? (
              <button type="button" className="min-h-11 text-sm font-semibold text-primary hover:underline" onClick={() => changeMode('forgot')}>
                Forgot your password?
              </button>
            ) : activeMode === 'forgot' ? (
              <button type="button" className="min-h-11 text-sm font-semibold text-primary hover:underline" onClick={() => changeMode('signin')}>
                Back to sign in
              </button>
            ) : null}

            {activeMode === 'signup' ? (
              <p className="rounded-xl bg-secondary/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Your daily generation limits reset at midnight in <strong className="text-foreground">{INDIA_TIMEZONE_NAME}</strong>
                {' '}— {INDIA_TIMEZONE_DETAIL}.
              </p>
            ) : null}

            {error ? (
              <Alert variant="destructive" className="">
                <X />
                <AlertTitle className="">
                  {activeMode === 'signin'
                    ? 'Could not sign in'
                    : activeMode === 'signup'
                      ? 'Could not create your account'
                      : activeMode === 'forgot'
                        ? 'Could not send a reset link'
                        : 'Could not update your password'}
                </AlertTitle>
                <AlertDescription className="">{error}</AlertDescription>
              </Alert>
            ) : null}

            {notice ? (
              <Alert variant="default" className="">
                <CheckCircle2 />
                <AlertTitle className="">{activeMode === 'forgot' ? 'Reset link sent' : 'Confirm your email'}</AlertTitle>
                <AlertDescription className="">{notice}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" size="lg" nativeButton render={undefined} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitting
                ? (activeMode === 'signin'
                    ? 'Signing in…'
                    : activeMode === 'signup'
                      ? 'Creating account…'
                      : activeMode === 'forgot'
                        ? 'Sending reset link…'
                        : 'Updating password…')
                : (activeMode === 'signin'
                    ? 'Sign in to Recall+'
                    : activeMode === 'signup'
                      ? 'Create my account'
                      : activeMode === 'forgot'
                        ? 'Email me a reset link'
                        : 'Save new password')}
              {!submitting ? <ArrowRight data-icon="inline-end" /> : null}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Your session stays signed in securely on this device until you sign out.
          </p>
        </div>
      </section>
    </main>
  )
}
