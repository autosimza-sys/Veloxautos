# Phase 3 acceptance checkpoint — 2026-10-10

Contract: `docs/stages/11-published-acceptance.md`. Phase remains in progress until authenticated production acceptance and backup restoration are completed.

## Implemented

- `/demo` provides a labelled browser-only journey using the real publication form, rule-answer UI, seller permissions, booking and notices. It contains no live credentials/client import or server identity bypass.
- Users can choose a sample or fill the complete form, then book explicitly, inspect the seller notice and mark it read. Reset/reload clears the session. Upload previews stay in the browser.
- Live client defaults moved to the existing application containers; reusable agenda views receive explicit clients. Production authentication and SQL are unchanged.
- Home navigation links to the demo. Generative AI is explicitly off; unknown facts remain unknown. The demo is excluded from search indexing.

## ECC / TDD evidence

| Guarantee | Evidence |
|---|---|
| Missing demo implementation reproduced | `374e5d5`: model contract test failed on the intentionally missing module |
| Consent, same-request retry, private notices, revoked windows, fixture isolation, publication validation, no live client imports | `9d75925`: 9/9 model/bundle checks passed |
| Actual shared components render a complete sample booking and notice; unknown facts; reset; revocation; all seller profiles | `tests/demo-ui.test.mjs`: 3/3 passed; combined 12/12 |
| Demo model/UI coverage | Node test coverage: 100% lines, 93.94% branches, 93.44% functions (demo files only) |
| Public desktop/mobile journeys and complete form | `tests/e2e/demo.spec.mjs`; final result belongs to the exact-head CI, not the local attempts below |

Commands used: `node --import ./tests/no-live-services.mjs --import tsx --test --experimental-test-coverage --test-coverage-include='**/features/demo/**' tests/demo-session.test.mjs tests/demo-ui.test.mjs`.

Local first browser attempt lacked Playwright's bundled Chromium (18 setup failures, two API tests passed). A second attempt used installed Edge but was stopped when the host exhausted available memory. Local full verification also ran out of memory during lint. An earlier lint run found a native homepage anchor; it was corrected to Next Link with prefetch disabled. These attempts are not browser/build PASS evidence. GitHub Actions runs the full lint/test/build/audit/browser suite for the published candidate; record its exact head and outcome in the phase report.

## Production facts

Supabase qcllovwetaokurkkzkry still lacks the phase-1/2 authorization/booking/notice tables. Free Plan has no scheduled backup. The expired grace banner does not mean current quotas are exceeded: dashboard showed database 27.04 MB, uncached egress 0.51/5 GB, no current overage. No paid plan or paid model was activated. A secure PostgreSQL connection location and AI budget/provider have been requested. No database migration, merge or permission cutover was performed in this checkpoint.

The demonstration adapter models a UI journey only. It does not establish server concurrency, Supabase Auth/Storage integration, remote persistence or production readiness. Existing SQL integration tests remain the backend evidence; actual authenticated release acceptance remains outstanding.
