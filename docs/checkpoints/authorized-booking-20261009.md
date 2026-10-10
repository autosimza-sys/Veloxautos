# Assistant phase 2 — booking and in-app notices

Scope: [capability contract](../stages/10-authorized-booking.md). Federico selected notices **only inside Velox**. Candidate code; no production database changes, email, WhatsApp, paid AI call or customer message.

## Behavior and evidence

- Buyer reviews a seller-authorized dated slot, its timezone, duration and private meeting place, then explicitly accepts. The SQL transaction checks current permission and creates a confirmed visit, reserves both participants and creates their private notices. Seller consent links to phase-1 evidence and keeps its original timestamp; it is never presented as a new manual confirmation.
- Cross-role GiST interval exclusion remains the final conflict arbiter. Overlapping reservations, revocation, blocked accounts/conversation, inactive listing and unauthorized callers fail closed. Adjacent visits remain possible; no travel buffer is invented.
- Idempotent retries return the current original appointment, including after revocation, pause or cancellation. They do not create another visit or notice. Private request records retain deletion tombstones. Public browser grants cannot fabricate the private authority record or confirmation source.
- Confirmed/cancelled notices are persistent and recipient-only. Marking read requires an authoritative receipt. Focus, visible-tab polling and booking events refresh the list; notification history shows current cancellation status. No external delivery is implied. The UI shows the newest 100 notices and 60 available slots.
- Visit FAQ answers now point to **Ver horarios autorizados**. Their text alone never books. The manual proposal remains available when there is no authorized slot.

## ECC/TDD

| Stage | Evidence |
|---|---|
| RED `68fcac1` | Backend invoked missing booking/notice RPCs (13 failures); UI import invoked the missing booking component. A preliminary JSX-in-MJS syntax error was corrected and is not counted as RED. |
| GREEN `33a5d7c` | Same focused targets: 21/21 passing. Two fixture mistakes (ledger column and composite result decoding) and an observable async wait were corrected without weakening guarantees. |
| Additional RED `f311261` | Visit FAQ test actually failed against obsolete manual-only instructions. Additional passing tests cover cross-role busy buyer, stale UI responses, private notice errors and account changes. |
| FAQ GREEN | Booking, notice UI and FAQ integration targets: 43/43 passing. |
| UI coverage | 13 UI tests; 100% lines/functions, 90.60% branches across AuthorizedVisitBooking and VisitNotices. This is not whole-app or SQL coverage. |

Commands actually run: native Node runner through `tsx` with `tests/no-live-services.mjs`; focused backend/UI targets; native `--experimental-test-coverage`; `npm run verify`; isolated snapshot migration rehearsal. Final CI identity and total results are recorded in the delivery report.

Chrome verification used real React components and the application SQL in isolated PGlite with synthetic users. The buyer selected/accepted a slot; seller notice survived reload and could be marked read. No external identity provider was involved. PGlite integration tests exercise the real exclusion constraint but do not simulate distributed multi-connection production load.

Snapshot rehearsal: 20 application tables / 50 rows restored exactly; 16 forward migrations applied; original historical visit fields retained, no invented consent and no historical reservation. Platform Auth/Storage are simulated, so this is not a full managed Supabase restore.

## Release limits

Production cutover still requires the full PostgreSQL/Auth backup and restore checks documented previously, applying migrations and verifying authenticated flows on the deployed backend. Preview frontend alone cannot activate missing RPCs. Automated rules and booking work without a model; exceptional-question AI activation, provider choice/budget and launch settings are separate remaining MVP work.
