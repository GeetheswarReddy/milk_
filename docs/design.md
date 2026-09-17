# Dairy intake prototype design

This document records the completed design interview for `idea.txt`. The user confirmed shared understanding, including the ergonomic targets, on 2026-09-16. This is an agreed design; implementation and validation have not yet been performed.

## Agreed foundations

- One dairy hub, one active collection phone, and real server synchronization. Simultaneous collection on multiple devices is outside the prototype scope.
- A delivery groups a farmer's individual can entries. Each can has its own volume, fat percentage, and acceptance decision. Rejecting some whole cans represents partial delivery rejection; splitting a single can is outside scope.
- The operator decides acceptance manually. Rejection requires a reason. Low density is a manually selected reason; a density measurement field and automatic thresholds are outside the initial scope.
- Estimated payouts use a configured rate per accepted liter, independent of fat readings.
- English interface, small Android phone with Chrome, numeric farmer-ID search, and large labeled controls. One-handed use and sunlight legibility remain requirements.
- The original requirements for free hosting, no paid third-party APIs, slow-2G operation, restricted photo sizes, a public prototype, a public source repository, and an offline/image trade-off note remain in force.

## Interview status

The grilling is complete. The agreed trade-offs are recorded in [storage trade-offs](storage-tradeoffs.md). Provider provisioning and physical-device checks remain execution tasks, not completed results.

## Agreed operational rules

- A rejected can requires a rejection reason. If a photo cannot be captured or stored, an explicit photo-unavailable explanation permits rejection and missing evidence remains visibly flagged.
- Corrections preserve original values and include a reason and time. Summaries use current corrected values. Accidental entries can be voided with a reason.
- Start with an empty farmer roster. Permit offline farmer registration with a unique numeric ID and name, warn about duplicate IDs, and omit phone numbers and other unnecessary personal details. This replaces the earlier seeded-roster recommendation following the Q14 clarification.
- Operators explicitly select morning or evening collection for a local calendar date and confirm the session on opening intake. Currency is INR, with one configurable hub-wide rate per accepted liter. Preserve the rate applied to each delivery.
- Design and test for three consecutive offline days after initial online setup, including browser closure and reopening. This is a test target, not a guarantee against clearing browser data or browser eviction.
- Distinguish saved-on-phone, record-synced, and photos-synced states. Never silently delete unsynced records or photos.
- Each public visitor gets an isolated demo workspace with real server synchronization. Reopening the same browser restores that workspace. Production accounts and cross-device access are outside scope. The app is a demonstration, and the walkthrough uses fictional examples.
- Save each completed can immediately on the phone. Keep the farmer selected for adding another can and provide a prominent finish-delivery action. Restore unfinished input as a visibly marked draft excluded from totals.
- Require positive volume for every can and a fat reading for accepted cans. Rejected cans may explicitly have unmeasured fat. Do not prefill measurements from a previous can. Reject invalid numeric input and confirm unusually large values using the thresholds below.
- Permit repeat visits by the same farmer in one session, showing the earlier delivery and requiring confirmation of a new visit. Repeated taps on a save action must not create duplicate entries.
- Target a known farmer's single-can acceptance within 10 seconds, excluding physical measurement. Verify three offline collection days, reopening, interrupted sync without duplicates, mixed acceptance outcomes, photo failures, and corrections reflected in totals. Check one-handed controls and contrast on a small mobile screen and usability after initial setup under simulated slow 2G. These are acceptance targets, not completed test results.
- Attach at most one photo per rejected can, resized to a longest edge of 960 pixels or less and compressed to 100 KB or less. Preview the compressed result and allow retaking it; if unusable, permit the explicit photo-unavailable path.
- Limit local photo storage to 30 MB. Evict local photo copies only after confirmed successful upload, retaining the server copy; never automatically delete unsynced evidence. If the photo budget is exhausted, use the explicit missing-photo path. If the intake record itself cannot be stored, clearly report failure rather than showing success.
- Synchronize automatically while the app is open, retry on reopening, and provide Sync now. Do not promise timely closed-app sync. Clearing browser data loses unsynced records and access to the anonymous workspace; disclose this during setup. Provide a downloadable ledger export. Account-based recovery is outside prototype scope.
- Use Asia/Kolkata collection dates. Fix the delivery rate at its first saved can and apply later rate changes only to new deliveries. Clearly show the active date, session, and rate during intake.
- Allow measurements with up to two decimal places. Require volume above zero and explicit confirmation for a can over 50 L. Accept fat percentages from 0 through 100, with confirmation above 15%. These are typo checks rather than automatic quality decisions.
- Use Supabase Free for synchronized records and private photo storage, and Cloudflare static asset hosting for the app and walkthrough. Do not enable paid upgrades. Accept that free-service inactivity or limits can interrupt synchronization; the prepared app continues recording locally while space is available, with accurate pending/error states.
- Enforce server-side limits of 2,000 can entries and 200 photos per workspace, plus 200 MB of photos across the demo. Keep photos private to the workspace. When capacity is exhausted, stop affected uploads, retain local pending data, and explain the limit without automatically deleting existing records.
- Test 100 deliveries per day averaging two cans each for three offline days: 600 can entries with 10% rejected and photographed. Separately exercise storage-full, server-unavailable, and interrupted-sync conditions. This generated test data must not seed the public app.

## One-handed use and sunlight readability

The user explicitly reaffirmed both constraints after accepting the hosting and workload choices. They are first-class acceptance criteria.

Confirmed ergonomic targets:

- Put primary intake actions in a persistent bottom action area within thumb reach; ensure the on-screen keyboard does not hide the active field or save action. Avoid top-corner actions for the routine intake path.
- Use full-width stacked primary actions where practical so the routine flow works with either hand. Use touch targets at least 48 CSS pixels high, with primary intake actions at least 56 CSS pixels high and spacing between acceptance and rejection actions.
- Use a light, high-contrast interface with solid backgrounds and at least 18 CSS pixel primary field text. Target at least 7:1 contrast for essential text. Pair status colors with words and icons; avoid faint placeholders, translucent overlays, and color-only meanings.
- Use numeric keyboards for measurements and farmer IDs; retain farmer/session context between cans but never copy the preceding can's measurements.
- Include one-handed entry checks on a small Android phone and a direct-sunlight check on a physical device. Browser emulation and contrast calculations alone cannot establish outdoor usability; report physical checks as unverified until actually performed.

## Agreed walkthrough approach (Q14)

Create a separate static “How it works” page with annotated screenshots of the finished app explaining farmer selection, measurements, acceptance/rejection, and the daily summary. Retain the working app with offline entry and real synchronization. Start its roster and delivery history empty and require farmer registration and rate setup before first intake; do not seed the proposed 20 farmers or INR 40/L rate. The walkthrough supplements rather than replaces the functional prototype. Asia/Kolkata was subsequently accepted as the collection timezone in Q20.

## Browser constraints

- Browser storage is best effort unless a persistence request is granted, and even granted persistence cannot protect against the user clearing browser data. See [Chrome team's persistent-storage guidance](https://web.dev/articles/persistent-storage).
- Quota depends on the device and available space; writes can fail. See [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- Background sync timing is browser-controlled. Foreground retries and durable pending state are needed; closed-app synchronization cannot be promised on a deadline. See [Chrome Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync).
- Losing browser data also loses a locally held demo-workspace identity unless a separate recovery mechanism is provided. The accepted prototype scope discloses and accepts this limitation, provides ledger export, and excludes account-based recovery.

## Requested closing document

The implementation note [storage trade-offs](storage-tradeoffs.md) summarizes the agreed choices, considered alternatives, reasons, and consequences. The implementation note is maintained with the project documentation.

## Hosting research supporting the decision

Accepted in Q22: Supabase Free for database synchronization and private photo storage, plus Cloudflare static asset hosting for the app and walkthrough. [Supabase pricing](https://supabase.com/pricing) lists 500 MB database storage and 1 GB file storage; [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) documents inactivity-related pausing. Free service capacity is not an availability guarantee; [billing guidance](https://supabase.com/docs/guides/platform/billing-faq) explains restrictions for continued overuse. [Cloudflare static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) describes free static asset requests. Cloudflare R2 was considered but is less suitable for the strict zero-cost boundary because [usage beyond its free allowance is billed](https://developers.cloudflare.com/r2/pricing/). Actual account availability and payment setup have not been checked.
