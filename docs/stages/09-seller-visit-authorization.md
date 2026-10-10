# Assistant phase 1: seller visit authorization

Source: Federico's 2026-10-09 clarification and instruction to start the first pending phase. ECC product-capability → TDD/security review.

## Capability and intent

A particular, reseller or agency defines dated availability, visit duration and a private meeting location for one owned vehicle, explicitly authorizes the assistant and can revoke that authorization. This is the foundation for the assistant to agree visits without asking the seller about every message. Existing approved FAQ answers remain the first response path.

## Constraints and contract

- Surface: per-vehicle panel under Mis publicaciones, beside seller FAQ tasks. No automatic conversion of old free-text availability into consent.
- Inputs: vehicle, start/end instants, IANA timezone used to display them, explicit duration, meeting location, explicit consent and request UUID. Initial windows have concrete dates rather than recurring weekly rules. Technical bounds: at most 24 hours per window, 1–1440 minute visits fitting the window, location 1–300 characters, and at most 20 upcoming active windows per vehicle. No default consent, place, time or duration.
- States: draft → authorized → expired or revoked. Revocation is irreversible; correcting a window requires revocation and a new explicit authorization. Revocation does not cancel an already agreed appointment.
- RPCs: get_visit_authorizations(vehicle); authorize_visit_window(vehicle,start,end,duration,location,timezone,consent,request); revoke_visit_authorization(id). The owner identity and authorization timestamp come from the database, not client fields.
- Authorization records are private, immutable except for the revocation timestamp, and retained for evidence. No anonymous/buyer/other-owner/admin-over-owner access. The server locks profile then vehicle before writes so blocking and status changes cannot race authorization.
- Creation requires an active owned listing and an active seller profile. Owner reads/revocation remain available when a listing is paused or withdrawn; blocked accounts cannot read or write. Expired authorizations remain history.
- Matching retries return the same record, including after revocation; changed payload with the same request ID is rejected. Overlapping active windows for the same vehicle are rejected to avoid conflicting instructions. This is an authorization, not a reservation: availability must still be checked against cross-vehicle/person reservations when phase 2 books.
- On ambiguous network failure, retain the input and request ID for an explicit retry; never report success or reset the draft before server confirmation. Existing private forms remount on account/token change; vehicle switching must also discard private drafts and stale responses.
- Additive, forward migration only. No production migration until the previously documented restore/cutover checks. No credit debit, paid model call or customer notification in this phase.

## Security and failure recovery

Private table with RLS and no client grants. Only narrow SECURITY DEFINER RPCs with empty search_path. Reads return at most 100 records, prioritizing active windows. Keep private location out of public catalogs, assistant-provider context and errors. Fail closed if migration is absent, owner access is revoked or server response cannot be confirmed.

## Non-goals and open questions

Booking in conversation, notification delivery and choice of WhatsApp/email are the following phase. Provider/model/budget and production backup connection remain unresolved and do not block this isolated implementation. Recurring schedules, calendar synchronization and multi-agent staff calendars are follow-ups. This phase alone does not fulfill the complete MVP promise.

## Handoff

Ready for direct implementation of owner configuration. Acceptance: owner can explicitly authorize and revoke; retries do not duplicate or revive permission; outsiders cannot read private location; no booking/message/credit side effect. Next phase must consume current authorization atomically with buyer acceptance, then produce a reliable notification.
