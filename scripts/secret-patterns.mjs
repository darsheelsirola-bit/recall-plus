const PUBLIC_CONFIGURATION_NAMES = new Set([
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
])

const EXPLICIT_SECRET_NAMES = new Set([
  'AI_API_KEY',
  'GROQ_QUIZ_API_KEY',
  'GROQ_TIMETABLE_API_KEY',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'VERCEL_TOKEN',
])

const credentialPatterns = [
  { name: 'Groq API key', pattern: /\bgsk_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/ },
  { name: 'GitHub token', pattern: /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: 'GitLab token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{20,}\b/ },
  { name: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'Stripe live secret key', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
]

const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g

export function normalizeEnvironmentValue(rawValue = '') {
  const value = String(rawValue).trim()
  const quoted = value.match(/^(['"])([\s\S]*)\1(?:[,;])?$/)
  return (quoted ? quoted[2] : value).trim()
}

export function isPlaceholderValue(rawValue) {
  const value = normalizeEnvironmentValue(rawValue)
  if (!value) return true

  const normalized = value.toLowerCase()
  return normalized === 'changeme'
    || normalized === 'change_me'
    || normalized === 'example'
    || normalized === 'placeholder'
    || normalized === 'redacted'
    || normalized.startsWith('your-')
    || normalized.startsWith('your_')
    || normalized.startsWith('your')
    || normalized.startsWith('<')
    || normalized.startsWith('${')
    || normalized.startsWith('env(')
    || /^\*+$/.test(value)
    || /^x+$/i.test(value)
}

export function isSecretEnvironmentName(name) {
  const normalized = String(name).toUpperCase()
  if (PUBLIC_CONFIGURATION_NAMES.has(normalized)) return false
  if (EXPLICIT_SECRET_NAMES.has(normalized)) return true

  return /(?:^|_)(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PRIVATE_KEY|SECRET|SERVICE_ROLE_KEY|TOKEN)$/.test(
    normalized,
  )
}

export function parseEnvironmentAssignments(content) {
  const assignments = []
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    assignments.push({ name: match[1], value: normalizeEnvironmentValue(match[2]) })
  }
  return assignments
}

export function addKnownSecrets(target, assignments) {
  for (const { name, value } of assignments) {
    if (!isSecretEnvironmentName(name) || isPlaceholderValue(value) || value.length < 12) continue
    target.set(name, value)
  }
  return target
}

export function knownSecretsFromProcessEnvironment(environment = process.env) {
  return addKnownSecrets(
    new Map(),
    Object.entries(environment).map(([name, value]) => ({ name, value: value ?? '' })),
  )
}

function containsServiceRoleJwt(content) {
  for (const match of String(content).matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'))
      if (payload?.role === 'service_role') return true
    } catch {
      // Invalid JWT-like strings are handled by the other detectors, if applicable.
    }
  }
  return false
}

export function inspectContentForSecrets(content, knownSecrets = new Map()) {
  const text = String(content)
  const findings = new Set()

  for (const [name, value] of knownSecrets) {
    if (value.length >= 12 && text.includes(value)) findings.add(`value from ${name}`)
  }

  for (const detector of credentialPatterns) {
    if (detector.pattern.test(text)) findings.add(detector.name)
  }

  if (containsServiceRoleJwt(text)) findings.add('Supabase service-role JWT')

  for (const { name, value } of parseEnvironmentAssignments(text)) {
    if (isSecretEnvironmentName(name) && !isPlaceholderValue(value)) {
      findings.add(`literal ${name} assignment`)
    }
  }

  return [...findings]
}
