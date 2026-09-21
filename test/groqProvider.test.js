import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { handleAiStatus } from '../server/apiHandlers.js'
import { createChatCompletion } from '../server/ai/client.js'
import {
  AI_FEATURES,
  getFeatureProvider,
  isAiConfigured,
  modelCandidates,
} from '../server/ai/config.js'
import { quizSchema, verificationSchema } from '../server/ai/quizSchema.js'

const groqNames = [
  'GROQ_QUIZ_API_KEY',
  'GROQ_RECALL_API_KEY',
  'GROQ_INSIGHTS_API_KEY',
  'GROQ_TIMETABLE_API_KEY',
]

async function withGroqEnvironment(values, run) {
  const saved = Object.fromEntries(groqNames.map((name) => [name, process.env[name]]))
  for (const name of groqNames) delete process.env[name]
  Object.assign(process.env, values)
  try {
    return await run()
  } finally {
    for (const name of groqNames) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
}

test('Groq routes each task and verification to its dedicated server-only key', async () => {
  const saved = Object.fromEntries(groqNames.map((name) => [name, process.env[name]]))
  const originalFetch = globalThis.fetch
  const calls = []
  groqNames.forEach((name, index) => { process.env[name] = `test-credential-${index}` })
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), key: init.headers.Authorization, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }
  try {
    for (const [index, feature] of ['quiz', 'recall', 'insight', 'timetable'].entries()) {
      await createChatCompletion({ feature, model: modelCandidates(feature)[0], messages: [], schema: feature === 'quiz' ? quizSchema(['selected-topic']) : undefined })
      assert.equal(calls.at(-1).url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(calls.at(-1).key, `Bearer test-credential-${index}`)
      assert.equal(calls.at(-1).body.reasoning_budget, undefined)
    }
    await createChatCompletion({ feature: 'verifier', credentialFeature: 'recall', model: modelCandidates('recall')[0], messages: [], schema: verificationSchema })
    assert.equal(calls.at(-1).key, 'Bearer test-credential-1')
  } finally {
    globalThis.fetch = originalFetch
    for (const name of groqNames) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})

test('Groq permanent errors fail closed without a second provider attempt', async () => {
  const saved = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('{}', { status: 401 })
  }
  try {
    await assert.rejects(
      createChatCompletion({ feature: 'quiz', model: 'openai/gpt-oss-120b', messages: [] }),
      (error) => error.providerCategory === 'groq_authentication_error' && error.details?.retryable === false,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})

test('Groq structured-output recovery retains its dynamic question budget', async () => {
  const { requestQuiz } = await import('../server/quizGeneration.js')
  const saved = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  const bodies = []
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 })
  }
  try {
    await assert.rejects(requestQuiz({ subject: 'Physics', chapter: 'Two chapters', topic: 'Themes', count: 10, level: 'mixed' }))
    assert.equal(bodies.length, 3)
    assert.equal(bodies[0].max_completion_tokens, 12096)
    assert.equal(bodies[0].response_format.type, 'json_schema')
    assert.equal(bodies[1].response_format.type, 'json_object')
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})

test('a placeholder credential is unusable to both the Groq runtime and Vercel validator', async () => {
  await withGroqEnvironment({
    GROQ_QUIZ_API_KEY: 'unit-test-quiz-key',
    GROQ_RECALL_API_KEY: 'YOUR_RECALL_KEY',
    GROQ_INSIGHTS_API_KEY: 'unit-test-insights-key',
    GROQ_TIMETABLE_API_KEY: 'unit-test-timetable-key',
  }, async () => {
    assert.equal(getFeatureProvider(AI_FEATURES.RECALL), null)
    assert.equal(isAiConfigured(AI_FEATURES.RECALL), false)
    assert.equal(isAiConfigured(), false)

    const result = spawnSync(process.execPath, ['scripts/validate-vercel-env.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VITE_SUPABASE_URL: 'https://unit-test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'unit-test-browser-anon-key',
        SUPABASE_URL: 'https://unit-test.supabase.co',
        SUPABASE_ANON_KEY: 'unit-test-server-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role-key',
      },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /recall generation requires its dedicated GROQ_\*_API_KEY/)
  })
})

test('a partial Groq configuration fails closed for the unrelated feature before any request', async () => {
  await withGroqEnvironment({ GROQ_QUIZ_API_KEY: 'unit-test-quiz-key' }, async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      throw new Error('The unavailable feature must not make an upstream request')
    }
    try {
      assert.equal(getFeatureProvider(AI_FEATURES.QUIZ), 'groq')
      assert.equal(getFeatureProvider(AI_FEATURES.RECALL), null)
      await assert.rejects(
        createChatCompletion({ feature: AI_FEATURES.RECALL, messages: [] }),
        (error) => error.code === 'AI_PROVIDER_UNAVAILABLE' && error.statusCode === 503,
      )
      assert.equal(calls, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('AI status reports feature readiness without disclosing Groq credentials', async () => {
  const credentials = {
    GROQ_QUIZ_API_KEY: 'status-quiz-key',
    GROQ_RECALL_API_KEY: 'status-recall-key',
    GROQ_INSIGHTS_API_KEY: 'status-insights-key',
    GROQ_TIMETABLE_API_KEY: 'status-timetable-key',
  }
  await withGroqEnvironment(credentials, async () => {
    let payload
    const response = {
      setHeader: () => response,
      status: () => response,
      json: (body) => {
        payload = body
        return response
      },
    }
    handleAiStatus({ method: 'GET' }, response)
    assert.equal(payload.provider, 'Groq')
    assert.deepEqual(payload.features, {
      quiz: 'groq',
      recall: 'groq',
      insight: 'groq',
      timetable: 'groq',
    })
    const statusText = JSON.stringify(payload)
    for (const credential of Object.values(credentials)) {
      assert.doesNotMatch(statusText, new RegExp(credential))
    }
  })
})
