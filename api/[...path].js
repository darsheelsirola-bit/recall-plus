import { sendApiNotFound } from '../server/http.js'

export default function handleUnknownApiRoute(_request, response) {
  return sendApiNotFound(response)
}
