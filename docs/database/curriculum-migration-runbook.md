# Curriculum migration runbook

Migration: `20260730120000_curriculum_profiles_and_rls`

## Safety properties

- The migration has one explicit PostgreSQL transaction.
- It is additive except for compatible replacements of the existing Auth/data RPC implementations,
  `handle_new_recall_user()`, and existing owner-policy predicates.
- It does not update, delete, truncate, or reinterpret `user_app_data`.
- Existing users receive an incomplete academic profile and owner-readable migration candidates.
- Detected legacy names do not become authoritative subject selections until user confirmation.
- A source-hash mismatch aborts instead of silently replacing the checked curriculum version.
- Normal users receive read-only table grants. Academic writes use authenticated,
  session-derived RPCs and archive replaced selections.
- Public RPC signatures remain compatible, while privileged implementations move to the
  non-exposed `recall_private` schema.
- Existing and new browser-facing policies reject JWTs marked `is_anonymous`; Auth provisioning
  does not create application rows for anonymous accounts.

## Preflight

1. Confirm production migration history ends at
   `20260727180523_fix_profile_name_and_india_timezone`.
2. Run:
   - `npm run curriculum:validate`
   - `npm run curriculum:sql:check`
   - `npm run test:db:smoke`
   - `npm run check`
3. Confirm the embedded PostgreSQL smoke test replays every checked-in migration and verifies
   catalogue counts, Auth-trigger provisioning, authenticated-role grants, RLS owner isolation,
   anonymous-session rejection, validation, and atomic onboarding persistence.
4. Apply the migration to an isolated Supabase development branch.
5. Run every file in `supabase/tests/`, including `curriculum_profiles_test.sql`.
6. Run Supabase security and performance advisors on the branch.
7. Confirm the catalogue contains 124 subject records, 121 selectable codes, and 295 nodes.
8. Confirm pre-migration and post-migration counts and hashes for `user_app_data` are identical.

## Production application

1. Take aggregate counts and a deterministic per-row hash inventory of existing snapshots.
2. Apply the generated migration once through the Supabase migration API.
3. Verify the migration version is recorded.
4. Re-run catalogue counts, user/profile parity, migration-candidate counts, RLS/grant inventory,
   function ACLs, and both advisors.
5. Re-run the snapshot count/hash inventory. Stop rollout if any legacy snapshot changed.
6. As one continuous security rollout, disable unused anonymous sign-ins and enable leaked-password
   protection in Supabase Auth, then immediately verify both Auth settings and the security advisor.
7. Deploy the application only after database and Auth verification succeeds.

## Rollback and recovery

- If any statement fails, PostgreSQL rolls back the complete migration transaction.
- If post-migration application verification fails, roll back the Vercel application deployment.
  The new database objects and public RPC signatures are backward-compatible, and the prior app
  does not reference the new curriculum tables.
- Do not drop the additive curriculum or user-subject tables after users begin onboarding; that would
  destroy newly created academic history.
- Correct forward with a new versioned migration if a database defect is found after commit.
- Never restore an old `user_app_data` snapshot over a newer row. Existing CAS/version protection
  remains authoritative.
