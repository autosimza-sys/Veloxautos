# Pilot access and message admission — 2026-10-13

Buyer registration is available in the modal and selected when a visitor starts a vehicle conversation. Publication entry preserves seller roles. A signup response cannot claim publishing access before its profile is loaded. Both login forms link to `/recuperar-cuenta`.

Password recovery uses a separate in-memory SDK client. Only a valid `PASSWORD_RECOVERY` event enables a new password. Ordinary sessions, invalid links, provider failures and duplicate requests are covered. The UI acknowledges a password change only after the matching user is returned; global sign-out revokes refresh sessions, while existing access tokens may remain valid until expiry.

Configure the exact production recovery redirect and verify real email delivery before treating recovery as operational. Current Supabase email auto-confirmation does not establish mailbox ownership. This change does not turn on email verification, start a campaign or enable payments.

Migration `202610130001_message_rate_limit.sql` admits at most 30 new sends per author and 10 per conversation/author in a rolling 60-second window. FAQ and human messages use the same admission path. Confirmed retries return their existing result without consuming quota. Failed operations roll back admission state. The old message RPC and direct INSERT must remain revoked by `scripts/finalize-client-cutover.sql`; the migration preserves those ACLs.

Before production: retain a database/media backup, rehearse the migration and simultaneous independent sessions against PostgreSQL, apply the migration, then check the live admission boundary and retries with disposable pilot accounts. The state table is private and contains only recent acceptance timestamps and conversation IDs, not message text. For rollback, use a new forward migration restoring the previous wrapper and keep old entrypoints revoked; do not restore a full backup over new customer activity.

Local validation: `npm run verify` — lint, 655 tests and production build; `npm run test:e2e` — 20 desktop/mobile flows. Recovery includes 17 offline cases; server admission includes 11 focused cases. The real pilot separately exercised 240 canonical questions for each of the three seller roles. A response acknowledging missing data is not a resolved sales question.

Public launch gates: email confirmation and actual recovery delivery, participants and vehicle facts, common campaign date/quotas and post-promotion policy. Commercial AI credits, payment collection and invoice issuance are not implemented by this change.
