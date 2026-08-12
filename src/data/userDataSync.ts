import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  getDataSyncState,
  getScopedDataSnapshot,
  markDataSynced,
  migrateLegacyDataForUser,
  replaceScopedDataSnapshot,
  saveDataForUser,
  setDataSyncRemoteBaseline,
  STORAGE_KEYS,
  validateScopedDataSnapshot,
} from '../utils/storage'
import {
  AuthSessionChangedError,
  assertExpectedSessionUser,
  runForExpectedSessionUser,
} from '../utils/authSessionGuard'
import { isDataVersionConflictError } from '../utils/syncUtils'
import {
  buildTimezoneInitializationRpcArgs,
  buildUserDataUpsertRpcArgs,
} from '../utils/userDataRpc'
import {
  INDIA_TIMEZONE,
  normalizeProfileName,
  validateProfileName,
} from '../utils/profile.js'

export interface RecallProfile {
  displayName: string
  email: string
  className: string
  timezone: string
}

export interface HydratedUserData {
  profile: RecallProfile
  migratedLegacyKeys: number
  syncWarning?: string
}

interface ProfileRow {
  display_name: string | null
  timezone: string
  timezone_initialized: boolean
}

interface UserAppDataRow {
  data: Record<string, unknown>
  updated_at: string
  version: number
}

interface UserAppDataRpcResult {
  data: Record<string, unknown>
  version: number
  updatedAt: string
}

const activeHydrations = new Map<string, Promise<HydratedUserData>>()
const activeSyncs = new Map<string, Promise<void>>()

export class DataSyncConflictError extends Error {
  constructor() {
    super(
      'Your Recall+ cloud data changed in another session. '
      + 'This device’s unsynced copy was preserved instead of overwriting it.',
    )
    this.name = 'DataSyncConflictError'
  }
}

function asSnapshot(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function hasSnapshotData(snapshot: Record<string, unknown>): boolean {
  return Object.keys(snapshot).length > 0
}

function metadataString(user: User, ...keys: string[]): string {
  for (const key of keys) {
    const value = user.user_metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function profileFromSources(
  user: User,
  row: ProfileRow | null,
  localProfile: Record<string, unknown>,
): RecallProfile {
  const email = user.email?.trim() || ''
  const emailName = email.includes('@') ? email.split('@')[0] : ''
  const localName = typeof localProfile.name === 'string' ? localProfile.name.trim() : ''
  const localClass = typeof localProfile.className === 'string' ? localProfile.className.trim() : ''

  return {
    displayName: row?.display_name?.trim()
      || metadataString(
        user,
        'full_name',
        'name',
        'user_name',
        'preferred_username',
      )
      || localName
      || emailName
      || 'Recall+ User',
    email,
    className: metadataString(user, 'class_name') || localClass || 'CBSE XI workspace',
    timezone: INDIA_TIMEZONE,
  }
}

async function assertSessionWithRetry(userId: string): Promise<void> {
  try {
    await assertExpectedSessionUser(supabase.auth, userId)
  } catch (error) {
    if (!(error instanceof AuthSessionChangedError)) throw error
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 50)
    })
    await assertExpectedSessionUser(supabase.auth, userId)
  }
}

function safeRemoteSnapshot(value: unknown): Record<string, unknown> {
  const snapshot = asSnapshot(value)
  try {
    validateScopedDataSnapshot(snapshot)
    return snapshot
  } catch {
    // Corrupt optional cloud payloads must not block authenticated entry.
    return {}
  }
}

async function ensureBootstrapRows(userId: string): Promise<void> {
  const { error } = await runForExpectedSessionUser(
    supabase.auth,
    userId,
    () => supabase.rpc('ensure_recall_user_bootstrap'),
  )
  if (error) {
    throw new Error(`Could not prepare your Recall+ profile: ${error.message}`)
  }
}

async function loadBootstrapRows(userId: string): Promise<{
  profileRow: ProfileRow | null
  appDataRow: UserAppDataRow | null
}> {
  const [profileResult, appDataResult] = await runForExpectedSessionUser(
    supabase.auth,
    userId,
    () => Promise.all([
      supabase
        .from('recall_profiles')
        .select('display_name, timezone, timezone_initialized')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('user_app_data')
        .select('data, updated_at, version')
        .eq('user_id', userId)
        .maybeSingle(),
    ]),
  )

  if (profileResult.error) {
    throw new Error(`Could not load your Recall+ profile: ${profileResult.error.message}`)
  }
  if (appDataResult.error) {
    throw new Error(`Could not load your Recall+ data: ${appDataResult.error.message}`)
  }

  return {
    profileRow: (profileResult.data ?? null) as ProfileRow | null,
    appDataRow: (appDataResult.data ?? null) as UserAppDataRow | null,
  }
}

export async function syncUserSnapshot(userId: string): Promise<void> {
  await assertExpectedSessionUser(supabase.auth, userId)
  const existing = activeSyncs.get(userId)
  if (existing) return existing

  const operation = (async () => {
    const syncState = getDataSyncState(userId)
    if (!syncState.dirty) return

    const snapshot = getScopedDataSnapshot(userId)
    const { data, error } = await runForExpectedSessionUser(
      supabase.auth,
      userId,
      () => supabase.rpc(
        'upsert_recall_app_data',
        buildUserDataUpsertRpcArgs(userId, snapshot, syncState.remoteVersion),
      ),
    )

    if (error) {
      if (isDataVersionConflictError(error)) throw new DataSyncConflictError()
      throw new Error(`Could not sync your Recall+ data: ${error.message}`)
    }

    const result = data as UserAppDataRpcResult | null
    const updatedAt = typeof result?.updatedAt === 'string' ? result.updatedAt : ''
    const remoteVersion = Number.isInteger(result?.version) ? Number(result?.version) : syncState.remoteVersion
    markDataSynced(userId, syncState.revision, updatedAt, remoteVersion)
  })().finally(() => {
    if (activeSyncs.get(userId) === operation) activeSyncs.delete(userId)
  })

  activeSyncs.set(userId, operation)
  return operation
}

export async function resolveUserDataConflict(
  userId: string,
  strategy: 'cloud' | 'local',
): Promise<void> {
  await assertExpectedSessionUser(supabase.auth, userId)
  const startingState = getDataSyncState(userId)
  const localSnapshot = getScopedDataSnapshot(userId)
  const { data, error } = await runForExpectedSessionUser(
    supabase.auth,
    userId,
    () => supabase
      .from('user_app_data')
      .select('data, updated_at, version')
      .eq('user_id', userId)
      .maybeSingle(),
  )
  if (error) throw new Error(`Could not resolve your Recall+ data conflict: ${error.message}`)
  const remoteRow = (data ?? null) as UserAppDataRow | null
  if (!remoteRow) throw new Error('The cloud copy could not be found. Please retry.')

  if (getDataSyncState(userId).revision !== startingState.revision) {
    throw new Error('Your local data changed while resolving the conflict. Review it and try again.')
  }

  if (strategy === 'cloud') {
    const remoteSnapshot = safeRemoteSnapshot(remoteRow.data)
    replaceScopedDataSnapshot(userId, remoteSnapshot)
    markDataSynced(userId, startingState.revision, remoteRow.updated_at, remoteRow.version)
    return
  }

  replaceScopedDataSnapshot(userId, localSnapshot)
  setDataSyncRemoteBaseline(userId, remoteRow.updated_at, remoteRow.version)
  await syncUserSnapshot(userId)
}

export async function updateRecallProfileDisplayName(
  userId: string,
  value: string,
): Promise<string> {
  const validationError = validateProfileName(value)
  if (validationError) throw new Error(validationError)
  const displayName = normalizeProfileName(value)

  const { data, error } = await runForExpectedSessionUser(
    supabase.auth,
    userId,
    () => supabase
      .from('recall_profiles')
      .update({ display_name: displayName })
      .eq('id', userId)
      .select('display_name')
      .single(),
  )
  if (error) throw new Error(`Could not update your name: ${error.message}`)

  const savedName = normalizeProfileName(
    (data as { display_name?: unknown } | null)?.display_name,
  )
  if (savedName !== displayName) {
    throw new Error('Could not verify the saved name. Please try again.')
  }
  return savedName
}

async function hydrate(user: User): Promise<HydratedUserData> {
  await assertSessionWithRetry(user.id)
  const migration = migrateLegacyDataForUser(user.id)
  let syncWarning = ''

  let { profileRow, appDataRow } = await loadBootstrapRows(user.id)

  if (!profileRow || !appDataRow) {
    await ensureBootstrapRows(user.id)
    ;({ profileRow, appDataRow } = await loadBootstrapRows(user.id))
  }

  if (!profileRow) {
    throw new Error('Could not load your Recall+ profile.')
  }

  if (!profileRow.timezone_initialized) {
    const { data: initializedTimezone, error } = await runForExpectedSessionUser(
      supabase.auth,
      user.id,
      () => supabase.rpc(
        'initialize_recall_timezone',
        buildTimezoneInitializationRpcArgs(user.id, INDIA_TIMEZONE),
      ),
    )
    if (error) throw new Error(`Could not initialize your local timezone: ${error.message}`)
    profileRow = {
      ...profileRow,
      timezone: typeof initializedTimezone === 'string' ? initializedTimezone : profileRow.timezone,
      timezone_initialized: true,
    }
  }

  const remoteSnapshot = safeRemoteSnapshot(appDataRow?.data)
  const localSnapshot = getScopedDataSnapshot(user.id)
  const syncState = getDataSyncState(user.id)
  const legacyOnlyDirty = migration.copied > 0 && syncState.remoteVersion === 0

  if (hasSnapshotData(remoteSnapshot) && (!syncState.dirty || legacyOnlyDirty)) {
    replaceScopedDataSnapshot(user.id, remoteSnapshot)
    markDataSynced(
      user.id,
      syncState.revision,
      appDataRow?.updated_at || '',
      appDataRow?.version || 0,
    )
  } else if (syncState.dirty || (!hasSnapshotData(remoteSnapshot) && hasSnapshotData(localSnapshot))) {
    if (appDataRow && syncState.remoteVersion === 0 && !hasSnapshotData(remoteSnapshot)) {
      setDataSyncRemoteBaseline(user.id, appDataRow.updated_at, appDataRow.version)
    }
    try {
      await syncUserSnapshot(user.id)
    } catch (error) {
      if (error instanceof DataSyncConflictError) throw error
      syncWarning = error instanceof Error
        ? error.message
        : 'Could not sync your Recall+ data.'
    }
  } else {
    markDataSynced(
      user.id,
      syncState.revision,
      appDataRow?.updated_at || '',
      appDataRow?.version || 0,
    )
  }

  const hydratedSnapshot = getScopedDataSnapshot(user.id)
  const storedProfile = asSnapshot(hydratedSnapshot[`recall_plus_${STORAGE_KEYS.profile}`])
  const profile = profileFromSources(user, profileRow, storedProfile)
  const nextStoredProfile: Record<string, unknown> = {
    ...storedProfile,
    name: profile.displayName,
    className: profile.className,
    email: profile.email,
    timezone: INDIA_TIMEZONE,
  }
  delete nextStoredProfile.phone
  delete nextStoredProfile.number

  if (JSON.stringify(storedProfile) !== JSON.stringify(nextStoredProfile)) {
    saveDataForUser(user.id, STORAGE_KEYS.profile, nextStoredProfile)
  }

  const desiredDisplayName = profileRow.display_name?.trim()
    || metadataString(user, 'full_name', 'name', 'user_name', 'preferred_username')
    || profile.displayName
  if (!profileRow.display_name && desiredDisplayName) {
    const { error } = await runForExpectedSessionUser(
      supabase.auth,
      user.id,
      () => supabase
        .from('recall_profiles')
        .update({ display_name: desiredDisplayName })
        .eq('id', user.id),
    )
    if (error && !syncWarning) {
      syncWarning = `Could not sync your Recall+ profile: ${error.message}`
    }
  }

  if (getDataSyncState(user.id).dirty) {
    try {
      await syncUserSnapshot(user.id)
    } catch (error) {
      if (error instanceof DataSyncConflictError) throw error
      if (!syncWarning) {
        syncWarning = error instanceof Error
          ? error.message
          : 'Could not sync your Recall+ data.'
      }
    }
  }

  return {
    profile: { ...profile, displayName: desiredDisplayName || profile.displayName },
    migratedLegacyKeys: migration.copied,
    syncWarning: syncWarning || undefined,
  }
}

export function hydrateUserData(user: User): Promise<HydratedUserData> {
  const existing = activeHydrations.get(user.id)
  if (existing) return existing

  const operation = hydrate(user).finally(() => {
    if (activeHydrations.get(user.id) === operation) activeHydrations.delete(user.id)
  })
  activeHydrations.set(user.id, operation)
  return operation
}
