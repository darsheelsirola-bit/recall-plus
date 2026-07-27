begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(35);

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
  '00000000-0000-0000-0000-000000000301',
  'authenticated',
  'authenticated',
  'hardening-one@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Hardening One","timezone":"Asia/Kolkata"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000302',
  'authenticated',
  'authenticated',
  'hardening-two@example.test',
  '',
  clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Hardening Two","timezone":"Asia/Kolkata"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
);

select is(
  (
    select version
    from public.user_app_data
    where user_id = '00000000-0000-0000-0000-000000000301'
  ),
  1::bigint,
  'signup snapshots begin at version one'
);

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
  and has_function_privilege(
    'authenticated',
    'public.initialize_recall_timezone(uuid,text)',
    'EXECUTE'
  )
  and to_regprocedure('public.upsert_recall_app_data(jsonb,bigint)') is null
  and to_regprocedure('public.initialize_recall_timezone(text)') is null,
  'authenticated snapshot and timezone access uses only intended-user-bound RPCs'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);
set local role authenticated;

select ok(
  (result ->> 'version')::bigint = 2
  and result -> 'data' = '{"alpha":1}'::jsonb,
  'the snapshot RPC increments the expected version atomically'
)
from (
  select public.upsert_recall_app_data(
    '00000000-0000-0000-0000-000000000301',
    '{"alpha":1}'::jsonb,
    1
  ) as result
) as written;

select throws_ok(
  $statement$
    select public.upsert_recall_app_data(
      '00000000-0000-0000-0000-000000000301',
      '{"stale":true}'::jsonb,
      1
    )
  $statement$,
  'P0001',
  'USER_DATA_VERSION_CONFLICT',
  'a stale snapshot version fails with a stable conflict code'
);

select throws_ok(
  $statement$
    select public.upsert_recall_app_data(
      '00000000-0000-0000-0000-000000000301',
      jsonb_build_object('blob', repeat('x', 1048577)),
      2
    )
  $statement$,
  '22023',
  'USER_DATA_TOO_LARGE',
  'the snapshot RPC rejects data over one MiB'
);

select throws_ok(
  $statement$
    select public.upsert_recall_app_data(
      '00000000-0000-0000-0000-000000000302',
      '{"crossAccount":true}'::jsonb,
      1
    )
  $statement$,
  '42501',
  'Authenticated session does not match intended user.',
  'the snapshot RPC rejects an intended user different from the JWT subject'
);

select throws_ok(
  $statement$
    select public.initialize_recall_timezone(
      '00000000-0000-0000-0000-000000000302',
      'UTC'
    )
  $statement$,
  '42501',
  'Authenticated session does not match intended user.',
  'the timezone RPC rejects an intended user different from the JWT subject'
);

select throws_ok(
  $statement$
    select public.initialize_recall_timezone(
      '00000000-0000-0000-0000-000000000301',
      repeat('attacker-controlled-timezone-', 20)
    )
  $statement$,
  '22023',
  'Invalid IANA timezone.',
  'the timezone RPC rejects oversized input without echoing it'
);

select throws_ok(
  $statement$
    update public.user_app_data
    set updated_at = '2000-01-01 00:00:00+00'::timestamptz
    where user_id = '00000000-0000-0000-0000-000000000301'
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot bypass CAS or tamper with audit timestamps'
);

reset role;

select is(
  (
    select data
    from public.user_app_data
    where user_id = '00000000-0000-0000-0000-000000000302'
  ),
  '{}'::jsonb,
  'the user-scoped snapshot RPC cannot modify another user snapshot'
);

delete from public.user_app_data
where user_id = '00000000-0000-0000-0000-000000000302';

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000302',
  true
);
set local role authenticated;

select ok(
  (result ->> 'version')::bigint = 1
  and result -> 'data' = '{"first":true}'::jsonb,
  'expected version zero inserts a missing snapshot'
)
from (
  select public.upsert_recall_app_data(
    '00000000-0000-0000-0000-000000000302',
    '{"first":true}'::jsonb,
    0
  ) as result
) as inserted;

select throws_ok(
  $statement$
    select public.upsert_recall_app_data(
      '00000000-0000-0000-0000-000000000302',
      '{"duplicate":true}'::jsonb,
      0
    )
  $statement$,
  'P0001',
  'USER_DATA_VERSION_CONFLICT',
  'expected version zero cannot overwrite an existing snapshot'
);

select throws_ok(
  $statement$
    insert into public.user_app_data (user_id, data)
    values (
      '00000000-0000-0000-0000-000000000302',
      '{"direct":true}'::jsonb
    )
  $statement$,
  '42501',
  null::text,
  'authenticated users cannot write snapshots directly'
);

reset role;

-- Twelve non-idempotent quiz attempts fit in one ten-minute bucket. Each is
-- released as failed, so none consumes the separate successful daily quota.
do $$
declare
  v_index integer;
  v_request_id uuid;
  v_reservation jsonb;
begin
  for v_index in 1..12 loop
    v_request_id := (
      '10000000-0000-4000-8000-'
      || lpad(v_index::text, 12, '0')
    )::uuid;
    v_reservation := public.reserve_generation(
      '00000000-0000-0000-0000-000000000301',
      'quiz',
      v_request_id,
      repeat('a', 64)
    );
    if not (v_reservation ->> 'allowed')::boolean then
      raise exception 'Expected attempt % to be reserved', v_index;
    end if;
    perform public.release_generation(
      '00000000-0000-0000-0000-000000000301',
      'quiz',
      v_request_id,
      'PROVIDER_FAILED'
    );
  end loop;
end;
$$;

select is(
  (
    select attempt_count
    from public.generation_attempt_rate_limits
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature = 'quiz'
  ),
  12::smallint,
  'twelve non-idempotent quiz reservations consume twelve attempt tokens'
);

select ok(
  (status -> 'quiz' ->> 'remaining')::integer = 10
  and (status -> 'timetable' ->> 'remaining')::integer = 10,
  'failed attempts leave both independent ten-success counters unchanged'
)
from (
  select public.get_generation_status(
    '00000000-0000-0000-0000-000000000301'
  ) as status
) as current_status;

select throws_ok(
  $statement$
    select public.reserve_generation(
      '00000000-0000-0000-0000-000000000301',
      'quiz',
      '10000000-0000-4000-8000-000000000013',
      repeat('b', 64)
    )
  $statement$,
  'P0001',
  'GENERATION_ATTEMPT_LIMIT',
  'the thirteenth non-idempotent quiz attempt is atomically throttled'
);

select ok(
  not exists (
    select 1
    from public.generation_attempts
    where request_id = '10000000-0000-4000-8000-000000000013'
  ),
  'a throttled request never creates provider work'
);

update public.generation_attempt_rate_limits
set window_started_at = clock_timestamp() - interval '11 minutes'
where user_id = '00000000-0000-0000-0000-000000000301'
  and feature = 'quiz';

select ok(
  (reservation ->> 'allowed')::boolean,
  'a new quiz attempt is accepted after the ten-minute window resets'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000301',
    'quiz',
    '10000000-0000-4000-8000-000000000014',
    repeat('c', 64)
  ) as reservation
) as reset_reservation;

do $$
begin
  perform public.release_generation(
    '00000000-0000-0000-0000-000000000301',
    'quiz',
    '10000000-0000-4000-8000-000000000014',
    'PROVIDER_FAILED'
  );
end;
$$;

select ok(
  (reservation ->> 'allowed')::boolean,
  'timetable attempts use an independent durable attempt bucket'
)
from (
  select public.reserve_generation(
    '00000000-0000-0000-0000-000000000301',
    'timetable',
    '20000000-0000-4000-8000-000000000001',
    repeat('d', 64)
  ) as reservation
) as timetable_reservation;

do $$
begin
  perform public.release_generation(
    '00000000-0000-0000-0000-000000000301',
    'timetable',
    '20000000-0000-4000-8000-000000000001',
    'PROVIDER_FAILED'
  );
end;
$$;

do $$
declare
  v_index integer;
  v_request_id uuid;
  v_reservation jsonb;
begin
  for v_index in 2..12 loop
    v_request_id := (
      '20000000-0000-4000-8000-'
      || lpad(v_index::text, 12, '0')
    )::uuid;
    v_reservation := public.reserve_generation(
      '00000000-0000-0000-0000-000000000301',
      'timetable',
      v_request_id,
      repeat('d', 64)
    );
    if not (v_reservation ->> 'allowed')::boolean then
      raise exception 'Expected timetable attempt % to be reserved', v_index;
    end if;
    perform public.release_generation(
      '00000000-0000-0000-0000-000000000301',
      'timetable',
      v_request_id,
      'PROVIDER_FAILED'
    );
  end loop;
end;
$$;

select is(
  (
    select attempt_count
    from public.generation_attempt_rate_limits
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature = 'timetable'
  ),
  12::smallint,
  'twelve non-idempotent timetable reservations consume twelve attempt tokens'
);

select throws_ok(
  $statement$
    select public.reserve_generation(
      '00000000-0000-0000-0000-000000000301',
      'timetable',
      '20000000-0000-4000-8000-000000000013',
      repeat('d', 64)
    )
  $statement$,
  'P0001',
  'GENERATION_ATTEMPT_LIMIT',
  'the thirteenth non-idempotent timetable attempt is atomically throttled'
);

select ok(
  (
    select count(*) = 2 and bool_and(successful_count = 0)
    from public.daily_generation_usage
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature in ('quiz', 'timetable')
  ),
  'failure attempt throttling never increments successful usage'
);

select ok(
  (reservation ->> 'allowed')::boolean
  and reservation ->> 'reason' = 'allowed',
  'the first insight context reserves provider work'
)
from (
  select public.reserve_insight_generation(
    '00000000-0000-0000-0000-000000000301',
    '30000000-0000-4000-8000-000000000001',
    repeat('e', 64)
  ) as reservation
) as insight_reservation;

select ok(
  completion ->> 'reason' = 'committed'
  and completion -> 'result' = '{"headline":"cached"}'::jsonb,
  'a bounded insight result is cached'
)
from (
  select public.commit_insight_generation(
    '00000000-0000-0000-0000-000000000301',
    '30000000-0000-4000-8000-000000000001',
    '{"headline":"cached"}'::jsonb
  ) as completion
) as insight_completion;

select ok(
  (replay ->> 'replay')::boolean
  and replay ->> 'reason' = 'replay'
  and replay -> 'result' = '{"headline":"cached"}'::jsonb,
  'identical insight context replays across a new idempotency key'
)
from (
  select public.reserve_insight_generation(
    '00000000-0000-0000-0000-000000000301',
    '30000000-0000-4000-8000-000000000002',
    repeat('e', 64)
  ) as replay
) as insight_replay;

select is(
  (
    select attempt_count
    from public.generation_attempt_rate_limits
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature = 'insights'
  ),
  1::smallint,
  'an insight cache replay does not consume another attempt token'
);

do $$
declare
  v_index integer;
  v_request_id uuid;
  v_request_hash text;
  v_reservation jsonb;
begin
  for v_index in 2..6 loop
    v_request_id := (
      '30000000-0000-4000-8000-'
      || lpad(v_index::text, 12, '0')
    )::uuid;
    v_request_hash := md5('insight-' || v_index::text)
      || md5('context-' || v_index::text);
    v_reservation := public.reserve_insight_generation(
      '00000000-0000-0000-0000-000000000301',
      v_request_id,
      v_request_hash
    );
    if not (v_reservation ->> 'allowed')::boolean then
      raise exception 'Expected insight attempt % to be reserved', v_index;
    end if;
    perform public.release_insight_generation(
      '00000000-0000-0000-0000-000000000301',
      v_request_id,
      'PROVIDER_FAILED'
    );
  end loop;
end;
$$;

select is(
  (
    select attempt_count
    from public.generation_attempt_rate_limits
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature = 'insights'
  ),
  6::smallint,
  'six non-idempotent insight reservations fill the protected attempt bucket'
);

select throws_ok(
  $statement$
    select public.reserve_insight_generation(
      '00000000-0000-0000-0000-000000000301',
      '30000000-0000-4000-8000-000000000007',
      repeat('7', 64)
    )
  $statement$,
  'P0001',
  'GENERATION_ATTEMPT_LIMIT',
  'the seventh non-idempotent insight attempt is atomically throttled'
);

select ok(
  not exists (
    select 1
    from public.daily_generation_usage
    where user_id = '00000000-0000-0000-0000-000000000301'
      and feature = 'insights'
  )
  and (
    public.get_generation_status(
      '00000000-0000-0000-0000-000000000301'
    ) -> 'quiz' ->> 'remaining'
  )::integer = 10
  and (
    public.get_generation_status(
      '00000000-0000-0000-0000-000000000301'
    ) -> 'timetable' ->> 'remaining'
  )::integer = 10,
  'insights never merge with either required successful daily counter'
);

insert into public.generation_attempts (
  request_id,
  request_hash,
  user_id,
  feature,
  local_date,
  status,
  error_code,
  reserved_at,
  completed_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  repeat('f', 64),
  '00000000-0000-0000-0000-000000000301',
  'quiz',
  current_date - 40,
  'failed',
  'OLD_FAILURE',
  clock_timestamp() - interval '40 days',
  clock_timestamp() - interval '40 days'
);

do $$
begin
  perform public.purge_generation_attempt_history();
end;
$$;

select ok(
  not exists (
    select 1
    from public.generation_attempts
    where request_id = '40000000-0000-4000-8000-000000000001'
  ),
  'the maintenance hook deletes expired attempt history'
);

select ok(
  to_regclass('public.generation_attempts_user_completed_idx') is not null
  and to_regclass('public.generation_attempts_insight_cache_idx') is not null,
  'retention and insight cache paths are indexed'
);

select ok(
  (
    select classes.relrowsecurity
    from pg_catalog.pg_class as classes
    where classes.oid = 'public.generation_attempt_rate_limits'::regclass
  ),
  'the exposed attempt bucket table has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.generation_attempt_rate_limits', 'SELECT')
  and not has_table_privilege('authenticated', 'public.generation_attempt_rate_limits', 'SELECT')
  and not has_table_privilege('authenticated', 'public.generation_attempt_rate_limits', 'INSERT')
  and not has_table_privilege('authenticated', 'public.generation_attempt_rate_limits', 'UPDATE'),
  'browser roles cannot read or mutate attempt buckets'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc
    where oid in (
      'public.reserve_insight_generation(uuid,uuid,text)'::regprocedure,
      'public.commit_insight_generation(uuid,uuid,jsonb)'::regprocedure,
      'public.release_insight_generation(uuid,uuid,text)'::regprocedure,
      'public.purge_generation_attempt_history()'::regprocedure
    )
      and prosecdef
  ),
  'insight and maintenance RPCs use SECURITY INVOKER'
);

create table public.recall_default_privilege_probe (
  id bigint generated always as identity primary key
);
create function public.recall_default_privilege_probe()
returns integer
language sql
as $$ select 1 $$;

select ok(
  not has_table_privilege('anon', 'public.recall_default_privilege_probe', 'SELECT')
  and not has_table_privilege('authenticated', 'public.recall_default_privilege_probe', 'SELECT')
  and not has_function_privilege(
    'anon',
    'public.recall_default_privilege_probe()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.recall_default_privilege_probe()',
    'EXECUTE'
  ),
  'future public tables and functions fail closed until explicitly granted'
);

select * from finish();
rollback;
