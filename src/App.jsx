import { Component, lazy, Suspense, useEffect, useRef } from 'react'
import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import {
  AcademicProfileProvider,
  useAcademicProfile,
} from './academic/AcademicProfileProvider'
import { academicRouteDestination } from './academic/onboarding'
import Navbar from './components/Navbar'
import { GenerationUsageProvider } from './contexts/GenerationUsageContext'
import { isSupabaseConfigured } from './lib/supabase'
import Auth from './pages/Auth'
import AuthCallback from './pages/AuthCallback'
import Legal from './pages/Legal'
import PublicLanding from './pages/PublicLanding'
import { Button } from './components/ui/button'

const AddLog = lazy(() => import('./pages/AddLog'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Home = lazy(() => import('./pages/Home'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const PastTestResults = lazy(() => import('./pages/PastTestResults'))
const PostStudyQuiz = lazy(() => import('./pages/PostStudyQuiz'))
const Progress = lazy(() => import('./pages/Progress'))
const Psychology = lazy(() => import('./pages/Psychology'))
const PsychologyTechniqueDetail = lazy(() => import('./pages/PsychologyTechniqueDetail'))
const Quiz = lazy(() => import('./pages/Quiz'))
const RecallCalendar = lazy(() => import('./pages/RecallCalendar'))
const Settings = lazy(() => import('./pages/Settings'))
const SmallQuiz = lazy(() => import('./pages/SmallQuiz'))
const StudyLogsPage = lazy(() => import('./pages/StudyLogsPage'))
const Syllabus = lazy(() => import('./pages/Syllabus'))

function RouteFocusManager({ targetRef }) {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const frame = window.requestAnimationFrame(() => {
      targetRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, targetRef])
  return null
}

function LoadingScreen({ message = 'Opening your Recall+ workspace…' }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6" aria-live="polite">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
          <Loader2 className="size-6 animate-spin" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Recall+</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  )
}

function RouteLoading() {
  return (
    <div className="grid min-h-[45vh] place-items-center" role="status" aria-label="Loading page">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  )
}

class RouteErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previousProps) {
    if (
      previousProps.resetKey !== this.props.resetKey
      && this.state.error
    ) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section role="alert" className="mx-auto my-10 max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
        <CloudOff className="mx-auto size-8 text-coral" />
        <h1 className="mt-4 text-xl font-semibold">This page could not finish loading</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your saved study data is safe. Reload the latest app files, or return home and try again.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => window.location.reload()}>
            <RefreshCw data-icon="inline-start" /> Reload page
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.assign('/')}>
            Return home
          </Button>
        </div>
      </section>
    )
  }
}

function DataConflictActions({ onUseCloud, onKeepLocal }) {
  return (
    <>
      <Button
        type="button"
        onClick={() => {
          if (window.confirm('Replace this device’s unsynced copy with the newer cloud copy?')) {
            onUseCloud()
          }
        }}
      >
        Use cloud copy
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (window.confirm('Replace the newer cloud copy with this device’s preserved data?')) {
            onKeepLocal()
          }
        }}
      >
        Keep this device’s copy
      </Button>
    </>
  )
}

function DataSyncError({
  conflict,
  message,
  onKeepLocal,
  onRetry,
  onSignOut,
  onUseCloud,
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-lift">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-coral">
          <CloudOff className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">We could not open your synced workspace</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {conflict
            ? 'Your device and cloud copies both remain preserved. Choose which copy should become authoritative.'
            : 'Your user-scoped copy on this device is preserved. Retry before entering the app so another account’s data is never shown.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {conflict ? (
            <DataConflictActions onUseCloud={onUseCloud} onKeepLocal={onKeepLocal} />
          ) : (
            <Button onClick={onRetry}><RefreshCw data-icon="inline-start" /> Retry</Button>
          )}
          <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </section>
    </main>
  )
}

function ConfigurationError() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-lift">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <CloudOff className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Recall+ needs its secure account connection</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart Recall+.
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Protected pages stay closed so browser-local data cannot appear under the wrong account.
        </p>
      </section>
    </main>
  )
}

function AcademicProfileError({ message, onRetry, onSignOut }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-lift">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-coral">
          <CloudOff className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">We could not open your academic profile</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Your existing study history remains preserved. Protected study pages stay closed until your owner-scoped subject profile loads.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={onRetry}>
            <RefreshCw data-icon="inline-start" /> Retry
          </Button>
          <Button type="button" variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </section>
    </main>
  )
}

function ProtectedAppShell() {
  const {
    dataConflict,
    dataError,
    dataReady,
    resolveDataConflict,
    syncing,
  } = useAuth()
  const { pathname } = useLocation()
  const mainRef = useRef(null)
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Navbar />
      <main ref={mainRef} tabIndex="-1" aria-label="Recall Plus workspace" className="min-h-dvh pb-[calc(9rem+env(safe-area-inset-bottom))] outline-none focus-visible:ring-0 focus-visible:ring-offset-0 md:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:ml-28 lg:pb-0">
        <div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <RouteFocusManager targetRef={mainRef} />
          {dataReady && dataError ? (
            <div role="status" className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <CloudOff className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <strong>Saved on this device.</strong>{' '}
                {dataConflict ? 'The cloud copy also changed.' : 'Cloud sync will retry automatically.'} {dataError}
              </span>
              {dataConflict ? (
                <span className="flex flex-wrap gap-2">
                  <DataConflictActions
                    onUseCloud={() => { void resolveDataConflict('cloud') }}
                    onKeepLocal={() => { void resolveDataConflict('local') }}
                  />
                </span>
              ) : null}
            </div>
          ) : null}
          {syncing ? <p className="mb-3 text-right text-xs text-muted-foreground">Syncing your latest changes…</p> : null}
          <RouteErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/syllabus" element={<Syllabus />} />
              <Route path="/add-log" element={<AddLog />} />
              <Route path="/logs" element={<StudyLogsPage />} />
              <Route path="/post-study-quiz" element={<PostStudyQuiz />} />
              <Route path="/small-quiz" element={<SmallQuiz />} />
              <Route path="/review" element={<Navigate to="/recall-calendar" replace />} />
              <Route path="/recall" element={<Navigate to="/recall-calendar" replace />} />
              <Route path="/recall-calendar" element={<RecallCalendar />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/quiz/results" element={<PastTestResults />} />
              <Route path="/quiz/results/:resultId" element={<PastTestResults />} />
              <Route path="/psychology" element={<Psychology />} />
              <Route path="/psychology/:techniqueId" element={<PsychologyTechniqueDetail />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AcademicProfileProvider>
      <AppRoutes />
    </AcademicProfileProvider>
  )
}

function AppRoutes() {
  const { pathname } = useLocation()
  const {
    user,
    session,
    loading,
    dataLoading,
    dataReady,
    dataError,
    dataConflict,
    passwordRecovery,
    resolveDataConflict,
    retryDataSync,
    signOut,
  } = useAuth()
  const {
    error: academicError,
    loading: academicLoading,
    retry: retryAcademicProfile,
    workspace,
  } = useAcademicProfile()

  if (pathname === '/privacy') return <Legal document="privacy" />

  if (pathname === '/terms') return <Legal document="terms" />

  if (!isSupabaseConfigured) {
    if (pathname === '/') return <PublicLanding />
    return <ConfigurationError />
  }

  if (pathname === '/auth/callback') return <AuthCallback />

  if (passwordRecovery) return <Auth />

  if (isSupabaseConfigured && loading) {
    return <LoadingScreen message={dataLoading ? 'Syncing your study plan…' : undefined} />
  }

  if (isSupabaseConfigured && (!user || !session)) {
    if (pathname === '/') return <PublicLanding />
    return <Auth />
  }

  if (isSupabaseConfigured && !dataReady) {
    if (dataError) {
      return (
        <DataSyncError
          conflict={dataConflict}
          message={dataError}
          onRetry={retryDataSync}
          onSignOut={() => { void signOut() }}
          onUseCloud={() => { void resolveDataConflict('cloud') }}
          onKeepLocal={() => { void resolveDataConflict('local') }}
        />
      )
    }
    return <LoadingScreen message="Syncing your study plan…" />
  }

  if (academicLoading) {
    return <LoadingScreen message="Loading your academic profile…" />
  }

  if (academicError || !workspace) {
    return (
      <AcademicProfileError
        message={academicError || 'Your academic profile is not available yet.'}
        onRetry={retryAcademicProfile}
        onSignOut={() => { void signOut() }}
      />
    )
  }

  const academicRedirect = academicRouteDestination(
    workspace.profile.onboardingCompleted,
    pathname,
    new URLSearchParams(window.location.search).get('mode') === 'edit',
  )
  if (academicRedirect) return <Navigate to={academicRedirect} replace />

  if (pathname === '/onboarding') {
    return (
      <Suspense fallback={<LoadingScreen message="Opening academic setup…" />}>
        <Onboarding />
      </Suspense>
    )
  }

  return (
    <GenerationUsageProvider>
      <ProtectedAppShell />
    </GenerationUsageProvider>
  )
}
