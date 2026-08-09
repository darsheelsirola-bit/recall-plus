import { isSupabaseConfigured } from '../server/supabase.js'
import { sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'

export default function handleAiStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)
  return response.status(200).json({
    configured: Boolean(
      process.env.GROQ_QUIZ_API_KEY
      && process.env.GROQ_RECALL_API_KEY
      && process.env.GROQ_INSIGHTS_API_KEY
      && process.env.GROQ_TIMETABLE_API_KEY
      && isSupabaseConfigured()
    ),
    provider: 'Groq',
  })
}
