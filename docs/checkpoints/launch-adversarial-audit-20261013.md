# Adversarial prelaunch audit — 13 October 2026

**Public-launch recommendation: blocked (45/100, an engineering prioritization score, not a certification).** Password recovery redirects to localhost, email ownership/delivery remains unverified, and production accepts malformed listing data capable of crashing the public auto-check display. The code changes in this branch address data integrity and browser defenses; they do not repair the hosted Auth configuration.

## Release and scope

Production baseline: `49573c852ba1fa4b4135a30e8b8fa3dbc03a365d`. The proposed migration is `202610130006_launch_input_integrity.sql`. It has **not** been applied to the hosted database in this audit.

Tests that try to break data run against an isolated PostgreSQL engine and synthetic browser services. Hosted checks use public HTTP, metadata and aggregates. Two recovery links were generated for an existing synthetic account to inspect redirect behavior; their new sessions were closed locally. No recovery email was sent, no password changed, no additional user created, no AI response purchased and no campaign/payment enabled. No destructive or volume attack was made against production. The recurring Velox pilot monitor was deleted at the owner's request.

## Findings and disposition

| Priority | Finding | Evidence and proposed disposition |
|---|---|---|
| P1 | Recovery link cannot reach Velox | A generated recovery link requested `https://veloxautos.vercel.app/recuperar-cuenta`; verification returned HTTP 303 to `http://localhost:3000/`. The resulting synthetic session was closed with HTTP 204. Correct hosted Site URL and exact allowed redirect, then verify delivery and a full reset with a controlled real inbox. SMTP configuration has not been inspected. |
| P1 | Malformed auto check breaks public rendering | An authenticated synthetic publisher stored a nested JSON value; anonymous catalog returned it and React rendering threw. Add defensive rendering for existing records and a server-side trigger for new content. No malformed current production row was found by aggregate inspection. |
| P1 before open registration | Email ownership is not checked | Hosted public Auth settings show autoconfirm enabled. Synthetic `.invalid` pilot accounts are deliberately not email-delivery evidence. Configure and test verification with a real inbox before public acquisition. |
| P2 | Linked media can change after publication validation | Owner UPDATE of photo metadata and DELETE of a linked object succeed in the isolated baseline; the reference survives deletion. Drop browser UPDATE/DELETE policies. The app already uploads immutable paths with `upsert:false`. Cleanup requires trusted Storage API maintenance after reference reconciliation. |
| P2 | Unbounded publication and draft data | A 200,000-character listing description was accepted. Add field limits, known string checklist keys, a 32 KiB publication intent / 8 KiB media intent limit, and a 64 KiB object draft limit. An invalid publication rolls back its debit and vehicle atomically. Blocked/non-seller accounts cannot create/update drafts. |
| P2 | Dormant payment table writable from browser | No checkout exists, but clients retained INSERT/UPDATE/DELETE grants on orders. Revoke those writes without modifying existing rows. This is preventive closure; no live payment or observed monetary theft is claimed. |
| P2 | Missing browser defenses | Hosted HTML responses lacked framing, MIME-sniffing and referrer protections. Add narrowly scoped CSP directives and security headers. This is not a full script-src/nonce CSP. |
| P2 before open registration | Storage capacity abuse remains possible | Uploading unlinked files does not require a publication debit. Upload-before-publish is legitimate, but total/count quotas, a bounded staging lifecycle and abuse monitoring are still absent. The per-object limit alone does not solve aggregate exhaustion. |
| P2 capacity | Catalog has no pagination | The client loads the complete catalog and signs its media. Establish bounded retrieval and measure capacity in isolated staging before claiming traffic readiness. No throughput or load-capacity certification was performed. |
| P2 toolchain | Development dependency advisory | Runtime dependency audit found zero known vulnerabilities; the dev audit reports five high-severity package entries along one braces/micromatch/eslint chain. Do not force the suggested Next ESLint downgrade; evaluate a compatible update. |

The first blocked-draft probe used a nonexistent column and is invalid as product evidence. A corrected regression tests the actual `data` column. Initial browser failures due to missing bundled Chromium and a selector matching Next's route announcer were test infrastructure issues; the test now uses the recovery region. Failed attempts remain in local audit artifacts rather than being rewritten as successes.

## Confirmed protections and limits

- All 22 inspected public tables have RLS enabled. Privileged AI claim/reserve/finish functions remain inaccessible to browser roles. Ownership edits, self-admin escalation and the retired direct-message path were denied in isolated adversarial checks.
- Anonymous and forged-token assistant requests return 401; an oversized request returns 413, without a valid AI invocation.
- Both media buckets are private with bounded MIME types and a 25 MiB object cap. This does not prove file contents or aggregate upload quotas safe.
- Home, demo, recovery and admin HTML return 200. An admin shell returning 200 is not evidence that admin data is public.
- Tests of the real Supabase browser SDK use intercepted synthetic responses. They verify callback, expiry, retry, password update and session-closure handling; they cannot prove SMTP delivery or hosted Auth configuration.
- No private-schema table row, customer conversation, credential, token or real recipient address is included in this report. A current source scan is not a full Git-history secret audit.

## Safe rollout and recovery

1. Keep public acquisition and the common 90-day campaign off until launch blockers close. Preserve the US$10/month AI cap.
2. Capture a fresh backup and metadata-only preflight before applying the **single new migration**; never replay the historical June migrations. Existing ordered-migration tests are not permission to rerun them on production.
3. Deploy defensive rendering/security headers first; they safely handle historical malformed content. Apply the new transactional migration after checking actual policies and aggregate data bounds. The new constraints are `NOT VALID` for history, enforced on new/updated rows; no old data is silently rewritten.
4. Verify publication, draft save, immutable upload, catalog rendering, credit rollback, active/blocked accounts and the new preflight against the candidate. Verify hosted headers after release. The preflight must flag reintroduced mutable-storage policies and a disabled content trigger.
5. Prefer a forward repair. A frontend rollback can retain the restrictive database guards. Do not restore broad storage/payment grants merely to make a smoke test pass. If a legitimate older record cannot be edited, inspect and repair only that record with the owner's consent; pausing a record remains possible without editing its content.
6. Correct Auth Site URL to the production origin and allow the exact recovery URL while preserving reviewed entries. Do not add arbitrary redirect wildcards. Test request → received email → correct page → changed password → old sessions closed → login with new password, plus expired/reused link and unknown-email behavior.
7. Complete storage admission limits, operational backup destination/recovery evidence and commercial campaign parameters before open launch. Payments, invoices and AI credit debits are separate unfinished commercial work; internal visit notices are the currently implemented channel.

Supabase references: [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls) and [SMTP setup and default-service restrictions](https://supabase.com/docs/guides/auth/auth-smtp). These describe provider behavior; they do not establish this project's SMTP settings.

The historical 720 FAQ cases remain historical. No repeated monitor or server surveillance was created by this audit.
