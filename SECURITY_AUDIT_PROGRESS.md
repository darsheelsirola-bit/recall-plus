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
- Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_REQUEST_TIMEOUT_MS`, `PORT`

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
| SEC-001 | High (defense-in-depth) | Staging applied; prod pending | RLS harden migration applied on staging (`harden_backup_and_private_rls`). Production not yet applied. Repo migration made schema-safe when `recall_backup` is absent. |
| SEC-002 | Medium | Open — operator UI | Leaked-password protection still disabled (advisor WARN). Enable at Auth → Email providers (Pro+): https://supabase.com/dashboard/project/bqysqcsogqxfhrtuituo/auth/providers?provider=Email |
| SEC-003 | Medium | Staging incomplete; prod blocked | Staging recorded `curriculum_allowlist_and_books` but data not fully applied (still 124 active subjects, no `book` node type). **Do not apply to production until staging repair is approved and verified (expect 24 active subjects + book nodes).** Combination-rules migration is on staging. |
| SEC-004 | Medium | Fixed in main | Account deletion API + Settings UI shipped via #1. |
| SEC-005 | Medium | Drafts only | Privacy/ToS + cookie/AUP/AI disclaimer drafts under `docs/legal/` — not linked as production policies. |
| SEC-006 | Low | Accepted risk (documented) | `react-router` GHSA-qwww-vcr4-c8h2 — no unstable RSC usage; pinned 7.18.1 with audit policy exception. |
| SEC-007 | Low | Open | Generation tables use RLS with zero policies (deny-by-default for clients) — intentional; document. |
| SEC-008 | Informational | Open | No analytics/ad SDKs found in initial scan — cookie banner not required if only necessary storage. |
| SEC-009 | Informational | Fixed in main | CBSE/NCERT independence disclaimer on landing (audit PR). |
| SEC-010 | Medium | Open | Child/Class-XI age notice + configurable guardian-consent design needed; do not activate legal consent without lawyer review. |
| SEC-011 | High | Local cleared; revoke in dashboards | Removed `VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` / `VERCEL_OIDC_TOKEN` from local `.env.local`. Operator must still revoke those tokens in Vercel + Supabase dashboards and rotate any historically exposed Groq keys. |
| SEC-012 | High | Fixing in code | Production `/api/*` returns `FUNCTION_INVOCATION_FAILED`. Likely cold-start import of `src/utils/weakTopics.js` (JSON import attributes) via `insights.js`. Mitigated by `server/insightFallbacks.js` + thinner `api/ai-status.js` / `api/generation-usage.js`. Needs successful Vercel production deploy. |

## DPDP note (verified against public MeitY/PIB reporting, not legal advice)

- DPDP Rules 2025 notified ~13–14 Nov 2025 with **phased** enforcement.
- Institutional / Board provisions first; Consent Manager framework ~12 months later; substantive fiduciary obligations (notice, consent, children’s data, rights, breach, etc.) reported as applying ~**May 2027**.
- Recall+ must prepare now; do **not** claim present-day full DPDP compliance.

## Phase checklist

- [x] Phase 0 — branch, baselines, backups confirmed, env names, progress file, baseline issues
- [x] Phase 0b — additive RLS harden migration for backup/private tables (repo; staging applied; prod pending approval)
- [x] Phase 0c — account deletion API + Settings UI + tests; CBSE disclaimer; privacy/legal draft docs
- [~] Phase 1 — local operator tokens cleared from `.env.local`; dashboard revoke + Groq rotate still required
- [ ] Phase 2 — dependency audit follow-ups
- [~] Phase 3 — API cold-start hardening (insightFallbacks + thin status routes); deploy to production still required
- [~] Phase 4 — Staging: RLS + combination rules OK; allowlist data repair needed before production apply
- [~] Phase 5 — Cookie/AUP/AI disclaimer drafts added under `docs/legal/` (not published)
- [ ] Phase 6 — full reports + Preview (production deploy only with approval)

## Operator actions still required

1. Revoke old Vercel + Supabase personal access tokens in dashboards (SEC-011).
2. Enable leaked-password protection on production Auth (SEC-002, Pro plan).
3. Approve staging allowlist **repair** migration, verify 24 active subjects + book nodes, then approve production migrations.
4. Redeploy production on Vercel after API import fix lands (SEC-012) — last `main` production deploy for audit commit failed.

## Commits

Merged to `main` via #1: `cd596d6`. Local follow-ups may be uncommitted (API harden + progress + legal drafts + schema-safe RLS SQL).


## Safety rules in force

No production resets, truncates, user deletes for testing, force-push, secret printing, or incomplete legal placeholder publication to production footers.
