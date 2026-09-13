import { AppError, ERROR_CODES } from '../errors.js'
import {
  fetchProvider,
  providerHttpError,
  readProviderJson,
} from '../upstreamFetch.js'
import {
  AI_FEATURES,
  GROQ_PROVIDER,
  NVIDIA_CHAT_COMPLETIONS_URL,
  featureProviderCandidates,
  featureConfig,
  getProviderApiKey,
  modelForProvider,
  modelCandidates,
} from './config.js'
import { logAiCall } from './log.js'
import { parseStructuredContent } from './parse.js'

const NVIDIA_MAX_COMPLETION_TOKENS = 4_096
const RESPONSE_PROVIDER = Symbol('responseProvider')

function nvidiaMaxTokens(requested, fallback) {
  const value = Number(requested ?? fallback)
  const bounded = Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.max(1, Math.min(NVIDIA_MAX_COMPLETION_TOKENS, bounded))
}

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

export function requireAiKey(feature) {
  const provider = featureProviderCandidates(feature)[0]
  const key = getProviderApiKey(feature, provider)
  if (!key) throw unavailable(feature)
  return key
}

function canFailOver(error) {
  if (error?.retryableGenerationFailure) return true
  const status = Number(error?.upstreamStatus)
  if (Number.isInteger(status)) return status === 429 || status >= 500
  return error?.code === ERROR_CODES.AI_PROVIDER_UNAVAILABLE
    || error?.code === ERROR_CODES.AI_PROVIDER_RESPONSE_INVALID
}

export async function createChatCompletion({
  feature,
  credentialFeature = feature,
  model,
  messages,
  temperature,
  maxTokens,
  deadlineAt,
  schema,
  provider: requestedProvider,
}) {
  const config = featureConfig(feature)
  const completionTokens = nvidiaMaxTokens(maxTokens, config.maxTokens)
  const configuredProviders = featureProviderCandidates(credentialFeature)
  const providers = requestedProvider
    ? configuredProviders.filter((provider) => provider === requestedProvider)
    : configuredProviders
  if (!providers.length) throw unavailable(credentialFeature)
  let lastError

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const key = getProviderApiKey(credentialFeature, provider)
    const providerModel = modelForProvider(feature, provider, model)
    const started = Date.now()
    try {
      const response = await fetchProvider(provider === GROQ_PROVIDER ? 'https://api.groq.com/openai/v1/chat/completions' : NVIDIA_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: providerModel,
          temperature: temperature ?? config.temperature,
          ...(provider === GROQ_PROVIDER ? { max_completion_tokens: maxTokens ?? config.maxTokens, response_format: schema ? { type: 'json_schema', json_schema: { name: 'recall_response', strict: true, schema } } : { type: 'json_object' } } : { max_tokens: completionTokens, reasoning_effort: config.reasoningEffort }),
          messages,
        }),
      }, { deadlineAt, provider })

      if (!response.ok) {
        let generationFailure = false
        if (response.status === 400) {
          try {
            const body = await readProviderJson(response)
            generationFailure = ['json_validate_failed', 'failed_generation'].includes(body?.error?.code)
          } catch { /* Preserve the bounded, public-safe upstream error. */ }
        }
        const error = providerHttpError(response, provider)
        if (generationFailure) {
          error.retryableGenerationFailure = true
          error.providerCategory = 'structured_output_failure'
          error.details = { ...(error.details || {}), retryable: true }
        }
        throw error
      }

      const payload = await readProviderJson(response)
      if (payload && typeof payload === 'object') {
        Object.defineProperty(payload, RESPONSE_PROVIDER, { value: provider })
      }
      logAiCall({
        feature,
        model: providerModel,
        latencyMs: Date.now() - started,
        success: true,
        provider,
        usage: payload?.usage,
        requestId: typeof payload?.id === 'string' ? payload.id : undefined,
        finishReason: payload?.choices?.[0]?.finish_reason,
      })
      return payload
    } catch (error) {
      lastError = error
      logAiCall({
        feature,
        model: providerModel,
        latencyMs: Date.now() - started,
        success: false,
        error,
        provider,
      })
      if (index + 1 >= providers.length || !canFailOver(error)) throw error
    }
  }

  throw lastError || unavailable(credentialFeature)
}

export async function generateStructured({
  feature,
  credentialFeature = feature,
  model,
  messages,
  temperature,
  maxTokens,
  deadlineAt,
  schema,
  provider,
  includeProvider = false,
}) {
  const payload = await createChatCompletion({
    feature,
    credentialFeature,
    model,
    messages,
    temperature,
    maxTokens,
    deadlineAt,
    schema,
    provider,
  })
  const data = parseStructuredContent(payload)
  return includeProvider ? { data, provider: payload?.[RESPONSE_PROVIDER] } : data
}

export { modelCandidates }
