// Single source of truth for quiz-shape validation.
// Pure functions only (no Node or browser APIs) so both the Express
// backend and the Vite frontend can import this module directly.

export const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']
export const MIN_QUESTIONS = 5
export const MAX_QUESTIONS = 30
export const QUIZ_VERIFICATION_VERSION = 'independent-consensus-v1'

const DIFFICULTY_SET = new Set(VALID_DIFFICULTIES)

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidPublicQuestion(item) {
  if (!item || typeof item !== 'object' || !DIFFICULTY_SET.has(item.difficulty)) return false
  if (!Array.isArray(item.options) || item.options.length !== 4) return false
  if (!item.options.every(isNonEmptyString)) return false
  if (new Set(item.options).size !== item.options.length) return false
  if ('answer' in item || 'explanation' in item || 'verification' in item) return false
  return Boolean(item.id) && isNonEmptyString(item.question)
}

export function publicQuizQuestions(questions) {
  if (!Array.isArray(questions)) return []
  return questions.map(({ id, difficulty, question, options }) => ({
    id,
    difficulty,
    question,
    options,
  }))
}

export function validatePublicQuizQuestions(questions, expectedCount) {
  if (!Array.isArray(questions) || questions.length === 0) return false
  if (Number.isInteger(expectedCount) && questions.length !== expectedCount) return false
  if (!questions.every(isValidPublicQuestion)) return false
  return new Set(questions.map((question) => String(question.id))).size === questions.length
}

export function isValidQuestion(item) {
  if (!item || typeof item !== 'object' || !DIFFICULTY_SET.has(item.difficulty)) return false
  if (!Array.isArray(item.options) || item.options.length !== 4) return false
  if (!item.options.every(isNonEmptyString)) return false
  if (new Set(item.options).size !== item.options.length) return false // options must be unique
  if (!item.options.includes(item.answer)) return false
  return Boolean(item.id) && isNonEmptyString(item.question) && isNonEmptyString(item.explanation)
}

// Validates a quiz of any length. Pass expectedCount to require an exact size;
// omit it to accept any non-empty, well-formed set.
export function validateQuizQuestions(questions, expectedCount) {
  if (!Array.isArray(questions) || questions.length === 0) return false
  if (Number.isInteger(expectedCount) && questions.length !== expectedCount) return false
  if (!questions.every(isValidQuestion)) return false
  return new Set(questions.map((question) => String(question.id))).size === questions.length
}

// AI-generated quizzes are safe to score only after the backend has run the
// answer-blind consensus checks identified by the current verification version.
// Locally-authored fallback questions still use validateQuizQuestions directly.
export function validateVerifiedQuizQuestions(questions, expectedCount) {
  return validateQuizQuestions(questions, expectedCount)
    && questions.every(
      (question) => question.verification === QUIZ_VERIFICATION_VERSION,
    )
}
