function errorCategory(error) {
  if (typeof error?.providerCategory === 'string') return error.providerCategory
  const status = Number(error?.upstreamStatus)
  if (status === 401 || status === 403) return 'groq_authentication_error'
  if (status === 429) return 'groq_rate_limit'
  if (error?.statusCode === 504) return 'groq_timeout'
  if (status === 404 || status === 422) return 'invalid_groq_model'
  if (error?.code === 'AI_PROVIDER_RESPONSE_INVALID') return 'structured_output_failure'
  if (error?.code === 'DAILY_GENERATION_LIMIT') return 'quota_exceeded'
  if (error?.code === 'INVALID_REQUEST') return 'validation_error'
  if (error?.code === 'AI_PROVIDER_UNAVAILABLE') return 'groq_unavailable'
  return 'internal_error'
}

export function logAiCall({ feature, model, latencyMs, success, error, usage, requestId, finishReason }) {
  const entry = { event: 'ai_call', provider: 'groq', feature, model, latencyMs, success: Boolean(success) }
  if (!success) entry.errorCategory = errorCategory(error)
  if (!success && Number.isInteger(error?.upstreamStatus)) entry.upstreamStatus = error.upstreamStatus
  if (['stop', 'length', 'content_filter'].includes(finishReason)) entry.finishReason = finishReason
  if (Number.isFinite(usage?.prompt_tokens)) entry.promptTokens = usage.prompt_tokens
  if (Number.isFinite(usage?.completion_tokens)) entry.completionTokens = usage.completion_tokens
  if (Number.isFinite(usage?.total_tokens)) entry.totalTokens = usage.total_tokens
  if (typeof requestId === 'string' && requestId) entry.requestId = requestId
  console.info(JSON.stringify(entry))
}
