import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/app.js'
import {
  handleQuizGeneration,
} from '../server/apiHandlers.js'
import { requestQuiz } from '../server/groq.js'
import { normalizeInsightsRequest } from '../server/insights.js'
import {
  assertJsonValueWithinLimits,
  MAX_REQUEST_BODY_BYTES,
  readBoundedJsonBody,
} from '../server/requestValidation.js'
import { sendError } from '../server/http.js'
import { fetchGroq, readProviderJson } from '../server/upstreamFetch.js'
import handleUnknownApiRoute from '../api/[...path].js'

const REQUEST_ID = '00000000-0000-4000-8000-000000000901'

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function jsonRequest(body, headers = {}) {
  const serialized = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  return {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'content-length': String(serialized.byteLength),
      'idempotency-key': REQUEST_ID,
      ...headers,
    },
  }
}

function nestedObject(depth) {
  const root = {}
  let cursor = root
  for (let index = 0; index < depth; index += 1) {
    cursor.child = {}
    cursor = cursor.child
  }
  return root
}

async function withHttpServer(callback) {
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  try {
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('iterative body limits reject deep and oversized values without stack overflow', () => {
  assert.throws(
    () => assertJsonValueWithinLimits(nestedObject(20)),
    (error) => error.code === 'PAYLOAD_TOO_COMPLEX' && error.statusCode === 400,
  )
  assert.throws(
    () => assertJsonValueWithinLimits({ value: 'x'.repeat(MAX_REQUEST_BODY_BYTES) }),
    (error) => error.code === 'PAYLOAD_TOO_LARGE' && error.statusCode === 413,
  )
})

test('Vercel-style Content-Length rejection happens before authentication', async () => {
  let authCalls = 0
  const response = mockResponse()
  await handleQuizGeneration(jsonRequest({
    subject: 'Physics',
    chapter: 'Motion',
    topic: 'Velocity',
    count: 5,
    level: 'mixed',
  }, {
    'content-length': String(MAX_REQUEST_BODY_BYTES + 1),
  }), response, {
    authenticatedUser: async () => {
      authCalls += 1
      return { id: 'user-1' }
    },
  })

  assert.equal(response.statusCode, 413)
  assert.equal(response.body.code, 'PAYLOAD_TOO_LARGE')
  assert.equal(authCalls, 0)
})

test('deep request rejection happens before authentication or provider work', async () => {
  let authCalls = 0
  let providerCalls = 0
  const response = mockResponse()
  await handleQuizGeneration(jsonRequest(nestedObject(20)), response, {
    authenticatedUser: async () => {
      authCalls += 1
      return { id: 'user-1' }
    },
    requestQuiz: async () => {
      providerCalls += 1
      return []
    },
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.body.code, 'PAYLOAD_TOO_COMPLEX')
  assert.equal(authCalls, 0)
  assert.equal(providerCalls, 0)
})

test('unknown quiz properties are rejected before limiter or provider calls', async () => {
  let limiterCalls = 0
  let providerCalls = 0
  const response = mockResponse()
  await handleQuizGeneration(jsonRequest({
    subject: ' Physics ',
    chapter: 'Motion',
    topic: 'Velocity',
    count: 5,
    level: 'mixed',
    userId: 'attacker-controlled',
  }), response, {
    authenticatedUser: async () => ({ id: 'verified-user' }),
    runLimitedGeneration: async () => {
      limiterCalls += 1
      return {}
    },
    requestQuiz: async () => {
      providerCalls += 1
      return []
    },
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.body.code, 'INVALID_REQUEST')
  assert.equal(limiterCalls, 0)
  assert.equal(providerCalls, 0)
})

test('insight validation bounds every nested collection and rejects unknown data', () => {
  const valid = {
    chapterContexts: [{
      subject: 'Physics',
      chapter: 'Motion',
      syllabusTopics: ['Velocity'],
      weakTopics: [],
    }],
  }
  assert.deepEqual(normalizeInsightsRequest(valid), {
    chapterContexts: [{
      subject: 'Physics',
      chapter: 'Motion',
      syllabusTopics: ['Velocity'],
      studiedTopics: [],
      unstudiedTopics: [],
      weakTopics: [],
      studyMinutes: 0,
      recentNotes: [],
      missedQuestions: [],
      studySources: null,
      dueReviews: 0,
    }],
  })
  assert.equal(normalizeInsightsRequest({
    ...valid,
    chapterContexts: [{ ...valid.chapterContexts[0], hidden: nestedObject(20) }],
  }), null)
  assert.equal(normalizeInsightsRequest({
    ...valid,
    chapterContexts: [{
      ...valid.chapterContexts[0],
      syllabusTopics: Array.from({ length: 41 }, (_, index) => `Topic ${index}`),
    }],
  }), null)
})

test('raw Vercel-style JSON bodies are parsed within the same boundary', () => {
  const body = readBoundedJsonBody(jsonRequest(JSON.stringify({
    subject: 'Physics',
    chapter: 'Motion',
    topic: 'Velocity',
    count: 5,
  })))
  assert.equal(body.subject, 'Physics')
  assert.throws(
    () => readBoundedJsonBody(jsonRequest('{"subject":')),
    (error) => error.code === 'INVALID_JSON' && error.statusCode === 400,
  )
})

test('Vercel lazy body parse failures map to INVALID_JSON before authentication', async () => {
  let authCalls = 0
  const request = jsonRequest({})
  Object.defineProperty(request, 'body', {
    get() {
      throw new SyntaxError('malformed body')
    },
  })
  const response = mockResponse()

  await handleQuizGeneration(request, response, {
    authenticatedUser: async () => {
      authCalls += 1
      return { id: 'user-1' }
    },
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.body.code, 'INVALID_JSON')
  assert.equal(authCalls, 0)
})

test('already-parsed bodies without a raw byte count fail closed', () => {
  assert.throws(
    () => readBoundedJsonBody({
      body: {},
      headers: { 'content-type': 'application/json' },
    }),
    (error) => error.code === 'LENGTH_REQUIRED' && error.statusCode === 411,
  )
})

test('provider response bodies and arbitrary status-bearing errors never leak', async () => {
  const canary = 'provider-secret-canary-DO-NOT-LEAK'
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GROQ_QUIZ_API_KEY
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: canary },
  }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })

  try {
    await assert.rejects(
      requestQuiz({
        subject: 'Physics',
        chapter: 'Motion',
        topic: 'Velocity',
        count: 5,
        level: 'mixed',
      }),
      (error) => (
        error.code === 'AI_PROVIDER_UNAVAILABLE'
        && error.statusCode === 503
        && !error.message.includes(canary)
      ),
    )

    const raw = new Error(canary)
    raw.statusCode = 401
    const response = mockResponse()
    sendError(response, raw)
    assert.equal(response.statusCode, 500)
    assert.equal(response.body.code, 'INTERNAL_ERROR')
    assert.equal(JSON.stringify(response.body).includes(canary), false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = originalKey
  }
})

test('provider retries are capped at three total calls across model candidates', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GROQ_QUIZ_API_KEY
  let providerCalls = 0
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  globalThis.fetch = async () => {
    providerCalls += 1
    return new Response('{}', { status: 404 })
  }

  try {
    await assert.rejects(requestQuiz({
      subject: 'Physics',
      chapter: 'Motion',
      topic: 'Velocity',
      count: 5,
      level: 'mixed',
    }))
    assert.equal(providerCalls, 3)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = originalKey
  }
})

test('provider deadline remains active while the response body is streaming', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{'))
      init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true })
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

  try {
    const response = await fetchGroq('https://provider.invalid/test', {}, {
      deadlineAt: Date.now() + 40,
    })
    await assert.rejects(
      readProviderJson(response),
      (error) => error.code === 'AI_PROVIDER_UNAVAILABLE' && error.statusCode === 504,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('provider response limit cancels a stream before buffering the full body', async () => {
  let pulls = 0
  let cancelled = false
  const response = new Response(new ReadableStream({
    pull(controller) {
      pulls += 1
      controller.enqueue(new Uint8Array(8))
      if (pulls >= 20) controller.close()
    },
    cancel() {
      cancelled = true
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

  await assert.rejects(
    readProviderJson(response, 10),
    (error) => error.code === 'AI_PROVIDER_RESPONSE_INVALID' && error.statusCode === 502,
  )
  assert.equal(cancelled, true)
  assert.ok(pulls < 20)
})

test('Express returns sanitized JSON for malformed and oversized bodies', async () => {
  await withHttpServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/generate-quiz`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"subject":',
    })
    const malformedText = await malformed.text()
    assert.equal(malformed.status, 400)
    assert.match(malformed.headers.get('content-type'), /^application\/json/)
    assert.equal(JSON.parse(malformedText).code, 'INVALID_JSON')
    assert.doesNotMatch(malformedText, /SyntaxError|node_modules|server\.js/i)

    const oversized = await fetch(`${baseUrl}/api/generate-quiz`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1) }),
    })
    assert.equal(oversized.status, 413)
    assert.equal((await oversized.json()).code, 'PAYLOAD_TOO_LARGE')
  })
})

test('Express and Vercel unknown API routes return the same JSON 404', async () => {
  const vercelResponse = mockResponse()
  handleUnknownApiRoute({ method: 'GET' }, vercelResponse)

  await withHttpServer(async (baseUrl) => {
    const expressResponse = await fetch(`${baseUrl}/api/not-a-real-route`)
    assert.equal(expressResponse.status, 404)
    assert.deepEqual(await expressResponse.json(), vercelResponse.body)
    assert.equal(vercelResponse.statusCode, 404)
    assert.equal(vercelResponse.body.code, 'NOT_FOUND')
  })
})
