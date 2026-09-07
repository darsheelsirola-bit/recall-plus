import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal(path) {
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function redact(text) {
  return String(text).replace(/sbp_[A-Za-z0-9]+/g, 'sbp_[REDACTED]')
}

const [, , migrationNameArg, migrationFileArg] = process.argv
if (!migrationNameArg || !migrationFileArg) {
  console.error('Usage: node scripts/apply-production-migration.mjs <name> <file>')
  process.exit(1)
}

const env = loadEnvLocal(resolve('.env.local'))
const token = env.SUPABASE_ACCESS_TOKEN
if (!token || !token.startsWith('sbp_')) {
  console.error('ERROR: SUPABASE_ACCESS_TOKEN missing or unexpected format')
  process.exit(1)
}

const projectRef = 'bqysqcsogqxfhrtuituo'
const filePath = resolve(migrationFileArg)
let sql = readFileSync(filePath, 'utf8')

// Management API wraps the body in its own transaction. Strip our outer wrappers.
sql = sql.replace(/^\s*begin\s*;\s*/i, '').replace(/\s*commit\s*;\s*$/i, '')
if (/^\s*begin\s*;/i.test(sql) || /\bcommit\s*;\s*$/i.test(sql.trimEnd())) {
  console.error('ERROR: could not safely strip outer begin/commit')
  process.exit(1)
}

console.log(`Applying ${migrationNameArg} (${sql.length} chars)...`)
const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/migrations`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: migrationNameArg,
      query: sql,
    }),
  },
)

const text = await response.text()
console.log('HTTP status:', response.status)
if (!response.ok) {
  const clipped = text.length > 2000 ? `${text.slice(0, 2000)}...[truncated]` : text
  console.error('Migration failed:', redact(clipped))
  process.exit(1)
}
console.log('Migration applied successfully.')
