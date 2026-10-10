# Assistant phase 3 — visible acceptance and production activation

Federico authorized phase 3 on 2026-10-10 after asking to see the whole product. The outcome is a published, reviewable seller → buyer → visit → seller notice journey; a frontend deployment alone is not production acceptance.

## Fixed constraints

- Approved answers and vehicle facts first; generative AI only for exceptions, disabled until provider and spending limits are supplied. No invented facts or consent.
- Notices only inside Velox. No email, WhatsApp, real customer messages or automatic billing.
- Launch promotion begins on one common date for 90 days. Date and allocations remain undecided.
- Target only autosimza-sys/Veloxautos, Supabase qcllovwetaokurkkzkry and the existing Vercel project.

## Review surface

`/demo` is an explicitly labelled browser-only demonstration, accessible without registration. It shares the real publication, seller availability, rule-answer, buyer booking and notice components, with an injected in-memory fixture adapter. It never imports or initializes the live Supabase client, makes API/model calls, or exposes a server endpoint accepting a simulated identity. Production authentication is unchanged.

The visitor can use a clearly fictional listing and seller-authorized example window, or try the real publication form. They can ask basic questions, explicitly accept a slot, switch to the seller notice and acknowledge it. Revoking an example window removes its remaining slots. Starting again or reloading clears the demonstration. No account, credits, external delivery, uploaded media or persisted appointment is claimed. This is design/interaction evidence, not a substitute for SQL/Auth/Storage acceptance.

The UI must explain what is simulated and that generative AI is off. Mobile layout and keyboard actions must work. Unknown data must remain unknown. The test suite must prevent the demo dependency graph from importing the live client.

## Production release prerequisites

1. Complete PostgreSQL/Auth backup using an existing secure connection, plus Storage copy; verify restoration in an isolated target.
2. Review current database preflight and reconcile legacy data without deleting records or manufacturing consent.
3. Apply the tested October migrations in order, validate authenticated users and signed media, then deploy the exact candidate and execute the separately verified client permission cutover.
4. Verify real buyer/seller access separation, booking, in-app notice, cancellation and retries. Enable AI only after its separate configuration and evaluation.

On 2026-10-10 the dashboard confirms Free Plan has no scheduled backup. Current usage is within quotas despite the expired-grace-period banner (database 27.04 MB, egress 0.51/5 GB). No plan purchase is justified by that banner. No PostgreSQL connection or pg_dump runtime is configured locally. Its secure location has been requested; production writes remain pending. This is a technical dependency, not a request to reauthorize publication.
