import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGenerationRequestHash,
  runLimitedGeneration,
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
