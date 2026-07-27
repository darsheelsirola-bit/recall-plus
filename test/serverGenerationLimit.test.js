import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGenerationRequestHash,
  mapLimiterRpcError,
  runLimitedGeneration,
  runLimitedInsightGeneration,
} from '../server/generationLimit.js'

const REQUEST_ID = '00000000-0000-4000-8000-000000000001'
const REQUEST_HASH = 'a'.repeat(64)

function state(fields = {}) {
  return {
    allowed: true,
    reservationId: REQUEST_ID,
    remaining: 10,
    used: 0,
    limit: 10,
    resetAt: '2026-07-26T18:30:00.000Z',
    localDate: '2026-07-26',
    inProgress: true,
    reason: 'allowed',
    replay: false,
    result: null,
    ...fields,
  }
}

test('production limiter commits only after a successful generator result', async () => {
  const calls = []
  const result = await runLimitedGeneration({
    userId: 'user-1',
    feature: 'quiz',
    requestId: REQUEST_ID,
    requestHash: REQUEST_HASH,
    generate: async () => {
      calls.push('provider')
      return { questions: [{ id: 'q1' }] }
    },
  }, {
    reserve: async () => {
      calls.push('reserve')
      return state()
    },
    commit: async (_userId, _feature, _requestId, generated) => {
      calls.push('commit')
      return state({ remaining: 9, used: 1, inProgress: false, result: generated })
    },
    release: async () => {
      calls.push('release')
      return state()
    },
  })

  assert.deepEqual(calls, ['reserve', 'provider', 'commit'])
  assert.equal(result.usage.remaining, 9)
})

test('production limiter releases a failed provider request without committing', async () => {
  const calls = []
  await assert.rejects(
    runLimitedGeneration({
      userId: 'user-1',
      feature: 'timetable',
      requestId: REQUEST_ID,
      requestHash: REQUEST_HASH,
      generate: async () => {
        calls.push('provider')
        throw new Error('provider failed')
      },
    }, {
      reserve: async () => {
        calls.push('reserve')
        return state()
      },
      commit: async () => {
        calls.push('commit')
        return state()
      },
      release: async () => {
        calls.push('release')
        return state({ remaining: 10, used: 0, inProgress: false })
      },
    }),
    /provider failed/,
  )

  assert.deepEqual(calls, ['reserve', 'provider', 'release'])
})

test('production limiter blocks exhausted usage before calling the provider', async () => {
  let providerCalls = 0
  await assert.rejects(
    runLimitedGeneration({
      userId: 'user-1',
      feature: 'quiz',
      requestId: REQUEST_ID,
      requestHash: REQUEST_HASH,
      generate: async () => {
        providerCalls += 1
        return {}
      },
    }, {
      reserve: async () => state({
        allowed: false,
        remaining: 0,
        used: 10,
        inProgress: false,
        reason: 'daily_limit',
      }),
    }),
    (error) => error.statusCode === 429 && error.code === 'DAILY_GENERATION_LIMIT',
  )
  assert.equal(providerCalls, 0)
})

test('a permanently failed idempotency key returns a definitive conflict', async () => {
  let providerCalls = 0
  await assert.rejects(
    runLimitedGeneration({
      userId: 'user-1',
      feature: 'quiz',
      requestId: REQUEST_ID,
      requestHash: REQUEST_HASH,
      generate: async () => {
        providerCalls += 1
        return {}
      },
    }, {
      reserve: async () => state({
        allowed: false,
        inProgress: false,
        reason: 'request_failed',
      }),
    }),
    (error) => error.statusCode === 409 && error.code === 'GENERATION_REQUEST_FAILED',
  )
  assert.equal(providerCalls, 0)
})

test('request fingerprints are canonical and payload-bound', () => {
  const first = createGenerationRequestHash('quiz', {
    subject: 'Physics',
    nested: { chapter: 'Motion', topics: ['Speed', 'Velocity'] },
  })
  const reordered = createGenerationRequestHash('quiz', {
    nested: { topics: ['Speed', 'Velocity'], chapter: 'Motion' },
    subject: 'Physics',
  })
  const changed = createGenerationRequestHash('quiz', {
    subject: 'Physics',
    nested: { chapter: 'Motion', topics: ['Acceleration'] },
  })

  assert.match(first, /^[0-9a-f]{64}$/)
  assert.equal(reordered, first)
  assert.notEqual(changed, first)
})

test('request fingerprinting rejects deep input before recursive canonicalization', () => {
  const payload = {}
  let cursor = payload
  for (let index = 0; index < 20; index += 1) {
    cursor.child = {}
    cursor = cursor.child
  }
  assert.throws(
    () => createGenerationRequestHash('quiz', payload),
    (error) => error.code === 'PAYLOAD_TOO_COMPLEX' && error.statusCode === 400,
  )
})

test('database attempt-limit errors map to a generic 429 with safe details', () => {
  const error = mapLimiterRpcError({
    code: 'P0001',
    message: 'GENERATION_ATTEMPT_LIMIT',
    details: JSON.stringify({
      retryAt: '2026-07-27T12:10:00.000Z',
      attemptLimit: 12,
      attemptWindowSeconds: 600,
      secret: 'must-not-pass-through',
    }),
  })
  assert.equal(error.statusCode, 429)
  assert.equal(error.code, 'GENERATION_ATTEMPT_LIMIT')
  assert.deepEqual(error.details, {
    retryAt: '2026-07-27T12:10:00.000Z',
    attemptLimit: 12,
    attemptWindowSeconds: 600,
  })
  assert.equal(JSON.stringify(error.details).includes('secret'), false)
})

test('misbound database request ids map to a definitive sanitized conflict', () => {
  for (const message of [
    'Request id is already owned by another generation.',
    'Request id is already bound to a different request payload.',
  ]) {
    const error = mapLimiterRpcError({
      code: '23505',
      message,
      details: 'database detail must not pass through',
    })
    assert.equal(error.statusCode, 409)
    assert.equal(error.code, 'INVALID_IDEMPOTENCY_KEY')
    assert.equal(error.details, null)
    assert.equal(error.message.includes('database detail'), false)
  }

  const unknownUniqueViolation = mapLimiterRpcError({
    code: '23505',
    message: 'Unexpected database constraint.',
  })
  assert.equal(unknownUniqueViolation.statusCode, 503)
  assert.equal(unknownUniqueViolation.code, 'RATE_LIMIT_UNAVAILABLE')
})

test('attempt throttling blocks provider work without consuming success quota', async () => {
  let providerCalls = 0
  const throttle = mapLimiterRpcError({
    code: 'P0001',
    message: 'GENERATION_ATTEMPT_LIMIT',
    details: '{"attemptLimit":12,"attemptWindowSeconds":600}',
  })
  await assert.rejects(
    runLimitedGeneration({
      userId: 'user-1',
      feature: 'quiz',
      requestId: REQUEST_ID,
      requestHash: REQUEST_HASH,
      generate: async () => {
        providerCalls += 1
        return {}
      },
    }, {
      reserve: async () => {
        throw throttle
      },
    }),
    (error) => error.statusCode === 429 && error.code === 'GENERATION_ATTEMPT_LIMIT',
  )
  assert.equal(providerCalls, 0)
})

test('insight generation commits once and cache replay skips provider work', async () => {
  const calls = []
  const generated = { headline: 'Prioritise vectors', chapters: [] }
  const first = await runLimitedInsightGeneration({
    userId: 'user-1',
    requestId: REQUEST_ID,
    requestHash: REQUEST_HASH,
    generate: async () => {
      calls.push('provider')
      return generated
    },
  }, {
    reserve: async () => ({
      allowed: true,
      reservationId: REQUEST_ID,
      inProgress: true,
      reason: 'allowed',
      replay: false,
      result: null,
    }),
    commit: async (_userId, _requestId, result) => {
      calls.push('commit')
      return {
        allowed: true,
        reservationId: REQUEST_ID,
        inProgress: false,
        reason: 'committed',
        replay: false,
        result,
      }
    },
  })
  assert.deepEqual(first.result, generated)
  assert.deepEqual(calls, ['provider', 'commit'])

  const replay = await runLimitedInsightGeneration({
    userId: 'user-1',
    requestId: '00000000-0000-4000-8000-000000000002',
    requestHash: REQUEST_HASH,
    generate: async () => {
      calls.push('unexpected-provider')
      return {}
    },
  }, {
    reserve: async () => ({
      allowed: true,
      reservationId: REQUEST_ID,
      inProgress: false,
      reason: 'replay',
      replay: true,
      result: generated,
    }),
  })
  assert.equal(replay.replay, true)
  assert.deepEqual(replay.result, generated)
  assert.deepEqual(calls, ['provider', 'commit'])
})

test('concurrent insight reservation maps to a generic 409', async () => {
  await assert.rejects(
    runLimitedInsightGeneration({
      userId: 'user-1',
      requestId: REQUEST_ID,
      requestHash: REQUEST_HASH,
      generate: async () => ({}),
    }, {
      reserve: async () => ({
        allowed: false,
        reservationId: REQUEST_ID,
        inProgress: true,
        reason: 'in_progress',
        replay: false,
        result: null,
      }),
    }),
    (error) => error.statusCode === 409 && error.code === 'GENERATION_IN_PROGRESS',
  )
})
