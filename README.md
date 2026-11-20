# Basecamp — standalone

All-in-one hunting app: shared camps, interactive map (Streets / Satellite / Topo / Dark / Grayscale, inside the app), pins and trails, stand check-in and reservations with best winds, Today's wind + Go hunt score, Hunt now strip, pinned camp notes, camp chat, trophy feed with harvest details and shareable trophy cards, Camp Crew, Profile with Friends / Licenses & Tags / Gear / Badges, Settings, Community groups + Leaderboard, Season Recap, and a state-based Hunting Calendar.

This is real, runnable code — not a prompt. It is the same app, **rebuilt from the full Basecamp spec as a standalone Vite + React + TypeScript frontend with an Express + Node backend** (a workaround rebuild from the spec, not copied Muse source). Sign-in is built in from the start with Supabase Auth (free tier); without Supabase configured it runs in single-user local mode with an empty profile.

## What is inside

```
basecamp-standalone/
  src/            React + TypeScript frontend (tabs, camp map with Leaflet + Esri tiles, camp detail, calendar, profile, community, settings)
  server/         Express API + SQLite (node:sqlite, built into Node 22+) or Postgres when DATABASE_URL is set
  server/profanity.ts   Bad-language filter (server side, every text write)
  server/weather.ts     Open-Meteo + National Weather Service fallback, Go-hunt scoring, rut windows, moon phase
  server/scoring.ts     Badges (25, computed live) + Leaderboard scoring
  server/auth.ts        Supabase Auth verification / local dev fallback
  scripts/claim-seed.ts One-time script to link seeded data to a real Supabase account (only for builds that ship seed data — this build ships none, so there is nothing to claim)
  api/index.ts    Vercel serverless entry for /api/*
  data/seed.json  Clean base app — intentionally empty seed (no carried-over data)
  vercel.json     Vercel deployment config
  .env.example    Every environment variable the app takes (no secrets in the package)
```

**Clean start — no carried-over data:** this build ships with an intentionally empty seed. There is no pre-loaded profile, camp, stand, photo, or group. On first sign-in you set up your hunter profile, then create your own camp, stands, and groups in the app. (The Muse version's data — GPCCN, the stand, the Doe - 2025 photo — was deliberately left out at Guy's request, 2026-11-19.)

**What is not in this package:**
- **The app icon artwork** is not in this package. The supplied image is for the app icon only and was never part of the app code.

**Free tiers only — no payment anywhere in these steps.**

## Run it locally (no Supabase needed)

Requirements: Node.js 22 or newer, npm.

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api/health

Without Supabase configured the app runs in **local dev mode**: no sign-in screen, one local user, an empty profile. The server creates `data/basecamp.db` (SQLite) on first run and applies the schema from the bundled copy if the database is empty. To start fresh, delete `data/basecamp.db` and restart.

Other commands: `npm run build` (typecheck + Vite build), `npm start` (serve the built app + API on port 3001).

## Sign-in (Supabase Auth, free tier)

The deployed app uses real accounts. Email/password **and** magic-link sign-in are built in; Google sign-in is optional.

### 1. Create the Supabase project (free)

1. Create a free account at https://supabase.com (no card required for the free tier).
2. **New project** → pick a name (e.g. `basecamp`), set a database password, pick the closest region, Create.
3. Go to **Project Settings → API** and copy: the **Project URL** (`SUPABASE_URL`) and the **anon / public key** (`SUPABASE_ANON_KEY`).
4. Go to **Project Settings → Database → Connection string → URI** and copy it for `DATABASE_URL`. Use the **pooled** connection (Supavisor, transaction mode) — it looks like:
   `postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
   (The direct `db.<ref>.supabase.co` address does not exist for new projects, so the pooled address is the one to use — it is also the right choice for Vercel serverless.)
5. Go to **Project Settings → API** and copy the **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`). **Server only — never put it in a `VITE_` variable and never ship it to the browser.**
6. In **Authentication → Providers**, turn on **Email** (password + magic link are both supported). For Google sign-in, also enable **Google** there and set `SUPABASE_GOOGLE_ENABLED=1` (a server variable — see below) — otherwise leave it off; the Google button simply does not appear.
7. In **Authentication → URL Configuration**, add your Vercel URL as a Site URL / redirect URL so magic links and Google return to the app.

### 2. First sign-in creates the hunter profile

On first sign-in the app asks for first/last name, hunting state, and interests — the same fields as the Profile page. A profile row is created and linked to the Supabase user id. Authorship everywhere (trophy posts, chat, check-ins, reservations, leaderboard, Camp Crew, friends) ties to that account id. Licenses, gear, and settings stay per-account. Email/phone visibility (public / friends-only / private, default private) is enforced server-side.

### 3. No data to link — this build starts empty

This build ships with no seeded data, so there is nothing to claim and no claim step. Your profile is created when you first sign in (step 2 above), and everything else — camps, stands, groups — you create in the app. (The `scripts/claim-seed.ts` script is still in the package, but it only applies to builds that ship seed data.)

### Founder badge window — set this when the app publishes

The **Founder badge** is for people who join in the app's first year. It is controlled by the `FOUNDER_CUTOFF` environment variable, defaulting to **`2027-11-14`** (one year from the app's Nov 13, 2026 debut). **When the app actually publishes, set `FOUNDER_CUTOFF` to one year from the real publish date** — otherwise the window stays anchored to the debut date.

## Deploy it free — GitHub + Vercel + Supabase

### 1. Put the code on GitHub (free)

1. Create a free account at https://github.com if you do not have one.
2. Create a new **empty** repository called `basecamp` (do not add a README — this folder already has one).
3. In this folder, run:
   ```bash
   git init
   git add .
   git commit -m "Basecamp standalone"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/basecamp.git
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username.)

### 2. Deploy to Vercel (free Hobby tier)

1. Create a free account at https://vercel.com (sign in with GitHub).
2. **Add New → Project → Import** your `basecamp` GitHub repository.
3. Vercel detects Vite automatically. Leave the build settings as-is (`npm run build`, output `dist`).
4. In **Environment Variables**, add:
   - `DATABASE_URL` = the Supabase connection string from above.
   - `SUPABASE_URL` = your Supabase Project URL.
   - `SUPABASE_ANON_KEY` = your Supabase anon key.
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key (server only).
   - `SUPABASE_GOOGLE_ENABLED` = `1` only if you enabled Google in Supabase.
   - `FOUNDER_CUTOFF` = `2027-11-14` (change to one year from the real publish date when it publishes).

   **No `VITE_SUPABASE_*` variables are needed any more.** The client build does not need any Supabase values at build time: on startup the browser fetches `GET /api/auth/config`, and the server hands it the public values (Project URL + anon key, which is public by design) from the server variables above. That is what makes sign-in work even though the client was built without those values set — a plain `npm run build` always ships the sign-in UI.
5. **Deploy.**

Your app is now live at the `*.vercel.app` address Vercel gives you. Open it on your phone, sign in, set up your hunter profile, then create your first camp.

**Important:** on first load the server creates the tables from the bundled schema if the database is empty. The seed is intentionally empty in this build, so the app starts clean — if you ever want to start fresh, clear the tables in Supabase (Table Editor → delete rows) and reload the app.

### 3. Later: Android app store

This hosted web app is the step before the Play Store. To turn it into an Android app, wrap the live Vercel URL with Capacitor or PWABuilder (both free) to produce an APK / AAB, then upload that to Google Play with a $25 one-time Play developer account. The app itself is unchanged.

## How the pieces fit

- **Frontend** (`src/`): React. Tabs are text-only, no icons: Hunts / Maps / Basecamp (middle medallion) / Community / Profile. The map is Leaflet with Esri World Imagery (satellite) and Esri World Topo tiles — no API key needed. Each camp remembers its own map view; the Default map view setting is the fallback. Refreshing stays in the current tab and reopens the same camp.
- **Backend** (`server/`): Express. All camp data lives behind `/api/*`. Locally it uses SQLite (`data/basecamp.db`). When `DATABASE_URL` is set it uses Postgres (Supabase) instead.
- **Weather** (`server/weather.ts`): Today's wind uses Open-Meteo first with a National Weather Service (`api.weather.gov`) fallback, cached 1 hour per camp, with a 12-second overall budget so a failed weather call returns quickly instead of hanging. If a fresh fetch fails and a cached snapshot exists, the last snapshot is served marked stale (`stale: true`) instead of erroring; only when there is no cached snapshot at all does the wind endpoint return 502. The Go hunt score is wind (3.5) + rut (3.5, from state-agency peak-breeding windows) + temperature (2) + moon (1, deliberately minor). Wind direction is shown as compass letters/words only — there are no wind arrows anywhere in the app.
- **Badges** (`server/scoring.ts`): 25 badges computed live from real activity — no badges table. The Leaderboard is a server-computed multi-factor total from real trophy posts; the app never explains how points are tallied — only totals show.
- **Bad-language filter** (`server/profanity.ts`, mirrored in `src/lib/profanity.ts` for the live warning): checked server-side before anything saves, and live in the app with Send/Post/Save disabled until reworded. It catches leetspeak, stretched, suffixed, asterisk-masked (including fused tokens), and spaced/dotted variants, and never flags ordinary hunting words (bass, compass, woodcock, crappie).
- **Orange outlines** appear only on actually-selected items (a tapped stand, a chosen pin type, a selected pin, the map border while building a trail). Everything else uses a neutral border.
- **Season dates** in the Hunting Calendar are approximate windows. The app shows the state agency name, an official regulations link, and "Verify before you hunt" — always check the agency site before hunting.
- **No offline maps, no property-line info, no sketch board** — those are intentionally not in this app.

## Troubleshooting

- `npm run build` fails: make sure you are on Node 22+ (`node --version`). The server uses `node:sqlite`, which is built into Node 22 and newer.
- App loads but shows "Could not load Basecamp": the API is not reachable. Locally, run `npm run dev` (starts both frontend and server). On Vercel, check that `DATABASE_URL` is set and the deployment logs show no error.
- Map tiles do not load: check your internet connection — tiles come from Esri / OpenStreetMap / CARTO over the network.
- Weather shows "unavailable": the server could not reach Open-Meteo or the National Weather Service from where it is running. The wind card retries on demand (Refresh wind); the last good snapshot (up to 1 hour old) is used when it is fresh, and an older snapshot is shown marked stale when a fresh fetch fails.
- Sign-in screen does not appear locally: that is expected — without Supabase env vars the app runs in local dev mode with an empty profile. On a deployment, set the **server** `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` variables (no `VITE_*` variables are needed — the client fetches its config from the server at runtime). If the app shows "Could not reach the Basecamp server to check sign-in status", the browser could not reach `/api/auth/config` — check that the API is up.
- Save profile does nothing: check the Vercel Runtime Logs right after pressing Save. If you see "Token verification failed" or "requireAuth rejected", the server cannot verify the login token — check that `SUPABASE_SERVICE_ROLE_KEY` in Vercel is the **secret** key from Supabase Project Settings → API (starts with `sb_secret_`), not the publishable key. If there is no `profile` request at all in the browser's Network tab and no error on the page, the browser was stuck reading the login token before sending anything — fixed 2026-11-19 by reading the stored token directly (with a timeout on the fallback), and Save now shows "Save is taking too long" after 20s instead of hanging silently. If it still happens, sign out, close other tabs with the app open, and sign back in once to clear any stuck session.
- Save "works" but the app flashes the home screen and returns to "Set up your hunter profile": Postgres lowercases unquoted column names, so reads returned keys like `firstname` while the app reads `firstName` — every read looked empty even though the save had worked. Fixed 2026-11-19: the Postgres layer now maps row keys back to the camelCase names in the schema. Your earlier saves were never lost — after redeploying this fix the app reads them back and lets you in.
- "no such table: app_settings" (or any "no such table" error): the server is running on its temporary local database instead of Supabase, which means `DATABASE_URL` is not set for the deployment you are loading. In Vercel → Settings → Environment Variables, check `DATABASE_URL` is set and covers the environment you are loading (Production / Preview / Development — check all three if unsure), load the app from the project's main `*.vercel.app` address rather than a deployment-specific link, and redeploy after changing any variable.
