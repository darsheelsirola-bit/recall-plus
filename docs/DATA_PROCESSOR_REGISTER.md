# Data processor / subprocessor register (draft)

| Provider | Data shared | Purpose | Region (known) | Notes |
| --- | --- | --- | --- | --- |
| Supabase | Auth, profiles, app JSON, curriculum | Auth + DB | ap-south-1 (prod) | Primary processor; DPA via Supabase terms |
| Vercel | Request metadata, static assets, serverless logs | Hosting + API | Provider edge | Hosting processor |
| Groq | Curriculum/study context in prompts | Quiz / timetable / insights generation | Provider cloud | No API key in browser; minimise personal data in prompts |
| Google | OAuth identity (optional) | Sign-in | Google | Limited scopes; no Gmail/Drive access requested |
| Email provider (mailbox) | User-initiated support emails | Support / privacy requests | Provider-dependent | Operator-managed inbox |

Do **not** state that any provider guarantees Recall+ legal compliance.
