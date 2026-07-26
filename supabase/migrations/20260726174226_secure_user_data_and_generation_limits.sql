-- Recall+ authenticated data and successful-generation limits.
--
-- Design invariants:
--   * Quiz and timetable counters are independent.
--   * A reservation is acquired transactionally before the AI provider runs.
--   * Only a validated result committed by the server increments usage.
--   * One active request per user/feature prevents concurrent-tab bypass.
--   * A local calendar day is derived from recall_profiles.timezone.
--   * Successful results are retained by request id for idempotent replay.
--   * Every request id is permanently bound to one canonical payload hash.
--   * Browser roles cannot mutate counters or execute limiter RPCs directly.
--
-- The AI call itself must remain outside these short database transactions.

create schema if not exists recall_private;
revoke all on schema recall_private from public, anon, authenticated;
grant usage on schema recall_private to service_role;

-- ---------------------------------------------------------------------------
-- Authenticated profile and user-owned application snapshot
-- ---------------------------------------------------------------------------

create table if not exists public.recall_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  timezone_initialized boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint recall_profiles_display_name_length_check
    check (display_name is null or char_length(display_name) <= 120)
);

comment on table public.recall_profiles is
  'Recall+ profile data. timezone is captured at signup or through one authenticated one-time initialization.';
comment on column public.recall_profiles.timezone is
  'Validated IANA timezone used to calculate the user local day and next midnight.';
comment on column public.recall_profiles.timezone_initialized is
  'False only until a valid user timezone is captured; prevents later timezone hopping to reset generation limits.';

create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_app_data_object_check check (jsonb_typeof(data) = 'object')
);

comment on table public.user_app_data is
  'One user-owned JSON snapshot for synchronizing Recall+ application data across sessions and devices.';

-- Generic updated_at trigger used by user-editable tables.
create or replace function public.set_recall_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_recall_updated_at() from public, anon, authenticated;

-- Validate timezone names against PostgreSQL's installed IANA timezone catalog.
-- A trigger is used because PostgreSQL check constraints cannot contain a
-- subquery against pg_timezone_names.
create or replace function public.validate_recall_profile_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = new.timezone
  ) then
    raise exception 'Invalid IANA timezone: %', coalesce(new.timezone, '<null>')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_recall_profile_timezone() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'recall_profiles_validate_timezone'
      and tgrelid = 'public.recall_profiles'::regclass
      and not tgisinternal
  ) then
    create trigger recall_profiles_validate_timezone
      before insert or update of timezone on public.recall_profiles
      for each row execute function public.validate_recall_profile_timezone();
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'recall_profiles_set_updated_at'
      and tgrelid = 'public.recall_profiles'::regclass
      and not tgisinternal
  ) then
    create trigger recall_profiles_set_updated_at
      before update on public.recall_profiles
      for each row execute function public.set_recall_updated_at();
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'user_app_data_set_updated_at'
      and tgrelid = 'public.user_app_data'::regclass
      and not tgisinternal
  ) then
    create trigger user_app_data_set_updated_at
      before update on public.user_app_data
      for each row execute function public.set_recall_updated_at();
  end if;
end;
$$;

-- Auth owns auth.users, so the trigger function must be SECURITY DEFINER.
-- Its empty search_path and fully-qualified objects prevent search-path attacks.
-- User metadata is used only for non-authoritative presentation/timezone input;
-- the timezone is validated before it is persisted.
create or replace function public.handle_new_recall_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone_candidate text;
  v_timezone text;
  v_timezone_initialized boolean;
  v_display_name text;
begin
  v_timezone_candidate := nullif(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'timezone'),
    ''
  );
  v_timezone_initialized := v_timezone_candidate is not null and exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_timezone_candidate
  );
  v_timezone := case
    when v_timezone_initialized then v_timezone_candidate
    else 'UTC'
  end;

  v_display_name := left(
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), ''),
      'Student'
    ),
    120
  );

  insert into public.recall_profiles (
    id,
    display_name,
    timezone,
    timezone_initialized
  )
  values (new.id, v_display_name, v_timezone, v_timezone_initialized)
  on conflict (id) do nothing;

  insert into public.user_app_data (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_recall_user() from public, anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'on_auth_user_created_create_recall_data'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created_create_recall_data
      after insert on auth.users
      for each row execute function public.handle_new_recall_user();
  end if;
end;
$$;

-- Backfill users that existed before this migration without overwriting any
-- profile or application data already present.
insert into public.recall_profiles (
  id,
  display_name,
  timezone,
  timezone_initialized
)
select
  users.id,
  left(
    coalesce(
      nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.split_part(coalesce(users.email, ''), '@', 1), ''),
      'Student'
    ),
    120
  ),
  case
    when exists (
      select 1
      from pg_catalog.pg_timezone_names
      where name = nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'timezone'), '')
    )
      then pg_catalog.btrim(users.raw_user_meta_data ->> 'timezone')
    else 'UTC'
  end,
  exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'timezone'), '')
  )
from auth.users as users
on conflict (id) do nothing;

insert into public.user_app_data (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

alter table public.recall_profiles enable row level security;
alter table public.user_app_data enable row level security;

create policy "recall_profiles_select_own"
on public.recall_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "recall_profiles_update_own"
on public.recall_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "user_app_data_select_own"
on public.user_app_data
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "user_app_data_insert_own"
on public.user_app_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_app_data_update_own"
on public.user_app_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_app_data_delete_own"
on public.user_app_data
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.recall_profiles from anon, authenticated;
revoke all on table public.user_app_data from anon, authenticated;
grant select on table public.recall_profiles to authenticated;
grant update (display_name) on table public.recall_profiles to authenticated;
grant select, insert, update, delete on table public.user_app_data to authenticated;
grant select, insert, update, delete on table public.recall_profiles, public.user_app_data to service_role;

-- Existing users may predate timezone metadata. This authenticated RPC permits
-- exactly one validated initialization and never exposes direct UPDATE access
-- to timezone columns. SECURITY DEFINER is necessary for that narrow
-- column-level write; auth.uid() and the false->true predicate enforce owner
-- scope and one-time behavior.
create or replace function public.initialize_recall_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_final_timezone text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to initialize timezone.'
      using errcode = '42501';
  end if;
  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = p_timezone
  ) then
    raise exception 'Invalid IANA timezone: %', coalesce(p_timezone, '<null>')
      using errcode = '22023';
  end if;

  update public.recall_profiles
  set
    timezone = p_timezone,
    timezone_initialized = true
  where id = v_user_id
    and timezone_initialized = false
  returning timezone into v_final_timezone;

  if found then
    return v_final_timezone;
  end if;

  select recall_profiles.timezone
  into v_final_timezone
  from public.recall_profiles
  where recall_profiles.id = v_user_id;
  if not found then
    raise exception 'Recall+ profile not found for user %', v_user_id
      using errcode = '23503';
  end if;

  return v_final_timezone;
end;
$$;

comment on function public.initialize_recall_timezone(text) is
  'Initializes the authenticated user IANA timezone once and returns the final stored timezone.';

revoke all on function public.initialize_recall_timezone(text)
  from public, anon, service_role;
grant execute on function public.initialize_recall_timezone(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Daily successful-generation counters and reservation state
-- ---------------------------------------------------------------------------

create table if not exists public.daily_generation_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  local_date date not null,
  successful_count smallint not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, feature, local_date),
  constraint daily_generation_usage_feature_check
    check (feature in ('quiz', 'timetable')),
  constraint daily_generation_usage_count_check
    check (successful_count between 0 and 10)
);

comment on table public.daily_generation_usage is
  'Authoritative count of validated successful generations per user, feature, and user-local calendar day.';

create table if not exists public.generation_limit_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  active_request_id uuid,
  active_expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, feature),
  constraint generation_limit_state_feature_check
    check (feature in ('quiz', 'timetable')),
  constraint generation_limit_state_active_pair_check
    check (
      (active_request_id is null and active_expires_at is null)
      or
      (active_request_id is not null and active_expires_at is not null)
    )
);

comment on table public.generation_limit_state is
  'Stable per-user/feature row locked by limiter RPCs; its active lease provides cross-tab single-flight behavior.';

create table if not exists public.generation_attempts (
  request_id uuid primary key,
  request_hash text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  local_date date not null,
  status text not null default 'reserved',
  result jsonb,
  error_code text,
  reserved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  completed_at timestamptz,
  constraint generation_attempts_feature_check
    check (feature in ('quiz', 'timetable')),
  constraint generation_attempts_status_check
    check (status in ('reserved', 'succeeded', 'failed')),
  constraint generation_attempts_request_hash_check
    check (
      char_length(request_hash) = 64
      and request_hash ~ '^[0-9a-f]+$'
    ),
  constraint generation_attempts_error_code_length_check
    check (error_code is null or char_length(error_code) <= 120),
  constraint generation_attempts_state_check
    check (
      (status = 'reserved' and expires_at is not null and completed_at is null and result is null)
      or
      (status = 'succeeded' and expires_at is null and completed_at is not null and result is not null)
      or
      (status = 'failed' and expires_at is null and completed_at is not null and result is null)
    )
);

comment on table public.generation_attempts is
  'Reservation lifecycle and replay cache. A succeeded request id returns its stored result without another AI call.';
comment on column public.generation_attempts.request_hash is
  'Lowercase hexadecimal SHA-256 of the canonical generation request payload; permanently binds an idempotency key to one payload.';

-- Supports fast auth-user cascades/history queries. Composite primary keys on
-- the other limiter tables already begin with user_id.
create index if not exists generation_attempts_user_id_idx
  on public.generation_attempts (user_id);

-- Defense in depth: even if a future caller forgets to consult the state row,
-- PostgreSQL still permits at most one reserved request per user/feature.
create unique index if not exists generation_attempts_one_reserved_per_feature_idx
  on public.generation_attempts (user_id, feature)
  where status = 'reserved';

alter table public.daily_generation_usage enable row level security;
alter table public.generation_limit_state enable row level security;
alter table public.generation_attempts enable row level security;

-- No browser policies are intentionally created for limiter internals.
revoke all on table
  public.daily_generation_usage,
  public.generation_limit_state,
  public.generation_attempts
from anon, authenticated;

grant select, insert, update, delete on table
  public.daily_generation_usage,
  public.generation_limit_state,
  public.generation_attempts
to service_role;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function recall_private.generation_feature_status(
  p_user_id uuid,
  p_feature text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_date date;
  v_reset_at timestamptz;
  v_used integer := 0;
  v_remaining integer;
  v_active_request_id uuid;
  v_active_expires_at timestamptz;
  v_in_progress boolean := false;
  v_reason text;
begin
  if p_user_id is null then
    raise exception 'A verified user id is required.' using errcode = '22023';
  end if;
  if p_feature not in ('quiz', 'timetable') then
    raise exception 'Unsupported generation feature: %', p_feature using errcode = '22023';
  end if;

  select recall_profiles.timezone
  into v_timezone
  from public.recall_profiles
  where recall_profiles.id = p_user_id;

  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id using errcode = '23503';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_timezone
  ) then
    raise exception 'Stored profile timezone is invalid for user %', p_user_id using errcode = '22023';
  end if;

  v_local_date := (p_now at time zone v_timezone)::date;
  v_reset_at := ((v_local_date + 1)::timestamp at time zone v_timezone);

  select usage.successful_count
  into v_used
  from public.daily_generation_usage as usage
  where usage.user_id = p_user_id
    and usage.feature = p_feature
    and usage.local_date = v_local_date;
  v_used := coalesce(v_used, 0);
  v_remaining := greatest(0, 10 - v_used);

  select state.active_request_id, state.active_expires_at
  into v_active_request_id, v_active_expires_at
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = p_feature;

  v_in_progress := (
    v_active_request_id is not null
    and v_active_expires_at is not null
    and v_active_expires_at > p_now
  );
  v_reason := case
    when v_remaining = 0 then 'daily_limit'
    when v_in_progress then 'in_progress'
    else 'status'
  end;

  return jsonb_build_object(
    'allowed', v_remaining > 0 and not v_in_progress,
    'reservationId', case when v_in_progress then v_active_request_id else null end,
    'remaining', v_remaining,
    'used', v_used,
    'limit', 10,
    'resetAt', v_reset_at,
    'localDate', v_local_date,
    'inProgress', v_in_progress,
    'reason', v_reason,
    'replay', false,
    'result', null
  );
end;
$$;

revoke all on function recall_private.generation_feature_status(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function recall_private.generation_feature_status(uuid, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Service-role-only limiter RPCs
-- ---------------------------------------------------------------------------

create or replace function public.reserve_generation(
  p_user_id uuid,
  p_feature text,
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
  v_count integer;
  v_state public.generation_limit_state%rowtype;
  v_attempt public.generation_attempts%rowtype;
  v_status jsonb;
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
  if p_feature not in ('quiz', 'timetable') then
    raise exception 'Unsupported generation feature: %', p_feature using errcode = '22023';
  end if;

  select recall_profiles.timezone
  into v_timezone
  from public.recall_profiles
  where recall_profiles.id = p_user_id;
  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id using errcode = '23503';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    raise exception 'Stored profile timezone is invalid for user %', p_user_id using errcode = '22023';
  end if;
  v_local_date := (v_now at time zone v_timezone)::date;

  -- The state row is the first lock acquired by reserve/commit/release. Keeping
  -- this order consistent prevents deadlocks and serializes all requests for
  -- the same user/feature without holding a lock during the external AI call.
  insert into public.generation_limit_state (user_id, feature)
  values (p_user_id, p_feature)
  on conflict (user_id, feature) do nothing;

  select state.*
  into strict v_state
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = p_feature
  for update;

  -- Recover an abandoned reservation after its six-minute lease. The lease is
  -- intentionally longer than the serverless function's 300-second ceiling.
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
      and feature = p_feature
      and status = 'reserved';

    update public.generation_limit_state
    set
      active_request_id = null,
      active_expires_at = null,
      updated_at = v_now
    where user_id = p_user_id
      and feature = p_feature;
    v_state.active_request_id := null;
    v_state.active_expires_at := null;
  end if;

  -- Request ids are idempotency keys permanently bound to the canonical
  -- request payload hash. A completed id is replayed, while an existing
  -- reserved/failed id never starts a second provider call.
  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;

  if found then
    if v_attempt.user_id <> p_user_id or v_attempt.feature <> p_feature then
      raise exception 'Request id is already owned by another generation.'
        using errcode = '23505';
    end if;
    if v_attempt.request_hash is distinct from p_request_hash then
      raise exception 'Request id is already bound to a different request payload.'
        using errcode = '23505';
    end if;

    v_status := recall_private.generation_feature_status(p_user_id, p_feature, v_now);
    if v_attempt.status = 'succeeded' then
      return v_status || jsonb_build_object(
        'allowed', true,
        'reservationId', p_request_id,
        'reason', 'replay',
        'replay', true,
        'result', v_attempt.result
      );
    end if;
    if v_attempt.status = 'reserved' then
      return v_status || jsonb_build_object(
        'allowed', false,
        'reservationId', p_request_id,
        'inProgress', true,
        'reason', 'in_progress'
      );
    end if;
    return v_status || jsonb_build_object(
      'allowed', false,
      'reservationId', p_request_id,
      'reason', 'request_failed'
    );
  end if;

  if v_state.active_request_id is not null
    and v_state.active_expires_at > v_now then
    return recall_private.generation_feature_status(p_user_id, p_feature, v_now)
      || jsonb_build_object('allowed', false, 'reason', 'in_progress');
  end if;

  -- Repair any orphaned reservation before relying on the unique partial
  -- index. This is defensive; normal RPC transactions keep both tables in sync.
  update public.generation_attempts
  set
    status = 'failed',
    error_code = 'RESERVATION_EXPIRED',
    expires_at = null,
    completed_at = v_now
  where user_id = p_user_id
    and feature = p_feature
    and status = 'reserved'
    and expires_at <= v_now;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.user_id = p_user_id
    and attempt.feature = p_feature
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
      and feature = p_feature;
    return recall_private.generation_feature_status(p_user_id, p_feature, v_now)
      || jsonb_build_object('allowed', false, 'reason', 'in_progress');
  end if;

  -- Create and lock today's counter before checking capacity. Concurrent
  -- requests cannot both observe the last slot because they already serialize
  -- on generation_limit_state.
  insert into public.daily_generation_usage (user_id, feature, local_date)
  values (p_user_id, p_feature, v_local_date)
  on conflict (user_id, feature, local_date) do nothing;

  select usage.successful_count
  into strict v_count
  from public.daily_generation_usage as usage
  where usage.user_id = p_user_id
    and usage.feature = p_feature
    and usage.local_date = v_local_date
  for update;

  if v_count >= 10 then
    return recall_private.generation_feature_status(p_user_id, p_feature, v_now)
      || jsonb_build_object('allowed', false, 'reason', 'daily_limit');
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
    p_feature,
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
    and feature = p_feature;

  return recall_private.generation_feature_status(p_user_id, p_feature, v_now)
    || jsonb_build_object(
      'allowed', true,
      'reservationId', p_request_id,
      'inProgress', true,
      'reason', 'allowed'
    );
end;
$$;

comment on function public.reserve_generation(uuid, text, uuid, text) is
  'Atomically reserves one user/feature generation before any AI provider call and binds its idempotency key to a canonical payload SHA-256. Does not increment successful usage.';

-- Internal clock-injected commit helper. The public RPC always supplies
-- clock_timestamp(); the explicit timestamp exists only so pgTAP can prove
-- behavior at an exact local-midnight boundary.
create or replace function recall_private.commit_generation_at(
  p_user_id uuid,
  p_feature text,
  p_request_id uuid,
  p_result jsonb,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.generation_limit_state%rowtype;
  v_attempt public.generation_attempts%rowtype;
  v_timezone text;
  v_commit_local_date date;
  v_new_count integer;
  v_status jsonb;
begin
  if p_user_id is null or p_request_id is null or p_result is null or p_now is null then
    raise exception 'A verified user id, request id, validated result, and commit time are required.'
      using errcode = '22023';
  end if;
  if p_feature not in ('quiz', 'timetable') then
    raise exception 'Unsupported generation feature: %', p_feature using errcode = '22023';
  end if;

  select state.*
  into v_state
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = p_feature
  for update;
  if not found then
    raise exception 'Generation reservation not found.' using errcode = 'P0002';
  end if;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;
  if not found
    or v_attempt.user_id <> p_user_id
    or v_attempt.feature <> p_feature then
    raise exception 'Generation reservation not found.' using errcode = 'P0002';
  end if;

  if v_attempt.status = 'succeeded' then
    return recall_private.generation_feature_status(p_user_id, p_feature, p_now)
      || jsonb_build_object(
        'allowed', true,
        'reservationId', p_request_id,
        'reason', 'replay',
        'replay', true,
        'result', v_attempt.result
      );
  end if;
  if v_attempt.status <> 'reserved'
    or v_state.active_request_id is distinct from p_request_id then
    raise exception 'Generation reservation is no longer active.' using errcode = '55000';
  end if;

  select recall_profiles.timezone
  into v_timezone
  from public.recall_profiles
  where recall_profiles.id = p_user_id;
  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id using errcode = '23503';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    raise exception 'Stored profile timezone is invalid for user %', p_user_id using errcode = '22023';
  end if;
  v_commit_local_date := (p_now at time zone v_timezone)::date;

  -- Charge the calendar day on which the validated success commits. The
  -- per-user/feature state row remains locked and active from reservation
  -- through this transaction, so no same-feature request can consume a new-day
  -- slot while the pre-midnight request is still running.
  insert into public.daily_generation_usage (user_id, feature, local_date)
  values (p_user_id, p_feature, v_commit_local_date)
  on conflict (user_id, feature, local_date) do nothing;

  update public.daily_generation_usage
  set
    successful_count = successful_count + 1,
    updated_at = p_now
  where user_id = p_user_id
    and feature = p_feature
    and local_date = v_commit_local_date
    and successful_count < 10
  returning successful_count into v_new_count;

  if not found then
    raise exception 'Daily generation capacity changed before commit.' using errcode = '55000';
  end if;

  update public.generation_attempts
  set
    local_date = v_commit_local_date,
    status = 'succeeded',
    result = p_result,
    error_code = null,
    expires_at = null,
    completed_at = p_now
  where request_id = p_request_id;

  update public.generation_limit_state
  set
    active_request_id = null,
    active_expires_at = null,
    updated_at = p_now
  where user_id = p_user_id
    and feature = p_feature
    and active_request_id = p_request_id;

  v_status := recall_private.generation_feature_status(p_user_id, p_feature, p_now);
  return v_status || jsonb_build_object(
    'allowed', true,
    'reservationId', p_request_id,
    'reason', 'allowed',
    'replay', false,
    'result', p_result
  );
end;
$$;

comment on function recall_private.commit_generation_at(uuid, text, uuid, jsonb, timestamptz) is
  'Internal atomic commit implementation with an injectable clock for deterministic boundary testing.';

revoke all on function recall_private.commit_generation_at(uuid, text, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function recall_private.commit_generation_at(uuid, text, uuid, jsonb, timestamptz)
  to service_role;

create or replace function public.commit_generation(
  p_user_id uuid,
  p_feature text,
  p_request_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return recall_private.commit_generation_at(
    p_user_id,
    p_feature,
    p_request_id,
    p_result,
    clock_timestamp()
  );
end;
$$;

comment on function public.commit_generation(uuid, text, uuid, jsonb) is
  'Commits a validated AI result to the user-local day of success and increments usage exactly once; repeat calls replay the stored result.';

create or replace function public.release_generation(
  p_user_id uuid,
  p_feature text,
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
  v_state public.generation_limit_state%rowtype;
  v_attempt public.generation_attempts%rowtype;
  v_status jsonb;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'A verified user id and request id are required.' using errcode = '22023';
  end if;
  if p_feature not in ('quiz', 'timetable') then
    raise exception 'Unsupported generation feature: %', p_feature using errcode = '22023';
  end if;

  select state.*
  into v_state
  from public.generation_limit_state as state
  where state.user_id = p_user_id
    and state.feature = p_feature
  for update;

  select attempt.*
  into v_attempt
  from public.generation_attempts as attempt
  where attempt.request_id = p_request_id
  for update;

  if found then
    if v_attempt.user_id <> p_user_id or v_attempt.feature <> p_feature then
      raise exception 'Request id is owned by another generation.' using errcode = '23505';
    end if;

    if v_attempt.status = 'succeeded' then
      return recall_private.generation_feature_status(p_user_id, p_feature, v_now)
        || jsonb_build_object(
          'allowed', true,
          'reservationId', p_request_id,
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
    and feature = p_feature
    and active_request_id = p_request_id;

  v_status := recall_private.generation_feature_status(p_user_id, p_feature, v_now);
  return v_status || jsonb_build_object(
    'reservationId', p_request_id,
    'reason', 'released',
    'replay', false,
    'result', null
  );
end;
$$;

comment on function public.release_generation(uuid, text, uuid, text) is
  'Releases a failed/invalid generation reservation without incrementing successful usage. Idempotent for retries.';

create or replace function public.get_generation_status(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return jsonb_build_object(
    'quiz', recall_private.generation_feature_status(p_user_id, 'quiz', v_now),
    'timetable', recall_private.generation_feature_status(p_user_id, 'timetable', v_now)
  );
end;
$$;

comment on function public.get_generation_status(uuid) is
  'Returns independent quiz and timetable successful-generation status for the current user-local day.';

-- PostgreSQL grants function EXECUTE to PUBLIC by default. These RPCs accept a
-- user id because the Vercel API first verifies the bearer token; only its
-- server-side service key may execute them.
revoke all on function public.reserve_generation(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.commit_generation(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.release_generation(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_generation_status(uuid)
  from public, anon, authenticated;

grant execute on function public.reserve_generation(uuid, text, uuid, text)
  to service_role;
grant execute on function public.commit_generation(uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.release_generation(uuid, text, uuid, text)
  to service_role;
grant execute on function public.get_generation_status(uuid)
  to service_role;
