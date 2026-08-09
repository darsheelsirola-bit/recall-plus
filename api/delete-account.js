import { AppError, ERROR_CODES } from '../server/errors.js'
import { sendError, sendMethodNotAllowed, setPrivateNoStore } from '../server/http.js'
import { hasOnlyKeys, readBoundedJsonBody } from '../server/requestValidation.js'
import { getSupabaseAdminClient, verifySupabaseUser } from '../server/supabase.js'

export default async function handleAccountDeletion(request, response) {
  if (request.method !== 'POST') return sendMethodNotAllowed(response, ['POST'])
  setPrivateNoStore(response)

  try {
    const body = readBoundedJsonBody(request)
    if (!hasOnlyKeys(body, ['confirmation'])) {
      throw new AppError('Invalid account-deletion request.', {
        code: ERROR_CODES.INVALID_REQUEST,
        statusCode: 400,
      })
    }
    if (String(body.confirmation || '').trim() !== 'DELETE MY ACCOUNT') {
      throw new AppError('Type DELETE MY ACCOUNT to confirm permanent deletion.', {
        code: ERROR_CODES.ACCOUNT_DELETE_CONFIRMATION_REQUIRED,
        statusCode: 400,
      })
    }

    const user = await verifySupabaseUser(request)
    const admin = getSupabaseAdminClient()
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      throw new AppError('Your account could not be deleted right now. Please try again or email support.', {
        code: ERROR_CODES.ACCOUNT_DELETE_FAILED,
        statusCode: 503,
        cause: error,
        details: { retryable: true },
      })
    }

    return response.status(200).json({
      deleted: true,
      message: 'Your Recall+ account and associated cloud data have been deleted.',
    })
  } catch (error) {
    return sendError(response, error)
  }
}
