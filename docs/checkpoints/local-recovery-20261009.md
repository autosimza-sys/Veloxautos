# Local recovery validation — 2026-10-09

Base: fec67af, recovered source archive from 292187a. This is not the unrecovered Cloud commit 4d83c6b. No remote deployment or database write was performed.

## Reproduced locally

- Node 24.15.0, npm 11.12.1, Windows.
- npm ci --ignore-scripts installed the pinned dependencies.
- npm run verify passed lint, all 471 tests (0 skipped) and production build.
- Initial browser suite: 1 passed, 3 failed because the publish-button locator matched both header and hero actions. This was an ambiguous test selector, not evidence of a broken registration action.
- Scoped the original journeys to the header; added a separate hero action journey. Configured desktop 1366×768 and mobile 390×844 with touch emulation. All 10 browser journeys passed using installed Chrome and one worker.
- Browser tests exercise missing-backend messaging, repeated modal dismissal/focus, browser Back/Forward, keyboard containment and both registration entry points. They do not prove authenticated Supabase workflows or actual mobile-device behavior.

## Dependency correction

Updated only source-map-js 1.2.1 → 1.2.2 in the lockfile to resolve GHSA-68fv-2mgg-jv7q. No Next.js downgrade or broad dependency update. Production build and all 10 browser journeys passed after the update. npm audit --omit=dev reports 0 vulnerabilities after the update.

Five high-severity development-tool dependency findings remain on the braces/micromatch/fast-glob/Next ESLint chain. Audit proposes a major downgrade of eslint-config-next; it was not applied. This remains tracked maintenance work, not a clean full dependency audit.

Advisories:
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

## Remaining MVP work

The user requires seller self-check, predefined answers plus AI conversation, AI visit coordination, and a global 90-day free launch with discretionary three-month extensions or later paid credits. Current code has a checklist and rule-based answers, but the optional AI module is not wired into the live chat, appointments use manual forms, and balances expire per user. Those are feature gaps, not covered by the 471 passing tests.

Latest Cloud deltas, including legacy appointment compatibility and signed-media/realtime refinements, must be recovered or reproduced. Real service permissions, recoverable production backups, authenticated end-to-end workflows and coordinated deployment remain unverified.

## Local commands

Use npm.cmd in PowerShell. Run npm.cmd run dev -- --hostname 127.0.0.1 --port 3100 for local development. Without public Supabase settings the app explicitly shows backend unavailable; it does not supply fictitious listings.

For browser tests, set CHROMIUM_PATH to the installed Chrome executable (on this host: C:/Program Files (x86)/Google/Chrome/Application/chrome.exe), then run npm.cmd run test:e2e -- --workers=1. Tests start and stop their own local dev server. No production credentials are required. Keep build and browser-server runs sequential.
