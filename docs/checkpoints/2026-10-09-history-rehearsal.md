# Historical visits and migration rehearsal

The actual legacy application contains a July appointment marked confirmed, without recorded bilateral consent or duration. Migration 202610030004 previously stopped rather than invent that evidence.

Pre-pilot visits scheduled before the fixed cutoff 2026-10-03T00:00Z now retain their original fields and status with `legacy_unverified=true`. Database guards prevent modifying them or creating new flagged rows. They do not reserve a time interval. The agenda labels the original state as unverified and offers no actions. Recent/future visits still block migration when evidence is missing.

ECC RED checkpoint: `3ad6841` reproduces the migration block. The focused GREEN run passed 128 appointment tests, including immutable history, participant-only reads, denied fabricated history, and existing consent/interval regression cases. Function fingerprints were recalculated only for the two reviewed guards; preflight reports historical exceptions separately for review.

An isolated PGlite rehearsal restored 20 public application tables and all 50 rows exactly from the actual source snapshot, then applied all 14 October migrations successfully. The historical row retained all original fields, gained no invented consent or duration, and produced no reservations. Platform Auth/Storage were simulated; this is not a complete Supabase restore or authenticated acceptance test.

All 24 Storage objects (33,943,160 bytes) were separately downloaded and checksum-verified. Customer data and media remain outside Git in a locally restricted backup directory. No production migrations were applied. Do not replay the June baseline, which includes obsolete role setup, against existing production data. A full PostgreSQL/Auth restore and managed Storage validation remain prerequisites for cutover.
