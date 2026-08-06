# Phase 7 production rollout report

Date: 2026-08-06  
Production Supabase: `bqysqcsogqxfhrtuituo`  
Production URL: https://recall-plus.vercel.app  
GitHub: `darsheelsirola-bit/recall-plus` branch `main`

## Verdict

**Database + GitHub half of Phase 7 succeeded.**  
**Vercel frontend half is not complete.** Live production still serves the pre-curriculum PCM bundle. Full curriculum UI smoke tests are blocked until the owner deploys `main` application commit `f49fffb` (docs tip `76f1346`).

Do not claim full Phase 7 success until the new frontend is live and curriculum smoke tests pass.

## Migrations applied

| Local file | Recorded version | Name | Result |
|---|---|---|---|
| `20260730120000_curriculum_profiles_and_rls.sql` | `20260806073627` | `curriculum_profiles_and_rls` | Applied |
| `20260803120000_validate_study_log_curriculum.sql` | `20260806073813` | `validate_study_log_curriculum` | Applied |

Catalogue after migration: 1 version, 124 subjects, 121 selectable, 295 nodes.

## Data preservation

| Metric | Value |
|---|---|
| Auth users | 6 |
| Anonymous users | 0 |
| Recall profiles | 6 |
| App snapshots | 6 |
| Version sum | 23 |
| Aggregate hash | `675c90b3365eef29857bc740c60630f4` |
| Active user subjects | 0 (await confirmation) |
| Migration candidates | 1 |
| Curriculum trigger | present |

Pre-mutation backup tables: `recall_backup.user_app_data_20260806`, `recall_backup.recall_profiles_20260806`.

## Advisors

- Security ERROR: 0
- Security WARN: Free-plan leaked-password protection only (disclosed, not fixed)
- Cleared prior WARN: public SECURITY DEFINER RPCs, anonymous owner-policy gaps
- Intentional INFO: four deny-all generation tables
- Performance ERROR/WARN: 0

## Smoke tests executed

Passed:

- HTTP 200 for `/`, `/privacy`, `/terms`, `/onboarding`, `/dashboard`, `/settings`
- Nested routes return SPA HTML (no hard 404)
- Public landing page renders
- Aggregate data-hash re-check unchanged
- Live entry scripts: no `GROQ_`, `SERVICE_ROLE`, or `sbp_` secret patterns

Blocked / failed against curriculum acceptance criteria:

- Live index still `index-C_QEZ63h.js`
- Bundle still contains `Class 11 PCM`
- Bundle lacks `AcademicProfileProvider`, onboarding, and curriculum markers
- Sign-in → legacy confirmation / new-user onboarding / selected-subject filtering not verified on the new UI

## Rollback

- DB failure during migration: transaction rolled back (both migrations completed successfully).
- Frontend failure after a future deploy: promote previous Vercel deployment from the dashboard. New DB objects are backward-compatible with the old frontend.
- Do not drop curriculum / user-subject tables after owners begin onboarding.
- Backup schema: `recall_backup`.

## Remaining manual steps

1. Connect GitHub auto-deploy on the Vercel project that owns `recall-plus.vercel.app`, or manually redeploy production from application commit `f49fffb`.
2. Confirm live bundle no longer contains `Class 11 PCM` and includes curriculum onboarding.
3. Re-run curriculum UI smoke: sign-in, legacy subject confirmation, new-user `/onboarding` redirect, subject filtering, refresh/logout/login.
4. Optionally revoke temporary `SUPABASE_ACCESS_TOKEN`.
5. After Phase 7 frontend verification: start the question-bank phase.

## Unresolved production risks

- Production frontend and production database schema are temporarily mismatched (old UI + new curriculum schema). Safe for the old UI, incomplete for the new product.
- Free-plan leaked-password protection remains disabled.
- Vercel Git auto-deploy was not observed after pushing `main`.
