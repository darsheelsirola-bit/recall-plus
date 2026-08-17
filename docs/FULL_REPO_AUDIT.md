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

## Checkpoints

### Phase 1 — Baseline and dependency security

- Raised the Nano ID override from 3.3.17 to 3.3.18.
- Upgraded React Router DOM from 7.18.1 to 7.18.2.
- Removed the obsolete React Router advisory exception so CI once again fails on every High or Critical dependency advisory.
- Updated repository security documentation and version guards.
- Verification: complete quality gate, development/production dependency policies, 209 tests, build, and secret scans pass.

## Open audit phases

- Auth, authorization, RLS, migrations, and data integrity
- API, validation, rate limits, AI, and error handling
- Routing, runtime flows, UI/UX, accessibility, and responsive behavior
- Performance, dead code, dependency hygiene, Vercel readiness, and repository hygiene
- Browser-driven realistic user journeys and final regression suite
