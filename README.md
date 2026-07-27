# Recall+

Recall+ is a Class 11 PCM revision app for Physics, Chemistry, and Mathematics. It combines study logging, syllabus tracking, spaced repetition, progress insights, and Groq-powered quiz and timetable generation.

The production architecture uses:

- React, TypeScript, and Vite for the browser app
- Supabase Auth for email/password authentication
- Supabase Postgres and Row Level Security (RLS) for per-user data and generation limits
- Vercel Functions, or the included Express server, as the trusted API boundary
- Groq for quiz and timetable generation

## Features

- NCERT-style Class 11 PCM chapter and topic tracking
- Daily study logs with time, confidence, and notes
- Synced per-user app data through Supabase
- Automatic spaced-repetition schedules at 1, 3, 7, 14, and 30 days
- Strong, Average, and Weak topic classification
- Account-scoped JSON backup import and export from Settings
- Responsive desktop and mobile navigation
- Separate daily limits of 10 successful quiz generations and 10 successful timetable generations
- Local-calendar-day resets based on the user's validated IANA timezone
- Server-side reservations and idempotent retries to prevent cross-tab and double-click quota races

## Generation-limit architecture

The browser checks the authenticated user's remaining quota before requesting a generation. The server then performs the authoritative check before it calls Groq:

1. The browser sends the Supabase access token and a unique request ID.
2. The API validates the token and derives the user ID from it.
3. A service-role-only Supabase RPC atomically reserves one request for the requested feature and binds its ID to a canonical request hash.
4. The API calls Groq and validates the existing quiz or timetable output contract.
5. A successful response commits one use. A failed response releases the reservation and does not reduce the quota.
6. A repeated request ID replays the stored result instead of calling Groq again.

Quiz and timetable counters are independent. Each counter resets when the next calendar day begins in the browser-detected timezone saved for the user at signup. Existing accounts can initialize a missing timezone exactly once. Only one active request per user and feature is allowed, and abandoned reservations expire after six minutes.

The daily quota is not stored in `localStorage`. Supabase is authoritative for authentication and generation usage, so refreshing, reopening the app, or opening another browser tab does not reset or bypass the limit. Browser storage may still be used as a client cache for app state; it is not a security boundary.

## Prerequisites

- Node.js 24.16.0 (pinned in `.nvmrc` and `.node-version`)
- npm 11.12 or newer within npm 11 (CI and `packageManager` use 11.13.0)
- Git
- A Supabase project
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Two Groq API keys, one for each generation feature
- A GitHub account and repository for Git-based deployment
- A Vercel account for the hosted production app

Verify the local toolchain:

```bash
node --version
npm --version
git --version
supabase --version
```

## Install and configure locally

Run these commands from the directory containing `package.json`:

```bash
npm ci
```

`npm ci` installs exactly the versions in `package-lock.json`. Use `npm install`
only when intentionally changing dependencies, and commit the resulting lockfile
with the dependency change.

Create the local environment file.

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

Fill in `.env` with values from the Supabase project and Groq:

```env
# Public browser configuration
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
# Alternatively, use VITE_SUPABASE_PUBLISHABLE_KEY instead of
# VITE_SUPABASE_ANON_KEY when the Supabase project provides a publishable key.

# Server-only Supabase configuration
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Server-only AI provider configuration
GROQ_QUIZ_API_KEY=YOUR_QUIZ_AND_INSIGHTS_GROQ_KEY
GROQ_TIMETABLE_API_KEY=YOUR_TIMETABLE_GROQ_KEY
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_REQUEST_TIMEOUT_MS=20000

# Used by the local Express API only
PORT=8787
```

Never commit `.env`. It is ignored by Git. Only the Supabase URL and anon/publishable key may use the `VITE_` prefix. Never prefix the Supabase service-role key or either Groq key with `VITE_`, because Vite embeds `VITE_` variables in the browser bundle.

### Configure Supabase Auth

In the Supabase Dashboard:

1. Enable the Email authentication provider.
2. Set the development Site URL to `http://localhost:5173`.
3. Add `http://localhost:5173` to the allowed redirect URLs.
4. Keep anonymous sign-ins disabled.
5. Require email confirmation and enable secure password changes.
6. Require passwords of at least eight characters with lowercase, uppercase,
   digits, and symbols.
7. Keep the email send frequency at one minute or slower.
8. Enable leaked-password protection when the Supabase plan supports it.
9. Enable CAPTCHA when public signup abuse is a realistic risk, especially in
   Production.

The checked-in local Supabase configuration uses these password, confirmation,
secure-change, and frequency settings. Match them manually in every hosted
Supabase project because local configuration does not configure the hosted Auth
dashboard. Add the exact Production URL after Vercel creates it. If Preview
deployments use authentication, allow only the exact Preview URLs or the
narrowest acceptable Preview pattern; do not use an unrestricted redirect
wildcard.

### Apply the Supabase migration

The production schema is defined by the ordered migrations in:

```text
supabase/migrations/
```

Link the repository to the intended Supabase project, review the pending migration, and then apply it:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

The ordered production migrations are:

- `20260726190818_secure_user_data_and_generation_limits.sql` creates profiles,
  synchronized app data, RLS policies, independent quiz and timetable counters,
  atomic reservations, cached result replay, and service-role-only quota RPCs.
- `20260727094001_harden_generation_attempts_and_user_data.sql` adds optimistic
  snapshot versions, bounded stored payloads, durable attempt throttles,
  insight reservations, stricter grants, and user-bound RPC signatures.
- `20260727094206_validate_hardening_size_constraints.sql` validates the
  snapshot and generation-result size constraints after the production
  preflight confirms that historical rows fit the new bounds.
- `20260727094712_harden_default_function_privileges.sql` removes PostgreSQL's
  global implicit `PUBLIC` execute default for future functions. Approved RPCs
  continue to receive explicit grants.

Always inspect the dry-run output before applying a production migration. Do not run `supabase db reset --linked` against a production project because it is destructive.

For an optional local Supabase stack, Docker must be running:

```bash
supabase start
supabase db reset
```

Use the local URL and keys printed by the CLI in `.env`.

### Start the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Express API runs on port `8787`, and Vite proxies `/api` requests to it.

Other useful commands:

```bash
npm run dev:web
npm run dev:api
npm run build
npm start
```

`npm start` serves the built `dist` directory and API from the same Express process. Vercel uses the handlers in `api/` instead.

## Environment variables

| Variable | Exposure | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | Yes | Supabase project URL used by the browser client |
| `VITE_SUPABASE_ANON_KEY` | Browser | One browser key is required | Supabase legacy anon key; access remains controlled by RLS |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser | One browser key is required | Supabase publishable key; use instead of `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_URL` | Server | Yes | Supabase project URL used by API functions |
| `SUPABASE_ANON_KEY` | Server | Yes | Used while validating authenticated requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Yes | Executes protected persistence and generation-limit RPCs |
| `GROQ_QUIZ_API_KEY` | Server secret | Yes | Calls Groq for quiz and dashboard insight generation |
| `GROQ_TIMETABLE_API_KEY` | Server secret | Yes | Calls Groq for timetable generation only |
| `GROQ_MODEL` | Server | No | Overrides the default Groq model |
| `GROQ_REQUEST_TIMEOUT_MS` | Server | No | Per-attempt Groq timeout, clamped to 5–30 seconds |
| `PORT` | Local server | No | Express port; defaults to `8787` |

Use the following environment scopes:

| Environment | File or scope | Required configuration |
| --- | --- | --- |
| Local development | Untracked `.env` | All required browser and server variables, plus optional `PORT`, model, and timeout |
| Vercel Preview | Preview scope | All required browser and server variables; use preview-only Supabase and Groq credentials |
| Vercel Production | Production scope | All required browser and server variables; use production-only credentials |

Do not share the Supabase service-role key or Groq keys between Preview and
Production unless that risk has been explicitly reviewed. A separate Preview
Supabase project keeps test accounts, data, quotas, and destructive migration
testing away from production.

On Vercel, the build fails before compilation when a required variable is
missing, the browser and server Supabase URLs differ, a public setting matches
or resembles a private credential, the anon key equals the service-role key, the
two Groq keys are identical, the timeout is outside 5-30 seconds, Corepack is not
enabled, or a secret-looking variable uses the public `VITE_` prefix. The
validator reports variable names and reasons only; it never prints values.

## Push to GitHub

Create an empty GitHub repository without an auto-generated README, license, or `.gitignore`. Then run these commands from the Recall+ app directory:

```bash
git init
git check-ignore -v .env
git status --ignored
git add .
git commit -m "Prepare Recall+ production deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

`git check-ignore -v .env` must show that `.env` is ignored before the first commit. Review `git status` and do not commit private keys, `.env` files, Supabase temporary files, build output, or dependency directories.

If the GitHub CLI is installed, the remote-creation and push steps can instead be performed with:

```bash
gh repo create YOUR_REPOSITORY --private --source=. --remote=origin --push
```

See GitHub's [guide for adding locally hosted code](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) for repository visibility and organization options.

## Deploy to Vercel

1. In Vercel, select **Add New > Project** and import the GitHub repository.
2. Set the Root Directory to the directory containing `package.json` and `vercel.json`.
   - Use `.` if the GitHub repository was initialized inside this app directory.
   - Use `recall-plus-groq-updated` if a parent workspace was pushed as the repository root.
3. Use the Vite framework preset.
4. Set the project Node.js version to 24.x.
5. Add the environment variables listed above for the appropriate Production and Preview scopes.
6. Apply the Supabase migration before the first functional deployment.
7. Deploy the project.

The checked-in `vercel.json` supplies `npm ci`, the full `npm run vercel:build`
quality gate, the `dist` output directory, SPA rewrites, and the
generation-function duration. Vercel's Git integration creates Preview
deployments for non-production branches and deploys the configured production
branch, normally `main`, after successful pushes. The Vercel build also rejects
any high- or critical-severity dependency advisory not covered by the narrow,
guarded exception documented below.

Vercel guarantees the Node 24 major and rolls forward security patch releases;
local development and CI use the exact `24.16.0` pin. Vercel's supported npm
11.x toolchain satisfies the declared range, while CI installs npm `11.13.0`
explicitly and every environment uses the checked-in lockfile with `npm ci`.

After Vercel assigns the production domain:

1. Set that URL as the Supabase Auth Site URL.
2. Add the exact production callback URL to the Supabase allowed redirect URLs.
3. Redeploy if any build-time `VITE_` variable changed.

See the official [Vercel Git deployment](https://vercel.com/docs/git), [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), and [environment-variable](https://vercel.com/docs/environment-variables) documentation for dashboard details.

## Verification

Run the complete local quality gate before pushing or deploying:

```bash
npm run check
npm run audit:all
```

The equivalent individual commands are:

```bash
npm run verify:router
npm run typecheck
npm run lint
npm test
npm run build
npm run scan:secrets
npm run scan:history
npm run audit:all
```

`verify:router` guards the declarative SPA API while `react-router-dom` remains
exact-pinned to `7.18.1`. The working-tree scan checks source and build output
without printing credential values. The history scan checks every reachable Git
blob when a complete checkout is available. CI checks out full history so the
history scan cannot silently cover only a shallow clone.

Database migrations and pgTAP tests can be verified with Docker running:

```bash
supabase db start
supabase test db
```

The GitHub Actions workflow runs `npm ci`, the complete application quality gate,
the dependency audit policy, a clean local Supabase database, all ordered
migrations, and `supabase test db` for pull requests and pushes to `main`.

### Temporary React Router audit exception

Raw `npm audit` reports high-severity
[`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
for React Router 7.18.1. The advisory states that it affects only unstable React
Server Components APIs. Its listed 8.3.0 patch is not currently published to
npm, so attempting that version would make clean installs fail.

`npm run audit:all` still executes a fresh npm audit and fails closed. It permits
only that exact advisory while all of these controls remain true:

- `react-router-dom` and its `react-router` dependency resolve exactly to
  `7.18.1`.
- No runtime source imports `react-router` directly, uses an unstable RSC
  identifier, enables the `react-server` condition, or depends on a
  `react-server-dom-*` package.
- No other high- or critical-severity advisory is present.

Any failed audit request, changed router version, RSC usage, or additional
high/critical advisory fails CI and Vercel. Remove this narrow exception as soon
as a compatible patched release is available on npm.

The rate-limit test coverage verifies:

1. The first successful generation changes the remaining count from 10 to 9.
2. A failed provider request does not reduce the remaining count.
3. Quiz usage does not affect timetable usage.
4. An eleventh generation is rejected before the provider is called.
5. Usage resets on the next calendar day in the user's timezone.
6. Rapid double-clicks send only one generation request.

The tests also exercise idempotent replay and stale-reservation recovery. A deployment should not proceed unless `npm run check` succeeds.

For a production smoke test, sign in with a non-privileged test account, confirm both counters begin independently, complete one generation of each type, refresh the page, and verify that both remaining counts persist. Check browser developer tools to confirm Groq keys and the Supabase service-role key are absent from network payloads and built assets.

## Security notes

- The API validates the Supabase access token and never trusts a client-provided user ID.
- RLS restricts user-facing tables to their owner.
- Generation-limit tables and mutation RPCs are not writable by the browser role.
- The service-role key is used only by the server and bypasses RLS; treat it as a high-impact secret.
- Groq keys remain server-side and are split by feature.
- The authoritative quota check occurs before the Groq call, while the usage increment occurs only after a validated successful response.
- A browser-detected, validated IANA timezone is stored for the user and used by the server to calculate local-day boundaries.
- Missing authentication, Supabase configuration, or rate-limit state fails closed; there is no production `localStorage` quota fallback.
- Rotate any service-role or provider key immediately if it is exposed, and update all affected Vercel environments.

The public Supabase anon/publishable key is designed to be used by the browser, but it is safe only when RLS and database grants remain correctly configured. Never use it as a substitute for authorization checks.

## Generation API behavior

The browser calls:

- `GET /api/generation-usage` for the authenticated user's current counters
- `POST /api/generate-quiz` for quiz generation
- `POST /api/generate-timetable` for timetable generation

Generation requests require a valid bearer token and a unique request ID. Limit exhaustion returns HTTP `429` before Groq is called. Provider failures return an error without committing usage. Successful responses preserve the existing quiz and timetable output logic and include updated usage metadata for the UI.
