# naavcaptured. Client Portal

One branded web app that runs the whole job: a client books, Naav sees calendar clashes before confirming, and the client logs in later to view photos, raw video and final edits. Built from the *naavcaptured Client Portal: Scope of Work*.

**Status: Phase 1 (Foundation) complete.** Phases 2 to 4 are next (see [Roadmap](#roadmap)).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript), Tailwind v4 themed from the brand tokens |
| Hosting | Cloudflare Workers free plan via OpenNext (`wrangler.jsonc`) |
| Database + auth | Supabase: Postgres with Row Level Security, email one-time codes, TOTP 2FA |
| Files | Google Drive (Naav's account). The portal stores Drive IDs only |
| Calendar | Google Calendar API (connected now, used in Phase 3) |
| Payments / email | Stripe, Resend (Phase 4) |

Everything security-related uses Web Crypto, so it behaves the same in Node (dev) and on Workers (prod).

## What Phase 1 includes

- **Brand theme**: every colour, font, radius and status colour comes from the brand kit tokens (`src/app/globals.css`). Bone and Ink themes follow the device's light/dark setting. Wordmark, pill buttons, status badges, cards and inputs live in `src/components/ui.tsx`.
- **Database schema + RLS** (`supabase/migrations/0001_init.sql`) for Client, Project, Booking, Collection, Asset, Review (+ comments), Invoice, User (profiles), GuestPass, ActivityLog, plus PIN lockouts and the Google connection.
  - A client can only ever read their own rows.
  - Raw collections are hidden unless the project has **Include raw footage** switched on.
  - The database itself refuses to make a raw collection guest-visible, and refuses to point a guest PIN at raw footage.
  - Admin powers require a 2FA-verified session (`aal2`), checked inside Postgres.
  - The Google token table has no policies at all, so only the server can touch it.
- **Admin login with 2FA** (`/admin/login` → `/admin/mfa`): email + password, then an authenticator app (you set it up on first sign-in).
- **Clients and projects**: create clients (wedding/event or business), projects, and collections.
- **Custom client links** `/c/<name>-<6 random chars>`. Each link can be copied, switched off, given an expiry date, or regenerated (the old link stops working at once). Archiving a client kills the link and all logins.
- **Client login by email one-time code**: the couple, business owners and team members sign in at their link, with no password. Codes are only sent to emails that belong to that client, and the reply is the same either way, so nobody can use the form to check which emails exist. Sessions last 30 days.
- **Guest PIN access** for wedding galleries:
  - PINs are 6 to 10 digits, salted, peppered and stored hashed.
  - Five wrong tries locks the PIN screen for 15 minutes (per link and IP).
  - A correct PIN gives the guest a signed 12-hour cookie that only works on that client's link.
  - Guests only see collections marked visible to guests (never raw), and switching a PIN off locks guests out on their next page load.
- **Google sign-in for Naav's account** (Drive read-only + Calendar). The refresh token is AES-GCM encrypted at rest.
- **Linking a project to a Drive folder**: paste the folder link. Subfolders following the `Photos` / `Raw` / `Final` convention become collections automatically, and any other subfolder becomes a custom collection.
- **Admin dashboard shell**: shoots in the next 14 days, booking requests, unpaid invoices, projects in the edit, recent activity, and a warning while Google isn't connected.
- **Client home shell**, built for phones first: next shoot, projects and their collections, invoices (owners only), and team invites for business owners.
- **Business owners can invite team members** themselves, choosing whether each person can download and approve.
- **Activity log** of sign-ins, guest visits, link changes, invites and Google connects.
- **Privacy defaults**: every response carries `X-Robots-Tag: noindex`, `robots.txt` blocks all crawlers, there's no public client list, and frame embedding is denied.

## Getting started

### 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor, or use `supabase db push`.
3. **Authentication → Providers → Email**: keep email enabled, and turn off "Allow new users to sign up". The portal creates every account; nobody can sign themselves up.
4. **Authentication → Email Templates → Magic Link**: include the code, so clients get a 6-digit code instead of a link, e.g.
   `Your naavcaptured. sign-in code is {{ .Token }}`
5. **Authentication → Multi-Factor**: make sure TOTP is enabled (it is by default).
6. **Authentication → Users → Add user**: create Naav's account with a password and tick "Auto confirm".
7. Edit the email in `supabase/bootstrap_admin.sql` and run it once to make that account the admin.
8. Recommended: under **Authentication → Sessions**, set the inactivity timeout to 30 days to match the portal.
9. Recommended: under **Auth → SMTP**, send email from your own domain (Resend works as an SMTP provider).

### 2. Google Cloud

1. Create a project, then enable the **Google Drive API** and the **Google Calendar API**.
2. On the OAuth consent screen, choose "External" and add Naav's Google account as a test user. Publishing the app later avoids the 7-day refresh-token expiry that applies to test apps.
3. Create an OAuth client of type "Web application", with this authorised redirect URI:
   `https://portal.naavcaptured.com/api/google/callback` (add `http://localhost:3000/api/google/callback` for local dev).

### 3. Environment

```bash
cp .env.example .env.local   # fill in every value
npm install
npm run dev                  # http://localhost:3000/admin/login
```

### 4. Deploy to Cloudflare

```bash
npx wrangler login
for s in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY APP_SECRET TOKEN_ENCRYPTION_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ADMIN_EMAIL; do npx wrangler secret put $s; done
npm run deploy
```

Then add the custom domain `portal.naavcaptured.com` in Cloudflare (Workers → your worker → Domains), or uncomment `routes` in `wrangler.jsonc`.


## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Next.js production build |
| `npm run typecheck` / `npm run lint` / `npm test` | Checks (unit tests cover PIN hashing, signed cookies, token encryption, slugs, Drive link parsing) |
| `npm run preview` | Build for Workers and run locally with Wrangler (uses `.dev.vars`) |
| `npm run deploy` | Build and deploy to Cloudflare |

## Project layout

```
src/
  app/
    admin/login, admin/mfa         studio sign-in + 2FA
    admin/(studio)/                dashboard, clients, projects, settings (all require 2FA)
    api/google/connect, callback   Google OAuth for Naav's account
    c/[slug]/                      client link: email-code login, guest PIN, client + guest home
    auth/signout                   sign out
  components/                      brand UI (Wordmark, Button, Badge, Card, inputs), ActionForm
  lib/
    auth.ts        admin gate (aal2), client lookups by slug
    guest.ts       signed guest cookie, hashed-IP for lockouts
    crypto.ts      PBKDF2 PIN hashes, HMAC tokens, AES-GCM secrets (Web Crypto)
    google.ts      OAuth, token refresh, Drive helpers
    users.ts       creating client logins (server-only)
    supabase/      server (RLS), service-role and browser clients
supabase/
  migrations/0001_init.sql         schema, triggers, RLS
  bootstrap_admin.sql              one-off: make Naav the admin
```

## What to test (Phase 1)

1. **Admin + 2FA.** Sign in at `/admin/login` and scan the QR code. Sign out and back in: you're asked for a code. Open `/admin` in a private window: you're sent to the login page.
2. **Client + link.** Create a wedding client, then copy the link from the client page and open it on your phone.
3. **Client login.** Under "People with a login", add the couple's email. On the link, enter that email: a code arrives, and entering it opens their home. An email that isn't on the client gets the same message but no code.
4. **Link controls.** Regenerate the link: the old URL now shows "this link isn't working". Set an expiry date in the past, or switch the link off, and check the same.
5. **Guest PIN.** On a project, create a PIN, then mark the Photos collection "Visible to guests".
   - On the link, choose "I'm a guest" and enter the PIN: only Photos shows.
   - Enter a wrong PIN 5 times: the screen locks for 15 minutes.
   - Switch the PIN off: the guest is locked out on their next page load.
6. **Raw footage.** Raw collections can't be ticked as guest-visible. With "Include raw footage" off, the couple doesn't see the Raw collection. Turn it on and it appears for them, but still not for guests.
7. **Google + Drive.** In Settings, click "Connect Google". On a project, paste a Drive folder link that has `Photos`, `Raw` and `Final` subfolders: the collections are created and marked "drive linked".
8. **Business team.** For a business client, add the owner. Signed in as the owner on the link, invite a team member and sign in as them: they see projects but no invoices.

## Decisions and assumptions

- **Link format** follows the access rules: name + 6 random characters (e.g. `/c/riya-and-bilal-k7m2qx`), not the bare name, so links can't be guessed.
- **One login per email.** An email can belong to one client (or the studio), which keeps "which portal am I in" unambiguous.
- **Guest PINs are unique within a client**, so a typed PIN maps to exactly one gallery. A PIN opens either all guest-visible collections of its project or one chosen collection.
- **Drive scope is read-only for now.** Optionally adding clients as Drive viewers on their own folder (in the scope) needs a broader Drive scope, so that's left for later, when you'd need to reconnect.
- **`middleware.ts`, not Next 16's `proxy.ts`.** Proxy runs on the Node.js runtime, which OpenNext only supports experimentally on Cloudflare; Edge middleware is fully supported. The build prints a deprecation notice; this is expected.

## Roadmap

1. ~~**Foundation**: project setup, brand tokens, admin login, clients and projects, custom links with login and guest PIN.~~
2. **Delivery**: Drive file sync into Assets, photo galleries with Drive thumbnails via the Worker, video streaming with Range requests, downloads, versions with approve / request changes.
3. **Booking hub**: availability rules, Google free/busy conflict checks, public booking page, two-way calendar sync.
4. **Money and polish**: Stripe quotes, invoices and deposits, payment-gated downloads, branded Resend emails, brand page.

### Still open (from the scope)

- Package list with prices, deposit % and cancellation rules
- Buffer rules: shoots per day, travel time, days off
- Default raw-file retention period, and whether extensions are paid
- VAT registered or not
- Domain: `portal.naavcaptured.com` or another
- SVG exports of the wordmark (the header typesets it for now)
