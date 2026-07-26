import { useEffect } from 'react'
import { CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Navbar from './components/Navbar'
import { GenerationUsageProvider } from './contexts/GenerationUsageContext'
import { isSupabaseConfigured } from './lib/supabase'
import AddLog from './pages/AddLog'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import PastTestResults from './pages/PastTestResults'
import PostStudyQuiz from './pages/PostStudyQuiz'
import Progress from './pages/Progress'
import Psychology from './pages/Psychology'
import PsychologyTechniqueDetail from './pages/PsychologyTechniqueDetail'
import Quiz from './pages/Quiz'
import RecallCalendar from './pages/RecallCalendar'
import SmallQuiz from './pages/SmallQuiz'
import StudyLogsPage from './pages/StudyLogsPage'
import Syllabus from './pages/Syllabus'
import { Button } from './components/ui/button'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
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

function DataSyncError({ message, onRetry, onSignOut }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-lift">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-coral">
          <CloudOff className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">We could not open your synced workspace</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Your user-scoped copy on this device is preserved. Retry before entering the app so another account’s data is never shown.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button onClick={onRetry}><RefreshCw data-icon="inline-start" /> Retry</Button>
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

function ProtectedAppShell() {
  const { dataError, dataReady, syncing } = useAuth()
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Navbar />
      <main className="min-h-dvh pb-20 lg:ml-28 lg:pb-0">
        <div className="mx-auto w-full max-w-[1520px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ScrollToTop />
          {dataReady && dataError ? (
            <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <CloudOff className="mt-0.5 size-4 shrink-0" />
              <span><strong>Saved on this device.</strong> Cloud sync will retry automatically. {dataError}</span>
            </div>
          ) : null}
          {syncing ? <p className="mb-3 text-right text-xs text-muted-foreground">Syncing your latest changes…</p> : null}
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
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  const {
    user,
    session,
    loading,
    dataLoading,
    dataReady,
    dataError,
    retryDataSync,
    signOut,
  } = useAuth()

  if (!isSupabaseConfigured) return <ConfigurationError />

  if (isSupabaseConfigured && loading) {
    return <LoadingScreen message={dataLoading ? 'Syncing your study plan…' : undefined} />
  }

  if (isSupabaseConfigured && (!user || !session)) return <Auth />

  if (isSupabaseConfigured && !dataReady) {
    if (dataError) {
      return <DataSyncError message={dataError} onRetry={retryDataSync} onSignOut={() => { void signOut() }} />
    }
    return <LoadingScreen message="Syncing your study plan…" />
  }

  return (
    <GenerationUsageProvider>
      <ProtectedAppShell />
    </GenerationUsageProvider>
  )
}
