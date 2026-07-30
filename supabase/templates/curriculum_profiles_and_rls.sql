-- Recall+ curriculum-driven Class XI academic profiles.
--
-- This migration is intentionally one transaction. It creates the immutable
-- curriculum catalogue, user-owned academic records, owner-scoped migration
-- candidates, server-side combination validation, RLS/grants, seed data, and
-- the existing-user backfill together. No legacy snapshot data is modified.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Versioned official curriculum catalogue
-- ---------------------------------------------------------------------------

create table public.curriculum_versions (
  id text primary key,
  board text not null,
  academic_year text not null,
  grade text not null,
  version text not null,
  status text not null,
  source_url text not null,
  source_title text not null,
  published_at timestamptz,
  imported_at timestamptz not null,
  verified_at timestamptz,
  source_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint curriculum_versions_identity_unique
    unique (id, board, academic_year, grade),
  constraint curriculum_versions_natural_key_unique
    unique (board, academic_year, grade, version),
  constraint curriculum_versions_status_check
    check (status in ('draft', 'reviewed', 'published', 'archived')),
  constraint curriculum_versions_source_url_check
    check (source_url ~ '^https://cbseacademic[.]nic[.]in/'),
  constraint curriculum_versions_source_hash_check
    check (source_hash ~ '^[a-f0-9]{64}$')
);

create table public.curriculum_subjects (
  id text primary key,
  curriculum_version_id text not null
    references public.curriculum_versions (id) on delete restrict,
  subject_code text,
  name text not null,
  short_name text not null,
  subject_group text not null,
  category text not null,
  has_theory boolean,
  has_practical boolean,
  has_internal_assessment boolean,
  pathway_tags text[] not null default '{}'::text[],
  source_url text not null,
  source_title text not null,
  source_hash text,
  content_status text not null,
  official_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint curriculum_subjects_id_version_unique
    unique (id, curriculum_version_id),
  constraint curriculum_subjects_code_unique
    unique (curriculum_version_id, subject_code),
  constraint curriculum_subjects_group_check
    check (subject_group in ('L', 'A', 'S', 'IA')),
  constraint curriculum_subjects_category_check
    check (category in (
      'language',
      'academic_elective',
      'skill_elective',
      'internal_assessment'
    )),
  constraint curriculum_subjects_code_check
    check (
      (subject_group = 'IA' and subject_code is null)
      or (subject_group <> 'IA' and subject_code ~ '^[0-9]{3}$')
    ),
  constraint curriculum_subjects_pathway_tags_check
    check (
      pathway_tags <@ array[
        'science',
        'commerce',
        'humanities',
        'common',
        'language',
        'skill'
      ]::text[]
    ),
  constraint curriculum_subjects_source_url_check
    check (source_url ~ '^https://cbseacademic[.]nic[.]in/'),
  constraint curriculum_subjects_source_hash_check
    check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  constraint curriculum_subjects_content_status_check
    check (content_status in ('verified_outline', 'pending_verification')),
  constraint curriculum_subjects_order_check
    check (official_order >= 1),
  constraint curriculum_subjects_name_check
    check (
      char_length(btrim(name)) between 2 and 160
      and char_length(btrim(short_name)) between 2 and 160
    )
);

create index curriculum_subjects_discovery_idx
  on public.curriculum_subjects (
    curriculum_version_id,
    subject_group,
    active,
    official_order
  );
create index curriculum_subjects_pathway_tags_idx
  on public.curriculum_subjects using gin (pathway_tags);

create table public.curriculum_nodes (
  id text primary key,
  subject_id text not null
    references public.curriculum_subjects (id) on delete restrict,
  parent_id text,
  node_type text not null,
  title text not null,
  description text,
  official_order integer not null,
  marks_weightage numeric(7, 2),
  source_page integer,
  source_url text not null,
  external_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint curriculum_nodes_id_subject_unique unique (id, subject_id),
  constraint curriculum_nodes_external_key_unique unique (subject_id, external_key),
  constraint curriculum_nodes_parent_same_subject_fk
    foreign key (parent_id, subject_id)
    references public.curriculum_nodes (id, subject_id)
    on delete restrict,
  constraint curriculum_nodes_type_check
    check (node_type in (
      'unit',
      'chapter',
      'topic',
      'subtopic',
      'practical',
      'project',
      'activity',
      'assessment_area'
    )),
  constraint curriculum_nodes_title_check
    check (char_length(btrim(title)) between 1 and 240),
  constraint curriculum_nodes_order_check
    check (official_order >= 1),
  constraint curriculum_nodes_marks_check
    check (marks_weightage is null or marks_weightage >= 0),
  constraint curriculum_nodes_source_page_check
    check (source_page is null or source_page >= 1),
  constraint curriculum_nodes_source_url_check
    check (source_url ~ '^https://cbseacademic[.]nic[.]in/')
);

create index curriculum_nodes_tree_idx
  on public.curriculum_nodes (subject_id, parent_id, active, official_order);
create index curriculum_nodes_type_idx
  on public.curriculum_nodes (subject_id, node_type, active);
create index curriculum_nodes_parent_fk_idx
  on public.curriculum_nodes (parent_id, subject_id)
  where parent_id is not null;

-- ---------------------------------------------------------------------------
-- User academic profile, confirmed selections, and legacy candidates
-- ---------------------------------------------------------------------------

create table public.user_academic_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  board text not null,
  grade text not null,
  academic_year text not null,
  curriculum_version_id text not null,
  pathway text,
  timezone text not null default 'Asia/Kolkata',
  school_name text,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_academic_profiles_curriculum_fk
    foreign key (
      curriculum_version_id,
      board,
      academic_year,
      grade
    )
    references public.curriculum_versions (
      id,
      board,
      academic_year,
      grade
    )
    on delete restrict,
  constraint user_academic_profiles_pathway_check
    check (pathway is null or pathway in ('science', 'commerce', 'humanities')),
  constraint user_academic_profiles_timezone_check
    check (timezone = 'Asia/Kolkata'),
  constraint user_academic_profiles_school_name_check
    check (
      school_name is null
      or (
        school_name = btrim(school_name)
        and char_length(school_name) between 2 and 160
      )
    ),
  constraint user_academic_profiles_onboarding_check
    check (
      (
        onboarding_completed
        and pathway is not null
        and onboarding_completed_at is not null
      )
      or (
        not onboarding_completed
        and onboarding_completed_at is null
      )
    )
);

create index user_academic_profiles_curriculum_idx
  on public.user_academic_profiles (curriculum_version_id, onboarding_completed);
create index user_academic_profiles_curriculum_fk_idx
  on public.user_academic_profiles (
    curriculum_version_id,
    board,
    academic_year,
    grade
  );

create table public.user_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  curriculum_subject_id text not null
    references public.curriculum_subjects (id) on delete restrict,
  subject_position smallint not null,
  selection_type text not null,
  selected_at timestamptz not null default clock_timestamp(),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_subjects_position_check
    check (subject_position between 1 and 6),
  constraint user_subjects_selection_type_check
    check (selection_type in ('main', 'additional')),
  constraint user_subjects_position_type_check
    check (
      (subject_position between 1 and 5 and selection_type = 'main')
      or (subject_position = 6 and selection_type = 'additional')
    ),
  constraint user_subjects_archive_check
    check (archived_at is null or archived_at >= selected_at)
);

create unique index user_subjects_active_subject_unique
  on public.user_subjects (user_id, curriculum_subject_id)
  where archived_at is null;
create unique index user_subjects_active_position_unique
  on public.user_subjects (user_id, subject_position)
  where archived_at is null;
create index user_subjects_active_lookup_idx
  on public.user_subjects (user_id, archived_at, subject_position);
create index user_subjects_curriculum_lookup_idx
  on public.user_subjects (curriculum_subject_id, archived_at);

create table public.user_subject_migration_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_name text not null,
  legacy_names text[] not null,
  source_contexts text[] not null,
  occurrence_count integer not null,
  curriculum_subject_id text
    references public.curriculum_subjects (id) on delete restrict,
  confidence text not null,
  resolution_status text not null,
  detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_subject_migration_candidates_user_name_unique
    unique (user_id, normalized_name),
  constraint user_subject_migration_candidates_name_check
    check (char_length(normalized_name) between 1 and 160),
  constraint user_subject_migration_candidates_occurrence_check
    check (occurrence_count >= 1),
  constraint user_subject_migration_candidates_confidence_check
    check (confidence in ('exact', 'alias', 'unresolved')),
  constraint user_subject_migration_candidates_status_check
    check (resolution_status in ('mapped', 'unresolved', 'confirmed', 'dismissed')),
  constraint user_subject_migration_candidates_mapping_check
    check (
      (
        resolution_status in ('mapped', 'confirmed')
        and curriculum_subject_id is not null
      )
      or resolution_status in ('unresolved', 'dismissed')
    )
);

create index user_subject_migration_candidates_owner_idx
  on public.user_subject_migration_candidates (user_id, resolution_status);
create index user_subject_migration_candidates_subject_idx
  on public.user_subject_migration_candidates (curriculum_subject_id)
  where curriculum_subject_id is not null;

-- Private aliases support deterministic legacy backfill without exposing a
-- browser-writable mapping surface.
create table recall_private.curriculum_legacy_subject_aliases (
  normalized_alias text primary key,
  curriculum_subject_id text not null
    references public.curriculum_subjects (id) on delete restrict,
  confidence text not null,
  constraint curriculum_legacy_subject_aliases_confidence_check
    check (confidence in ('exact', 'alias'))
);
create index curriculum_legacy_subject_aliases_subject_idx
  on recall_private.curriculum_legacy_subject_aliases (curriculum_subject_id);

-- ---------------------------------------------------------------------------
-- Deterministic official catalogue seed
-- ---------------------------------------------------------------------------

create temporary table recall_curriculum_seed_payload (
  value jsonb not null
) on commit drop;

insert into recall_curriculum_seed_payload (value)
values ($curriculum$__CURRICULUM_PAYLOAD__$curriculum$::jsonb);

do $migration_guard$
declare
  v_payload jsonb;
  v_version_id text;
  v_source_hash text;
begin
  select value into strict v_payload
  from recall_curriculum_seed_payload;
  v_version_id := v_payload -> 'version' ->> 'id';
  v_source_hash := v_payload -> 'version' ->> 'sourceHash';

  if exists (
    select 1
    from public.curriculum_versions as versions
    where versions.id = v_version_id
      and versions.source_hash is distinct from v_source_hash
  ) then
    raise exception
      'Curriculum version % already exists with a different source hash.',
      v_version_id
      using errcode = '23505';
  end if;
end;
$migration_guard$;

with payload as (
  select value from recall_curriculum_seed_payload
)
insert into public.curriculum_versions (
  id,
  board,
  academic_year,
  grade,
  version,
  status,
  source_url,
  source_title,
  published_at,
  imported_at,
  verified_at,
  source_hash
)
select
  value -> 'version' ->> 'id',
  value -> 'version' ->> 'board',
  value -> 'version' ->> 'academicYear',
  value -> 'version' ->> 'grade',
  value -> 'version' ->> 'version',
  value -> 'version' ->> 'status',
  value -> 'version' ->> 'sourceUrl',
  value -> 'version' ->> 'sourceTitle',
  null,
  (value -> 'version' ->> 'importedAt')::timestamptz,
  (value -> 'version' ->> 'verifiedAt')::timestamptz,
  value -> 'version' ->> 'sourceHash'
from payload
on conflict (id) do update
set
  source_title = excluded.source_title,
  verified_at = excluded.verified_at,
  updated_at = clock_timestamp();

with payload as (
  select value from recall_curriculum_seed_payload
),
subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from payload
)
insert into public.curriculum_subjects (
  id,
  curriculum_version_id,
  subject_code,
  name,
  short_name,
  subject_group,
  category,
  has_theory,
  has_practical,
  has_internal_assessment,
  pathway_tags,
  source_url,
  source_title,
  source_hash,
  content_status,
  official_order,
  active
)
select
  value ->> 'id',
  value ->> 'curriculumVersionId',
  value ->> 'subjectCode',
  value ->> 'name',
  value ->> 'shortName',
  value ->> 'subjectGroup',
  value ->> 'category',
  (value ->> 'hasTheory')::boolean,
  (value ->> 'hasPractical')::boolean,
  (value ->> 'hasInternalAssessment')::boolean,
  array(
    select jsonb_array_elements_text(value -> 'pathwayTags')
  ),
  value -> 'source' ->> 'url',
  value -> 'source' ->> 'title',
  value -> 'source' ->> 'sha256',
  value ->> 'contentStatus',
  (value ->> 'officialOrder')::integer,
  (value ->> 'active')::boolean
from subjects
on conflict (id) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  pathway_tags = excluded.pathway_tags,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  content_status = excluded.content_status,
  official_order = excluded.official_order,
  active = excluded.active,
  updated_at = clock_timestamp();

with payload as (
  select value from recall_curriculum_seed_payload
),
nodes as (
  select jsonb_array_elements(value -> 'nodes') as value
  from payload
)
insert into public.curriculum_nodes (
  id,
  subject_id,
  parent_id,
  node_type,
  title,
  description,
  official_order,
  marks_weightage,
  source_page,
  source_url,
  external_key,
  active
)
select
  value ->> 'id',
  value ->> 'subjectId',
  value ->> 'parentId',
  value ->> 'nodeType',
  value ->> 'title',
  value ->> 'description',
  (value ->> 'officialOrder')::integer,
  (value ->> 'marksWeightage')::numeric,
  (value ->> 'sourcePage')::integer,
  value ->> 'sourceUrl',
  value ->> 'externalKey',
  (value ->> 'active')::boolean
from nodes
on conflict (id) do update
set
  parent_id = excluded.parent_id,
  node_type = excluded.node_type,
  title = excluded.title,
  description = excluded.description,
  official_order = excluded.official_order,
  marks_weightage = excluded.marks_weightage,
  source_page = excluded.source_page,
  source_url = excluded.source_url,
  external_key = excluded.external_key,
  active = excluded.active,
  updated_at = clock_timestamp();

with aliases as (
  select jsonb_array_elements(
    $aliases$__ALIAS_PAYLOAD__$aliases$::jsonb
  ) as value
)
insert into recall_private.curriculum_legacy_subject_aliases (
  normalized_alias,
  curriculum_subject_id,
  confidence
)
select
  value ->> 'normalizedAlias',
  value ->> 'curriculumSubjectId',
  value ->> 'confidence'
from aliases
on conflict (normalized_alias) do update
set
  curriculum_subject_id = excluded.curriculum_subject_id,
  confidence = excluded.confidence;

do $seed_assertions$
begin
  if (
    select count(*)
    from public.curriculum_subjects
    where curriculum_version_id = 'cbse-2026-27-xi-v1'
  ) <> 124 then
    raise exception 'Expected 124 curriculum subject records.'
      using errcode = '23514';
  end if;
  if (
    select count(*)
    from public.curriculum_subjects
    where curriculum_version_id = 'cbse-2026-27-xi-v1'
      and subject_group <> 'IA'
  ) <> 121 then
    raise exception 'Expected 121 selectable curriculum subject records.'
      using errcode = '23514';
  end if;
  if (
    select count(*)
    from public.curriculum_nodes
    where subject_id like 'cbse-2026-27-xi-%'
  ) <> 295 then
    raise exception 'Expected 295 curriculum node records.'
      using errcode = '23514';
  end if;
end;
$seed_assertions$;

-- ---------------------------------------------------------------------------
-- Move existing authenticated write implementations out of the exposed schema
-- ---------------------------------------------------------------------------

create function recall_private.initialize_recall_timezone_impl(
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
begin
  if v_authenticated_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    )
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_timezone is null
    or octet_length(p_timezone) > 128
    or p_timezone is distinct from 'Asia/Kolkata' then
    raise exception 'Invalid IANA timezone.'
      using errcode = '22023';
  end if;

  update public.recall_profiles
  set
    timezone = 'Asia/Kolkata',
    timezone_initialized = true
  where id = p_user_id;

  if not found then
    raise exception 'Recall+ profile not found for user %', p_user_id
      using errcode = '23503';
  end if;

  return 'Asia/Kolkata';
end;
$$;

create or replace function public.initialize_recall_timezone(
  p_user_id uuid,
  p_timezone text
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.initialize_recall_timezone_impl(p_user_id, p_timezone);
$$;

create function recall_private.upsert_recall_app_data_impl(
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
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    )
    or p_user_id is null
    or p_user_id is distinct from v_authenticated_user_id then
    raise exception 'Authenticated session does not match intended user.'
      using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Snapshot data must be a JSON object.'
      using errcode = '22023';
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
          'expectedVersion',
          p_expected_version,
          'currentVersion',
          (
            select app_data.version
            from public.user_app_data as app_data
            where app_data.user_id = p_user_id
          )
        )::text;
  end if;

  return jsonb_build_object(
    'data',
    v_row.data,
    'version',
    v_row.version,
    'updatedAt',
    v_row.updated_at
  );
end;
$$;

create or replace function public.upsert_recall_app_data(
  p_user_id uuid,
  p_data jsonb,
  p_expected_version bigint
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.upsert_recall_app_data_impl(
    p_user_id,
    p_data,
    p_expected_version
  );
$$;

-- ---------------------------------------------------------------------------
-- Database-enforced curriculum and combination validation
-- ---------------------------------------------------------------------------

create function public.validate_recall_subject_combination(
  p_selections jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_count integer;
  v_group text;
  v_code text;
  v_conflict_codes text[];
  v_language_pair text[];
begin
  if (select auth.uid()) is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if p_selections is null
    or jsonb_typeof(p_selections) <> 'array'
    or octet_length(p_selections::text) > 32768 then
    return jsonb_build_object(
      'valid',
      false,
      'errors',
      jsonb_build_array(jsonb_build_object(
        'code',
        'INVALID_PAYLOAD',
        'message',
        'Subject selections must be a small JSON array.',
        'subjectCodes',
        '[]'::jsonb
      ))
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where jsonb_typeof(entries.value) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(entries.value) as keys(value)
        where keys.value not in (
          'curriculumSubjectId',
          'subjectPosition',
          'selectionType'
        )
      )
      or coalesce(entries.value ->> 'curriculumSubjectId', '') = ''
      or coalesce(entries.value ->> 'subjectPosition', '') !~ '^[1-6]$'
      or coalesce(entries.value ->> 'selectionType', '') not in ('main', 'additional')
  ) then
    return jsonb_build_object(
      'valid',
      false,
      'errors',
      jsonb_build_array(jsonb_build_object(
        'code',
        'INVALID_PAYLOAD',
        'message',
        'Each selection must contain only a subject ID, position, and selection type.',
        'subjectCodes',
        '[]'::jsonb
      ))
    );
  end if;

  v_count := jsonb_array_length(p_selections);
  if v_count not in (5, 6) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_COUNT',
      'message',
      'Select exactly five main subjects and, optionally, one additional subject.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct entries.value ->> 'curriculumSubjectId')
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'DUPLICATE_SUBJECT',
      'message',
      'Each subject can be selected only once.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct (entries.value ->> 'subjectPosition')::integer)
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MAIN_POSITION',
      'message',
      'Subject positions must be unique whole numbers from 1 to 6.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if v_count in (5, 6)
    and (
      select array_agg(
        (entries.value ->> 'subjectPosition')::integer
        order by (entries.value ->> 'subjectPosition')::integer
      )
      from jsonb_array_elements(p_selections) as entries(value)
    ) is distinct from (
      case
        when v_count = 5 then array[1, 2, 3, 4, 5]
        else array[1, 2, 3, 4, 5, 6]
      end
    ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_POSITION_SEQUENCE',
      'message',
      'Five subjects must use positions 1 to 5; a sixth subject uses position 6.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where (
      (entries.value ->> 'subjectPosition')::integer between 1 and 5
      and entries.value ->> 'selectionType' <> 'main'
    ) or (
      (entries.value ->> 'subjectPosition')::integer = 6
      and entries.value ->> 'selectionType' <> 'additional'
    )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SELECTION_POSITION',
      'message',
      'Subjects 1 to 5 must be main and Subject 6 must be additional.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    left join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.id is null
      or subjects.curriculum_version_id <> 'cbse-2026-27-xi-v1'
      or not subjects.active
      or subjects.subject_group = 'IA'
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'UNKNOWN_SUBJECT',
      'message',
      'One or more subjects are unavailable in the active CBSE Class XI catalogue.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 1;

  if v_group is distinct from 'L'
    or v_code is null
    or v_code not in ('001', '301', '002', '302') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_ONE_LANGUAGE',
      'message',
      'Subject 1 must be English Core, English Elective, Hindi Core, or Hindi Elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 2;

  if v_group is null or v_group not in ('L', 'A') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_TWO_GROUP',
      'message',
      'Subject 2 must be another Group-L language or a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer in (3, 4)
      and subjects.subject_group not in ('A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MAIN_SUBJECT_GROUP',
      'message',
      'Subjects 3 and 4 must be Group-A academic or Group-S skill electives.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 5;

  if v_group is distinct from 'A' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'SUBJECT_FIVE_GROUP',
      'message',
      'Subject 5 must be a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer = 6
      and subjects.subject_group not in ('L', 'A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'ADDITIONAL_SUBJECT_GROUP',
      'message',
      'The additional subject must be a Group-L, Group-A, or Group-S subject.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.subject_code in ('001', '301', '002', '302')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'REQUIRED_LANGUAGE',
      'message',
      'Your combination must include English or Hindi at Core or Elective level.',
      'subjectCodes',
      '[]'::jsonb
    ));
  end if;

  select array_agg(subjects.subject_code order by subjects.subject_code)
  into v_conflict_codes
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where subjects.subject_code in ('041', '241');
  if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'MATH_CONFLICT',
      'message',
      'You cannot select both Mathematics and Applied Mathematics.',
      'subjectCodes',
      to_jsonb(v_conflict_codes)
    ));
  end if;

  select array_agg(subjects.subject_code order by subjects.subject_code)
  into v_conflict_codes
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where subjects.subject_code in ('083', '065', '802');
  if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'COMPUTER_CONFLICT',
      'message',
      'You may select only one of Computer Science, Informatics Practices, or Information Technology.',
      'subjectCodes',
      to_jsonb(v_conflict_codes)
    ));
  end if;

  select array_agg(subjects.subject_code order by subjects.subject_code)
  into v_conflict_codes
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where subjects.subject_code in ('054', '833');
  if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code',
      'BUSINESS_CONFLICT',
      'message',
      'You cannot select both Business Studies and Business Administration.',
      'subjectCodes',
      to_jsonb(v_conflict_codes)
    ));
  end if;

  foreach v_language_pair slice 1 in array array[
    ['001', '301'],
    ['002', '302'],
    ['003', '303'],
    ['022', '322']
  ]
  loop
    select array_agg(subjects.subject_code order by subjects.subject_code)
    into v_conflict_codes
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.subject_code = any (v_language_pair);

    if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code',
        'LANGUAGE_LEVEL_CONFLICT',
        'message',
        'The same language cannot be selected at both Core and Elective level.',
        'subjectCodes',
        to_jsonb(v_conflict_codes)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'valid',
    jsonb_array_length(v_errors) = 0,
    'errors',
    v_errors
  );
end;
$$;

comment on function public.validate_recall_subject_combination(jsonb) is
  'Validates one CBSE 2026-27 Class XI five-or-six-subject combination using official position and conflict rules.';

create function recall_private.save_recall_onboarding_progress_impl(
  p_pathway text,
  p_school_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_school_name text := nullif(btrim(p_school_name), '');
  v_profile public.user_academic_profiles%rowtype;
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  if p_pathway is not null
    and p_pathway not in ('science', 'commerce', 'humanities') then
    raise exception 'Invalid academic pathway.'
      using errcode = '22023';
  end if;
  if v_school_name is not null
    and char_length(v_school_name) not between 2 and 160 then
    raise exception 'School name must contain 2 to 160 characters.'
      using errcode = '22023';
  end if;

  update public.user_academic_profiles
  set
    pathway = p_pathway,
    school_name = v_school_name
  where user_id = v_user_id
    and not onboarding_completed
  returning * into v_profile;

  if not found then
    raise exception 'Incomplete academic profile not found.'
      using errcode = '23503';
  end if;

  return jsonb_build_object(
    'userId',
    v_profile.user_id,
    'pathway',
    v_profile.pathway,
    'schoolName',
    v_profile.school_name,
    'onboardingCompleted',
    v_profile.onboarding_completed
  );
end;
$$;

create function public.save_recall_onboarding_progress(
  p_pathway text,
  p_school_name text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.save_recall_onboarding_progress_impl(
    p_pathway,
    p_school_name
  );
$$;

create function recall_private.save_recall_academic_profile_impl(
  p_pathway text,
  p_school_name text,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_school_name text := nullif(btrim(p_school_name), '');
  v_validation jsonb;
  v_completed_at timestamptz := clock_timestamp();
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  if p_pathway is null
    or p_pathway not in ('science', 'commerce', 'humanities') then
    raise exception 'Invalid academic pathway.'
      using errcode = '22023';
  end if;
  if v_school_name is not null
    and char_length(v_school_name) not between 2 and 160 then
    raise exception 'School name must contain 2 to 160 characters.'
      using errcode = '22023';
  end if;

  v_validation := public.validate_recall_subject_combination(p_selections);
  if not (v_validation ->> 'valid')::boolean then
    raise exception 'INVALID_SUBJECT_COMBINATION'
      using errcode = '22023', detail = v_validation::text;
  end if;

  perform 1
  from public.user_academic_profiles
  where user_id = v_user_id
    and curriculum_version_id = 'cbse-2026-27-xi-v1'
  for update;
  if not found then
    raise exception 'Academic profile not found for the active curriculum.'
      using errcode = '23503';
  end if;

  update public.user_subjects as existing
  set archived_at = v_completed_at
  where existing.user_id = v_user_id
    and existing.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(p_selections) as entries(value)
      where entries.value ->> 'curriculumSubjectId' = existing.curriculum_subject_id
        and (entries.value ->> 'subjectPosition')::smallint = existing.subject_position
        and entries.value ->> 'selectionType' = existing.selection_type
    );

  insert into public.user_subjects (
    user_id,
    curriculum_subject_id,
    subject_position,
    selection_type
  )
  select
    v_user_id,
    entries.value ->> 'curriculumSubjectId',
    (entries.value ->> 'subjectPosition')::smallint,
    entries.value ->> 'selectionType'
  from jsonb_array_elements(p_selections) as entries(value)
  where not exists (
    select 1
    from public.user_subjects as existing
    where existing.user_id = v_user_id
      and existing.curriculum_subject_id = entries.value ->> 'curriculumSubjectId'
      and existing.subject_position = (entries.value ->> 'subjectPosition')::smallint
      and existing.selection_type = entries.value ->> 'selectionType'
      and existing.archived_at is null
  );

  update public.user_subject_migration_candidates as candidates
  set
    resolution_status = case
      when exists (
        select 1
        from jsonb_array_elements(p_selections) as entries(value)
        where entries.value ->> 'curriculumSubjectId' = candidates.curriculum_subject_id
      ) then 'confirmed'
      else 'dismissed'
    end,
    resolved_at = v_completed_at
  where candidates.user_id = v_user_id
    and candidates.resolution_status in ('mapped', 'unresolved');

  update public.user_academic_profiles
  set
    pathway = p_pathway,
    school_name = v_school_name,
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, v_completed_at)
  where user_id = v_user_id;

  return jsonb_build_object(
    'userId',
    v_user_id,
    'pathway',
    p_pathway,
    'schoolName',
    v_school_name,
    'onboardingCompleted',
    true,
    'validation',
    v_validation,
    'subjects',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'curriculumSubjectId',
            subjects.curriculum_subject_id,
            'subjectPosition',
            subjects.subject_position,
            'selectionType',
            subjects.selection_type
          )
          order by subjects.subject_position
        ),
        '[]'::jsonb
      )
      from public.user_subjects as subjects
      where subjects.user_id = v_user_id
        and subjects.archived_at is null
    )
  );
end;
$$;

create function public.save_recall_academic_profile(
  p_pathway text,
  p_school_name text,
  p_selections jsonb
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.save_recall_academic_profile_impl(
    p_pathway,
    p_school_name,
    p_selections
  );
$$;

create function public.validate_recall_user_subject_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.user_academic_profiles as profiles
    join public.curriculum_subjects as subjects
      on subjects.id = new.curriculum_subject_id
      and subjects.curriculum_version_id = profiles.curriculum_version_id
      and subjects.active
      and subjects.subject_group <> 'IA'
    where profiles.user_id = new.user_id
  ) then
    raise exception 'Selected subject does not belong to the user curriculum.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_subjects_validate_curriculum
  before insert or update of user_id, curriculum_subject_id
  on public.user_subjects
  for each row execute function public.validate_recall_user_subject_version();

-- ---------------------------------------------------------------------------
-- Existing-user profile and subject-candidate backfill
-- ---------------------------------------------------------------------------

insert into public.user_academic_profiles (
  user_id,
  board,
  grade,
  academic_year,
  curriculum_version_id,
  pathway,
  timezone,
  school_name,
  onboarding_completed,
  onboarding_completed_at
)
select
  users.id,
  'CBSE',
  'XI',
  '2026-27',
  'cbse-2026-27-xi-v1',
  null,
  'Asia/Kolkata',
  null,
  false,
  null
from auth.users as users
where not coalesce(users.is_anonymous, false)
on conflict (user_id) do nothing;

-- Extract only subject names that actually occur in preserved user snapshots.
-- Mapped candidates are not authoritative user_subjects until the owner
-- confirms a complete valid combination and supplies the required language.
create function recall_private.refresh_legacy_subject_candidates(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with raw_candidates as (
  select
    app_data.user_id,
    'study_logs'::text as source_context,
    entries.value ->> 'subject' as legacy_name
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_study_logs') = 'array'
        then app_data.data -> 'recall_plus_study_logs'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'study_log_timetable_planned',
    entries.value -> 'timetableFollowUp' ->> 'plannedSubject'
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_study_logs') = 'array'
        then app_data.data -> 'recall_plus_study_logs'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'study_log_timetable_studied',
    entries.value -> 'timetableFollowUp' ->> 'studiedSubject'
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_study_logs') = 'array'
        then app_data.data -> 'recall_plus_study_logs'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'quiz_results',
    entries.value ->> 'subject'
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_quiz_results') = 'array'
        then app_data.data -> 'recall_plus_quiz_results'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'reviews',
    entries.value ->> 'subject'
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_reviews') = 'array'
        then app_data.data -> 'recall_plus_reviews'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'study_timetable',
    entries.value ->> 'subject'
  from public.user_app_data as app_data
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_study_timetable') = 'array'
        then app_data.data -> 'recall_plus_study_timetable'
      else '[]'::jsonb
    end
  ) as entries(value)

  union all

  select
    app_data.user_id,
    'topic_statuses',
    split_part(keys.value, '|', 1)
  from public.user_app_data as app_data
  cross join lateral jsonb_object_keys(
    case
      when jsonb_typeof(app_data.data -> 'recall_plus_topic_statuses') = 'object'
        then app_data.data -> 'recall_plus_topic_statuses'
      else '{}'::jsonb
    end
  ) as keys(value)
),
normalized as (
  select
    user_id,
    source_context,
    left(btrim(legacy_name), 160) as legacy_name,
    left(
      lower(
        regexp_replace(
          regexp_replace(btrim(legacy_name), '[._/-]+', ' ', 'g'),
          '[[:space:]]+',
          ' ',
          'g'
        )
      ),
      160
    ) as normalized_name
  from raw_candidates
  where legacy_name is not null
    and btrim(legacy_name) <> ''
    and (p_user_id is null or user_id = p_user_id)
),
grouped as (
  select
    user_id,
    normalized_name,
    array_agg(distinct legacy_name order by legacy_name) as legacy_names,
    array_agg(distinct source_context order by source_context) as source_contexts,
    count(*)::integer as occurrence_count
  from normalized
  where normalized_name <> ''
  group by user_id, normalized_name
)
insert into public.user_subject_migration_candidates (
  user_id,
  normalized_name,
  legacy_names,
  source_contexts,
  occurrence_count,
  curriculum_subject_id,
  confidence,
  resolution_status
)
select
  grouped.user_id,
  grouped.normalized_name,
  grouped.legacy_names,
  grouped.source_contexts,
  grouped.occurrence_count,
  aliases.curriculum_subject_id,
  coalesce(aliases.confidence, 'unresolved'),
  case when aliases.curriculum_subject_id is null then 'unresolved' else 'mapped' end
from grouped
left join recall_private.curriculum_legacy_subject_aliases as aliases
  on aliases.normalized_alias = grouped.normalized_name
on conflict (user_id, normalized_name) do update
set
  legacy_names = excluded.legacy_names,
  source_contexts = excluded.source_contexts,
  occurrence_count = excluded.occurrence_count,
  curriculum_subject_id = excluded.curriculum_subject_id,
  confidence = excluded.confidence,
  resolution_status = excluded.resolution_status,
  updated_at = clock_timestamp()
where user_subject_migration_candidates.resolution_status in ('mapped', 'unresolved');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function recall_private.refresh_legacy_subject_candidates_for_current_user()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  return recall_private.refresh_legacy_subject_candidates(v_user_id);
end;
$$;

create function public.refresh_recall_legacy_subject_candidates()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.refresh_legacy_subject_candidates_for_current_user();
$$;

select recall_private.refresh_legacy_subject_candidates(null);

-- Consolidates the previously unapplied local OAuth-profile migration while
-- adding the academic profile row to the same Auth trigger transaction.
create or replace function public.handle_new_recall_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  select left(btrim(candidate.value), 50)
  into v_display_name
  from (
    values
      (1, new.raw_user_meta_data ->> 'full_name'),
      (2, new.raw_user_meta_data ->> 'name'),
      (3, new.raw_user_meta_data ->> 'user_name'),
      (4, new.raw_user_meta_data ->> 'preferred_username')
  ) as candidate(priority, value)
  where char_length(btrim(candidate.value)) >= 2
  order by candidate.priority
  limit 1;

  v_display_name := coalesce(v_display_name, 'Recall+ User');

  insert into public.recall_profiles (
    id,
    display_name,
    timezone,
    timezone_initialized
  )
  values (new.id, v_display_name, 'Asia/Kolkata', true)
  on conflict (id) do nothing;

  insert into public.user_app_data (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_academic_profiles (
    user_id,
    board,
    grade,
    academic_year,
    curriculum_version_id,
    pathway,
    timezone,
    school_name,
    onboarding_completed,
    onboarding_completed_at
  )
  values (
    new.id,
    'CBSE',
    'XI',
    '2026-27',
    'cbse-2026-27-xi-v1',
    null,
    'Asia/Kolkata',
    null,
    false,
    null
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_recall_user() is
  'Creates owner-scoped Recall+ identity, snapshot, and incomplete academic-profile rows for every email or OAuth user.';

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

create trigger curriculum_versions_set_updated_at
  before update on public.curriculum_versions
  for each row execute function public.set_recall_updated_at();
create trigger curriculum_subjects_set_updated_at
  before update on public.curriculum_subjects
  for each row execute function public.set_recall_updated_at();
create trigger curriculum_nodes_set_updated_at
  before update on public.curriculum_nodes
  for each row execute function public.set_recall_updated_at();
create trigger user_academic_profiles_set_updated_at
  before update on public.user_academic_profiles
  for each row execute function public.set_recall_updated_at();
create trigger user_subjects_set_updated_at
  before update on public.user_subjects
  for each row execute function public.set_recall_updated_at();
create trigger user_subject_migration_candidates_set_updated_at
  before update on public.user_subject_migration_candidates
  for each row execute function public.set_recall_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security and least-privilege grants
-- ---------------------------------------------------------------------------

alter table public.curriculum_versions enable row level security;
alter table public.curriculum_subjects enable row level security;
alter table public.curriculum_nodes enable row level security;
alter table public.user_academic_profiles enable row level security;
alter table public.user_subjects enable row level security;
alter table public.user_subject_migration_candidates enable row level security;

-- Recall+ has no anonymous-account product flow. Anonymous Supabase users use
-- the authenticated Postgres role, so both the existing owner policies and
-- every new policy explicitly reject JWTs marked is_anonymous.
alter policy recall_profiles_select_own
on public.recall_profiles
using (
  (select auth.uid()) = id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

alter policy recall_profiles_update_own
on public.recall_profiles
using (
  (select auth.uid()) = id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
)
with check (
  (select auth.uid()) = id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

alter policy user_app_data_select_own
on public.user_app_data
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

alter policy user_app_data_insert_own
on public.user_app_data
with check (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

alter policy user_app_data_update_own
on public.user_app_data
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
)
with check (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

alter policy user_app_data_delete_own
on public.user_app_data
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy curriculum_versions_select_authenticated
on public.curriculum_versions
for select
to authenticated
using (
  status in ('reviewed', 'published')
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy curriculum_subjects_select_authenticated
on public.curriculum_subjects
for select
to authenticated
using (
  active
  and exists (
    select 1
    from public.curriculum_versions as versions
    where versions.id = curriculum_subjects.curriculum_version_id
      and versions.status in ('reviewed', 'published')
  )
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy curriculum_nodes_select_authenticated
on public.curriculum_nodes
for select
to authenticated
using (
  active
  and exists (
    select 1
    from public.curriculum_subjects as subjects
    join public.curriculum_versions as versions
      on versions.id = subjects.curriculum_version_id
    where subjects.id = curriculum_nodes.subject_id
      and subjects.active
      and versions.status in ('reviewed', 'published')
  )
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy user_academic_profiles_select_own
on public.user_academic_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy user_subjects_select_own
on public.user_subjects
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

create policy user_subject_migration_candidates_select_own
on public.user_subject_migration_candidates
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and not coalesce(
    (((select auth.jwt()) ->> 'is_anonymous')::boolean),
    false
  )
);

revoke all on table
  public.curriculum_versions,
  public.curriculum_subjects,
  public.curriculum_nodes,
  public.user_academic_profiles,
  public.user_subjects,
  public.user_subject_migration_candidates
from public, anon, authenticated;

grant select on table
  public.curriculum_versions,
  public.curriculum_subjects,
  public.curriculum_nodes,
  public.user_academic_profiles,
  public.user_subjects,
  public.user_subject_migration_candidates
to authenticated;

grant select, insert, update, delete on table
  public.curriculum_versions,
  public.curriculum_subjects,
  public.curriculum_nodes,
  public.user_academic_profiles,
  public.user_subjects,
  public.user_subject_migration_candidates
to service_role;

revoke all on table recall_private.curriculum_legacy_subject_aliases
  from public, anon, authenticated;
grant select, insert, update, delete
  on table recall_private.curriculum_legacy_subject_aliases
  to service_role;

grant usage on schema recall_private to authenticated;

revoke all on function public.initialize_recall_timezone(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.initialize_recall_timezone(uuid, text)
  to authenticated;
revoke all on function recall_private.initialize_recall_timezone_impl(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function recall_private.initialize_recall_timezone_impl(uuid, text)
  to authenticated;

revoke all on function public.upsert_recall_app_data(uuid, jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.upsert_recall_app_data(uuid, jsonb, bigint)
  to authenticated;
revoke all on function recall_private.upsert_recall_app_data_impl(uuid, jsonb, bigint)
  from public, anon, authenticated, service_role;
grant execute on function recall_private.upsert_recall_app_data_impl(uuid, jsonb, bigint)
  to authenticated;

revoke all on function public.validate_recall_subject_combination(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.validate_recall_subject_combination(jsonb)
  to authenticated;

revoke all on function public.save_recall_onboarding_progress(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_recall_onboarding_progress(text, text)
  to authenticated;
revoke all on function recall_private.save_recall_onboarding_progress_impl(text, text)
  from public, anon, authenticated, service_role;
grant execute on function recall_private.save_recall_onboarding_progress_impl(text, text)
  to authenticated;

revoke all on function public.save_recall_academic_profile(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_recall_academic_profile(text, text, jsonb)
  to authenticated;
revoke all on function recall_private.save_recall_academic_profile_impl(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function recall_private.save_recall_academic_profile_impl(text, text, jsonb)
  to authenticated;

revoke all on function public.refresh_recall_legacy_subject_candidates()
  from public, anon, authenticated, service_role;
grant execute on function public.refresh_recall_legacy_subject_candidates()
  to authenticated;
revoke all on function recall_private.refresh_legacy_subject_candidates_for_current_user()
  from public, anon, authenticated, service_role;
grant execute on function recall_private.refresh_legacy_subject_candidates_for_current_user()
  to authenticated;

revoke all on function recall_private.refresh_legacy_subject_candidates(uuid)
  from public, anon, authenticated;
grant execute on function recall_private.refresh_legacy_subject_candidates(uuid)
  to service_role;

revoke all on function public.validate_recall_user_subject_version()
  from public, anon, authenticated, service_role;
revoke all on function public.handle_new_recall_user()
  from public, anon, authenticated, service_role;

comment on table public.curriculum_versions is
  'Immutable academic-year curriculum versions backed by official CBSE sources.';
comment on table public.curriculum_subjects is
  'Official subject catalogue. Pathway tags are discovery hints, never authorization.';
comment on table public.curriculum_nodes is
  'Lazy-loadable official unit, chapter, topic, practical, project, and assessment hierarchy.';
comment on table public.user_academic_profiles is
  'One owner-scoped academic version and onboarding state per Recall+ user.';
comment on table public.user_subjects is
  'Confirmed main/additional subject selections. Removed subjects are archived, not deleted.';
comment on table public.user_subject_migration_candidates is
  'Owner-visible legacy subject detections awaiting explicit onboarding confirmation.';

commit;
