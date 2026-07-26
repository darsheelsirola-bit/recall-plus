import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set([
  '.git',
  '.supabase',
  '.vercel',
  'coverage',
  'node_modules',
])
const textExtensions = new Set([
  '',
  '.css',
  '.example',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])
const secretKeyPattern =
  /^(AI_API_KEY|GROQ_[A-Z0-9_]*API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)$/
const placeholderPattern =
  /^(|changeme|example|placeholder|your[-_]|your[A-Z0-9_-]*key)/i
const credentialPatterns = [
  { name: 'Groq API key', pattern: /\bgsk_[A-Za-z0-9_-]{20,}\b/g },
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
]

function isEnvironmentFile(fileName) {
  return fileName === '.env' || (fileName.startsWith('.env.') && fileName !== '.env.example')
}

function parseEnvironmentSecrets() {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return []

  return readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((match) => ({
      name: match[1],
      value: match[2].replace(/^(['"])(.*)\1$/, '$2').trim(),
    }))
    .filter(({ name, value }) => secretKeyPattern.test(name) && value.length >= 12)
}

function collectTextFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectTextFiles(absolutePath, files)
    } else if (!isEnvironmentFile(entry.name) && textExtensions.has(extname(entry.name))) {
      files.push(absolutePath)
    }
  }
  return files
}

const knownSecrets = parseEnvironmentSecrets()
const findings = []
let checkedFiles = 0

for (const absolutePath of collectTextFiles(root)) {
  const file = relative(root, absolutePath)
  const content = readFileSync(absolutePath, 'utf8')
  checkedFiles += 1

  for (const secret of knownSecrets) {
    if (content.includes(secret.value)) {
      findings.push({ file, type: `value from ${secret.name}` })
    }
  }

  for (const credential of credentialPatterns) {
    for (const match of content.matchAll(credential.pattern)) {
      if (!placeholderPattern.test(match[0])) {
        findings.push({ file, type: credential.name })
      }
    }
  }

  for (const line of content.split(/\r?\n/)) {
    const assignment = line.match(
      /^\s*(AI_API_KEY|GROQ_[A-Z0-9_]*API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/,
    )
    if (!assignment) continue

    const value = assignment[2].replace(/^(['"])(.*)\1$/, '$2').trim()
    if (!placeholderPattern.test(value)) {
      findings.push({ file, type: `literal ${assignment[1]} assignment` })
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} potential finding(s):`)
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.type}`)
  }
  process.exitCode = 1
} else {
  console.log(
    `Secret scan passed: checked ${checkedFiles} text files; no known or patterned credentials found.`,
  )
}
