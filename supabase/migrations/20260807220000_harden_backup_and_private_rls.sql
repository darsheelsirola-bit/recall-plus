-- Recall+ security audit: defense-in-depth RLS for private/backup schemas
-- Additive only. Does not modify user data rows.
-- Verified before apply: anon lacks USAGE on recall_backup; still enable RLS.

begin;

-- ---------------------------------------------------------------------------
-- Backup tables: enable RLS, force RLS, revoke client roles
-- ---------------------------------------------------------------------------
alter table if exists recall_backup.user_app_data_20260806 enable row level security;
alter table if exists recall_backup.user_app_data_20260806 force row level security;
alter table if exists recall_backup.recall_profiles_20260806 enable row level security;
alter table if exists recall_backup.recall_profiles_20260806 force row level security;

revoke all on table recall_backup.user_app_data_20260806 from public, anon, authenticated;
revoke all on table recall_backup.recall_profiles_20260806 from public, anon, authenticated;
revoke usage on schema recall_backup from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private alias table: enable RLS + deny client roles (server/SECURITY DEFINER only)
-- ---------------------------------------------------------------------------
alter table if exists recall_private.curriculum_legacy_subject_aliases enable row level security;
alter table if exists recall_private.curriculum_legacy_subject_aliases force row level security;

revoke all on table recall_private.curriculum_legacy_subject_aliases
  from public, anon, authenticated;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated on these tables.
-- Absence of policies under RLS = deny. service_role / table owners retain access for recovery.

comment on table recall_backup.user_app_data_20260806 is
  'Pre-curriculum migration backup. Not client-accessible. RLS forced; revoke client grants.';
comment on table recall_backup.recall_profiles_20260806 is
  'Pre-curriculum migration backup. Not client-accessible. RLS forced; revoke client grants.';
comment on table recall_private.curriculum_legacy_subject_aliases is
  'Internal legacy alias map. Client roles revoked; RLS forced.';

commit;
