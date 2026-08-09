import { normalizeInsightsRequest, requestInsights } from '../server/insights.js'
import { AppError, ERROR_CODES } from '../server/errors.js'
import {
  GENERATION_FEATURES,
  createGenerationRequestHash,
  getIdempotencyKey,
  runLimitedInsightGeneration,
} from '../server/generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { authorizeInsightsRequest } from '../server/curriculumAuthorization.js'
import { readBoundedJsonBody } from '../server/requestValidation.js'
import { verifySupabaseUser } from '../server/supabase.js'

export default async function handleInsightGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await verifySupabaseUser(request)
    const input = normalizeInsightsRequest(body)
    if (!input) {
      throw new AppError('Please provide valid chapter context for insights.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    const authorizedInput = await authorizeInsightsRequest(user, input)
    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(
      GENERATION_FEATURES.INSIGHTS,
      authorizedInput,
    )
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await runLimitedInsightGeneration({
      userId: user.id,
      requestId,
      requestHash,
      generate: () => requestInsights(authorizedInput.chapterContexts),
    })
    response.setHeader('X-Idempotent-Replay', limited.replay ? 'true' : 'false')
    return response.status(200).json(limited.result)
  } catch (error) {
    return sendError(response, error)
  }
}
