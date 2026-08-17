export const NVIDIA_PROVIDER = 'nvidia'
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const NVIDIA_CHAT_COMPLETIONS_URL = `${NVIDIA_BASE_URL}/chat/completions`

// Exact hosted model ID from NVIDIA's GLM-5.2 API reference.
// https://docs.api.nvidia.com/nim/reference/z-ai-glm-5.2
export const DEFAULT_NVIDIA_MODEL = 'z-ai/glm-5.2'

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
  return String(process.env[name] || '').trim()
}

export function getNvidiaApiKey() {
  return trimmedEnv('NVIDIA_API_KEY')
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

export function modelCandidates(feature) {
  const override = featureModelEnv(feature)
  const configured = trimmedEnv('NVIDIA_MODEL')
  return [override || configured || DEFAULT_NVIDIA_MODEL]
}

export function featureConfig(feature) {
  return AI_CONFIG[feature] || AI_CONFIG.quiz
}
