import { getGenerationStatus, publicUsage } from '../server/generationLimit.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { verifySupabaseUser } from '../server/supabase.js'

export default async function handleGenerationStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)

  try {
    const user = await verifySupabaseUser(request)
    const state = await getGenerationStatus(user.id)
    return response.status(200).json({
      quiz: publicUsage(state.quiz),
      timetable: publicUsage(state.timetable),
    })
  } catch (error) {
    return sendError(response, error)
  }
}
