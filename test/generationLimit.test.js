import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSingleFlight,
  DAILY_GENERATION_LIMIT,
  GenerationLimitError,
  runLimitedGeneration,
} from '../shared/generationLimitCore.js'

function localDateKey(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function createMemoryStore(initialNow = new Date('2026-07-26T12:00:00.000Z')) {
  let now = initialNow
  const counts = new Map()
  const active = new Map()
  const attempts = new Map()

  function countKey(userId, feature, timezone) {
    return `${userId}|${feature}|${localDateKey(now, timezone)}`
  }

  function status(userId, feature, timezone, fields = {}) {
    const localDate = localDateKey(now, timezone)
    const count = counts.get(`${userId}|${feature}|${localDate}`) || 0
    return {
      allowed: count < DAILY_GENERATION_LIMIT && !active.has(`${userId}|${feature}`),
      reservationId: null,
      remaining: DAILY_GENERATION_LIMIT - count,
      limit: DAILY_GENERATION_LIMIT,
      resetAt: `${localDate}T24:00:00[${timezone}]`,
      localDate,
      inProgress: active.has(`${userId}|${feature}`),
      reason: 'status',
      replay: false,
      ...fields,
    }
  }

  return {
    setNow(value) {
      now = value
    },

    getStatus(userId, feature, timezone = 'UTC') {
      return status(userId, feature, timezone)
    },

    async reserve({ userId, feature, requestId, timezone = 'Asia/Kolkata' }) {
      const prior = attempts.get(requestId)
      if (prior?.status === 'succeeded') {
        return status(userId, feature, timezone, {
          allowed: true,
          reservationId: requestId,
          reason: 'replay',
          replay: true,
          result: prior.result,
        })
      }

      const activeKey = `${userId}|${feature}`
      if (active.has(activeKey)) {
        return status(userId, feature, timezone, {
          allowed: false,
          reason: 'in_progress',
          inProgress: true,
        })
      }

      const current = status(userId, feature, timezone)
      if (current.remaining <= 0) {
        return { ...current, allowed: false, reason: 'daily_limit' }
      }

      attempts.set(requestId, { status: 'reserved', userId, feature, timezone })
      active.set(activeKey, requestId)
      return {
        ...current,
        allowed: true,
        reservationId: requestId,
        reason: 'allowed',
        inProgress: true,
      }
    },

    async commit({ userId, requestId, result }) {
      const attempt = attempts.get(requestId)
      if (!attempt || attempt.userId !== userId) throw new Error('Unknown reservation')
      if (attempt.status === 'succeeded') {
        return status(userId, attempt.feature, attempt.timezone, {
          allowed: true,
          reservationId: requestId,
          reason: 'replay',
          replay: true,
          result: attempt.result,
        })
      }

      const key = countKey(userId, attempt.feature, attempt.timezone)
      counts.set(key, (counts.get(key) || 0) + 1)
      attempt.status = 'succeeded'
      attempt.result = result
      active.delete(`${userId}|${attempt.feature}`)
      return status(userId, attempt.feature, attempt.timezone, {
        allowed: true,
        reservationId: requestId,
        reason: 'allowed',
        result,
      })
    },

    async release({ userId, requestId }) {
      const attempt = attempts.get(requestId)
      if (attempt?.userId === userId && attempt.status === 'reserved') {
        attempt.status = 'failed'
        active.delete(`${userId}|${attempt.feature}`)
        return status(userId, attempt.feature, attempt.timezone, {
          allowed: false,
          reason: 'released',
        })
      }
      return status(userId, 'quiz', 'UTC', { allowed: false, reason: 'released' })
    },
  }
}

function generationInput(store, overrides = {}) {
  return {
    store,
    userId: 'user-1',
    feature: 'quiz',
    requestId: 'request-1',
    generate: async () => ({ value: 'generated' }),
    validate: () => true,
    ...overrides,
  }
}

test('first successful generation changes remaining calls from 10 to 9', async () => {
  const store = createMemoryStore()
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 10)

  const output = await runLimitedGeneration(generationInput(store))

  assert.deepEqual(output.data, { value: 'generated' })
  assert.equal(output.limit.remaining, 9)
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 9)
})

test('a failed provider request does not reduce the limit', async () => {
  const store = createMemoryStore()
  let calls = 0

  await assert.rejects(
    runLimitedGeneration(generationInput(store, {
      generate: async () => {
        calls += 1
        throw new Error('provider unavailable')
      },
    })),
    /provider unavailable/,
  )

  assert.equal(calls, 1)
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 10)
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').inProgress, false)
})

test('an invalid provider response is released instead of counted', async () => {
  const store = createMemoryStore()

  await assert.rejects(
    runLimitedGeneration(generationInput(store, { validate: () => false })),
    /did not pass validation/,
  )

  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 10)
})

test('quiz usage does not affect timetable usage', async () => {
  const store = createMemoryStore()

  await runLimitedGeneration(generationInput(store))

  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 9)
  assert.equal(store.getStatus('user-1', 'timetable', 'Asia/Kolkata').remaining, 10)
})

test('the eleventh request is blocked before the provider is called', async () => {
  const store = createMemoryStore()
  let providerCalls = 0

  for (let index = 0; index < DAILY_GENERATION_LIMIT; index += 1) {
    await runLimitedGeneration(generationInput(store, {
      requestId: `request-${index}`,
      generate: async () => {
        providerCalls += 1
        return { index }
      },
    }))
  }

  await assert.rejects(
    runLimitedGeneration(generationInput(store, {
      requestId: 'request-11',
      generate: async () => {
        providerCalls += 1
        return { value: 'must not run' }
      },
    })),
    (error) => error instanceof GenerationLimitError
      && error.code === 'DAILY_GENERATION_LIMIT'
      && error.statusCode === 429,
  )

  assert.equal(providerCalls, 10)
})

test('usage resets on the next local calendar day', async () => {
  const store = createMemoryStore(new Date('2026-07-26T18:29:59.000Z'))
  await runLimitedGeneration(generationInput(store))
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 9)

  // 18:30 UTC is midnight in Asia/Kolkata.
  store.setNow(new Date('2026-07-26T18:30:00.000Z'))

  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').localDate, '2026-07-27')
  assert.equal(store.getStatus('user-1', 'quiz', 'Asia/Kolkata').remaining, 10)
})

test('rapid double-clicking shares one in-flight API request', async () => {
  const singleFlight = createSingleFlight()
  let providerCalls = 0
  let finish
  const pending = new Promise((resolve) => { finish = resolve })
  const task = () => {
    providerCalls += 1
    return pending
  }

  const first = singleFlight.run('quiz', task)
  const second = singleFlight.run('quiz', task)
  await Promise.resolve()

  assert.equal(providerCalls, 1)
  assert.equal(singleFlight.isRunning('quiz'), true)
  finish({ questions: [] })
  assert.deepEqual(await Promise.all([first, second]), [{ questions: [] }, { questions: [] }])
  assert.equal(singleFlight.isRunning('quiz'), false)
})

test('a completed request id replays its result without another provider call', async () => {
  const store = createMemoryStore()
  let providerCalls = 0
  const input = generationInput(store, {
    generate: async () => {
      providerCalls += 1
      return { value: 'cached' }
    },
  })

  const first = await runLimitedGeneration(input)
  const replay = await runLimitedGeneration(input)

  assert.equal(providerCalls, 1)
  assert.deepEqual(replay.data, first.data)
  assert.equal(replay.limit.replay, true)
  assert.equal(replay.limit.remaining, 9)
})
