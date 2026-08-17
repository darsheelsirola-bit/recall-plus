import { friendlyPasswordAuthError } from './passwordErrors.ts'

export interface PasswordSignUpOutcome {
  error: string
  needsEmailConfirmation?: boolean
}

export function isExistingAccountAuthMessage(message: string): boolean {
  return /account already exists/i.test(message)
}

export function isExistingAccountSignUpError(error: unknown): boolean {
  return isExistingAccountAuthMessage(friendlyPasswordAuthError(error, 'signup'))
}

export function shouldAttemptPasswordSignInAfterSignUp(input: {
  session: unknown
  error: unknown
}): boolean {
  if (input.session) return false
  if (!input.error) return true
  return isExistingAccountSignUpError(input.error)
}

export function passwordSignInAfterSignUpResult(input: {
  session: unknown
  error: unknown
}): PasswordSignUpOutcome {
  if (input.session && !input.error) return { error: '' }

  const signInError = friendlyPasswordAuthError(input.error, 'signin')
  if (!signInError || /confirm your email/i.test(signInError)) {
    return { error: '', needsEmailConfirmation: true }
  }
  if (/email address or password is incorrect/i.test(signInError)) {
    return {
      error: friendlyPasswordAuthError(
        { code: 'user_already_exists', message: 'User already registered' },
        'signup',
      ),
    }
  }
  return { error: signInError }
}
