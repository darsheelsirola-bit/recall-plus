# Data breach response (draft)

Version: 0.1-draft  
Status: Operational draft for lawyer review — not a guarantee of regulatory adequacy

## Severity

| Level | Example | Action |
| --- | --- | --- |
| S1 Critical | Confirmed exfiltration of user emails + study data | Contain, rotate secrets, notify counsel, prepare user notice |
| S2 High | Service-role key exposure | Rotate immediately; audit access logs |
| S3 Medium | Suspicious auth spikes | Rate-limit, investigate, document |
| S4 Low | Single-user support issue | Normal support |

## Immediate steps

1. Contain (revoke tokens, disable leaked keys, freeze suspect access).
2. Preserve evidence (deployment IDs, migration versions, log windows) without copying unnecessary personal data.
3. Assess scope (which tables/users/providers).
4. Remediate and verify.
5. Decide on notices with counsel under applicable Indian law (DPDP phased obligations apply — see `SECURITY_AUDIT_PROGRESS.md`).
6. Post-incident review within 14 days.

## Contacts (placeholders)

- Privacy: `[PRIVACY EMAIL]` / operational `recallplus.website@gmail.com`
- Support: `[SUPPORT EMAIL]`
- Grievance: `[GRIEVANCE CONTACT]`
