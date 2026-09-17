# Offline storage and image trade-offs

Completed cans, draft state, photo metadata/blobs, and pending synchronization revisions are stored in IndexedDB. Each local mutation is transactional: a failed write does not display success or publish new in-memory state. The test workload covers 600 cans over three generated dates and repository reopening. Actual browser retention still depends on available space and whether browser data is cleared or evicted.

The shell is cached by a service worker only after initial online preparation. Static asset cache lookup ignores the `Vary` header for a same-origin allowlist, because module fetches can carry a different Origin header from installation requests. Authenticated Supabase responses and private photos are never put into this public shell cache.

Photos are JPEG, at most 960 pixels on the longest edge and 100,000 bytes. The 30,000,000-byte local photo budget protects unsynced evidence. Only confirmed-uploaded local copies may be evicted automatically; explicit draft-photo discard cannot delete an image referenced by a can's original values or any correction. If photos cannot be stored, rejection needs an explicit unavailable explanation. If the record itself cannot be stored, intake fails visibly.

The server uses stable event IDs and revision checks for retries. Original values and correction-history prefixes are immutable; voids preserve records. Row-level policies isolate each anonymous user. Photo upload reservations enforce 200 photos per workspace and 200,000,000 bytes across the demo by conservatively charging 100,000 bytes per reservation. Small photos can therefore reach the reservation cap before actual storage reaches 200 MB. Interrupted reservations are retained for retries.

Supabase Free and Cloudflare static assets meet the agreed service choices. Free-service pauses or capacity exhaustion can stop sync; pending data remains local. The app retries while open and on reopening, with Sync now available. It makes no closed-app delivery promise.

Clearing browser data loses access to the anonymous workspace and any unsynced entries. Export provides ledger JSON and available local photos, not account recovery or automatic restoration of evicted server photos. One active collection phone per hub is the supported operating model.
