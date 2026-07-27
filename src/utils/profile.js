export const INDIA_TIMEZONE = 'Asia/Kolkata'
export const INDIA_TIMEZONE_NAME = 'India Standard Time'
export const INDIA_TIMEZONE_DETAIL = 'Asia/Kolkata (UTC+05:30)'
export const PROFILE_NAME_MIN_LENGTH = 2
export const PROFILE_NAME_MAX_LENGTH = 50

export function normalizeProfileName(value) {
  return String(value ?? '').trim()
}

export function validateProfileName(value) {
  const name = normalizeProfileName(value)
  if (!name) return 'Enter your name.'
  if (name.length < PROFILE_NAME_MIN_LENGTH) {
    return `Name must be at least ${PROFILE_NAME_MIN_LENGTH} characters.`
  }
  if (name.length > PROFILE_NAME_MAX_LENGTH) {
    return `Name must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer.`
  }
  return ''
}
