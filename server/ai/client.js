import { AppError, ERROR_CODES } from '../errors.js'
import {
  fetchProvider,
  providerHttpError,
  readProviderJson,
} from '../upstreamFetch.js'
import {
  AI_FEATURES,
  NVIDIA_CHAT_COMPLETIONS_URL,
  featureConfig,
  getNvidiaApiKey,
  modelCandidates,
} from './config.js'
import { logAiCall } from './log.js'
import { parseStructuredContent } from './parse.js'

function unavailable(feature) {
  const messages = {
    [AI_FEATURES.QUIZ]: 'Quiz generation is temporarily unavailable.',
    [AI_FEATURES.RECALL]: 'Recall generation is temporarily unavailable.',
    [AI_FEATURES.INSIGHT]: 'AI insights are temporarily unavailable.',
    [AI_FEATURES.TIMETABLE]: 'Timetable generation is temporarily unavailable.',
    [AI_FEATURES.VERIFIER]: 'Question verification is temporarily unavailable.',
  }
  return new AppError(messages[feature] || 'AI generation is temporarily unavailable.', {
    code: ERROR_CODES.AI_PROVIDER_UNAVAILABLE,
    statusCode: 503,
    details: { retryable: true },
  })
}

export function requireNvidiaKey(feature) {
  const key = getNvidiaApiKey()
  if (!key) throw unavailable(feature)
  return key
}

export async function createChatCompletion({
  feature,
  model,
  messages,
  temperature,
  maxTokens,
  deadlineAt,
  json = true,
}) {
  const key = requireNvidiaKey(feature)
  const config = featureConfig(feature)
  const started = Date.now()
  const response = await fetchProvider(NVIDIA_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: temperature ?? config.temperature,
      max_tokens: maxTokens ?? config.maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages,
    }),
  }, { deadlineAt })

  if (!response.ok) {
    const error = providerHttpError(response)
    logAiCall({
      feature,
      model,
      latencyMs: Date.now() - started,
      success: false,
      error,
    })
    throw error
  }

  const payload = await readProviderJson(response)
  logAiCall({
    feature,
    model,
    latencyMs: Date.now() - started,
    success: true,
    usage: payload?.usage,
    requestId: typeof payload?.id === 'string' ? payload.id : undefined,
  })
  return payload
}

export async function generateStructured({
  feature,
  model,
  messages,
  temperature,
  maxTokens,
  deadlineAt,
}) {
  const payload = await createChatCompletion({
    feature,
    model,
    messages,
    temperature,
    maxTokens,
    deadlineAt,
    json: true,
  })
  return parseStructuredContent(payload)
}

export { modelCandidates }
