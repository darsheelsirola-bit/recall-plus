import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function isolatedStorage() {
  const values = new Map()
  return {
    get length() { return values.size },
    key(index) { return [...values.keys()][index] ?? null },
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }
}

async function createHarness(t) {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: isolatedStorage(),
  })

  let vite
  t.after(async () => {
    if (vite) await vite.close()
    if (storageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    } else {
      delete globalThis.localStorage
    }
  })

  vite = await createServer({
    root: projectRoot,
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  })

  const sync = await vite.ssrLoadModule('/src/data/userDataSync.ts')
  const { supabase } = await vite.ssrLoadModule('/src/lib/supabase.ts')
  const storage = await vite.ssrLoadModule('/src/utils/storage.js')
  return { storage, supabase, sync }
}

function sessionResult(userId) {
  return {
    data: {
      session: userId ? { user: { id: userId } } : null,
    },
    error: null,
  }
}

test('stale hydration cannot restore the previous account as storage owner', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  let subject = 'account-a'

  t.mock.method(supabase.auth, 'getSession', () => {
    const capturedSubject = subject
    return Promise.resolve(sessionResult(capturedSubject))
  })
  let fromCalls = 0
  t.mock.method(supabase, 'from', () => {
    fromCalls += 1
    throw new Error('A stale hydration must not query Supabase.')
  })

  const pending = sync.hydrateUserData({
    id: 'account-a',
    email: 'a@example.com',
    user_metadata: { display_name: 'A' },
  })
  subject = 'account-b'
  storage.setStorageUser('account-b')

  await assert.rejects(
    pending,
    (error) => error?.code === 'AUTH_SESSION_CHANGED',
  )
  assert.equal(storage.getStorageUser(), 'account-b')
  assert.equal(fromCalls, 0)
})

test('snapshot sync binds the intended user and does not acknowledge after an account switch', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  let subject = 'account-a'
  storage.setStorageUser(subject)
  storage.saveDataForUser(
    'account-a',
    storage.STORAGE_KEYS.logs,
    [{ id: 'a-log' }],
  )

  t.mock.method(supabase.auth, 'getSession', () => {
    const capturedSubject = subject
    return Promise.resolve(sessionResult(capturedSubject))
  })

  const rpcStarted = deferred()
  const rpcResult = deferred()
  const rpcCalls = []
  t.mock.method(supabase, 'rpc', (name, args) => {
    rpcCalls.push({ args, name })
    rpcStarted.resolve()
    return rpcResult.promise
  })

  const pending = sync.syncUserSnapshot('account-a')
  await rpcStarted.promise
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'upsert_recall_app_data')
  assert.equal(rpcCalls[0].args.p_user_id, 'account-a')
  assert.equal(rpcCalls[0].args.p_expected_version, 0)
  assert.deepEqual(
    rpcCalls[0].args.p_data.recall_plus_study_logs,
    [{ id: 'a-log' }],
  )

  subject = 'account-b'
  storage.setStorageUser(subject)
  rpcResult.resolve({
    data: {
      version: 1,
      updatedAt: '2026-07-27T00:00:00Z',
    },
    error: null,
  })

  await assert.rejects(
    pending,
    (error) => error?.code === 'AUTH_SESSION_CHANGED',
  )
  assert.equal(storage.getDataSyncState('account-a').dirty, true)
  assert.equal(storage.getStorageUser(), 'account-b')
})

test('local conflict resolution stops before baseline mutation or RPC after an account switch', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  let subject = 'account-a'
  storage.setStorageUser(subject)
  storage.saveDataForUser(
    'account-a',
    storage.STORAGE_KEYS.logs,
    [{ id: 'local-a' }],
  )
  const startingState = storage.getDataSyncState('account-a')

  t.mock.method(supabase.auth, 'getSession', () => {
    const capturedSubject = subject
    return Promise.resolve(sessionResult(capturedSubject))
  })

  const remote = deferred()
  const queryStarted = deferred()
  t.mock.method(supabase, 'from', (table) => {
    assert.equal(table, 'user_app_data')
    const builder = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.maybeSingle = () => {
      queryStarted.resolve()
      return remote.promise
    }
    return builder
  })

  let rpcCalls = 0
  t.mock.method(supabase, 'rpc', async () => {
    rpcCalls += 1
    throw new Error('Conflict resolution must stop before an RPC.')
  })

  const pending = sync.resolveUserDataConflict('account-a', 'local')
  await queryStarted.promise
  subject = 'account-b'
  storage.setStorageUser(subject)
  remote.resolve({
    data: {
      data: { recall_plus_study_logs: [{ id: 'cloud-a' }] },
      updated_at: '2026-07-27T00:00:00Z',
      version: 4,
    },
    error: null,
  })

  await assert.rejects(
    pending,
    (error) => error?.code === 'AUTH_SESSION_CHANGED',
  )
  assert.equal(rpcCalls, 0)
  assert.equal(
    storage.getDataSyncState('account-a').remoteVersion,
    startingState.remoteVersion,
  )
  assert.deepEqual(
    storage.getScopedDataSnapshot('account-a').recall_plus_study_logs,
    [{ id: 'local-a' }],
  )
  assert.equal(storage.getStorageUser(), 'account-b')
})

test('timezone initialization RPC is bound to the intended user', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  const subject = 'account-a'
  storage.setStorageUser(subject)
  let appDataLoads = 0

  t.mock.method(
    supabase.auth,
    'getSession',
    async () => sessionResult(subject),
  )
  t.mock.method(supabase, 'from', (table) => {
    const builder = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.maybeSingle = async () => {
      if (table === 'recall_profiles') {
        return {
          data: {
            display_name: 'A',
            timezone: 'UTC',
            timezone_initialized: false,
          },
          error: null,
        }
      }
      assert.equal(table, 'user_app_data')
      appDataLoads += 1
      if (appDataLoads === 1) return { data: null, error: null }
      return {
        data: {
          data: {},
          updated_at: '2026-07-27T00:00:00Z',
          version: 1,
        },
        error: null,
      }
    }
    return builder
  })

  const rpcCalls = []
  t.mock.method(supabase, 'rpc', async (name, args) => {
    rpcCalls.push({ args, name })
    if (name === 'ensure_recall_user_bootstrap') {
      return { data: { userId: subject }, error: null }
    }
    if (name === 'initialize_recall_timezone') {
      return { data: 'Asia/Kolkata', error: null }
    }
    assert.equal(name, 'upsert_recall_app_data')
    return {
      data: {
        version: 1,
        updatedAt: '2026-07-27T00:00:00Z',
      },
      error: null,
    }
  })

  const result = await sync.hydrateUserData({
    id: subject,
    email: 'a@example.com',
    user_metadata: { display_name: 'A' },
  })

  const timezoneCall = rpcCalls.find(
    ({ name }) => name === 'initialize_recall_timezone',
  )
  assert.ok(timezoneCall)
  assert.equal(timezoneCall.args.p_user_id, subject)
  assert.equal(timezoneCall.args.p_timezone, 'Asia/Kolkata')
  assert.equal(result.profile.timezone, 'Asia/Kolkata')
  assert.ok(
    rpcCalls.some(({ name }) => name === 'ensure_recall_user_bootstrap'),
  )
  assert.ok(
    rpcCalls
      .filter(({ name }) => name === 'upsert_recall_app_data')
      .every(({ args }) => args.p_user_id === subject),
  )
})

test('missing profile self-heals once then hydrates empty study data', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  const subject = 'account-new'
  storage.setStorageUser(subject)
  let profileLoads = 0

  t.mock.method(
    supabase.auth,
    'getSession',
    async () => sessionResult(subject),
  )
  t.mock.method(supabase, 'from', (table) => {
    const builder = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.update = () => ({
      eq: async () => ({ data: null, error: null }),
    })
    builder.maybeSingle = async () => {
      if (table === 'recall_profiles') {
        profileLoads += 1
        if (profileLoads === 1) return { data: null, error: null }
        return {
          data: {
            display_name: null,
            timezone: 'Asia/Kolkata',
            timezone_initialized: true,
          },
          error: null,
        }
      }
      assert.equal(table, 'user_app_data')
      return {
        data: {
          data: {},
          updated_at: '2026-08-09T00:00:00Z',
          version: 1,
        },
        error: null,
      }
    }
    return builder
  })

  const rpcCalls = []
  t.mock.method(supabase, 'rpc', async (name, args) => {
    rpcCalls.push({ args, name })
    if (name === 'ensure_recall_user_bootstrap') {
      return { data: { userId: subject, createdProfile: true }, error: null }
    }
    assert.equal(name, 'upsert_recall_app_data')
    return {
      data: {
        version: 2,
        updatedAt: '2026-08-09T00:00:01Z',
      },
      error: null,
    }
  })

  const result = await sync.hydrateUserData({
    id: subject,
    email: 'new@example.com',
    user_metadata: { full_name: 'New Student' },
  })

  assert.equal(result.profile.displayName, 'New Student')
  assert.equal(result.syncWarning, undefined)
  assert.ok(rpcCalls.some(({ name }) => name === 'ensure_recall_user_bootstrap'))
})

test('optional sync failure during hydrate does not block authentication', async (t) => {
  const { storage, supabase, sync } = await createHarness(t)
  const subject = 'account-a'
  storage.setStorageUser(subject)
  storage.saveDataForUser(
    subject,
    storage.STORAGE_KEYS.logs,
    [{ id: 'local-only' }],
  )

  t.mock.method(
    supabase.auth,
    'getSession',
    async () => sessionResult(subject),
  )
  t.mock.method(supabase, 'from', (table) => {
    const builder = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.update = () => ({
      eq: async () => ({ data: null, error: null }),
    })
    builder.maybeSingle = async () => {
      if (table === 'recall_profiles') {
        return {
          data: {
            display_name: 'A',
            timezone: 'Asia/Kolkata',
            timezone_initialized: true,
          },
          error: null,
        }
      }
      return {
        data: {
          data: {},
          updated_at: '2026-08-09T00:00:00Z',
          version: 1,
        },
        error: null,
      }
    }
    return builder
  })

  t.mock.method(supabase, 'rpc', async (name) => {
    assert.equal(name, 'upsert_recall_app_data')
    return { data: null, error: { message: 'INVALID_STUDY_LOG_CURRICULUM' } }
  })

  const result = await sync.hydrateUserData({
    id: subject,
    email: 'a@example.com',
    user_metadata: { name: 'A' },
  })

  assert.equal(result.profile.displayName, 'A')
  assert.match(result.syncWarning || '', /Could not sync your Recall\+ data/)
})

test('display-name updates are trimmed and bound to the current session user', async (t) => {
  const { supabase, sync } = await createHarness(t)
  let subject = 'account-a'
  const updates = []

  t.mock.method(
    supabase.auth,
    'getSession',
    async () => sessionResult(subject),
  )
  t.mock.method(supabase, 'from', (table) => {
    assert.equal(table, 'recall_profiles')
    const builder = {}
    builder.update = (value) => {
      updates.push(value)
      return builder
    }
    builder.eq = (column, value) => {
      assert.equal(column, 'id')
      assert.equal(value, 'account-a')
      return builder
    }
    builder.select = (columns) => {
      assert.equal(columns, 'display_name')
      return builder
    }
    builder.single = async () => ({
      data: { display_name: 'Updated Student' },
      error: null,
    })
    return builder
  })

  assert.equal(
    await sync.updateRecallProfileDisplayName(
      'account-a',
      '  Updated Student  ',
    ),
    'Updated Student',
  )
  assert.deepEqual(updates, [{ display_name: 'Updated Student' }])

  subject = 'account-b'
  await assert.rejects(
    () => sync.updateRecallProfileDisplayName('account-a', 'Other Student'),
    (error) => error?.code === 'AUTH_SESSION_CHANGED',
  )
  assert.equal(updates.length, 1)
})
