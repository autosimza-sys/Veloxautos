# Phase 3 implementation and phase 4 access checkpoint

Scope: Velox only. Federico authorized fixing errors and advancing subsequent phases. Global launch lasts 90 days for everyone; later charging versus repeat three-month extensions is his decision. Never automatically enable billing. Do not infer credit quotas, launch date, provider/model, or an AI spend budget.

## Implemented locally

- Global launch configuration, active-admin-only RPC, revision conflict protection, audit events, shared expiry for existing and later sellers, extension preserving used credits. Admin panel and seller promotion display. Migration remains inactive until explicitly configured.
- Server-only authenticated AI endpoint, authoritative vehicle context, private job ledger, daily attempt caps, one provider claim per human message, repeat-safe completion and permission rechecks. Anthropic adapter follows the earlier prototype but is not a final provider choice. The route stays disabled without every required configuration value. No paid calls performed.
- Buyer chat invokes the endpoint after successful human-message persistence. Deterministic FAQ replies avoid duplicate generation. Provider failure leaves the seller able to respond.
- Guided visit assistant collects date/time, explicit duration and location, previews the proposal, and invokes existing consent/overlap-safe agenda workflow. It does not implement free-form AI appointment extraction or autonomous booking.
- Read-only preflight manifest updated for new reviewed functions, policies, tables, triggers and migration versions. The initial full regression detected the missing manifest entry; corrected without bypassing checks.

## Deployment requirements and unresolved work

Next now requires server runtime for POST /api/assistant; static export was removed. Verify Vercel framework settings and remove any remote output-directory override pointing to out before preview deployment. No vercel.json exists locally. Never expose SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY as NEXT_PUBLIC variables. Daily request limits constrain calls, not exact currency spend; configure a provider spending limit before activation.

Two new SQL migrations must be reconciled with real migration history and rehearsed on a restored isolated copy before applying. Never replay old June setup or invent consent for legacy appointments. Production PostgreSQL plus Storage restore remains unverified.

AI tests use doubles. Need approved FAQ bank and grounded-answer evaluations with the chosen provider. A process crash after job claim can leave processing indefinitely; do not automatically retry paid generation. Inspect and resolve via a reviewed operational procedure. AI coordination through natural conversation, authenticated remote flows, Cloud deltas after the recovered archive and the five development dependency advisories remain pending.

## Access evidence

Supabase get_project identified qcllovwetaokurkkzkry / velox1.0 ACTIVE_HEALTHY. list_migrations failed with PostgreSQL 28P01 for postgres; list_tables failed authentication for supabase_read_only_user. No SQL changes made. Restore the connector/database authentication for this project before retrying inspection.

Vercel get_project veloxautos, team autosimza-sys-projects returned 403. No native Vercel CLI was found. Chrome inventory exposes that team tab, but tab attachment fails Emulation.setFocusEmulationEnabled. Restore access to that exact Vercel team; do not substitute a different project or account. Do not print or request secrets in chat.

Final verification totals and candidate SHA are recorded in outputs/VELOX-FASE-3-RESULTADO.md in the parent task workspace, with a Git bundle. No push, live migration, deployment, customer messaging, or live AI generation performed.
