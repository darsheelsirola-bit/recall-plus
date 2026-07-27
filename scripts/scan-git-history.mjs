import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  addKnownSecrets,
  inspectContentForSecrets,
  knownSecretsFromProcessEnvironment,
  parseEnvironmentAssignments,
} from './secret-patterns.mjs'

const root = process.cwd()
const maximumBlobBytes = 5 * 1024 * 1024

function runGit(arguments_, options = {}) {
  const result = spawnSync('git', arguments_, {
    cwd: root,
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || 'unknown Git error').trim()
    throw new Error(message)
  }
  return result.stdout
}

function loadLocalKnownSecrets() {
  const knownSecrets = knownSecretsFromProcessEnvironment()
  const candidates = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.'))
      && entry.name !== '.env.example' && entry.name !== '.env.sample') {
      candidates.push(join(root, entry.name))
    }
  }
  candidates.push(
    join(root, 'supabase', '.env'),
    join(root, 'supabase', 'functions', '.env'),
  )

  for (const file of candidates) {
    if (!existsSync(file)) continue
    addKnownSecrets(knownSecrets, parseEnvironmentAssignments(readFileSync(file, 'utf8')))
  }
  return knownSecrets
}

function isInsideWorkTree() {
  try {
    return String(runGit(['rev-parse', '--is-inside-work-tree'])).trim() === 'true'
  } catch {
    return false
  }
}

const insideWorkTree = isInsideWorkTree()
if (!insideWorkTree) {
  if (process.env.VERCEL === '1') {
    console.log('Git history scan skipped because Vercel did not provide Git object metadata; full history is enforced in GitHub CI.')
    process.exit(0)
  }
  console.error('Git history scan requires a Git worktree.')
  process.exit(1)
}

const shallow = String(runGit(['rev-parse', '--is-shallow-repository'])).trim() === 'true'
if (shallow && process.env.GITHUB_ACTIONS === 'true') {
  console.error('GitHub CI checkout is shallow; fetch-depth must be 0 for a complete secret-history scan.')
  process.exit(1)
}

const objectPaths = new Map()
for (const line of String(runGit(['rev-list', '--objects', '--all'])).split(/\r?\n/)) {
  if (!line) continue
  const separator = line.indexOf(' ')
  const objectId = separator === -1 ? line : line.slice(0, separator)
  const objectPath = separator === -1 ? '<historical object>' : line.slice(separator + 1)
  if (!objectPaths.has(objectId)) objectPaths.set(objectId, objectPath)
}

const objectIds = [...objectPaths.keys()]
const metadataOutput = String(runGit(
  ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
  { input: `${objectIds.join('\n')}\n` },
))
const blobMetadata = new Map()
for (const line of metadataOutput.split(/\r?\n/)) {
  const match = line.match(/^([0-9a-f]+) (\w+) (\d+)$/)
  if (match?.[2] === 'blob') blobMetadata.set(match[1], Number(match[3]))
}

const knownSecrets = loadLocalKnownSecrets()
const findings = []
const findingKeys = new Set()
let checkedBlobs = 0

for (const [objectId, size] of blobMetadata) {
  if (size > maximumBlobBytes) continue
  const content = runGit(['cat-file', 'blob', objectId], { encoding: null })
  if (content.includes(0)) continue

  checkedBlobs += 1
  const objectPath = objectPaths.get(objectId) ?? '<historical object>'
  for (const type of inspectContentForSecrets(content.toString('utf8'), knownSecrets)) {
    const findingKey = `${objectId}\0${type}`
    if (findingKeys.has(findingKey)) continue
    findingKeys.add(findingKey)
    findings.push({ objectId: objectId.slice(0, 12), path: objectPath, type })
  }
}

if (findings.length > 0) {
  console.error(`Git history scan failed with ${findings.length} potential finding(s):`)
  for (const finding of findings) {
    console.error(`- blob ${finding.objectId} (${finding.path}): ${finding.type}`)
  }
  process.exitCode = 1
} else {
  const scope = shallow ? 'available shallow history' : 'complete reachable history'
  console.log(`Git history scan passed: checked ${checkedBlobs} text blob(s) across ${scope}; no known or patterned credentials found.`)
}
