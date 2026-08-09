import { requestTimetable } from '../server/timetable.js'
import { normalizeTimetableProfile } from '../shared/timetableValidation.js'
import { AppError, ERROR_CODES } from '../server/errors.js'
import {
  GENERATION_FEATURES,
  createGenerationRequestHash,
  getIdempotencyKey,
  runLimitedGeneration,
} from '../server/generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { authorizeTimetableRequest } from '../server/curriculumAuthorization.js'
import { hasOnlyKeys, readBoundedJsonBody } from '../server/requestValidation.js'
import { verifySupabaseUser } from '../server/supabase.js'

export default async function handleTimetableGeneration(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    const user = await verifySupabaseUser(request)
    const profile = hasOnlyKeys(body, ['profile', 'requestId'])
      ? normalizeTimetableProfile(body.profile)
      : null
    if (!profile) {
      throw new AppError('Please submit a complete daily routine first.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    const authorized = await authorizeTimetableRequest(user, profile)
    const requestId = getIdempotencyKey(request, body)
    const requestHash = createGenerationRequestHash(GENERATION_FEATURES.TIMETABLE, authorized)
    response.setHeader('Idempotency-Key', requestId)
    response.setHeader('X-Idempotency-Key', requestId)
    const limited = await runLimitedGeneration({
      userId: user.id,
      feature: GENERATION_FEATURES.TIMETABLE,
      requestId,
      requestHash,
      generate: () => requestTimetable(
        authorized.profile,
        authorized.subjects,
        authorized.curriculumVersionId,
      ),
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
