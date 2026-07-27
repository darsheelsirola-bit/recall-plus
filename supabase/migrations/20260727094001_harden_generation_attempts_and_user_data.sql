-- Recall+ follow-up hardening
--
-- This migration intentionally preserves the existing owner RLS policies and
-- the independent quiz/timetable limit of ten validated successes per local
-- day. It adds a separate attempt throttle, an idempotent insight cache,
-- bounded history retention, and conflict-safe user snapshot writes.

-- ---------------------------------------------------------------------------
-- Fail closed for future objects in the exposed public schema
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bind browser writes to the user identity intended by the caller
-- ---------------------------------------------------------------------------

-- The original one-argument function derived its target only from the token
-- attached when the request was dispatched. An account switch between a
-- browser-side guard and dispatch could therefore initialize the next
-- account. The explicit user id closes that time-of-check/time-of-use gap.
drop function if exists public.initialize_recall_timezone(text);

create function public.initialize_recall_timezone(
  p_user_id uuid,
  p_timezone text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := (select auth.uid());
  v_final_timezone text;
begin
  if v_authenticated_user_id is null
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_timezone is null or octet_length(p_timezone) > 128 then
    raise exception 'Invalid IANA timezone.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'Invalid IANA timezone.'
      using errcode = '22023';
  end if;

  update public.recall_profiles
  set
    timezone = p_timezone,
    timezone_initialized = true
  where id = p_user_id
    and timezone_initialized = false
  returning timezone into v_final_timezone;

  if found then
    return v_final_timezone;
  end if;

  select recall_profiles.timezone
  into v_final_timezone
  from public.recall_profiles
  where recall_profiles.id = p_user_id;
  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id
      using errcode = '23503';
  end if;

  return v_final_timezone;
end;
$$;

comment on function public.initialize_recall_timezone(uuid, text) is
  'Initializes the explicitly named authenticated user IANA timezone once and returns the final stored timezone.';
revoke all on function public.initialize_recall_timezone(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_recall_timezone(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Versioned, size-bounded user snapshots
-- ---------------------------------------------------------------------------

alter table public.user_app_data
  add column if not exists version bigint not null default 1;

alter table public.user_app_data
  add constraint user_app_data_version_check
    check (version >= 1);

-- NOT VALID avoids making deployment depend on the size of historical rows.
-- PostgreSQL still enforces the constraint for every new or updated snapshot,
-- and the write RPC below performs the same check before writing.
alter table public.user_app_data
  add constraint user_app_data_size_check
    check (octet_length(data::text) <= 1048576)
    not valid;

revoke all on table public.user_app_data from authenticated;
grant select (user_id, data, version, created_at, updated_at)
  on table public.user_app_data to authenticated;

drop function if exists public.upsert_recall_app_data(jsonb, bigint);

create function public.upsert_recall_app_data(
  p_user_id uuid,
  p_data jsonb,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := (select auth.uid());
  v_row public.user_app_data%rowtype;
begin
  if v_authenticated_user_id is null
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Snapshot data must be a JSON object.' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 1048576 then
    raise exception 'USER_DATA_TOO_LARGE'
      using
        errcode = '22023',
        detail = '{"maxBytes":1048576}';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Expected snapshot version must be zero or greater.'
      using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.user_app_data (user_id, data, version)
    values (p_user_id, p_data, 1)
    on conflict (user_id) do nothing
    returning * into v_row;
  else
    update public.user_app_data
    set
      data = p_data,
      version = version + 1
    where user_id = p_user_id
      and version = p_expected_version
    returning * into v_row;
  end if;

  if not found then
    raise exception 'USER_DATA_VERSION_CONFLICT'
      using
        errcode = 'P0001',
        detail = jsonb_build_object(
          'expectedVersion', p_expected_version,
          'currentVersion', (
            select app_data.version
            from public.user_app_data as app_data
            where app_data.user_id = p_user_id
          )
        )::text;
  end if;

  return jsonb_build_object(
    'data', v_row.data,
    'version', v_row.version,
    'updatedAt', v_row.updated_at
  );
end;
$$;

comment on function public.upsert_recall_app_data(uuid, jsonb, bigint) is
  'Writes the explicitly named authenticated user snapshot only when its expected version matches, preventing cross-account and last-write-wins data loss.';

revoke all on function public.upsert_recall_app_data(uuid, jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_recall_app_data(uuid, jsonb, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Durable attempt throttle and bounded generation history
-- ---------------------------------------------------------------------------

alter table public.generation_limit_state
  drop constraint generation_limit_state_feature_check;
alter table public.generation_limit_state
  add constraint generation_limit_state_feature_check
    check (feature in ('quiz', 'timetable', 'insights'));

alter table public.generation_attempts
  drop constraint generation_attempts_feature_check;
alter table public.generation_attempts
  add constraint generation_attempts_feature_check
    check (feature in ('quiz', 'timetable', 'insights'));
alter table public.generation_attempts
  add constraint generation_attempts_result_size_check
    check (result is null or octet_length(result::text) <= 131072)
    not valid;

create index if not exists generation_attempts_user_completed_idx
  on public.generation_attempts (user_id, completed_at)
  where completed_at is not null;
create index if not exists generation_attempts_insight_cache_idx
  on public.generation_attempts (user_id, request_hash, completed_at desc)
  where feature = 'insights' and status = 'succeeded';

create table public.generation_attempt_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  window_started_at timestamptz not null,
  attempt_count smallint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, feature),
  constraint generation_attempt_rate_limits_feature_check
    check (feature in ('quiz', 'timetable', 'insights')),
  constraint generation_attempt_rate_limits_count_check
    check (attempt_count >= 1)
);

comment on table public.generation_attempt_rate_limits is
  'Atomic per-user AI attempt bucket. This is deliberately separate from successful daily quiz and timetable usage.';

alter table public.generation_attempt_rate_limits enable row level security;
revoke all on table public.generation_attempt_rate_limits from public, anon, authenticated;
grant select, insert, update, delete
  on table public.generation_attempt_rate_limits to service_role;

create or replace function recall_private.prune_generation_history_for_user(
  p_user_id uuid,
  p_now timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.generation_attempts
  where user_id = p_user_id
    and completed_at is not null
    and (
      (status = 'failed' and completed_at < p_now - interval '7 days')
      or
      (
        status = 'succeeded'
        and feature = 'insights'
        and completed_at < p_now - interval '2 days'
      )
      or
      (
        status = 'succeeded'
        and feature in ('quiz', 'timetable')
        and completed_at < p_now - interval '30 days'
      )
    );
$$;

revoke all on function recall_private.prune_generation_history_for_user(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function recall_private.prune_generation_history_for_user(uuid, timestamptz)
  to service_role;

create or replace function recall_private.enforce_generation_attempt_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit smallint := case when new.feature = 'insights' then 6 else 12 end;
  v_window interval := interval '10 minutes';
  v_bucket public.generation_attempt_rate_limits%rowtype;
begin
  perform recall_private.prune_generation_history_for_user(new.user_id, v_now);

  insert into public.generation_attempt_rate_limits (
    user_id,
    feature,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (new.user_id, new.feature, v_now, 1, v_now)
  on conflict (user_id, feature) do update
  set
    window_started_at = case
      when generation_attempt_rate_limits.window_started_at <= v_now - v_window
        then v_now
      else generation_attempt_rate_limits.window_started_at
    end,
    attempt_count = case
      when generation_attempt_rate_limits.window_started_at <= v_now - v_window
        then 1
      else generation_attempt_rate_limits.attempt_count + 1
    end,
    updated_at = v_now
  where generation_attempt_rate_limits.window_started_at <= v_now - v_window
    or generation_attempt_rate_limits.attempt_count < v_limit
  returning * into v_bucket;

  if not found then
    select limits.*
    into strict v_bucket
    from public.generation_attempt_rate_limits as limits
    where limits.user_id = new.user_id
      and limits.feature = new.feature;

    raise exception 'GENERATION_ATTEMPT_LIMIT'
      using
        errcode = 'P0001',
        detail = jsonb_build_object(
          'attemptLimit', v_limit,
          'attemptWindowSeconds', extract(epoch from v_window)::integer,
          'retryAt', v_bucket.window_started_at + v_window
        )::text;
  end if;

  return new;
end;
$$;

revoke all on function recall_private.enforce_generation_attempt_limit()
  from public, anon, authenticated;
grant execute on function recall_private.enforce_generation_attempt_limit()
  to service_role;

create trigger generation_attempts_enforce_rate_limit
  before insert on public.generation_attempts
  for each row
  when (new.status = 'reserved')
  execute function recall_private.enforce_generation_attempt_limit();

create or replace function public.purge_generation_attempt_history()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_deleted bigint;
  v_bucket_deleted bigint;
begin
  delete from public.generation_attempts
  where completed_at is not null
    and (
      (status = 'failed' and completed_at < v_now - interval '7 days')
      or
      (
        status = 'succeeded'
        and feature = 'insights'
        and completed_at < v_now - interval '2 days'
      )
      or
      (
        status = 'succeeded'
        and feature in ('quiz', 'timetable')
        and completed_at < v_now - interval '30 days'
      )
    );
  get diagnostics v_deleted = row_count;

  delete from public.generation_attempt_rate_limits
  where updated_at < v_now - interval '2 days';
  get diagnostics v_bucket_deleted = row_count;

  return v_deleted + v_bucket_deleted;
end;
$$;

comment on function public.purge_generation_attempt_history() is
  'Service-role maintenance hook for deleting expired attempt history and stale attempt buckets; active users are also pruned opportunistically.';
revoke all on function public.purge_generation_attempt_history()
  from public, anon, authenticated, service_role;
grant execute on function public.purge_generation_attempt_history()
  to service_role;

-- ---------------------------------------------------------------------------
-- Idempotent, throttled insight generation without a successful daily quota
-- ---------------------------------------------------------------------------

create or replace function public.reserve_insight_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_timezone text;
  v_local_date date;
  v_state public.generation_limit_state%rowtype;
  v_attempt public.generation_attempts%rowtype;
begin
  if p_user_id is null or p_request_id is null or p_request_hash is null then
    raise exception 'A verified user id, request id, and request hash are required.'
      using errcode = '22023';
  end if;
  if char_length(p_request_hash) <> 64
    or p_request_hash !~ '^[0-9a-f]+$' then
    raise exception 'Request hash must be a 64-character lowercase hexadecimal SHA-256.'
      using errcode = '22023';
  end if;

  select recall_profiles.timezone
  into v_timezone
  from public.recall_profiles
  where recall_profiles.id = p_user_id;
  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id
      using errcode = '23503';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    raise exception 'Stored profile timezone is invalid for user %', p_user_id
      using errcode = '22023';
  end if;
  v_local_date := (v_now at time zone v_timezone)::date;

  insert into public.generation_limit_state (user_id, feature)
  values (p_user_id, 'insights')
  on conflict (user_id, feature) do nothing;

  select state.*
  into strict v_state
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = 'insights'
  for update;

  if v_state.active_request_id is not null
    and v_state.active_expires_at <= v_now then
    update public.generation_attempts
    set
      status = 'failed',
      error_code = 'RESERVATION_EXPIRED',
      expires_at = null,
      completed_at = v_now
    where request_id = v_state.active_request_id
      and user_id = p_user_id
      and feature = 'insights'
      and status = 'reserved';

    update public.generation_limit_state
    set
      active_request_id = null,
      active_expires_at = null,
      updated_at = v_now
    where user_id = p_user_id
      and feature = 'insights';
    v_state.active_request_id := null;
    v_state.active_expires_at := null;
  end if;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;

  if found then
    if v_attempt.user_id <> p_user_id or v_attempt.feature <> 'insights' then
      raise exception 'Request id is already owned by another generation.'
        using errcode = '23505';
    end if;
    if v_attempt.request_hash is distinct from p_request_hash then
      raise exception 'Request id is already bound to a different request payload.'
        using errcode = '23505';
    end if;
    if v_attempt.status = 'succeeded' then
      return jsonb_build_object(
        'allowed', true,
        'reservationId', v_attempt.request_id,
        'inProgress', false,
        'reason', 'replay',
        'replay', true,
        'result', v_attempt.result
      );
    end if;
    if v_attempt.status = 'reserved' then
      return jsonb_build_object(
        'allowed', false,
        'reservationId', v_attempt.request_id,
        'inProgress', true,
        'reason', 'in_progress',
        'replay', false,
        'result', null
      );
    end if;
    return jsonb_build_object(
      'allowed', false,
      'reservationId', v_attempt.request_id,
      'inProgress', false,
      'reason', 'request_failed',
      'replay', false,
      'result', null
    );
  end if;

  -- Cache identical normalized context for 24 hours, even if a caller lost
  -- the original idempotency key.
  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.user_id = p_user_id
    and attempt.feature = 'insights'
    and attempt.request_hash = p_request_hash
    and attempt.status = 'succeeded'
    and attempt.completed_at >= v_now - interval '24 hours'
  order by attempt.completed_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'reservationId', v_attempt.request_id,
      'inProgress', false,
      'reason', 'replay',
      'replay', true,
      'result', v_attempt.result
    );
  end if;

  if v_state.active_request_id is not null
    and v_state.active_expires_at > v_now then
    return jsonb_build_object(
      'allowed', false,
      'reservationId', v_state.active_request_id,
      'inProgress', true,
      'reason', 'in_progress',
      'replay', false,
      'result', null
    );
  end if;

  update public.generation_attempts
  set
    status = 'failed',
    error_code = 'RESERVATION_EXPIRED',
    expires_at = null,
    completed_at = v_now
  where user_id = p_user_id
    and feature = 'insights'
    and status = 'reserved'
    and expires_at <= v_now;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.user_id = p_user_id
    and attempt.feature = 'insights'
    and attempt.status = 'reserved'
    and attempt.expires_at > v_now
  limit 1
  for update;

  if found then
    update public.generation_limit_state
    set
      active_request_id = v_attempt.request_id,
      active_expires_at = v_attempt.expires_at,
      updated_at = v_now
    where user_id = p_user_id
      and feature = 'insights';
    return jsonb_build_object(
      'allowed', false,
      'reservationId', v_attempt.request_id,
      'inProgress', true,
      'reason', 'in_progress',
      'replay', false,
      'result', null
    );
  end if;

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
    p_request_id,
    p_request_hash,
    p_user_id,
    'insights',
    v_local_date,
    'reserved',
    v_now,
    v_now + interval '6 minutes'
  );

  update public.generation_limit_state
  set
    active_request_id = p_request_id,
    active_expires_at = v_now + interval '6 minutes',
    updated_at = v_now
  where user_id = p_user_id
    and feature = 'insights';

  return jsonb_build_object(
    'allowed', true,
    'reservationId', p_request_id,
    'inProgress', true,
    'reason', 'allowed',
    'replay', false,
    'result', null
  );
end;
$$;

create or replace function public.commit_insight_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt public.generation_attempts%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'A verified user id and request id are required.'
      using errcode = '22023';
  end if;
  if p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or octet_length(p_result::text) > 131072 then
    raise exception 'A bounded JSON object result is required.'
      using errcode = '22023';
  end if;

  perform 1
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = 'insights'
  for update;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;

  if not found then
    raise exception 'Insight generation reservation not found.'
      using errcode = 'P0002';
  end if;
  if v_attempt.user_id <> p_user_id or v_attempt.feature <> 'insights' then
    raise exception 'Request id is owned by another generation.'
      using errcode = '23505';
  end if;
  if v_attempt.status = 'succeeded' then
    return jsonb_build_object(
      'allowed', true,
      'reservationId', p_request_id,
      'inProgress', false,
      'reason', 'replay',
      'replay', true,
      'result', v_attempt.result
    );
  end if;
  if v_attempt.status <> 'reserved' then
    raise exception 'Only a reserved insight generation can be committed.'
      using errcode = '55000';
  end if;

  update public.generation_attempts
  set
    status = 'succeeded',
    result = p_result,
    error_code = null,
    expires_at = null,
    completed_at = v_now
  where request_id = p_request_id;

  update public.generation_limit_state
  set
    active_request_id = null,
    active_expires_at = null,
    updated_at = v_now
  where user_id = p_user_id
    and feature = 'insights'
    and active_request_id = p_request_id;

  return jsonb_build_object(
    'allowed', true,
    'reservationId', p_request_id,
    'inProgress', false,
    'reason', 'committed',
    'replay', false,
    'result', p_result
  );
end;
$$;

create or replace function public.release_insight_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_error_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempt public.generation_attempts%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'A verified user id and request id are required.'
      using errcode = '22023';
  end if;

  perform 1
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = 'insights'
  for update;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;

  if found then
    if v_attempt.user_id <> p_user_id or v_attempt.feature <> 'insights' then
      raise exception 'Request id is owned by another generation.'
        using errcode = '23505';
    end if;
    if v_attempt.status = 'succeeded' then
      return jsonb_build_object(
        'allowed', true,
        'reservationId', p_request_id,
        'inProgress', false,
        'reason', 'replay',
        'replay', true,
        'result', v_attempt.result
      );
    end if;
    if v_attempt.status = 'reserved' then
      update public.generation_attempts
      set
        status = 'failed',
        result = null,
        error_code = left(coalesce(nullif(p_error_code, ''), 'GENERATION_FAILED'), 120),
        expires_at = null,
        completed_at = v_now
      where request_id = p_request_id;
    end if;
  end if;

  update public.generation_limit_state
  set
    active_request_id = null,
    active_expires_at = null,
    updated_at = v_now
  where user_id = p_user_id
    and feature = 'insights'
    and active_request_id = p_request_id;

  return jsonb_build_object(
    'allowed', false,
    'reservationId', p_request_id,
    'inProgress', false,
    'reason', 'released',
    'replay', false,
    'result', null
  );
end;
$$;

comment on function public.reserve_insight_generation(uuid, uuid, text) is
  'Reserves one throttled insight request and replays identical successful context for 24 hours.';
comment on function public.commit_insight_generation(uuid, uuid, jsonb) is
  'Stores a bounded insight result for idempotent replay without affecting quiz or timetable success counters.';
comment on function public.release_insight_generation(uuid, uuid, text) is
  'Releases a failed insight reservation without any successful-generation quota effect.';

revoke all on function public.reserve_insight_generation(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_insight_generation(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.release_insight_generation(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_insight_generation(uuid, uuid, text)
  to service_role;
grant execute on function public.commit_insight_generation(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.release_insight_generation(uuid, uuid, text)
  to service_role;
