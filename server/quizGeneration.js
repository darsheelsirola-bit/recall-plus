import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  QUIZ_VERIFICATION_VERSION,
  validateQuizQuestions,
} from '../shared/quizValidation.js'
import { AppError, ERROR_CODES } from './errors.js'
import {
  generateStructured,
  modelCandidates,
  requireNvidiaKey,
} from './ai/client.js'
import { AI_FEATURES } from './ai/config.js'
import { deterministicNumericalAnswer } from './ai/numericalVerification.js'
import {
  MAX_PROVIDER_ATTEMPTS,
  PROVIDER_TOTAL_DEADLINE_MS,
  providerResponseInvalid,
  waitBeforeProviderRetry,
} from './upstreamFetch.js'
import {
  hasOnlyKeys,
  normalizedRequiredText,
} from './requestValidation.js'

const QUIZ_VERIFICATION_PASSES = 2

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

export function buildQuizPrompt({ curriculumVersionId, curriculumSubjectId, chapterNodeIds, topicNodeIds, subject, chapter, topic, count, level, purpose = 'practice' }) {
  const grade = curriculumVersionId.includes('-xii-') ? '12' : '11'
  return `Generate exactly ${count} NCERT Class ${grade} quiz questions for:
Subject: ${subject}
Chapter or chapters: ${chapter}
Topic or topics: ${topic}
Curriculum subject ID: ${curriculumSubjectId}
Chapter node IDs: ${chapterNodeIds.join(', ')}
Topic node IDs: ${topicNodeIds.join(', ')}
Purpose: ${purpose === 'recall' ? 'active-recall check after studying or on a scheduled revision' : 'general practice test'}

Rules:
- Return only a valid JSON object with a single key "questions" containing exactly ${count} questions
- ${difficultyRule(count, level)}
- Each question must have: id, difficulty, questionType, question, options, answer, explanation, sourceReference, calculation
- questionType must be "theory" or "numerical"
- sourceReference must cite one supplied chapter or topic node ID
- For theory questions, calculation must be null
- Numerical questions are limited to one controlled two-operand operation: add, subtract, multiply, or divide
- For numerical questions, calculation must contain only: operation, operands (exactly two finite numbers), unit, decimals (0-6)
- difficulty must be one of "easy", "medium", or "hard"
- options must contain exactly 4 unique strings
- answer must exactly match one option
- Cover the selected chapters and topics fairly
- No markdown or text outside the JSON
- Solve every question independently before choosing its answer
- For numerical questions, substitute the given values and check the arithmetic twice
- Keep explanations concise and educational, but include the calculation or reasoning that proves the selected answer
- Do not include a question when you are uncertain which option is correct

JSON format:
{"questions":[{"id":"q1","difficulty":"${level === 'mixed' ? 'easy' : level}","questionType":"theory","question":"Question text","options":["A","B","C","D"],"answer":"Correct option text","explanation":"Short explanation","sourceReference":"topic-node-id","calculation":null}]}`
}

export function buildQuizVerificationPrompt(questions) {
  const grade = questions.some((question) => question.sourceReference.includes('-xii-')) ? '12' : '11'
  const answerBlindQuestions = questions.map(({ id, question, options }) => ({
    id,
    question,
    options,
  }))
  return `Independently solve every NCERT Class ${grade} multiple-choice question below.

Rules:
- The generator's answer key is intentionally hidden from you
- Do not infer answers from option order
- Recalculate every numerical answer from the values in the question
- Check units, signs, angle components, and arithmetic
- For conceptual questions, apply the standard NCERT definition or principle
- Return only a valid JSON object with one "verifications" array
- Return exactly one entry per question, in the same order
- Each entry must contain only "id" and "answer"
- "answer" must exactly copy one of that question's option strings
- If a question is ambiguous, flawed, or has no defensible option, use an empty answer

Questions:
${JSON.stringify(answerBlindQuestions)}

JSON format:
{"verifications":[{"id":"q1","answer":"Exact option text"}]}`
}

function normalizeQuizVerification(parsed, questions) {
  const verifications = Array.isArray(parsed) ? parsed : parsed?.verifications
  if (!Array.isArray(verifications) || verifications.length !== questions.length) return null

  const questionsById = new Map(questions.map((question) => [question.id, question]))
  const verifiedAnswers = new Map()
  for (const item of verifications) {
    if (!hasOnlyKeys(item, ['id', 'answer'])) return null
    const id = normalizedRequiredText(item.id, 80)
    const answer = normalizedRequiredText(item.answer, 500)
    const question = id ? questionsById.get(id) : null
    if (!question || !answer || !question.options.includes(answer) || verifiedAnswers.has(id)) {
      return null
    }
    verifiedAnswers.set(id, answer)
  }
  return verifiedAnswers.size === questions.length ? verifiedAnswers : null
}

function verificationMatchesAnswerKey(questions, verifiedAnswers) {
  return Boolean(verifiedAnswers)
    && questions.every((question) => verifiedAnswers.get(question.id) === question.answer)
}

function quizVerificationFailed(cause) {
  const error = new AppError('The generated quiz could not be verified for answer accuracy. Please regenerate it.', {
    code: ERROR_CODES.AI_PROVIDER_RESPONSE_INVALID,
    statusCode: 502,
    cause,
    details: { retryable: true },
  })
  error.quizVerificationFailed = true
  return error
}

function stampVerifiedQuestions(questions) {
  return questions.map((question) => ({
    ...question,
    verification: QUIZ_VERIFICATION_VERSION,
  }))
}

function normalizeQuizQuestions(questions, count, level, allowedSourceRefs) {
  if (!Array.isArray(questions) || questions.length !== count) return null
  const normalized = questions.map((question) => {
    if (!hasOnlyKeys(question, [
      'id',
      'difficulty',
      'questionType',
      'question',
      'options',
      'answer',
      'explanation',
      'sourceReference',
      'calculation',
    ])) return null
    const id = normalizedRequiredText(question.id, 80)
    const prompt = normalizedRequiredText(question.question, 1_200)
    const answer = normalizedRequiredText(question.answer, 500)
    const explanation = normalizedRequiredText(question.explanation, 1_500)
    const sourceReference = normalizedRequiredText(question.sourceReference, 200)
    if (!id || !prompt || !answer || !explanation || !sourceReference) return null
    if (!allowedSourceRefs.has(sourceReference)) return null
    if (!['theory', 'numerical'].includes(question.questionType)) return null
    if (question.questionType === 'theory' && question.calculation !== null) return null
    if (!Array.isArray(question.options) || question.options.length !== 4) return null
    const options = question.options.map((option) => normalizedRequiredText(option, 500))
    if (options.some((option) => !option)) return null
    const normalizedQuestion = {
      id,
      difficulty: question.difficulty,
      questionType: question.questionType,
      question: prompt,
      options,
      answer,
      explanation,
      sourceReference,
      calculation: question.calculation,
    }
    const deterministicAnswer = deterministicNumericalAnswer(normalizedQuestion)
    if (normalizedQuestion.questionType === 'numerical' && !deterministicAnswer) return null
    if (deterministicAnswer) normalizedQuestion.answer = deterministicAnswer
    return normalizedQuestion
  })
  if (normalized.some((question) => !question)) return null
  return hasExpectedDifficultyMix(normalized, count, level) ? normalized : null
}

async function generateOnce({
  feature,
  model,
  curriculumVersionId,
  curriculumSubjectId,
  chapterNodeIds,
  topicNodeIds,
  subject,
  chapter,
  topic,
  count,
  level,
  purpose,
  deadlineAt,
}) {
  const parsed = await generateStructured({
    feature,
    model,
    temperature: 0.2,
    deadlineAt,
    messages: [
      {
        role: 'system',
        content: 'You generate accurate CBSE quizzes from the supplied official curriculum selection. Reply with valid JSON only.',
      },
      {
        role: 'user',
        content: buildQuizPrompt({ curriculumVersionId, curriculumSubjectId, chapterNodeIds, topicNodeIds, subject, chapter, topic, count, level, purpose }),
      },
    ],
  })
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions
  return normalizeQuizQuestions(
    questions,
    count,
    level,
    new Set([...chapterNodeIds, ...topicNodeIds]),
  )
}

async function verifyOnce({
  model,
  questions,
  deadlineAt,
}) {
  const parsed = await generateStructured({
    feature: AI_FEATURES.VERIFIER,
    model,
    temperature: 0,
    deadlineAt,
    messages: [
      {
        role: 'system',
        content: 'You are an independent NCERT answer-key auditor. Solve each question without seeing or guessing the generator answer. Reply with valid JSON only.',
      },
      {
        role: 'user',
        content: buildQuizVerificationPrompt(questions),
      },
    ],
  })
  return normalizeQuizVerification(parsed, questions)
}

export async function requestQuiz({ curriculumVersionId = 'cbse-2026-27-xi-v1', curriculumSubjectId = 'test-subject', chapterNodeIds = ['test-chapter'], topicNodeIds = ['test-topic'], subject, chapter, topic, count, level = 'mixed', purpose = 'practice' }) {
  const feature = purpose === 'recall' ? AI_FEATURES.RECALL : AI_FEATURES.QUIZ
  requireNvidiaKey(feature)

  const safeCount = clampCount(count)
  const safeLevel = ['mixed', 'easy', 'medium', 'hard'].includes(level) ? level : 'mixed'
  const models = modelCandidates(feature)
  const verifierModels = modelCandidates(AI_FEATURES.VERIFIER)
  const deadlineAt = Date.now() + PROVIDER_TOTAL_DEADLINE_MS
  let lastError

  for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS && Date.now() < deadlineAt; attempt += 1) {
    const model = models[attempt % models.length]
    try {
      const questions = await generateOnce({
        feature,
        model,
        curriculumVersionId,
        curriculumSubjectId,
        chapterNodeIds,
        topicNodeIds,
        subject,
        chapter,
        topic,
        count: safeCount,
        level: safeLevel,
        purpose,
        deadlineAt,
      })
      if (questions) {
        for (let pass = 0; pass < QUIZ_VERIFICATION_PASSES; pass += 1) {
          const verifierModel = verifierModels[(attempt + pass) % verifierModels.length]
          const verifiedAnswers = await verifyOnce({
            model: verifierModel,
            questions,
            deadlineAt,
          })
          if (!verificationMatchesAnswerKey(questions, verifiedAnswers)) {
            throw quizVerificationFailed()
          }
        }
        return stampVerifiedQuestions(questions)
      }
      lastError = providerResponseInvalid()
    } catch (error) {
      lastError = error
      if ([400, 401, 403, 404, 422].includes(error?.upstreamStatus)) throw error
      if (error?.quizVerificationFailed) throw error
    }
    if (attempt + 1 < MAX_PROVIDER_ATTEMPTS && lastError?.upstreamStatus !== 404) {
      await waitBeforeProviderRetry(lastError, attempt + 1, deadlineAt)
    }
  }

  throw lastError || providerResponseInvalid()
}

function normalizeNodeIds(value, maxItems) {
  if (!Array.isArray(value) || !value.length || value.length > maxItems) return null
  const ids = value.map((id) => normalizedRequiredText(id, 160))
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null
  return ids
}

export function normalizeQuizRequest(body) {
  if (!hasOnlyKeys(body, ['curriculumSubjectId', 'chapterNodeIds', 'topicNodeIds', 'count', 'level', 'purpose', 'requestId'])) return null
  const curriculumSubjectId = normalizedRequiredText(body.curriculumSubjectId, 160)
  const chapterNodeIds = normalizeNodeIds(body.chapterNodeIds, 10)
  const topicNodeIds = normalizeNodeIds(body.topicNodeIds, 40)
  const count = body.count
  const level = body.level ?? 'mixed'
  const purpose = body.purpose ?? 'practice'
  if (!curriculumSubjectId || !chapterNodeIds || !topicNodeIds) return null
  if (!Number.isInteger(count) || count < MIN_QUESTIONS || count > MAX_QUESTIONS) return null
  if (!['mixed', 'easy', 'medium', 'hard'].includes(level)) return null
  if (!['practice', 'recall'].includes(purpose)) return null
  return { curriculumSubjectId, chapterNodeIds, topicNodeIds, count, level, purpose }
}

export function validateRequest(body) {
  return normalizeQuizRequest(body) !== null
}
