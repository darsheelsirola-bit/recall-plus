import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAuthForm } from '../src/utils/authValidation.js'
import {
  AUTH_SESSION_CHANGED_CODE,
  assertExpectedSessionUser,
  runForExpectedSessionUser,
} from '../src/utils/authSessionGuard.ts'
import { toDateOnly } from '../src/utils/dateUtils.js'
import { countOverdueRecalls, getRecallDifficulty } from '../src/utils/recallCalendar.js'
import { getTopicStudyMinutes, suggestNewTopics } from '../src/utils/recallPlan.js'
import { createSingleFlight, generationSingleFlightKey } from '../src/utils/requestUtils.js'
import { latestResultsByTopic } from '../src/utils/resultUtils.js'
import { createSubmissionGuard } from '../src/utils/submissionGuard.js'
import {
  INDIA_TIMEZONE,
  INDIA_TIMEZONE_DETAIL,
  INDIA_TIMEZONE_NAME,
  normalizeProfileName,
  validateProfileName,
} from '../src/utils/profile.js'
import {
  getSyncRetryDelay,
  isDataVersionConflictError,
  SYNC_RETRY_LIMIT,
  SYNC_RETRY_MAX_MS,
} from '../src/utils/syncUtils.js'
import {
  getData,
  getDataSyncState,
  importAllDataForUser,
  markDataSynced,
  saveData,
  saveDataBatchOrThrow,
  setStorageUser,
  STORAGE_KEYS,
  validateScopedDataSnapshot,
} from '../src/utils/storage.js'
import {
  buildTimezoneInitializationRpcArgs,
  buildUserDataUpsertRpcArgs,
} from '../src/utils/userDataRpc.ts'
import { validateQuizQuestions } from '../shared/quizValidation.js'

function makeQuestion(id) {
  return {
    id,
    difficulty: 'medium',
    question: `Question ${id}?`,
    options: ['One', 'Two', 'Three', 'Four'],
    answer: 'Two',
    explanation: 'A useful explanation.',
  }
}

function testStorage() {
  const values = new Map()
  let writeCount = 0
  let failAt = Number.POSITIVE_INFINITY
  return {
    values,
    get length() { return values.size },
    key(index) { return [...values.keys()][index] ?? null },
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) {
      writeCount += 1
      if (writeCount === failAt) throw new Error('simulated storage quota failure')
      values.set(key, String(value))
    },
    removeItem(key) { values.delete(key) },
    failOnNext(offset = 1) { failAt = writeCount + offset },
  }
}

function withLocalStorage(storage, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  try {
    return callback()
  } finally {
    setStorageUser(null)
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
}

function sessionAuth(currentUserId) {
  return {
    currentUserId,
    async getSession() {
      return {
        data: {
          session: this.currentUserId
            ? { user: { id: this.currentUserId } }
            : null,
        },
        error: null,
      }
    },
  }
}

test('date-only input remains the same calendar date west of UTC', () => {
  const originalTimezone = process.env.TZ
  try {
    process.env.TZ = 'America/Los_Angeles'
    assert.equal(toDateOnly('2026-07-27'), '2026-07-27')
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimezone
  }
})

test('expected-subject guard rejects a stale owner before a Supabase operation', async () => {
  const auth = sessionAuth('account-b')
  let operationCalls = 0

  await assert.rejects(
    () => runForExpectedSessionUser(auth, 'account-a', async () => {
      operationCalls += 1
    }),
    (error) => error?.code === AUTH_SESSION_CHANGED_CODE,
  )
  assert.equal(operationCalls, 0)
})

test('expected-subject guard rejects an account switch before follow-up mutation', async () => {
  const auth = sessionAuth('account-a')
  let followUpMutations = 0

  await assertExpectedSessionUser(auth, 'account-a')
  await assert.rejects(
    async () => {
      const result = await runForExpectedSessionUser(auth, 'account-a', async () => {
        auth.currentUserId = 'account-b'
        return { version: 2 }
      })
      followUpMutations += 1
      return result
    },
    (error) => error?.code === AUTH_SESSION_CHANGED_CODE,
  )
  assert.equal(followUpMutations, 0)
})

test('user-data RPC contracts bind every write to the intended authenticated user', () => {
  const snapshot = { recall_plus_study_logs: [{ id: 'log-a' }] }
  assert.deepEqual(
    buildUserDataUpsertRpcArgs('account-a', snapshot, 4),
    {
      p_user_id: 'account-a',
      p_data: snapshot,
      p_expected_version: 4,
    },
  )
  assert.deepEqual(
    buildTimezoneInitializationRpcArgs('account-a', 'Asia/Kolkata'),
    {
      p_user_id: 'account-a',
      p_timezone: 'Asia/Kolkata',
    },
  )
})

test('profile names and the product timezone use one shared contract', () => {
  assert.equal(normalizeProfileName('  Recall Student  '), 'Recall Student')
  assert.equal(validateProfileName(''), 'Enter your name.')
  assert.equal(validateProfileName('A'), 'Name must be at least 2 characters.')
  assert.equal(
    validateProfileName('x'.repeat(51)),
    'Name must be 50 characters or fewer.',
  )
  assert.equal(validateProfileName('  Valid Student  '), '')
  assert.equal(INDIA_TIMEZONE, 'Asia/Kolkata')
  assert.equal(INDIA_TIMEZONE_NAME, 'India Standard Time')
  assert.equal(INDIA_TIMEZONE_DETAIL, 'Asia/Kolkata (UTC+05:30)')
})

test('duplicate question ids invalidate generated and cached quizzes', () => {
  const duplicateIds = [makeQuestion('same'), makeQuestion('same')]
  assert.equal(validateQuizQuestions(duplicateIds, 2), false)
})

test('single-flight deduplicates only identical feature and payload keys', async () => {
  const runSingleFlight = createSingleFlight()
  let releaseFirst
  let firstCalls = 0
  const firstKey = generationSingleFlightKey('quiz', '{"topic":"Motion"}')
  const secondKey = generationSingleFlightKey('quiz', '{"topic":"Sets"}')

  const first = runSingleFlight(firstKey, async () => {
    firstCalls += 1
    await new Promise((resolve) => { releaseFirst = resolve })
    return 'motion'
  })
  const duplicate = runSingleFlight(firstKey, async () => {
    firstCalls += 1
    return 'duplicate'
  })
  const second = runSingleFlight(secondKey, async () => 'sets')

  assert.equal(first, duplicate)
  assert.notEqual(first, second)
  await Promise.resolve()
  assert.equal(firstCalls, 1)
  releaseFirst()
  assert.deepEqual(await Promise.all([first, duplicate, second]), ['motion', 'motion', 'sets'])
})

test('latest results use completedAt and expand multi-topic attempts', () => {
  const latest = latestResultsByTopic([
    {
      id: 'new',
      subject: 'Physics',
      chapter: 'Motion',
      topics: ['Speed', 'Acceleration'],
      topic: 'Speed, Acceleration',
      percentage: 85,
      date: '2026-07-27',
      completedAt: '2026-07-27T10:30:00.000Z',
    },
    {
      id: 'old',
      subject: 'Physics',
      chapter: 'Motion',
      topic: 'Speed',
      percentage: 20,
      date: '2026-07-27',
      completedAt: '2026-07-27T08:00:00.000Z',
    },
  ])

  assert.equal(latest.length, 2)
  assert.equal(latest.find((item) => item.topic === 'Speed').id, 'new')
  assert.equal(latest.find((item) => item.topic === 'Acceleration').id, 'new')
})

test('sync retry delays are exponential, bounded, and limited', () => {
  assert.equal(SYNC_RETRY_LIMIT, 5)
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(getSyncRetryDelay),
    [650, 1300, 2600, 5200, 10400],
  )
  assert.equal(getSyncRetryDelay(99), SYNC_RETRY_MAX_MS)
})

test('CAS conflict classification requires the backend SQLSTATE and marker', () => {
  assert.equal(isDataVersionConflictError({ code: 'P0001', message: 'USER_DATA_VERSION_CONFLICT' }), true)
  assert.equal(isDataVersionConflictError({ code: 'P0001', details: 'USER_DATA_VERSION_CONFLICT: stale' }), true)
  assert.equal(isDataVersionConflictError({ code: 'P0001', message: 'other failure' }), false)
  assert.equal(isDataVersionConflictError({ code: '23505', message: 'USER_DATA_VERSION_CONFLICT' }), false)
})

test('successful sync records the CAS version and later changes retain it', () => {
  const userId = 'frontend-cas-regression'
  setStorageUser(userId)
  saveData('cas_test', { value: 1 })
  const dirty = getDataSyncState(userId)
  markDataSynced(userId, dirty.revision, '2026-07-27T10:00:00.000Z', 4)
  assert.equal(getDataSyncState(userId).dirty, false)
  assert.equal(getDataSyncState(userId).remoteVersion, 4)

  saveData('cas_test', { value: 2 })
  assert.equal(getDataSyncState(userId).dirty, true)
  assert.equal(getDataSyncState(userId).remoteVersion, 4)
  setStorageUser(null)
})

test('submission guard accepts one claim until explicitly reset', () => {
  const guard = createSubmissionGuard()
  assert.equal(guard.claim(), true)
  assert.equal(guard.claim(), false)
  guard.reset()
  assert.equal(guard.claim(), true)
})

test('recall difficulty respects the quiz denominator', () => {
  assert.equal(getRecallDifficulty(4, 10), 'Hard')
  assert.equal(getRecallDifficulty(6, 10), 'Moderate')
  assert.equal(getRecallDifficulty(7, 10), 'Easy')
})

test('multi-topic study logs count as studied for recall planning', () => {
  const logs = [{
    subject: 'Physics',
    chapter: 'Motion',
    topics: ['Speed', 'Acceleration'],
    topic: 'Speed',
    timeSpent: 45,
  }]
  assert.equal(getTopicStudyMinutes(logs, 'Physics', 'Motion', 'Acceleration'), 45)

  const suggestions = suggestNewTopics([
    { subject: 'Physics', chapter: 'Motion', topic: 'Speed' },
    { subject: 'Physics', chapter: 'Motion', topic: 'Acceleration' },
    { subject: 'Physics', chapter: 'Motion', topic: 'Graphs' },
  ], [], logs)
  assert.deepEqual(suggestions.map((item) => item.topic), ['Graphs'])
})

test('overdue count covers all dates unless one date is selected', () => {
  const items = [
    { id: 'a', nextReviewDate: '2026-07-20', completed: false },
    { id: 'b', nextReviewDate: '2026-07-21', completed: false },
    { id: 'c', nextReviewDate: '2026-07-20', completed: true },
    { id: 'd', nextReviewDate: '2026-07-28', completed: false },
  ]
  assert.equal(countOverdueRecalls(items, '2026-07-27'), 2)
  assert.equal(countOverdueRecalls(items, '2026-07-27', '2026-07-20'), 1)
})

test('auth validation covers email, signup strength, and recovery matching', () => {
  assert.equal(validateAuthForm({ mode: 'signin', email: 'not-an-email', password: 'anything' }), 'Enter a valid email address.')
  assert.equal(validateAuthForm({ mode: 'signup', name: '', email: 'student@example.com', password: 'Strong1!' }), 'Enter your name.')
  assert.match(validateAuthForm({ mode: 'signup', name: 'Aarav', email: 'student@example.com', password: 'weakpass' }), /lowercase letter, uppercase letter, number, and symbol/)
  assert.equal(validateAuthForm({ mode: 'signup', name: 'Aarav', email: 'student@example.com', password: 'Strong1!' }), '')
  assert.equal(validateAuthForm({ mode: 'recovery', password: 'Strong1!', confirmPassword: 'Different1!' }), 'The passwords do not match.')
  assert.equal(validateAuthForm({ mode: 'recovery', password: 'Strong1!', confirmPassword: 'Strong1!' }), '')
})

test('synced and imported snapshots reject crash-prone value shapes', () => {
  assert.throws(
    () => validateScopedDataSnapshot({ recall_plus_study_logs: {} }),
    /invalid format/i,
  )
  assert.throws(
    () => validateScopedDataSnapshot({
      recall_plus_insight_cache: {
        date: '2026-07-27',
        fingerprint: 'test',
        payload: { chapters: { length: 1 } },
      },
    }),
    /invalid format/i,
  )
  assert.doesNotThrow(() => validateScopedDataSnapshot({
    recall_plus_study_logs: [],
    recall_plus_quiz_results: [],
    recall_plus_topic_statuses: {},
  }))
})

test('multi-key storage writes roll back completely after a later write fails', () => {
  const storage = testStorage()
  withLocalStorage(storage, () => {
    setStorageUser('atomic-user')
    saveDataBatchOrThrow([
      [STORAGE_KEYS.logs, [{ id: 'old-log' }]],
      [STORAGE_KEYS.topicStatuses, { old: 'Studied' }],
    ])
    storage.failOnNext(2)

    assert.throws(() => saveDataBatchOrThrow([
      [STORAGE_KEYS.logs, [{ id: 'new-log' }]],
      [STORAGE_KEYS.topicStatuses, { newer: 'Mastered' }],
    ]), /previous data was restored/i)
    assert.deepEqual(getData(STORAGE_KEYS.logs, []), [{ id: 'old-log' }])
    assert.deepEqual(getData(STORAGE_KEYS.topicStatuses, {}), { old: 'Studied' })
  })
})

test('backup import refuses to cross an account switch', () => {
  const storage = testStorage()
  withLocalStorage(storage, () => {
    setStorageUser('account-b')
    saveDataBatchOrThrow([[STORAGE_KEYS.logs, [{ id: 'b-log' }]]])
    assert.throws(
      () => importAllDataForUser('account-a', {
        recall_plus_study_logs: [{ id: 'a-log' }],
      }),
      /account changed/i,
    )
    assert.deepEqual(getData(STORAGE_KEYS.logs, []), [{ id: 'b-log' }])
  })
})
