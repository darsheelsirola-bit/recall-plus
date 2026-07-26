// Single source of truth for quiz-shape validation.
// Pure functions only (no Node or browser APIs) so both the Express
// backend and the Vite frontend can import this module directly.

export const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']
export const MIN_QUESTIONS = 5
export const MAX_QUESTIONS = 30

const DIFFICULTY_SET = new Set(VALID_DIFFICULTIES)

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
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
  return questions.every(isValidQuestion)
}
