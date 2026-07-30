import { inspectContentForSecrets, isPlaceholderValue } from './secret-patterns.mjs'

if (process.env.VERCEL !== '1') {
  console.log('Vercel environment validation skipped outside a Vercel build.')
  process.exit(0)
}

const failures = []
const environment = process.env.VERCEL_ENV || 'unknown'

function requireValue(name) {
  const value = String(process.env[name] || '').trim()
  if (!value || isPlaceholderValue(value)) failures.push(`${name} is missing or still a placeholder`)
  return value
}

function requireOneOf(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim()
    if (value && !isPlaceholderValue(value)) return { name, value }
  }
  failures.push(`one of ${names.join(' or ')} is required`)
  return { name: names[0], value: '' }
}

function validateHttpsUrl(name, value) {
  if (!value) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') failures.push(`${name} must use HTTPS on Vercel`)
  } catch {
    failures.push(`${name} must be a valid URL`)
  }
}

const browserSupabaseUrl = requireValue('VITE_SUPABASE_URL')
const browserSupabaseKeyNames = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
]
requireOneOf(browserSupabaseKeyNames)
const serverSupabaseUrl = requireValue('SUPABASE_URL')
const serverAnonKey = requireValue('SUPABASE_ANON_KEY')
const serviceRoleKey = requireValue('SUPABASE_SERVICE_ROLE_KEY')
const quizKey = requireValue('GROQ_QUIZ_API_KEY')
const recallKey = requireValue('GROQ_RECALL_API_KEY')
const insightsKey = requireValue('GROQ_INSIGHTS_API_KEY')
const timetableKey = requireValue('GROQ_TIMETABLE_API_KEY')

validateHttpsUrl('VITE_SUPABASE_URL', browserSupabaseUrl)
validateHttpsUrl('SUPABASE_URL', serverSupabaseUrl)

if (browserSupabaseUrl && serverSupabaseUrl
  && browserSupabaseUrl.replace(/\/+$/, '') !== serverSupabaseUrl.replace(/\/+$/, '')) {
  failures.push('VITE_SUPABASE_URL and SUPABASE_URL must address the same project')
}
const serverSecrets = [
  ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
  ['GROQ_QUIZ_API_KEY', quizKey],
  ['GROQ_RECALL_API_KEY', recallKey],
  ['GROQ_INSIGHTS_API_KEY', insightsKey],
  ['GROQ_TIMETABLE_API_KEY', timetableKey],
]
for (const publicName of browserSupabaseKeyNames) {
  const publicValue = String(process.env[publicName] || '').trim()
  if (!publicValue) continue

  for (const [secretName, secretValue] of serverSecrets) {
    if (secretValue && publicValue === secretValue) {
      failures.push(`${publicName} must never contain ${secretName}`)
    }
  }
  const patternedFindings = inspectContentForSecrets(publicValue)
  if (patternedFindings.length > 0) {
    failures.push(`${publicName} resembles a private credential (${patternedFindings.join(', ')})`)
  }
}
if (serverAnonKey && serviceRoleKey && serverAnonKey === serviceRoleKey) {
  failures.push('SUPABASE_ANON_KEY must not contain the service-role key')
}
if (quizKey && timetableKey && quizKey === timetableKey) {
  failures.push('GROQ_QUIZ_API_KEY and GROQ_TIMETABLE_API_KEY must use separate credentials')
}
if (recallKey && quizKey && recallKey === quizKey) {
  failures.push('GROQ_RECALL_API_KEY and GROQ_QUIZ_API_KEY must use separate credentials')
}
if (recallKey && insightsKey && recallKey === insightsKey) {
  failures.push('GROQ_RECALL_API_KEY and GROQ_INSIGHTS_API_KEY must use separate credentials')
}
if (recallKey && timetableKey && recallKey === timetableKey) {
  failures.push('GROQ_RECALL_API_KEY and GROQ_TIMETABLE_API_KEY must use separate credentials')
}
if (insightsKey && quizKey && insightsKey === quizKey) {
  failures.push('GROQ_INSIGHTS_API_KEY and GROQ_QUIZ_API_KEY must use separate credentials')
}
if (insightsKey && timetableKey && insightsKey === timetableKey) {
  failures.push('GROQ_INSIGHTS_API_KEY and GROQ_TIMETABLE_API_KEY must use separate credentials')
}

const timeout = String(process.env.GROQ_REQUEST_TIMEOUT_MS || '').trim()
if (timeout && (!/^\d+$/.test(timeout) || Number(timeout) < 5000 || Number(timeout) > 30000)) {
  failures.push('GROQ_REQUEST_TIMEOUT_MS must be an integer from 5000 through 30000')
}

const oauthFeatureFlags = [
  'VITE_AUTH_GOOGLE_ENABLED',
  'VITE_AUTH_GITHUB_ENABLED',
  'VITE_AUTH_APPLE_ENABLED',
]
for (const name of oauthFeatureFlags) {
  const value = String(process.env[name] || '').trim().toLowerCase()
  if (value && value !== 'true' && value !== 'false') {
    failures.push(`${name} must be true or false when set`)
  }
}

const allowedPublicNames = new Set([
  ...oauthFeatureFlags,
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
])
for (const name of Object.keys(process.env)) {
  if (!name.startsWith('VITE_') || allowedPublicNames.has(name)) continue
  if (/(?:API_KEY|PASSWORD|PRIVATE_KEY|SECRET|SERVICE_ROLE|TOKEN)/.test(name.toUpperCase())) {
    failures.push(`${name} is server-only and must not use the VITE_ prefix`)
  }
}

if (failures.length > 0) {
  console.error(`Vercel ${environment} environment validation failed:`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Vercel ${environment} environment validation passed; required values are present and remain in their intended exposure scope.`)
if (environment === 'preview') {
  console.log('Preview validation cannot compare dashboard scopes; use isolated Preview Supabase and Groq credentials as documented.')
}
