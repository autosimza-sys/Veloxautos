# U02 manual cleanup release procedure

No production deletion was executed. This utility is not scheduled, exposed by an
HTTP route, or imported by the product UI. Default behavior is preview only.

1. Establish encrypted backup/restore and hosted operator access first.
2. The canonical implementation is now the ordered migration
   `supabase/migrations/20261021024417_manual_storage_cleanup.sql`. Its identifier
   uses the creation time in UTC. The historical script path contains comments
   only; never apply a second copy. The standard isolated migration fixture now
   installs it and staging-preflight inventories its functions, grants, table and
   six guards. Packaging does not mean hosted application or acceptance occurred.
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
   excluded. Owners with a nonempty avatar URL are conservatively held in full
   because signed/encoded avatar paths cannot safely be inferred. Preview is capped at 100 and authorization expires after 15 minutes.
6. After a concrete manual review, passing approvedPlan explicitly revalidates
   each object ID/bucket/path/age under the same owner advisory lock as uploads
   and media links, then records a permanent quarantine before Storage API remove.
7. Publication, report media, owned draft/idempotency payload references and
   new avatar references serialize with cleanup on the same owner lock. A
   reference committed first prevents a claim. A claim committed first blocks
   publication/draft linkage and reuse of a consumed upload reservation.
   An opaque new avatar is conservatively deferred while any owner deletion is
   unresolved; clearing the avatar and unrelated profile edits still work.
   Completed deletions do not permanently prohibit new profile pictures.
   Quarantine prevents path recreation. A failed or uncertain API response stays
   needsReconcile; a timeout never silently releases the path.
8. Completion marks deleted only after metadata absence is observed. It does
   not itself delete anything. Tombstones remain so an in-flight delete cannot
   race a new file at the same path; retry must use a fresh publication path.
9. Preserve candidate/production/preflight states separately. The checked-in
   fingerprints include the canonical migration. Preflight rejects disabled or
   rewired guards and browser execution grants on cleanup RPCs. Managed Storage
   metadata/write ordering and actual API removal still require hosted smoke.
   Do not remove guards to pass a test.

Rollback: stop invoking the manual utility, leave its ledger and guards installed,
and investigate any uncertain request. Never remove tombstones or restore a file
at a quarantined path while an API delete may still finish. Restore a needed
backup to a new path and relink it through a separately reviewed repair after
confirming the delete outcome. Production schema repairs use a new forward
migration; dropping this migration's objects is not a safe rollback. No cleanup
schedule, public route or automatic execution is introduced.

The former candidate reproduced a claim-first bug: a seller could save a draft
or avatar after the claim and the subsequent deletion would break the new
reference. The canonical migration adds the missing guards. Focused synthetic
regressions cover that ordering, draft insert/update, idempotency references,
safe profile edits and consumed-reservation retries. PostgreSQL concurrency
coverage includes both orderings for publication, draft and avatar. Test results
must be recorded separately from managed Storage acceptance.

References: https://supabase.com/docs/guides/storage/management/delete-objects
and https://supabase.com/docs/guides/storage/schema/design .
All apply/delete operations remain disabled operationally until the prerequisites
and a reviewed plan are present. No cleanup was called against a live client.
