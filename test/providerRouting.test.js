import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createChatCompletion } from '../server/ai/client.js'
import { handleAiStatus } from '../server/apiHandlers.js'
import { requestQuiz } from '../server/quizGeneration.js'
import { normalizeInsightsRequest, requestInsights } from '../server/insights.js'
import { AI_FEATURES, DEFAULT_NVIDIA_MODEL, fallbackProviderForFeature, getFeatureProvider, isAiConfigured, modelCandidates } from '../server/ai/config.js'

const providerNames = [
  'GROQ_QUIZ_API_KEY',
  'GROQ_RECALL_API_KEY',
  'GROQ_INSIGHTS_API_KEY',
  'GROQ_TIMETABLE_API_KEY',
  'NVIDIA_API_KEY',
]

function withProviderEnvironment(values, operation) {
  const saved = Object.fromEntries(providerNames.map((name) => [name, process.env[name]]))
  for (const name of providerNames) delete process.env[name]
  Object.assign(process.env, values)
  return Promise.resolve()
    .then(operation)
    .finally(() => {
      for (const name of providerNames) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
      }
    })
}

function providerResponse(content) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function validQuiz() {
  const base = [
    ['q1', 'easy', 'What is the SI unit of velocity?', ['m/s', 'm/s²', 'm', 's'], 'm/s'],
    ['q2', 'medium', 'A body travels 20 m in 4 s. What is its speed?', ['4 m/s', '5 m/s', '16 m/s', '80 m/s'], '5 m/s'],
    ['q3', 'medium', 'Which quantity has magnitude and direction?', ['Mass', 'Time', 'Velocity', 'Temperature'], 'Velocity'],
    ['q4', 'hard', 'What is acceleration at constant velocity?', ['0 m/s²', '1 m/s²', '9.8 m/s²', 'It increases'], '0 m/s²'],
    ['q5', 'hard', 'A 10 N force acts on 2 kg. What is acceleration?', ['2 m/s²', '5 m/s²', '10 m/s²', '20 m/s²'], '5 m/s²'],
  ]
  return base.map(([id, difficulty, question, options, answer]) => ({
    id,
    difficulty,
    question,
    options,
    answer,
    explanation: `The correct answer is ${answer}.`,
    questionType: ['q2', 'q5'].includes(id) ? 'numerical' : 'theory',
    sourceReference: 'test-topic',
    calculation: id === 'q2'
      ? { operation: 'divide', operands: [20, 4], unit: 'm/s', decimals: 0 }
      : id === 'q5'
        ? { operation: 'divide', operands: [10, 2], unit: 'm/s²', decimals: 0 }
        : null,
  }))
}

test('a partial Groq configuration does not route unrelated features to Groq', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), authorization: init.headers.Authorization, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }
  try {
    await withProviderEnvironment({
      GROQ_QUIZ_API_KEY: 'quiz-only-test-key',
      NVIDIA_API_KEY: 'fallback-test-key',
    }, async () => {
      await createChatCompletion({ feature: AI_FEATURES.QUIZ, model: modelCandidates(AI_FEATURES.QUIZ)[0], messages: [] })
      await createChatCompletion({ feature: AI_FEATURES.RECALL, model: modelCandidates(AI_FEATURES.RECALL)[0], messages: [] })
      await createChatCompletion({ feature: AI_FEATURES.INSIGHT, model: modelCandidates(AI_FEATURES.INSIGHT)[0], messages: [] })
      await createChatCompletion({ feature: AI_FEATURES.TIMETABLE, model: modelCandidates(AI_FEATURES.TIMETABLE)[0], messages: [] })

      assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(calls[0].authorization, 'Bearer quiz-only-test-key')
      assert.equal(calls[0].body.max_completion_tokens, 6144)
      for (const call of calls.slice(1)) {
        assert.equal(call.url, 'https://integrate.api.nvidia.com/v1/chat/completions')
        assert.equal(call.authorization, 'Bearer fallback-test-key')
        assert.equal(call.body.model, DEFAULT_NVIDIA_MODEL)
        assert.equal(call.body.max_completion_tokens, undefined)
      }
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a feature without its Groq key or NVIDIA fallback fails closed before any provider call', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls += 1; throw new Error('provider must not be called') }
  try {
    await withProviderEnvironment({ GROQ_QUIZ_API_KEY: 'quiz-only-test-key' }, async () => {
      assert.equal(isAiConfigured(AI_FEATURES.QUIZ), true)
      assert.equal(isAiConfigured(AI_FEATURES.RECALL), false)
      assert.equal(isAiConfigured(), false)
      await assert.rejects(
        createChatCompletion({ feature: AI_FEATURES.RECALL, messages: [] }),
        { code: 'AI_PROVIDER_UNAVAILABLE', statusCode: 503 },
      )
      assert.equal(calls, 0)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('application-invalid Groq quiz output retries generation and both audits on NVIDIA', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const questions = validQuiz()
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (calls.length === 1) return providerResponse({})
    if (calls.length === 2) return providerResponse({ questions })
    return providerResponse({
      verifications: questions.map(({ id, answer }) => ({ id, answer })),
    })
  }
  try {
    await withProviderEnvironment({
      GROQ_QUIZ_API_KEY: 'quiz-test-key',
      GROQ_RECALL_API_KEY: 'recall-test-key',
      GROQ_INSIGHTS_API_KEY: 'insight-test-key',
      GROQ_TIMETABLE_API_KEY: 'timetable-test-key',
      NVIDIA_API_KEY: 'fallback-test-key',
    }, async () => {
      const result = await requestQuiz({
        subject: 'Physics',
        chapter: 'Motion',
        topic: 'Velocity',
        count: 5,
        level: 'mixed',
      })
      assert.equal(result.length, 5)
      assert.deepEqual(calls, [
        'https://api.groq.com/openai/v1/chat/completions',
        'https://integrate.api.nvidia.com/v1/chat/completions',
        'https://integrate.api.nvidia.com/v1/chat/completions',
        'https://integrate.api.nvidia.com/v1/chat/completions',
      ])
      for (const feature of Object.values(AI_FEATURES)) {
        assert.equal(fallbackProviderForFeature(feature), 'nvidia')
      }
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('application-invalid Groq insight output retries on NVIDIA and reports the actual provider', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const normalized = normalizeInsightsRequest({ chapterContexts: [{
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    chapterNodeId: 'physics-motion',
    topicNodeIds: ['physics-velocity'],
    subject: 'Physics',
    chapter: 'Motion',
    syllabusTopics: ['Velocity'],
    weakTopics: [],
  }] })
  assert.ok(normalized)
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (calls.length === 1) return providerResponse({})
    return providerResponse({
      headline: 'Strengthen Motion',
      summary: 'Use the recorded weak-topic evidence to revise velocity.',
      chapters: [{
        subject: 'Physics',
        chapter: 'Motion',
        observedData: 'Velocity is recorded at 40 percent after 30 study minutes.',
        recommendation: 'Rework the missed velocity steps and test the definition again.',
        basedOn: 'Velocity score 40 percent; study time 30 minutes.',
        prioritizedTopics: [{ topic: 'Velocity', reason: 'It has the lowest recorded score.' }],
        studyFrom: {
          primary: 'NCERT Physics Class 11 Part 1',
          sections: ['Review the velocity definition', 'Solve five velocity questions'],
          secondary: 'NCERT Physics Class 11 Part 1',
        },
        focusArea: 'conceptual understanding',
      }],
    })
  }
  try {
    await withProviderEnvironment({
      GROQ_INSIGHTS_API_KEY: 'insight-test-key',
      NVIDIA_API_KEY: 'fallback-test-key',
    }, async () => {
      const result = await requestInsights(normalized.chapterContexts)
      assert.equal(result.source, 'nvidia')
      assert.deepEqual(calls, [
        'https://api.groq.com/openai/v1/chat/completions',
        'https://integrate.api.nvidia.com/v1/chat/completions',
      ])
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('placeholder Groq credentials have the same fallback semantics at runtime and Vercel validation', async () => {
  await withProviderEnvironment({
    GROQ_RECALL_API_KEY: 'YOUR_RECALL_KEY',
    NVIDIA_API_KEY: 'fallback-test-key',
  }, () => {
    assert.equal(getFeatureProvider(AI_FEATURES.RECALL), 'nvidia')
    assert.equal(modelCandidates(AI_FEATURES.RECALL)[0], DEFAULT_NVIDIA_MODEL)
  })

  const result = spawnSync(process.execPath, ['scripts/validate-vercel-env.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'unit-test-public-key',
      SUPABASE_ANON_KEY: 'unit-test-server-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role-key',
      NVIDIA_API_KEY: 'unit-test-nvidia-key',
      GROQ_RECALL_API_KEY: 'YOUR_RECALL_KEY',
    },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /every AI feature has a server-only provider credential/)
})

test('AI status reports feature providers without exposing credential values', async () => {
  await withProviderEnvironment({
    GROQ_QUIZ_API_KEY: 'status-quiz-key',
    NVIDIA_API_KEY: 'status-fallback-key',
  }, () => {
    let payload
    const response = {
      setHeader: () => response,
      status: () => response,
      json: (body) => { payload = body; return response },
    }
    handleAiStatus({ method: 'GET' }, response)
    assert.equal(payload.provider, 'Mixed')
    assert.deepEqual(payload.features, {
      quiz: 'groq',
      recall: 'nvidia',
      insight: 'nvidia',
      timetable: 'nvidia',
    })
    assert.equal(JSON.stringify(payload).includes('status-quiz-key'), false)
    assert.equal(JSON.stringify(payload).includes('status-fallback-key'), false)
  })
})
