# Recall+

Recall+ is a Class 11 PCM revision app for Physics, Chemistry, and Mathematics. It combines study logging, syllabus tracking, spaced repetition, progress insights, and NVIDIA NIM-powered quiz and timetable generation.

The production architecture uses:

- React, TypeScript, and Vite for the browser app
- Supabase Auth for email/password authentication
- Google, Apple, and GitHub sign-in through Supabase Auth
- Supabase Postgres and Row Level Security (RLS) for per-user data and generation limits
- Vercel Functions, or the included Express server, as the trusted API boundary
- NVIDIA NIM (`https://integrate.api.nvidia.com/v1`) for quiz, timetable, insight, and recall generation

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

The browser checks the authenticated user's remaining quota before requesting a generation. The server then performs the authoritative check before it calls NVIDIA NIM:

1. The browser sends the Supabase access token and a unique request ID.
2. The API validates the token and derives the user ID from it.
3. A service-role-only Supabase RPC atomically reserves one request for the requested feature and binds its ID to a canonical request hash.
4. The API calls NVIDIA NIM and validates the existing quiz or timetable output contract.
5. A successful response commits one use. A failed response releases the reservation and does not reduce the quota.
6. A repeated request ID replays the stored result instead of calling NVIDIA NIM again.

Quiz and timetable counters are independent. Each counter resets when the next calendar day begins in the browser-detected timezone saved for the user at signup. Existing accounts can initialize a missing timezone exactly once. Only one active request per user and feature is allowed, and abandoned reservations expire after six minutes.

The daily quota is not stored in `localStorage`. Supabase is authoritative for authentication and generation usage, so refreshing, reopening the app, or opening another browser tab does not reset or bypass the limit. Browser storage may still be used as a client cache for app state; it is not a security boundary.

## Prerequisites

- Node.js 24.16.0 (pinned in `.nvmrc` and `.node-version`)
- npm 11.12 or newer within npm 11 (CI and `packageManager` use 11.13.0)
- Git
- A Supabase project
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- One NVIDIA NIM API key (`NVIDIA_API_KEY`) kept only in server-side environment variables
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

Fill in `.env` with values from the Supabase project and NVIDIA NIM:

```env
# Public browser configuration
VITE_SUPABASE_URL=https://bqysqcsogqxfhrtuituo.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
# Alternatively, use VITE_SUPABASE_PUBLISHABLE_KEY instead of
# VITE_SUPABASE_ANON_KEY when the Supabase project provides a publishable key.
VITE_AUTH_GOOGLE_ENABLED=true
VITE_AUTH_GITHUB_ENABLED=false
VITE_AUTH_APPLE_ENABLED=false

# Server-only Supabase configuration
SUPABASE_URL=https://bqysqcsogqxfhrtuituo.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Server-only NVIDIA NIM configuration. Never prefix these with VITE_.
NVIDIA_API_KEY=YOUR_NVIDIA_API_KEY
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
NVIDIA_MODEL_QUIZ=
NVIDIA_MODEL_TIMETABLE=
NVIDIA_MODEL_INSIGHT=
NVIDIA_MODEL_RECALL=
NVIDIA_MODEL_VERIFIER=
NVIDIA_REQUEST_TIMEOUT_MS=20000

# Used by the local Express API only
PORT=8787
```

Never commit `.env`. It is ignored by Git. Only the Supabase URL and anon/publishable key may use the `VITE_` prefix. Never prefix the Supabase service-role key or `NVIDIA_API_KEY` with `VITE_`, because Vite embeds `VITE_` variables in the browser bundle.

### Configure Supabase Auth

In the Supabase Dashboard:

1. Enable the Email authentication provider.
2. Set the development Site URL to `http://localhost:5173`.
3. Add `http://localhost:5173/auth/callback` to the allowed redirect URLs.
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

### Configure Google, Apple, and GitHub sign-in

The linked Production deployment uses Supabase project
`bqysqcsogqxfhrtuituo` and the canonical app origin
`https://recall-plus.vercel.app`. Verify those values again before changing
provider credentials if the Vercel or Supabase project is ever relinked.
In the Supabase Dashboard, select the Recall+ project with that reference and
open **Authentication > Sign In / Providers** before configuring any provider.

There are two different callback URL types:

| Registration location | URL |
| --- | --- |
| Google, GitHub, and Apple provider consoles | `https://bqysqcsogqxfhrtuituo.supabase.co/auth/v1/callback` |
| Supabase Auth > URL Configuration, local app | `http://localhost:5173/auth/callback` |
| Supabase Auth > URL Configuration, production app | `https://recall-plus.vercel.app/auth/callback` |

The provider callback sends the provider response to Supabase Auth. Supabase
then returns the browser to Recall+'s `/auth/callback` route. Do not register
the Vercel callback in a provider console in place of the Supabase callback.

In **Supabase Dashboard > Authentication > URL Configuration**:

1. Set the hosted project's Site URL to
   `https://recall-plus.vercel.app`.
2. Add `http://localhost:5173/auth/callback`.
3. Add `https://recall-plus.vercel.app/auth/callback`.
4. If Vercel Preview authentication is required, add only exact Preview
   callbacks or the narrow project pattern
   `https://recall-plus-*-darshel.vercel.app/auth/callback`. The requested
   broader fallback is `https://*.vercel.app/auth/callback`; use it only when
   the narrow project pattern cannot cover the required Preview URLs because it
   permits callbacks from unrelated Vercel projects.

Keep all three `VITE_AUTH_*_ENABLED` flags `false` until the matching provider
console credentials are saved in Supabase and the complete Production flow is
tested. The flag controls only Recall+'s UI and does not enable a provider in
Supabase.

#### Google

1. In Google Cloud, create or select a project and configure the Google Auth
   Platform consent screen, audience, branding, and the `openid`, email, and
   profile scopes.
2. Create an OAuth client with application type **Web application**.
3. Add these **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `https://recall-plus.vercel.app`
4. Add this **Authorized redirect URI**:
   - `https://bqysqcsogqxfhrtuituo.supabase.co/auth/v1/callback`
5. In **Supabase Dashboard > Authentication > Sign In / Providers > Google**,
   enable Google and enter the Google client ID and client secret.
6. Test from both `http://localhost:5173` and
   `https://recall-plus.vercel.app`.

When testing against a fully local Supabase CLI stack instead of the hosted
project, use `http://127.0.0.1:54321/auth/v1/callback` as the Google redirect
URI and configure the local provider separately.

#### GitHub

1. In GitHub, open **Settings > Developer settings > OAuth Apps** and register
   a new OAuth App.
2. Set **Homepage URL** to `https://recall-plus.vercel.app`.
3. Set **Authorization callback URL** to
   `https://bqysqcsogqxfhrtuituo.supabase.co/auth/v1/callback`.
4. In **Supabase Dashboard > Authentication > Sign In / Providers > GitHub**,
   enable GitHub and enter the OAuth App client ID and client secret.
5. Test the complete flow locally and in Production. GitHub OAuth Apps accept
   one callback URL, so use a separate development OAuth App when testing
   against the local Supabase stack; its callback is
   `http://127.0.0.1:54321/auth/v1/callback`.

#### Apple

Apple web OAuth requires an active Apple Developer account.

1. In Apple Developer **Certificates, Identifiers & Profiles**, create or
   select an App ID and enable **Sign in with Apple**.
2. Create a **Services ID** for Recall+ and associate it with that App ID. The
   Services ID is the web OAuth client ID; use
   `https://recall-plus.vercel.app` as the Recall+ website URL.
3. Under the Services ID web configuration, add the domain
   `bqysqcsogqxfhrtuituo.supabase.co`.
4. Configure the return URL as
   `https://bqysqcsogqxfhrtuituo.supabase.co/auth/v1/callback`.
5. Create a Sign in with Apple key, download the `.p8` private key once, and
   record its **Key ID**. Record the Apple Developer **Team ID** as well.
6. Generate the Apple client secret from the Services ID, Team ID, Key ID, and
   `.p8` private key. Keep the private key and generated secret outside this
   repository.
7. In **Supabase Dashboard > Authentication > Sign In / Providers > Apple**,
   enable Apple, put the Services ID first in Client IDs, and enter the
   generated Apple secret.
8. Rotate the Apple OAuth secret at least every six months and retest the
   complete flow after rotation.
9. Keep `VITE_AUTH_APPLE_ENABLED=false` until that Production retest succeeds.

Apple's web OAuth flow may not provide a name. Recall+ therefore creates the
profile as `Recall+ User` when no usable provider name exists. The user can edit
that name later; subsequent sign-ins never overwrite it.

Provider client secrets, the Apple `.p8` key, Apple generated secrets, and
provider access tokens are not Vite variables and must never be added with a
`VITE_` prefix. The browser needs only `VITE_SUPABASE_URL` and one Supabase
anon/publishable key. Provider secrets belong in Supabase Auth configuration.

### Apply the Supabase migration

The production schema is defined by the ordered migrations in:

```text
supabase/migrations/
```

Link the repository to the intended Supabase project, review the pending migration, and then apply it:

```bash
supabase login
supabase link --project-ref bqysqcsogqxfhrtuituo
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
- `20260727180523_fix_profile_name_and_india_timezone.sql` enforces the Recall+
  profile-name contract and the fixed India Standard Time product policy.
- `20260728071537_oauth_profile_metadata_defaults.sql` creates exactly one
  profile/app-data row for new OAuth users, selects the first usable provider
  name, and falls back to `Recall+ User` without overwriting existing profiles.

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
| `NVIDIA_API_KEY` | Server secret | Yes | Calls NVIDIA NIM for quiz, recall, insight, and timetable generation |
| `NVIDIA_MODEL` | Server | Yes | NVIDIA NIM model ID, for example `meta/llama-3.3-70b-instruct` |
| `NVIDIA_MODEL_QUIZ` | Server | No | Optional quiz-generation model override |
| `NVIDIA_MODEL_TIMETABLE` | Server | No | Optional timetable model override |
| `NVIDIA_MODEL_INSIGHT` | Server | No | Optional insight model override |
| `NVIDIA_MODEL_RECALL` | Server | No | Optional recall-check model override |
| `NVIDIA_MODEL_VERIFIER` | Server | No | Optional answer-key verifier model override |
| `NVIDIA_REQUEST_TIMEOUT_MS` | Server | No | Per-attempt NVIDIA timeout, clamped to 5–30 seconds |
| `PORT` | Local server | No | Express port; defaults to `8787` |

Use the following environment scopes:

| Environment | File or scope | Required configuration |
| --- | --- | --- |
| Local development | Untracked `.env` | All required browser and server variables, plus optional `PORT`, model, and timeout |
| Vercel Preview | Preview scope | All required browser and server variables; use preview-only Supabase and NVIDIA credentials |
| Vercel Production | Production scope | All required browser and server variables; use production-only credentials |

Do not share the Supabase service-role key or `NVIDIA_API_KEY` between Preview and
Production unless that risk has been explicitly reviewed. A separate Preview
Supabase project keeps test accounts, data, quotas, and destructive migration
testing away from production.

On Vercel, the build fails before compilation when a required variable is
missing, the browser and server Supabase URLs differ, a public setting matches
or resembles a private credential, the anon key equals the service-role key,
the timeout is outside 5-30 seconds, Corepack is not
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
every high- or critical-severity dependency advisory.

Vercel guarantees the Node 24 major and rolls forward security patch releases;
local development and CI use the exact `24.16.0` pin. Vercel's supported npm
11.x toolchain satisfies the declared range, while CI installs npm `11.13.0`
explicitly and every environment uses the checked-in lockfile with `npm ci`.

After Vercel assigns the production domain:

1. Set that URL as the Supabase Auth Site URL.
2. Add `https://recall-plus.vercel.app/auth/callback` to the Supabase Auth allowed
   redirect URLs.
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
exact-pinned to `7.18.2`. The working-tree scan checks source and build output
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

### Dependency audit policy

`npm run audit:all` executes a fresh npm audit and fails closed when npm cannot
produce a valid report or when any high- or critical-severity advisory is
present. React Router is exact-pinned to the reviewed patched release 7.18.2,
and the previous temporary RSC advisory exception has been removed.

The rate-limit test coverage verifies:

1. The first successful generation changes the remaining count from 10 to 9.
2. A failed provider request does not reduce the remaining count.
3. Quiz usage does not affect timetable usage.
4. An eleventh generation is rejected before the provider is called.
5. Usage resets on the next calendar day in the user's timezone.
6. Rapid double-clicks send only one generation request.

The tests also exercise idempotent replay and stale-reservation recovery. A deployment should not proceed unless `npm run check` succeeds.

For a production smoke test, sign in with a non-privileged test account, confirm both counters begin independently, complete one generation of each type, refresh the page, and verify that both remaining counts persist. Check browser developer tools to confirm `NVIDIA_API_KEY` and the Supabase service-role key are absent from network payloads and built assets.

## Security notes

- The API validates the Supabase access token and never trusts a client-provided user ID.
- RLS restricts user-facing tables to their owner.
- Generation-limit tables and mutation RPCs are not writable by the browser role.
- The service-role key is used only by the server and bypasses RLS; treat it as a high-impact secret.
- `NVIDIA_API_KEY` remains server-side and is never prefixed with `VITE_`.
- The authoritative quota check occurs before the NVIDIA NIM call, while the usage increment occurs only after a validated successful response.
- A browser-detected, validated IANA timezone is stored for the user and used by the server to calculate local-day boundaries.
- Missing authentication, Supabase configuration, or rate-limit state fails closed; there is no production `localStorage` quota fallback.
- Rotate any service-role or provider key immediately if it is exposed, and update all affected Vercel environments.

The public Supabase anon/publishable key is designed to be used by the browser, but it is safe only when RLS and database grants remain correctly configured. Never use it as a substitute for authorization checks.

## Generation API behavior

The browser calls:

- `GET /api/generation-usage` for the authenticated user's current counters
- `POST /api/generate-quiz` for quiz generation
- `POST /api/submit-quiz` for authenticated server-side quiz scoring
- `POST /api/generate-timetable` for timetable generation

Generation requests require a valid bearer token and a unique request ID. Limit exhaustion returns HTTP `429` before NVIDIA NIM is called. Provider failures return an error without committing usage. Quiz generation returns question content without answer keys; the authenticated submission endpoint scores the exact saved quiz once on the server. Successful generation responses include updated usage metadata for the UI.
