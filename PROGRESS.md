# Recall+ curriculum expansion progress

Last updated: 2026-07-30

## Phase 0 — Audited baseline

Status: complete

### Completed work

- Audited the full application architecture before beginning the curriculum expansion:
  - authentication, OAuth, password flows, profile hydration, per-user browser storage, cloud snapshot sync, conflict handling, and protected routing;
  - current syllabus data, subject selectors, study logs, quizzes, recall scheduling, timetable generation, Today’s Focus, AI Insight, progress, dashboard, calendar, settings, and backup/restore;
  - server request validation, Supabase JWT verification, Groq provider isolation, generation limits, idempotency, quiz-answer verification, and fallback behavior;
  - all local Supabase migrations, live public schema, RLS state, grants, callable functions, migration history, advisor findings, and aggregate existing-user data.
- Confirmed the current application is still structurally PCM-only. The three legacy subject names are hardcoded in curriculum data, selectors, calendar filters, timetable validation/fallbacks, AI prompts, profile defaults, charts, and tests.
- Confirmed the live Supabase project has:
  - 5 authentication users;
  - 5 matching `recall_profiles` rows;
  - 5 matching `user_app_data` rows;
  - RLS enabled on every public table;
  - one aggregate legacy quiz result, for Physics, and no aggregate legacy study-log subjects.
- Preserved production data and made no database, RLS, grant, Auth, or production configuration changes during this audit.
- Completed and retained the already-tested baseline user-interface improvements:
  - friendlier, sanitized email/password authentication errors;
  - responsive, compact sign-in and account-creation alerts;
  - `PCM workspace` sidebar copy in place of `Class 11 PCM workspace`;
  - a thinner public landing-page Recall+ logo outline.

### Tests run

- `npm.cmd run check`
  - 148 automated tests passed;
  - TypeScript check passed;
  - ESLint passed;
  - production build passed;
  - repository and Git-history secret scans passed.
- Browser QA on the local production build:
  - desktop authentication layout passed;
  - mobile authentication layout passed;
  - no console errors;
  - no horizontal overflow.
- Read-only Supabase verification:
  - public schema/table inventory;
  - migration history;
  - aggregate user/profile/snapshot counts;
  - aggregate legacy subject counts;
  - RLS policy and function ACL inventory;
  - security and performance advisors.

### Unresolved errors and risks

- The complete CBSE Class XI curriculum catalogue, stream-neutral onboarding, subject rules, and curriculum-version persistence do not exist yet.
- The application still stores most learning data in one versioned JSON snapshot. Phase 2 must add normalized curriculum/profile tables without losing or exposing legacy data.
- The live migration history does not list local migration `20260728071537_oauth_profile_metadata_defaults.sql`. This drift must be reconciled inside the complete Phase 2 migration; it must not be applied as an isolated partial security change.
- Supabase security advisor findings to resolve in Phase 2:
  - authenticated access to two intentional but exposed `SECURITY DEFINER` RPCs;
  - leaked-password protection is disabled;
  - informational “RLS enabled with no policy” notices on server-only tables.
- Existing owner policies are explicitly scoped to `authenticated`, despite the advisor’s anonymous-access warning. Phase 2 will add regression tests and make the intended exposure unambiguous.
- Official CBSE subject groups and combination rules have been located in the official 2026–27 curriculum, but the sourced catalogue and chapter/topic imports are not implemented yet.

## Remaining work

1. Phase 1 — Build and validate a versioned, officially sourced CBSE 2026–27 subject catalogue, combination rules, legacy mappings, and import/report tooling.
2. Phase 2 — Add the complete non-destructive Supabase curriculum/profile schema, RLS, grants, validation RPCs, existing-user backfill, and database tests as one atomic migration phase.
3. Phase 3 — Add responsive onboarding, route guards, academic-profile state, and subject settings.
4. Phase 4 — Make every learner-facing feature consume only the user’s active curriculum subject IDs.
5. Phase 5 — Enforce curriculum authorization and official-node validation in every AI/API path.
6. Phase 6 — Run migration, account-matrix, responsive, security, performance, and end-to-end verification and commit any fixes.
7. Phase 7 — Push all phase commits, deploy the verified worktree atomically, verify production, and publish the final report.

## Database safety rule

No database migration or security change will be applied to the live project until its complete phase is implemented, tested, reviewed for rollback/compatibility, and ready to apply as one coherent unit.
