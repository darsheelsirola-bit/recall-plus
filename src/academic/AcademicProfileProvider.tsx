/* eslint-disable react-refresh/only-export-components */
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
import type {
  AcademicPathway,
  SubjectSelection,
} from '../data/curriculum/types.ts'
import { useAuth } from '../auth/AuthProvider.tsx'
import {
  type AcademicWorkspace,
  loadAcademicWorkspace,
  saveAcademicOnboardingProgress,
  saveAcademicProfile,
} from './academicProfile.ts'

interface AcademicProfileContextValue {
  workspace: AcademicWorkspace | null
  loading: boolean
  saving: boolean
  error: string
  retry: () => void
  saveProgress: (
    pathway: AcademicPathway | null,
    schoolName: string,
  ) => Promise<string>
  completeProfile: (
    pathway: AcademicPathway,
    schoolName: string,
    selections: readonly SubjectSelection[],
  ) => Promise<string>
}

const AcademicProfileContext =
  createContext<AcademicProfileContextValue | null>(null)

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function AcademicProfileProvider({ children }: PropsWithChildren) {
  const { dataReady, user } = useAuth()
  const userId = user?.id ?? ''
  const [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorOwnerId, setErrorOwnerId] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const epochRef = useRef(0)
  const activeWorkspace = ownerId === userId ? workspace : null
  const activeError = errorOwnerId === userId ? error : ''
  const loading = Boolean(userId && dataReady && !activeWorkspace && !activeError)

  useEffect(() => {
    if (!userId || !dataReady) return undefined
    let active = true
    const epoch = epochRef.current
    const isCurrent = () => active && epochRef.current === epoch

    void loadAcademicWorkspace(userId)
      .then((nextWorkspace) => {
        if (!isCurrent()) return
        setWorkspace(nextWorkspace)
        setOwnerId(userId)
        setError('')
        setErrorOwnerId('')
      })
      .catch((loadError: unknown) => {
        if (!isCurrent()) return
        setWorkspace(null)
        setOwnerId('')
        setError(messageFrom(loadError, 'Could not load your academic profile.'))
        setErrorOwnerId(userId)
      })

    return () => {
      active = false
    }
  }, [dataReady, refreshVersion, userId])

  const retry = useCallback(() => {
    setError('')
    setErrorOwnerId('')
    setRefreshVersion((version) => version + 1)
  }, [])

  const saveProgress = useCallback(async (
    pathway: AcademicPathway | null,
    schoolName: string,
  ): Promise<string> => {
    if (!userId || ownerId !== userId) {
      return 'Your signed-in account changed. Reload Recall+ and try again.'
    }
    setSaving(true)
    try {
      await saveAcademicOnboardingProgress(userId, pathway, schoolName)
      setWorkspace((current) => ownerId === userId && current ? {
        ...current,
        profile: {
          ...current.profile,
          pathway,
          schoolName: schoolName.trim() || null,
        },
      } : current)
      return ''
    } catch (saveError) {
      return messageFrom(saveError, 'Could not save your progress.')
    } finally {
      setSaving(false)
    }
  }, [ownerId, userId])

  const completeProfile = useCallback(async (
    pathway: AcademicPathway,
    schoolName: string,
    selections: readonly SubjectSelection[],
  ): Promise<string> => {
    if (!userId || ownerId !== userId) {
      return 'Your signed-in account changed. Reload Recall+ and try again.'
    }
    setSaving(true)
    try {
      await saveAcademicProfile(userId, pathway, schoolName, selections)
      const nextWorkspace = await loadAcademicWorkspace(userId)
      setWorkspace(nextWorkspace)
      setOwnerId(userId)
      setError('')
      setErrorOwnerId('')
      return ''
    } catch (saveError) {
      return messageFrom(saveError, 'Could not save your academic profile.')
    } finally {
      setSaving(false)
    }
  }, [ownerId, userId])

  const value = useMemo<AcademicProfileContextValue>(() => ({
    workspace: activeWorkspace,
    loading,
    saving,
    error: activeError,
    retry,
    saveProgress,
    completeProfile,
  }), [
    activeWorkspace,
    loading,
    saving,
    activeError,
    retry,
    saveProgress,
    completeProfile,
  ])

  return (
    <AcademicProfileContext.Provider value={value}>
      {children}
    </AcademicProfileContext.Provider>
  )
}

export function useAcademicProfile(): AcademicProfileContextValue {
  const context = useContext(AcademicProfileContext)
  if (!context) {
    throw new Error(
      'useAcademicProfile must be used inside AcademicProfileProvider.',
    )
  }
  return context
}
