# Security / production audit progress

Branch: `security/full-production-audit`  
Baseline commit: `5bb63a917d3997db799e660d56a48f4efb6dbce9`  
Started: 2026-08-07 (Asia/Kolkata)

## Production baselines (recorded, not mutated)

| Item | Value |
| --- | --- |
| Git HEAD at audit start | `5bb63a9` — Show the Recall+ support email in a contact panel with copy |
| Vercel production deployment | `dpl_3H8KjnPTB3PdyZWaSyKBLGcdNScH` |
| Vercel production URL | https://recall-plus.vercel.app / https://recall-plus-on14ju205-darshel.vercel.app |
| Vercel state | READY |
| Supabase production project | `bqysqcsogqxfhrtuituo` (ap-south-1) |
| Staging/test Supabase project | `rgdtgqrifgnpxcbanbbc` (`recall-plus-curriculum-test`) |
| In-DB backup schema | `recall_backup.user_app_data_20260806`, `recall_backup.recall_profiles_20260806` (present; pre-Phase-7 copies) |
| Storage buckets in use | **0** (Storage schema present; no application buckets populated) |

### Applied production migrations (remote)

1. `20260726190818_secure_user_data_and_generation_limits`
2. `20260727094001_harden_generation_attempts_and_user_data`
3. `20260727094206_validate_hardening_size_constraints`
4. `20260727094712_harden_default_function_privileges`
5. `20260727180523_fix_profile_name_and_india_timezone`
6. `20260806073627_curriculum_profiles_and_rls`
7. `20260806073813_validate_study_log_curriculum`

**Not yet applied in production (repo only):**

- `20260807210000_curriculum_allowlist_and_books.sql`
- `20260807210100_allowlist_subject_combination_rules.sql`

### Environment variable names (values never recorded here)

From `.env.example` (expected Vercel/server set):

- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_GOOGLE_ENABLED`, `VITE_AUTH_GITHUB_ENABLED`, `VITE_AUTH_APPLE_ENABLED`
- Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_QUIZ_API_KEY`, `GROQ_RECALL_API_KEY`, `GROQ_INSIGHTS_API_KEY`, `GROQ_TIMETABLE_API_KEY`, `GROQ_MODEL`, `GROQ_REQUEST_TIMEOUT_MS`, `PORT`

Local machine also held temporary operator tokens (must be rotated after audit): `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN`

## Baseline command results (2026-08-07)

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass (196 / 0 fail) |
| `npm run build` | pass |
| `npm run scan:secrets` | pass (no patterned credentials in tracked files) |
| Frontend `dist` bundle secret-pattern scan | clean |
| `npm audit` | 2 high — `react-router` / `react-router-dom` GHSA-qwww-vcr4-c8h2 (already policy-excepted; RSC CSRF path; app uses SPA not RSC) |
| Gitleaks via `npx` | not available in this environment (`could not determine executable`) — use repo `scan:secrets` + `scan:history` |

## Baseline issue register

| ID | Severity | Status | Summary |
| --- | --- | --- | --- |
| SEC-001 | High (defense-in-depth) | Open → fixing | `recall_backup.*` and `recall_private.curriculum_legacy_subject_aliases` have RLS disabled. Verified: `anon` has **no** schema USAGE on `recall_backup`; `authenticated` has USAGE on `recall_private` but **no** SELECT on aliases. Still harden with RLS + revoke. |
| SEC-002 | Medium | Open | Supabase Auth leaked-password protection disabled (HIBP). Enable in dashboard (operator action). |
| SEC-003 | Medium | Open | Allowlist DB migrations not applied to production while frontend already ships 24-subject catalogue — hierarchy drift risk. |
| SEC-004 | Medium | Open | No server-side account deletion endpoint/UI (export exists; deletion missing). |
| SEC-005 | Medium | Open | Legal pages incomplete vs DPDP readiness; need draft suite + placeholders + lawyer review list. |
| SEC-006 | Low | Accepted risk (documented) | `react-router` GHSA-qwww-vcr4-c8h2 — no unstable RSC usage; pinned 7.18.1 with audit policy exception. |
| SEC-007 | Low | Open | Generation tables use RLS with zero policies (deny-by-default for clients) — intentional; document. |
| SEC-008 | Informational | Open | No analytics/ad SDKs found in initial scan — cookie banner not required if only necessary storage. |
| SEC-009 | Informational | Open | CBSE/NCERT affiliation disclaimer should be explicit on landing/legal. |
| SEC-010 | Medium | Open | Child/Class-XI age notice + configurable guardian-consent design needed; do not activate legal consent without lawyer review. |
| SEC-011 | High | Operator action | Temporary `VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` in local `.env.local` must be revoked after audit. Treat any historically exposed Groq keys as compromised and rotate. |

## DPDP note (verified against public MeitY/PIB reporting, not legal advice)

- DPDP Rules 2025 notified ~13–14 Nov 2025 with **phased** enforcement.
- Institutional / Board provisions first; Consent Manager framework ~12 months later; substantive fiduciary obligations (notice, consent, children’s data, rights, breach, etc.) reported as applying ~**May 2027**.
- Recall+ must prepare now; do **not** claim present-day full DPDP compliance.

## Phase checklist

- [x] Phase 0 — branch, baselines, backups confirmed, env names, progress file, baseline issues
- [x] Phase 0b — additive RLS harden migration for backup/private tables (repo; apply staging→prod with approval)
- [x] Phase 0c — account deletion API + Settings UI + tests; CBSE disclaimer; privacy/legal draft docs
- [ ] Phase 1 — secrets rotation confirmation with operator; history scan on CI
- [ ] Phase 2 — dependency audit follow-ups
- [ ] Phase 3 — AppSec / API / AI hardening fixes
- [ ] Phase 4 — Apply Supabase RLS migration on staging, then production with approval
- [ ] Phase 5 — Expand legal drafts (cookie/AUP/AI disclaimer pages) without publishing placeholders
- [ ] Phase 6 — full reports + Preview (production deploy only with approval)

## Commits on this branch

(pending Phase 0 commit)


## Safety rules in force

No production resets, truncates, user deletes for testing, force-push, secret printing, or incomplete legal placeholder publication to production footers.
