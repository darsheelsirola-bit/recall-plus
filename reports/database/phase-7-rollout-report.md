# Phase 7 production rollout report

Date: 2026-08-06  
Production Supabase: `bqysqcsogqxfhrtuituo`  
Production URL: https://recall-plus.vercel.app  
GitHub: `darsheelsirola-bit/recall-plus` branch `main`  
Verified application commit: `480463e`  
Verified Vercel deployment: `dpl_9xWHXYxPSSFpFK811Ng9JsWjUPa8` (`READY`)

## Verdict

**Phase 7 succeeded.**

- Both curriculum migrations are applied in production.
- GitHub `main` contains the curriculum application and the audit fix.
- Vercel production now serves the curriculum frontend (not the old PCM bundle).
- Public/auth smoke checks and data-preservation counts passed.

Signed-in legacy subject-confirmation was not exercised in this session because no production test credentials were provided.

## Migrations applied

| Local file | Recorded version | Name | Result |
|---|---|---|---|
| `20260730120000_curriculum_profiles_and_rls.sql` | `20260806073627` | `curriculum_profiles_and_rls` | Applied |
| `20260803120000_validate_study_log_curriculum.sql` | `20260806073813` | `validate_study_log_curriculum` | Applied |

Catalogue: 1 version, 124 subjects, 121 selectable, 295 nodes.

## Data preservation

| Metric | Value |
|---|---|
| Auth users | 6 |
| Recall profiles | 6 |
| App snapshots | 6 |
| Version sum | 24 |
| Aggregate hash | `973da9540270bb6e1e9fd84c33532187` |
| Active user subjects | 0 (await owner confirmation) |
| Academic profiles | 6 |
| Curriculum trigger | present |

The aggregate hash/version-sum advanced from the immediate post-migration baseline because signed-in users continued syncing after the migrations. Row counts remain 6/6/6 and the curriculum catalogue is intact.

Pre-mutation backup tables remain in `recall_backup`.

## Advisors

- Security ERROR: 0
- Security WARN: Free-plan leaked-password protection only (disclosed, not fixed)
- Intentional INFO: four deny-all generation tables

## Vercel release path

Earlier production deploys failed after a successful Vite build because `npm run audit:all` rejected transitive `brace-expansion@5.0.8` (`GHSA-rgw5-rvv9-x895`).

Fix: pin `overrides.brace-expansion` to `5.0.9`, update the lockfile, push commit `480463e`.  
Deployment `dpl_9xWHXYxPSSFpFK811Ng9JsWjUPa8` reached `READY` and is aliased to production.

## Smoke tests executed

Passed:

- HTTP 200 for `/`, `/privacy`, `/terms`, `/onboarding`, `/dashboard`, `/settings`, `/syllabus`
- Nested routes return SPA HTML (no hard 404)
- Live index bundle `index-BcLk_IAE.js`
- Bundle markers: `Class 11 PCM` absent; `CBSE XI workspace`, `AcademicProfileProvider`, `onboarding`, `curriculumSubjectId` present
- Auth page loads
- Unauthenticated `/onboarding` guards to the sign-in surface
- Live entry scripts: no `GROQ_`, `SERVICE_ROLE`, or `sbp_` secret patterns
- Production user/profile/snapshot counts intact; curriculum tables/trigger present

Not run in this session:

- Signed-in legacy subject confirmation for an existing PCM user
- Full account-matrix walkthrough on production credentials

## Rollback

- Frontend: promote a previous READY deployment from the Vercel dashboard.
- Database: do not drop curriculum / user-subject tables after owners begin onboarding; correct forward with a new versioned migration.
- Backup schema: `recall_backup`.

## Remaining manual steps

1. Optionally revoke temporary `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` from `.env.local` / provider dashboards.
2. Have one existing production user confirm subjects through onboarding and spot-check Syllabus / Add Log / Quiz selectors.
3. Next product phase: verified question-bank system.

## Unresolved production risks

- Free-plan leaked-password protection remains disabled.
- Signed-in production confirmation flow was not smoke-tested with real credentials in this session.
