# Owner listing management checkpoint

Date: 2026-10-03. Local implementation only; no deployed migration or live-service validation is claimed.

## Implemented

- `OwnerListings({ session, profile, onChanged })` displays only the signed-in, active seller's inventory, including paused and withdrawn rows. It explicitly scopes SELECT to `owner_id`; RLS independently enforces the boundary.
- Text/basic numeric editing: brand, model, version, year, kilometers, price, zone, partial plate, description, trade/financing declarations, visit location and hours. Publication field validators are reused for required text and integer bounds. The existing self-review/checklist and media are preserved.
- Pause, reactivate, and explicitly confirm a recoverable withdrawal. Existing database status `deleted` is labeled “Retirada”; there is no new “sold” state. No record, image or storage object is deleted by these operations.
- Successful mutation calls `onChanged(updatedVehicle)` so the parent can refresh the catalog. A catalog refresh failure cannot turn a confirmed save into a reported failure. Manual inventory refresh is available, including after a new publication or uncertain network result.
- Loading, empty, failure and retry states are distinct. Inputs survive failed saves; cancel discards drafts. Repeated mutations are single-flight. Logout, blocked access and account changes immediately hide inventory; a new account cannot receive old draft state, cached rows, or late callbacks.
- The UI clearly says photo/video editing is unavailable. There is no fake media-edit action.

## Database API and permissions

Apply `202610030005_owner_listing_management.sql` after `002` and the existing pilot migrations. It is forward-only and reapplicable.

- `update_vehicle_listing(target_vehicle uuid, payload jsonb) RETURNS public.vehicles`: active seller owner only. Strict allowed-key check; no caller-controlled ID, owner, timestamps, status, score, checklist or media. Validation occurs before the whitelisted UPDATE. Numeric range matches atomic publication: integer year 1886–current year + 1; kilometers 0–2147483647; price 1–2147483647.
- `set_vehicle_listing_status(target_vehicle uuid, next_status text) RETURNS public.vehicles`: active owner seller or active admin, only `active`, `paused`, `deleted`. Supabase returns one row object. Updates only status and server timestamp. Draft transitions are rejected, including withdrawal/pause detours, so this RPC cannot bypass the publication-and-credit flow.
- Profile/role authorization is locked before the vehicle row. Blocked sellers, blocked admins, unrelated sellers, buyers, mechanics and anonymous callers cannot mutate owner inventory.
- Browser roles lose direct vehicle INSERT, UPDATE and DELETE. Admin UI must use the same narrow status RPC; the shared admin implementation was coordinated for this cutover. Raw table SELECT remains active seller owner/admin only; anonymous public access still uses the sanitized catalog RPC.
- Editing and status changes neither debit credits nor create a new vehicle. Existing media, conversations and related records remain attached.

The legacy `create_vehicle_with_credit` RPC cutover described by migration 002 remains a separate deployment gate. This change introduces no alternate publication endpoint.

## Verification

Tests were written before implementation. Initial backend tests reproduced missing RPCs and unrestricted owner writes; initial UI tests failed because the feature modules did not yet exist.

Focused suites:

- `tests/owner-listings.test.mjs`: 18 DOM/hook/API tests using jsdom and mock clients. Covers field validation, correct owner filtering, retry, cancel/reopen, pause/withdraw/reactivate, draft restrictions, duplicate clicks, stale session results, account-switch draft isolation, foreign response rejection and confirmed-save semantics.
- `tests/backend/owner-listings.test.mjs`: 16 PGlite tests applying the real SQL migrations to synthetic Supabase platform primitives. Covers ownership, all privileged fields, text/integer validation, direct-write denial, recoverability, no credit/media mutation, blocked roles, admin status-only controls, catalog state and safe reapplication.
- Focused ESLint passed.
- Shared aggregate `npm test` passed 293/293 at 03:20 UTC before the last five owner regressions were added. Final aggregate verification belongs to the integrated checkpoint; shared work continued after that run.

No services, accounts, credentials, purchases, pushes or deployment were used. Browser verification was not retried because the parent reported that route blocked. Pixel/layout verification is not claimed; interaction behavior was checked through jsdom. Production still requires staging migration rehearsal and the parent deployment gates.
