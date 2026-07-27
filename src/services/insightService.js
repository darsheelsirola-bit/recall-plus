import { getTodayDate } from '../utils/dateUtils.js'
import { buildFallbackInsights } from '../utils/weakTopics.js'
import { getData, saveDataForUser, STORAGE_KEYS } from '../utils/storage.js'
import {
  assertCurrentIdentity,
  authenticatedFetch,
  getAuthenticatedIdentity,
} from './apiClient'

function localInsights(chapterContexts, source) {
  return { ...buildFallbackInsights(chapterContexts), source }
}

export async function generateInsights(chapterContexts) {
  if (!chapterContexts?.length) return localInsights([], 'local-empty')

  try {
    const identity = await getAuthenticatedIdentity()
    const response = await authenticatedFetch('/api/generate-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterContexts }),
    }, identity)
    const data = await response.json().catch(() => ({}))
    await assertCurrentIdentity(identity)

    if (!response.ok) {
      return localInsights(chapterContexts, response.status === 429 ? 'local-rate-limit' : 'local-api-error')
    }

    if (!Array.isArray(data.chapters) || !data.chapters.length) {
      return localInsights(chapterContexts, 'local-empty-response')
    }

    return data
  } catch (error) {
    if (error?.code === 'AUTH_SESSION_CHANGED') throw error
    return localInsights(chapterContexts, 'local-offline')
  }
}

export function loadCachedInsights(fingerprint, today = getTodayDate()) {
  const cache = getData(STORAGE_KEYS.insightCache, null)
  if (!cache || cache.date !== today || cache.fingerprint !== fingerprint) return null
  if (
    !cache.payload
    || typeof cache.payload !== 'object'
    || (cache.payload.chapters !== undefined && !Array.isArray(cache.payload.chapters))
  ) return null
  return cache.payload
}

export function saveCachedInsightsForUser(userId, fingerprint, payload, today = getTodayDate()) {
  return saveDataForUser(userId, STORAGE_KEYS.insightCache, {
    date: today,
    fingerprint,
    payload,
  })
}

export function shouldRefreshInsights(fingerprint, today = getTodayDate()) {
  const cache = getData(STORAGE_KEYS.insightCache, null)
  if (!cache) return true
  if (cache.date !== today) return true
  if (cache.fingerprint !== fingerprint) return true
  return false
}
