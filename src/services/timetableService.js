import {
  authenticatedFetch,
  clearGenerationRequestId,
  getGenerationRequestId,
  readApiError,
  runGenerationSingleFlight,
} from './apiClient'
import { publishGenerationUsage } from '../contexts/GenerationUsageContext'

export async function generateOptimalTimetable(profile) {
  return runGenerationSingleFlight('timetable', async () => {
    const payloadKey = JSON.stringify({ profile })
    const requestId = getGenerationRequestId('timetable', payloadKey)
    const response = await authenticatedFetch('/api/generate-timetable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': requestId,
      },
      body: payloadKey,
    })
    if (!response.ok) {
      const apiError = await readApiError(response, 'Could not generate an optimal timetable right now.')
      publishGenerationUsage('timetable', apiError)
      if (apiError.code !== 'RATE_LIMIT_UNAVAILABLE') clearGenerationRequestId('timetable', requestId)
      throw apiError
    }

    const data = await response.json().catch(() => ({}))
    publishGenerationUsage('timetable', data)
    clearGenerationRequestId('timetable', requestId)
    return data
  })
}
