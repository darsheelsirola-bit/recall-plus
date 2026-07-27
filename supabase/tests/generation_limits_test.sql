begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(33);

-- Auth users are inserted inside this transaction so the real signup trigger,
-- profile creation, timezone validation, and cascade relationships are tested.
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
  recovery_token
)
values
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000101',
  'authenticated',
  'authenticated',
  'generation-limit-one@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Limiter One","timezone":"Asia/Kolkata"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000102',
  'authenticated',
  'authenticated',
  'generation-limit-two@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Limiter Two"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
);

select ok(
  (
    select recall_profiles.timezone = 'Asia/Kolkata'
      and recall_profiles.timezone_initialized
    from public.recall_profiles
    where id = '00000000-0000-0000-0000-000000000101'
  ),
  'signup captures valid IANA timezone metadata as initialized'
);

select ok(
  (
    select recall_profiles.timezone = 'UTC'
      and not recall_profiles.timezone_initialized
    from public.recall_profiles
    where id = '00000000-0000-0000-0000-000000000102'
  ),
  'signup safely defaults missing timezone metadata to uninitialized UTC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.initialize_recall_timezone(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.initialize_recall_timezone(uuid,text)',
    'EXECUTE'
  )
  and has_column_privilege(
    'authenticated',
    'public.recall_profiles',
    'display_name',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.recall_profiles',
    'timezone',
    'UPDATE'
  )
  and not has_column_privilege(
    'authenticated',
    'public.recall_profiles',
    'timezone_initialized',
    'UPDATE'
  ),
  'authenticated clients initialize timezone only through the intended-user-bound one-time RPC'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000102',
  true
);

select is(
  public.initialize_recall_timezone(
    '00000000-0000-0000-0000-000000000102',
    'Asia/Kolkata'
  ),
  'Asia/Kolkata',
  'an authenticated user can initialize a missing timezone once'
);

select is(
  public.initialize_recall_timezone(
    '00000000-0000-0000-0000-000000000102',
    'UTC'
  ),
  'Asia/Kolkata',
  'a second initialization cannot hop timezone to reset limits'
);

select ok(
  exists (
    select 1
    from public.user_app_data
    where user_id = '00000000-0000-0000-0000-000000000101'
      and data = '{}'::jsonb
  ),
  'signup creates an empty user_app_data snapshot'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
set local role authenticated;

select ok(
  (
    select count(*) = 1
      and bool_and(user_id = '00000000-0000-0000-0000-000000000101')
    from public.user_app_data
  ),
  'an authenticated user can read only their own app-data snapshot'
);

select throws_ok(
  $statement$
    update public.user_app_data
    set data = '{"crossUserWrite":true}'::jsonb
    where user_id = '00000000-0000-0000-0000-000000000102'
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot bypass the snapshot CAS RPC with direct writes'
);

reset role;

select is(
  (
    select data
    from public.user_app_data
    where user_id = '00000000-0000-0000-0000-000000000102'
  ),
  '{}'::jsonb,
  'an authenticated user cannot update another user app-data snapshot'
);

select ok(
  (
    select count(*) = 6 and bool_and(classes.relrowsecurity)
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces
      on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relname in (
        'recall_profiles',
        'user_app_data',
        'daily_generation_usage',
        'generation_limit_state',
        'generation_attempts',
        'generation_attempt_rate_limits'
      )
  ),
  'RLS is enabled on every exposed Recall+ table'
);

select ok(
  not has_table_privilege('anon', 'public.daily_generation_usage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.daily_generation_usage', 'SELECT')
  and not has_table_privilege('authenticated', 'public.generation_limit_state', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.generation_attempts', 'INSERT'),
  'browser roles cannot read or mutate limiter internals'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_generation(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute the reservation RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_generation(uuid,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.commit_generation(uuid,text,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.release_generation(uuid,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_generation_status(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reserve_insight_generation(uuid,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.commit_insight_generation(uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.release_insight_generation(uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute any limiter RPC directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_generation(uuid,text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.commit_generation(uuid,text,uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.release_generation(uuid,text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_generation_status(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reserve_insight_generation(uuid,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.commit_insight_generation(uuid,uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.release_insight_generation(uuid,uuid,text)',
    'EXECUTE'
  ),
  'service_role can execute every limiter RPC'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc
    where oid in (
      'public.reserve_generation(uuid,text,uuid,text)'::regprocedure,
      'public.commit_generation(uuid,text,uuid,jsonb)'::regprocedure,
      'public.release_generation(uuid,text,uuid,text)'::regprocedure,
      'public.get_generation_status(uuid)'::regprocedure
    )
      and prosecdef
  ),
  'limiter RPCs use SECURITY INVOKER'
);

select ok(
  (status -> 'quiz' ->> 'remaining')::integer = 10
  and (status -> 'timetable' ->> 'remaining')::integer = 10,
  'quiz and timetable each begin with ten successful generations remaining'
)
from (
  select public.get_generation_status(
    '00000000-0000-0000-0000-000000000101'
  ) as status
) as initial_status;

select ok(
  (reservation ->> 'allowed')::boolean
  and (reservation ->> 'remaining')::integer = 10
  and (reservation ->> 'inProgress')::boolean
  and reservation ->> 'reservationId' = '00000000-0000-0000-0000-000000000201',
  'the first request reserves capacity without decrementing successful usage'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000201',
    repeat('a', 64)
  ) as reservation
) as reserved;

select is(
  (
    select count(*)::integer
    from public.generation_attempts
    where user_id = '00000000-0000-0000-0000-000000000101'
      and feature = 'quiz'
      and status = 'reserved'
  ),
  1,
  'exactly one quiz request is active'
);

select ok(
  not (reservation ->> 'allowed')::boolean
  and (reservation ->> 'inProgress')::boolean
  and reservation ->> 'reason' = 'in_progress',
  'a simultaneous quiz request is rejected before provider work'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000202',
    repeat('b', 64)
  ) as reservation
) as concurrent_reservation;

select ok(
  not exists (
    select 1
    from public.generation_attempts
    where request_id = '00000000-0000-0000-0000-000000000202'
  ),
  'the rejected simultaneous request does not create an attempt'
);

select ok(
  (completion ->> 'remaining')::integer = 9
  and completion -> 'result' = '{"questions":[{"id":"q1"}]}'::jsonb,
  'a validated committed result changes remaining calls from ten to nine'
)
from (
  select public.commit_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000201',
    '{"questions":[{"id":"q1"}]}'::jsonb
  ) as completion
) as committed;

select ok(
  (status -> 'quiz' ->> 'remaining')::integer = 9
  and (status -> 'timetable' ->> 'remaining')::integer = 10,
  'quiz usage does not affect timetable usage'
)
from (
  select public.get_generation_status(
    '00000000-0000-0000-0000-000000000101'
  ) as status
) as separate_status;

select ok(
  (replay ->> 'replay')::boolean
  and replay -> 'result' = '{"questions":[{"id":"q1"}]}'::jsonb
  and (replay ->> 'remaining')::integer = 9,
  'a completed request id replays its stored result without another reservation'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000201',
    repeat('a', 64)
  ) as replay
) as replayed;

select throws_ok(
  $statement$
    select public.reserve_generation(
      '00000000-0000-0000-0000-000000000101',
      'quiz',
      '00000000-0000-0000-0000-000000000201',
      repeat('e', 64)
    )
  $statement$,
  '23505',
  'Request id is already bound to a different request payload.',
  'an idempotency key cannot be replayed with a different request payload'
);

select ok(
  (reservation ->> 'allowed')::boolean,
  'a new request can reserve after the prior request completes'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000202',
    repeat('b', 64)
  ) as reservation
) as failed_request_reservation;

select ok(
  (released ->> 'remaining')::integer = 9
  and not (released ->> 'inProgress')::boolean
  and released ->> 'reason' = 'released',
  'a failed request releases its lease without decrementing remaining usage'
)
from (
  select public.release_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000202',
    'PROVIDER_FAILED'
  ) as released
) as failure_release;

select is(
  (
    select successful_count::integer
    from public.daily_generation_usage
    where user_id = '00000000-0000-0000-0000-000000000101'
      and feature = 'quiz'
      and local_date = (
        clock_timestamp() at time zone 'Asia/Kolkata'
      )::date
  ),
  1,
  'only the successful request is counted'
);

update public.daily_generation_usage
set successful_count = 10
where user_id = '00000000-0000-0000-0000-000000000101'
  and feature = 'quiz'
  and local_date = (
    clock_timestamp() at time zone 'Asia/Kolkata'
  )::date;

select ok(
  not (reservation ->> 'allowed')::boolean
  and reservation ->> 'reason' = 'daily_limit'
  and (reservation ->> 'remaining')::integer = 0,
  'the eleventh request is blocked at reservation time'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000101',
    'quiz',
    '00000000-0000-0000-0000-000000000203',
    repeat('c', 64)
  ) as reservation
) as eleventh_request;

select ok(
  not exists (
    select 1
    from public.generation_attempts
    where request_id = '00000000-0000-0000-0000-000000000203'
  ),
  'the blocked eleventh request never creates provider work'
);

select throws_ok(
  $statement$
    update public.recall_profiles
    set timezone = 'Mars/Olympus'
    where id = '00000000-0000-0000-0000-000000000101'
  $statement$,
  '22023',
  'Invalid IANA timezone: Mars/Olympus',
  'invalid profile timezones are rejected'
);

insert into public.daily_generation_usage (
  user_id,
  feature,
  local_date,
  successful_count
)
values (
  '00000000-0000-0000-0000-000000000102',
  'quiz',
  '2026-07-26',
  10
);

select ok(
  (
    recall_private.generation_feature_status(
      '00000000-0000-0000-0000-000000000102',
      'quiz',
      '2026-07-26 18:29:59+00'::timestamptz
    ) ->> 'remaining'
  )::integer = 0
  and (
    recall_private.generation_feature_status(
      '00000000-0000-0000-0000-000000000102',
      'quiz',
      '2026-07-26 18:30:00+00'::timestamptz
    ) ->> 'remaining'
  )::integer = 10
  and (
    recall_private.generation_feature_status(
      '00000000-0000-0000-0000-000000000102',
      'quiz',
      '2026-07-26 18:29:59+00'::timestamptz
    ) ->> 'resetAt'
  )::timestamptz = '2026-07-26 18:30:00+00'::timestamptz,
  'usage rolls over exactly at the next midnight in the profile timezone'
);

-- Model a timetable request admitted just before midnight. The reservation
-- normally creates these three rows; direct setup makes the boundary
-- deterministic without exposing a client-controlled clock on the public RPC.
insert into public.daily_generation_usage (
  user_id,
  feature,
  local_date,
  successful_count
)
values (
  '00000000-0000-0000-0000-000000000102',
  'timetable',
  '2026-07-26',
  0
);

insert into public.generation_attempts (
  request_id,
  request_hash,
  user_id,
  feature,
  local_date,
  status,
  reserved_at,
  expires_at
)
values (
  '00000000-0000-0000-0000-000000000204',
  repeat('d', 64),
  '00000000-0000-0000-0000-000000000102',
  'timetable',
  '2026-07-26',
  'reserved',
  '2026-07-26 18:29:50+00'::timestamptz,
  '2026-07-26 18:35:50+00'::timestamptz
);

insert into public.generation_limit_state (
  user_id,
  feature,
  active_request_id,
  active_expires_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000102',
  'timetable',
  '00000000-0000-0000-0000-000000000204',
  '2026-07-26 18:35:50+00'::timestamptz,
  '2026-07-26 18:29:50+00'::timestamptz
);

-- Execute the volatile commit in its own statement. Keeping the later table
-- assertions in the same SELECT can let PostgreSQL pre-evaluate uncorrelated
-- scalar subqueries before the commit function runs.
create temporary table recall_midnight_commit (
  completion jsonb not null
) on commit drop;

insert into recall_midnight_commit (completion)
select recall_private.commit_generation_at(
  '00000000-0000-0000-0000-000000000102',
  'timetable',
  '00000000-0000-0000-0000-000000000204',
  '{"blocks":[{"id":"after-midnight"}]}'::jsonb,
  '2026-07-26 18:30:00+00'::timestamptz
);

select ok(
  (completion ->> 'remaining')::integer = 9
  and (
    select successful_count
    from public.daily_generation_usage
    where user_id = '00000000-0000-0000-0000-000000000102'
      and feature = 'timetable'
      and local_date = '2026-07-26'
  ) = 0
  and (
    select successful_count
    from public.daily_generation_usage
    where user_id = '00000000-0000-0000-0000-000000000102'
      and feature = 'timetable'
      and local_date = '2026-07-27'
  ) = 1
  and (
    select local_date
    from public.generation_attempts
    where request_id = '00000000-0000-0000-0000-000000000204'
  ) = '2026-07-27',
  'a pre-midnight request is charged to the new local day when success commits after midnight'
)
from recall_midnight_commit;

select ok(
  has_column_privilege('authenticated', 'public.user_app_data', 'data', 'SELECT')
  and has_column_privilege('authenticated', 'public.user_app_data', 'version', 'SELECT')
  and not has_table_privilege('authenticated', 'public.user_app_data', 'INSERT')
  and not has_table_privilege('authenticated', 'public.user_app_data', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.user_app_data', 'DELETE')
  and has_function_privilege(
    'authenticated',
    'public.upsert_recall_app_data(uuid,jsonb,bigint)',
    'EXECUTE'
  )
  and not has_table_privilege('anon', 'public.user_app_data', 'SELECT'),
  'authenticated users read their RLS-protected snapshot and write only through the CAS RPC'
);

select * from finish();
rollback;
