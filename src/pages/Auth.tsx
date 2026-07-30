import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Brain,
  CalendarClock,
  ChartNoAxesCombined,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  NotebookPen,
  RefreshCw,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Logo from '../components/Logo'
import SocialAuthButtons from '../components/auth/SocialAuthButtons'
import { useAuth } from '../auth/AuthProvider'
import { completedAuthDestination } from '../utils/authNavigation'
import { validateAuthForm } from '../utils/authValidation'
import { DEFAULT_POST_LOGIN_PATH } from '../utils/oauthRedirect'
import {
  INDIA_TIMEZONE_DETAIL,
  INDIA_TIMEZONE_NAME,
  PROFILE_NAME_MAX_LENGTH,
} from '../utils/profile'

type AuthMode = 'signin' | 'signup' | 'forgot'
type ActiveAuthMode = AuthMode | 'recovery'

const studyFeatures: Array<{
  description: string
  icon: LucideIcon
  title: string
}> = [
  {
    icon: NotebookPen,
    title: 'Log every study session',
    description: 'Keep subjects, topics, and time studied organised.',
  },
  {
    icon: Brain,
    title: 'Practise with focused quizzes',
    description: 'Turn what you studied into targeted questions.',
  },
  {
    icon: RefreshCw,
    title: 'Review with spaced recall',
    description: 'Bring important topics back at useful intervals.',
  },
  {
    icon: CalendarClock,
    title: 'Plan around your routine',
    description: 'Build a timetable that fits your available time.',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'See progress clearly',
    description: 'Track activity and know what to study next.',
  },
  {
    icon: Cloud,
    title: 'Continue on any device',
    description: 'Keep your study plan securely tied to your account.',
  },
]

export default function Auth() {
  const navigate = useNavigate()
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeMode: ActiveAuthMode = passwordRecovery ? 'recovery' : mode
  const socialReturnTo = DEFAULT_POST_LOGIN_PATH

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
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
        setShowPassword(false)
      } else {
        const destination = completedAuthDestination(activeMode)
        if (destination) navigate(destination, { replace: true })
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-dvh bg-background p-4 sm:p-6 lg:grid-cols-[minmax(360px,.8fr)_minmax(520px,1.2fr)] lg:p-8">
      <section className="relative hidden overflow-hidden rounded-3xl bg-ink p-8 text-white shadow-lift lg:sticky lg:top-8 lg:flex lg:h-[calc(100dvh-4rem)] lg:min-h-[680px] lg:self-start lg:flex-col xl:p-10">
        <div>
          <Logo inverse />
          <h1 className="mt-10 max-w-md text-4xl font-semibold leading-[1.06] tracking-[-0.04em] 2xl:mt-12 2xl:text-5xl">
            Keep every study session working for you.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/60 2xl:text-base 2xl:leading-7">
            Recall+ turns your study logs into quizzes, spaced recall, and a timetable that follows your real routine.
          </p>
        </div>

        <div className="mt-8 min-h-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Inside Recall+</span>
            <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {studyFeatures.map(({ description, icon: Icon, title }) => (
              <div
                key={title}
                className="group flex min-h-20 gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 transition-colors hover:bg-white/[0.09] 2xl:min-h-[88px]"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/95 text-white shadow-sm">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-5 text-white/90">{title}</span>
                  <span className="mt-1 hidden text-xs leading-[1.45] text-white/50 2xl:block">{description}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs leading-5 text-white/55">
            <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            Quiz and timetable limits reset on India Standard Time.
          </div>
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
              className={`min-h-11 whitespace-nowrap rounded-lg px-2 py-2.5 text-sm font-semibold transition sm:px-4 ${activeMode === 'signin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'signup'}
              onClick={() => changeMode('signup')}
              className={`min-h-11 whitespace-nowrap rounded-lg px-2 py-2.5 text-sm font-semibold transition sm:px-4 ${activeMode === 'signup' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Create account
            </button>
          </div> : null}

          {activeMode === 'signin' || activeMode === 'signup' ? (
            <>
              <div className="mt-6">
                <SocialAuthButtons returnTo={socialReturnTo} />
              </div>
              <div className="my-5 flex items-center gap-3" aria-label="Or continue with email">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">OR</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
            </>
          ) : null}

          <form className={`${activeMode === 'signin' || activeMode === 'signup' ? '' : 'mt-6'} space-y-4`} onSubmit={submit}>
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

            {activeMode !== 'forgot' ? <div>
              <label className="field-label" htmlFor="auth-password">
                {activeMode === 'recovery' ? 'New password' : 'Password'}
              </label>
              <span className="relative mt-2 block">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="auth-password"
                  className="field !mt-0 !pl-10 !pr-12"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={activeMode === 'signup' || activeMode === 'recovery' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={activeMode === 'signup' || activeMode === 'recovery' ? 'At least 8 characters' : 'Your password'}
                  minLength={activeMode === 'signup' || activeMode === 'recovery' ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-controls="auth-password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword
                    ? <EyeOff className="size-4" aria-hidden="true" />
                    : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </span>
            </div> : null}

            {activeMode === 'recovery' ? (
              <div>
                <label className="field-label" htmlFor="auth-confirm-password">
                  Confirm new password
                </label>
                <span className="relative mt-2 block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="auth-confirm-password"
                    className="field !mt-0 !pl-10 !pr-12"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    aria-controls="auth-confirm-password"
                    aria-pressed={showConfirmPassword}
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                  >
                    {showConfirmPassword
                      ? <EyeOff className="size-4" aria-hidden="true" />
                      : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </span>
              </div>
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

          <div className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            <p>Your session stays signed in securely on this device until you sign out.</p>
            <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              <Link className="font-semibold text-primary hover:underline" to="/privacy">Privacy Policy</Link>
              <Link className="font-semibold text-primary hover:underline" to="/terms">Terms of Service</Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
