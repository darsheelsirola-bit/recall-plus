-- Recall+ security audit: defense-in-depth RLS for private/backup schemas
-- Additive only. Does not modify user data rows.
-- Safe when backup/private objects are absent (e.g. staging without recall_backup).

begin;

do $migrate$
begin
  if to_regnamespace('recall_backup') is not null then
    if to_regclass('recall_backup.user_app_data_20260806') is not null then
      execute 'alter table recall_backup.user_app_data_20260806 enable row level security';
      execute 'alter table recall_backup.user_app_data_20260806 force row level security';
      execute 'revoke all on table recall_backup.user_app_data_20260806 from public, anon, authenticated';
      execute $c$comment on table recall_backup.user_app_data_20260806 is
        'Pre-curriculum migration backup. Not client-accessible. RLS forced; revoke client grants.'$c$;
    end if;

    if to_regclass('recall_backup.recall_profiles_20260806') is not null then
      execute 'alter table recall_backup.recall_profiles_20260806 enable row level security';
      execute 'alter table recall_backup.recall_profiles_20260806 force row level security';
      execute 'revoke all on table recall_backup.recall_profiles_20260806 from public, anon, authenticated';
      execute $c$comment on table recall_backup.recall_profiles_20260806 is
        'Pre-curriculum migration backup. Not client-accessible. RLS forced; revoke client grants.'$c$;
    end if;

    execute 'revoke usage on schema recall_backup from public, anon, authenticated';
  end if;

  if to_regnamespace('recall_private') is not null
    and to_regclass('recall_private.curriculum_legacy_subject_aliases') is not null then
    execute 'alter table recall_private.curriculum_legacy_subject_aliases enable row level security';
    execute 'alter table recall_private.curriculum_legacy_subject_aliases force row level security';
    execute 'revoke all on table recall_private.curriculum_legacy_subject_aliases from public, anon, authenticated';
    execute $c$comment on table recall_private.curriculum_legacy_subject_aliases is
      'Internal legacy alias map. Client roles revoked; RLS forced.'$c$;
  end if;
end;
$migrate$;

commit;
