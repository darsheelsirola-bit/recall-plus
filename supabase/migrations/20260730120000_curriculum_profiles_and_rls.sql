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
values ($curriculum${
  "schemaVersion": 1,
  "idempotencyKey": "cbse-2026-27-xi-v1",
  "version": {
    "id": "cbse-2026-27-xi-v1",
    "board": "CBSE",
    "academicYear": "2026-27",
    "grade": "XI",
    "version": "1.0.0",
    "status": "reviewed",
    "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
    "sourceTitle": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
    "sourceHash": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042",
    "importedAt": "2026-07-30T00:00:00.000Z",
    "verifiedAt": "2026-07-30T00:00:00.000Z"
  },
  "subjects": [
    {
      "id": "cbse-2026-27-xi-001",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "001",
      "name": "English Elective",
      "shortName": "English Elective",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common",
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
        "title": "English Elective, Classes XI-XII, 2026-27",
        "sha256": "624caad4033a7fd99760c96ec5fa23763739d243b12c52446c9ab6d581fbecb2"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 1,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-301",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "301",
      "name": "English Core",
      "shortName": "English Core",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common",
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
        "title": "English Core, Classes XI-XII, 2026-27",
        "sha256": "d2af35ab80de3dc6f1f62f3cd2b58f9cc95a39ca1d47abc45412a1034459092c"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 2,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-002",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "002",
      "name": "Hindi Elective",
      "shortName": "Hindi Elective",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common",
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
        "title": "Hindi Elective, Classes XI-XII, 2026-27",
        "sha256": "6f288e1cc34cdb341348d176ad6a748a6760966675dc93e6644e5fe971dbbccb"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 3,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-302",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "302",
      "name": "Hindi Core",
      "shortName": "Hindi Core",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common",
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
        "title": "Hindi Core, Classes XI-XII, 2026-27",
        "sha256": "5edab54393581154c2cf8b78802af528c2c1daeb7acfc377c461851b00f55d51"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 4,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-003",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "003",
      "name": "Urdu Elective",
      "shortName": "Urdu Elective",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 5,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-303",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "303",
      "name": "Urdu Core",
      "shortName": "Urdu Core",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 6,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-022",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "022",
      "name": "Sanskrit Elective",
      "shortName": "Sanskrit Elective",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 7,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-322",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "322",
      "name": "Sanskrit Core",
      "shortName": "Sanskrit Core",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 8,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-104",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "104",
      "name": "Punjabi",
      "shortName": "Punjabi",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 9,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-105",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "105",
      "name": "Bengali",
      "shortName": "Bengali",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 10,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-106",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "106",
      "name": "Tamil",
      "shortName": "Tamil",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 11,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-107",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "107",
      "name": "Telugu (AP)",
      "shortName": "Telugu AP",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 12,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-189",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "189",
      "name": "Telugu (Telangana)",
      "shortName": "Telugu Telangana",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 13,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-108",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "108",
      "name": "Sindhi",
      "shortName": "Sindhi",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 14,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-109",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "109",
      "name": "Marathi",
      "shortName": "Marathi",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 15,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-110",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "110",
      "name": "Gujarati",
      "shortName": "Gujarati",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 16,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-111",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "111",
      "name": "Manipuri",
      "shortName": "Manipuri",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 17,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-112",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "112",
      "name": "Malayalam",
      "shortName": "Malayalam",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 18,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-113",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "113",
      "name": "Odia",
      "shortName": "Odia",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 19,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-114",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "114",
      "name": "Assamese",
      "shortName": "Assamese",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 20,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-115",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "115",
      "name": "Kannada",
      "shortName": "Kannada",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 21,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-116",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "116",
      "name": "Arabic",
      "shortName": "Arabic",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 22,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-117",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "117",
      "name": "Tibetan",
      "shortName": "Tibetan",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 23,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-118",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "118",
      "name": "French",
      "shortName": "French",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 24,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-120",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "120",
      "name": "German",
      "shortName": "German",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 25,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-121",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "121",
      "name": "Russian",
      "shortName": "Russian",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 26,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-123",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "123",
      "name": "Persian",
      "shortName": "Persian",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 27,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-124",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "124",
      "name": "Nepali",
      "shortName": "Nepali",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 28,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-125",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "125",
      "name": "Limboo",
      "shortName": "Limboo",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 29,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-126",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "126",
      "name": "Lepcha",
      "shortName": "Lepcha",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 30,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-188",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "188",
      "name": "Bhoti",
      "shortName": "Bhoti",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 31,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-191",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "191",
      "name": "Kokborok",
      "shortName": "Kokborok",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 32,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-192",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "192",
      "name": "Bodo",
      "shortName": "Bodo",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 33,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-193",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "193",
      "name": "Tangkhul",
      "shortName": "Tangkhul",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 34,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-194",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "194",
      "name": "Japanese",
      "shortName": "Japanese",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 35,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-195",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "195",
      "name": "Bhutia",
      "shortName": "Bhutia",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 36,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-196",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "196",
      "name": "Spanish",
      "shortName": "Spanish",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 37,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-197",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "197",
      "name": "Kashmiri",
      "shortName": "Kashmiri",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 38,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-198",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "198",
      "name": "Mizo",
      "shortName": "Mizo",
      "subjectGroup": "L",
      "category": "language",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "language"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 39,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-027",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "027",
      "name": "History",
      "shortName": "History",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
        "title": "History, Classes XI-XII, 2026-27",
        "sha256": "7c0c1280f90db4cf7f38824723ddda852c250bcbb5a458a20c2977c4381e53c4"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 1,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-028",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "028",
      "name": "Political Science",
      "shortName": "Political Science",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
        "title": "Political Science, Classes XI-XII, 2026-27",
        "sha256": "0914d089d6cd78cf56eec27fff9d42400706d8edf04163a9106b242df9e617e8"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 2,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-029",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "029",
      "name": "Geography",
      "shortName": "Geography",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
        "title": "Geography, Classes XI-XII, 2026-27",
        "sha256": "00e85430d75f8063902943817a57c9f22f037efb1d188b26d342b88550f8b90b"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 3,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-030",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "030",
      "name": "Economics",
      "shortName": "Economics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
        "title": "Economics, Classes XI-XII, 2026-27",
        "sha256": "927800c6e72b377509533fbe281fb1aa72383e20a3ab5b7b480bd976330b49fa"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 4,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-031",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "031",
      "name": "Carnatic Music (Vocal)",
      "shortName": "Carnatic Music (Vocal)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 5,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-032",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "032",
      "name": "Carnatic Music (Melodic Instruments)",
      "shortName": "Carnatic Music (Melodic Instruments)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 6,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-033",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "033",
      "name": "Carnatic Music (Percussion Instruments - Mridangam)",
      "shortName": "Carnatic Music (Percussion Instruments - Mridangam)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 7,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-034",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "034",
      "name": "Hindustani Music (Vocal)",
      "shortName": "Hindustani Music (Vocal)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 8,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-035",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "035",
      "name": "Hindustani Music (Melodic Instruments)",
      "shortName": "Hindustani Music (Melodic Instruments)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 9,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-036",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "036",
      "name": "Hindustani Music (Percussion Instruments)",
      "shortName": "Hindustani Music (Percussion Instruments)",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 10,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-037",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "037",
      "name": "Psychology",
      "shortName": "Psychology",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
        "title": "Psychology, Classes XI-XII, 2026-27",
        "sha256": "98f63864c0e161fc5d31347764e1edf591de7ae2028a9351c5519fb3429d216a"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 11,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-039",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "039",
      "name": "Sociology",
      "shortName": "Sociology",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
        "title": "Sociology, Classes XI-XII, 2026-27",
        "sha256": "8b6ba4e2bd232445be46fb01a64030a6d1b7af3d0cd066fefca73a0850a10684"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 12,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-041",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "041",
      "name": "Mathematics",
      "shortName": "Mathematics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science",
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
        "title": "Mathematics, Classes XI-XII, 2026-27",
        "sha256": "5bf4105d4076189fe00b879fd6d41ffadec87a894a078a7fb912b2f219769572"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 13,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-241",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "241",
      "name": "Applied Mathematics",
      "shortName": "Applied Mathematics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
        "title": "Applied Mathematics, Classes XI-XII, 2026-27",
        "sha256": "3125b1b6b00d8081bff34a1276d5f5203daa719af961d943380b4b0cb9d35a70"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 14,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-042",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "042",
      "name": "Physics",
      "shortName": "Physics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
        "title": "Physics, Classes XI-XII, 2026-27",
        "sha256": "9e32271cf5a86caa605cffe2a4b5e19710abc3d3a8715ef725ba78cd94caf1f7"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 15,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-043",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "043",
      "name": "Chemistry",
      "shortName": "Chemistry",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
        "title": "Chemistry, Classes XI-XII, 2026-27",
        "sha256": "5610f09d357d3ccc9a7b39fc29cb7b1f4530847753783b16c72fff691acd2418"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 16,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-044",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "044",
      "name": "Biology",
      "shortName": "Biology",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
        "title": "Biology, Classes XI-XII, 2026-27",
        "sha256": "3a5767515b41b12b9356151e759beba48bb15a1b711b96c321fa273a7fa7a6ee"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 17,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-045",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "045",
      "name": "Biotechnology",
      "shortName": "Biotechnology",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "science"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 18,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-046",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "046",
      "name": "Engineering Graphics",
      "shortName": "Engineering Graphics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "science"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 19,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-048",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "048",
      "name": "Physical Education",
      "shortName": "Physical Education",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
        "title": "Physical Education, Classes XI-XII, 2026-27",
        "sha256": "5a063f5bdc3a92d60a4a86e83c985ffafc7d716359ab511cb2f09a0275c02c7a"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 20,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-049",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "049",
      "name": "Painting",
      "shortName": "Painting",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 21,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-050",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "050",
      "name": "Graphics",
      "shortName": "Graphics",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 22,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-051",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "051",
      "name": "Sculpture",
      "shortName": "Sculpture",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 23,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-052",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "052",
      "name": "Applied/Commercial Art",
      "shortName": "Applied/Commercial Art",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 24,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-054",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "054",
      "name": "Business Studies",
      "shortName": "Business Studies",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "commerce"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
        "title": "Business Studies, Classes XI-XII, 2026-27",
        "sha256": "94230c4d0627fc919ca96dd02dd1df1f21a065dd1f04455df364df7350fa8cb2"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 25,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-055",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "055",
      "name": "Accountancy",
      "shortName": "Accountancy",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "commerce"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
        "title": "Accountancy, Classes XI-XII, 2026-27",
        "sha256": "4a87dbd15758e42c2aa454d83708299a04b6fc12896392b13d12b9ae857ecc27"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 26,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-056",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "056",
      "name": "Kathak Dance",
      "shortName": "Kathak Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 27,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-057",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "057",
      "name": "Bharatanatyam Dance",
      "shortName": "Bharatanatyam Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 28,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-058",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "058",
      "name": "Kuchipudi Dance",
      "shortName": "Kuchipudi Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 29,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-059",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "059",
      "name": "Odissi Dance",
      "shortName": "Odissi Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 30,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-060",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "060",
      "name": "Manipuri Dance",
      "shortName": "Manipuri Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 31,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-061",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "061",
      "name": "Kathakali Dance",
      "shortName": "Kathakali Dance",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 32,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-064",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "064",
      "name": "Home Science",
      "shortName": "Home Science",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
        "title": "Home Science, Classes XI-XII, 2026-27",
        "sha256": "a8bb5904a25b50a3a4b145cca47f74fa9a6f9e4cf66d39a5fec09e50e1358fdb"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 33,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-065",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "065",
      "name": "Informatics Practices",
      "shortName": "Informatics Practices",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science",
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
        "title": "Informatics Practices, Classes XI-XII, 2026-27",
        "sha256": "05747d6271e50d1221f312c710a3175e967f6d2d0f29a0f2cbc992f8267f8d34"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 34,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-083",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "083",
      "name": "Computer Science",
      "shortName": "Computer Science",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science",
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf",
        "title": "Computer Science, Classes XI-XII, 2026-27",
        "sha256": "a46821a87292e5feb296a1ffdb5163f413258d1cb378b871c745539e34f96e82"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 35,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-066",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "066",
      "name": "Entrepreneurship",
      "shortName": "Entrepreneurship",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "commerce"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 36,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-073",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "073",
      "name": "Knowledge Tradition and Practices of India",
      "shortName": "Knowledge Traditions",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 37,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-074",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "074",
      "name": "Legal Studies",
      "shortName": "Legal Studies",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": true,
      "hasPractical": false,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "commerce",
        "humanities"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
        "title": "Legal Studies, Classes XI-XII, 2026-27",
        "sha256": "d1f7836c059406e66d6b092cffddb5120adb27a826be7b6413936fc330dd7348"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 38,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-076",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "076",
      "name": "NCC",
      "shortName": "NCC",
      "subjectGroup": "A",
      "category": "academic_elective",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": null,
      "pathwayTags": [],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 39,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-801",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "801",
      "name": "Retail",
      "shortName": "Retail",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 1,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-802",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "802",
      "name": "Information Technology",
      "shortName": "Information Technology",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
        "title": "Information Technology (802), Classes XI-XII, 2026-27",
        "sha256": "c85720f1a12459593ed5096fed7d7f2b36cfed88f89cd897806b66cc993364c7"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 2,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-803",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "803",
      "name": "Web Application",
      "shortName": "Web Application",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 3,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-804",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "804",
      "name": "Automotive",
      "shortName": "Automotive",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 4,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-805",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "805",
      "name": "Financial Markets Management",
      "shortName": "Financial Markets Management",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 5,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-806",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "806",
      "name": "Tourism",
      "shortName": "Tourism",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 6,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-807",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "807",
      "name": "Beauty and Wellness",
      "shortName": "Beauty and Wellness",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 7,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-808",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "808",
      "name": "Agriculture",
      "shortName": "Agriculture",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 8,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-809",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "809",
      "name": "Food Production",
      "shortName": "Food Production",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 9,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-810",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "810",
      "name": "Front Office Operations",
      "shortName": "Front Office Operations",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 10,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-811",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "811",
      "name": "Banking",
      "shortName": "Banking",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 11,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-812",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "812",
      "name": "Marketing",
      "shortName": "Marketing",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 12,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-813",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "813",
      "name": "Health Care",
      "shortName": "Health Care",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 13,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-814",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "814",
      "name": "Insurance",
      "shortName": "Insurance",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 14,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-816",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "816",
      "name": "Horticulture",
      "shortName": "Horticulture",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 15,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-817",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "817",
      "name": "Typography and Computer Application",
      "shortName": "Typography and Computer Application",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 16,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-818",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "818",
      "name": "Geospatial Technology",
      "shortName": "Geospatial Technology",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 17,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-819",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "819",
      "name": "Electrical Technology",
      "shortName": "Electrical Technology",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 18,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-820",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "820",
      "name": "Electronic Technology",
      "shortName": "Electronic Technology",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 19,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-821",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "821",
      "name": "Multi-Media",
      "shortName": "Multi-Media",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 20,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-822",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "822",
      "name": "Taxation",
      "shortName": "Taxation",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 21,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-823",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "823",
      "name": "Cost Accounting",
      "shortName": "Cost Accounting",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 22,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-824",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "824",
      "name": "Office Procedures and Practices",
      "shortName": "Office Procedures and Practices",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 23,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-825",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "825",
      "name": "Shorthand (English)",
      "shortName": "Shorthand (English)",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 24,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-826",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "826",
      "name": "Shorthand (Hindi)",
      "shortName": "Shorthand (Hindi)",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 25,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-827",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "827",
      "name": "Air-Conditioning and Refrigeration",
      "shortName": "Air-Conditioning and Refrigeration",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 26,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-828",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "828",
      "name": "Medical Diagnostics",
      "shortName": "Medical Diagnostics",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 27,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-829",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "829",
      "name": "Textile Design",
      "shortName": "Textile Design",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 28,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-830",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "830",
      "name": "Design",
      "shortName": "Design",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 29,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-831",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "831",
      "name": "Salesmanship",
      "shortName": "Salesmanship",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 30,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-833",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "833",
      "name": "Business Administration",
      "shortName": "Business Administration",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "commerce",
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 31,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-834",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "834",
      "name": "Food Nutrition and Dietetics",
      "shortName": "Food Nutrition and Dietetics",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 32,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-835",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "835",
      "name": "Mass Media Studies",
      "shortName": "Mass Media Studies",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "humanities",
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 33,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-836",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "836",
      "name": "Library and Information Science",
      "shortName": "Library and Information Science",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 34,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-837",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "837",
      "name": "Fashion Studies",
      "shortName": "Fashion Studies",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 35,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-841",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "841",
      "name": "Yoga",
      "shortName": "Yoga",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 36,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-842",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "842",
      "name": "Early Childhood Care and Education",
      "shortName": "Early Childhood Care and Education",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 37,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-843",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "843",
      "name": "Artificial Intelligence",
      "shortName": "Artificial Intelligence",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": false,
      "pathwayTags": [
        "science",
        "commerce",
        "humanities",
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
        "title": "Artificial Intelligence (843), Class XI, 2026-27",
        "sha256": "3c5f083923758ceab8c5af60171bde3c95b839620a3da046cefc968eddc4a6d8"
      },
      "contentStatus": "verified_outline",
      "officialOrder": 38,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-844",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "844",
      "name": "Data Science",
      "shortName": "Data Science",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "science",
        "commerce",
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 39,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-845",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "845",
      "name": "Physical Activity Trainer",
      "shortName": "Physical Activity Trainer",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 40,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-846",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "846",
      "name": "Land Transportation Associate",
      "shortName": "Land Transportation Associate",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 41,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-847",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "847",
      "name": "Electronics and Hardware",
      "shortName": "Electronics and Hardware",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 42,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-848",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": "848",
      "name": "Design Thinking and Innovation",
      "shortName": "Design Thinking and Innovation",
      "subjectGroup": "S",
      "category": "skill_elective",
      "hasTheory": true,
      "hasPractical": true,
      "hasInternalAssessment": null,
      "pathwayTags": [
        "skill"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/Curriculum24/SkillSubjects_SrSec2023.pdf",
        "title": "CBSE Skill Subjects Offered at Senior Secondary Level",
        "sha256": "4c04f1382b3c209465ddc8237e18641a2f94a442d91a8846ba2e40fbf766dc25"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 43,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-ia-hpe",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": null,
      "name": "Health and Physical Education",
      "shortName": "Health and Physical Education",
      "subjectGroup": "IA",
      "category": "internal_assessment",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 1,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-ia-work-experience",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": null,
      "name": "Work Experience",
      "shortName": "Work Experience",
      "subjectGroup": "IA",
      "category": "internal_assessment",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 2,
      "active": true
    },
    {
      "id": "cbse-2026-27-xi-ia-general-studies",
      "curriculumVersionId": "cbse-2026-27-xi-v1",
      "subjectCode": null,
      "name": "General Studies",
      "shortName": "General Studies",
      "subjectGroup": "IA",
      "category": "internal_assessment",
      "hasTheory": null,
      "hasPractical": null,
      "hasInternalAssessment": true,
      "pathwayTags": [
        "common"
      ],
      "source": {
        "url": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf",
        "title": "Secondary Curriculum Part II (Classes XI-XII), 2026-27",
        "sha256": "5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042"
      },
      "contentStatus": "pending_verification",
      "officialOrder": 3,
      "active": true
    }
  ],
  "nodes": [
    {
      "id": "node-cbse-2026-27-xi-241:unit:01:numbers-quantification-and-numerical-applications",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Numbers, Quantification and Numerical Applications",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:01:numbers-quantification-and-numerical-applications",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:02:algebra",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Algebra",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:02:algebra",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:03:calculus",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Calculus",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:03:calculus",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:04:permutations-and-combinations-and-probability",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Permutations and Combinations and Probability",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:04:permutations-and-combinations-and-probability",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:05:descriptive-statistics",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Descriptive Statistics",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:05:descriptive-statistics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:06:financial-mathematics",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Financial Mathematics",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:06:financial-mathematics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:unit:07:coordinate-geometry",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "unit",
      "title": "Coordinate Geometry",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:unit:07:coordinate-geometry",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-241:practical:08:practical-and-project-work",
      "subjectId": "cbse-2026-27-xi-241",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical and Project Work",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 10,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-241:practical:08:practical-and-project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:assessment_area:01:reading-skills",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Reading Skills",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:assessment_area:01:reading-skills",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:assessment_area:02:grammar-and-creative-writing-skills",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Grammar and Creative Writing Skills",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:assessment_area:02:grammar-and-creative-writing-skills",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": null,
      "nodeType": "unit",
      "title": "Literature Text Book and Supplementary Reading Text",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 9,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text:topic:01:hornbill",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": "node-cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text",
      "nodeType": "topic",
      "title": "Hornbill",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 9,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text:topic:01:hornbill",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text:topic:02:snapshots",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": "node-cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text",
      "nodeType": "topic",
      "title": "Snapshots",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 9,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:cbse-2026-27-xi-301:unit:03:literature-text-book-and-supplementary-reading-text:topic:02:snapshots",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:assessment_area:04:assessment-of-listening-and-speaking-skills",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Assessment of Listening and Speaking Skills",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 15,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:assessment_area:04:assessment-of-listening-and-speaking-skills",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-301:project:05:project-work",
      "subjectId": "cbse-2026-27-xi-301",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 16,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-301:project:05:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:assessment_area:01:अपठ-त-ब-ध",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "अपठित बोध",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:assessment_area:01:अपठ-त-ब-ध",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:assessment_area:02:अभ-व-यक-त-और-म-ध-यम",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "अभिव्यक्ति और माध्यम",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:assessment_area:02:अभ-व-यक-त-और-म-ध-यम",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:unit:03:आर-ह-भ-ग-1",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "unit",
      "title": "आरोह भाग-1",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:unit:03:आर-ह-भ-ग-1",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:unit:04:व-त-न-भ-ग-1",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "unit",
      "title": "वितान भाग-1",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:unit:04:व-त-न-भ-ग-1",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:assessment_area:05:श-रवण-तथ-व-चन",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "श्रवण तथा वाचन",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:assessment_area:05:श-रवण-तथ-व-चन",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-302:project:06:पर-य-जन-क-र-य",
      "subjectId": "cbse-2026-27-xi-302",
      "parentId": null,
      "nodeType": "project",
      "title": "परियोजना कार्य",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-302:project:06:पर-य-जन-क-र-य",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:unit:01:computer-organization",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "unit",
      "title": "Computer Organization",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:unit:01:computer-organization",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:unit:02:networking-and-internet",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "unit",
      "title": "Networking and Internet",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:unit:02:networking-and-internet",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:unit:03:office-automation-tools",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "unit",
      "title": "Office Automation Tools",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:unit:03:office-automation-tools",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:unit:04:rdbms",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "unit",
      "title": "RDBMS",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:unit:04:rdbms",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:unit:05:fundamentals-of-java",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "unit",
      "title": "Fundamentals of Java",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:unit:05:fundamentals-of-java",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:practical:06:office-automation-tools-java-and-mysql-practical-work",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "practical",
      "title": "Office Automation Tools, Java and MySQL Practical Work",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:practical:06:office-automation-tools-java-and-mysql-practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-802:project:07:project-work",
      "subjectId": "cbse-2026-27-xi-802",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/802-IT.pdf",
      "externalKey": "cbse-2026-27-xi-802:project:07:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:01:introduction-artificial-intelligence-for-everyone",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction: Artificial Intelligence for Everyone",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:01:introduction-artificial-intelligence-for-everyone",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:02:unlocking-your-future-in-ai",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Unlocking Your Future in AI",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:02:unlocking-your-future-in-ai",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:03:python-programming",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Python Programming",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:03:python-programming",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:04:introduction-to-capstone-project",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to Capstone Project",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:04:introduction-to-capstone-project",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:05:data-literacy-data-collection-to-data-analysis",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Data Literacy - Data Collection to Data Analysis",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:05:data-literacy-data-collection-to-data-analysis",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:06:machine-learning-algorithms",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Machine Learning Algorithms",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:06:machine-learning-algorithms",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:07:leveraging-linguistics-and-computer-science",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "Leveraging Linguistics and Computer Science",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:07:leveraging-linguistics-and-computer-science",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:unit:08:ai-ethics-and-values",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "unit",
      "title": "AI Ethics and Values",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:unit:08:ai-ethics-and-values",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:practical:09:practical-work",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:practical:09:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-843:project:10:capstone-project",
      "subjectId": "cbse-2026-27-xi-843",
      "parentId": null,
      "nodeType": "project",
      "title": "Capstone Project",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/Curriculum27/SrSec/843-AI-XI.pdf",
      "externalKey": "cbse-2026-27-xi-843:project:10:capstone-project",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:assessment_area:01:reading-comprehension",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Reading comprehension",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:assessment_area:01:reading-comprehension",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:assessment_area:02:creative-writing",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Creative writing",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:assessment_area:02:creative-writing",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:unit:03:literature",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": null,
      "nodeType": "unit",
      "title": "Literature",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:unit:03:literature",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:01:kaleidoscope-short-stories",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": "node-cbse-2026-27-xi-001:unit:03:literature",
      "nodeType": "topic",
      "title": "Kaleidoscope - Short Stories",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:01:kaleidoscope-short-stories",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:02:kaleidoscope-poetry",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": "node-cbse-2026-27-xi-001:unit:03:literature",
      "nodeType": "topic",
      "title": "Kaleidoscope - Poetry",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:02:kaleidoscope-poetry",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:03:kaleidoscope-non-fiction",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": "node-cbse-2026-27-xi-001:unit:03:literature",
      "nodeType": "topic",
      "title": "Kaleidoscope - Non-fiction",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:03:kaleidoscope-non-fiction",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:04:drama",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": "node-cbse-2026-27-xi-001:unit:03:literature",
      "nodeType": "topic",
      "title": "Drama",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:04:drama",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:05:fiction",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": "node-cbse-2026-27-xi-001:unit:03:literature",
      "nodeType": "topic",
      "title": "Fiction",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:cbse-2026-27-xi-001:unit:03:literature:topic:05:fiction",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-001:project:04:seminar",
      "subjectId": "cbse-2026-27-xi-001",
      "parentId": null,
      "nodeType": "project",
      "title": "Seminar",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-001:project:04:seminar",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-002:assessment_area:01:अपठ-त-ब-ध",
      "subjectId": "cbse-2026-27-xi-002",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "अपठित बोध",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-002:assessment_area:01:अपठ-त-ब-ध",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-002:assessment_area:02:अभ-व-यक-त-और-म-ध-यम",
      "subjectId": "cbse-2026-27-xi-002",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "अभिव्यक्ति और माध्यम",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-002:assessment_area:02:अभ-व-यक-त-और-म-ध-यम",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-002:unit:03:अ-तर-भ-ग-1",
      "subjectId": "cbse-2026-27-xi-002",
      "parentId": null,
      "nodeType": "unit",
      "title": "अंतरा भाग-1",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-002:unit:03:अ-तर-भ-ग-1",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-002:unit:04:अ-तर-ल-भ-ग-1",
      "subjectId": "cbse-2026-27-xi-002",
      "parentId": null,
      "nodeType": "unit",
      "title": "अंतराल भाग-1",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-002:unit:04:अ-तर-ल-भ-ग-1",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-002:project:05:पर-य-जन-क-र-य",
      "subjectId": "cbse-2026-27-xi-002",
      "parentId": null,
      "nodeType": "project",
      "title": "परियोजना कार्य",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Elective_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-002:project:05:पर-य-जन-क-र-य",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": null,
      "nodeType": "unit",
      "title": "Themes in World History",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:01:writing-and-city-life",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "Writing and City Life",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:01:writing-and-city-life",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:02:an-empire-across-three-continents",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "An Empire Across Three Continents",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:02:an-empire-across-three-continents",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:03:nomadic-empires",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "Nomadic Empires",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:03:nomadic-empires",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:04:the-three-orders",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "The Three Orders",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:04:the-three-orders",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:05:changing-cultural-traditions",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "Changing Cultural Traditions",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:05:changing-cultural-traditions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:06:displacing-indigenous-peoples",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "Displacing Indigenous Peoples",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:06:displacing-indigenous-peoples",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:07:paths-to-modernisation",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": "node-cbse-2026-27-xi-027:unit:01:themes-in-world-history",
      "nodeType": "chapter",
      "title": "Paths to Modernisation",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:cbse-2026-27-xi-027:unit:01:themes-in-world-history:chapter:07:paths-to-modernisation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:assessment_area:02:map-work",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Map Work",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:assessment_area:02:map-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-027:project:03:project-work",
      "subjectId": "cbse-2026-27-xi-027",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-027:project:03:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": null,
      "nodeType": "unit",
      "title": "Indian Constitution at Work",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:01:constitution-why-and-how",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Constitution: Why and How?",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:01:constitution-why-and-how",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:02:rights-in-the-indian-constitution",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Rights in the Indian Constitution",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:02:rights-in-the-indian-constitution",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:03:election-and-representation",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Election and Representation",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:03:election-and-representation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:04:executive",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Executive",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:04:executive",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:05:legislature",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Legislature",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:05:legislature",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:06:judiciary",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Judiciary",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:06:judiciary",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:07:federalism",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Federalism",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:07:federalism",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:08:local-governments",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Local Governments",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:08:local-governments",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:09:constitution-as-a-living-document",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "Constitution as a Living Document",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:09:constitution-as-a-living-document",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:10:the-philosophy-of-the-constitution",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:01:indian-constitution-at-work",
      "nodeType": "chapter",
      "title": "The Philosophy of the Constitution",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:01:indian-constitution-at-work:chapter:10:the-philosophy-of-the-constitution",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": null,
      "nodeType": "unit",
      "title": "Political Theory",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:unit:02:political-theory",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:01:political-theory-an-introduction",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Political Theory: An Introduction",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:01:political-theory-an-introduction",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:02:freedom",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Freedom",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:02:freedom",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:03:equality",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Equality",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:03:equality",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:04:social-justice",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Social Justice",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:04:social-justice",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:05:rights",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Rights",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:05:rights",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:06:citizenship",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Citizenship",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:06:citizenship",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:07:nationalism",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Nationalism",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:07:nationalism",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:08:secularism",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": "node-cbse-2026-27-xi-028:unit:02:political-theory",
      "nodeType": "chapter",
      "title": "Secularism",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:cbse-2026-27-xi-028:unit:02:political-theory:chapter:08:secularism",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-028:project:03:project-work",
      "subjectId": "cbse-2026-27-xi-028",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 18,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-028:project:03:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": null,
      "nodeType": "unit",
      "title": "Fundamentals of Physical Geography",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:01:geography-as-a-discipline",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Geography as a Discipline",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:01:geography-as-a-discipline",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:02:the-origin-and-evolution-of-the-earth",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "The Origin and Evolution of the Earth",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:02:the-origin-and-evolution-of-the-earth",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:03:interior-of-the-earth",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Interior of the Earth",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:03:interior-of-the-earth",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:04:distribution-of-oceans-and-continents",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Distribution of Oceans and Continents",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:04:distribution-of-oceans-and-continents",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:05:geomorphic-processes",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Geomorphic Processes",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:05:geomorphic-processes",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:06:landforms-and-their-evolution",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Landforms and their Evolution",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:06:landforms-and-their-evolution",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:07:composition-and-structure-of-atmosphere",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Composition and Structure of Atmosphere",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:07:composition-and-structure-of-atmosphere",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:08:solar-radiation-heat-balance-and-temperature",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Solar Radiation, Heat Balance and Temperature",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:08:solar-radiation-heat-balance-and-temperature",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:09:atmospheric-circulation-and-weather-systems",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Atmospheric Circulation and Weather Systems",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:09:atmospheric-circulation-and-weather-systems",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:10:water-in-the-atmosphere",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Water in the Atmosphere",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:10:water-in-the-atmosphere",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:11:world-climate-and-climate-change",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "World Climate and Climate Change",
      "description": null,
      "officialOrder": 11,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:11:world-climate-and-climate-change",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:12:water-oceans",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Water (Oceans)",
      "description": null,
      "officialOrder": 12,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:12:water-oceans",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:13:movements-of-ocean-water",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Movements of Ocean Water",
      "description": null,
      "officialOrder": 13,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:13:movements-of-ocean-water",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:14:biodiversity-and-conservation",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography",
      "nodeType": "chapter",
      "title": "Biodiversity and Conservation",
      "description": null,
      "officialOrder": 14,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:01:fundamentals-of-physical-geography:chapter:14:biodiversity-and-conservation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": null,
      "nodeType": "unit",
      "title": "India - Physical Environment",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:01:india-location",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "India - Location",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:01:india-location",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:02:structure-and-physiography",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "Structure and Physiography",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:02:structure-and-physiography",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:03:drainage-system",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "Drainage System",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:03:drainage-system",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:04:climate",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "Climate",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:04:climate",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:05:natural-vegetation",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "Natural Vegetation",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:05:natural-vegetation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:06:natural-hazards-and-disasters",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": "node-cbse-2026-27-xi-029:unit:02:india-physical-environment",
      "nodeType": "chapter",
      "title": "Natural Hazards and Disasters",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:cbse-2026-27-xi-029:unit:02:india-physical-environment:chapter:06:natural-hazards-and-disasters",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:practical:03:geography-practical-part-i",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": null,
      "nodeType": "practical",
      "title": "Geography Practical Part I",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:practical:03:geography-practical-part-i",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-029:assessment_area:04:map-work",
      "subjectId": "cbse-2026-27-xi-029",
      "parentId": null,
      "nodeType": "assessment_area",
      "title": "Map Work",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-029:assessment_area:04:map-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:unit:01:statistics-for-economics",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": null,
      "nodeType": "unit",
      "title": "Statistics for Economics",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": 40,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:unit:01:statistics-for-economics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:01:statistics-for-economics",
      "nodeType": "chapter",
      "title": "Introduction",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction:topic:01:what-is-economics",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction",
      "nodeType": "topic",
      "title": "What is Economics?",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction:topic:01:what-is-economics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction:topic:02:meaning-scope-functions-and-importance-of-statistics-in-economics",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction",
      "nodeType": "topic",
      "title": "Meaning, scope, functions and importance of statistics in Economics",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:01:introduction:topic:02:meaning-scope-functions-and-importance-of-statistics-in-economics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:01:statistics-for-economics",
      "nodeType": "chapter",
      "title": "Collection, Organisation and Presentation of Data",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:01:collection-of-data",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data",
      "nodeType": "topic",
      "title": "Collection of data",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:01:collection-of-data",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:02:organisation-of-data",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data",
      "nodeType": "topic",
      "title": "Organisation of data",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:02:organisation-of-data",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:03:presentation-of-data",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data",
      "nodeType": "topic",
      "title": "Presentation of data",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:02:collection-organisation-and-presentation-of-data:topic:03:presentation-of-data",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:01:statistics-for-economics",
      "nodeType": "chapter",
      "title": "Statistical Tools and Interpretation",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:01:measures-of-central-tendency",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation",
      "nodeType": "topic",
      "title": "Measures of Central Tendency",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:01:measures-of-central-tendency",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:02:correlation",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation",
      "nodeType": "topic",
      "title": "Correlation",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:02:correlation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:03:index-numbers",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation",
      "nodeType": "topic",
      "title": "Index Numbers",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:01:statistics-for-economics:chapter:03:statistical-tools-and-interpretation:topic:03:index-numbers",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introductory Microeconomics",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": 40,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:01:introduction",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "nodeType": "chapter",
      "title": "Introduction",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:01:introduction",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:02:consumer-s-equilibrium-and-demand",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "nodeType": "chapter",
      "title": "Consumer's Equilibrium and Demand",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:02:consumer-s-equilibrium-and-demand",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:03:producer-behaviour-and-supply",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "nodeType": "chapter",
      "title": "Producer Behaviour and Supply",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:03:producer-behaviour-and-supply",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:04:perfect-competition-price-determination-and-simple-applications",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": "node-cbse-2026-27-xi-030:unit:02:introductory-microeconomics",
      "nodeType": "chapter",
      "title": "Perfect Competition - Price Determination and Simple Applications",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:cbse-2026-27-xi-030:unit:02:introductory-microeconomics:chapter:04:perfect-competition-price-determination-and-simple-applications",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-030:project:03:project-in-economics",
      "subjectId": "cbse-2026-27-xi-030",
      "parentId": null,
      "nodeType": "project",
      "title": "Project in Economics",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-030:project:03:project-in-economics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:01:understanding-psychology",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Understanding Psychology",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:01:understanding-psychology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:02:methods-of-enquiry-in-psychology",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Methods of Enquiry in Psychology",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:02:methods-of-enquiry-in-psychology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:03:human-development",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Human Development",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:03:human-development",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:04:sensory-attentional-and-perceptual-processes",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Sensory, Attentional and Perceptual Processes",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:04:sensory-attentional-and-perceptual-processes",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:05:learning",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Learning",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:05:learning",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:06:human-memory",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Human Memory",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:06:human-memory",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:07:thinking",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Thinking",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:07:thinking",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:unit:08:motivation-and-emotion",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "unit",
      "title": "Motivation and Emotion",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:unit:08:motivation-and-emotion",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-037:practical:09:practical-work",
      "subjectId": "cbse-2026-27-xi-037",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-037:practical:09:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introducing Sociology",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:01:sociology-society-and-its-relationship-with-other-social-sciences",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "nodeType": "chapter",
      "title": "Sociology, Society and its Relationship with Other Social Sciences",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:01:sociology-society-and-its-relationship-with-other-social-sciences",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:02:terms-concepts-and-their-use-in-sociology",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "nodeType": "chapter",
      "title": "Terms, Concepts and their Use in Sociology",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:02:terms-concepts-and-their-use-in-sociology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:03:understanding-social-institutions",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "nodeType": "chapter",
      "title": "Understanding Social Institutions",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:03:understanding-social-institutions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:04:culture-and-socialization",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "nodeType": "chapter",
      "title": "Culture and Socialization",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:04:culture-and-socialization",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:05:doing-sociology-research-methods",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:01:introducing-sociology",
      "nodeType": "chapter",
      "title": "Doing Sociology: Research Methods",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:01:introducing-sociology:chapter:05:doing-sociology-research-methods",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": null,
      "nodeType": "unit",
      "title": "Understanding Society",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:unit:02:understanding-society",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:01:social-structure-stratification-and-social-processes-in-society",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "nodeType": "chapter",
      "title": "Social Structure, Stratification and Social Processes in Society",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:01:social-structure-stratification-and-social-processes-in-society",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:02:social-change-and-social-order-in-rural-and-urban-society",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "nodeType": "chapter",
      "title": "Social Change and Social Order in Rural and Urban Society",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:02:social-change-and-social-order-in-rural-and-urban-society",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:03:environment-and-society",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "nodeType": "chapter",
      "title": "Environment and Society",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:03:environment-and-society",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:04:introducing-western-sociologists",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "nodeType": "chapter",
      "title": "Introducing Western Sociologists",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:04:introducing-western-sociologists",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:05:indian-sociologists",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": "node-cbse-2026-27-xi-039:unit:02:understanding-society",
      "nodeType": "chapter",
      "title": "Indian Sociologists",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:cbse-2026-27-xi-039:unit:02:understanding-society:chapter:05:indian-sociologists",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-039:project:03:project-work",
      "subjectId": "cbse-2026-27-xi-039",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-039:project:03:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:unit:01:sets-and-functions",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": null,
      "nodeType": "unit",
      "title": "Sets and Functions",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": 23,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:unit:01:sets-and-functions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:01:sets",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:01:sets-and-functions",
      "nodeType": "chapter",
      "title": "Sets",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:01:sets",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:02:relations-and-functions",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:01:sets-and-functions",
      "nodeType": "chapter",
      "title": "Relations and Functions",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:02:relations-and-functions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:03:trigonometric-functions",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:01:sets-and-functions",
      "nodeType": "chapter",
      "title": "Trigonometric Functions",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:01:sets-and-functions:chapter:03:trigonometric-functions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": null,
      "nodeType": "unit",
      "title": "Algebra",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": 25,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:unit:02:algebra",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:01:complex-numbers-and-quadratic-equations",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "nodeType": "chapter",
      "title": "Complex Numbers and Quadratic Equations",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:01:complex-numbers-and-quadratic-equations",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:02:linear-inequalities",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "nodeType": "chapter",
      "title": "Linear Inequalities",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:02:linear-inequalities",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:03:permutations-and-combinations",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "nodeType": "chapter",
      "title": "Permutations and Combinations",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:03:permutations-and-combinations",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:04:binomial-theorem",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "nodeType": "chapter",
      "title": "Binomial Theorem",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:04:binomial-theorem",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:05:sequence-and-series",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:02:algebra",
      "nodeType": "chapter",
      "title": "Sequence and Series",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:02:algebra:chapter:05:sequence-and-series",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:unit:03:coordinate-geometry",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": null,
      "nodeType": "unit",
      "title": "Coordinate Geometry",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": 12,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:unit:03:coordinate-geometry",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:01:straight-lines",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:03:coordinate-geometry",
      "nodeType": "chapter",
      "title": "Straight Lines",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:01:straight-lines",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:02:conic-sections",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:03:coordinate-geometry",
      "nodeType": "chapter",
      "title": "Conic Sections",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:02:conic-sections",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:03:introduction-to-three-dimensional-geometry",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:03:coordinate-geometry",
      "nodeType": "chapter",
      "title": "Introduction to Three-dimensional Geometry",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:03:coordinate-geometry:chapter:03:introduction-to-three-dimensional-geometry",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:unit:04:calculus",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": null,
      "nodeType": "unit",
      "title": "Calculus",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": 8,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:unit:04:calculus",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:04:calculus:chapter:01:limits-and-derivatives",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:04:calculus",
      "nodeType": "chapter",
      "title": "Limits and Derivatives",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:04:calculus:chapter:01:limits-and-derivatives",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:unit:05:statistics-and-probability",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": null,
      "nodeType": "unit",
      "title": "Statistics and Probability",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": 12,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:unit:05:statistics-and-probability",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:05:statistics-and-probability:chapter:01:statistics",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:05:statistics-and-probability",
      "nodeType": "chapter",
      "title": "Statistics",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:05:statistics-and-probability:chapter:01:statistics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:05:statistics-and-probability:chapter:02:probability",
      "subjectId": "cbse-2026-27-xi-041",
      "parentId": "node-cbse-2026-27-xi-041:unit:05:statistics-and-probability",
      "nodeType": "chapter",
      "title": "Probability",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-041:cbse-2026-27-xi-041:unit:05:statistics-and-probability:chapter:02:probability",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:01:physical-world-and-measurement",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Physical World and Measurement",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:01:physical-world-and-measurement",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:01:physical-world-and-measurement:chapter:01:units-and-measurements",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:01:physical-world-and-measurement",
      "nodeType": "chapter",
      "title": "Units and Measurements",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:01:physical-world-and-measurement:chapter:01:units-and-measurements",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:02:kinematics",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Kinematics",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:02:kinematics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:02:kinematics:chapter:01:motion-in-a-straight-line",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:02:kinematics",
      "nodeType": "chapter",
      "title": "Motion in a Straight Line",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:02:kinematics:chapter:01:motion-in-a-straight-line",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:02:kinematics:chapter:02:motion-in-a-plane",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:02:kinematics",
      "nodeType": "chapter",
      "title": "Motion in a Plane",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:02:kinematics:chapter:02:motion-in-a-plane",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:03:laws-of-motion",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Laws of Motion",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:03:laws-of-motion",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:03:laws-of-motion:chapter:01:laws-of-motion",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:03:laws-of-motion",
      "nodeType": "chapter",
      "title": "Laws of Motion",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:03:laws-of-motion:chapter:01:laws-of-motion",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:04:work-energy-and-power",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Work, Energy and Power",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:04:work-energy-and-power",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:04:work-energy-and-power:chapter:01:work-energy-and-power",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:04:work-energy-and-power",
      "nodeType": "chapter",
      "title": "Work, Energy and Power",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:04:work-energy-and-power:chapter:01:work-energy-and-power",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:05:motion-of-system-of-particles-and-rigid-body",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Motion of System of Particles and Rigid Body",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:05:motion-of-system-of-particles-and-rigid-body",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:05:motion-of-system-of-particles-and-rigid-body:chapter:01:system-of-particles-and-rotational-motion",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:05:motion-of-system-of-particles-and-rigid-body",
      "nodeType": "chapter",
      "title": "System of Particles and Rotational Motion",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:05:motion-of-system-of-particles-and-rigid-body:chapter:01:system-of-particles-and-rotational-motion",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:06:gravitation",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Gravitation",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:06:gravitation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:06:gravitation:chapter:01:gravitation",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:06:gravitation",
      "nodeType": "chapter",
      "title": "Gravitation",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:06:gravitation:chapter:01:gravitation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Properties of Bulk Matter",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:01:mechanical-properties-of-solids",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter",
      "nodeType": "chapter",
      "title": "Mechanical Properties of Solids",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:01:mechanical-properties-of-solids",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:02:mechanical-properties-of-fluids",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter",
      "nodeType": "chapter",
      "title": "Mechanical Properties of Fluids",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:02:mechanical-properties-of-fluids",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:03:thermal-properties-of-matter",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter",
      "nodeType": "chapter",
      "title": "Thermal Properties of Matter",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:07:properties-of-bulk-matter:chapter:03:thermal-properties-of-matter",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:08:thermodynamics",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Thermodynamics",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:08:thermodynamics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:08:thermodynamics:chapter:01:thermodynamics",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:08:thermodynamics",
      "nodeType": "chapter",
      "title": "Thermodynamics",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:08:thermodynamics:chapter:01:thermodynamics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:09:behaviour-of-perfect-gases-and-kinetic-theory-of-gases",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Behaviour of Perfect Gases and Kinetic Theory of Gases",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:09:behaviour-of-perfect-gases-and-kinetic-theory-of-gases",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:09:behaviour-of-perfect-gases-and-kinetic-theory-of-gases:chapter:01:kinetic-theory",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:09:behaviour-of-perfect-gases-and-kinetic-theory-of-gases",
      "nodeType": "chapter",
      "title": "Kinetic Theory",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:09:behaviour-of-perfect-gases-and-kinetic-theory-of-gases:chapter:01:kinetic-theory",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:unit:10:oscillations-and-waves",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "unit",
      "title": "Oscillations and Waves",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:unit:10:oscillations-and-waves",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:10:oscillations-and-waves:chapter:01:oscillations",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:10:oscillations-and-waves",
      "nodeType": "chapter",
      "title": "Oscillations",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:10:oscillations-and-waves:chapter:01:oscillations",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:10:oscillations-and-waves:chapter:02:waves",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": "node-cbse-2026-27-xi-042:unit:10:oscillations-and-waves",
      "nodeType": "chapter",
      "title": "Waves",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:cbse-2026-27-xi-042:unit:10:oscillations-and-waves:chapter:02:waves",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-042:practical:11:practical-work",
      "subjectId": "cbse-2026-27-xi-042",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 11,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-042:practical:11:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:01:some-basic-concepts-of-chemistry",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Some Basic Concepts of Chemistry",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:01:some-basic-concepts-of-chemistry",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:02:structure-of-atom",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Structure of Atom",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:02:structure-of-atom",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:03:classification-of-elements-and-periodicity-in-properties",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Classification of Elements and Periodicity in Properties",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:03:classification-of-elements-and-periodicity-in-properties",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:04:chemical-bonding-and-molecular-structure",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Chemical Bonding and Molecular Structure",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:04:chemical-bonding-and-molecular-structure",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:05:thermodynamics",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Thermodynamics",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:05:thermodynamics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:06:equilibrium",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Equilibrium",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:06:equilibrium",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:07:redox-reactions",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Redox Reactions",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:07:redox-reactions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:08:organic-chemistry-some-basic-principles-and-techniques",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Organic Chemistry - Some Basic Principles and Techniques",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:08:organic-chemistry-some-basic-principles-and-techniques",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:unit:09:hydrocarbons",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "unit",
      "title": "Hydrocarbons",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:unit:09:hydrocarbons",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:practical:10:practical-work",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:practical:10:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-043:project:11:project-work",
      "subjectId": "cbse-2026-27-xi-043",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 11,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-043:project:11:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "unit",
      "title": "Diversity of Living Organisms",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:01:the-living-world",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "nodeType": "chapter",
      "title": "The Living World",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:01:the-living-world",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:02:biological-classification",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "nodeType": "chapter",
      "title": "Biological Classification",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:02:biological-classification",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:03:plant-kingdom",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "nodeType": "chapter",
      "title": "Plant Kingdom",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:03:plant-kingdom",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:04:animal-kingdom",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms",
      "nodeType": "chapter",
      "title": "Animal Kingdom",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:01:diversity-of-living-organisms:chapter:04:animal-kingdom",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "unit",
      "title": "Structural Organization in Plants and Animals",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:01:morphology-of-flowering-plants",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals",
      "nodeType": "chapter",
      "title": "Morphology of Flowering Plants",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:01:morphology-of-flowering-plants",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:02:anatomy-of-flowering-plants",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals",
      "nodeType": "chapter",
      "title": "Anatomy of Flowering Plants",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:02:anatomy-of-flowering-plants",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:03:structural-organisation-in-animals",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals",
      "nodeType": "chapter",
      "title": "Structural Organisation in Animals",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:02:structural-organization-in-plants-and-animals:chapter:03:structural-organisation-in-animals",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:unit:03:cell-structure-and-function",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "unit",
      "title": "Cell: Structure and Function",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:unit:03:cell-structure-and-function",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:01:cell-the-unit-of-life",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:03:cell-structure-and-function",
      "nodeType": "chapter",
      "title": "Cell - The Unit of Life",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:01:cell-the-unit-of-life",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:02:biomolecules",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:03:cell-structure-and-function",
      "nodeType": "chapter",
      "title": "Biomolecules",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:02:biomolecules",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:03:cell-cycle-and-cell-division",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:03:cell-structure-and-function",
      "nodeType": "chapter",
      "title": "Cell Cycle and Cell Division",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:03:cell-structure-and-function:chapter:03:cell-cycle-and-cell-division",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:unit:04:plant-physiology",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "unit",
      "title": "Plant Physiology",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:unit:04:plant-physiology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:01:photosynthesis-in-higher-plants",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:04:plant-physiology",
      "nodeType": "chapter",
      "title": "Photosynthesis in Higher Plants",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:01:photosynthesis-in-higher-plants",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:02:respiration-in-plants",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:04:plant-physiology",
      "nodeType": "chapter",
      "title": "Respiration in Plants",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:02:respiration-in-plants",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:03:plant-growth-and-development",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:04:plant-physiology",
      "nodeType": "chapter",
      "title": "Plant Growth and Development",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:04:plant-physiology:chapter:03:plant-growth-and-development",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "unit",
      "title": "Human Physiology",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:unit:05:human-physiology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:01:breathing-and-exchange-of-gases",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Breathing and Exchange of Gases",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:01:breathing-and-exchange-of-gases",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:02:body-fluids-and-circulation",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Body Fluids and Circulation",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:02:body-fluids-and-circulation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:03:excretory-products-and-their-elimination",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Excretory Products and their Elimination",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:03:excretory-products-and-their-elimination",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:04:locomotion-and-movement",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Locomotion and Movement",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:04:locomotion-and-movement",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:05:neural-control-and-coordination",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Neural Control and Coordination",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:05:neural-control-and-coordination",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:06:chemical-coordination-and-integration",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": "node-cbse-2026-27-xi-044:unit:05:human-physiology",
      "nodeType": "chapter",
      "title": "Chemical Coordination and Integration",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:cbse-2026-27-xi-044:unit:05:human-physiology:chapter:06:chemical-coordination-and-integration",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-044:practical:06:practical-work",
      "subjectId": "cbse-2026-27-xi-044",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-044:practical:06:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:01:changing-trends-and-career-in-physical-education",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Changing Trends and Career in Physical Education",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:01:changing-trends-and-career-in-physical-education",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:02:olympism-value-education",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Olympism Value Education",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:02:olympism-value-education",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:03:yoga",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Yoga",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:03:yoga",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:04:physical-education-and-sports-for-cwsn",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Physical Education and Sports for CWSN",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:04:physical-education-and-sports-for-cwsn",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:05:physical-fitness-wellness-and-lifestyle",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Physical Fitness, Wellness and Lifestyle",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:05:physical-fitness-wellness-and-lifestyle",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:06:test-measurement-and-evaluation",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Test, Measurement and Evaluation",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:06:test-measurement-and-evaluation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:07:fundamentals-of-anatomy-and-physiology-in-sports",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Fundamentals of Anatomy and Physiology in Sports",
      "description": null,
      "officialOrder": 7,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:07:fundamentals-of-anatomy-and-physiology-in-sports",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:08:fundamentals-of-kinesiology-and-biomechanics-in-sports",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Fundamentals of Kinesiology and Biomechanics in Sports",
      "description": null,
      "officialOrder": 8,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:08:fundamentals-of-kinesiology-and-biomechanics-in-sports",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:09:psychology-and-sports",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Psychology and Sports",
      "description": null,
      "officialOrder": 9,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:09:psychology-and-sports",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:unit:10:training-and-doping-in-sports",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "unit",
      "title": "Training and Doping in Sports",
      "description": null,
      "officialOrder": 10,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:unit:10:training-and-doping-in-sports",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-048:practical:11:practical-work",
      "subjectId": "cbse-2026-27-xi-048",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 11,
      "marksWeightage": null,
      "sourcePage": 11,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-048:practical:11:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": null,
      "nodeType": "unit",
      "title": "Foundations of Business",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": 40,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:01:evolution-and-fundamentals-of-business",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Evolution and Fundamentals of Business",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:01:evolution-and-fundamentals-of-business",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:02:forms-of-business-organisations",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Forms of Business Organisations",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:02:forms-of-business-organisations",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:03:public-private-and-global-enterprises",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Public, Private and Global Enterprises",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:03:public-private-and-global-enterprises",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:04:business-services",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Business Services",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:04:business-services",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:05:emerging-modes-of-business",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Emerging Modes of Business",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:05:emerging-modes-of-business",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:06:social-responsibility-of-business-and-business-ethics",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:01:foundations-of-business",
      "nodeType": "chapter",
      "title": "Social Responsibility of Business and Business Ethics",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:01:foundations-of-business:chapter:06:social-responsibility-of-business-and-business-ethics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": null,
      "nodeType": "unit",
      "title": "Finance and Trade",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": 40,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:01:sources-of-business-finance",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "nodeType": "chapter",
      "title": "Sources of Business Finance",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:01:sources-of-business-finance",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:02:small-business-and-enterprises",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "nodeType": "chapter",
      "title": "Small Business and Enterprises",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:02:small-business-and-enterprises",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:03:internal-trade",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "nodeType": "chapter",
      "title": "Internal Trade",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:03:internal-trade",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:04:international-trade",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": "node-cbse-2026-27-xi-054:unit:02:finance-and-trade",
      "nodeType": "chapter",
      "title": "International Trade",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:cbse-2026-27-xi-054:unit:02:finance-and-trade:chapter:04:international-trade",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-054:project:03:project-work",
      "subjectId": "cbse-2026-27-xi-054",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-054:project:03:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:unit:01:theoretical-framework",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": null,
      "nodeType": "unit",
      "title": "Theoretical Framework",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": 12,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:unit:01:theoretical-framework",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:01:theoretical-framework:topic:01:introduction-to-accounting",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:01:theoretical-framework",
      "nodeType": "topic",
      "title": "Introduction to Accounting",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:01:theoretical-framework:topic:01:introduction-to-accounting",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:01:theoretical-framework:topic:02:theory-base-of-accounting",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:01:theoretical-framework",
      "nodeType": "topic",
      "title": "Theory Base of Accounting",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:01:theoretical-framework:topic:02:theory-base-of-accounting",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:unit:02:accounting-process",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": null,
      "nodeType": "unit",
      "title": "Accounting Process",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": 44,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:unit:02:accounting-process",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:01:recording-of-business-transactions",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:02:accounting-process",
      "nodeType": "topic",
      "title": "Recording of Business Transactions",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:01:recording-of-business-transactions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:02:bank-reconciliation-statement",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:02:accounting-process",
      "nodeType": "topic",
      "title": "Bank Reconciliation Statement",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:02:bank-reconciliation-statement",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:03:depreciation-provisions-and-reserves",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:02:accounting-process",
      "nodeType": "topic",
      "title": "Depreciation, Provisions and Reserves",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:03:depreciation-provisions-and-reserves",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:04:trial-balance-and-rectification-of-errors",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:02:accounting-process",
      "nodeType": "topic",
      "title": "Trial Balance and Rectification of Errors",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:02:accounting-process:topic:04:trial-balance-and-rectification-of-errors",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": null,
      "nodeType": "unit",
      "title": "Financial Statements of Sole Proprietorship",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": 24,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship:topic:01:financial-statements",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship",
      "nodeType": "topic",
      "title": "Financial Statements",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship:topic:01:financial-statements",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship:topic:02:incomplete-records",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": "node-cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship",
      "nodeType": "topic",
      "title": "Incomplete Records",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:cbse-2026-27-xi-055:unit:03:financial-statements-of-sole-proprietorship:topic:02:incomplete-records",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-055:project:04:project-work",
      "subjectId": "cbse-2026-27-xi-055",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-055:project:04:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:unit:01:introduction-to-home-science",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to Home Science",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:unit:01:introduction-to-home-science",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "unit",
      "title": "Understanding Oneself: Adolescence",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:01:understanding-the-self",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "nodeType": "chapter",
      "title": "Understanding the Self",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:01:understanding-the-self",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:02:food-nutrition-health-and-fitness",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "nodeType": "chapter",
      "title": "Food, Nutrition, Health and Fitness",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:02:food-nutrition-health-and-fitness",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:03:management-of-resources",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "nodeType": "chapter",
      "title": "Management of Resources",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:03:management-of-resources",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:04:fabric-around-us",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "nodeType": "chapter",
      "title": "Fabric Around Us",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 6,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:04:fabric-around-us",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:05:media-communication-technology",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence",
      "nodeType": "chapter",
      "title": "Media Communication Technology",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 7,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:02:understanding-oneself-adolescence:chapter:05:media-communication-technology",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:unit:03:understanding-family-community-and-society",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "unit",
      "title": "Understanding Family, Community and Society",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:unit:03:understanding-family-community-and-society",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:03:understanding-family-community-and-society:chapter:01:concerns-and-needs-in-diverse-contexts",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:03:understanding-family-community-and-society",
      "nodeType": "chapter",
      "title": "Concerns and Needs in Diverse Contexts",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 8,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:03:understanding-family-community-and-society:chapter:01:concerns-and-needs-in-diverse-contexts",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:unit:04:childhood",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "unit",
      "title": "Childhood",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:unit:04:childhood",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:04:childhood:chapter:01:nutrition-health-and-well-being",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:04:childhood",
      "nodeType": "chapter",
      "title": "Nutrition, Health and Well-being",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 9,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:04:childhood:chapter:01:nutrition-health-and-well-being",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:04:childhood:chapter:02:our-apparel",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:04:childhood",
      "nodeType": "chapter",
      "title": "Our Apparel",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 9,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:04:childhood:chapter:02:our-apparel",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:unit:05:adulthood",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "unit",
      "title": "Adulthood",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:unit:05:adulthood",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:05:adulthood:chapter:01:financial-management-and-planning",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:05:adulthood",
      "nodeType": "chapter",
      "title": "Financial Management and Planning",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 10,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:05:adulthood:chapter:01:financial-management-and-planning",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:05:adulthood:chapter:02:care-and-maintenance-of-fabrics",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": "node-cbse-2026-27-xi-064:unit:05:adulthood",
      "nodeType": "chapter",
      "title": "Care and Maintenance of Fabrics",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 11,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:cbse-2026-27-xi-064:unit:05:adulthood:chapter:02:care-and-maintenance-of-fabrics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-064:practical:06:practical-work",
      "subjectId": "cbse-2026-27-xi-064",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 12,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Home_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-064:practical:06:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:unit:01:introduction-to-computer-system",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to Computer System",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 1,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:unit:01:introduction-to-computer-system",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:unit:02:introduction-to-python",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to Python",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:unit:02:introduction-to-python",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:unit:03:database-concepts-and-the-structured-query-language",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "unit",
      "title": "Database Concepts and the Structured Query Language",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:unit:03:database-concepts-and-the-structured-query-language",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:unit:04:introduction-to-the-emerging-trends",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to the Emerging Trends",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:unit:04:introduction-to-the-emerging-trends",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:practical:05:practical-work",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:practical:05:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-065:project:06:project-work",
      "subjectId": "cbse-2026-27-xi-065",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Informatics_Practices_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-065:project:06:project-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-083:unit:01:computer-systems-and-organisation",
      "subjectId": "cbse-2026-27-xi-083",
      "parentId": null,
      "nodeType": "unit",
      "title": "Computer Systems and Organisation",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 1,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-083:unit:01:computer-systems-and-organisation",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-083:unit:02:computational-thinking-and-programming-i",
      "subjectId": "cbse-2026-27-xi-083",
      "parentId": null,
      "nodeType": "unit",
      "title": "Computational Thinking and Programming - I",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 2,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-083:unit:02:computational-thinking-and-programming-i",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-083:unit:03:society-law-and-ethics",
      "subjectId": "cbse-2026-27-xi-083",
      "parentId": null,
      "nodeType": "unit",
      "title": "Society, Law and Ethics",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-083:unit:03:society-law-and-ethics",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-083:practical:04:practical-work",
      "subjectId": "cbse-2026-27-xi-083",
      "parentId": null,
      "nodeType": "practical",
      "title": "Practical Work",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-083:practical:04:practical-work",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:unit:01:introduction-to-political-institutions",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "unit",
      "title": "Introduction to Political Institutions",
      "description": null,
      "officialOrder": 1,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:unit:01:introduction-to-political-institutions",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:unit:02:basic-features-of-the-constitution-of-india",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "unit",
      "title": "Basic Features of the Constitution of India",
      "description": null,
      "officialOrder": 2,
      "marksWeightage": null,
      "sourcePage": 3,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:unit:02:basic-features-of-the-constitution-of-india",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:unit:03:jurisprudence-nature-and-sources-of-law",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "unit",
      "title": "Jurisprudence, Nature and Sources of Law",
      "description": null,
      "officialOrder": 3,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:unit:03:jurisprudence-nature-and-sources-of-law",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:unit:04:judiciary-constitutional-civil-and-criminal-courts-and-processes",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "unit",
      "title": "Judiciary: Constitutional, Civil and Criminal Courts and Processes",
      "description": null,
      "officialOrder": 4,
      "marksWeightage": null,
      "sourcePage": 4,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:unit:04:judiciary-constitutional-civil-and-criminal-courts-and-processes",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:unit:05:family-justice-system",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "unit",
      "title": "Family Justice System",
      "description": null,
      "officialOrder": 5,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:unit:05:family-justice-system",
      "active": true
    },
    {
      "id": "node-cbse-2026-27-xi-074:project:06:project-work",
      "subjectId": "cbse-2026-27-xi-074",
      "parentId": null,
      "nodeType": "project",
      "title": "Project Work",
      "description": null,
      "officialOrder": 6,
      "marksWeightage": null,
      "sourcePage": 5,
      "sourceUrl": "https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf",
      "externalKey": "cbse-2026-27-xi-074:project:06:project-work",
      "active": true
    }
  ]
}$curriculum$::jsonb);

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
    $aliases$[{"normalizedAlias":"accountancy","curriculumSubjectId":"cbse-2026-27-xi-055","confidence":"exact"},{"normalizedAlias":"accounts","curriculumSubjectId":"cbse-2026-27-xi-055","confidence":"alias"},{"normalizedAlias":"agriculture","curriculumSubjectId":"cbse-2026-27-xi-808","confidence":"exact"},{"normalizedAlias":"ai","curriculumSubjectId":"cbse-2026-27-xi-843","confidence":"alias"},{"normalizedAlias":"air conditioning and refrigeration","curriculumSubjectId":"cbse-2026-27-xi-827","confidence":"exact"},{"normalizedAlias":"applied commercial art","curriculumSubjectId":"cbse-2026-27-xi-052","confidence":"exact"},{"normalizedAlias":"applied mathematics","curriculumSubjectId":"cbse-2026-27-xi-241","confidence":"exact"},{"normalizedAlias":"applied maths","curriculumSubjectId":"cbse-2026-27-xi-241","confidence":"alias"},{"normalizedAlias":"arabic","curriculumSubjectId":"cbse-2026-27-xi-116","confidence":"exact"},{"normalizedAlias":"artificial intelligence","curriculumSubjectId":"cbse-2026-27-xi-843","confidence":"exact"},{"normalizedAlias":"assamese","curriculumSubjectId":"cbse-2026-27-xi-114","confidence":"exact"},{"normalizedAlias":"automotive","curriculumSubjectId":"cbse-2026-27-xi-804","confidence":"exact"},{"normalizedAlias":"banking","curriculumSubjectId":"cbse-2026-27-xi-811","confidence":"exact"},{"normalizedAlias":"beauty and wellness","curriculumSubjectId":"cbse-2026-27-xi-807","confidence":"exact"},{"normalizedAlias":"bengali","curriculumSubjectId":"cbse-2026-27-xi-105","confidence":"exact"},{"normalizedAlias":"bharatanatyam dance","curriculumSubjectId":"cbse-2026-27-xi-057","confidence":"exact"},{"normalizedAlias":"bhoti","curriculumSubjectId":"cbse-2026-27-xi-188","confidence":"exact"},{"normalizedAlias":"bhutia","curriculumSubjectId":"cbse-2026-27-xi-195","confidence":"exact"},{"normalizedAlias":"bio","curriculumSubjectId":"cbse-2026-27-xi-044","confidence":"alias"},{"normalizedAlias":"biology","curriculumSubjectId":"cbse-2026-27-xi-044","confidence":"exact"},{"normalizedAlias":"biotechnology","curriculumSubjectId":"cbse-2026-27-xi-045","confidence":"exact"},{"normalizedAlias":"bodo","curriculumSubjectId":"cbse-2026-27-xi-192","confidence":"exact"},{"normalizedAlias":"bst","curriculumSubjectId":"cbse-2026-27-xi-054","confidence":"alias"},{"normalizedAlias":"business administration","curriculumSubjectId":"cbse-2026-27-xi-833","confidence":"exact"},{"normalizedAlias":"business studies","curriculumSubjectId":"cbse-2026-27-xi-054","confidence":"exact"},{"normalizedAlias":"carnatic music (melodic instruments)","curriculumSubjectId":"cbse-2026-27-xi-032","confidence":"exact"},{"normalizedAlias":"carnatic music (percussion instruments mridangam)","curriculumSubjectId":"cbse-2026-27-xi-033","confidence":"exact"},{"normalizedAlias":"carnatic music (vocal)","curriculumSubjectId":"cbse-2026-27-xi-031","confidence":"exact"},{"normalizedAlias":"chem","curriculumSubjectId":"cbse-2026-27-xi-043","confidence":"alias"},{"normalizedAlias":"chemistry","curriculumSubjectId":"cbse-2026-27-xi-043","confidence":"exact"},{"normalizedAlias":"computer science","curriculumSubjectId":"cbse-2026-27-xi-083","confidence":"exact"},{"normalizedAlias":"cost accounting","curriculumSubjectId":"cbse-2026-27-xi-823","confidence":"exact"},{"normalizedAlias":"cs","curriculumSubjectId":"cbse-2026-27-xi-083","confidence":"alias"},{"normalizedAlias":"data science","curriculumSubjectId":"cbse-2026-27-xi-844","confidence":"exact"},{"normalizedAlias":"design","curriculumSubjectId":"cbse-2026-27-xi-830","confidence":"exact"},{"normalizedAlias":"design thinking and innovation","curriculumSubjectId":"cbse-2026-27-xi-848","confidence":"exact"},{"normalizedAlias":"early childhood care and education","curriculumSubjectId":"cbse-2026-27-xi-842","confidence":"exact"},{"normalizedAlias":"economics","curriculumSubjectId":"cbse-2026-27-xi-030","confidence":"exact"},{"normalizedAlias":"electrical technology","curriculumSubjectId":"cbse-2026-27-xi-819","confidence":"exact"},{"normalizedAlias":"electronic technology","curriculumSubjectId":"cbse-2026-27-xi-820","confidence":"exact"},{"normalizedAlias":"electronics and hardware","curriculumSubjectId":"cbse-2026-27-xi-847","confidence":"exact"},{"normalizedAlias":"engineering graphics","curriculumSubjectId":"cbse-2026-27-xi-046","confidence":"exact"},{"normalizedAlias":"english core","curriculumSubjectId":"cbse-2026-27-xi-301","confidence":"exact"},{"normalizedAlias":"english elective","curriculumSubjectId":"cbse-2026-27-xi-001","confidence":"exact"},{"normalizedAlias":"entrepreneurship","curriculumSubjectId":"cbse-2026-27-xi-066","confidence":"exact"},{"normalizedAlias":"fashion studies","curriculumSubjectId":"cbse-2026-27-xi-837","confidence":"exact"},{"normalizedAlias":"financial markets management","curriculumSubjectId":"cbse-2026-27-xi-805","confidence":"exact"},{"normalizedAlias":"food nutrition and dietetics","curriculumSubjectId":"cbse-2026-27-xi-834","confidence":"exact"},{"normalizedAlias":"food production","curriculumSubjectId":"cbse-2026-27-xi-809","confidence":"exact"},{"normalizedAlias":"french","curriculumSubjectId":"cbse-2026-27-xi-118","confidence":"exact"},{"normalizedAlias":"front office operations","curriculumSubjectId":"cbse-2026-27-xi-810","confidence":"exact"},{"normalizedAlias":"geography","curriculumSubjectId":"cbse-2026-27-xi-029","confidence":"exact"},{"normalizedAlias":"geospatial technology","curriculumSubjectId":"cbse-2026-27-xi-818","confidence":"exact"},{"normalizedAlias":"german","curriculumSubjectId":"cbse-2026-27-xi-120","confidence":"exact"},{"normalizedAlias":"graphics","curriculumSubjectId":"cbse-2026-27-xi-050","confidence":"exact"},{"normalizedAlias":"gujarati","curriculumSubjectId":"cbse-2026-27-xi-110","confidence":"exact"},{"normalizedAlias":"health care","curriculumSubjectId":"cbse-2026-27-xi-813","confidence":"exact"},{"normalizedAlias":"hindi core","curriculumSubjectId":"cbse-2026-27-xi-302","confidence":"exact"},{"normalizedAlias":"hindi elective","curriculumSubjectId":"cbse-2026-27-xi-002","confidence":"exact"},{"normalizedAlias":"hindustani music (melodic instruments)","curriculumSubjectId":"cbse-2026-27-xi-035","confidence":"exact"},{"normalizedAlias":"hindustani music (percussion instruments)","curriculumSubjectId":"cbse-2026-27-xi-036","confidence":"exact"},{"normalizedAlias":"hindustani music (vocal)","curriculumSubjectId":"cbse-2026-27-xi-034","confidence":"exact"},{"normalizedAlias":"history","curriculumSubjectId":"cbse-2026-27-xi-027","confidence":"exact"},{"normalizedAlias":"home science","curriculumSubjectId":"cbse-2026-27-xi-064","confidence":"exact"},{"normalizedAlias":"horticulture","curriculumSubjectId":"cbse-2026-27-xi-816","confidence":"exact"},{"normalizedAlias":"informatics practice","curriculumSubjectId":"cbse-2026-27-xi-065","confidence":"alias"},{"normalizedAlias":"informatics practices","curriculumSubjectId":"cbse-2026-27-xi-065","confidence":"exact"},{"normalizedAlias":"information technology","curriculumSubjectId":"cbse-2026-27-xi-802","confidence":"exact"},{"normalizedAlias":"insurance","curriculumSubjectId":"cbse-2026-27-xi-814","confidence":"exact"},{"normalizedAlias":"ip","curriculumSubjectId":"cbse-2026-27-xi-065","confidence":"alias"},{"normalizedAlias":"japanese","curriculumSubjectId":"cbse-2026-27-xi-194","confidence":"exact"},{"normalizedAlias":"kannada","curriculumSubjectId":"cbse-2026-27-xi-115","confidence":"exact"},{"normalizedAlias":"kashmiri","curriculumSubjectId":"cbse-2026-27-xi-197","confidence":"exact"},{"normalizedAlias":"kathak dance","curriculumSubjectId":"cbse-2026-27-xi-056","confidence":"exact"},{"normalizedAlias":"kathakali dance","curriculumSubjectId":"cbse-2026-27-xi-061","confidence":"exact"},{"normalizedAlias":"knowledge tradition and practices of india","curriculumSubjectId":"cbse-2026-27-xi-073","confidence":"exact"},{"normalizedAlias":"kokborok","curriculumSubjectId":"cbse-2026-27-xi-191","confidence":"exact"},{"normalizedAlias":"kuchipudi dance","curriculumSubjectId":"cbse-2026-27-xi-058","confidence":"exact"},{"normalizedAlias":"land transportation associate","curriculumSubjectId":"cbse-2026-27-xi-846","confidence":"exact"},{"normalizedAlias":"legal studies","curriculumSubjectId":"cbse-2026-27-xi-074","confidence":"exact"},{"normalizedAlias":"lepcha","curriculumSubjectId":"cbse-2026-27-xi-126","confidence":"exact"},{"normalizedAlias":"library and information science","curriculumSubjectId":"cbse-2026-27-xi-836","confidence":"exact"},{"normalizedAlias":"limboo","curriculumSubjectId":"cbse-2026-27-xi-125","confidence":"exact"},{"normalizedAlias":"malayalam","curriculumSubjectId":"cbse-2026-27-xi-112","confidence":"exact"},{"normalizedAlias":"manipuri","curriculumSubjectId":"cbse-2026-27-xi-111","confidence":"exact"},{"normalizedAlias":"manipuri dance","curriculumSubjectId":"cbse-2026-27-xi-060","confidence":"exact"},{"normalizedAlias":"marathi","curriculumSubjectId":"cbse-2026-27-xi-109","confidence":"exact"},{"normalizedAlias":"marketing","curriculumSubjectId":"cbse-2026-27-xi-812","confidence":"exact"},{"normalizedAlias":"mass media studies","curriculumSubjectId":"cbse-2026-27-xi-835","confidence":"exact"},{"normalizedAlias":"math","curriculumSubjectId":"cbse-2026-27-xi-041","confidence":"alias"},{"normalizedAlias":"mathematics","curriculumSubjectId":"cbse-2026-27-xi-041","confidence":"exact"},{"normalizedAlias":"maths","curriculumSubjectId":"cbse-2026-27-xi-041","confidence":"alias"},{"normalizedAlias":"medical diagnostics","curriculumSubjectId":"cbse-2026-27-xi-828","confidence":"exact"},{"normalizedAlias":"mizo","curriculumSubjectId":"cbse-2026-27-xi-198","confidence":"exact"},{"normalizedAlias":"multi media","curriculumSubjectId":"cbse-2026-27-xi-821","confidence":"exact"},{"normalizedAlias":"ncc","curriculumSubjectId":"cbse-2026-27-xi-076","confidence":"exact"},{"normalizedAlias":"nepali","curriculumSubjectId":"cbse-2026-27-xi-124","confidence":"exact"},{"normalizedAlias":"odia","curriculumSubjectId":"cbse-2026-27-xi-113","confidence":"exact"},{"normalizedAlias":"odissi dance","curriculumSubjectId":"cbse-2026-27-xi-059","confidence":"exact"},{"normalizedAlias":"office procedures and practices","curriculumSubjectId":"cbse-2026-27-xi-824","confidence":"exact"},{"normalizedAlias":"painting","curriculumSubjectId":"cbse-2026-27-xi-049","confidence":"exact"},{"normalizedAlias":"pe","curriculumSubjectId":"cbse-2026-27-xi-048","confidence":"alias"},{"normalizedAlias":"persian","curriculumSubjectId":"cbse-2026-27-xi-123","confidence":"exact"},{"normalizedAlias":"phy","curriculumSubjectId":"cbse-2026-27-xi-042","confidence":"alias"},{"normalizedAlias":"physical activity trainer","curriculumSubjectId":"cbse-2026-27-xi-845","confidence":"exact"},{"normalizedAlias":"physical education","curriculumSubjectId":"cbse-2026-27-xi-048","confidence":"exact"},{"normalizedAlias":"physics","curriculumSubjectId":"cbse-2026-27-xi-042","confidence":"exact"},{"normalizedAlias":"pol science","curriculumSubjectId":"cbse-2026-27-xi-028","confidence":"alias"},{"normalizedAlias":"political sci","curriculumSubjectId":"cbse-2026-27-xi-028","confidence":"alias"},{"normalizedAlias":"political science","curriculumSubjectId":"cbse-2026-27-xi-028","confidence":"exact"},{"normalizedAlias":"psychology","curriculumSubjectId":"cbse-2026-27-xi-037","confidence":"exact"},{"normalizedAlias":"punjabi","curriculumSubjectId":"cbse-2026-27-xi-104","confidence":"exact"},{"normalizedAlias":"retail","curriculumSubjectId":"cbse-2026-27-xi-801","confidence":"exact"},{"normalizedAlias":"russian","curriculumSubjectId":"cbse-2026-27-xi-121","confidence":"exact"},{"normalizedAlias":"salesmanship","curriculumSubjectId":"cbse-2026-27-xi-831","confidence":"exact"},{"normalizedAlias":"sanskrit core","curriculumSubjectId":"cbse-2026-27-xi-322","confidence":"exact"},{"normalizedAlias":"sanskrit elective","curriculumSubjectId":"cbse-2026-27-xi-022","confidence":"exact"},{"normalizedAlias":"sculpture","curriculumSubjectId":"cbse-2026-27-xi-051","confidence":"exact"},{"normalizedAlias":"shorthand (english)","curriculumSubjectId":"cbse-2026-27-xi-825","confidence":"exact"},{"normalizedAlias":"shorthand (hindi)","curriculumSubjectId":"cbse-2026-27-xi-826","confidence":"exact"},{"normalizedAlias":"sindhi","curriculumSubjectId":"cbse-2026-27-xi-108","confidence":"exact"},{"normalizedAlias":"sociology","curriculumSubjectId":"cbse-2026-27-xi-039","confidence":"exact"},{"normalizedAlias":"spanish","curriculumSubjectId":"cbse-2026-27-xi-196","confidence":"exact"},{"normalizedAlias":"tamil","curriculumSubjectId":"cbse-2026-27-xi-106","confidence":"exact"},{"normalizedAlias":"tangkhul","curriculumSubjectId":"cbse-2026-27-xi-193","confidence":"exact"},{"normalizedAlias":"taxation","curriculumSubjectId":"cbse-2026-27-xi-822","confidence":"exact"},{"normalizedAlias":"telugu (ap)","curriculumSubjectId":"cbse-2026-27-xi-107","confidence":"exact"},{"normalizedAlias":"telugu (telangana)","curriculumSubjectId":"cbse-2026-27-xi-189","confidence":"exact"},{"normalizedAlias":"textile design","curriculumSubjectId":"cbse-2026-27-xi-829","confidence":"exact"},{"normalizedAlias":"tibetan","curriculumSubjectId":"cbse-2026-27-xi-117","confidence":"exact"},{"normalizedAlias":"tourism","curriculumSubjectId":"cbse-2026-27-xi-806","confidence":"exact"},{"normalizedAlias":"typography and computer application","curriculumSubjectId":"cbse-2026-27-xi-817","confidence":"exact"},{"normalizedAlias":"urdu core","curriculumSubjectId":"cbse-2026-27-xi-303","confidence":"exact"},{"normalizedAlias":"urdu elective","curriculumSubjectId":"cbse-2026-27-xi-003","confidence":"exact"},{"normalizedAlias":"web application","curriculumSubjectId":"cbse-2026-27-xi-803","confidence":"exact"},{"normalizedAlias":"yoga","curriculumSubjectId":"cbse-2026-27-xi-841","confidence":"exact"}]$aliases$::jsonb
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
