import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL(
  '../supabase/migrations/20260803120000_validate_study_log_curriculum.sql',
  import.meta.url,
)

test('study-log curriculum validation is atomic, private, and stable-ID based', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /^begin;/)
  assert.match(migration, /commit;\s*$/)
  assert.match(migration, /create function recall_private[.]enforce_user_app_data_curriculum/)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /revoke all on function recall_private[.]enforce_user_app_data_curriculum/)
  assert.match(migration, /create trigger user_app_data_validate_curriculum/)
  assert.match(migration, /curriculumSubjectId/)
  assert.match(migration, /curriculumVersionId/)
  assert.match(migration, /curriculumNodeIds/)
  assert.match(migration, /selections[.]archived_at is null/)
  assert.match(migration, /previous[.]value = v_entry/)
  assert.doesNotMatch(migration, /delete\s+from\s+public[.]user_app_data/i)
})
