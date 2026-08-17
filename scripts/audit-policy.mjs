import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const projectRoot = process.cwd()
const expectedRouterVersion = '7.18.2'
const runtimeExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const acceptedArguments = new Set(['--omit=dev'])

const failures = []
const arguments_ = process.argv.slice(2)
for (const argument of arguments_) {
  if (!acceptedArguments.has(argument)) failures.push(`unsupported audit-policy argument: ${argument}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertRouterVersions() {
  const packageMetadata = readJson(join(projectRoot, 'package.json'))
  const lockMetadata = readJson(join(projectRoot, 'package-lock.json'))

  if (packageMetadata.dependencies?.['react-router-dom'] !== expectedRouterVersion) {
    failures.push(`package.json must pin react-router-dom exactly to ${expectedRouterVersion}`)
  }
  if (lockMetadata.packages?.['']?.dependencies?.['react-router-dom'] !== expectedRouterVersion) {
    failures.push(`package-lock.json must pin react-router-dom exactly to ${expectedRouterVersion}`)
  }
  if (lockMetadata.packages?.['node_modules/react-router-dom']?.version !== expectedRouterVersion) {
    failures.push(`package-lock.json must resolve react-router-dom ${expectedRouterVersion}`)
  }
  if (lockMetadata.packages?.['node_modules/react-router']?.version !== expectedRouterVersion) {
    failures.push(`package-lock.json must resolve react-router ${expectedRouterVersion}`)
  }

  const dependencyNames = [
    ...Object.keys(packageMetadata.dependencies ?? {}),
    ...Object.keys(packageMetadata.devDependencies ?? {}),
  ]
  for (const dependencyName of dependencyNames) {
    if (dependencyName.startsWith('react-server-dom-')) {
      failures.push(`RSC dependency ${dependencyName} is incompatible with the temporary audit exception`)
    }
  }

  const installedPackages = ['react-router', 'react-router-dom']
  for (const packageName of installedPackages) {
    const installedPath = join(projectRoot, 'node_modules', packageName, 'package.json')
    if (!existsSync(installedPath)) {
      failures.push(`${packageName} is not installed; run npm ci before the audit policy`)
      continue
    }
    const installedVersion = readJson(installedPath).version
    if (installedVersion !== expectedRouterVersion) {
      failures.push(`${packageName} ${installedVersion} is installed; expected ${expectedRouterVersion}`)
    }
  }
}

function collectRuntimeFiles(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) collectRuntimeFiles(absolutePath, files)
    else if (runtimeExtensions.has(extname(entry.name))) files.push(absolutePath)
  }
  return files
}

function assertNoRscUsage() {
  const runtimeFiles = []
  for (const directory of ['api', 'server', 'shared', 'src']) {
    collectRuntimeFiles(join(projectRoot, directory), runtimeFiles)
  }
  for (const rootFile of ['server.js', 'vite.config.js']) {
    const absolutePath = join(projectRoot, rootFile)
    if (existsSync(absolutePath)) runtimeFiles.push(absolutePath)
  }

  const forbiddenPatterns = [
    {
      name: 'an unstable React Router RSC identifier',
      pattern: /\b(?:UNSAFE|unstable)_[A-Za-z0-9_$]*RSC[A-Za-z0-9_$]*\b/,
    },
    {
      name: 'a direct react-router or react-router/internal import',
      pattern: /['"]react-router(?:\/internal(?:\/[^'"]*)?)?['"]/,
    },
    {
      name: 'a React Server Components package',
      pattern: /\breact-server-dom-[A-Za-z0-9_-]+\b/,
    },
    {
      name: 'the react-server export condition',
      pattern: /['"]react-server['"]/,
    },
  ]

  for (const file of runtimeFiles) {
    const content = readFileSync(file, 'utf8')
    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(content)) {
        failures.push(`${relative(projectRoot, file)} contains ${forbidden.name}`)
      }
    }
  }
}

function runNpmAudit() {
  const npmExecPath = process.env.npm_execpath
  const auditArguments = ['audit', '--json', ...arguments_.filter((argument) => acceptedArguments.has(argument))]
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...auditArguments], {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', auditArguments, {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        shell: process.platform === 'win32',
        windowsHide: true,
      })

  if (result.error) throw result.error

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    const message = String(result.stderr || result.stdout || 'npm audit produced no report').trim()
    throw new Error(message)
  }

  if (report.error) {
    const message = report.error.summary || report.error.code || 'npm audit could not complete'
    throw new Error(message)
  }
  if (!report.vulnerabilities || !report.metadata?.vulnerabilities) {
    throw new Error('npm audit returned an unsupported report format')
  }
  return report
}

assertRouterVersions()
assertNoRscUsage()

let report
try {
  report = runNpmAudit()
} catch (error) {
  failures.push(`npm audit failed closed: ${error.message}`)
}

if (report) {
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue
    failures.push(`${packageName} has an unapproved ${vulnerability.severity} advisory`)
  }
}

if (failures.length > 0) {
  console.error(`Dependency audit policy failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

const counts = report.metadata.vulnerabilities
console.log(
  `Dependency audit policy passed: ${counts.critical ?? 0} critical and ${counts.high ?? 0} high vulnerable package(s) reported.`,
)
