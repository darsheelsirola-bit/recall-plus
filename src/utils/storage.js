const APP_PREFIX = 'recall_plus_'
const USER_PREFIX = `${APP_PREFIX}user_`
const INTERNAL_PREFIX = `${APP_PREFIX}internal_`
const LEGACY_OWNER_KEY = `${INTERNAL_PREFIX}legacy_owner`
export const MAX_BACKUP_BYTES = 1024 * 1024
const MAX_BACKUP_ENTRIES = 512
const MAX_BACKUP_DEPTH = 12
const MAX_BACKUP_NODES = 25_000

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

export class PersistenceError extends Error {
  constructor(message = 'Recall+ could not save your changes on this device.', options) {
    super(message, options)
    this.name = 'PersistenceError'
  }
}

export function saveDataOrThrow(key, value) {
  if (!saveData(key, value)) throw new PersistenceError()
  return true
}

export function saveDataForUserOrThrow(userId, key, value) {
  if (!userId || !saveDataForUser(userId, key, value)) throw new PersistenceError()
  return true
}

export function saveDataForUser(userId, key, value) {
  const storage = getStorage()
  const storageKey = fullKey(key, userId)
  const previousValue = storage.getItem(storageKey)
  try {
    storage.setItem(storageKey, JSON.stringify(value))
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
    try {
      if (previousValue === null) storage.removeItem(storageKey)
      else storage.setItem(storageKey, previousValue)
    } catch {
      return false
    }
    return false
  }
}

export function saveDataBatchForUserOrThrow(userId, entries) {
  if (!userId || !Array.isArray(entries) || !entries.length) {
    throw new PersistenceError('Recall+ could not save this group of changes.')
  }
  const storage = getStorage()
  const serialized = new Map()
  entries.forEach(([key, value]) => {
    serialized.set(fullKey(key, userId), {
      logicalKey: logicalKey(key),
      value: JSON.stringify(value),
    })
  })
  const previous = [...serialized.keys()].map((key) => [key, storage.getItem(key)])
  const previousSyncState = storage.getItem(syncStateKey(userId))

  try {
    serialized.forEach((entry, key) => storage.setItem(key, entry.value))
    markDirty(userId)
  } catch (error) {
    try {
      previous.forEach(([key, value]) => {
        if (value === null) storage.removeItem(key)
        else storage.setItem(key, value)
      })
      if (previousSyncState === null) storage.removeItem(syncStateKey(userId))
      else storage.setItem(syncStateKey(userId), previousSyncState)
    } catch (restoreError) {
      throw new PersistenceError(
        'Recall+ could not save these changes and browser storage recovery was incomplete.',
        { cause: restoreError },
      )
    }
    throw new PersistenceError('Recall+ could not save these changes. Your previous data was restored.', {
      cause: error,
    })
  }

  if (activeUserId === userId) {
    serialized.forEach((entry) => {
      if (
        entry.logicalKey !== STORAGE_KEYS.insightCache
        && entry.logicalKey !== STORAGE_KEYS.insightQuoteState
      ) dispatchDataChange(entry.logicalKey)
    })
  }
  return true
}

export function saveDataBatchOrThrow(entries) {
  return saveDataBatchForUserOrThrow(activeUserId, entries)
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

export function exportAllDataForUser(userId) {
  if (!userId || activeUserId !== userId) {
    throw new Error('Your active Recall Plus account changed. Please try again.')
  }
  return getScopedDataSnapshot(userId)
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validateBackupShape(value) {
  const seen = new WeakSet()
  const stack = [{ value, depth: 0 }]
  let nodes = 0

  while (stack.length) {
    const current = stack.pop()
    const item = current.value
    nodes += 1
    if (nodes > MAX_BACKUP_NODES || current.depth > MAX_BACKUP_DEPTH) {
      throw new Error('This Recall Plus backup is too complex.')
    }
    if (item === null || ['string', 'boolean'].includes(typeof item)) continue
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('This Recall Plus backup contains invalid data.')
      continue
    }
    if (typeof item !== 'object' || (!Array.isArray(item) && !isPlainRecord(item))) {
      throw new Error('This Recall Plus backup contains invalid data.')
    }
    if (seen.has(item)) throw new Error('This Recall Plus backup contains circular data.')
    seen.add(item)
    Object.values(item).forEach((child) => stack.push({
      value: child,
      depth: current.depth + 1,
    }))
  }
}

function isRecordArray(value) {
  return Array.isArray(value) && value.every(isPlainRecord)
}

function isAllowedBackupEntry(name, value) {
  if (name.startsWith('questions_') || name.startsWith('post_study_questions_')) {
    return isRecordArray(value)
  }
  if ([
    STORAGE_KEYS.logs,
    STORAGE_KEYS.quizResults,
    STORAGE_KEYS.reviews,
    STORAGE_KEYS.studyTimetable,
  ].includes(name)) return isRecordArray(value)
  if (name === STORAGE_KEYS.topicStatuses) {
    return isPlainRecord(value)
      && Object.values(value).every((status) => typeof status === 'string')
  }
  if ([STORAGE_KEYS.profile, STORAGE_KEYS.insightQuoteState].includes(name)) {
    return isPlainRecord(value)
  }
  if (name === STORAGE_KEYS.studyAvailability) {
    return value === null || isPlainRecord(value)
  }
  if (name === STORAGE_KEYS.insightCache) {
    if (value === null) return true
    if (
      !isPlainRecord(value)
      || typeof value.date !== 'string'
      || typeof value.fingerprint !== 'string'
      || !isPlainRecord(value.payload)
    ) return false
    return value.payload.chapters === undefined || isRecordArray(value.payload.chapters)
  }
  return false
}

function validatedBackupEntries(data, { allowEmpty = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid Recall Plus backup file.')
  }
  validateBackupShape(data)
  const serialized = JSON.stringify(data)
  if (new TextEncoder().encode(serialized).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('This Recall Plus backup is larger than 1 MiB.')
  }
  const rawEntries = Object.entries(data)
  if ((!allowEmpty && !rawEntries.length) || rawEntries.length > MAX_BACKUP_ENTRIES) {
    throw new Error('This Recall Plus backup has an invalid number of entries.')
  }
  const entries = rawEntries.map(([key, value]) => {
    const normalized = canonicalKey(key)
    if (!isLegacyDataKey(normalized)) throw new Error('This backup contains unsupported keys.')
    const name = normalized.slice(APP_PREFIX.length)
    if (!isAllowedBackupEntry(name, value)) {
      throw new Error(`The backup entry "${name}" has an invalid format.`)
    }
    return [normalized, value]
  })
  if (!entries.length) throw new Error('No Recall Plus data found in this file.')
  return entries
}

export function validateScopedDataSnapshot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The synced Recall Plus data has an invalid format.')
  }
  if (!Object.keys(data).length) return data
  validatedBackupEntries(data, { allowEmpty: true })
  return data
}

export function importAllDataForUser(userId, data) {
  if (!userId || activeUserId !== userId) {
    throw new Error('Your active Recall Plus account changed. No data was imported.')
  }
  const entries = validatedBackupEntries(data)

  const storage = getStorage()
  const prefix = userPrefix(userId)
  const currentEntries = storageKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, storage.getItem(key)])
  const serializedEntries = entries.map(([key, value]) => [fullKey(key, userId), JSON.stringify(value)])
  const previousSyncState = storage.getItem(syncStateKey(userId))

  try {
    if (activeUserId !== userId) {
      throw new Error('Your active Recall Plus account changed. No data was imported.')
    }
    currentEntries.forEach(([key]) => storage.removeItem(key))
    serializedEntries.forEach(([key, value]) => storage.setItem(key, value))
    markDirty(userId)
  } catch {
    try {
      serializedEntries.forEach(([key]) => storage.removeItem(key))
      currentEntries.forEach(([key, value]) => {
        if (value !== null) storage.setItem(key, value)
      })
      if (previousSyncState === null) storage.removeItem(syncStateKey(userId))
      else storage.setItem(syncStateKey(userId), previousSyncState)
    } catch {
      throw new PersistenceError('Recall+ could not import this backup and browser storage recovery was incomplete.')
    }
    throw new PersistenceError('Recall+ could not import this backup. Your previous local data was restored.')
  }

  if (activeUserId === userId) dispatchDataChange('*')
}

export function importAllData(data) {
  return importAllDataForUser(activeUserId, data)
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
  if (!userId) throw new Error('A user is required to restore synced Recall Plus data.')
  validateScopedDataSnapshot(snapshot)
  const storage = getStorage()
  const prefix = userPrefix(userId)
  const previousEntries = storageKeys(storage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, storage.getItem(key)])
  const nextEntries = Object.entries(snapshot).flatMap(([key, value]) => {
    const normalized = canonicalKey(key)
    return isLegacyDataKey(normalized)
      ? [[fullKey(normalized, userId), JSON.stringify(value)]]
      : []
  })

  try {
    previousEntries.forEach(([key]) => storage.removeItem(key))
    nextEntries.forEach(([key, value]) => storage.setItem(key, value))
  } catch (error) {
    try {
      nextEntries.forEach(([key]) => storage.removeItem(key))
      previousEntries.forEach(([key, value]) => {
        if (value !== null) storage.setItem(key, value)
      })
    } catch (restoreError) {
      throw new PersistenceError(
        'Recall+ could not restore synced data and browser storage recovery was incomplete.',
        { cause: restoreError },
      )
    }
    throw new PersistenceError('Recall+ could not restore synced data on this device.', {
      cause: error,
    })
  }
  if (activeUserId === userId) dispatchDataChange('*')
}

export function getDataSyncState(userId) {
  const stored = parseStored(getStorage().getItem(syncStateKey(userId)), {})
  return {
    dirty: Boolean(stored?.dirty),
    revision: Number.isInteger(stored?.revision) ? stored.revision : 0,
    remoteUpdatedAt: typeof stored?.remoteUpdatedAt === 'string' ? stored.remoteUpdatedAt : '',
    remoteVersion: Number.isInteger(stored?.remoteVersion) && stored.remoteVersion >= 0
      ? stored.remoteVersion
      : 0,
  }
}

export function markDataSynced(userId, revision, remoteUpdatedAt = '', remoteVersion = 0) {
  const current = getDataSyncState(userId)
  getStorage().setItem(syncStateKey(userId), JSON.stringify({
    dirty: current.revision !== revision,
    revision: current.revision,
    remoteUpdatedAt: remoteUpdatedAt || current.remoteUpdatedAt,
    remoteVersion: Number.isInteger(remoteVersion) && remoteVersion >= 0
      ? remoteVersion
      : current.remoteVersion,
  }))
}

export function setDataSyncRemoteBaseline(userId, remoteUpdatedAt = '', remoteVersion = 0) {
  const current = getDataSyncState(userId)
  getStorage().setItem(syncStateKey(userId), JSON.stringify({
    ...current,
    remoteUpdatedAt,
    remoteVersion,
  }))
}
