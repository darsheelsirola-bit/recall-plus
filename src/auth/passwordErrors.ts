export type PasswordAuthMode = 'signin' | 'signup' | 'forgot' | 'recovery'

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object') return ''

  const record = error as Record<string, unknown>
  return [
    record.name,
    record.code,
    record.error,
    record.error_code,
    record.message,
    record.msg,
    record.description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

export function friendlyPasswordAuthError(
  error: unknown,
  mode: PasswordAuthMode,
): string {
  const normalized = errorText(error).toLowerCase()
  if (!normalized) return ''

  if (
    normalized.includes('invalid login credentials')
    || normalized.includes('invalid_credentials')
    || normalized.includes('invalid password')
  ) {
    return 'The email address or password is incorrect. Check both and try again.'
  }

  if (
    normalized.includes('email not confirmed')
    || normalized.includes('email_not_confirmed')
  ) {
    return 'Confirm your email address using the link Recall+ sent before signing in.'
  }

  if (
    normalized.includes('user already registered')
    || normalized.includes('already been registered')
    || normalized.includes('email already exists')
    || normalized.includes('user_already_exists')
  ) {
    return 'An account already exists for this email. Sign in instead or reset your password.'
  }

  if (
    normalized.includes('weak_password')
    || normalized.includes('password should be at least')
    || normalized.includes('password is too weak')
  ) {
    return 'Choose a stronger password with 8 or more characters, including lowercase, uppercase, a number, and a symbol.'
  }

  if (
    normalized.includes('email_address_invalid')
    || normalized.includes('invalid email')
  ) {
    return 'Enter a valid email address.'
  }

  if (
    normalized.includes('over_email_send_rate_limit')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
    || normalized.includes('too many attempts')
  ) {
    return 'Too many attempts were made. Wait a few minutes, then try again.'
  }

  if (
    normalized.includes('signup_disabled')
    || normalized.includes('signups not allowed')
    || normalized.includes('signup is disabled')
  ) {
    return 'New account creation is temporarily unavailable. Please try again later.'
  }

  if (
    normalized.includes('network')
    || normalized.includes('failed to fetch')
    || normalized.includes('fetch failed')
    || normalized.includes('connection')
    || normalized.includes('timeout')
  ) {
    return 'Recall+ could not reach the account service. Check your connection and try again.'
  }

  if (normalized.includes('captcha')) {
    return 'The security check could not be completed. Refresh the page and try again.'
  }

  if (
    normalized.includes('database error')
    || normalized.includes('unexpected_failure')
    || normalized.includes('internal server error')
  ) {
    return mode === 'signup'
      ? 'Recall+ could not finish setting up your account. Please try again in a moment.'
      : 'The account service could not complete this request. Please try again in a moment.'
  }

  if (mode === 'signin') {
    return 'Sign-in did not complete. Check your email and password, then try again.'
  }
  if (mode === 'signup') {
    return 'Recall+ could not create this account. Check your details and try again.'
  }
  if (mode === 'forgot') {
    return 'Recall+ could not send the reset email. Check the address and try again.'
  }
  return 'Recall+ could not update your password. Open a fresh reset link and try again.'
}

export function passwordAuthErrorTitle(
  mode: PasswordAuthMode,
  message: string,
): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('email address or password is incorrect')) {
    return 'Email or password is incorrect'
  }
  if (normalized.includes('confirm your email')) return 'Confirm your email first'
  if (normalized.includes('account already exists')) return 'Account already exists'
  if (
    normalized.includes('stronger password')
    || normalized.includes('8 or more characters')
  ) {
    return 'Choose a stronger password'
  }
  if (normalized.includes('valid email address')) return 'Check your email address'
  if (normalized.includes('your name')) return 'Check your name'
  if (normalized.includes('too many attempts')) return 'Try again shortly'
  if (normalized.includes('connection')) return 'Check your connection'
  if (normalized.includes('security check')) return 'Security check failed'
  if (normalized.includes('account creation is temporarily unavailable')) {
    return 'Account creation is unavailable'
  }
  if (normalized.includes('finish setting up your account')) {
    return 'Account setup did not finish'
  }

  if (mode === 'signin') return 'Sign-in failed'
  if (mode === 'signup') return 'Account could not be created'
  if (mode === 'forgot') return 'Reset email could not be sent'
  return 'Password could not be updated'
}
