# Assistant phase 1 — evidence

Source: Federico's instruction to begin the pending assistant phase, following clarification that the product must answer routine questions, coordinate a visit and notify its seller. Contract: ../stages/09-seller-visit-authorization.md (ECC product-capability). This phase supplies explicit seller permission; it does not yet reserve or notify automatically.

## ECC RED / GREEN

- RED `80368fd`: PostgreSQL tests failed because the three authorization RPCs did not exist; the UI test failed importing the missing feature. Recorded run: 17 failed, 0 passed. This was absent functionality, not live-service access failure.
- GREEN `d40e15f`: implemented private authority records, narrow RPCs, immutable original evidence, idempotent creation/revocation and the per-vehicle seller panel. Fixed one test fixture that attempted multiple SQL statements in a prepared query.
- Focused suite: 44 passing tests across authorization SQL, component and existing owner-listing regression tests. Additional UI error/lifecycle cases passed in the 10-test coverage run.
- Component/model coverage: 100% lines, 95.65% branches, 100% functions (Node test coverage restricted to the two new frontend files). Not a claim about whole-app/SQL coverage.

## Guarantees tested

| Behavior | Evidence |
|---|---|
| Only active owner seller manages permission; no anonymous, buyer, other owner, mechanic or admin over-owner access | tests/backend/visit-authorizations.test.mjs |
| Consent cannot be omitted; invalid windows/locations/durations/timezones rejected | SQL + tests/visit-authorization-ui.test.mjs |
| Retry returns the original record, rejects changed intent and cannot revive revoked authority | SQL and UI retry tests |
| Overlap and active-window cap enforced under vehicle lock | SQL tests, concurrency by lock design; no real multi-session staging claimed |
| Original evidence cannot be rewritten; accidental table SELECT grant still yields no rows under RLS | SQL tests |
| No visit/message/credit side effect | SQL aggregate comparison |
| Private drafts reset on vehicle/account scope; stale results ignored; repeated submit blocked | UI and existing owner-listing tests |
| Read errors fail closed; save/revoke errors are never reported as success | UI tests |

Local Chrome verification used a separate synthetic fixture rendering the real component. It confirmed required consent, save and revocation with visible state. This was a local in-memory client, not remote authenticated Supabase acceptance. Actual SQL behavior was tested separately in PGlite.

The isolated copy of actual application data restored 20 tables/50 rows exactly and applied all 15 October migrations, including 202610090005, without changing the original historical appointment fields. Auth and Storage were simulated for that rehearsal. No production database mutation or customer notification was performed.

Full verification, remote CI and exact deploy SHA are tracked in the PR and output phase report. The forward migration must be deployed with the matched frontend after complete restore/cutover checks. The existing 240-question rules layer remains in place; no paid AI calls are needed for configuration.

## Next phase

Consume current seller authority atomically when a buyer accepts a offered slot, check listing/account status and cross-vehicle reservations, keep evidence and retries, then deliver the seller notification through the chosen channel. The UI explicitly discloses that automatic coordination/notification is not active yet.
