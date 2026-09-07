# Data retention policy (draft)

Version: 0.1-draft  
Status: For lawyer review

## Active systems

- **Auth + profile + synced app data:** retained while the account exists.
- **Archived subject selections:** retained for history/integrity until account deletion.
- **Generation limiter rows:** retained while the account exists for abuse prevention.
- **Operational backups** (`recall_backup.*`): retained for disaster recovery; target review window **90 days** after the related migration unless a longer legal hold applies.
- **Vercel / Supabase logs:** subject to each provider’s retention; avoid logging student content.

## After account deletion

1. Supabase Auth user deleted via `/api/delete-account`.
2. Owner-scoped public tables cascade or become inaccessible.
3. Local browser storage cleared on sign-out / delete flow.
4. Provider backups may retain residual copies until their retention cycles expire — document this limitation to users.

## Open decisions for counsel

- Exact legal retention for educational records if any institutional use arises.
- Whether support mailbox messages require a separate retention schedule.
