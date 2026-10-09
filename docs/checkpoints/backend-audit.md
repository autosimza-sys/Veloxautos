# Backend checkpoint: security and atomic publication

Date: 2026-10-03. Scope: local checkout and synthetic, isolated PostgreSQL tests. No production account, credentials, Supabase connection, deployment, or remote write was used.

## Verified result

New forward migrations:

- `supabase/migrations/202610030001_pilot_security_fixes.sql`
- `supabase/migrations/202610030002_atomic_publication.sql`

`node --test tests/backend/security.test.mjs` passes **34/34** tests. Initial test-first baseline on the original nine migrations was **9/23 passing and 14/23 failing**. Tests subsequently expanded to include credits, profile roles, moderation, cleanup, and reapplication.

`node --test tests/backend/publication.test.mjs` passes **19/19** tests. The initial 13 tests all failed before the atomic RPC was implemented. The combined backend suite passes **53/53**; targeted ESLint and `git diff --check` also pass.

Tests run application SQL unchanged on `@electric-sql/pglite@0.5.8`, an embedded PostgreSQL WASM engine. `auth.uid()`, platform roles, `storage.objects`, buckets, and the Realtime publication are synthetic fixtures. No native PostgreSQL server, Docker, or Supabase CLI was installed in the environment. This verifies PostgreSQL permissions/RLS and function execution; it does not verify Supabase Auth, Storage HTTP/signing, Realtime delivery, PostgREST, production configuration, or real concurrent sessions.

## Repairs

- Public media reads and buyer chat/inspection creation no longer fail from nested vehicle RLS. Boolean, fixed-search-path helpers preserve private direct SELECT on vehicle and profile rows. Anonymous catalog price/km masking remains intact.
- Inspection creation starts unassigned. Only admin can assign an active mechanic. Browser updates cannot replace vehicle/requester/report identity. Revoked or inactive mechanics lose access, including owner phone context.
- Inspection uploads require the assigned mechanic, report, and own request-specific path. Media links cannot point at another seller's object.
- Manual chat messages cannot impersonate automated messages. Blocked accounts cannot send through the definer RPC or change moderation flags. Members cannot undo a block or clear a report; existing UI has no unblock workflow.
- Assistant availability responses use current publication status and require seller confirmation, rather than claiming a paused listing is available. The SQL never treats “sigue haciendo ruidos” as an availability request.
- Own unlinked vehicle uploads remain readable/deletable for cleanup. Anonymous visitors only read media linked to active listings.
- Repair is reappliable and preserves existing rows. Original migrations remain untouched.

## Confirmed existing protections

Signup metadata cannot grant admin/mechanic roles. Account owners cannot change role or blocked status. Anonymous users cannot execute inspection context or send-message RPCs. The existing create-vehicle RPC rolls back credit debit on SQL failure, rejects expired/exhausted credits, and prevents a second sequential debit after the last credit.

## Atomic publication contract

New RPC:

```text
publish_vehicle_with_credit(payload jsonb, media_payload jsonb, publication_request_id uuid)
returns public.vehicles
```

`media_payload` is an array of `{media_type, storage_path, sort_order}`. Accepts 4–8 photos, optionally one video, unique paths and positions 0–8. Paths must belong to the caller, and corresponding Storage objects must exist. Stored MIME/size metadata is checked against JPEG/PNG/WebP (3 MiB) or MP4/WebM/QuickTime (25 MiB). This checks recorded metadata, not file signatures or malware.

Brand/model/version/zone must be nonempty strings; year must be an integer from 1886 through next year; kilometers nonnegative and price positive, within signed int32. Optional checklist must be an object, trade/financing flags booleans. No allocation, pricing, or business eligibility rules changed.

The seller profile is locked for the duration of the transaction. Vehicle creation, credit debit, ledger, media links and private idempotency record commit together. A forced media-insert failure verifies full rollback after the debit. Same user/request UUID with identical JSON returns the same vehicle without a new debit; different JSON is rejected. If the original vehicle has since been deleted, the retry is rejected without republishing/charging. A different seller may use the same UUID without seeing another seller's result. Existing results remain retryable after credit expiry.

Client must retain its request UUID and exact payload/media across an ambiguous network retry. It must not delete objects after an uncertain RPC result, because the publication may already have committed. A new intended publication gets a new UUID. The frontend's request-specific paths and digest filenames are compatible with this RPC.

## Remaining work and rollout constraints

1. **Release gate: the legacy `create_vehicle_with_credit(jsonb)` remains executable by authenticated clients.** New frontend + new RPC solve atomicity on the new route; this is not complete enforcement while the old route remains open. After staging verification and frontend cutover, an authorized follow-up migration must run `REVOKE EXECUTE ON FUNCTION public.create_vehicle_with_credit(jsonb) FROM authenticated;`. A test proves the new definer RPC continues working after that revocation. Do not revoke before compatible clients are deployed, and do not claim backend enforcement is complete until the grant is verified. The current work does not deploy or run this change remotely.
2. CRM requests `lead_status`, missing from the versioned schema; admin also lacks SELECT on other users' conversations/messages. This repair does not expand private chat access or implement CRM.
3. Before applying to an authorized staging/production project, inspect actual migration history, grants, extra policies, bucket privacy, and existing assignments. The historical audit document recommends a broad `public_read` policy; an unexpected permissive policy could override intended restrictions. Do not assume the live schema matches this checkout.
4. Review historical inspection assignments/reports for unauthorized or suspicious assignments. This migration prevents future privilege escalation and removes nonmechanic access, but cannot prove historical integrity or infer whether an actual mechanic's previous assignment was authorized.
5. Keep `velox_private` out of PostgREST exposed schemas. No broad public vehicle/profile SELECT, new admin chat visibility, credit reset, or data deletion was introduced.
6. Signed media URLs already issued may remain valid until their existing expiry. SQL row access tests do not establish immediate URL revocation.
7. Staging integration tests must use buyer, seller, mechanic, admin, blocked, and anonymous sessions, including actual Storage uploads/signing and real multi-session concurrency.
8. Orphan cleanup remains a separate operational task. New uploads may remain after validation failures or abandoned publication intents. Any cleanup must first prove files are unlinked, outside an active/retry window and not tied to a committed request; no automated deletion has been implemented. Browser cleanup after ambiguous outcomes is unsafe.
9. Production `storage.objects.metadata` shape must be verified in staging; tests provide synthetic `mimetype` and `size` fields. No claim is made about existing production objects.

## Reproduction

Run normal regression suite:

```sh
node --test tests/backend/*.test.mjs
```

Run the same suite against only the original nine migrations to reproduce the baseline vulnerabilities (expected nonzero exit; repair reapplication test skipped):

```sh
VELOX_TEST_LEGACY=1 node --test tests/backend/security.test.mjs
```

Fixtures use only reserved `example.invalid` addresses and deterministic synthetic UUIDs. They neither load environment credentials nor connect to external databases.

## References

- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): policy expressions use caller privileges, with explicit definer helpers as an alternative.
- [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security): grants and policies must both be checked, including projects with legacy default grants.
- [PGlite](https://pglite.dev/docs/): local embedded PostgreSQL testing engine.
