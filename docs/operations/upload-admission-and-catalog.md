# Upload admission and paged catalog — candidate operations

This is prepared source, not evidence of an applied hosted migration. No launch,
pricing, payment, outbound notice or recurring maintenance is activated.

## Upload lifecycle (U01)

Both `vehicle-media` and `inspection-media` clients use `lib/storage-upload.js`.
The existing content-addressed path, `upsert:false`, validation and publication /
report idempotency are retained. The browser must reserve before uploading.

`reserve_vehicle_upload(path, bytes, mime, bucket)` accepts an active seller for
vehicle files or an active mechanic for inspection files. Assignment and folder
permissions are still enforced independently by existing Storage RLS. A private
ledger binds owner + bucket + path to exact size/MIME. Identical pending retries
and confirmed stored retries reuse the admission; altered size/MIME is denied.

A transaction advisory lock keyed by owner serializes admission across both
buckets. Stored objects (including unlinked and legacy files) and unexpired
pending admissions share the quota. Missing/invalid legacy size is conservatively
charged at 25 MiB; all existing objects still count toward quantity. No historical
objects or original/pilot records are rewritten.

The Storage INSERT trigger checks size/MIME and expiry and consumes the admission
inside that same transaction; a failed insert rolls consumption back. Raw browser
INSERT without admission fails. Trusted no-user maintenance/restore is outside
this browser limit and must continue to use authorized service operations.
Never expose a service credential to clients.

`finish_vehicle_upload` confirms existence or releases only an absent pending
object. Release, INSERT and reserve take the same owner lock. Thus release-first
rejects a late INSERT, whereas INSERT-first makes release return `consumed`.
Repeated release is safe. A failed upload attempts reconciliation/release; if
reconciliation also fails, admission stays bounded until retry/expiry. Successfully
stored earlier files remain charged even if a later file or publication fails.
A released/expired path can be admitted again, consuming another frequency slot.

Defaults in the private `upload_limits` singleton are 100 objects, 250 MiB total,
60 fresh admissions per anchored one-hour window and one-hour pending TTL per
owner. Object limit remains 25 MiB and the supported MIME allowlist is unchanged.
Limits are operator-configurable only through trusted DB access, within CHECK
bounds. This is a resource safeguard, not a commercial tariff or seller credit.
There is no public settings write API. Lowering limits does not delete files.
The rate window resets on the first new admission after its hour ends; it is not
a sliding-window limiter, so traffic near a boundary can span two allowances.

Expiry frees **pending admission**, not actual stored bytes. No SQL deletes from
`storage.objects`, cleanup job or monitor exists. U02 must reconcile references,
retention and concurrent publications before manually removing physical objects
through Storage API. Storage-service write ordering, metadata and failed physical
upload cleanup still need a controlled managed-Supabase smoke test; local SQL
simulates its metadata and does not certify physical Storage behavior.

## Catalog lifecycle (P01)

`get_vehicle_catalog_page(24, cursor, filters)` returns at most 24 items, a cursor,
and bounded brand/year facets. Ordering is `(created_at DESC, id DESC)`; the
cursor preserves PostgreSQL timestamp precision. Media is aggregated only for
selected page rows; the client signs only that page. The legacy no-argument RPC
is capped at 24 too, so compatible readers cannot fetch an unlimited payload.

Server filters cover literal text, exact brand/year and price/km ranges. Anonymous
users cannot filter hidden price/km values. Those fields are null unless the
caller is active; exact meeting location is always null in the catalog. Active
listings of unblocked owners only are returned. Input keys, sizes, types and page
bounds are checked server-side. Facets contain at most 200 brands/years; free text
can find a brand outside that facet list. The UI marks counts as page counts.

Next/previous replaces a page instead of accumulating full stock. Filters reset
the cursor; session changes discard prior pages and filters; stale responses are
ignored. Newer inserted listings cannot shift already traversed cursor pages.
This is live browsing, not a frozen inventory snapshot: pauses/deletions/edits can
change subsequent results, and refreshing starts a new view.

## Isolated reproduction

- `npm ci --ignore-scripts`; `npm test`; `npm run lint`; `npm run build`.
- `npm run test:e2e:pilot` then `npm run test:e2e`, using one local server at a time.
- For real transaction concurrency, provision a **fresh local PostgreSQL** database
  named `velox_ecc_isolated` (or that prefix plus lowercase suffix). Set
  `VELOX_TEST_DATABASE_URL` securely to loopback only and run
  `node --import tsx --test tests/postgres/upload-concurrency.test.mjs`.
  It refuses remote hosts, other DB names and nonempty application schemas.
  It loads the full baseline/migrations only in that isolated database, never
  against Supabase. It does not drop data or start a persistent service.

The real-PostgreSQL test uses eight simultaneous admissions with four slots,
concurrent identical retries and both release/INSERT orderings. It then uses 500
synthetic listings, four photo metadata entries each, 20 connections and 420 page
requests. On local PostgreSQL 18.4 / Node 24.19.0 / Linux x64, measured database
page p95 was 127.64 ms; maximum response was 24,755 bytes. This excludes Storage
signing, HTTP network, actual images and browser paint; it is **not** the proposed
production end-user p95 under 3 seconds. Production uses PostgreSQL 17, so managed
compatibility and network timing remain separate verification.

## Release and recovery boundary

Use the existing PR8; do not merge/deploy before backup, preflight and access
requirements are verifiable. The prepared deltas now include, in order:

1. `202610130006_launch_input_integrity.sql` (original PR8 guards).
2. `20261015041659_upload_admission_quotas.sql`.
3. `20261015042119_paginated_catalog.sql`.

Do not replay June or already-applied October migrations in production. Capture a
fresh recoverable backup and review drift, bucket policies/MIME limits, object
size aggregates and new function/trigger fingerprints. Stage the matched client
and coordinate a maintenance window: old clients cannot upload after admission
becomes required, while the new client fails closed if its RPCs are absent.
Apply only reviewed missing deltas, then publish matched source and verify valid
upload/publication/report/retry, quota rejection with no debit, media visibility,
blocked/foreign access, pagination and rollback behavior using controlled data.
Prefer a forward fix; never restore mutable Storage/payment permissions to pass a
test. These instructions do not claim any of those hosted actions occurred.
