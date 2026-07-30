export {
  QUIZ_VERIFICATION_VERSION,
  validateQuizQuestions,
  validateVerifiedQuizQuestions,
} from '../../shared/quizValidation.js'

// crypto.randomUUID is only available in secure contexts (HTTPS / localhost).
// Fall back to a sufficiently unique id when served over plain HTTP.
export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function calculateScore(questions, answers) {
  const correct = questions.reduce((total, question) => total + (answers[question.id] === question.answer ? 1 : 0), 0)
  const totalQuestions = questions.length
  const percentage = totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0
  return { score: correct, totalQuestions, percentage }
}

export function getTopicStatus(score) {
  if (score >= 80) return 'Strong'
  if (score >= 50) return 'Average'
  return 'Weak'
}

export function createQuestionStorageKey(subject, chapter, topic, variant = '') {
  return `questions_${subject}_${chapter}_${topic}${variant ? `_${variant}` : ''}`
}

// Long-format practice Quiz: student picks a duration; questions scale at ~3 min each.
export const QUIZ_DURATIONS = [30, 45, 60, 75, 90]

export function durationToQuestionCount(minutes) {
  return Math.round(minutes / 3)
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// Short diagnostic that drives the spaced-repetition schedule.
export const SMALL_QUIZ_COUNT = 5
