import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  handleAccountDeletion,
  handleAiStatus,
  handleGenerationStatus,
  handleInsightGeneration,
  handleQuizGeneration,
  handleQuizSubmission,
  handleTimetableGeneration,
} from './apiHandlers.js'
import { AppError, ERROR_CODES } from './errors.js'
import { sendApiNotFound, sendError } from './http.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function handleJsonParserError(error, _request, response, next) {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return sendError(response, new AppError('The request body is too large.', {
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      statusCode: 413,
      cause: error,
    }))
  }
  if (error instanceof SyntaxError && error?.status === 400) {
    return sendError(response, new AppError('The request body contains malformed JSON.', {
      code: ERROR_CODES.INVALID_JSON,
      statusCode: 400,
      cause: error,
    }))
  }
  return next(error)
}

export function createApp({ staticRoot = path.join(projectRoot, 'dist') } = {}) {
  const app = express()

  app.use(express.json({ limit: '64kb', strict: true }))
  app.use(handleJsonParserError)

  app.all('/api/ai-status', handleAiStatus)
  app.all('/api/delete-account', handleAccountDeletion)
  app.all('/api/generation-usage', handleGenerationStatus)
  app.all('/api/generate-quiz', handleQuizGeneration)
  app.all('/api/submit-quiz', handleQuizSubmission)
  app.all('/api/generate-insights', handleInsightGeneration)
  app.all('/api/generate-timetable', handleTimetableGeneration)
  app.use('/api', (_request, response) => sendApiNotFound(response))

  app.use(express.static(staticRoot))
  app.use((_request, response) => {
    response.sendFile(path.join(staticRoot, 'index.html'))
  })

  app.use((error, request, response, _next) => {
    if (request.path?.startsWith('/api/')) return sendError(response, error)
    return response.status(500).send('Something went wrong while serving the app.')
  })

  return app
}
