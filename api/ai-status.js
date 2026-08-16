import { isSupabaseConfigured } from '../server/supabase.js'
import { sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { isNvidiaConfigured } from '../server/ai/config.js'

export default function handleAiStatus(request, response) {
  if (request.method !== 'GET') return sendMethodNotAllowed(response, ['GET'])
  setPrivateNoStore(response)
  return response.status(200).json({
    configured: Boolean(isNvidiaConfigured() && isSupabaseConfigured()),
    provider: 'NVIDIA',
  })
}
