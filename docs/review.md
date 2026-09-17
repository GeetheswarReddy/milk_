# Peer review and verification

Reviewed against `CONTEXT.md`, `docs/design.md`, and ADRs 0001–0004. Implementation work was split between the intake UI, local repository/domain, and server migration. The coordinating agent independently reviewed the SQL; the SQL implementer reviewed the client integration. This is not a claim of independent approval for one's own implementation.

## Backend verification completed

On 2026-09-17, `PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH" bash supabase/tests/run-local.sh` passed against a fresh disposable PostgreSQL 15 cluster:

- Migration syntax and function execution.
- Stable event replay creates one audit event; identity reuse with changed content is rejected by the RPC.
- Original can values and correction-history prefixes cannot be overwritten through the RPC.
- Authenticated clients cannot directly mutate entity tables. Another workspace cannot read the first workspace's entities or private photo rows, or insert an unauthorized photo path.
- A photo reservation requires a reference from the owning workspace's can, and replay returns its original path.
- Two concurrent can inserts at 1,999 stored cans allow exactly one insert.
- Two concurrent photo reservations from different workspaces at 199.9 MB reserved capacity allow exactly one reservation.
- A workspace with 200 photo reservations cannot reserve another.

`supabase/tests/bootstrap.sql` supplies minimal `auth` and `storage` stand-ins. These tests validate PostgreSQL functions and policies; they **do not validate a running Supabase Auth/Storage API, actual bucket upload enforcement, signed URLs, JWT handling, or deployed network behavior**. The fixtures exist only inside the disposable test database and never seed the app.

Reservations conservatively charge 100,000 bytes per photo regardless of its actual compressed size. Reservations are retained after interrupted uploads and have no automatic release path, so retries cannot exceed the cap or overwrite evidence. Capacity can therefore be exhausted before 200 MB of actual uploaded bytes. This is deliberate and must remain clear in deployment/support expectations.

## Integration review findings

Already corrected during review:

- SQL photo authorization treated a nullable original-photo comparison as permission; the predicate now uses `IS NOT TRUE` to reject missing references.
- Client photo maximum and bucket size initially differed; both now use 100,000 bytes, with a 30,000,000-byte local budget.
- Required can/delivery creation times and correction IDs/timestamps are checked server-side.
- Correction drafts now preserve the corrected can ID across reopening.
- Per-can labels distinguish pending record synchronization from saved-on-phone state.

Additional fixes inspected in the final client code (browser interaction verification remains with the coordinating agent):

- Summary-date browsing now uses a separate date and does not change the active collection session.
- Explicitly discarded/retaken draft photos are removed atomically with the draft update. All can original/correction photo references, including voided entries, are protected from deletion.
- Correcting a can clears its matching draft in the same durable transaction; the UI reads the committed draft state instead of issuing a second clear.
- Locally evicted, confirmed-uploaded photos now use private signed URLs for preview and an evidence-viewing action. The subsequent live smoke test verified signed-URL retrieval.

The synchronization implementation preserves stable event IDs, checks acknowledgements against the queued revision, skips photos until their can revision is synchronized, and verifies an existing remote photo's bytes after an interrupted upload. Workspace identity is pinned; missing established credentials stop synchronization instead of silently creating another anonymous workspace.

## Final integration gate

The independent reviewer inspected `public/sw.js`, `src/sync.ts`, `scripts/verify-supabase.mjs`, `scripts/verify-deployment.mjs`, and `tests/browser/intake.spec.ts` after the coordinating agent reported successful live and browser checks on 2026-09-17. No remaining blocker was found in those changes.

- The offline module-cache fix applies `ignoreVary` only to the named application cache for same-origin GET requests. Asset requests must appear in the generated static shell allowlist; navigation resolves to cached static HTML. Cross-origin Supabase requests and authenticated API responses are not cached.
- Synchronization explicitly refreshes the repository before taking its queue snapshot. Refresh and mutations share the repository's serialized chain, and stable event/revision acknowledgements remain intact.
- The coordinating agent reported `scripts/verify-supabase.mjs` passing against the actual Supabase project: anonymous authentication, idempotent RPC replay, corrections and immutable originals, two-workspace record isolation, private photo upload/read, denial of cross-workspace and public downloads, signed-URL retrieval, rejection above 100,000 bytes, and explicit session refresh. The reviewer inspected these assertions; this is separate evidence from the reviewer-executed PostgreSQL stand-in suite.
- The coordinating agent reported both production-build Playwright tests passing: mixed intake, correction draft reload, independent summary date, repeat-visit confirmation, and prepared service-worker offline page close/reopen. The second test applies Chromium network throttling and checks local can saving under ten seconds. Supabase responses in those browser tests are mocked; the timed segment begins after farmer selection and does not establish the full human ergonomic target.
- The public deployment verification script separately checks real setup/sync, offline page reopening, compressed rejection-photo retention and reconnection upload, export, and four walkthrough images. Its execution result and public URLs are recorded by the coordinator in `docs/DELIVERY.md`; source inspection alone is not a pass result.

Explicit `refreshSession()` success does not establish automatic refresh after three elapsed offline days. Closing/reopening a page in one browser context does not establish a cold OS/browser-process restart or immunity to storage eviction.

## Remaining acceptance evidence

The coordinating agent owns browser integration results and final delivery status in `docs/DELIVERY.md`. Do not equate fake IndexedDB reopening with a physical browser eviction test, generated dates with three elapsed offline days, or mocked network tests with live Supabase integration. The following need explicit results before being claimed complete:

- Automatic expired-session recovery after an extended offline period and real network interruption during a live committed upload. Basic live Supabase operations and explicit refresh have passed as described above.
- Full 600-can workload on a physical phone, browser/process reopening, failed durable writes, and retained pending evidence. Prepared-shell page reopening has passed automated Chromium testing; the generated workload and failure injections have separate repository tests.
- Small Android phone one-handed operation, keyboard visibility, direct sunlight, and the ten-second known-farmer intake target.
- Physical slow-2G usability and the complete timed known-farmer workflow. Public deployment/source URLs and annotated walkthrough delivery are tracked in the coordinator handoff.

Relevant primary documentation: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [bucket file restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals), and [file size limits](https://supabase.com/docs/guides/storage/uploads/file-limits).
