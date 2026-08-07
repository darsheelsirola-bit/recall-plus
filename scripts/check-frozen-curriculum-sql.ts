/**
 * Freeze check for the already-applied Phase 2 curriculum bootstrap migration.
 * Do not regenerate that file from the allowlist seed — production already ran it.
 * Catalogue refreshes belong in additive migrations (see 20260807210000_*).
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const frozenMigrationPath = resolve(
  'supabase/migrations/20260730120000_curriculum_profiles_and_rls.sql',
)

const expectedSha256 =
  process.env.CURRICULUM_BOOTSTRAP_MIGRATION_SHA256
  || ''

const bytes = await readFile(frozenMigrationPath)
const digest = createHash('sha256').update(bytes).digest('hex')

if (process.argv.includes('--print-hash')) {
  console.log(digest)
  process.exit(0)
}

// When an expected hash is configured, enforce it. Otherwise only assert the
// frozen migration still exists, is non-trivial, and still documents the
// historical 121-subject bootstrap (so nobody silently rewrites it).
const text = bytes.toString('utf8')
if (!text.includes('Expected 121 selectable curriculum subject records')) {
  throw new Error(
    'Frozen curriculum bootstrap migration looks rewritten. Restore 20260730120000_curriculum_profiles_and_rls.sql and use an additive migration instead.',
  )
}
if (bytes.length < 100_000) {
  throw new Error('Frozen curriculum bootstrap migration is unexpectedly small.')
}
if (expectedSha256 && digest !== expectedSha256) {
  throw new Error(
    `Frozen curriculum bootstrap migration hash mismatch. Expected ${expectedSha256}, found ${digest}.`,
  )
}

console.log(
  `Verified frozen curriculum bootstrap migration (${bytes.length} bytes, sha256=${digest.slice(0, 12)}…).`,
)
