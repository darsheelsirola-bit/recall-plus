const APP_PREFIX = 'recall_plus_'
const USER_PREFIX = `${APP_PREFIX}user_`
const INTERNAL_PREFIX = `${APP_PREFIX}internal_`
const LEGACY_OWNER_KEY = `${INTERNAL_PREFIX}legacy_owner`

export const DATA_CHANGE_EVENT = 'recall-plus:data-change'
export const DATA_DIRTY_EVENT = 'recall-plus:data-dirty'

export const STORAGE_KEYS = {
  logs: 'study_logs',
  quizResults: 'quiz_results',
  reviews: 'reviews',
  topicStatuses: 'topic_statuses',
  profile: 'profile',
  studyTimetable: 'study_timetable',
  studyAvailability: 'study_availability',
  insightQuoteState: 'insight_quote_state',
  insightCache: 'insight_cache',
}

let activeUserId = null
const memoryValues = new Map()

const memoryStorage = {
  get length() {
    return memoryValues.size
  },
  key(index) {
    return [...memoryValues.keys()][index] ?? null
  },
  getItem(key) {
    return memoryValues.has(key) ? memoryValues.get(key) : null
  },
  setItem(key, value) {
    memoryValues.set(key, String(value))
  },
  removeItem(key) {
    memoryValues.delete(key)
  },
}

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Browsers can deny storage access in private or restricted contexts.
  }
  return memoryStorage
}

function storageKeys(storage = getStorage()) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean)
}

function safeUserId(userId) {
  return encodeURIComponent(String(userId || '').trim())
}

function userPrefix(userId) {
  return `${USER_PREFIX}${safeUserId(userId)}_`
}

function logicalKey(key) {
  const value = String(key || '')
  if (activeUserId && value.startsWith(userPrefix(activeUserId))) {
    return value.slice(userPrefix(activeUserId).length)
  }
  return value.startsWith(APP_PREFIX) ? value.slice(APP_PREFIX.length) : value
}

function canonicalKey(key) {
  return `${APP_PREFIX}${logicalKey(key)}`
}

function fullKey(key, userId = activeUserId) {
  const name = logicalKey(key)
  return userId ? `${userPrefix(userId)}${name}` : `${APP_PREFIX}${name}`
}

function isLegacyDataKey(key) {
  return key.startsWith(APP_PREFIX)
    && !key.startsWith(USER_PREFIX)
    && !key.startsWith(INTERNAL_PREFIX)
}

function syncStateKey(userId) {
  return `${INTERNAL_PREFIX}sync_${safeUserId(userId)}`
}

function migrationStateKey(userId) {
  return `${INTERNAL_PREFIX}legacy_migrated_${safeUserId(userId)}`
}

function parseStored(raw, fallback = null) {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function dispatchDataChange(key) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail: { key } }))
}

function dispatchDirty(userId) {
  if (typeof window === 'undefined' || !userId) return
  window.dispatchEvent(new CustomEvent(DATA_DIRTY_EVENT, { detail: { userId } }))
}

function markDirty(userId = activeUserId) {
  if (!userId) return
  const current = getDataSyncState(userId)
  getStorage().setItem(syncStateKey(userId), JSON.stringify({
    ...current,
    dirty: true,
    revision: current.revision + 1,
  }))
  dispatchDirty(userId)
}

/**
 * Selects the browser-local namespace for the authenticated user.
 * Protected pages are not mounted until this has been called, preventing one
 * signed-in user from briefly seeing another user's cached data.
 */
export function setStorageUser(userId) {
  activeUserId = userId ? String(userId) : null
}

export function getStorageUser() {
  return activeUserId
}

/**
 * Copies the pre-auth Recall+ namespace into the first authenticated account
 * on this browser. Legacy keys are deliberately preserved as a recoverable
 * backup and are never copied into a second account.
 */
export function migrateLegacyDataForUser(userId) {
  if (!userId) return { copied: 0, preserved: 0 }
  const storage = getStorage()
  const migrationKey = migrationStateKey(userId)
  if (storage.getItem(migrationKey) === 'done') return { copied: 0, preserved: 0 }

  const entries = storageKeys(storage)
    .filter(isLegacyDataKey)
    .map((key) => [key, storage.getItem(key)])
  const claimedBy = storage.getItem(LEGACY_OWNER_KEY)

  if (entries.length && (!claimedBy || claimedBy === userId)) {
    if (!claimedBy) storage.setItem(LEGACY_OWNER_KEY, userId)
    let copied = 0
    entries.forEach(([key, raw]) => {
      const destination = fullKey(key, userId)
      if (raw !== null && storage.getItem(destination) === null) {
        storage.setItem(destination, raw)
        copied += 1
      }
    })
    storage.setItem(migrationKey, 'done')
    if (copied) markDirty(userId)
    return { copied, preserved: entries.length }
  }

  storage.setItem(migrationKey, 'done')
  return { copied: 0, preserved: entries.length }
}

export function getData(key, defaultValue = null) {
  try {
    const raw = getStorage().getItem(fullKey(key))
    return raw === null ? defaultValue : JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

export function saveData(key, value) {
  return saveDataForUser(activeUserId, key, value)
}

export function saveDataForUser(userId, key, value) {
  try {
    getStorage().setItem(fullKey(key, userId), JSON.stringify(value))
    markDirty(userId)
    // Skip remounting/refetching for derived cache-only keys.
    if (
      (!userId || activeUserId === userId)
      && key !== STORAGE_KEYS.insightCache
      && key !== STORAGE_KEYS.insightQuoteState
    ) {
      dispatchDataChange(logicalKey(key))
    }
    return true
  } catch {
    return false
  }
}

export function deleteData(key) {
  getStorage().removeItem(fullKey(key))
  markDirty()
  dispatchDataChange(logicalKey(key))
}

export function clearAllData() {
  const storage = getStorage()
  const prefix = activeUserId ? userPrefix(activeUserId) : APP_PREFIX
  storageKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .filter((key) => activeUserId || isLegacyDataKey(key))
    .forEach((key) => storage.removeItem(key))
  markDirty()
  dispatchDataChange('*')
}

/**
 * Returns the active user's data using the original Recall+ backup key format.
 * Internal auth/sync metadata and other users' namespaces are never exported.
 */
export function exportAllData() {
  return getScopedDataSnapshot(activeUserId)
}

export function importAllData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid Recall Plus backup file.')
  }
  const entries = Object.entries(data).filter(([key]) => isLegacyDataKey(canonicalKey(key)))
  if (!entries.length) throw new Error('No Recall Plus data found in this file.')

  clearAllData()
  const storage = getStorage()
  entries.forEach(([key, value]) => storage.setItem(fullKey(key), JSON.stringify(value)))
  markDirty()
  dispatchDataChange('*')
}

export function getScopedDataSnapshot(userId = activeUserId) {
  const storage = getStorage()
  const prefix = userId ? userPrefix(userId) : APP_PREFIX
  return storageKeys(storage).reduce((output, key) => {
    const belongsToScope = userId ? key.startsWith(prefix) : isLegacyDataKey(key)
    if (!belongsToScope) return output
    const name = userId ? key.slice(prefix.length) : key.slice(APP_PREFIX.length)
    output[`${APP_PREFIX}${name}`] = parseStored(storage.getItem(key), storage.getItem(key))
    return output
  }, {})
}

/**
 * Hydrates a user's local namespace from a trusted, RLS-protected snapshot.
 * This intentionally does not mark the data dirty or echo it back to Supabase.
 */
export function replaceScopedDataSnapshot(userId, snapshot) {
  if (!userId || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
  const storage = getStorage()
  const prefix = userPrefix(userId)
  storageKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => storage.removeItem(key))

  Object.entries(snapshot).forEach(([key, value]) => {
    const normalized = canonicalKey(key)
    if (!isLegacyDataKey(normalized)) return
    storage.setItem(fullKey(normalized, userId), JSON.stringify(value))
  })

  if (activeUserId === userId) dispatchDataChange('*')
}

export function getDataSyncState(userId) {
  const stored = parseStored(getStorage().getItem(syncStateKey(userId)), {})
  return {
    dirty: Boolean(stored?.dirty),
    revision: Number.isInteger(stored?.revision) ? stored.revision : 0,
    remoteUpdatedAt: typeof stored?.remoteUpdatedAt === 'string' ? stored.remoteUpdatedAt : '',
  }
}

export function markDataSynced(userId, revision, remoteUpdatedAt = '') {
  const current = getDataSyncState(userId)
  getStorage().setItem(syncStateKey(userId), JSON.stringify({
    dirty: current.revision !== revision,
    revision: current.revision,
    remoteUpdatedAt: remoteUpdatedAt || current.remoteUpdatedAt,
  }))
}
