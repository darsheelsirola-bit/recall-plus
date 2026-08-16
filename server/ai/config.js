export const NVIDIA_PROVIDER = 'nvidia'
export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
export const NVIDIA_CHAT_COMPLETIONS_URL = `${NVIDIA_BASE_URL}/chat/completions`

// Official NVIDIA-hosted NIM model IDs. Do not invent names.
// https://docs.api.nvidia.com/nim/reference/meta-llama-3_3-70b-instruct-infer
export const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct'
export const FALLBACK_NVIDIA_MODEL = 'meta/llama-3.1-8b-instruct'

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
    maxTokens: 4_096,
  },
  verifier: {
    temperature: 0,
    maxTokens: 4_096,
  },
  timetable: {
    temperature: 0.2,
    maxTokens: 3_000,
  },
  insight: {
    temperature: 0.3,
    maxTokens: 3_500,
  },
  recall: {
    temperature: 0.2,
    maxTokens: 4_096,
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
  const primary = override || configured || DEFAULT_NVIDIA_MODEL
  const ordered = [primary, configured, FALLBACK_NVIDIA_MODEL, DEFAULT_NVIDIA_MODEL]
  return [...new Set(ordered.filter(Boolean))]
}

export function featureConfig(feature) {
  return AI_CONFIG[feature] || AI_CONFIG.quiz
}
