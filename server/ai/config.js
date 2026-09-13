export const NVIDIA_PROVIDER = 'nvidia'
export const GROQ_PROVIDER = 'groq'
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const NVIDIA_CHAT_COMPLETIONS_URL = `${NVIDIA_BASE_URL}/chat/completions`

// NVIDIA's hosted free endpoint supports this OpenAI-compatible chat model.
// https://build.nvidia.com/openai/gpt-oss-20b
export const DEFAULT_NVIDIA_MODEL = 'openai/gpt-oss-20b'

export const AI_FEATURES = Object.freeze({
  QUIZ: 'quiz',
  VERIFIER: 'verifier',
  TIMETABLE: 'timetable',
  INSIGHT: 'insight',
  RECALL: 'recall',
})

export const AI_CONFIG = Object.freeze({
  quiz: {
    temperature: 0.2,
    maxTokens: 6_144,
    reasoningEffort: 'medium',
    reasoningBudget: 3_072,
  },
  verifier: {
    temperature: 0,
    maxTokens: 8_192,
    reasoningEffort: 'high',
    reasoningBudget: 4_096,
  },
  timetable: {
    temperature: 0.2,
    maxTokens: 5_000,
    reasoningEffort: 'medium',
    reasoningBudget: 2_500,
  },
  insight: {
    temperature: 0.2,
    maxTokens: 5_000,
    reasoningEffort: 'medium',
    reasoningBudget: 2_500,
  },
  recall: {
    temperature: 0.2,
    maxTokens: 6_144,
    reasoningEffort: 'medium',
    reasoningBudget: 3_072,
  },
})

function trimmedEnv(name) {
  return normalizeEnvironmentValue(process.env[name] || '')
}

// Match Vercel validation: a copied example value is not a usable credential
// and must never change an otherwise usable feature's provider selection.
function credentialEnv(name) {
  const value = trimmedEnv(name)
  return isPlaceholderValue(value) ? '' : value
}

export function getNvidiaApiKey() {
  return credentialEnv('NVIDIA_API_KEY')
}

export function isNvidiaConfigured() {
  return Boolean(getNvidiaApiKey())
}

function featureModelEnv(feature) {
  switch (feature) {
    case AI_FEATURES.QUIZ:
      return trimmedEnv('NVIDIA_MODEL_QUIZ')
    case AI_FEATURES.TIMETABLE:
      return trimmedEnv('NVIDIA_MODEL_TIMETABLE')
    case AI_FEATURES.INSIGHT:
      return trimmedEnv('NVIDIA_MODEL_INSIGHT')
    case AI_FEATURES.RECALL:
      return trimmedEnv('NVIDIA_MODEL_RECALL')
    case AI_FEATURES.VERIFIER:
      return trimmedEnv('NVIDIA_MODEL_VERIFIER')
    default:
      return ''
  }
}

export function modelForProvider(feature, provider, requestedModel = '') {
  if (provider === GROQ_PROVIDER) {
    return requestedModel || trimmedEnv('GROQ_MODEL') || 'openai/gpt-oss-120b'
  }
  return featureModelEnv(feature) || trimmedEnv('NVIDIA_MODEL') || DEFAULT_NVIDIA_MODEL
}

export function modelCandidates(feature, credentialFeature = feature) {
  if (getFeatureProvider(credentialFeature) === GROQ_PROVIDER) {
    return [...new Set([trimmedEnv('GROQ_MODEL') || 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'])]
  }
  const override = featureModelEnv(feature)
  const configured = trimmedEnv('NVIDIA_MODEL')
  return [override || configured || DEFAULT_NVIDIA_MODEL]
}

export function featureConfig(feature) {
  return AI_CONFIG[feature] || AI_CONFIG.quiz
}

const GROQ_KEYS = { quiz: 'GROQ_QUIZ_API_KEY', recall: 'GROQ_RECALL_API_KEY', insight: 'GROQ_INSIGHTS_API_KEY', timetable: 'GROQ_TIMETABLE_API_KEY', verifier: 'GROQ_QUIZ_API_KEY' }
export function getFeatureProvider(feature) {
  if (credentialEnv(GROQ_KEYS[feature] || GROQ_KEYS.quiz)) return GROQ_PROVIDER
  if (isNvidiaConfigured()) return NVIDIA_PROVIDER
  return null
}

export function featureProviderCandidates(feature) {
  const providers = []
  if (credentialEnv(GROQ_KEYS[feature] || GROQ_KEYS.quiz)) providers.push(GROQ_PROVIDER)
  if (isNvidiaConfigured()) providers.push(NVIDIA_PROVIDER)
  return providers
}

export function fallbackProviderForFeature(feature) {
  const providers = featureProviderCandidates(feature)
  return providers[0] === GROQ_PROVIDER && providers.includes(NVIDIA_PROVIDER)
    ? NVIDIA_PROVIDER
    : null
}

// Kept for callers that need a provider predicate. Never use this without a
// feature: a credential for one feature must not route another feature.
export function usesGroq(feature = AI_FEATURES.QUIZ) {
  return getFeatureProvider(feature) === GROQ_PROVIDER
}

export function getProviderApiKey(feature, provider) {
  if (provider === GROQ_PROVIDER) return credentialEnv(GROQ_KEYS[feature] || GROQ_KEYS.quiz)
  if (provider === NVIDIA_PROVIDER) return getNvidiaApiKey()
  return ''
}
export function getFeatureApiKey(feature) {
  return getProviderApiKey(feature, getFeatureProvider(feature))
}
export function isAiConfigured(feature) {
  if (feature) return Boolean(getFeatureApiKey(feature))
  return ['quiz', 'recall', 'insight', 'timetable'].every((name) => isAiConfigured(name))
}
import { isPlaceholderValue, normalizeEnvironmentValue } from '../../scripts/secret-patterns.mjs'
