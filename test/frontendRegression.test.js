import test from 'node:test'
import assert from 'node:assert/strict'
import { completedAuthDestination } from '../src/utils/authNavigation.ts'
import { validateAuthForm } from '../src/utils/authValidation.js'
import {
  friendlyPasswordAuthError,
  passwordAuthErrorTitle,
} from '../src/auth/passwordErrors.ts'
import {
  isExistingAccountAuthMessage,
  passwordSignInAfterSignUpResult,
  shouldAttemptPasswordSignInAfterSignUp,
} from '../src/auth/passwordSignUp.ts'
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
  clearOAuthContext,
  authReturnToFromLocation,
  clearOAuthReturnTo,
  DEFAULT_POST_LOGIN_PATH,
  OAUTH_PROVIDER_KEY,
  readOAuthCallbackParameters,
  readOAuthProvider,
  readOAuthReturnTo,
  rememberOAuthReturnTo,
  safeOAuthReturnTo,
} from '../src/utils/oauthRedirect.ts'
import {
  isOAuthProviderFeatureEnabled,
  isRecallOAuthProvider,
  RECALL_OAUTH_PROVIDER_IDS,
} from '../src/auth/oauthConfig.ts'
import {
  classifyOAuthError,
  friendlyOAuthError,
  safeOAuthDiagnosticMessage,
} from '../src/auth/oauthErrors.ts'
import { exchangeOAuthCallback } from '../src/auth/oauthCallback.ts'
import { startOAuthSignIn } from '../src/auth/oauth.ts'
import { supabaseAuthOptions } from '../src/lib/supabase.ts'
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
import {
  countSubjectHistory,
  totalSubjectHistory,
} from '../src/utils/subjectHistory.js'
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

test('authentication defaults to home while OAuth return destinations remain same-origin', () => {
  assert.equal(DEFAULT_POST_LOGIN_PATH, '/')
  assert.equal(completedAuthDestination('signin'), '/')
  assert.equal(completedAuthDestination('signup'), '/')
  assert.equal(completedAuthDestination('recovery'), '/')
  assert.equal(completedAuthDestination('forgot'), null)
  assert.equal(completedAuthDestination('signup', true), null)
  assert.equal(
    authReturnToFromLocation({
      pathname: '/quiz/results/attempt-1',
      search: '?from=review',
      hash: '#answer-4',
    }),
    '/quiz/results/attempt-1?from=review#answer-4',
  )
  assert.equal(safeOAuthReturnTo('/auth'), DEFAULT_POST_LOGIN_PATH)
  assert.equal(safeOAuthReturnTo('/auth/callback?code=secret'), DEFAULT_POST_LOGIN_PATH)
  assert.equal(safeOAuthReturnTo('//attacker.example'), DEFAULT_POST_LOGIN_PATH)
  assert.equal(safeOAuthReturnTo('https://attacker.example'), DEFAULT_POST_LOGIN_PATH)
  assert.equal(safeOAuthReturnTo('/\\attacker.example'), DEFAULT_POST_LOGIN_PATH)
})

test('OAuth destination storage contains navigation only and is explicitly cleared', () => {
  const values = new Map()
  const storage = {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) },
  }

  rememberOAuthReturnTo(storage, '/progress?range=month')
  assert.equal(readOAuthReturnTo(storage), '/progress?range=month')
  assert.equal(values.size, 1)
  clearOAuthReturnTo(storage)
  assert.equal(values.size, 0)
})

test('OAuth remains usable when browser storage is unavailable', () => {
  const blockedStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') },
    removeItem() { throw new Error('blocked') },
  }

  assert.doesNotThrow(() => rememberOAuthReturnTo(blockedStorage, '/progress'))
  assert.equal(readOAuthReturnTo(blockedStorage), DEFAULT_POST_LOGIN_PATH)
  assert.equal(readOAuthProvider(blockedStorage), null)
  assert.doesNotThrow(() => clearOAuthReturnTo(blockedStorage))
})

test('OAuth configuration accepts exact provider ids and keeps Google sign-in available', () => {
  assert.deepEqual(RECALL_OAUTH_PROVIDER_IDS, ['google', 'github', 'apple'])
  assert.equal(isRecallOAuthProvider('google'), true)
  assert.equal(isRecallOAuthProvider('Google'), false)
  assert.equal(isRecallOAuthProvider('gitHub'), false)
  assert.equal(isRecallOAuthProvider('literal-provider'), false)
  assert.equal(
    isOAuthProviderFeatureEnabled('google', { VITE_AUTH_GOOGLE_ENABLED: 'true' }),
    true,
  )
  assert.equal(
    isOAuthProviderFeatureEnabled('google', { VITE_AUTH_GOOGLE_ENABLED: 'false' }),
    true,
  )
  assert.equal(isOAuthProviderFeatureEnabled('google', {}), true)
  assert.equal(isOAuthProviderFeatureEnabled('apple', {}), false)
})

test('disabled OAuth providers never call Supabase or navigate', async () => {
  let settingsCalls = 0
  let authCalls = 0
  let navigationCalls = 0
  const storage = testStorage()
  const result = await startOAuthSignIn('google', '/progress', {
    configured: true,
    featureEnabled: () => false,
    providerEnabledInSupabase: async () => {
      settingsCalls += 1
      return true
    },
    client: {
      auth: {
        async signInWithOAuth() {
          authCalls += 1
          return { data: { provider: 'google', url: 'https://provider.example' }, error: null }
        },
      },
    },
    origin: 'https://recall-plus.vercel.app',
    storage,
    navigate: () => { navigationCalls += 1 },
  })

  assert.match(result.error, /not configured yet/i)
  assert.equal(settingsCalls, 0)
  assert.equal(authCalls, 0)
  assert.equal(navigationCalls, 0)
  assert.equal(storage.values.size, 0)
})

test('OAuth starts one exact PKCE callback request only after both gates pass', async () => {
  const storage = testStorage()
  const requests = []
  const navigations = []
  const result = await startOAuthSignIn('github', '/quiz?chapter=motion', {
    configured: true,
    featureEnabled: () => true,
    providerEnabledInSupabase: async (provider) => provider === 'github',
    client: {
      auth: {
        async signInWithOAuth(request) {
          requests.push(request)
          return {
            data: {
              provider: 'github',
              url: 'https://github.com/login/oauth/authorize?opaque=1',
            },
            error: null,
          }
        },
      },
    },
    origin: 'https://recall-plus.vercel.app',
    storage,
    navigate: (url) => navigations.push(url),
  })

  assert.equal(result.error, '')
  assert.deepEqual(requests, [{
    provider: 'github',
    options: {
      redirectTo: 'https://recall-plus.vercel.app/auth/callback',
      skipBrowserRedirect: true,
    },
  }])
  assert.deepEqual(navigations, ['https://github.com/login/oauth/authorize?opaque=1'])
  assert.equal(readOAuthReturnTo(storage), '/quiz?chapter=motion')
  assert.equal(readOAuthProvider(storage), 'github')
  clearOAuthContext(storage)
  assert.equal(storage.values.has(OAUTH_PROVIDER_KEY), false)
})

test('OAuth starter single-flights rapid clicks before React can disable the buttons', async () => {
  let releaseSettings
  let settingsCalls = 0
  let authCalls = 0
  const settingsGate = new Promise((resolve) => {
    releaseSettings = resolve
  })
  const dependencies = {
    configured: true,
    featureEnabled: () => true,
    providerEnabledInSupabase: async () => {
      settingsCalls += 1
      await settingsGate
      return true
    },
    client: {
      auth: {
        async signInWithOAuth() {
          authCalls += 1
          return {
            data: {
              provider: 'google',
              url: 'https://accounts.google.com/o/oauth2/v2/auth',
            },
            error: null,
          }
        },
      },
    },
    origin: 'https://recall-plus.vercel.app',
    storage: testStorage(),
    navigate: () => {},
  }

  const first = startOAuthSignIn('google', '/dashboard', dependencies)
  const duplicate = startOAuthSignIn('github', '/progress', dependencies)
  assert.equal(first, duplicate)
  await Promise.resolve()
  assert.equal(settingsCalls, 1)
  releaseSettings()
  await first
  assert.equal(authCalls, 1)
})

test('Supabase-disabled provider is contained in the app before OAuth navigation', async () => {
  let authCalls = 0
  const result = await startOAuthSignIn('apple', '/dashboard', {
    configured: true,
    featureEnabled: () => true,
    providerEnabledInSupabase: async () => false,
    client: {
      auth: {
        async signInWithOAuth() {
          authCalls += 1
          return { data: { provider: 'apple', url: 'https://appleid.apple.com' }, error: null }
        },
      },
    },
    origin: 'https://recall-plus.vercel.app',
    storage: testStorage(),
    navigate: () => assert.fail('disabled provider must not navigate'),
  })
  assert.match(result.error, /not configured yet/i)
  assert.equal(authCalls, 0)
})

test('OAuth errors are classified into friendly messages without raw backend JSON', () => {
  const raw = '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}'
  assert.equal(classifyOAuthError(raw), 'provider_unavailable')
  assert.equal(
    classifyOAuthError({
      code: 400,
      error_code: 'validation_failed',
      msg: 'Unsupported provider: provider is not enabled',
    }),
    'provider_unavailable',
  )
  const message = friendlyOAuthError(raw, 'google', 'start')
  assert.match(message, /Google sign-in is not configured yet/)
  assert.doesNotMatch(message, /validation_failed|Unsupported provider|"code"/)
  assert.match(
    friendlyOAuthError('redirect_uri is not allowed', 'github', 'callback'),
    /return address is not approved/,
  )
  assert.match(
    friendlyOAuthError('access_denied', 'apple', 'callback'),
    /was cancelled/,
  )
  assert.match(
    friendlyOAuthError('Failed to fetch', 'google', 'start'),
    /could not reach/,
  )
  assert.match(
    friendlyOAuthError('access_denied', null, 'callback'),
    /Social sign-in was cancelled/,
  )
  const diagnostic = safeOAuthDiagnosticMessage(
    'callback failed client_secret="never-log-this" '
    + 'access_token=also-never-log '
    + 'https://example.test/callback?code=secret',
  )
  assert.doesNotMatch(diagnostic, /never-log-this|also-never-log|code=secret/)
  assert.match(diagnostic, /\[credential\]/)
  assert.match(diagnostic, /\[url\]/)
})

test('OAuth callback parser ignores auth tokens and reads only code or safe error fields', () => {
  assert.deepEqual(
    readOAuthCallbackParameters('?code=one-time-code', '#access_token=ignored'),
    {
      code: 'one-time-code',
      error: '',
      errorCode: '',
      errorDescription: '',
    },
  )
  assert.deepEqual(
    readOAuthCallbackParameters('', '#error=access_denied&error_description=The+user+cancelled'),
    {
      code: '',
      error: 'access_denied',
      errorCode: '',
      errorDescription: 'The user cancelled',
    },
  )
})

test('OAuth callback exchanges one code and rejects denial or missing input without exchange', async () => {
  let exchangedCodes = []
  const auth = {
    async exchangeCodeForSession(code) {
      exchangedCodes.push(code)
      return {
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }
    },
  }

  const success = await exchangeOAuthCallback('?code=valid-code', '', auth)
  assert.equal(success.status, 'success')
  assert.deepEqual(exchangedCodes, ['valid-code'])

  exchangedCodes = []
  const denied = await exchangeOAuthCallback(
    '?error=access_denied&error_description=cancelled',
    '',
    auth,
  )
  assert.deepEqual(denied, {
    status: 'error',
    reason: 'provider',
    error: {
      error: 'access_denied',
      error_code: '',
      description: 'cancelled',
    },
  })
  assert.deepEqual(exchangedCodes, [])

  const missing = await exchangeOAuthCallback('', '', auth)
  assert.deepEqual(missing, { status: 'error', reason: 'missing_code' })
  assert.deepEqual(exchangedCodes, [])
})

test('OAuth callback single-flights a Strict Mode duplicate code exchange', async () => {
  let releaseExchange
  let exchangeCalls = 0
  const exchangeGate = new Promise((resolve) => {
    releaseExchange = resolve
  })
  const auth = {
    async exchangeCodeForSession() {
      exchangeCalls += 1
      await exchangeGate
      return {
        data: { session: { user: { id: 'strict-user' } } },
        error: null,
      }
    },
  }

  const first = exchangeOAuthCallback('?code=strict-mode-code', '', auth)
  const duplicate = exchangeOAuthCallback('?code=strict-mode-code', '', auth)
  assert.equal(first, duplicate)
  await Promise.resolve()
  assert.equal(exchangeCalls, 1)
  releaseExchange()
  assert.equal((await first).status, 'success')
  assert.equal((await duplicate).status, 'success')
})

test('Supabase session configuration uses PKCE, persistence, refresh, and explicit callback exchange', () => {
  assert.equal(supabaseAuthOptions.flowType, 'pkce')
  assert.equal(supabaseAuthOptions.persistSession, true)
  assert.equal(supabaseAuthOptions.autoRefreshToken, true)
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

test('repeated signup without a session tries password sign-in instead of a fake login', () => {
  assert.equal(shouldAttemptPasswordSignInAfterSignUp({ session: { access_token: 't' }, error: null }), false)
  assert.equal(shouldAttemptPasswordSignInAfterSignUp({ session: null, error: null }), true)
  assert.equal(
    shouldAttemptPasswordSignInAfterSignUp({
      session: null,
      error: { code: 'user_already_exists', message: 'User already registered' },
    }),
    true,
  )
  assert.equal(
    shouldAttemptPasswordSignInAfterSignUp({
      session: null,
      error: { code: 'weak_password', message: 'Password is too weak' },
    }),
    false,
  )

  assert.deepEqual(
    passwordSignInAfterSignUpResult({ session: { access_token: 't' }, error: null }),
    { error: '' },
  )
  assert.deepEqual(
    passwordSignInAfterSignUpResult({
      session: null,
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    }),
    { error: '', needsEmailConfirmation: true },
  )

  const existing = passwordSignInAfterSignUpResult({
    session: null,
    error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
  })
  assert.equal(existing.needsEmailConfirmation, undefined)
  assert.equal(isExistingAccountAuthMessage(existing.error), true)
  assert.equal(completedAuthDestination('signup', true), null)
})

test('password authentication errors are specific, actionable, and sanitized', () => {
  const incorrect = friendlyPasswordAuthError(
    { code: 'invalid_credentials', message: 'Invalid login credentials' },
    'signin',
  )
  assert.equal(
    incorrect,
    'The email address or password is incorrect. Check both and try again.',
  )
  assert.equal(
    passwordAuthErrorTitle('signin', incorrect),
    'Email or password is incorrect',
  )

  const duplicate = friendlyPasswordAuthError(
    { code: 'user_already_exists', message: 'User already registered' },
    'signup',
  )
  assert.match(duplicate, /account already exists/i)
  assert.equal(passwordAuthErrorTitle('signup', duplicate), 'Account already exists')

  assert.match(
    friendlyPasswordAuthError({ message: 'Database error saving new user: private detail' }, 'signup'),
    /could not finish setting up your account/i,
  )
  assert.doesNotMatch(
    friendlyPasswordAuthError({ message: 'Unknown backend detail that should stay private' }, 'signup'),
    /backend detail/i,
  )
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

test('subject-edit safeguards count preserved history and future timetable entries', () => {
  const storage = testStorage()
  withLocalStorage(storage, () => {
    setStorageUser('subject-history-owner')
    saveDataBatchOrThrow([
      [STORAGE_KEYS.logs, [
        { id: 'physics-log', subject: 'Physics' },
        { id: 'chemistry-log', subject: 'Chemistry' },
      ]],
      [STORAGE_KEYS.quizResults, [
        { id: 'physics-quiz', subject: 'Physics' },
      ]],
      [STORAGE_KEYS.reviews, [
        { id: 'physics-review', subject: 'Physics' },
      ]],
      [STORAGE_KEYS.topicStatuses, {
        'Physics||Motion||Speed': 'Mastered',
        'Physics||Motion||Acceleration': 'Studied',
        'Chemistry||Structure||Atoms': 'Studied',
      }],
      [STORAGE_KEYS.studyTimetable, [
        { id: 'physics-slot', subject: 'Physics' },
      ]],
    ])

    const counts = countSubjectHistory('Physics')
    assert.deepEqual(counts, {
      studyLogs: 1,
      quizzes: 1,
      revisions: 1,
      progressRecords: 2,
      timetableEntries: 1,
    })
    assert.equal(totalSubjectHistory(counts), 5)
  })
})
