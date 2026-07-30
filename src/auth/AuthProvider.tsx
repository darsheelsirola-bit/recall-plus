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
import {
  DataSyncConflictError,
  hydrateUserData,
  resolveUserDataConflict,
  type RecallProfile,
  syncUserSnapshot,
  updateRecallProfileDisplayName,
} from '../data/userDataSync'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { INDIA_TIMEZONE } from '../utils/profile.js'
import {
  DATA_DIRTY_EVENT,
  getDataSyncState,
  setStorageUser,
} from '../utils/storage'
import {
  getSyncRetryDelay,
  SYNC_RETRY_BASE_MS,
  SYNC_RETRY_LIMIT,
} from '../utils/syncUtils'
import { friendlyPasswordAuthError } from './passwordErrors'

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
  dataConflict: boolean
  syncing: boolean
  signingOut: boolean
  updatingProfileName: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (input: SignUpInput) => Promise<AuthResult>
  requestPasswordReset: (email: string) => Promise<AuthResult>
  updatePassword: (password: string) => Promise<AuthResult>
  updateProfileName: (name: string) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  retryDataSync: () => void
  resolveDataConflict: (strategy: 'cloud' | 'local') => Promise<AuthResult>
}

const AuthContext = createContext<AuthContextValue | null>(null)

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
  const [dataConflict, setDataConflict] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [updatingProfileName, setUpdatingProfileName] = useState(false)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const syncTimerRef = useRef<number | null>(null)
  const syncRetryCountRef = useRef(0)
  const flushUserDataRef = useRef<() => Promise<void>>(async () => {})
  const flushOperationRef = useRef<{ userId: string; promise: Promise<void> } | null>(null)
  const profileNameOperationRef = useRef<{
    userId: string
    promise: Promise<AuthResult>
  } | null>(null)
  const currentUserRef = useRef<User | null>(null)
  const sessionUserIdRef = useRef('')
  const dataEpochRef = useRef(0)

  const user = session?.user ?? null
  const userId = user?.id ?? ''
  const activeDataReady = dataReady && (!isSupabaseConfigured || (Boolean(userId) && dataOwnerId === userId))

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStorageUser(null)
      return undefined
    }

    let active = true
    function applySession(nextSession: Session | null) {
      const nextUserId = nextSession?.user?.id ?? ''
      currentUserRef.current = nextSession?.user ?? null
      setStorageUser(nextUserId || null)
      if (sessionUserIdRef.current !== nextUserId) {
        sessionUserIdRef.current = nextUserId
        dataEpochRef.current += 1
        syncRetryCountRef.current = 0
        if (syncTimerRef.current !== null) {
          window.clearTimeout(syncTimerRef.current)
          syncTimerRef.current = null
        }
        setSyncing(false)
        setSigningOut(false)
        setUpdatingProfileName(false)
        profileNameOperationRef.current = null
        setDataConflict(false)
      }
      setSession(nextSession)
      setAuthLoading(false)
      if (nextSession?.user) return
      setProfile(null)
      setDataOwnerId('')
      setDataLoading(false)
      setDataReady(false)
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') setPasswordRecovery(false)
      applySession(nextSession)
      if (event === 'USER_UPDATED') setRetryVersion((value) => value + 1)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setDataError(`Could not restore your session: ${error.message}`)
        applySession(null)
      } else {
        applySession(data.session)
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    const hydrationUser = currentUserRef.current
    if (!userId || !hydrationUser || hydrationUser.id !== userId) return undefined
    const activeHydrationUser = hydrationUser

    let active = true
    const hydrationEpoch = dataEpochRef.current
    const isCurrent = () => (
      active
      && dataEpochRef.current === hydrationEpoch
      && sessionUserIdRef.current === activeHydrationUser.id
    )
    async function hydrateActiveUser() {
      await Promise.resolve()
      if (!isCurrent()) return
      setDataLoading(true)
      setDataReady(false)
      setDataOwnerId('')
      setDataError('')
      syncRetryCountRef.current = 0

      try {
        const result = await hydrateUserData(activeHydrationUser)
        if (!isCurrent()) return
        setProfile(result.profile)
        setDataOwnerId(activeHydrationUser.id)
        setDataReady(true)
        setDataConflict(false)
      } catch (error: unknown) {
        if (!isCurrent()) return
        setDataError(errorMessage(error, 'Could not load your Recall+ data.'))
        setDataConflict(error instanceof DataSyncConflictError)
        setDataReady(false)
      } finally {
        if (isCurrent()) setDataLoading(false)
      }
    }
    void hydrateActiveUser()

    return () => {
      active = false
    }
  }, [userId, retryVersion])

  const flushUserData = useCallback((): Promise<void> => {
    if (!userId || !activeDataReady || sessionUserIdRef.current !== userId) return Promise.resolve()
    const existing = flushOperationRef.current
    if (existing?.userId === userId) return existing.promise

    const operationEpoch = dataEpochRef.current
    const isCurrent = () => (
      dataEpochRef.current === operationEpoch
      && sessionUserIdRef.current === userId
    )
    const promise = (async () => {
      setSyncing(true)
      let nextDelay: number | null = null
      try {
        await syncUserSnapshot(userId)
        if (!isCurrent()) return
        syncRetryCountRef.current = 0
        setDataError('')
        setDataConflict(false)
        if (getDataSyncState(userId).dirty) nextDelay = SYNC_RETRY_BASE_MS
      } catch (error) {
        if (!isCurrent()) return
        setDataError(errorMessage(error, 'Could not sync your Recall+ data.'))
        setDataConflict(error instanceof DataSyncConflictError)
        const nextAttempt = syncRetryCountRef.current + 1
        syncRetryCountRef.current = nextAttempt
        if (!(error instanceof DataSyncConflictError) && nextAttempt <= SYNC_RETRY_LIMIT) {
          nextDelay = getSyncRetryDelay(nextAttempt - 1)
        }
      } finally {
        if (isCurrent()) {
          setSyncing(false)
          if (getDataSyncState(userId).dirty && nextDelay !== null) {
            if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
            syncTimerRef.current = window.setTimeout(() => {
              syncTimerRef.current = null
              void flushUserDataRef.current()
            }, nextDelay)
          }
        }
      }
    })().finally(() => {
      if (flushOperationRef.current?.promise === promise) flushOperationRef.current = null
    })
    flushOperationRef.current = { userId, promise }
    return promise
  }, [activeDataReady, userId])

  useEffect(() => {
    flushUserDataRef.current = flushUserData
  }, [flushUserData])

  useEffect(() => {
    if (!isSupabaseConfigured || !userId || !activeDataReady) return undefined

    function scheduleSync(event?: Event) {
      const eventUserId = (event as CustomEvent<{ userId?: string }> | undefined)?.detail?.userId
      if (eventUserId && eventUserId !== userId) return
      syncRetryCountRef.current = 0
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null
        void flushUserData()
      }, SYNC_RETRY_BASE_MS)
    }

    function onStorage(event: StorageEvent) {
      if (event.key?.includes(encodeURIComponent(userId))) scheduleSync()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden' && getDataSyncState(userId).dirty) {
        syncRetryCountRef.current = 0
        void flushUserData()
      }
    }

    window.addEventListener(DATA_DIRTY_EVENT, scheduleSync)
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', scheduleSync)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener(DATA_DIRTY_EVENT, scheduleSync)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', scheduleSync)
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
    return { error: friendlyPasswordAuthError(error, 'signin') }
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
          full_name: displayName,
          name: displayName,
          class_name: 'CBSE XI workspace',
          timezone: INDIA_TIMEZONE,
        },
      },
    })
    return {
      error: friendlyPasswordAuthError(error, 'signup'),
      needsEmailConfirmation: Boolean(data.user && !data.session),
    }
  }, [])

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured for this Recall+ installation.' }
    }
    const redirectTo = typeof window === 'undefined'
      ? undefined
      : new URL('/auth', window.location.origin).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    return { error: friendlyPasswordAuthError(error, 'forgot') }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured for this Recall+ installation.' }
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) setPasswordRecovery(false)
    return { error: friendlyPasswordAuthError(error, 'recovery') }
  }, [])

  const updateProfileName = useCallback((name: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured || !userId || sessionUserIdRef.current !== userId) {
      return Promise.resolve({ error: 'Sign in again before updating your name.' })
    }
    const existing = profileNameOperationRef.current
    if (existing?.userId === userId) return existing.promise

    const operationEpoch = dataEpochRef.current
    const isCurrent = () => (
      dataEpochRef.current === operationEpoch
      && sessionUserIdRef.current === userId
    )
    setUpdatingProfileName(true)
    const promise: Promise<AuthResult> = (async () => {
      try {
        const displayName = await updateRecallProfileDisplayName(userId, name)
        if (!isCurrent()) {
          return { error: 'Your signed-in account changed. Please try again.' }
        }
        setProfile((current) => (
          current ? { ...current, displayName } : current
        ))
        return { error: '' }
      } catch (error) {
        return {
          error: errorMessage(error, 'Could not update your name. Please try again.'),
        }
      }
    })().finally(() => {
      if (profileNameOperationRef.current?.promise === promise) {
        profileNameOperationRef.current = null
        if (isCurrent()) setUpdatingProfileName(false)
      }
    })
    profileNameOperationRef.current = { userId, promise }
    return promise
  }, [userId])

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return { error: '' }
    const signingOutUserId = userId
    setSigningOut(true)
    try {
      if (userId && activeDataReady && getDataSyncState(userId).dirty) {
        try {
          await syncUserSnapshot(userId)
        } catch (error) {
          // The user-scoped local copy remains dirty and will retry next login.
          if (sessionUserIdRef.current === signingOutUserId) {
            setDataError(errorMessage(error, 'Could not sync before signing out. Your local copy was preserved.'))
          }
        }
      }
      if (sessionUserIdRef.current !== signingOutUserId) {
        return { error: 'Your signed-in account changed. Please try again.' }
      }
      const { error } = await supabase.auth.signOut()
      if (!error) {
        setStorageUser(null)
        setPasswordRecovery(false)
      }
      return { error: error?.message || '' }
    } finally {
      setSigningOut(false)
    }
  }, [activeDataReady, userId])

  const retryDataSync = useCallback(() => {
    if (!userId) return
    syncRetryCountRef.current = 0
    setDataError('')
    if (activeDataReady) {
      void flushUserData()
    } else {
      setRetryVersion((value) => value + 1)
    }
  }, [activeDataReady, flushUserData, userId])

  const resolveDataConflict = useCallback(async (
    strategy: 'cloud' | 'local',
  ): Promise<AuthResult> => {
    if (!userId || sessionUserIdRef.current !== userId) {
      return { error: 'Your signed-in account changed. Please try again.' }
    }
    const operationEpoch = dataEpochRef.current
    setSyncing(true)
    try {
      await resolveUserDataConflict(userId, strategy)
      if (
        dataEpochRef.current !== operationEpoch
        || sessionUserIdRef.current !== userId
      ) return { error: 'Your signed-in account changed. Please try again.' }
      setDataConflict(false)
      setDataError('')
      setRetryVersion((value) => value + 1)
      return { error: '' }
    } catch (error) {
      const message = errorMessage(error, 'Could not resolve the data conflict.')
      if (
        dataEpochRef.current === operationEpoch
        && sessionUserIdRef.current === userId
      ) setDataError(message)
      return { error: message }
    } finally {
      if (
        dataEpochRef.current === operationEpoch
        && sessionUserIdRef.current === userId
      ) setSyncing(false)
    }
  }, [userId])

  const loading = authLoading || Boolean(user && dataLoading)
  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    loading,
    configured: isSupabaseConfigured,
    profile,
    dataReady: activeDataReady,
    dataLoading,
    dataError,
    dataConflict,
    syncing,
    signingOut,
    updatingProfileName,
    passwordRecovery,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    updateProfileName,
    signOut,
    retryDataSync,
    resolveDataConflict,
  }), [
    user,
    session,
    loading,
    profile,
    activeDataReady,
    dataLoading,
    dataError,
    dataConflict,
    syncing,
    signingOut,
    updatingProfileName,
    passwordRecovery,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    updateProfileName,
    signOut,
    retryDataSync,
    resolveDataConflict,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
