import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatCompletion } from '../server/ai/client.js'
import { modelCandidates } from '../server/ai/config.js'
import { quizSchema, verificationSchema } from '../server/ai/quizSchema.js'

test('Groq routes each task and its verification to the dedicated key without NVIDIA fallback', async () => {
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
    await assert.rejects(createChatCompletion({ feature: 'recall', messages: [] }), { code: 'AI_PROVIDER_UNAVAILABLE' })
    assert.equal(calls.length, 5)
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
      await assert.rejects(requestQuiz({ subject: 'English', chapter: 'Two chapters', topic: 'Themes', count: 10, level: 'medium' }))
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
    const content = bodies.length === 2 ? { questions } : { verifications: questions.map(({ id, answer }) => ({ id, answer })) }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
  }
  try {
    const result = await requestQuiz({ subject: 'English', chapter: 'Two chapters', topic: 'Themes', count: 10, level: 'medium' })
    assert.equal(result.length, 10)
    assert.equal(bodies.length, 4)
    assert.ok(bodies[2].messages[1].content.includes('Selected chapters: Two chapters'))
    assert.ok(!bodies[2].messages[1].content.includes('The passage describes friendship.'))
    assert.ok(bodies.slice(1).every(body => body.response_format.type === 'json_object'))
    assert.ok(result.every(question => question.verification))
  } finally {
    globalThis.fetch = originalFetch
    if (saved === undefined) delete process.env.GROQ_QUIZ_API_KEY
    else process.env.GROQ_QUIZ_API_KEY = saved
  }
})
