import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatCompletion } from '../server/ai/client.js'
import { modelCandidates } from '../server/ai/config.js'
import { quizSchema, scopedVerificationSchema, verificationSchema } from '../server/ai/quizSchema.js'

test('Groq routes each task and its verification to the dedicated key, with feature-scoped NVIDIA fallback', async () => {
  const names = ['GROQ_QUIZ_API_KEY', 'GROQ_RECALL_API_KEY', 'GROQ_INSIGHTS_API_KEY', 'GROQ_TIMETABLE_API_KEY', 'NVIDIA_API_KEY']
  const saved = names.map((name) => process.env[name])
  const originalFetch = globalThis.fetch
  const calls = []
  names.forEach((name, index) => { process.env[name] = `test-credential-${index}` })
  globalThis.fetch = async (url, init) => {
    calls.push({ url, key: init.headers.Authorization, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }
  try {
    for (const [index, feature] of ['quiz', 'recall', 'insight', 'timetable'].entries()) {
      await createChatCompletion({ feature, model: modelCandidates(feature)[0], messages: [], schema: feature === 'quiz' ? quizSchema(['selected-topic']) : undefined })
      assert.equal(calls.at(-1).key, `Bearer test-credential-${index}`)
      assert.equal(calls.at(-1).url, 'https://api.groq.com/openai/v1/chat/completions')
      assert.equal(calls.at(-1).body.reasoning_budget, undefined)
      if (feature === 'quiz') {
        const format = calls.at(-1).body.response_format
        assert.equal(format.json_schema.strict, true)
        assert.deepEqual(format.json_schema.schema.properties.questions.items.properties.sourceReference.enum, ['selected-topic'])
      }
    }
    await createChatCompletion({ feature: 'verifier', credentialFeature: 'recall', model: modelCandidates('recall')[0], messages: [], schema: verificationSchema })
    assert.equal(calls.at(-1).key, 'Bearer test-credential-1')
    assert.deepEqual(calls.at(-1).body.response_format.json_schema.schema, verificationSchema)
    delete process.env.GROQ_RECALL_API_KEY
    await createChatCompletion({ feature: 'recall', model: modelCandidates('recall')[0], messages: [] })
    assert.equal(calls.at(-1).key, 'Bearer test-credential-4')
    assert.equal(calls.at(-1).url, 'https://integrate.api.nvidia.com/v1/chat/completions')
    assert.equal(calls.at(-1).body.max_tokens, 4096)
    assert.equal(calls.length, 6)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  }
})

test('a busy Groq quiz call fails over once to the configured NVIDIA provider', async () => {
  const names = ['GROQ_QUIZ_API_KEY', 'NVIDIA_API_KEY', 'NVIDIA_MODEL_QUIZ']
  const saved = names.map((name) => process.env[name])
  const originalFetch = globalThis.fetch
  const calls = []
  process.env.GROQ_QUIZ_API_KEY = 'quiz-groq-key'
  process.env.NVIDIA_API_KEY = 'quiz-nvidia-key'
  process.env.NVIDIA_MODEL_QUIZ = 'openai/gpt-oss-20b'
  globalThis.fetch = async (url, init) => {
    calls.push({ url, key: init.headers.Authorization, body: JSON.parse(init.body) })
    if (calls.length === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0' } })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }

  try {
    await createChatCompletion({
      feature: 'quiz',
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'Return JSON.' }],
      schema: quizSchema(['selected-topic']),
    })
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(calls[0].key, 'Bearer quiz-groq-key')
    assert.equal(calls[1].url, 'https://integrate.api.nvidia.com/v1/chat/completions')
    assert.equal(calls[1].key, 'Bearer quiz-nvidia-key')
    assert.equal(calls[1].body.model, 'openai/gpt-oss-20b')
    assert.equal(calls[1].body.max_tokens, 4096)
    assert.equal(calls[1].body.response_format, undefined)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  }
})

test('a Groq constrained-decoding failure falls back to NVIDIA', async () => {
  const names = ['GROQ_QUIZ_API_KEY', 'NVIDIA_API_KEY']
  const saved = names.map((name) => process.env[name])
  const originalFetch = globalThis.fetch
  const calls = []
  process.env.GROQ_QUIZ_API_KEY = 'quiz-groq-key'
  process.env.NVIDIA_API_KEY = 'quiz-nvidia-key'
  globalThis.fetch = async (url) => {
    calls.push(url)
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 })
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
  }

  try {
    await createChatCompletion({
      feature: 'quiz',
      model: 'openai/gpt-oss-120b',
      messages: [],
      schema: quizSchema(['selected-topic']),
    })
    assert.deepEqual(calls, [
      'https://api.groq.com/openai/v1/chat/completions',
      'https://integrate.api.nvidia.com/v1/chat/completions',
    ])
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  }
})

test('permanent Groq errors fail closed and are not marked retryable', async () => {
  const names = ['GROQ_QUIZ_API_KEY', 'NVIDIA_API_KEY']
  const saved = names.map((name) => process.env[name])
  const originalFetch = globalThis.fetch
  let calls = 0
  let responseStatus = 401
  process.env.GROQ_QUIZ_API_KEY = 'invalid-groq-key'
  process.env.NVIDIA_API_KEY = 'nvidia-key'
  globalThis.fetch = async () => {
    calls += 1
    return new Response('{}', { status: responseStatus })
  }

  try {
    for (const [status, category] of [
      [400, 'groq_unavailable'],
      [401, 'groq_authentication_error'],
      [403, 'groq_authentication_error'],
      [404, 'invalid_groq_model'],
      [422, 'invalid_groq_model'],
    ]) {
      responseStatus = status
      const before = calls
      await assert.rejects(
        createChatCompletion({ feature: 'quiz', model: 'openai/gpt-oss-120b', messages: [] }),
        (error) => error.upstreamStatus === status
          && error.providerCategory === category
          && error.details?.retryable === false
          && /configuration could not be verified/i.test(error.message),
      )
      assert.equal(calls, before + 1)
    }
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]
      else process.env[name] = saved[index]
    })
  }
})

test('Groq retries only recoverable structured-output failures and scales the question budget', async () => {
  const { requestQuiz } = await import('../server/quizGeneration.js')
  const saved = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  const bodies = []
  try {
    for (const code of ['json_validate_failed', 'invalid_api_key', 'invalid_request_error']) {
      bodies.length = 0
      globalThis.fetch = async (_url, init) => {
        bodies.push(JSON.parse(init.body))
        return new Response(JSON.stringify({ error: { code } }), { status: 400 })
      }
      await assert.rejects(requestQuiz({ subject: 'English', chapter: 'Two chapters', topic: 'Themes', count: 10, level: 'mixed' }))
      assert.equal(bodies.length, code === 'json_validate_failed' ? 3 : 1)
      assert.equal(bodies[0].max_completion_tokens, 12096)
      assert.equal(bodies[0].response_format.type, 'json_schema')
      if (code === 'json_validate_failed') assert.equal(bodies[1].response_format.type, 'json_object')
    }
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})

test('Groq format fallback returns ten questions only after two answer audits', async () => {
  const { requestQuiz } = await import('../server/quizGeneration.js')
  const saved = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  const questions = Array.from({ length: 10 }, (_, i) => ({ id: `q${i + 1}`, difficulty: 'medium', questionType: 'theory', question: `What is the theme in passage ${i + 1}?`, options: ['Companionship', 'War', 'Commerce', 'Politics'], answer: 'Companionship', explanation: 'The passage describes friendship.', sourceReference: 'test-topic', calculation: null }))
  const bodies = []
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    if (bodies.length === 1) return new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 })
    const content = bodies.length === 2
      ? { questions }
      : { verifications: questions.map(({ id, answer }) => ({ id, inScope: true, answer })) }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
  }
  try {
    const result = await requestQuiz({ subject: 'English', chapter: 'Two chapters', topic: 'Themes', count: 10, level: 'medium' })
    assert.equal(result.length, 10)
    const schema = bodies[0].response_format.json_schema.schema
    assert.deepEqual(schema.properties.questions.items.properties.questionType.enum, ['theory'])
    assert.deepEqual(schema.properties.questions.items.properties.calculation, { type: 'null' })
    assert.equal(bodies.length, 4)
    assert.ok(bodies[2].messages[1].content.includes('Selected chapters: Two chapters'))
    assert.ok(!bodies[2].messages[1].content.includes('The passage describes friendship.'))
    assert.equal(bodies[1].response_format.type, 'json_object')
    assert.deepEqual(bodies[2].response_format.json_schema.schema, scopedVerificationSchema)
    assert.deepEqual(bodies[3].response_format.json_schema.schema, scopedVerificationSchema)
    assert.equal(bodies[0].model, bodies[1].model)
    assert.ok(result.every(question => question.verification))
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})

test('English generation rejects numerical questions even in the JSON fallback', async () => {
  const { requestQuiz } = await import('../server/quizGeneration.js')
  const saved = process.env.GROQ_QUIZ_API_KEY
  const originalFetch = globalThis.fetch
  process.env.GROQ_QUIZ_API_KEY = 'test-only-key'
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 })
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ questionType: 'numerical' }] }) } }] }))
  }
  try {
    await assert.rejects(requestQuiz({ subject: 'English Core', chapter: 'Silk Road', topic: 'Travel', count: 10 }), { code: 'AI_PROVIDER_RESPONSE_INVALID' })
    assert.equal(calls, 3)
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})
