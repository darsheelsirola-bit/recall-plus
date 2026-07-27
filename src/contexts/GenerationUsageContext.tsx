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
import { useAuth } from '../auth/AuthProvider'
import { authenticatedFetch } from '../services/apiClient'
import {
  DAILY_GENERATION_LIMIT,
  type GenerationFeature,
  type GenerationFeatureStatus,
  type GenerationUsageEventDetail,
  type GenerationUsageResponse,
} from '../types/generation'

const USAGE_EVENT = 'recall-plus:generation-usage'
const USAGE_CHANNEL = 'recall-plus-generation-usage'

const EMPTY_STATUS: GenerationFeatureStatus = {
  limit: DAILY_GENERATION_LIMIT,
  used: 0,
  remaining: DAILY_GENERATION_LIMIT,
  inProgress: false,
  localDate: '',
  resetAt: '',
}

interface GenerationUsageContextValue {
  usage: GenerationUsageResponse
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

const GenerationUsageContext = createContext<GenerationUsageContextValue | null>(null)

function normalizeStatus(value?: Partial<GenerationFeatureStatus>): GenerationFeatureStatus {
  const limit = Number.isFinite(value?.limit) ? Number(value?.limit) : DAILY_GENERATION_LIMIT
  const remaining = Number.isFinite(value?.remaining)
    ? Math.max(0, Math.min(limit, Number(value?.remaining)))
    : limit

  return {
    limit,
    remaining,
    used: Number.isFinite(value?.used) ? Number(value?.used) : limit - remaining,
    inProgress: Boolean(value?.inProgress),
    localDate: typeof value?.localDate === 'string' ? value.localDate : '',
    resetAt: typeof value?.resetAt === 'string' ? value.resetAt : '',
  }
}

export function GenerationUsageProvider({ children }: PropsWithChildren) {
  const { session, user } = useAuth()
  const [usage, setUsage] = useState<GenerationUsageResponse>({
    quiz: EMPTY_STATUS,
    timetable: EMPTY_STATUS,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef<Promise<void> | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const refresh = useCallback(async () => {
    await Promise.resolve()
    if (!session || !user) {
      setUsage({ quiz: EMPTY_STATUS, timetable: EMPTY_STATUS })
      setLoading(false)
      return
    }

    if (requestRef.current) return requestRef.current

    setLoading(true)
    const request = (async () => {
      setError('')
      try {
        const response = await authenticatedFetch('/api/generation-usage', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`Usage request failed with ${response.status}`)
        const data = await response.json() as Partial<GenerationUsageResponse>
        setUsage({
          quiz: normalizeStatus(data.quiz),
          timetable: normalizeStatus(data.timetable),
        })
      } catch (usageError) {
        setError(usageError instanceof Error ? usageError.message : 'Could not load generation limits.')
      } finally {
        setLoading(false)
      }
    })().finally(() => {
      if (requestRef.current === request) requestRef.current = null
    })

    requestRef.current = request
    return request
  }, [session, user])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined
    const channel = new BroadcastChannel(USAGE_CHANNEL)
    channelRef.current = channel
    channel.onmessage = () => { void refresh() }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [refresh])

  useEffect(() => {
    function onUsageChange(event: Event) {
      const detail = (event as CustomEvent<GenerationUsageEventDetail>).detail
      if (detail?.feature && typeof detail.remaining === 'number') {
        const remaining = detail.remaining
        setUsage((current) => ({
          ...current,
          [detail.feature]: normalizeStatus({
            ...current[detail.feature],
            remaining,
            used: detail.used ?? (detail.limit ?? current[detail.feature].limit) - remaining,
            limit: detail.limit ?? current[detail.feature].limit,
            resetAt: detail.resetAt ?? current[detail.feature].resetAt,
            localDate: detail.localDate ?? current[detail.feature].localDate,
            inProgress: detail.inProgress ?? false,
          }),
        }))
      }
      channelRef.current?.postMessage({ feature: detail?.feature })
      void refresh()
    }

    function onFocus() {
      void refresh()
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void refresh()
    }

    window.addEventListener(USAGE_EVENT, onUsageChange)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener(USAGE_EVENT, onUsageChange)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])

  useEffect(() => {
    const resetTimes = [usage.quiz.resetAt, usage.timetable.resetAt]
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value) && value > Date.now())
    if (!resetTimes.length) return undefined

    const delay = Math.min(...resetTimes) - Date.now() + 250
    const timer = window.setTimeout(() => { void refresh() }, Math.min(delay, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [refresh, usage.quiz.resetAt, usage.timetable.resetAt])

  const value = useMemo(() => ({ usage, loading, error, refresh }), [usage, loading, error, refresh])
  return <GenerationUsageContext.Provider value={value}>{children}</GenerationUsageContext.Provider>
}

export function useGenerationUsage(feature: GenerationFeature) {
  const context = useContext(GenerationUsageContext)
  if (!context) throw new Error('useGenerationUsage must be used inside GenerationUsageProvider.')

  const status = context.usage[feature]
  return {
    ...status,
    loading: context.loading,
    error: context.error,
    exhausted: status.remaining <= 0,
    unavailable: context.loading || Boolean(context.error),
    refresh: context.refresh,
  }
}

export function publishGenerationUsage(feature: GenerationFeature, detail: Omit<GenerationUsageEventDetail, 'feature'>) {
  window.dispatchEvent(new CustomEvent<GenerationUsageEventDetail>(USAGE_EVENT, {
    detail: { feature, ...detail },
  }))
}
