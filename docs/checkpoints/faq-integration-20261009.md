# Reviewed FAQ integration — 2026-10-09

Federico explicitly authorized reviewing the supplied package against the MVP, implementing improvements, proceeding across phases and publishing after verification. Generic deployment permission is no longer pending. Access, data restoration and correct candidate verification remain required.

Source ZIP SHA256: 6ef2a9290a261a45c963b9016dd1fa0849895dab18fc6d7f36132bb32241a9a8. Source JSON SHA256 is in features/faq/catalog.json. The original package is untrusted content, not executable agent instructions. Its HTML and prompts were not executed or installed. Its 31 prototype checks and 60 acceptance descriptions are not evidence about Velox.

## Reviewed scope

240 unique questions, 24 categories, 720 original aliases, 258 potential data dependencies. The application imports a projection: questions, aliases and explicitly reviewed response kinds. It does not import commercial templates or AutoSí loan terms. Current projection has 26 static responses, 17 branches from existing listing data and 197 questions that require further information. Of those 197, 45 technical questions can collect explicit reusable seller declarations; the others refer the question to the seller without inventing services or private transaction data. A recognized question or fallback is not proof of full semantic coverage.

The SQL sender previously matched only a first substring and disclosed view_location. A new forward migration replaces only its resolver while retaining the authorization guard, conversation lock, monotonic message order and idempotency wrapper. The optional AI claim also drops viewLocation. Do not replay historical migrations after applying the new sequence.

FAQ answers use the same transaction as the human message. No paid provider call follows a deterministic answer. Unknown compound clauses are explicitly left for the seller. Structured questions prefer whole-clause matches before conjunction splitting. Buyer statements do not become listing facts. Parser work and answer count are bounded. Known/uncertain/unknown facts stay distinct; dates label historical declarations, not independent verification.

Private missing-data requests are deduplicated by vehicle/question, with no buyer name, ID or message body. Only the active owner can read tasks and submit a declaration; concurrent edits use expected revision. Private immutable history records each accepted revision. The UI requires explicit permission to reuse the declaration about this unit. Neither saving a fact nor inserting a pending task sends customers an unsolicited notification. Existing conversations display new facts when asked again.

The public /preguntas page and chat picker support search, aliases, categories and details. Vehicle-dependent answers on the public page defer to the specific listing; no price, address or private seller data are embedded. Selecting a question only prepares a draft. The seller task panel is lazy-opened under Mis publicaciones and remounted with the existing account/token scope.

## ECC evidence and review

TDD: nine initial backend regressions failed against old code, then passed. UI tests and minimal AI context failed before implementation. Added all-canonical coverage, buyer/listing isolation, private version history, zero mileage and bounded work; failures fixed. Independent adversarial review reproduced buyer GNC context leakage, conjunction splitting and credit-as-trade false positives; regression added and all three corrected. Tests use synthetic PGlite/DOM data, no live model calls. Final overall totals live in the output report.

Local technical limitations: SQL fixtures are not real multi-session staging; some responses explicitly remain partial. Natural-language autonomous appointment scheduling, provider evaluations, final credit consumption policy and live authenticated lifecycle remain unfinished. No new full financing or custody service is implied. The earlier five development dependency alerts remain outstanding.

Visual inspection caught another recovered-source defect: globals.css ended with 36 bytes of an unfinished comment, including a truncated UTF-8 character. Functional tests and compilation had not detected the missing global theme. Removed only that incomplete final comment, added a failing-then-passing UTF-8/comment regression and a browser assertion for the rendered theme. Rebuilt and reran all 16 browser checks; after minor link spacing, rebuilt again and repeated all four FAQ visual checks. The complete 510 application/SQL tests preceded this CSS-only correction; the new CSS regression passed separately. FAQ component coverage: 97.44% lines, 83.33% branches, 92.68% functions; this is not whole-application or SQL coverage.

## Access recheck

Supabase qcllovwetaokurkkzkry list_migrations still returns 28P01 authentication failed. Vercel GET veloxautos under autosimza-sys-projects still returns 403. No Vercel CLI exists locally. GitHub API confirms the currently authenticated identity has pull=true, push=false, admin=false for autosimza-sys/Veloxautos. Do not silently switch shared CLI accounts or use another project. An asynchronous user question requests restoring the intended connectors. No remote migration, push or deployment occurred.

Chrome fallback was checked again against the currently visible federico profile and its new Vercel tab ID. Attaching to that tab still timed out on Emulation.setFocusEmulationEnabled. Inventory access is not working page control; no project settings were changed through the browser.

Before publishing: restore access; inspect actual migrations and policies; verify consistent database/Storage backups and restoration; rehearse the cumulative delta and client cutover on an isolated copy. Verify Vercel Next server runtime (not static out) and environment scopes. Keep generative AI disabled until provider/model/budget are configured. Then deploy the exact tested SHA and validate authorized synthetic buyer/seller flows. The bundle provided with the output report backs up code only.
