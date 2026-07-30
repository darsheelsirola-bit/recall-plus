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

## Remaining work

1. Phase 2 - Add the complete non-destructive Supabase curriculum/profile schema, RLS, grants,
   validation functions, existing-user backfill, rollback plan, and database tests as one atomic
   migration phase.
2. Phase 3 - Add responsive onboarding, route guards, academic-profile state, and subject settings.
3. Phase 4 - Make every learner-facing feature consume only the user's active curriculum subject IDs.
4. Phase 5 - Enforce curriculum authorization and official-node validation in every AI/API path.
5. Phase 6 - Run migration, account-matrix, responsive, security, performance, and end-to-end
   verification and commit any fixes.
6. Phase 7 - Push all phase commits, deploy the verified worktree atomically, verify production, and
   publish the final report.

## Database safety rule

No database migration or security change will be applied to the live project until its complete phase
is implemented, tested, reviewed for rollback and compatibility, and ready to apply as one coherent
unit.
