import { isPlaceholderValue, normalizeEnvironmentValue } from '../../scripts/secret-patterns.mjs'

export const GROQ_PROVIDER = 'groq'

export const AI_FEATURES = Object.freeze({
  QUIZ: 'quiz',
  VERIFIER: 'verifier',
  TIMETABLE: 'timetable',
  INSIGHT: 'insight',
  RECALL: 'recall',
})

export const AI_CONFIG = Object.freeze({
  quiz: { temperature: 0.2, maxTokens: 6_144 },
  verifier: { temperature: 0, maxTokens: 8_192 },
  timetable: { temperature: 0.2, maxTokens: 5_000 },
  insight: { temperature: 0.2, maxTokens: 5_000 },
  recall: { temperature: 0.2, maxTokens: 6_144 },
})

const GROQ_KEYS = Object.freeze({
  quiz: 'GROQ_QUIZ_API_KEY',
  recall: 'GROQ_RECALL_API_KEY',
  insight: 'GROQ_INSIGHTS_API_KEY',
  timetable: 'GROQ_TIMETABLE_API_KEY',
  verifier: 'GROQ_QUIZ_API_KEY',
})

function credentialEnv(name) {
  const value = normalizeEnvironmentValue(process.env[name] || '')
  return isPlaceholderValue(value) ? '' : value
}

export function featureConfig(feature) {
  return AI_CONFIG[feature] || AI_CONFIG.quiz
}

export function getFeatureApiKey(feature) {
  return credentialEnv(GROQ_KEYS[feature] || GROQ_KEYS.quiz)
}

export function getFeatureProvider(feature) {
  return getFeatureApiKey(feature) ? GROQ_PROVIDER : null
}

export function isAiConfigured(feature) {
  if (feature) return Boolean(getFeatureApiKey(feature))
  return [AI_FEATURES.QUIZ, AI_FEATURES.RECALL, AI_FEATURES.INSIGHT, AI_FEATURES.TIMETABLE]
    .every((name) => isAiConfigured(name))
}

export function modelCandidates() {
  const configured = normalizeEnvironmentValue(process.env.GROQ_MODEL || '')
  return [...new Set([configured || 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'])]
}
