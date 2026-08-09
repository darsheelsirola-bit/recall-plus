import { normalizeQuizRequest, requestQuiz } from '../server/groq.js'
import { AppError, ERROR_CODES } from '../server/errors.js'
import {
  GENERATION_FEATURES,
  createGenerationRequestHash,
  getIdempotencyKey,
  runLimitedGeneration,
} from '../server/generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { authorizeQuizRequest } from '../server/curriculumAuthorization.js'
import { readBoundedJsonBody } from '../server/requestValidation.js'
import { verifySupabaseUser } from '../server/supabase.js'

export default async function handleQuizGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await verifySupabaseUser(request)
    const input = normalizeQuizRequest(body)
    if (!input) {
      throw new AppError('Please choose a valid subject, chapter, and topic.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    const authorizedInput = await authorizeQuizRequest(user, input)
    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.QUIZ, authorizedInput)
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await runLimitedGeneration({
      userId: user.id,
      feature: GENERATION_FEATURES.QUIZ,
      requestId,
      requestHash,
      generate: async () => ({
        questions: await requestQuiz(authorizedInput),
      }),
    })
    return response.status(200).json({
      ...limited.result,
      remaining: limited.usage.remaining,
      limit: limited.usage.limit,
      resetAt: limited.usage.resetAt,
      localDate: limited.usage.localDate,
    })
  } catch (error) {
    return sendError(response, error)
  }
}
