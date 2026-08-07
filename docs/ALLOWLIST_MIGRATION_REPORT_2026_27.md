# Recall+ Class XI allowlist migration report (2026–27)

Date: 2026-08-07  
Status: **code + additive migrations ready; production Supabase migration not applied yet**

## Before (production Phase 7 baseline)

- Active catalogue subjects: **124** records / **121** selectable codes
- Languages: full CBSE Group-L set (39), including English/Hindi Electives and other languages
- English hierarchy: Hornbill / Snapshots modeled as **topics** under a literature unit
- Nodes: **295**

## After (in-repo active catalogue)

Exactly **24** active allowlist subjects:

| Code | Subject |
| --- | --- |
| 027 | History |
| 028 | Political Science |
| 029 | Geography |
| 030 | Economics |
| 034 | Hindustani Music Vocal |
| 037 | Psychology |
| 039 | Sociology |
| 041 | Mathematics |
| 042 | Physics |
| 043 | Chemistry |
| 044 | Biology |
| 048 | Physical Education |
| 049 | Painting |
| 054 | Business Studies |
| 055 | Accountancy |
| 066 | Entrepreneurship |
| 074 | Legal Studies |
| 083 | Computer Science |
| 118 | French |
| 241 | Applied Mathematics |
| 301 | English Core |
| 302 | Hindi Core |
| 843 | Artificial Intelligence |
| 837 | Fashion Studies |

Languages only:

| Code | Subject |
| --- | --- |
| 301 | English Core |
| 302 | Hindi Core |
| 118 | French |

## Removed from active selection

All subjects outside the allowlist (examples): English Elective, Hindi Elective, Informatics Practices, Biotechnology, Home Science, Sanskrit, German, Spanish, other music/fine-arts/skill variants, internal-assessment catalogue rows, etc.

Production behavior for historical rows: **deactivate** non-allowlist `curriculum_subjects`, **archive** matching `user_subjects`, keep study-log / progress JSON intact.

## Migrations created (additive)

1. `supabase/migrations/20260807210000_curriculum_allowlist_and_books.sql`  
   - Allows `node_type = book`  
   - Deactivates non-allowlist subjects  
   - Archives selections on inactive subjects  
   - Upserts 24-subject seed + replaces allowlist outline nodes (old nodes deactivated, not deleted)  
   - Updates study-log trigger to accept book / assessment / practical roots  

2. `supabase/migrations/20260807210100_allowlist_subject_combination_rules.sql`  
   - Subject 1 / required language = 301 / 302 / 118 only  
   - Removes obsolete IP / Business Admin / Core–Elective conflict branches  

Frozen (unchanged): `20260730120000_curriculum_profiles_and_rls.sql` (historical 121-subject bootstrap).

## Hierarchy fixes

- English Core: **Hornbill** and **Snapshots** are books; chapters nest under them  
- Hindi Core: **आरोह** / **वितान** books present; chapter lists pending official NCERT verification  
- Geography: three separate books preserved  

## Coverage

See `docs/CURRICULUM_COVERAGE_2026_27.md`.

- Seed nodes: **285**  
- Reviewed outlines: **19 / 24**  
- Pending verification (no invented outlines): 034, 049, 066, 118, 837 (and incomplete Hindi chapter detail)

## Verification run locally

- `npm run curriculum:validate` — pass (24 subjects, 285 nodes)  
- `npm run curriculum:sql:check` — pass (frozen bootstrap)  
- `npm run curriculum:client:check` — pass  
- `npm run test:db:smoke` — pass (9 migrations; 24 active selectable; book nodes present)  
- `npm run typecheck` / `lint` / `test` / `build` — pass (196 tests, 0 fail)

## Production / Vercel

- **Production migration status:** not applied (awaiting your go-ahead after backup confirmation)  
- **Vercel Preview:** not deployed from this agent turn  
- Existing production user snapshots: preserved by design (no truncate/delete of `user_app_data`)

## Remaining work

1. Confirm production backup / staging apply of the two new migrations  
2. Deploy frontend that understands book hierarchy  
3. Apply migrations to production Supabase  
4. Smoke-test signed-in onboarding + English study log + quiz  
5. Continue official chapter imports for PENDING VERIFICATION subjects without inventing content  
