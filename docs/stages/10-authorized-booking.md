# Assistant phase 2: buyer booking and in-app notices

Federico authorized phase 2 and chose **only notices inside Velox** on 2026-10-09. No email, WhatsApp or paid model call.

Buyer opens authorized availability in an existing private conversation, reviews a dated slot (seller timezone, duration, meeting place), explicitly agrees and confirms. The seller's phase-1 permission supplies seller consent. Meeting place is disclosed only to this authenticated buyer in the private booking review, never in the public catalog or AI context. If no slot is available, the existing manual proposal remains available.

Server checks current active buyer/seller, conversation, vehicle ownership/status, unrevoked permission, future time, duration and slot alignment. Both participants are reserved atomically through the existing cross-role interval exclusion constraint. Matching retries return the original current appointment, even after revocation/cancellation; changed payloads cannot reuse an idempotency key. A second request for an already booked conversation/slot must not create another appointment.

Private request records bind each appointment to immutable seller authorization. No client-set flag can bypass consent. Historical appointments remain untouched. Cancellation releases reservations and generates its own notice; revoking future authorization does not cancel an agreed appointment.

The same transaction creates persistent private notices for both parties. Each includes current appointment state, car, buyer, date, duration and place. A notice is unread until explicitly marked read. New/updated notices refresh while the user is inside Velox; no external delivery or push is implied. Retry must not duplicate notices. Account change discards private UI state.

Acceptance proof: backend integration tests for permissions, consent, stale offers, conflicts, idempotency, notice privacy and cancellation; UI tests for explicit review/consent, ambiguous retry, missing migration, stale response and readable notices. Existing full suite plus build, public journeys, isolated migration rehearsal. Deployment remains a candidate until the previously documented production restore/cutover prerequisites are met.
