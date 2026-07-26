import { getTodayDate } from '../utils/dateUtils.js'
import { buildFallbackInsights } from '../utils/weakTopics.js'
import { getData, saveData, STORAGE_KEYS } from '../utils/storage.js'
import { authenticatedFetch } from './apiClient'

function localInsights(chapterContexts, source) {
  return { ...buildFallbackInsights(chapterContexts), source }
}

export async function generateInsights(chapterContexts) {
  if (!chapterContexts?.length) return localInsights([], 'local-empty')

  try {
    const response = await authenticatedFetch('/api/generate-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterContexts }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.warn('[insights] API error', response.status, data.error)
      return localInsights(chapterContexts, response.status === 429 ? 'local-rate-limit' : 'local-api-error')
    }

    if (!Array.isArray(data.chapters) || !data.chapters.length) {
      return localInsights(chapterContexts, 'local-empty-response')
    }

    return data
  } catch (error) {
    console.warn('[insights] fetch failed', error)
    return localInsights(chapterContexts, 'local-offline')
  }
}

export function loadCachedInsights(fingerprint, today = getTodayDate()) {
  const cache = getData(STORAGE_KEYS.insightCache, null)
  if (!cache || cache.date !== today || cache.fingerprint !== fingerprint) return null
  return cache.payload
}

export function saveCachedInsights(fingerprint, payload, today = getTodayDate()) {
  saveData(STORAGE_KEYS.insightCache, { date: today, fingerprint, payload })
}

export function shouldRefreshInsights(fingerprint, today = getTodayDate()) {
  const cache = getData(STORAGE_KEYS.insightCache, null)
  if (!cache) return true
  if (cache.date !== today) return true
  if (cache.fingerprint !== fingerprint) return true
  return false
}
