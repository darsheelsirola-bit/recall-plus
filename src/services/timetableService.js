import {
  assertCurrentIdentity,
  authenticatedFetch,
  clearGenerationRequestId,
  getGenerationRequestId,
  readApiError,
  runGenerationSingleFlight,
} from './apiClient'
import { publishGenerationUsage } from '../contexts/GenerationUsageContext'

export async function generateOptimalTimetable(profile) {
  const payloadKey = JSON.stringify({ profile })
  return runGenerationSingleFlight('timetable', payloadKey, async (identity) => {
    const requestId = getGenerationRequestId('timetable', payloadKey, identity.userId)
    const response = await authenticatedFetch('/api/generate-timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': requestId,
      },
      body: payloadKey,
    }, identity)
    if (!response.ok) {
      const apiError = await readApiError(response, 'Could not generate an optimal timetable right now.')
      if (apiError.code !== 'RATE_LIMIT_UNAVAILABLE') {
        clearGenerationRequestId('timetable', payloadKey, identity.userId, requestId)
      }
      await assertCurrentIdentity(identity)
      publishGenerationUsage('timetable', apiError)
      throw apiError
    }

    const data = await response.json().catch(() => ({}))
    clearGenerationRequestId('timetable', payloadKey, identity.userId, requestId)
    await assertCurrentIdentity(identity)
    publishGenerationUsage('timetable', data)
    return data
  })
}
