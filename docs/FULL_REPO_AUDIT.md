# Recall+ Full Repository Engineering Audit

## Scope and safety

- Repository: `darsheelsirola-bit/recall-plus`
- Audit branch: `audit/full-repo-2026-08-17`
- Baseline commit: `a777891bbe02deb1d903fca9a9e650bab7a42343`
- Baseline date: 2026-08-17
- Production data, Supabase configuration, OAuth settings, credentials, and production deployment are not modified without explicit approval.
- The original working checkout contained uncommitted curriculum changes and was left untouched. Audit work uses an isolated Git worktree.

## Architecture baseline

- Frontend: React 19, Vite 8, React Router 7, Tailwind CSS
- Runtime/toolchain: Node 24.16.0, npm 11.13.0
- Backend: Express-compatible Vercel Functions
- Auth/database: Supabase Auth and PostgreSQL migrations
- AI provider: NVIDIA NIM through server-only handlers
- Tracked files at baseline: 313

## Initial verification

| Check | Baseline result |
| --- | --- |
| Dependency install | Passed; npm reported 4 High affected package entries |
| TypeScript | Passed |
| ESLint | Passed |
| Automated tests | Passed: 209 |
| Production build | Passed |
| Curriculum validation | Passed for Class XI and XII |
| Database migration smoke test | Passed across 14 migrations |
| Working-tree secret scan | Passed: 411 text files |
| Reachable Git-history secret scan | Passed: 693 text blobs |

## Findings

### AUD-001 — High — Vulnerable Nano ID override

- Status: Fixed and verified
- Reproduction: `npm audit --json` reports `GHSA-2v37-7h3g-55p8` because `package.json` forces `nanoid` 3.3.17 through PostCSS.
- Impact: A custom Nano ID generator invoked with a zero size can loop indefinitely and cause denial of service.
- Root cause: A now-stale security override pinned Nano ID below the patched 3.3.18 release.
- Fix: Raise the override to 3.3.18 and regenerate the npm lockfile.
- Verification: `npm audit`, `npm run audit:all`, and `npm run audit:prod` report zero vulnerabilities; the complete `npm run check` gate passes.

### AUD-002 — High (upstream rating; lower observed applicability) — React Router RSC CSRF advisory

- Status: Fixed and verified
- Reproduction: `npm audit --json` reports `GHSA-qwww-vcr4-c8h2` for React Router 7.18.1.
- Impact: Affected React Server Components action handling can execute an action before returning a 400 response. Recall+ uses declarative Vite SPA routing rather than RSC mode, but a patched non-major release is available.
- Root cause: `react-router-dom` was exactly pinned to 7.18.1.
- Fix: Upgrade `react-router-dom` and its transitive `react-router` package to 7.18.2.
- Verification: Router compatibility passes at 7.18.2, all 209 tests pass, the production build succeeds, and dependency audits report zero vulnerabilities.

### AUD-003 — Medium — Account deletion missing from the local API server

- Status: Fixed and verified
- Reproduction: `POST /api/delete-account` on the Express development server fell through to the JSON 404 handler even though Settings calls that route and Vercel exposes it in production.
- Impact: The destructive account-deletion flow could not be exercised end to end in local development, increasing the risk of production-only regressions.
- Root cause: `server/app.js` did not mount the shared account-deletion handler after the feature was added.
- Fix: Mount the route and add an integration test proving that it reaches the shared handler and enforces authentication.
- Verification: The Express integration test reaches the shared authentication boundary, and the complete 215-test quality gate passes.

### AUD-004 — Medium — Duplicated Vercel and Express API implementations

- Status: Fixed and verified
- Reproduction: Files under `api/` reimplement handlers already present in `server/apiHandlers.js`; account deletion had already diverged between the two runtime paths.
- Impact: Validation, authorization, error handling, and future security fixes could differ between local Express and deployed Vercel functions.
- Root cause: Vercel entrypoints copied complete handler bodies instead of delegating to the shared implementation.
- Fix: Convert every Vercel entrypoint to a minimal re-export of its shared handler.
- Verification: All seven Vercel entrypoints delegate to shared handlers; API security tests, ESLint, the production build, and the complete quality gate pass.

### AUD-005 — Medium — Account deletion did not revoke sessions

- Status: Fixed and verified
- Reproduction: The server called `admin.deleteUser` without first calling the Supabase global sign-out endpoint. Supabase documents that deleting an Auth user does not sign the user out and JWTs remain valid until expiry.
- Impact: Refresh tokens on other devices remained active until Auth processed the deleted identity, and already-issued access tokens retain their normal short expiry window.
- Root cause: The deletion flow relied on the current browser's post-delete `signOut()` rather than server-side global session revocation.
- Fix: Revoke all sessions with the verified request JWT before deleting the user; fail safely without deletion when revocation fails.
- Verification: Tests prove global revocation occurs before deletion and deletion stops if revocation fails; the complete quality gate passes. Supabase cannot revoke already-issued JWTs before expiry, so a short JWT lifetime remains the recommended dashboard control.

### AUD-006 — High — Quiz answer keys were exposed before submission

- Status: Fixed and verified in code; production migration pending approval
- Reproduction: `POST /api/generate-quiz` returned each question's `answer`, `explanation`, and verifier metadata, and all three quiz pages calculated scores in browser code. A learner could inspect the generation response before answering.
- Impact: Quiz integrity was bypassable, making stored scores and downstream recall recommendations untrustworthy.
- Root cause: The generation response reused the server's answer-bearing verified quiz record instead of publishing a question-only contract and scoring against the private record.
- Fix: Return only question IDs, prompts, difficulties, and options; retain answer keys in the private generation attempt; add an authenticated `/api/submit-quiz` handler that checks ownership and scores once on the server; store an immutable idempotency record in a service-only, RLS-enabled table.
- Verification: Tests prove generation responses contain no answer material, valid submissions are server-scored, identical retries replay safely, changed retries fail, malformed answers fail, and the database grants and constraints are enforced. All 215 tests, typecheck, lint, build, secret scans, and dependency policies pass.
- Deployment note: `20260817104756_add_server_scored_quiz_submissions.sql` is checked in but was not applied to production because production migrations require explicit approval.

### AUD-007 — Medium — Class XII learners saw Class XI product copy

- Status: Fixed and verified
- Reproduction: The syllabus page always rendered `Class 11 syllabus` even when the authenticated academic profile selected Class XII. The README and legal drafts also described the expanded product as Class XI-only or PCM-only.
- Impact: Class XII and non-PCM learners received contradictory scope information, weakening trust in the subject-driven curriculum model.
- Root cause: User-facing copy was not updated when Class XII and the 24-subject catalogues were introduced.
- Fix: Derive the syllabus heading from the owner-scoped academic grade and update maintained product/legal documentation to cover Class XI and XII selected subjects.
- Verification: The source regression assertion and complete 217-test quality gate pass. Authenticated rendered confirmation remains part of the credential-gated E2E limitation below.

### AUD-008 — Medium — Browser security headers were not declared

- Status: Fixed and verified
- Reproduction: `vercel.json` declared no response headers and the Express app set no CSP, framing, MIME-sniffing, referrer, or browser-permission policy.
- Impact: The browser had fewer defense-in-depth controls against injected content, clickjacking, content-type confusion, referrer leakage, and unnecessary device permissions.
- Root cause: Hosting and local-runtime configuration focused on routing and build gates without a shared response-header baseline.
- Fix: Add a restrictive application CSP and explicit Permissions Policy, Referrer Policy, `nosniff`, and frame denial to Vercel and Express; add HSTS to the HTTPS production configuration.
- Verification: Integration tests confirm the headers on pages and API errors; the production-built page renders without CSP console errors; the complete quality gate passes.

### AUD-009 — Low — Legal-page header overflowed on mobile

- Status: Fixed and verified
- Reproduction: At 320px and 390px viewports, the public and legal-page header controls extended past the right edge; at 390px the full `Back to Recall+` label produced a 401px-wide legal layout.
- Impact: Mobile users could horizontally scroll and the primary back control was partially clipped.
- Root cause: The fixed-width logo and non-wrapping full back label did not fit beside the header gap and page padding.
- Fix: Keep the accessible back label concise on mobile, reveal the `to Recall+` suffix at the `sm` breakpoint, and reduce horizontal control padding only at the narrowest breakpoint while preserving the 44px touch height.
- Verification: Browser checks confirm no horizontal overflow on the landing, Privacy, or Terms pages at 320, 375, 390, 768, 1024, 1280, 1440, and 1920px; the complete quality gate passes.

### AUD-010 — Low — Database smoke output hid the verified node count

- Status: Fixed and verified
- Reproduction: The smoke test queried curriculum-node totals as `nodes.total` but printed `nodes.count`, producing `undefined nodes` after an otherwise successful run.
- Impact: CI output obscured the actual migration result and could mislead audit reviewers even though the assertions still protected the schema.
- Root cause: The reporting statement used a stale result-property name.
- Fix: Print the asserted `nodes.total` value.
- Verification: The smoke test reports 764 curriculum nodes while applying all 15 migrations successfully.

## Checkpoints

### Phase 1 — Baseline and dependency security

- Raised the Nano ID override from 3.3.17 to 3.3.18.
- Upgraded React Router DOM from 7.18.1 to 7.18.2.
- Removed the obsolete React Router advisory exception so CI once again fails on every High or Critical dependency advisory.
- Updated repository security documentation and version guards.
- Verification: complete quality gate, development/production dependency policies, 209 tests, build, and secret scans pass.

### Phase 2 — API parity, account lifecycle, and quiz integrity

- Unified all Vercel API entrypoints with the shared Express handlers and mounted account deletion and quiz submission locally.
- Revoked Supabase sessions globally before account deletion and made revocation failure stop deletion.
- Removed answer keys and verifier evidence from quiz-generation responses and moved scoring behind an authenticated, owner-bound API.
- Added an additive, unapplied migration for immutable service-only quiz submissions.
- Verification: complete quality gate, both dependency policies, 215 tests, database migration smoke test, build, and secret scans pass.

### Phase 3 — Browser hardening, responsive UI, and documentation accuracy

- Added consistent security headers to Vercel and the local production server.
- Made the syllabus grade label owner-profile-driven and updated Class XI/XII product copy.
- Removed verified 320px and 390px overflow from public and legal headers without reducing touch height.
- Corrected database smoke-test reporting.
- Verification: complete quality gate with 217 tests; eight-width public responsive matrix; clean browser console; page/API header integration checks; 15-migration database smoke test.

## Final verification

| Check | Final result |
| --- | --- |
| Tracked files reviewed by repository-wide searches and targeted inspection | 318 |
| TypeScript | Passed |
| ESLint | Passed |
| Automated tests | 217 passed, 0 failed |
| Production build | Passed; largest entry chunk 318.22 kB / 100.09 kB gzip |
| Curriculum validation | 24 Class XI and 24 Class XII selectable subjects passed |
| Database migration smoke test | 15 migrations, 148 subjects, 764 nodes passed |
| Dependency policy | 0 Critical and 0 High in development and production trees |
| Working-tree secret scan | 417 text files passed |
| Reachable-history secret scan | 718 text blobs passed |
| Browser QA | Landing, Privacy, and Terms passed at eight widths with no console warnings/errors or overflow |
| Production/Preview deployment | Not performed |

## Unresolved risks and approval-gated work

- **Production migration required:** `20260817104756_add_server_scored_quiz_submissions.sql` must be reviewed and applied before deploying the new quiz client/API. Until both ship together, production retains the old answer-bearing response. Applying it requires explicit approval.
- **Credential-gated E2E not performed:** The isolated worktree intentionally had no Supabase or AI credentials. Live signup, email verification, password reset, OAuth providers, authenticated protected-page journeys, live cross-user RLS probes, and provider calls were not exercised. Automated auth, authorization, RLS-contract, quota, AI-validation, and persistence tests passed, but a Preview environment with isolated test credentials is the recommended next step.
- **No Vercel Preview deployed:** Build and configuration checks passed locally; actual Preview routing, dashboard environment scopes, HTTPS/HSTS, and provider integrations remain unverified until an approved Preview deployment.
- **Already-issued JWT lifetime:** Global account sign-out revokes refresh sessions, but an issued Supabase access JWT remains valid until its configured expiry. Keep the dashboard JWT lifetime short and verify it during the Preview audit.
- **Legal review:** Maintained legal drafts still explicitly require lawyer review before production reliance, especially for minor-user consent obligations.
- **Non-security dependency updates:** `npm outdated` reports newer compatible and major releases. They were not upgraded without a reproduced defect; continue routine, isolated update testing.
