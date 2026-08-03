import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { describe, it } from 'node:test'

const migrationPath = new URL(
  '../supabase/migrations/20260730120000_curriculum_profiles_and_rls.sql',
  import.meta.url,
)
const supersededMigrationPath = new URL(
  '../supabase/migrations/20260728071537_oauth_profile_metadata_defaults.sql',
  import.meta.url,
)
const migration = readFileSync(migrationPath, 'utf8')
const academicProfileSource = readFileSync(
  new URL('../src/academic/academicProfile.ts', import.meta.url),
  'utf8',
)
const topLevelMigration = migration.replace(
  /\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g,
  '$dollar_quoted_body$',
)

describe('curriculum database migration safety', () => {
  it('loads migration candidates using columns defined by the database schema', () => {
    assert.match(
      academicProfileSource,
      /id, normalized_name, legacy_names, curriculum_subject_id, occurrence_count, confidence, resolution_status/,
    )
    assert.doesNotMatch(academicProfileSource, /\bdetected_name\b/)
  })

  it('is one explicit transaction and contains no destructive legacy-data statements', () => {
    assert.match(migration, /^-- Recall\+ curriculum-driven[\s\S]*\nbegin;\n/)
    assert.match(migration, /\ncommit;\s*$/)
    assert.equal((migration.match(/^\s*begin;\s*$/gm) || []).length, 1)
    assert.equal((migration.match(/^\s*commit;\s*$/gm) || []).length, 1)
    assert.doesNotMatch(topLevelMigration, /\bdrop\s+table\b/i)
    assert.doesNotMatch(topLevelMigration, /\btruncate\b/i)
    assert.doesNotMatch(topLevelMigration, /\bdelete\s+from\s+public[.]user_app_data\b/i)
    assert.doesNotMatch(topLevelMigration, /\bupdate\s+public[.]user_app_data\b/i)
  })

  it('seeds the exact version and guards verified source replacement', () => {
    assert.match(migration, /cbse-2026-27-xi-v1/)
    assert.match(migration, /Expected 124 curriculum subject records/)
    assert.match(migration, /Expected 121 selectable curriculum subject records/)
    assert.match(migration, /Expected 295 curriculum node records/)
    assert.match(migration, /already exists with a different source hash/)
  })

  it('enables RLS and grants clients read-only table access', () => {
    const tables = [
      'curriculum_versions',
      'curriculum_subjects',
      'curriculum_nodes',
      'user_academic_profiles',
      'user_subjects',
      'user_subject_migration_candidates',
    ]
    tables.forEach((table) => {
      assert.match(migration, new RegExp(`alter table public[.]${table} enable row level security`))
    })
    assert.doesNotMatch(
      migration,
      /grant\s+(insert|update|delete|all)[\s\S]{0,250}\bto authenticated\b/i,
    )
    assert.match(migration, /grant select on table[\s\S]*to authenticated;/)
    assert.match(migration, /create index curriculum_nodes_parent_fk_idx/)
    assert.match(migration, /create index user_academic_profiles_curriculum_fk_idx/)
    assert.match(
      migration,
      /create index user_subject_migration_candidates_subject_idx/,
    )
    assert.match(
      migration,
      /create index curriculum_legacy_subject_aliases_subject_idx/,
    )
    assert.doesNotMatch(
      migration,
      /select \(auth[.]jwt\(\) ->> 'is_anonymous'\)/,
    )
    assert.match(
      migration,
      /\(\(\(select auth[.]jwt\(\)\) ->> 'is_anonymous'\)::boolean\)/,
    )
  })

  it('derives academic writes from auth and archives replaced selections', () => {
    assert.match(migration, /v_user_id uuid := \(select auth[.]uid\(\)\)/)
    assert.match(migration, /set archived_at = v_completed_at/)
    assert.match(migration, /INVALID_SUBJECT_COMBINATION/)
    assert.doesNotMatch(
      migration,
      /save_recall_academic_profile\s*\(\s*p_user_id/i,
    )
  })

  it('keeps SECURITY DEFINER implementations outside the exposed public schema', () => {
    const publicFunctions = [
      'initialize_recall_timezone',
      'upsert_recall_app_data',
      'save_recall_onboarding_progress',
      'save_recall_academic_profile',
      'refresh_recall_legacy_subject_candidates',
    ]
    publicFunctions.forEach((name) => {
      assert.match(
        migration,
        new RegExp(
          `create (?:or replace )?function public[.]${name}[\\s\\S]{0,450}`
          + 'security invoker',
          'i',
        ),
      )
    })
    assert.match(migration, /create function recall_private[.]upsert_recall_app_data_impl/)
    assert.match(migration, /create function recall_private[.]save_recall_academic_profile_impl/)
  })

  it('rejects anonymous Auth users in policies, RPCs, and profile provisioning', () => {
    assert.match(migration, /alter policy recall_profiles_select_own[\s\S]*is_anonymous/)
    assert.match(migration, /alter policy user_app_data_update_own[\s\S]*is_anonymous/)
    assert.match(migration, /create policy user_subjects_select_own[\s\S]*is_anonymous/)
    assert.match(migration, /if coalesce\(new[.]is_anonymous, false\) then/)
    assert.match(migration, /where not coalesce\(users[.]is_anonymous, false\)/)
  })

  it('consolidates the unapplied OAuth migration into the atomic phase migration', () => {
    assert.equal(existsSync(supersededMigrationPath), false)
    assert.match(migration, /create or replace function public[.]handle_new_recall_user\(\)/)
    assert.match(migration, /insert into public[.]user_academic_profiles/)
  })
})
