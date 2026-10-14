# ECC independent cloud work — 14 October 2026

## Q02 — typed minimal model context
Status: prepared and locally verified; production unchanged.
Change: model context rejects array vehicles, omits nested scalar fields and invalid numeric/boolean values, and includes only recognized auto-check choices. Null declarations remain unknown; no private history/address/contact fields added. Existing byte limit, pre-reservation preparation, monthly cap and no-uncertain-retry behavior retained.
Proof: 13 focused provider/endpoint tests pass with network disabled and explicit mocks; new nested-context regression passes. ESLint and production build pass; diff whitespace check clean. New general candidate suite completed: 730/730 passed, zero failed/skipped/cancelled (127.95 seconds), with no live-services preload. This is new local evidence after the code change, separate from historical CI. Browser journeys were not rerun locally; remote CI result remains pending.
Blocker: no production acceptance until release/backup prerequisites are met. This filter reduces context leakage, not a guarantee against natural-language prompt injection or invented model answers.
Next: verify budget concurrency SQL and fallback/FAQ continuity, then measure bounded context for authorized concrete FAQ scenarios. No paid request, cache or debit enabled.

## D01 — unpatched development advisory
Status: mitigation documented; five high development entries remain, not fixed.
Change: no downgrade or unsupported override. Reviewed installed Next 16 bundled upgrade documentation before code change.
Proof: fresh npm audit reports five entries along eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces; npm registry latest braces 3.0.3/micromatch 4.0.8 match installed versions. Official GHSA-vfj7-8cjw-p6xm lists no patched version: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm. Fresh npm audit --omit=dev reports zero vulnerabilities.
Blocker: compatible upstream fix unavailable at this check. Audit entries must not be suppressed or reported as zero for development.
Next: retain isolation: CI uses read-only repository permissions, npm ci --ignore-scripts, no provider credentials for tests, and fixed repository-owned ESLint globs. Never feed uploaded/user-provided patterns to lint/glob tooling. Review config changes in untrusted PRs. Recheck upstream before next release; documentation is a mitigation, not patch proof.

## U01
Status: open, inspected only.
Change: none; current immutable content-addressed upload occurs before publication.
Proof: vehicle-api.js uploads each object with upsert:false and preserves request identity on uncertain publication retry.
Blocker: missing aggregate admission/reservation lifecycle in backend.
Next: design per-owner atomic count/byte/frequency reservation covering pending and stored files; exercise competing connections, retries and safe release in isolated database before wiring client. Do not approximate quota with browser-only checks.

## P01
Status: open, inspected only.
Change: none; current get_vehicle_catalog loads all rows and signs all returned media.
Proof: fetchVehicleCatalog and useVehicleCatalog currently expose complete arrays; existing 20-car/80-photo batching test is historical and not capacity evidence.
Blocker: server paging RPC, filters/cursor semantics and UI page navigation need coordinated implementation.
Next: bounded server retrieval and per-page media signing; test 500 synthetic listings, concurrent sessions and changing filters with stable order in isolation. No p95 claim yet.

## Q01
Status: open; no new seller facts available.
Change: no FAQ answers invented or imported from AutoSi commercial conditions.
Proof: historical FAQ evidence remains separate. New context test does not count as a resolved customer question.
Blocker: missing authorized concrete facts remain missing, including historical 197 questions.
Next: evaluate current approved catalog against synthetic declared facts; record resolved/missing/referred independently.

## Continuation and release boundary
Parent checkpoint: 1f8a5ab70479c1ae8f216b3eec4d743faf98a4fe. Keep changes on existing audit/launch-adversarial / PR8; no duplicate PR, integration or deployment. Hosted migration not applied, campaign/payments/external notices remain disabled. No monitor or recurrent task created. Work is active-session execution, not a scheduled persistent worker.
