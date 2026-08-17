import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/app.js'
import {
  handleQuizGeneration,
} from '../server/apiHandlers.js'
import { requestQuiz } from '../server/quizGeneration.js'
import { normalizeInsightsRequest, requestInsights } from '../server/insights.js'
import {
  assertJsonValueWithinLimits,
  MAX_REQUEST_BODY_BYTES,
  readBoundedJsonBody,
} from '../server/requestValidation.js'
import { sendError } from '../server/http.js'
import { AppError } from '../server/errors.js'
import { fetchProvider, readProviderJson } from '../server/upstreamFetch.js'
import handleUnknownApiRoute from '../api/[...path].js'
import {
  QUIZ_VERIFICATION_VERSION,
  validateVerifiedQuizQuestions,
} from '../shared/quizValidation.js'

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

function providerQuizResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function verificationEntries(questions, overrides = {}) {
  return questions.map((question) => ({
    id: question.id,
    answer: overrides[question.id] ?? question.answer,
  }))
}

function mixedPhysicsQuiz() {
  return [
    {
      id: 'q1',
      difficulty: 'easy',
      question: 'What is the SI unit of velocity?',
      options: ['m/s', 'm/s²', 'm', 's'],
      answer: 'm/s',
      explanation: 'Velocity is displacement per unit time, so its SI unit is m/s.',
    },
    {
      id: 'q2',
      difficulty: 'medium',
      question: 'A body travels 20 m in 4 s at constant speed. What is its speed?',
      options: ['4 m/s', '5 m/s', '16 m/s', '80 m/s'],
      answer: '5 m/s',
      explanation: 'Speed is distance divided by time: 20/4 = 5 m/s.',
    },
    {
      id: 'q3',
      difficulty: 'medium',
      question: 'Which quantity has both magnitude and direction?',
      options: ['Mass', 'Time', 'Velocity', 'Temperature'],
      answer: 'Velocity',
      explanation: 'Velocity is a vector and therefore has both magnitude and direction.',
    },
    {
      id: 'q4',
      difficulty: 'hard',
      question: 'What is the acceleration of a body moving with constant velocity?',
      options: ['0 m/s²', '1 m/s²', '9.8 m/s²', 'It always increases'],
      answer: '0 m/s²',
      explanation: 'Constant velocity has zero rate of change, so acceleration is zero.',
    },
    {
      id: 'q5',
      difficulty: 'hard',
      question: 'A force of 10 N acts on a 2 kg body. What is its acceleration?',
      options: ['2 m/s²', '5 m/s²', '10 m/s²', '20 m/s²'],
      answer: '5 m/s²',
      explanation: 'Newton’s second law gives a = F/m = 10/2 = 5 m/s².',
    },
  ].map((question) => ({
    questionType: ['q2', 'q5'].includes(question.id) ? 'numerical' : 'theory',
    sourceReference: 'test-topic',
    calculation: question.id === 'q2'
      ? { operation: 'divide', operands: [20, 4], unit: 'm/s', decimals: 0 }
      : question.id === 'q5'
        ? { operation: 'divide', operands: [10, 2], unit: 'm/s²', decimals: 0 }
        : null,
    ...question,
  }))
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

test('curriculum denial happens before quota reservation or provider work', async () => {
  let limiterCalls = 0
  let providerCalls = 0
  const response = mockResponse()
  await handleQuizGeneration(jsonRequest({
    curriculumSubjectId: 'cbse-2026-27-xi-027',
    chapterNodeIds: ['history-world'],
    topicNodeIds: ['history-topic'],
    count: 5,
    level: 'mixed',
    purpose: 'practice',
  }), response, {
    authenticatedUser: async () => ({ id: 'verified-user', accessToken: 'verified-token' }),
    authorizeQuizRequest: async () => {
      throw new AppError('That curriculum selection is not active in your account.', {
        code: 'CURRICULUM_ACCESS_DENIED',
        statusCode: 403,
      })
    },
    runLimitedGeneration: async () => {
      limiterCalls += 1
      return {}
    },
    requestQuiz: async () => {
      providerCalls += 1
      return []
    },
  })

  assert.equal(response.statusCode, 403)
  assert.equal(response.body.code, 'CURRICULUM_ACCESS_DENIED')
  assert.equal(limiterCalls, 0)
  assert.equal(providerCalls, 0)
})

test('insight validation bounds every nested collection and rejects unknown data', () => {
  const valid = {
    chapterContexts: [{
      curriculumSubjectId: 'cbse-2026-27-xi-042',
      chapterNodeId: 'physics-motion',
      topicNodeIds: ['physics-velocity'],
      subject: 'Physics',
      chapter: 'Motion',
      syllabusTopics: ['Velocity'],
      weakTopics: [],
    }],
  }
  assert.deepEqual(normalizeInsightsRequest(valid), {
    chapterContexts: [{
      curriculumSubjectId: 'cbse-2026-27-xi-042',
      chapterNodeId: 'physics-motion',
      topicNodeIds: ['physics-velocity'],
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

test('AI insights fail closed without NVIDIA_API_KEY', async () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalFetch = globalThis.fetch
  let providerCalls = 0
  delete process.env.NVIDIA_API_KEY
  globalThis.fetch = async () => {
    providerCalls += 1
    throw new Error('Provider must not be called without NVIDIA_API_KEY.')
  }

  try {
    await assert.rejects(
      requestInsights([]),
      (error) => (
        error.code === 'AI_PROVIDER_UNAVAILABLE'
        && error.statusCode === 503
        && /insights are temporarily unavailable/i.test(error.message)
      ),
    )
    assert.equal(providerCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('AI insights authenticate only with NVIDIA_API_KEY', async () => {
  const originalKey = process.env.NVIDIA_API_KEY
  const originalFetch = globalThis.fetch
  let authorization = ''
  let providerUrl = ''
  process.env.NVIDIA_API_KEY = 'nvidia-insights-test-key'
  globalThis.fetch = async (input, init) => {
    providerUrl = String(input)
    authorization = init.headers.Authorization
    return providerQuizResponse({
      headline: 'Focus on motion',
      summary: 'Use the saved scores to revise.',
      chapters: [],
    })
  }
  const normalized = normalizeInsightsRequest({
    chapterContexts: [{
      curriculumSubjectId: 'cbse-2026-27-xi-042',
      chapterNodeId: 'physics-motion',
      topicNodeIds: ['physics-velocity'],
      subject: 'Physics',
      chapter: 'Motion',
      syllabusTopics: ['Velocity'],
      weakTopics: [],
    }],
  })

  try {
    const result = await requestInsights(normalized.chapterContexts)
    assert.equal(authorization, 'Bearer nvidia-insights-test-key')
    assert.equal(providerUrl, 'https://integrate.api.nvidia.com/v1/chat/completions')
    assert.equal(result.source, 'nvidia')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
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

test('quiz generation is accepted only after two answer-blind verification passes agree', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  const questions = mixedPhysicsQuiz()
  let providerCalls = 0
  const providerUrls = []
  const providerBodies = []
  process.env.NVIDIA_API_KEY = 'test-only-key'
  globalThis.fetch = async (input, init) => {
    providerCalls += 1
    providerUrls.push(String(input))
    providerBodies.push(JSON.parse(init.body))
    if (providerCalls === 1) return providerQuizResponse({ questions })
    return providerQuizResponse({
      verifications: verificationEntries(questions),
    })
  }

  try {
    const verified = await requestQuiz({
      subject: 'Physics',
      chapter: 'Motion',
      topic: 'Velocity',
      count: 5,
      level: 'mixed',
    })
    assert.equal(providerCalls, 3)
    assert.equal(providerUrls.every((url) => url === 'https://integrate.api.nvidia.com/v1/chat/completions'), true)
    assert.equal(providerBodies.every((body) => body.model === 'z-ai/glm-5.2'), true)
    assert.equal(providerBodies[0].reasoning_effort, 'medium')
    assert.equal(providerBodies[1].reasoning_effort, 'high')
    assert.equal(providerBodies[2].reasoning_effort, 'high')
    assert.equal(providerBodies.every((body) => body.response_format === undefined), true)
    assert.equal(validateVerifiedQuizQuestions(verified, 5), true)
    assert.equal(
      verified.every((question) => question.verification === QUIZ_VERIFICATION_VERSION),
      true,
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('Recall and practice generation share NVIDIA_API_KEY and fail closed without it', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  const questions = mixedPhysicsQuiz()
  const authorizations = []
  let providerCalls = 0
  process.env.NVIDIA_API_KEY = 'nvidia-shared-test-key'
  globalThis.fetch = async (_url, init) => {
    authorizations.push(init.headers.Authorization)
    providerCalls += 1
    if (providerCalls % 3 === 1) return providerQuizResponse({ questions })
    return providerQuizResponse({ verifications: verificationEntries(questions) })
  }

  try {
    await requestQuiz({
      subject: 'Physics',
      chapter: 'Motion',
      topic: 'Velocity',
      count: 5,
      level: 'mixed',
      purpose: 'recall',
    })
    assert.deepEqual(authorizations, Array(3).fill('Bearer nvidia-shared-test-key'))

    authorizations.length = 0
    await requestQuiz({
      subject: 'Physics',
      chapter: 'Motion',
      topic: 'Velocity',
      count: 5,
      level: 'mixed',
      purpose: 'practice',
    })
    assert.deepEqual(authorizations, Array(3).fill('Bearer nvidia-shared-test-key'))

    delete process.env.NVIDIA_API_KEY
    authorizations.length = 0
    await assert.rejects(
      requestQuiz({
        subject: 'Physics',
        chapter: 'Motion',
        topic: 'Velocity',
        count: 5,
        level: 'mixed',
        purpose: 'recall',
      }),
      (error) => error.code === 'AI_PROVIDER_UNAVAILABLE' && error.statusCode === 503,
    )
    assert.deepEqual(authorizations, [])
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('answer verification rejects the two incorrect physics keys reported by the user', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  const questions = mixedPhysicsQuiz()
  questions[0] = {
    id: 'q1',
    difficulty: 'easy',
    questionType: 'theory',
    question: 'A particle is projected at 20 m/s at 60 degrees. What is its vertical velocity component?',
    options: ['10 m/s', '10√3 m/s', '20 m/s', '5√3 m/s'],
    answer: '10 m/s',
    explanation: 'The vertical component is v sin θ.',
    sourceReference: 'test-topic',
    calculation: null,
  }
  questions[2] = {
    id: 'q3',
    difficulty: 'medium',
    questionType: 'theory',
    question: 'A stone is thrown upward at 25 m/s. What is its velocity after 2 s if g = 10 m/s²?',
    options: ['5 m/s', '15 m/s', '20 m/s', '45 m/s'],
    answer: '15 m/s',
    explanation: 'Use v = u - gt.',
    sourceReference: 'test-topic',
    calculation: null,
  }
  let providerCalls = 0
  process.env.NVIDIA_API_KEY = 'test-only-key'
  globalThis.fetch = async () => {
    providerCalls += 1
    if (providerCalls === 1) return providerQuizResponse({ questions })
    return providerQuizResponse({
      verifications: verificationEntries(questions, {
        q1: '10√3 m/s',
        q3: '5 m/s',
      }),
    })
  }

  try {
    await assert.rejects(
      requestQuiz({
        subject: 'Physics',
        chapter: 'Motion in a Plane',
        topic: 'Projectile Motion, Motion Under Gravity',
        count: 5,
        level: 'mixed',
      }),
      (error) => (
        error.code === 'AI_PROVIDER_RESPONSE_INVALID'
        && error.statusCode === 502
        && /could not be verified for answer accuracy/i.test(error.message)
      ),
    )
    assert.equal(providerCalls, 2)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('provider response bodies and arbitrary status-bearing errors never leak', async () => {
  const canary = 'provider-secret-canary-DO-NOT-LEAK'
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  process.env.NVIDIA_API_KEY = 'test-only-key'
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
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('an invalid NVIDIA model is not retried', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  let providerCalls = 0
  process.env.NVIDIA_API_KEY = 'test-only-key'
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
    assert.equal(providerCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
  }
})

test('transient NVIDIA failures are capped at three attempts on the same model', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.NVIDIA_API_KEY
  let providerCalls = 0
  process.env.NVIDIA_API_KEY = 'test-only-key'
  globalThis.fetch = async () => {
    providerCalls += 1
    return new Response('{}', { status: 500 })
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
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY
    else process.env.NVIDIA_API_KEY = originalKey
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
    const response = await fetchProvider('https://provider.invalid/test', {}, {
      deadlineAt: Date.now() + 40,
    })
    await assert.rejects(
      readProviderJson(response),
      (error) => (
        error.code === 'AI_PROVIDER_UNAVAILABLE'
        && error.statusCode === 504
        && error.providerCategory === 'nvidia_timeout'
      ),
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

test('Express mounts account deletion and applies the shared authentication boundary', async () => {
  await withHttpServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/delete-account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
    })

    assert.equal(response.status, 401)
    assert.equal((await response.json()).code, 'AUTH_REQUIRED')
  })
})

test('Express serves browser security headers on pages and API responses', async () => {
  await withHttpServer(async (baseUrl) => {
    for (const path of ['/', '/api/not-a-real-route']) {
      const response = await fetch(`${baseUrl}${path}`)
      assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
      assert.equal(response.headers.get('permissions-policy'), 'camera=(), geolocation=(), microphone=()')
      assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
    }
  })
})
