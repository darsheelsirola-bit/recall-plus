# Data inventory (Recall+)

Version: 0.1-draft  
Effective intent: Asia/Kolkata product timezone  
Status: Engineering inventory for lawyer review — **not** a compliance certificate

| Data field | Source | Purpose | Storage | Retention (current) | Access | Third parties | Deletion | Controls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Account email | Auth signup / OAuth | Authentication, account recovery | Supabase Auth (`auth.users`) | While account exists | Owner; operators via Auth admin | Supabase; Google if OAuth used | Account deletion API / Auth admin | RLS; TLS |
| Display name | User / OAuth metadata | Personalise UI | `recall_profiles` | While account exists | Owner | Supabase | Cascade on Auth delete | Owner RLS |
| Google profile image URL | Google OAuth (optional) | Avatar display | Client/session; may sync in profile fields | Session / while linked | Owner | Google, Supabase Auth | Unlink / account delete | OAuth scopes limited |
| Password hash | Email signup | Authentication | Supabase Auth | While account exists | Auth subsystem only | Supabase | Account delete | Not readable by app |
| School name | Onboarding | Academic context | `user_academic_profiles` | While profile exists | Owner | Supabase | Cascade | RLS |
| Pathway / subjects | Onboarding | Syllabus filtering | `user_subjects`, academic profile | While selected / archived | Owner | Supabase | Archive / cascade | RLS |
| Study logs, quizzes, recalls, timetable JSON | App usage | Core product sync | `user_app_data` JSON snapshot | While account exists | Owner | Supabase | Cascade / overwrite | RLS + version CAS |
| AI generation counters | Server limiter | Cost/abuse control | `daily_generation_usage`, attempt tables | Rolling / account life | Server roles only (RLS deny clients) | Supabase | Account delete | RLS no client policies |
| Curriculum catalogue | Official CBSE sources | Syllabus metadata | `curriculum_*` | Product lifetime | Authenticated read | None beyond hosting | N/A (shared catalogue) | Read-only client policies |
| Support email correspondence | User emails | Support / privacy requests | Email inbox | Operator retention TBD | Support operator | Email provider | Manual | Access control on mailbox |

## Minimisation notes

- No advertising SDKs currently shipped.
- Exact date of birth is **not** collected.
- NVIDIA NIM prompts should use curriculum IDs/titles and study context, not unnecessary identity fields (verify in Phase 3).
