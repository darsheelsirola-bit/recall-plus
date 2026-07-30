begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(42);

create function pg_temp.curriculum_selections(p_codes text[])
returns jsonb
language sql
immutable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'curriculumSubjectId',
        'cbse-2026-27-xi-' || codes.value,
        'subjectPosition',
        codes.ordinality,
        'selectionType',
        case when codes.ordinality = 6 then 'additional' else 'main' end
      )
      order by codes.ordinality
    ),
    '[]'::jsonb
  )
  from unnest(p_codes) with ordinality as codes(value, ordinality);
$$;

grant execute on function pg_temp.curriculum_selections(text[])
  to authenticated;

select ok(
  exists (
    select 1
    from public.curriculum_versions
    where id = 'cbse-2026-27-xi-v1'
      and board = 'CBSE'
      and academic_year = '2026-27'
      and grade = 'XI'
      and source_hash ~ '^[a-f0-9]{64}$'
  ),
  'the official version identity and source hash are stored'
);

select ok(
  (select count(*) from public.curriculum_subjects where subject_group = 'L') = 39
  and (select count(*) from public.curriculum_subjects where subject_group = 'A') = 39
  and (select count(*) from public.curriculum_subjects where subject_group = 'S') = 43
  and (select count(*) from public.curriculum_subjects where subject_group = 'IA') = 3,
  'the database contains every official subject-code group and internal area'
);

select is(
  (
    select count(*)::integer
    from public.curriculum_subjects
    where subject_group <> 'IA'
  ),
  121,
  'the database has 121 selectable official subject codes'
);

select is(
  (select count(*)::integer from public.curriculum_nodes),
  295,
  'the reviewed outlines seed 295 deterministic curriculum nodes'
);

select ok(
  not exists (
    select 1
    from public.curriculum_subjects as subjects
    where subjects.content_status = 'verified_outline'
      and (
        subjects.source_hash is null
        or subjects.source_hash !~ '^[a-f0-9]{64}$'
        or not exists (
          select 1
          from public.curriculum_nodes as nodes
          where nodes.subject_id = subjects.id
            and nodes.source_url ~ '^https://cbseacademic[.]nic[.]in/'
        )
      )
  ),
  'every verified subject has a source hash and source-linked nodes'
);

select ok(
  (
    select count(*) = count(distinct id)
      and count(*) = count(distinct external_key)
    from public.curriculum_nodes
  ),
  'curriculum node IDs and external keys are unique'
);

select ok(
  (
    select count(*) = 6
    from pg_catalog.pg_class
    where oid in (
      'public.curriculum_versions'::regclass,
      'public.curriculum_subjects'::regclass,
      'public.curriculum_nodes'::regclass,
      'public.user_academic_profiles'::regclass,
      'public.user_subjects'::regclass,
      'public.user_subject_migration_candidates'::regclass
    )
      and relrowsecurity
  ),
  'RLS is enabled on every new public table'
);

select ok(
  to_regclass('public.curriculum_nodes_parent_fk_idx') is not null
  and to_regclass('public.user_academic_profiles_curriculum_fk_idx') is not null
  and to_regclass(
    'public.user_subject_migration_candidates_subject_idx'
  ) is not null
  and to_regclass(
    'recall_private.curriculum_legacy_subject_aliases_subject_idx'
  ) is not null,
  'every curriculum foreign-key path has a covering index'
);

select ok(
  has_table_privilege('authenticated', 'public.curriculum_versions', 'SELECT')
  and has_table_privilege('authenticated', 'public.curriculum_subjects', 'SELECT')
  and has_table_privilege('authenticated', 'public.curriculum_nodes', 'SELECT')
  and not has_table_privilege('authenticated', 'public.curriculum_subjects', 'INSERT')
  and not has_table_privilege('authenticated', 'public.curriculum_subjects', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.curriculum_subjects', 'DELETE'),
  'authenticated users can read but cannot mutate the official catalogue'
);

select ok(
  has_table_privilege('authenticated', 'public.user_academic_profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_subjects', 'SELECT')
  and has_table_privilege(
    'authenticated',
    'public.user_subject_migration_candidates',
    'SELECT'
  )
  and not has_table_privilege('authenticated', 'public.user_academic_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_subjects', 'INSERT')
  and has_function_privilege(
    'authenticated',
    'public.save_recall_academic_profile(text,text,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.refresh_recall_legacy_subject_candidates()',
    'EXECUTE'
  ),
  'user academic writes are restricted to session-derived RPCs'
);

select ok(
  not has_table_privilege('anon', 'public.curriculum_subjects', 'SELECT')
  and not has_table_privilege('anon', 'public.user_subjects', 'SELECT')
  and not has_function_privilege(
    'anon',
    'public.save_recall_academic_profile(text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot read curriculum/user data or call academic RPCs'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'recall_profiles',
        'user_app_data',
        'curriculum_versions',
        'curriculum_subjects',
        'curriculum_nodes',
        'user_academic_profiles',
        'user_subjects',
        'user_subject_migration_candidates'
      )
      and (
        coalesce(qual, '') !~ 'is_anonymous'
        and coalesce(with_check, '') !~ 'is_anonymous'
      )
  ),
  'every browser-facing RLS policy explicitly excludes anonymous Auth users'
);

select ok(
  not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.initialize_recall_timezone(uuid,text)'::regprocedure
  )
  and not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.upsert_recall_app_data(uuid,jsonb,bigint)'::regprocedure
  )
  and not (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.save_recall_academic_profile(text,text,jsonb)'::regprocedure
  )
  and (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'recall_private.upsert_recall_app_data_impl(uuid,jsonb,bigint)'::regprocedure
  ),
  'public RPC wrappers are invokers and privileged implementations stay private'
);

select set_eq(
  $query$
    select procedures.proname::text
    from pg_catalog.pg_proc as procedures
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'recall_private'
      and has_function_privilege(
        'authenticated',
        procedures.oid,
        'EXECUTE'
      )
  $query$,
  $expected$
    values
      ('initialize_recall_timezone_impl'::text),
      ('upsert_recall_app_data_impl'::text),
      ('save_recall_onboarding_progress_impl'::text),
      ('save_recall_academic_profile_impl'::text),
      ('refresh_legacy_subject_candidates_for_current_user'::text)
  $expected$,
  'authenticated users can execute only the allowlisted private RPC implementations'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  is_anonymous
)
values
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000501',
  'authenticated',
  'authenticated',
  'curriculum-one@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Curriculum One"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  '',
  false
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000502',
  'authenticated',
  'authenticated',
  'curriculum-two@example.test',
  '',
  clock_timestamp(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"name":"Curriculum Two"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  '',
  false
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000503',
  'authenticated',
  'authenticated',
  'curriculum-anonymous@example.test',
  '',
  clock_timestamp(),
  '{"provider":"anonymous","providers":[]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  '',
  true
);

select is(
  (
    select count(*)::integer
    from public.user_academic_profiles
    where user_id in (
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000502'
    )
  ),
  2,
  'the Auth trigger creates one academic profile per email or OAuth user'
);

select ok(
  not exists (
    select 1
    from public.recall_profiles
    where id = '00000000-0000-0000-0000-000000000503'
  )
  and not exists (
    select 1
    from public.user_app_data
    where user_id = '00000000-0000-0000-0000-000000000503'
  )
  and not exists (
    select 1
    from public.user_academic_profiles
    where user_id = '00000000-0000-0000-0000-000000000503'
  ),
  'the Auth trigger does not provision application data for anonymous accounts'
);

select ok(
  not (
    select onboarding_completed
    from public.user_academic_profiles
    where user_id = '00000000-0000-0000-0000-000000000501'
  )
  and (
    select curriculum_version_id = 'cbse-2026-27-xi-v1'
      and timezone = 'Asia/Kolkata'
      and pathway is null
    from public.user_academic_profiles
    where user_id = '00000000-0000-0000-0000-000000000501'
  ),
  'new users start on the current curriculum with incomplete onboarding'
);

update public.user_app_data
set data = jsonb_build_object(
  'recall_plus_study_logs',
  jsonb_build_array(jsonb_build_object('subject', 'Maths')),
  'recall_plus_quiz_results',
  jsonb_build_array(jsonb_build_object('subject', 'Physics')),
  'recall_plus_reviews',
  jsonb_build_array(jsonb_build_object('subject', 'AI')),
  'recall_plus_study_timetable',
  jsonb_build_array(jsonb_build_object('subject', 'Mystery Studies'))
)
where user_id = '00000000-0000-0000-0000-000000000501';

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.user_academic_profiles),
  1,
  'academic-profile RLS exposes only the authenticated owner row'
);

select throws_ok(
  $statement$
    update public.user_academic_profiles
    set onboarding_completed = true
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot bypass the academic profile RPC'
);

select throws_ok(
  $statement$
    insert into public.curriculum_subjects (
      id,
      curriculum_version_id,
      subject_code,
      name,
      short_name,
      subject_group,
      category,
      pathway_tags,
      source_url,
      source_title,
      content_status,
      official_order
    )
    values (
      'attacker-subject',
      'cbse-2026-27-xi-v1',
      '999',
      'Attacker Subject',
      'Attacker Subject',
      'A',
      'academic_elective',
      '{}'::text[],
      'https://cbseacademic.nic.in/',
      'Invalid',
      'pending_verification',
      999
    )
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot insert curriculum records'
);

select ok(
  (
    public.validate_recall_subject_combination(
      pg_temp.curriculum_selections(array['301', '042', '043', '843', '041'])
    ) ->> 'valid'
  )::boolean,
  'the database accepts a valid Science combination with a skill elective'
);

select ok(
  (
    public.validate_recall_subject_combination(
      pg_temp.curriculum_selections(array['301', '027', '028', '037', '039'])
    ) ->> 'valid'
  )::boolean,
  'the database accepts a valid Humanities combination'
);

select ok(
  public.validate_recall_subject_combination(
    pg_temp.curriculum_selections(array['301', '042', '043', '041', '241'])
  ) -> 'errors' @> '[{"code":"MATH_CONFLICT"}]'::jsonb,
  'the database rejects Mathematics with Applied Mathematics'
);

select ok(
  public.validate_recall_subject_combination(
    pg_temp.curriculum_selections(array['301', '042', '083', '065', '041'])
  ) -> 'errors' @> '[{"code":"COMPUTER_CONFLICT"}]'::jsonb,
  'the database rejects multiple computer-subject options'
);

select ok(
  public.validate_recall_subject_combination(
    pg_temp.curriculum_selections(array['301', '054', '833', '030', '041'])
  ) -> 'errors' @> '[{"code":"BUSINESS_CONFLICT"}]'::jsonb,
  'the database rejects Business Studies with Business Administration'
);

select ok(
  public.validate_recall_subject_combination(
    pg_temp.curriculum_selections(array['301', '042', '043', '044', '843'])
  ) -> 'errors' @> '[{"code":"SUBJECT_FIVE_GROUP"}]'::jsonb,
  'the database enforces Group A at Subject 5'
);

select ok(
  not (
    public.validate_recall_subject_combination(
      '[{"curriculumSubjectId":"cbse-2026-27-xi-301","extra":true}]'::jsonb
    ) ->> 'valid'
  )::boolean,
  'the database rejects malformed or unknown selection properties'
);

select ok(
  public.validate_recall_subject_combination(
    '[
      {
        "curriculumSubjectId": "cbse-2026-27-xi-301",
        "subjectPosition": 1,
        "selectionType": "main"
      },
      {
        "curriculumSubjectId": "cbse-2026-27-xi-042",
        "subjectPosition": 2,
        "selectionType": "main"
      },
      {
        "curriculumSubjectId": "cbse-2026-27-xi-043",
        "subjectPosition": 3,
        "selectionType": "main"
      },
      {
        "curriculumSubjectId": "cbse-2026-27-xi-041",
        "subjectPosition": 4,
        "selectionType": "main"
      },
      {
        "curriculumSubjectId": "cbse-2026-27-xi-843",
        "subjectPosition": 6,
        "selectionType": "additional"
      }
    ]'::jsonb
  ) -> 'errors' @> '[{"code":"SUBJECT_POSITION_SEQUENCE"}]'::jsonb,
  'five selections cannot skip a main position and masquerade as four mains plus an additional'
);

select ok(
  public.save_recall_onboarding_progress('science', 'Example School')
    @> '{"pathway":"science","schoolName":"Example School","onboardingCompleted":false}'::jsonb,
  'onboarding progress saves only allowed owner fields'
);

select is(
  public.refresh_recall_legacy_subject_candidates(),
  4,
  'the authenticated refresh maps only the current owner snapshot'
);

select set_eq(
  $query$
    select curriculum_subject_id
    from public.user_subject_migration_candidates
    where curriculum_subject_id is not null
  $query$,
  $expected$
    values
      ('cbse-2026-27-xi-041'::text),
      ('cbse-2026-27-xi-042'::text),
      ('cbse-2026-27-xi-843'::text)
  $expected$,
  'legacy Maths, Physics, and AI map to official stable IDs'
);

select is(
  (
    select normalized_name
    from public.user_subject_migration_candidates
    where resolution_status = 'unresolved'
  ),
  'mystery studies',
  'unmapped legacy subjects remain visible for manual confirmation'
);

select is(
  (select count(*)::integer from public.user_subjects where archived_at is null),
  0,
  'legacy detections are preselection candidates, not silent active subjects'
);

select throws_ok(
  $statement$
    select public.save_recall_academic_profile(
      'science',
      'Example School',
      pg_temp.curriculum_selections(array['301', '042', '043', '041', '241'])
    )
  $statement$,
  '22023',
  'INVALID_SUBJECT_COMBINATION',
  'an invalid combination cannot be persisted'
);

select ok(
  public.save_recall_academic_profile(
    'science',
    'Example School',
    pg_temp.curriculum_selections(array['301', '042', '043', '843', '041'])
  ) @> '{"onboardingCompleted":true}'::jsonb,
  'a valid confirmed combination is persisted atomically'
);

select is(
  (select count(*)::integer from public.user_subjects where archived_at is null),
  5,
  'the confirmed profile has exactly five active subjects'
);

select ok(
  (
    select onboarding_completed
      and onboarding_completed_at is not null
      and pathway = 'science'
    from public.user_academic_profiles
  ),
  'profile completion and subject activation commit together'
);

select ok(
  (
    select count(*) = 3
    from public.user_subject_migration_candidates
    where resolution_status = 'confirmed'
  )
  and (
    select count(*) = 1
    from public.user_subject_migration_candidates
    where resolution_status = 'dismissed'
  ),
  'mapped legacy choices are confirmed and unresolved choices are preserved as dismissed'
);

select public.save_recall_academic_profile(
  'science',
  'Example School',
  pg_temp.curriculum_selections(array['301', '042', '043', '044', '037'])
);

select ok(
  (
    select count(*) = 5
    from public.user_subjects
    where archived_at is null
  )
  and (
    select count(*) = 2
    from public.user_subjects
    where archived_at is not null
  ),
  'subject replacement archives removed selections and preserves active history'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000502',
  true
);

select ok(
  (select count(*) = 1 from public.user_academic_profiles)
  and (select count(*) = 0 from public.user_subjects)
  and (select count(*) = 0 from public.user_subject_migration_candidates),
  'another authenticated user cannot read the first user academic data'
);

select throws_ok(
  $statement$
    insert into public.user_subjects (
      user_id,
      curriculum_subject_id,
      subject_position,
      selection_type
    )
    values (
      '00000000-0000-0000-0000-000000000502',
      'cbse-2026-27-xi-042',
      2,
      'main'
    )
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot directly insert subject selections'
);

reset role;

select ok(
  not has_function_privilege(
    'authenticated',
    'recall_private.refresh_legacy_subject_candidates(uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot call the arbitrary-user private refresh function'
);

select * from finish();
rollback;
