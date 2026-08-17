import { validateVerifiedQuizQuestions } from '../utils/quizUtils'
import {
  assertCurrentIdentity,
  authenticatedFetch,
  clearGenerationRequestId,
  getGenerationRequestId,
  readApiError,
  runGenerationSingleFlight,
} from './apiClient'
import { publishGenerationUsage } from '../contexts/GenerationUsageContext'

export async function generateQuizQuestions(curriculumSelection, {
  count = 5,
  level = 'mixed',
  purpose = 'practice',
} = {}) {
  const payload = { ...curriculumSelection, count, level, purpose }
  const payloadKey = JSON.stringify(payload)
  return runGenerationSingleFlight('quiz', payloadKey, async (identity) => {
    const requestId = getGenerationRequestId('quiz', payloadKey, identity.userId)
    try {
      const response = await authenticatedFetch('/api/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId,
        },
        body: payloadKey,
      }, identity)
      if (!response.ok) {
        const apiError = await readApiError(response, 'Quiz generation failed. Please try again.')
        if (apiError.code !== 'RATE_LIMIT_UNAVAILABLE') {
          clearGenerationRequestId('quiz', payloadKey, identity.userId, requestId)
        }
        await assertCurrentIdentity(identity)
        publishGenerationUsage('quiz', apiError)
        throw apiError
      }

      const data = await response.json().catch(() => ({}))
      if (!validateVerifiedQuizQuestions(data.questions, count)) {
        throw new Error('The quiz answer key was not independently verified. Please regenerate it.')
      }
      clearGenerationRequestId('quiz', payloadKey, identity.userId, requestId)
      await assertCurrentIdentity(identity)
      publishGenerationUsage('quiz', data)
      return data.questions
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Could not reach the quiz service. Check your connection and try again.', { cause: error })
      throw error
    }
  })
}

export async function checkAiStatus() {
  const response = await fetch('/api/ai-status')
  if (!response.ok) throw new Error('Could not check AI status.')
  return response.json()
}
