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
  CurriculumNode,
  SubjectSelection,
} from '../data/curriculum/types.ts'
import { loadClientCurriculumNodes } from '../data/curriculum/cbse/2026-27/class-11/clientNodes.ts'
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
  curriculumError: string
  curriculumLoadingSubjectIds: readonly string[]
  loadedCurriculumSubjectIds: readonly string[]
  retry: () => void
  loadCurriculumSubjects: (subjectIds: readonly string[]) => Promise<void>
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
  const [curriculumError, setCurriculumError] = useState('')
  const [curriculumLoadingSubjectIds, setCurriculumLoadingSubjectIds] = useState<string[]>([])
  const [loadedCurriculumSubjectIds, setLoadedCurriculumSubjectIds] = useState<string[]>([])
  const epochRef = useRef(0)
  const curriculumPromisesRef = useRef(new Map<string, Promise<readonly CurriculumNode[]>>())
  const activeWorkspace = ownerId === userId ? workspace : null
  const activeError = errorOwnerId === userId ? error : ''
  const loading = Boolean(userId && dataReady && !activeWorkspace && !activeError)

  useEffect(() => {
    epochRef.current += 1
    curriculumPromisesRef.current.clear()
  }, [userId])

  useEffect(() => {
    if (!userId || !dataReady) return undefined
    let active = true
    const epoch = epochRef.current
    const isCurrent = () => active && epochRef.current === epoch

    void loadAcademicWorkspace(userId)
      .then((nextWorkspace) => {
        if (!isCurrent()) return
        setCurriculumError('')
        setCurriculumLoadingSubjectIds([])
        setLoadedCurriculumSubjectIds([])
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

  const loadCurriculumSubjects = useCallback(async (
    subjectIds: readonly string[],
  ): Promise<void> => {
    if (!userId || ownerId !== userId || !activeWorkspace) return
    const activeIds = new Set(
      activeWorkspace.subjects.map((selection) => selection.curriculumSubjectId),
    )
    const loadedIds = new Set(loadedCurriculumSubjectIds)
    const missingIds = [...new Set(subjectIds)]
      .filter((subjectId) => activeIds.has(subjectId) && !loadedIds.has(subjectId))
    if (!missingIds.length) return

    const epoch = epochRef.current
    setCurriculumError('')
    setCurriculumLoadingSubjectIds((current) => [
      ...new Set([...current, ...missingIds]),
    ])

    try {
      const nodeGroups = await Promise.all(missingIds.map((subjectId) => {
        const existing = curriculumPromisesRef.current.get(subjectId)
        if (existing) return existing
        const pending = loadClientCurriculumNodes([subjectId])
          .finally(() => curriculumPromisesRef.current.delete(subjectId))
        curriculumPromisesRef.current.set(subjectId, pending)
        return pending
      }))
      if (epochRef.current !== epoch) return
      const loadedNodes = nodeGroups.flat()
      setLoadedCurriculumSubjectIds((current) => [
        ...new Set([...current, ...missingIds]),
      ])
      setWorkspace((current) => {
        if (ownerId !== userId || !current) return current
        const byId = new Map(
          current.curriculumNodes.map((node) => [node.id, node]),
        )
        loadedNodes.forEach((node) => byId.set(node.id, node))
        return { ...current, curriculumNodes: [...byId.values()] }
      })
    } catch (loadError) {
      if (epochRef.current === epoch) {
        setCurriculumError(messageFrom(
          loadError,
          'Could not load the selected subject curriculum.',
        ))
      }
    } finally {
      if (epochRef.current === epoch) {
        const finished = new Set(missingIds)
        setCurriculumLoadingSubjectIds((current) =>
          current.filter((subjectId) => !finished.has(subjectId)))
      }
    }
  }, [activeWorkspace, loadedCurriculumSubjectIds, ownerId, userId])

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
      setCurriculumError('')
      setCurriculumLoadingSubjectIds([])
      setLoadedCurriculumSubjectIds([])
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
    curriculumError,
    curriculumLoadingSubjectIds,
    loadedCurriculumSubjectIds,
    retry,
    loadCurriculumSubjects,
    saveProgress,
    completeProfile,
  }), [
    activeWorkspace,
    loading,
    saving,
    activeError,
    curriculumError,
    curriculumLoadingSubjectIds,
    loadedCurriculumSubjectIds,
    retry,
    loadCurriculumSubjects,
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
