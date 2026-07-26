import dotenv from 'dotenv'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  handleAiStatus,
  handleGenerationStatus,
  handleInsightGeneration,
  handleQuizGeneration,
  handleTimetableGeneration,
} from './server/apiHandlers.js'

const root = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(root, '.env') })

const app = express()
const port = Number(process.env.PORT) || 8787

app.use(express.json({ limit: '100kb' }))

app.all('/api/ai-status', handleAiStatus)
app.all('/api/generation-usage', handleGenerationStatus)
app.all('/api/generate-quiz', handleQuizGeneration)
app.all('/api/generate-insights', handleInsightGeneration)
app.all('/api/generate-timetable', handleTimetableGeneration)

app.use(express.static(path.join(root, 'dist')))
app.use((_request, response) => {
  response.sendFile(path.join(root, 'dist', 'index.html'))
})

app.listen(port, () => {
  console.log(`Recall Plus API listening on http://localhost:${port}`)
})
