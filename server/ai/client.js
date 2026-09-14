import { AppError, ERROR_CODES } from '../errors.js'
import { fetchProvider, providerHttpError, readProviderJson } from '../upstreamFetch.js'
import { AI_FEATURES, featureConfig, getFeatureApiKey, modelCandidates } from './config.js'
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

export function requireAiKey(feature) {
  const key = getFeatureApiKey(feature)
  if (!key) throw unavailable(feature)
  return key
}

export async function createChatCompletion({ feature, credentialFeature = feature, model, messages, temperature, maxTokens, deadlineAt, schema }) {
  const key = requireAiKey(credentialFeature)
  const config = featureConfig(feature)
  const providerModel = model || modelCandidates(feature)[0]
  const started = Date.now()
  const response = await fetchProvider('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: providerModel,
      temperature: temperature ?? config.temperature,
      max_completion_tokens: maxTokens ?? config.maxTokens,
      response_format: schema
        ? { type: 'json_schema', json_schema: { name: 'recall_response', strict: true, schema } }
        : { type: 'json_object' },
      messages,
    }),
  }, { deadlineAt })

  if (!response.ok) {
    let generationFailure = false
    if (response.status === 400) {
      try {
        const body = await readProviderJson(response)
        generationFailure = ['json_validate_failed', 'failed_generation'].includes(body?.error?.code)
      } catch { /* Preserve the bounded, public-safe upstream error. */ }
    }
    const error = providerHttpError(response)
    if (generationFailure) {
      error.retryableGenerationFailure = true
      error.providerCategory = 'structured_output_failure'
    }
    logAiCall({ feature, model: providerModel, latencyMs: Date.now() - started, success: false, error })
    throw error
  }

  const payload = await readProviderJson(response)
  logAiCall({
    feature,
    model: providerModel,
    latencyMs: Date.now() - started,
    success: true,
    usage: payload?.usage,
    requestId: typeof payload?.id === 'string' ? payload.id : undefined,
    finishReason: payload?.choices?.[0]?.finish_reason,
  })
  return payload
}

export async function generateStructured(options) {
  return parseStructuredContent(await createChatCompletion(options))
}

export { modelCandidates }
