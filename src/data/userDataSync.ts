import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  getDataSyncState,
  getScopedDataSnapshot,
  markDataSynced,
  migrateLegacyDataForUser,
  replaceScopedDataSnapshot,
  saveDataForUser,
  setStorageUser,
  STORAGE_KEYS,
} from '../utils/storage'

export interface RecallProfile {
  displayName: string
  email: string
  phone: string
  className: string
  timezone: string
}

export interface HydratedUserData {
  profile: RecallProfile
  migratedLegacyKeys: number
}

interface ProfileRow {
  display_name: string | null
  timezone: string
  timezone_initialized: boolean
}

interface UserAppDataRow {
  data: Record<string, unknown>
  updated_at: string
}

const activeHydrations = new Map<string, Promise<HydratedUserData>>()
const activeSyncs = new Map<string, Promise<void>>()

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
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
  const localPhone = typeof localProfile.phone === 'string'
    ? localProfile.phone.trim()
    : typeof localProfile.number === 'string'
      ? localProfile.number.trim()
      : ''

  return {
    displayName: row?.display_name?.trim()
      || metadataString(user, 'display_name', 'full_name', 'name')
      || localName
      || emailName
      || 'Student',
    email,
    phone: user.phone?.trim() || metadataString(user, 'phone') || localPhone,
    className: metadataString(user, 'class_name') || localClass || 'Class 11 PCM',
    timezone: row?.timezone || metadataString(user, 'timezone') || browserTimezone(),
  }
}

export async function syncUserSnapshot(userId: string): Promise<void> {
  const existing = activeSyncs.get(userId)
  if (existing) return existing

  const operation = (async () => {
    const syncState = getDataSyncState(userId)
    if (!syncState.dirty) return

    const snapshot = getScopedDataSnapshot(userId)
    const { data, error } = await supabase
      .from('user_app_data')
      .upsert({ user_id: userId, data: snapshot }, { onConflict: 'user_id' })
      .select('updated_at')
      .single()

    if (error) throw new Error(`Could not sync your Recall+ data: ${error.message}`)
    const updatedAt = typeof data?.updated_at === 'string' ? data.updated_at : ''
    markDataSynced(userId, syncState.revision, updatedAt)
  })().finally(() => {
    if (activeSyncs.get(userId) === operation) activeSyncs.delete(userId)
  })

  activeSyncs.set(userId, operation)
  return operation
}

async function hydrate(user: User): Promise<HydratedUserData> {
  setStorageUser(user.id)
  const migration = migrateLegacyDataForUser(user.id)

  const [profileResult, appDataResult] = await Promise.all([
    supabase
      .from('recall_profiles')
      .select('display_name, timezone, timezone_initialized')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_app_data')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (profileResult.error) {
    throw new Error(`Could not load your Recall+ profile: ${profileResult.error.message}`)
  }
  if (appDataResult.error) {
    throw new Error(`Could not load your Recall+ data: ${appDataResult.error.message}`)
  }

  let profileRow = (profileResult.data ?? null) as ProfileRow | null
  if (!profileRow) throw new Error('Could not load your Recall+ profile.')

  if (!profileRow.timezone_initialized) {
    const { data: initializedTimezone, error } = await supabase.rpc(
      'initialize_recall_timezone',
      { p_timezone: browserTimezone() },
    )
    if (error) throw new Error(`Could not initialize your local timezone: ${error.message}`)
    profileRow = {
      ...profileRow,
      timezone: typeof initializedTimezone === 'string' ? initializedTimezone : profileRow.timezone,
      timezone_initialized: true,
    }
  }

  const remoteRow = (appDataResult.data ?? null) as UserAppDataRow | null
  const remoteSnapshot = asSnapshot(remoteRow?.data)
  const localSnapshot = getScopedDataSnapshot(user.id)
  const syncState = getDataSyncState(user.id)

  const legacyOnlyDirty = migration.copied > 0 && !syncState.remoteUpdatedAt

  if (hasSnapshotData(remoteSnapshot) && (!syncState.dirty || legacyOnlyDirty)) {
    replaceScopedDataSnapshot(user.id, remoteSnapshot)
    markDataSynced(user.id, syncState.revision, remoteRow?.updated_at || '')
  } else if (syncState.dirty || (!hasSnapshotData(remoteSnapshot) && hasSnapshotData(localSnapshot))) {
    await syncUserSnapshot(user.id)
  } else {
    markDataSynced(user.id, syncState.revision, remoteRow?.updated_at || '')
  }

  const hydratedSnapshot = getScopedDataSnapshot(user.id)
  const storedProfile = asSnapshot(hydratedSnapshot[`recall_plus_${STORAGE_KEYS.profile}`])
  const profile = profileFromSources(user, profileRow, storedProfile)
  const nextStoredProfile = {
    ...storedProfile,
    name: profile.displayName,
    className: profile.className,
    email: profile.email,
    phone: profile.phone,
    timezone: profile.timezone,
  }

  if (JSON.stringify(storedProfile) !== JSON.stringify(nextStoredProfile)) {
    saveDataForUser(user.id, STORAGE_KEYS.profile, nextStoredProfile)
  }

  const desiredDisplayName = metadataString(user, 'display_name', 'full_name', 'name')
    || profile.displayName
  if (desiredDisplayName && desiredDisplayName !== profileRow?.display_name) {
    const { error } = await supabase
      .from('recall_profiles')
      .update({ display_name: desiredDisplayName })
      .eq('id', user.id)
    if (error) throw new Error(`Could not sync your Recall+ profile: ${error.message}`)
  }

  if (getDataSyncState(user.id).dirty) await syncUserSnapshot(user.id)

  return {
    profile: { ...profile, displayName: desiredDisplayName || profile.displayName },
    migratedLegacyKeys: migration.copied,
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
