import { validateProfileName } from './profile.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAuthForm({
  mode,
  name = '',
  email = '',
  password = '',
  confirmPassword = '',
}) {
  if (mode === 'signup') {
    const nameError = validateProfileName(name)
    if (nameError) return nameError
  }

  if (mode !== 'recovery') {
    const normalizedEmail = String(email).trim()
    if (!EMAIL_PATTERN.test(normalizedEmail)) return 'Enter a valid email address.'
  }

  if (mode === 'forgot') return ''

  if (!password) return 'Enter your password.'
  if (
    (mode === 'signup' || mode === 'recovery')
    && (
      password.length < 8
      || !/[a-z]/.test(password)
      || !/[A-Z]/.test(password)
      || !/\d/.test(password)
      || !/[^A-Za-z0-9]/.test(password)
    )
  ) {
    return 'Use 8 or more characters with a lowercase letter, uppercase letter, number, and symbol.'
  }
  if (mode === 'recovery' && password !== confirmPassword) {
    return 'The passwords do not match.'
  }

  return ''
}
