import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationDirectory = path.join(projectRoot, 'supabase', 'migrations')
const expectedCurriculumMigration = '20260730120000_curriculum_profiles_and_rls.sql'

const bootstrapSql = `
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$roles$;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  is_anonymous boolean not null default false
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt()
  to anon, authenticated, service_role;
`

const testUserId = '00000000-0000-0000-0000-000000000901'
const otherUserId = '00000000-0000-0000-0000-000000000902'
const anonymousUserId = '00000000-0000-0000-0000-000000000903'
const legacyUserId = '00000000-0000-0000-0000-000000000904'

const validScienceSelection = JSON.stringify([
  {
    curriculumSubjectId: 'cbse-2026-27-xi-301',
    subjectPosition: 1,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    subjectPosition: 2,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-043',
    subjectPosition: 3,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-843',
    subjectPosition: 4,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-041',
    subjectPosition: 5,
    selectionType: 'main',
  },
])

const invalidPositionSelection = JSON.stringify([
  {
    curriculumSubjectId: 'cbse-2026-27-xi-301',
    subjectPosition: 1,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-042',
    subjectPosition: 2,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-043',
    subjectPosition: 3,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-041',
    subjectPosition: 4,
    selectionType: 'main',
  },
  {
    curriculumSubjectId: 'cbse-2026-27-xi-843',
    subjectPosition: 6,
    selectionType: 'additional',
  },
])

async function scalar(db, sql, parameters = []) {
  const result = await db.query(sql, parameters)
  return result.rows[0]
}

const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d+_[a-z0-9_]+[.]sql$/.test(name))
  .sort()

assert.equal(
  migrationFiles.at(-1),
  expectedCurriculumMigration,
  'the curriculum migration must remain the newest checked-in migration',
)

const db = new PGlite()
let legacySnapshotBefore

try {
  await db.exec(bootstrapSql)

  for (const migrationFile of migrationFiles) {
    if (migrationFile === expectedCurriculumMigration) {
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values (
           $1,
           'legacy@example.test',
           '{"full_name":"Legacy Learner"}'::jsonb
         )`,
        [legacyUserId],
      )
      await db.query(
        `update public.user_app_data
        set
          data = $2::jsonb,
          version = 7
        where user_id = $1`,
        [
          legacyUserId,
          JSON.stringify({
            recall_plus_study_logs: [{ subject: 'Maths' }],
            recall_plus_quiz_results: [{ subject: 'Physics' }],
            recall_plus_reviews: [{ subject: 'AI' }],
            recall_plus_study_timetable: [{ subject: 'Mystery Studies' }],
          }),
        ],
      )
      legacySnapshotBefore = await scalar(
        db,
        `select data, version
        from public.user_app_data
        where user_id = $1`,
        [legacyUserId],
      )
    }

    const migration = await readFile(path.join(migrationDirectory, migrationFile), 'utf8')
    await db.exec(migration)
  }

  const legacySnapshotAfter = await scalar(
    db,
    `select data, version
    from public.user_app_data
    where user_id = $1`,
    [legacyUserId],
  )
  assert.deepEqual(legacySnapshotAfter, legacySnapshotBefore)

  const legacyBackfill = await scalar(
    db,
    `select
      exists (
        select 1
        from public.user_academic_profiles
        where user_id = $1
          and not onboarding_completed
      ) as has_incomplete_profile,
      (
        select count(*)::integer
        from public.user_subject_migration_candidates
        where user_id = $1
      ) as candidates,
      (
        select count(*)::integer
        from public.user_subjects
        where user_id = $1
          and archived_at is null
      ) as active_subjects`,
    [legacyUserId],
  )
  assert.deepEqual(legacyBackfill, {
    has_incomplete_profile: true,
    candidates: 4,
    active_subjects: 0,
  })

  const catalogue = await scalar(
    db,
    `select
      count(*)::integer as total,
      count(*) filter (where subject_group <> 'IA')::integer as selectable
    from public.curriculum_subjects`,
  )
  assert.deepEqual(catalogue, { total: 124, selectable: 121 })

  const nodes = await scalar(
    db,
    'select count(*)::integer as count from public.curriculum_nodes',
  )
  assert.equal(nodes.count, 295)

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'smoke@example.test', '{"full_name":"Smoke Test"}'::jsonb)`,
    [testUserId],
  )
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'other@example.test', '{"full_name":"Other User"}'::jsonb)`,
    [otherUserId],
  )
  await db.query(
    `insert into auth.users (
      id,
      email,
      raw_user_meta_data,
      is_anonymous
    )
    values ($1, 'anonymous@example.test', '{}'::jsonb, true)`,
    [anonymousUserId],
  )

  const provisioned = await scalar(
    db,
    `select
      exists (
        select 1 from public.recall_profiles where id = $1
      ) as recall_profile,
      exists (
        select 1 from public.user_app_data where user_id = $1
      ) as app_data,
      exists (
        select 1 from public.user_academic_profiles where user_id = $1
      ) as academic_profile`,
    [testUserId],
  )
  assert.deepEqual(provisioned, {
    recall_profile: true,
    app_data: true,
    academic_profile: true,
  })

  const anonymousProvisioning = await scalar(
    db,
    `select
      exists (
        select 1 from public.recall_profiles where id = $1
      ) as recall_profile,
      exists (
        select 1 from public.user_app_data where user_id = $1
      ) as app_data,
      exists (
        select 1 from public.user_academic_profiles where user_id = $1
      ) as academic_profile`,
    [anonymousUserId],
  )
  assert.deepEqual(anonymousProvisioning, {
    recall_profile: false,
    app_data: false,
    academic_profile: false,
  })

  await db.query(
    `select set_config('request.jwt.claim.sub', $1, false),
            set_config(
              'request.jwt.claims',
              '{"is_anonymous":false}',
              false
            )`,
    [testUserId],
  )
  await db.exec('set role authenticated')

  const ownerVisibility = await scalar(
    db,
    `select
      count(*)::integer as visible_profiles,
      bool_and(user_id = $1) as only_owner
    from public.user_academic_profiles`,
    [testUserId],
  )
  assert.deepEqual(ownerVisibility, { visible_profiles: 1, only_owner: true })

  await assert.rejects(
    db.query(
      `insert into public.user_subjects (
        user_id,
        curriculum_subject_id,
        subject_position,
        selection_type
      )
      values ($1, 'cbse-2026-27-xi-042', 2, 'main')`,
      [testUserId],
    ),
    /permission denied/i,
  )

  const valid = await scalar(
    db,
    `select public.validate_recall_subject_combination($1::jsonb) as result`,
    [validScienceSelection],
  )
  assert.equal(valid.result.valid, true)
  assert.deepEqual(valid.result.errors, [])

  const invalidPositions = await scalar(
    db,
    `select public.validate_recall_subject_combination($1::jsonb) as result`,
    [invalidPositionSelection],
  )
  assert.equal(invalidPositions.result.valid, false)
  assert.ok(
    invalidPositions.result.errors.some(
      (error) => error.code === 'SUBJECT_POSITION_SEQUENCE',
    ),
  )

  const saved = await scalar(
    db,
    `select public.save_recall_academic_profile(
      'science',
      'Smoke Test School',
      $1::jsonb
    ) as result`,
    [validScienceSelection],
  )
  assert.equal(saved.result.onboardingCompleted, true)
  assert.equal(saved.result.subjects.length, 5)

  await db.query(
    `select set_config(
      'request.jwt.claims',
      '{"is_anonymous":true}',
      false
    )`,
  )
  await assert.rejects(
    db.query(
      `select public.validate_recall_subject_combination($1::jsonb)`,
      [validScienceSelection],
    ),
    /Authentication is required/i,
  )

  await db.exec('reset role')

  const persisted = await scalar(
    db,
    `select
      count(*) filter (where archived_at is null)::integer as active_subjects,
      bool_and(selection_type = 'main') as all_main
    from public.user_subjects
    where user_id = $1`,
    [testUserId],
  )
  assert.deepEqual(persisted, { active_subjects: 5, all_main: true })

  const security = await scalar(
    db,
    `select
      not (
        select prosecdef
        from pg_catalog.pg_proc
        where oid = 'public.upsert_recall_app_data(uuid,jsonb,bigint)'::regprocedure
      ) as public_wrapper_is_invoker,
      (
        select prosecdef
        from pg_catalog.pg_proc
        where oid = 'recall_private.upsert_recall_app_data_impl(uuid,jsonb,bigint)'::regprocedure
      ) as private_impl_is_definer`,
  )
  assert.deepEqual(security, {
    public_wrapper_is_invoker: true,
    private_impl_is_definer: true,
  })

  const privatePrivileges = await db.query(
    `select procedures.proname
    from pg_catalog.pg_proc as procedures
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'recall_private'
      and has_function_privilege(
        'authenticated',
        procedures.oid,
        'EXECUTE'
      )
    order by procedures.proname`,
  )
  assert.deepEqual(
    privatePrivileges.rows.map(({ proname }) => proname),
    [
      'initialize_recall_timezone_impl',
      'refresh_legacy_subject_candidates_for_current_user',
      'save_recall_academic_profile_impl',
      'save_recall_onboarding_progress_impl',
      'upsert_recall_app_data_impl',
    ],
  )

  console.log(
    `Database smoke test passed: ${migrationFiles.length} migrations, `
    + `${catalogue.total} subjects, ${nodes.count} nodes, preserved legacy snapshot, `
    + 'owner-bound onboarding.',
  )
} finally {
  await db.close()
}
