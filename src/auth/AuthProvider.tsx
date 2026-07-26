import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hydrateUserData, type RecallProfile, syncUserSnapshot } from '../data/userDataSync'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  DATA_DIRTY_EVENT,
  getDataSyncState,
  setStorageUser,
} from '../utils/storage'

interface AuthResult {
  error: string
  needsEmailConfirmation?: boolean
}

interface SignUpInput {
  name: string
  email: string
  password: string
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  profile: RecallProfile | null
  dataReady: boolean
  dataLoading: boolean
  dataError: string
  syncing: boolean
  signingOut: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (input: SignUpInput) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  retryDataSync: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SYNC_DEBOUNCE_MS = 650

function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [profile, setProfile] = useState<RecallProfile | null>(null)
  const [dataReady, setDataReady] = useState(!isSupabaseConfigured)
  const [dataOwnerId, setDataOwnerId] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const syncTimerRef = useRef<number | null>(null)

  const user = session?.user ?? null
  const userId = user?.id ?? ''
  const activeDataReady = dataReady && (!isSupabaseConfigured || (Boolean(userId) && dataOwnerId === userId))

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStorageUser(null)
      setAuthLoading(false)
      return undefined
    }

    let active = true
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAuthLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setDataError(`Could not restore your session: ${error.message}`)
        setSession(null)
      } else {
        setSession(data.session)
      }
      setAuthLoading(false)
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    if (!user) {
      setStorageUser(null)
      setProfile(null)
      setDataOwnerId('')
      setDataLoading(false)
      setDataReady(false)
      return undefined
    }

    let active = true
    setDataLoading(true)
    setDataReady(false)
    setDataOwnerId('')
    setDataError('')

    void hydrateUserData(user)
      .then((result) => {
        if (!active) return
        setProfile(result.profile)
        setDataOwnerId(user.id)
        setDataReady(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        setDataError(errorMessage(error, 'Could not load your Recall+ data.'))
        setDataReady(false)
      })
      .finally(() => {
        if (active) setDataLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId, retryVersion]) // `user` changes on token refresh; the stable id owns data.

  const flushUserData = useCallback(async () => {
    if (!userId || !activeDataReady) return
    setSyncing(true)
    try {
      await syncUserSnapshot(userId)
      setDataError('')
    } catch (error) {
      setDataError(errorMessage(error, 'Could not sync your Recall+ data.'))
    } finally {
      setSyncing(false)
      if (getDataSyncState(userId).dirty) {
        if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
        syncTimerRef.current = window.setTimeout(() => {
          syncTimerRef.current = null
          void flushUserData()
        }, SYNC_DEBOUNCE_MS)
      }
    }
  }, [activeDataReady, userId])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || !activeDataReady) return undefined

    function scheduleSync(event?: Event) {
      const eventUserId = (event as CustomEvent<{ userId?: string }> | undefined)?.detail?.userId
      if (eventUserId && eventUserId !== userId) return
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null
        void flushUserData()
      }, SYNC_DEBOUNCE_MS)
    }

    function onStorage(event: StorageEvent) {
      if (event.key?.includes(encodeURIComponent(userId))) scheduleSync()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden' && getDataSyncState(userId).dirty) {
        void flushUserData()
      }
    }

    window.addEventListener(DATA_DIRTY_EVENT, scheduleSync)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener(DATA_DIRTY_EVENT, scheduleSync)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
    }
  }, [activeDataReady, flushUserData, userId])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured for this Recall+ installation.' }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return { error: error?.message || '' }
  }, [])

  const signUp = useCallback(async ({ name, email, password }: SignUpInput): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured for this Recall+ installation.' }
    }
    const displayName = name.trim()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: displayName,
          name: displayName,
          class_name: 'Class 11 PCM',
          timezone: currentTimezone(),
        },
      },
    })
    return {
      error: error?.message || '',
      needsEmailConfirmation: Boolean(data.user && !data.session),
    }
  }, [])

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return { error: '' }
    setSigningOut(true)
    try {
      if (userId && activeDataReady && getDataSyncState(userId).dirty) {
        try {
          await syncUserSnapshot(userId)
        } catch {
          // The user-scoped local copy remains dirty and will retry next login.
        }
      }
      const { error } = await supabase.auth.signOut()
      if (!error) setStorageUser(null)
      return { error: error?.message || '' }
    } finally {
      setSigningOut(false)
    }
  }, [activeDataReady, userId])

  const retryDataSync = useCallback(() => {
    if (!userId) return
    setRetryVersion((value) => value + 1)
  }, [userId])

  const loading = authLoading || Boolean(user && (dataLoading || !activeDataReady))
  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    configured: isSupabaseConfigured,
    profile,
    dataReady: activeDataReady,
    dataLoading,
    dataError,
    syncing,
    signingOut,
    signIn,
    signUp,
    signOut,
    retryDataSync,
  }), [
    user,
    session,
    loading,
    profile,
    activeDataReady,
    dataLoading,
    dataError,
    syncing,
    signingOut,
    signIn,
    signUp,
    signOut,
    retryDataSync,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
