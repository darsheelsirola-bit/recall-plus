# Recall+ curriculum expansion progress

Last updated: 2026-07-30

## Phase 0 - Audited baseline

Status: complete

### Completed work

- Audited authentication, OAuth, profile hydration, protected routing, local/cloud user-data
  isolation, the current PCM syllabus, every learner feature, API validation, Groq credential
  isolation, Supabase migrations, the live schema, RLS, grants, functions, advisors, and aggregate
  existing-user data.
- Confirmed the live Supabase project has 5 auth users, 5 matching profile rows, 5 matching
  snapshot rows, RLS on all public tables, one aggregate legacy Physics quiz result, and no
  aggregate legacy study-log subjects.
- Preserved production data and made no database, RLS, grant, Auth, or production changes.
- Retained tested baseline UI improvements: specific sanitized password errors, compact responsive
  auth alerts, `PCM workspace` sidebar copy, and a thinner public logo outline.

### Tests run

- `npm.cmd run check`: 148 tests, TypeScript, ESLint, build, repository secret scan, and complete
  reachable Git-history secret scan passed.
- Local desktop/mobile browser QA passed with no console errors or horizontal overflow.
- Read-only Supabase schema, migration, aggregate-data, RLS, ACL, and advisor checks completed.

### Unresolved errors and risks

- The live migration history does not list local migration
  `20260728071537_oauth_profile_metadata_defaults.sql`. Phase 2 must reconcile this drift inside
  the complete curriculum migration, never as an isolated partial security change.
- Supabase reports authenticated access to two `SECURITY DEFINER` RPCs, leaked-password protection
  disabled, and informational RLS-with-no-policy notices on server-only tables.
- Most learning data remains in one versioned JSON snapshot. Phase 2 must add normalized curriculum
  and profile relations without losing or exposing legacy data.

## Phase 1 - Official curriculum catalogue and rules

Status: complete

### Completed work

- Added immutable version `cbse-2026-27-xi-v1` for CBSE Class XI, academic year 2026-27.
- Added the complete official subject-code catalogue from the current CBSE scheme:
  - 39 Group-L language codes;
  - 39 Group-A academic elective codes;
  - 43 Group-S skill elective codes;
  - 3 compulsory internal-assessment areas;
  - 121 selectable subject codes and 124 records overall.
- Added source URL, SHA-256, content status, group, official order, pathway tags, and stable IDs.
- Reviewed 24 official subject PDFs and added 295 deterministic unit, chapter, topic, practical,
  project, activity, and assessment-area nodes. The catalogue reports `verified_outline` only for
  those reviewed subjects and does not claim textbook-level completeness.
- Marked the remaining 97 selectable subjects and 3 internal-assessment records
  `pending_verification`; no topics were invented for them.
- Added central subject-combination validation directly from the official scheme:
  - five main subjects and one optional additional subject;
  - Subject 1 English/Hindi Core or Elective;
  - Subject 2 Group L or A;
  - Subjects 3-4 Group A or S;
  - Subject 5 Group A;
  - Subject 6 Group L, A, or S;
  - required English or Hindi and all official language-level, mathematics, computer-subject, and
    business-subject conflicts.
- Added optional Science, Commerce, and Humanities presets without preventing valid custom or
  cross-disciplinary combinations.
- Added deterministic legacy aliases for PCM and common cross-stream subject names.
- Added reproducible tools:
  - `npm run curriculum:validate`;
  - `npm run curriculum:import` with idempotent seed output;
  - `npm run curriculum:import -- --refresh-source` for live official-source hash checks;
  - `npm run curriculum:import -- --source-dir <official-pdf-directory>` for offline verified
    source mirrors;
  - `npm run curriculum:report` for JSON and Markdown coverage reports.
- Generated the deterministic seed and coverage artifacts in `reports/curriculum/`.
- Made no database, RLS, Auth, production, or deployment changes in this phase.

### Tests run

- `npm.cmd run curriculum:validate`: passed with 121 selectable subjects, 24 reviewed outlines,
  and 295 curriculum nodes.
- `npm.cmd run curriculum:import` twice: second run reported `Unchanged`, proving deterministic
  output for the checked-in source set.
- `npm.cmd run curriculum:import -- --source-dir C:\tmp\recall-cbse-pdfs`: all 24 reviewed official
  PDF SHA-256 values matched.
- `npm.cmd run curriculum:report`: generated machine-readable and human-readable coverage reports.
- `npm.cmd run check`:
  - 158 automated tests passed;
  - router compatibility passed;
  - TypeScript and ESLint passed;
  - production build passed;
  - repository and complete reachable Git-history secret scans passed.
- Added tests for exact group counts, required major/cross-stream subjects, stable unique IDs,
  official-source metadata, structural validation, duplicate detection, valid Science/Commerce/
  Humanities combinations, positional rules, every official conflict set, presets, and legacy
  aliases.

### Unresolved errors and risks

- 97 selectable subjects intentionally remain `pending_verification`. They are present and
  selectable, but a future curriculum-content phase must review their official subject PDFs before
  adding chapter/topic nodes.
- The current managed Node environment intercepts the official CBSE TLS chain, so the live
  `--refresh-source` run failed safely with `SELF_SIGNED_CERT_IN_CHAIN`. No certificate checks were
  disabled. The same official PDFs downloaded through the approved source workflow were verified
  successfully through `--source-dir`.
- The official scheme itself corrected two audit assumptions before commit: Group L has 39 subject
  codes (not 38), and Subject 5 permits Group A only. The implementation and tests now match the
  official source.

## Phase 2 - Curriculum database, profile ownership, and safe legacy migration

Status: complete

### Completed work

- Added one generated, transactional, non-destructive curriculum/profile migration:
  `20260730120000_curriculum_profiles_and_rls.sql`.
- Added normalized, version-ready relations for:
  - curriculum versions;
  - curriculum subjects;
  - hierarchical curriculum nodes;
  - user academic profiles;
  - confirmed and archived user-subject selections;
  - owner-readable legacy-subject migration candidates;
  - private deterministic legacy aliases.
- Seeded the exact Phase 1 catalogue into PostgreSQL: 1 curriculum version, 124 subject records,
  121 selectable subject codes, and 295 source-reviewed curriculum nodes.
- Added database-enforced subject validation for exact five-main/optional-sixth positions, official
  Group-L/A/S placement, required English/Hindi, and Mathematics, computer-subject,
  business-subject, and language-level conflicts.
- Added session-derived RPCs for onboarding progress, final academic-profile confirmation, and
  owner-only candidate refresh. Browser clients receive read-only table grants and cannot submit a
  trusted user ID for academic writes.
- Moved privileged data implementations behind invoker-mode public wrappers in the non-exposed
  `recall_private` schema. Signed-in users can execute only five allowlisted private
  implementations; arbitrary-user and generation helpers remain unavailable.
- Hardened every browser-facing owner policy and RPC against Supabase anonymous Auth users.
  Anonymous Auth rows do not receive Recall+ application data.
- Added covering indexes for curriculum trees, profile-version foreign keys, migration-candidate
  subjects, and private alias subjects. RLS Auth calls use initialization-plan-safe subqueries.
- Replaced the unapplied local OAuth profile migration with its compatible behavior inside the
  complete atomic phase migration, eliminating local/live migration-history drift.
- Preserved legacy snapshots exactly. Existing subject names are detected from study logs,
  timetable follow-ups, quizzes, recalls, timetables, and topic-status keys. Mapped and unresolved
  values become confirmation candidates; no subject becomes active before the owner confirms a
  complete valid combination and language.
- Added deterministic SQL generation and freshness validation:
  - `npm run curriculum:sql`;
  - `npm run curriculum:sql:check`.
- Added a repeatable embedded PostgreSQL migration smoke test and a 42-assertion hosted pgTAP suite.
- Added a migration runbook, aggregate production baseline, and non-sensitive hosted-test report.
- Created the user-approved `$0/month` disposable Supabase project
  `rgdtgqrifgnpxcbanbbc` in `ap-south-1`. It contains no production data and no persistent test
  users.
- Made no production database, Auth, RLS, grant, application, or deployment change in this phase.

### Tests run

- `npm run test:db:smoke`:
  - replayed all six checked-in migrations from a blank PostgreSQL database;
  - seeded a legacy user after migration 5 and before migration 6;
  - proved the legacy JSON snapshot and version were unchanged;
  - detected four confirmation candidates and activated zero subjects silently;
  - verified exact catalogue counts, Auth-trigger behavior, authenticated-role grants, owner RLS,
    anonymous-session denial, combination validation, and atomic onboarding persistence.
- Hosted Supabase test project:
  - replayed all six application migrations;
  - ran 42 pgTAP assertions with 0 failures and 0 diagnostics inside rollback-only transactions;
  - confirmed 0 persistent auth users, profiles, snapshots, academic profiles, subjects, or
    candidates after testing;
  - confirmed 124 subjects, 121 selectable codes, 295 nodes, RLS on all six new public tables, and
    zero public SECURITY DEFINER wrappers.
- Supabase security advisor: 0 errors and 0 warnings.
- Supabase performance advisor: 0 errors and 0 warnings.
- `npm.cmd run check`:
  - 165 automated Node tests passed;
  - exact six-migration PostgreSQL smoke test passed;
  - router compatibility, curriculum validation, and generated migration freshness passed;
  - TypeScript and ESLint passed;
  - production build passed;
  - repository and complete reachable Git-history secret scans passed.

### Unresolved errors and risks

- Production intentionally remains on the Phase 0 database schema. The complete tested migration,
  anonymous-sign-in setting change, leaked-password protection setting, and application deployment
  must be rolled out together only after Phases 3-6 are complete.
- The production advisor will continue to show its existing SECURITY DEFINER, anonymous-policy, and
  leaked-password warnings until that final coordinated rollout. The disposable test schema proves
  the database portion clears all security warnings.
- Four hosted security INFO notices are intentional: server-only generation tables use RLS with no
  browser policy, producing deny-all client access.
- Ten hosted performance INFO notices report unused indexes because the disposable database has no
  application workload. Required foreign-key and lazy-loading indexes are retained.
- The `$0/month` disposable Supabase project remains active for later phase integration tests and
  should be deleted after final production verification.

## Phase 3 - Onboarding, profile state, route guards, and subject settings

Status: complete

### Completed work

- Added an owner-bound academic-profile provider that loads only the signed-in user's profile,
  active subject selections, and unresolved legacy migration candidates.
- Revalidates the expected Supabase session before and after every profile read and RPC write so an
  account switch cannot apply another user's academic state.
- Added fail-closed academic routing:
  - incomplete profiles are redirected to `/onboarding`;
  - completed profiles cannot accidentally re-enter onboarding;
  - explicit `/onboarding?mode=edit` remains available from Settings;
  - protected study pages do not mount while the academic profile is unavailable.
- Added a six-step, mobile-first onboarding flow for:
  1. fixed CBSE/XI/2026-27 details, optional school, and read-only Asia/Kolkata timezone;
  2. Science, Commerce, and Humanities pathway discovery;
  3. Science PCM/PCB/PCMB/custom, Commerce Mathematics/Applied Mathematics/no Mathematics/custom,
     and Humanities common-subject/custom starting points;
  4. required English/Hindi Core/Elective selection plus visibility of all Group-L languages;
  5. searchable recommendations and a “More CBSE subjects” catalogue containing all 121
     selectable Group-L, Group-A, and Group-S subjects;
  6. ordered main/additional review, official codes, school-availability clarification, and
     explicit confirmation.
- Kept pathways advisory only. The central versioned subject-combination validator arranges and
  validates exact subject IDs and database RPCs revalidate the complete combination.
- Added account-scoped browser draft persistence without storing account credentials or trusting a
  browser-supplied user ID for server writes.
- Existing-user candidates are presented for confirmation, unresolved names remain preserved, and
  no detected subject silently becomes active.
- Added an “Academic profile and subjects” Settings section with board, class, academic year,
  pathway, main/additional positions, and official subject codes.
- Added guarded subject editing:
  - removed selections are archived by the existing database RPC;
  - study-log, quiz, revision, progress, and timetable counts are shown before removal;
  - history-preservation and future-timetable effects are explained;
  - a second explicit confirmation is required before saving changed subjects;
  - newly added subjects receive no fabricated progress.
- Replaced the new-account `Class 11 PCM` metadata default and fallback with
  `CBSE XI workspace`.
- Made no database migration, RLS, Auth-setting, production, or deployment change in this phase.

### Tests run

- Added automated tests for:
  - incomplete/completed/edit route decisions;
  - exact Science and Commerce preset membership;
  - valid five-main and optional-sixth positioning;
  - insufficient and conflicting subject combinations;
  - owner-scoped and corruption-safe onboarding drafts;
  - subject-removal history and timetable counts.
- `npm.cmd run check` passed:
  - exact six-migration PostgreSQL replay and legacy-preservation smoke test;
  - router compatibility and curriculum validation;
  - TypeScript and ESLint;
  - 170 automated tests;
  - production build;
  - repository and complete reachable Git-history secret scans.
- Final `npm.cmd test` after the history-count regression test: 171 tests passed.
- The browser connection correctly refused local-host navigation under its security policy. No
  alternate local address, browser surface, tunnel, or production deployment was used to bypass
  that restriction.

### Unresolved errors and risks

- Full rendered UI and end-to-end account-matrix verification remains in Phase 6. The safe remote
  preview path could not be created because the approved pinned Vercel CLI download was rejected
  after the current Codex usage limit was reached. Production was intentionally not used as a test
  environment.
- The Phase 2 migration is still intentionally absent from production; deploying this frontend
  before the coordinated final migration would fail closed on the missing academic-profile tables.
- Application features still contain PCM subject arrays and name-based content paths. Phase 4 must
  replace those with the active subject-ID workspace before any production rollout.

## Remaining work

1. Phase 4 - Make every learner-facing feature consume only the user's active curriculum subject IDs.
2. Phase 5 - Enforce curriculum authorization and official-node validation in every AI/API path.
3. Phase 6 - Run migration, account-matrix, responsive, security, performance, and end-to-end
   verification and commit any fixes.
4. Phase 7 - Push all phase commits, deploy the verified worktree atomically, verify production, and
   publish the final report.

## Database safety rule

No database migration or security change will be applied to the live project until its complete phase
is implemented, tested, reviewed for rollback and compatibility, and ready to apply as one coherent
unit.
