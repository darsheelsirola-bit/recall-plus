import { MAX_QUESTIONS, MIN_QUESTIONS, validateQuizQuestions } from '../shared/quizValidation.js'
import { fetchGroq } from './upstreamFetch.js'

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
const MAX_ATTEMPTS = 3

function clampCount(value) {
  const count = Number.parseInt(value, 10)
  if (!Number.isFinite(count)) return MIN_QUESTIONS
  return Math.min(Math.max(count, MIN_QUESTIONS), MAX_QUESTIONS)
}

function difficultyRule(count, level) {
  if (['easy', 'medium', 'hard'].includes(level)) return `All ${count} questions must have difficulty "${level}".`
  if (count === 5) return 'Use exactly 1 easy, 2 medium, and 2 hard questions.'
  if (count === 10) return 'Use exactly 2 easy questions, then exactly 4 medium questions, then exactly 4 hard questions. Set q1-q2 difficulty to "easy", q3-q6 to "medium", and q7-q10 to "hard".'
  return `Use a balanced mix of easy, medium, and hard questions across the ${count} questions.`
}

function hasExpectedDifficultyMix(questions, count, level) {
  if (!validateQuizQuestions(questions, count)) return false
  if (['easy', 'medium', 'hard'].includes(level)) return questions.every((question) => question.difficulty === level)
  if (level !== 'mixed') return true
  if (count === 5) {
    const counts = questions.reduce((out, question) => ({ ...out, [question.difficulty]: (out[question.difficulty] || 0) + 1 }), {})
    return counts.easy === 1 && counts.medium === 2 && counts.hard === 2
  }
  if (count === 10) {
    const counts = questions.reduce((out, question) => ({ ...out, [question.difficulty]: (out[question.difficulty] || 0) + 1 }), {})
    return counts.easy === 2 && counts.medium === 4 && counts.hard === 4
  }
  return true
}

export function buildQuizPrompt({ subject, chapter, topic, count, level }) {
  return `Generate exactly ${count} NCERT Class 11 quiz questions for:
Subject: ${subject}
Chapter or chapters: ${chapter}
Topic or topics: ${topic}

Rules:
- Return only a valid JSON object with a single key "questions" containing exactly ${count} questions
- ${difficultyRule(count, level)}
- Each question must have: id, difficulty, question, options, answer, explanation
- difficulty must be one of "easy", "medium", or "hard"
- options must contain exactly 4 unique strings
- answer must exactly match one option
- Cover the selected chapters and topics fairly
- No markdown or text outside the JSON
- Keep explanations concise and educational

JSON format:
{"questions":[{"id":"q1","difficulty":"${level === 'mixed' ? 'easy' : level}","question":"Question text","options":["A","B","C","D"],"answer":"Correct option text","explanation":"Short explanation"}]}`
}

function modelCandidates() {
  const envModel = String(process.env.GROQ_MODEL || '').trim()
  const ordered = envModel ? [envModel, ...DEFAULT_GROQ_MODELS] : DEFAULT_GROQ_MODELS
  return [...new Set(ordered)]
}

function parseGroqContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) return null

  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function generateOnce({ key, model, subject, chapter, topic, count, level }) {
  const response = await fetchGroq(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You generate accurate Class 11 Physics, Chemistry, Mathematics, and AI quizzes. Reply with valid JSON only.',
        },
        {
          role: 'user',
          content: buildQuizPrompt({ subject, chapter, topic, count, level }),
        },
      ],
    }),
  })

  if (!response.ok) {
    const details = await response.json().catch(() => ({}))
    const error = new Error(details?.error?.message || 'Groq could not generate the quiz. Please try again.')
    error.statusCode = response.status
    throw error
  }

  const payload = await response.json()
  const parsed = parseGroqContent(payload)
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions
  return hasExpectedDifficultyMix(questions, count, level) ? questions : null
}

export async function requestQuiz({ subject, chapter, topic, count, level = 'mixed' }) {
  const key = process.env.GROQ_QUIZ_API_KEY
  if (!key) {
    const error = new Error('Quiz generation is not configured. Add GROQ_QUIZ_API_KEY to your .env file.')
    error.statusCode = 503
    throw error
  }

  const safeCount = clampCount(count)
  const safeLevel = ['mixed', 'easy', 'medium', 'hard'].includes(level) ? level : 'mixed'
  const models = modelCandidates()
  let lastError

  for (const model of models) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const questions = await generateOnce({ key, model, subject, chapter, topic, count: safeCount, level: safeLevel })
        if (questions) return questions
      } catch (error) {
        const message = String(error?.message || '')
        const modelNotFound = error.statusCode === 404 || /model.*not found|does not exist|decommissioned/i.test(message)
        if (modelNotFound) {
          lastError = error
          break
        }
        if (error.statusCode && error.statusCode !== 429 && error.statusCode < 500) throw error
        lastError = error
      }
    }
  }

  const error = lastError || new Error('The generated quiz did not pass validation. Please regenerate it.')
  if (!error.statusCode) error.statusCode = 502
  throw error
}

export function validateRequest(body) {
  const textOk = ['subject', 'chapter', 'topic'].every(
    (field) => typeof body?.[field] === 'string' && body[field].trim().length > 0 && body[field].length <= 1200,
  )
  const count = Number(body?.count)
  const countOk = Number.isInteger(count) && count >= MIN_QUESTIONS && count <= MAX_QUESTIONS
  const levelOk = ['mixed', 'easy', 'medium', 'hard'].includes(body?.level ?? 'mixed')
  return textOk && countOk && levelOk
}
