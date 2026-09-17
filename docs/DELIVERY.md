# Dairy Intake delivery handoff

## Delivered

- Mobile English intake app with large one-handed controls, keyboard-safe bottom actions, high contrast status words, and Asia/Kolkata session selection.
- Empty anonymous workspace setup with rate configuration and browser-data recovery disclosure.
- Farmer registration and numeric-ID search, repeat visits, immediate per-can saving, unfinished draft recovery, whole-can acceptance/rejection, rejection reasons, unmeasured-fat path, and compressed evidence photo handling.
- IndexedDB repository with transactional persistence, queue revisions, duplicate-safe saves, immutable correction history, voids, historical delivery rates, daily summaries, ledger export, and a 30 MB local photo budget.
- Supabase migration with anonymous workspace isolation, RLS, immutable event/revision RPC, private evidence bucket, 2,000-can and 200-photo workspace limits, and 200 MB reservation cap.
- Supabase synchronization client with foreground/reopen/manual retries, stable event IDs, separate record/photo states, and retention of pending data after failures.
- Vite build, installable shell manifest/service worker, Cloudflare Workers static-assets configuration, environment template, and setup scripts.
- Walkthrough page at `public/how-it-works.html`.
- Public deployment: https://dairy-intake.dairy-intake.workers.dev

## Verification completed

- `npm test`: 2 test files, 14 tests passed.
- `npm run build`: TypeScript check and Vite production build passed.
- Core tests cover 600 can entries across three offline dates, browser reopen, corrections, rate preservation, duplicate saves, stale acknowledgements, drafts, concurrent tab writes, failed durable writes, and photo budget behavior.
- Sync tests cover interrupted/idempotent retries, concurrent correction, server-capacity errors, offline behavior, missing workspace credentials, and photo upload retry retention.
- Supabase SQL checks cover event replay, immutable history, authentication/RLS isolation, private evidence access, and concurrent capacity limits.
- Live Supabase smoke checks passed for anonymous auth, RPC replay, immutable originals, cross-workspace isolation, private photo upload/read/signed URLs, upload-size rejection, and session refresh. The check uses isolated fictional workspaces.
- Local Chrome browser checks passed for mixed intake, correction recovery, summary dates, slow-network entry, offline close/reopen, photo compression, export, and the four screenshot walkthrough.

## Still needed before public launch

- Publish the source repository to GitHub. The source is ready, but public repository creation/push requires explicit confirmation because it publishes the complete source tree.
- Run the physical small-Android checks for one-handed use, direct sunlight, keyboard behavior, slow-2G, and three-day offline operation. These remain acceptance targets, not claims of completion.
- Run the physical small-Android checks in [device-checks.md](device-checks.md). Desktop and automated mobile emulation cannot verify direct sunlight, real thumb reach, or three elapsed offline days.
- Repeat the public-browser smoke test after DNS propagation if the workers.dev hostname is intermittently unresolved.

## Known scope limits

Clearing browser data loses the anonymous workspace identity and locally pending data. Closed-app synchronization has no timing guarantee. Fat readings do not determine acceptance or payout. The prototype has one active collection phone per hub and no account-based recovery or cross-device access.
