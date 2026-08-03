# Curriculum production rollout runbook

Migrations, in dependency order:

1. `20260730120000_curriculum_profiles_and_rls`
2. `20260803120000_validate_study_log_curriculum`

Last application-code commit: `c653702fe7c8d75ea82c483226cb9b5c7ea44ffd`

Production targets:

- Supabase project `bqysqcsogqxfhrtuituo`
- GitHub `darsheelsirola-bit/recall-plus`, branch `main`
- Vercel project `prj_ADVmlZuknd9OYwwdMLkphVWzBixa`
- Vercel production alias `https://recall-plus.vercel.app`

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
- The study-log guard is a second explicit transaction and depends on the curriculum tables. The
  production alias and Git `main` must remain unchanged until both transactions and all preservation
  checks pass.

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
4. Apply both migrations to an isolated Supabase development project.
5. Run every file in `supabase/tests/`, including `curriculum_profiles_test.sql`.
6. Run Supabase security and performance advisors on the branch.
7. Confirm the catalogue contains 124 subject records, 121 selectable codes, and 295 nodes.
8. Confirm pre-migration and post-migration counts and hashes for `user_app_data` are identical.
9. Confirm the exact production-build candidate can be created without assigning the production
   alias. The build must run `npm run vercel:build`, including environment validation.

## Verified read-only production preflight (2026-08-04 India time)

- Supabase is `ACTIVE_HEALTHY` in `ap-south-1`, PostgreSQL `17.6.1.147`, on the Free plan.
- Production migration history contains the five migrations through
  `20260727180523_fix_profile_name_and_india_timezone`; neither curriculum migration is present.
- The six curriculum/user-academic tables are absent, as expected before rollout.
- Aggregate baseline: six Auth users, zero anonymous users, six Recall profiles, six app snapshots,
  snapshot version sum 22, owner parity true, and aggregate snapshot hash
  `ccbef85bfef01e4adc3c45dddae237b1`. No row contents or identifying data were exported.
- Current security advice has four intentional deny-all quota-table INFO notices, two WARN notices
  for the old public `SECURITY DEFINER` RPCs, two WARN notices for owner policies that do not yet
  reject anonymous JWTs, and the leaked-password-protection WARN notice. The first curriculum
  migration replaces the public RPCs with `SECURITY INVOKER` wrappers and adds explicit
  `is_anonymous` rejection. Advisors must prove those warnings clear after migration.
- Supabase leaked-password protection is available only on Pro and above. The production
  organization is on the Free plan, so enabling it is not part of this zero-cost rollout. The
  Recall+ signup UI continues to require a strong eight-character password containing lowercase,
  uppercase, number, and symbol; the paid-feature warning must remain disclosed rather than
  reported as fixed.
- Vercel currently aliases production deployment `dpl_243LFc8QnXDbSLUK5F2n3cSCREr7`, which is
  `READY` and is a rollback candidate. It serves the previous application artifact. The project has
  Git integration, so pushing `main` can initiate a production deployment.
- `https://recall-plus.vercel.app`, `/privacy`, and `/terms` each return HTTP 200. Vercel reported no
  grouped runtime errors in the preceding 24 hours.
- No Vercel CLI is installed globally or in the repository. Use only the freshly authorized pinned
  official CLI; do not let `npx` select an unpinned version.

## Production application

1. Re-run `npm run check`, require a clean worktree, and confirm HEAD is the authorized commit.
2. Create a production-environment Vercel deployment with the pinned official CLI and
   `--prod --skip-domain`. This verifies the exact artifact and production environment without
   moving the live alias. Do not promote it yet.
3. Immediately re-capture aggregate counts, owner parity, version sum, and the deterministic
   snapshot hash. Stop if they differ unexpectedly from the checked-in baseline.
4. Apply `20260730120000_curriculum_profiles_and_rls` through the Supabase migration API. Verify its
   version, 124 subjects, 121 selectable subjects, 295 nodes, grants, RLS, function security, legacy
   candidate counts, owner parity, and unchanged snapshot count/version/hash before continuing.
5. Apply `20260803120000_validate_study_log_curriculum` through the Supabase migration API. Verify
   its version, private trigger/function ACLs, valid active-subject writes, forged-subject rejection,
   and the unchanged snapshot count/version/hash. Do not leave the rollout at the one-migration
   hold point: repair and complete the second transaction before any frontend release.
6. Re-run Supabase security and performance advisors. Require no new ERROR or WARN finding caused
   by the rollout. The four policy-free server-only tables and the Free-plan leaked-password notice
   are documented exceptions.
7. Push all verified local commits to GitHub `main` only after both migrations pass. Because Git
   integration can deploy `main`, this ordering prevents a schema-incompatible frontend release.
8. Observe the automatic Vercel deployment. If it reaches `READY`, verify it is built from the exact
   authorized commit. If it does not start or fails, promote the already verified skip-domain
   artifact. Never promote an unverified or mismatched artifact.
9. Verify the production alias, deployment ID, commit, public pages, auth/onboarding guards, OAuth,
   owner isolation, selected-subject filtering, curriculum-backed APIs, legacy-user confirmation,
   browser console, runtime errors, and refresh/logout/login persistence.

## Rollback and recovery

- If any statement fails, PostgreSQL rolls back that complete migration transaction. The old Vercel
  alias remains in place until both migrations pass, so a migration failure does not expose a
  schema-incompatible frontend.
- If the first migration succeeds and the second fails, keep the previous frontend live, diagnose
  and apply a corrected forward migration immediately, and do not push `main` or promote the new
  artifact. The first migration is additive and backward-compatible with the old frontend.
- If post-migration application verification fails, roll back the Vercel application deployment.
  The new database objects and public RPC signatures are backward-compatible, and the prior app
  does not reference the new curriculum tables.
- The verified frontend rollback target is currently `dpl_243LFc8QnXDbSLUK5F2n3cSCREr7`.
  Re-check its rollback-candidate status immediately before rollout; do not rely on this recorded
  value if Vercel state changes.
- Do not drop the additive curriculum or user-subject tables after users begin onboarding; that would
  destroy newly created academic history.
- Correct forward with a new versioned migration if a database defect is found after commit.
- Never restore an old `user_app_data` snapshot over a newer row. Existing CAS/version protection
  remains authoritative.
