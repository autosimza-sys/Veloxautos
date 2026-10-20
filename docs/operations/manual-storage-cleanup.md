# U02 manual cleanup candidate

No production deletion was executed. This utility is not scheduled, exposed by an
HTTP route, or imported by the product UI. Default behavior is preview only.

1. Establish encrypted backup/restore and hosted operator access first.
2. Convert scripts/storage-cleanup-candidate.sql to a reviewed new migration with
   Supabase CLI when a usable executor returns; no dated migration was fabricated
   while the work environment was offline. The candidate is loaded explicitly by
   isolated tests only and is NOT part of normal migrations/preflight yet.
3. Review hosted Storage schema/trigger compatibility and all reference-bearing
   tables, including any future additions. Supabase recommends treating Storage
   metadata as read-only. Only Storage API removes physical files; SQL here reads
   metadata, creates private application state and guards writes. No SQL deletion
   of storage.objects exists outside test-only simulation.
4. Using an already-authorized server client for qcllovwetaokurkkzkry, call
   storageCleanup({client, projectRef}) to obtain a preview. Review privately; do
   not commit real paths, IDs, credentials or the actual preview to Git/logs.
5. Minimum retention is 7 days from the latest known creation/modification;
   young/unknown-age/non-finite timestamps and recently modified objects, current media links,
   draft/idempotency payload references and active upload reservations are
   excluded. Preview is capped at 100 and authorization expires after 15 minutes.
6. After a concrete manual review, passing approvedPlan explicitly revalidates
   each object ID/bucket/path/age under the same owner advisory lock as uploads
   and media links, then records a permanent quarantine before Storage API remove.
7. If publication commits first, cleanup refuses it. If cleanup claims first,
   publication/report media linking fails and its transaction/debit rolls back.
   Quarantine also prevents path recreation. The path is not silently released
   after timeout: a failed or uncertain API response remains needsReconcile.
8. Completion marks deleted only after metadata absence is observed. It does
   not itself delete anything. Tombstones remain so an in-flight delete cannot
   race a new file at the same path; retry must use a fresh publication path.
9. Preserve candidate/production/preflight states separately. Before a hosted
   release, add reviewed fingerprints for the candidate functions/triggers and
   verify managed Storage behavior. Do not remove those guards to pass a test.

References: https://supabase.com/docs/guides/storage/management/delete-objects
and https://supabase.com/docs/guides/storage/schema/design .
All apply/delete operations remain disabled operationally until the prerequisites
and a reviewed plan are present. No cleanup was called against a live client.
