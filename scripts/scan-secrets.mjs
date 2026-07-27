import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import {
  addKnownSecrets,
  inspectContentForSecrets,
  knownSecretsFromProcessEnvironment,
  parseEnvironmentAssignments,
} from './secret-patterns.mjs'

const root = process.cwd()
const maximumTextFileBytes = 5 * 1024 * 1024
const ignoredDirectories = new Set([
  '.git',
  '.supabase',
  '.vercel',
  'coverage',
  'node_modules',
])
const textExtensions = new Set([
  '',
  '.cjs',
  '.css',
  '.cts',
  '.example',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.lock',
  '.md',
  '.mjs',
  '.mts',
  '.ps1',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])

function isPrivateEnvironmentFile(fileName) {
  return fileName === '.env'
    || (fileName.startsWith('.env.') && fileName !== '.env.example' && fileName !== '.env.sample')
}

function collectFiles(directory, result = { environmentFiles: [], textFiles: [] }) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectFiles(absolutePath, result)
      continue
    }

    if (isPrivateEnvironmentFile(entry.name)) {
      result.environmentFiles.push(absolutePath)
      continue
    }

    if (textExtensions.has(extname(entry.name)) && statSync(absolutePath).size <= maximumTextFileBytes) {
      result.textFiles.push(absolutePath)
    }
  }
  return result
}

const { environmentFiles, textFiles } = collectFiles(root)
const knownSecrets = knownSecretsFromProcessEnvironment()
for (const environmentFile of environmentFiles) {
  addKnownSecrets(
    knownSecrets,
    parseEnvironmentAssignments(readFileSync(environmentFile, 'utf8')),
  )
}

const findingKeys = new Set()
const findings = []
let checkedFiles = 0

for (const absolutePath of textFiles) {
  const content = readFileSync(absolutePath)
  if (content.includes(0)) continue

  const file = relative(root, absolutePath)
  checkedFiles += 1
  for (const type of inspectContentForSecrets(content.toString('utf8'), knownSecrets)) {
    const findingKey = `${file}\0${type}`
    if (findingKeys.has(findingKey)) continue
    findingKeys.add(findingKey)
    findings.push({ file, type })
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} potential finding(s):`)
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.type}`)
  process.exitCode = 1
} else {
  console.log(
    `Secret scan passed: checked ${checkedFiles} text files and ${environmentFiles.length} private environment file(s); no known or patterned credentials found.`,
  )
}
