# Dairy Intake

A mobile dairy hub intake prototype built from [CONTEXT.md](CONTEXT.md), [the agreed design](docs/design.md), and [the ADRs](docs/adr/). The app starts with an empty farmer roster and ledger. It records whole-can decisions, keeps corrections and voids as history, and estimates INR payouts using the delivery's preserved rate.

Live app: https://dairy-intake.dairy-intake.workers.dev

Source: https://github.com/GeetheswarReddy/dairy-intake

## Run locally

Use Node.js 22 or newer.

```bash
npm ci
cp .env.example .env
# Fill .env with your Supabase project URL and public publishable/anon key.
npm run dev
```

First setup requires a configured Supabase project and an online connection. Offline reopening is supported by the production build, not the Vite development server:

```bash
npm run build
npm run preview
```

Open the app, complete setup, and wait for **Offline app ready** before disconnecting. Clearing browser data loses unsynced records and access to the anonymous workspace. Export the ledger regularly. The JSON export includes available local photos; evicted server copies are not downloaded automatically and it is not an import/recovery mechanism.

## Supabase Free setup

1. Create a dedicated project in a Free organization at <https://supabase.com/dashboard>.
2. Enable **Allow anonymous sign-ins** in Authentication → Sign In / Providers.
3. Run [the migration](supabase/migrations/202609160001_intake.sql) once in the project's SQL Editor. It creates workspace-isolated records, append-only audit events, RPCs, photo reservations, and the private `evidence` bucket. Do not run `supabase/tests/bootstrap.sql` in a real project.
4. Get the Project URL from the Connect dialog and the publishable (or legacy anon) key from Settings → API Keys. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Never put a service-role/secret key in a `VITE_` variable.
5. Rebuild. Vite embeds these public values at build time; editing the environment after building does not update the bundle.

No paid upgrades are required or enabled. Free-service pauses and limits interrupt synchronization while pending records remain on the phone. Public anonymous workspace creation can consume provider quotas; the demo is not a production account system.

Provider references: [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [private storage policies](https://supabase.com/docs/guides/storage/security/access-control).

## Cloudflare deployment

```bash
npx wrangler login
npm run deploy
```

`wrangler.jsonc` publishes the production `dist` directory as Cloudflare static assets. Use the resulting HTTPS URL for mobile testing. Do not deploy `dist-browser`: it contains a mocked backend configuration for automated browser tests. [Cloudflare static asset documentation](https://developers.cloudflare.com/workers/static-assets/get-started/).

## Verification

```bash
npm test
npm run build
npm run test:browser
```

Browser tests use an isolated mocked Supabase endpoint and a separate production build (`dist-browser`). Chrome defaults to the macOS installation; elsewhere set `CHROME_PATH` to your installed Chrome/Chromium executable. Tests generate the fictional screenshots used by the walkthrough without seeding the public app.

The PostgreSQL security and concurrent quota suite uses a disposable database:

```bash
PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH" bash supabase/tests/run-local.sh
```

This checks SQL using Auth/Storage stand-ins, not a live Supabase installation. See [review findings](docs/review.md) and [delivery status](docs/DELIVERY.md) for verified results and remaining checks.

## Storage and image trade-offs

Each completed can and queue revision commits atomically to IndexedDB. Retries preserve event identity, and acknowledging an older revision cannot drop a newer correction. A single active collection phone is supported; concurrent device collection and account recovery are outside scope.

A rejected can needs one JPEG photo or an explicit unavailable explanation. Images are resized to at most 960 pixels on the longest edge and compressed to at most 100,000 bytes. Local photos use a 30,000,000-byte budget; only confirmed-uploaded local copies can be evicted automatically. Explicitly discarded draft photos may be removed, but all original and corrected can evidence remains protected.

The server permits 2,000 cans and 200 photo reservations per workspace and 200,000,000 reserved bytes across the demo. Each reservation charges the maximum 100,000 bytes, even for smaller images, so quota enforcement is conservative and race-safe. Interrupted reservations persist for retries. Synchronization runs while the app is open; there is no closed-app timing guarantee.

Live checks (create isolated fictional workspaces and retain their test evidence):

```bash
node scripts/verify-supabase.mjs
node scripts/verify-deployment.mjs https://dairy-intake.dairy-intake.workers.dev
```

See [physical-device checks](docs/device-checks.md) for the human acceptance steps.
