# Voyago Travel Planner

A full-stack travel planner — build day-by-day itineraries, track your budget,
and keep all your trip details in one beautiful place. Built with Next.js 14
(App Router), TypeScript, Tailwind CSS, Framer Motion, and Firebase.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Firebase config (see below)
npm run dev
```

Open http://localhost:3000.

> The app validates your Firebase configuration on startup. If `.env.local` is
> missing values or still contains placeholders, you'll get a clear error telling
> you exactly which variables to fix — instead of a confusing `auth/invalid-api-key`.

---

## Firebase setup

The app uses Firebase for authentication and data storage. You need a Firebase
project and a registered **Web App** to get the config values.

### 1. Create / register a Firebase Web App

1. Go to the [Firebase Console](https://console.firebase.google.com/) and open
   (or create) your project — this app targets **`voyago-travel-planner-ai`**.
2. Click the gear icon → **Project settings**.
3. Scroll to **Your apps**. If there's no Web app yet, click the **`</>`** (Web)
   icon to register one. Give it a nickname (e.g. "Voyago Web").
4. In **SDK setup and configuration**, choose **Config** to see the
   `firebaseConfig` object.

### 2. Copy the config into `.env.local`

```bash
cp .env.local.example .env.local
```

| Firebase config field | `.env.local` variable                      |
| --------------------- | ------------------------------------------ |
| `apiKey`              | `NEXT_PUBLIC_FIREBASE_API_KEY`             |
| `authDomain`          | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         |
| `projectId`           | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          |
| `storageBucket`       | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      |
| `messagingSenderId`   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId`               | `NEXT_PUBLIC_FIREBASE_APP_ID`              |

The template already fills in the public identifiers for `voyago-travel-planner-ai`.
The only value you must supply yourself is your **`apiKey`** (your real Web API key).

> **Restart required:** Next.js inlines `NEXT_PUBLIC_*` values at build time.
> After editing `.env.local`, **stop and restart `npm run dev`**.

> **Never commit `.env.local`.** It's already in `.gitignore`.

### 3. Enable Firebase services

In the Firebase Console, enable these for your project:

| Service | What to enable |
| ------- | -------------- |
| **Authentication → Sign-in method** | **Anonymous** (required), **Email/Password** (required), **Google** (required) |
| **Authentication → Settings → Authorised domains** | Confirm `localhost` is listed (add your deployed domain too) |
| **Firestore Database** | Create a database (test mode for local dev, or apply `firestore.rules`) |
| **Storage** | Enable Cloud Storage (`storage.rules` is staged and ready) |

> **Firebase Hosting is optional** and not required for local testing.

---

## Deploy security rules (required)

Firestore and Storage were created in **production mode** (default deny), so
**no reads or writes will work until the security rules in this repo are
deployed**. The rules (`firestore.rules`, `storage.rules`) restrict every trip
to its members — there is no public access. They cannot be deployed from CI/the
Claude environment (no Firebase credentials), so run these locally **once** (and
again whenever the rules change):

```bash
# 1. Install the Firebase CLI (one-time, if you don't have it)
npm install -g firebase-tools

# 2. Sign in to the Google account that owns the Firebase project
firebase login

# 3. From the repo root (the project is already set in .firebaserc), deploy both:
firebase deploy --only firestore:rules,storage

# …or deploy them individually:
firebase deploy --only firestore:rules
firebase deploy --only storage
```

`.firebaserc` already targets `voyago-travel-planner-ai`, so you don't need to
pass `--project`. After a successful deploy you can confirm the rules in
Firebase Console → Firestore Database → Rules and Storage → Rules.

> **What the rules enforce:** users can only read/write their own
> `users/{uid}` profile; trips are readable/writable only by uids listed in the
> trip's `members` array; only the owner may extend the members list (for future
> collaboration); `ownerId` is immutable client-side (Admin SDK required to transfer
> ownership); nested `days`/`expenses` and trip media inherit trip membership. Anonymous
> users are fully supported (an anonymous uid is a normal `request.auth.uid`).

---

## Authentication (Phase 2C)

Voyago supports three authentication paths, all managed through Firebase Auth:

### Sign-in methods (all three must be enabled in Firebase Console)

| Provider | Firebase Console path |
| -------- | -------------------- |
| **Anonymous** | Authentication → Sign-in method → Anonymous → Enable |
| **Email/Password** | Authentication → Sign-in method → Email/Password → Enable |
| **Google** | Authentication → Sign-in method → Google → Enable (set support email) |

### Authorised domains

Firebase Auth blocks sign-in popups from unlisted domains.

- `localhost` — enabled by default, confirm it's listed
- Your production domain (e.g. `voyago.app`) — add in Authentication → Settings → Authorised domains

### Anonymous trip linking (how it works)

Every visitor receives a silent anonymous Firebase session. When they create
trips, those trips are owned by their anonymous uid.

**When they sign up or sign in with Google/Email:**
- Voyago calls `linkWithCredential` or `linkWithPopup` on the anonymous user.
- If linking **succeeds** (new account), the uid is **preserved** — all existing
  trips remain accessible without any data migration.
- If linking **fails** (the credential already belongs to another account), the
  user is signed into that existing account. Their anonymous trips stay on the
  old anonymous uid and are not automatically migrated (this requires Firebase
  Admin SDK / Cloud Functions, which is out of scope for Phase 2C).

### Google OAuth support email

When enabling the Google provider in Firebase Console you must set a **support
email** for the OAuth consent screen (usually your project owner's email).

### Credential-already-in-use flow

When an anonymous user tries to sign in with Google but their Google account
already has a Voyago account:
1. `linkWithPopup` throws `auth/credential-already-in-use`
2. Voyago extracts the Google credential from the error object with
   `GoogleAuthProvider.credentialFromError(err)`
3. Calls `signInWithCredential(auth, credential)` — **no second popup needed**
4. The user is signed into their existing account in one interaction

This avoids the browser popup-blocker problem that would occur if we opened
a second popup immediately after the first one closed.

### User profile in Firestore

Each real user gets a `users/{uid}` document with:

```json
{
  "id": "uid",
  "name": "Display name",
  "email": "user@example.com",
  "photoURL": "https://... (Google only)",
  "providerId": "google.com | password | anonymous",
  "color": "#hex (for avatar fallback)",
  "createdAt": "ISO string",
  "lastLoginAt": "ISO string"
}
```

This document is private — only readable/writable by the owning user.

---

## Trip sharing (Phase 3)

Owners can publish a **read-only** link so others can view a trip without logging
in and without any ability to edit.

### How it works — public snapshot model

Sharing does **not** expose the live trip or expense documents. Instead, a
separate `shares/{shareId}` document stores a **denormalised snapshot** containing
only the sections the owner chose to expose:

```
shares/{shareId} {
  tripId, ownerId, enabled,
  visibility: { itinerary, travellers, budget, expenseBreakdown, settlement, notes },
  snapshot:   { ...only the enabled sections... },
  createdAt, updatedAt
}
```

- `shareId` is an unguessable ~22-char random token, also stored on the trip as `trip.shareId`.
- Disabled sections are **never written** into the snapshot, so a public reader
  cannot see hidden data even by inspecting the raw document.
- Traveller **email addresses and ids are never included** — only name, initials, colour.
- Itinerary activities expose title/time/notes only (no costs or ids).
- The snapshot is regenerated whenever the owner changes share settings, so it
  reflects the trip at the time settings were last saved.

### Privacy-safe defaults

When sharing is first enabled: **basic summary + itinerary** are visible.
Budget, expense breakdown, settlement, traveller list, and notes are **off** until
the owner explicitly turns them on. Enabling any financial section shows a
confirmation prompt and a persistent on-page warning.

### Routes

- `/trips/[tripId]/share` — owner-only share settings (enable/disable, copy link, regenerate, per-section visibility toggles).
- `/share/[shareId]` — public read-only page. No login required. Shows a polished trip summary; if the link is disabled or invalid it shows a "not available" page.

### Security rules

The `shares/{shareId}` rules allow public read **only when `enabled == true`**;
disabled shares are readable only by their owner, and only the owner (matching
`ownerId`) may create/update/delete. Deploy after pulling Phase 3:

```bash
firebase deploy --only firestore:rules
```

---

## Troubleshooting

### Google sign-in popup completes but user stays logged out

**Check in order:**

1. **Google provider not enabled** — Firebase Console → Authentication → Sign-in method → Google must be **Enabled** with a support email set.

2. **Domain not authorised** — Firebase Console → Authentication → Settings → Authorised domains. `localhost` must be listed for local dev. The error code is `auth/unauthorized-domain`; the app now shows a specific message for this.

3. **Browser popup blocked** — After the user selects their Google account, if the browser blocked a follow-up request you'll see `auth/popup-blocked`. The app now shows "Allow popups for this site." Check the browser's address bar for a blocked popup icon.

4. **Firebase project mismatch** — Confirm `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in `.env.local` matches the project where you enabled Google auth.

5. **Firestore profile write failing** — Open browser DevTools → Console (filter `[Voyago]`). A `[Voyago] Profile sync failed` log means `upsertUserProfile` threw. The user IS still signed in (auth state changed) but the Firestore write failed. Check Firestore rules are deployed (`firebase deploy --only firestore:rules`) and the `users/{uid}` rule allows the authenticated user to write.

6. **Check the exact Firebase error code** — All auth errors from Firebase are logged to the browser console in development as `[Voyago Auth] ...`. Open DevTools → Console while attempting sign-in to see the exact `auth/*` error code.

---

### `auth/configuration-not-found` or `auth/operation-not-allowed`

**Cause:** Firebase is configured correctly but Anonymous sign-in hasn't been
enabled in the Firebase Console.

**Fix:**
1. Firebase Console → your project → **Authentication → Sign-in method**
2. Click **Anonymous** → toggle **Enable** → Save
3. Refresh the page (no dev-server restart needed)

The app now catches this error gracefully and shows a setup banner with these
instructions instead of crashing.

---

### `localhost` not in Authorised domains

**Cause:** Firebase blocks sign-in requests from origins not in the allowlist.

**Fix:** Firebase Console → Authentication → **Settings** → Authorised domains →
confirm `localhost` is listed (it usually is by default; if not, add it).

---

### `Missing or insufficient permissions` (Firestore) / `storage/unauthorized`

**Cause:** Firestore/Storage are in production mode and the security rules in
this repo haven't been deployed yet, so every request is denied by default.

**Fix:** Deploy the rules — see [Deploy security rules](#deploy-security-rules-required)
above (`firebase deploy --only firestore:rules,storage`). If it still fails,
confirm you're signed in (anonymous auth enabled) — the rules require a
`request.auth` and trip membership.

---

### `FirebaseError: auth/invalid-api-key`

**Cause:** `NEXT_PUBLIC_FIREBASE_API_KEY` is missing, blank, or still set to
`your_api_key` in `.env.local`.

**Fix:** Copy your real Web API key from Firebase Console → Project settings →
your Web App → Config → `apiKey`. Paste it into `.env.local`, then restart the
dev server.

---

## AI provider & AI Budget Coach (Phase 5)

Voyago's AI features run through a **server-only** provider, so the
`ANTHROPIC_API_KEY` is never exposed to the browser. The first live feature is
the **AI Budget Coach**, which analyses a trip's budget, itinerary cost
estimates, and actual expenses and returns practical, India-first advice for
staying on budget.

### How it decides which provider to use

The resolver in `src/lib/ai/provider.ts` picks the provider from two env vars:

| `AI_PROVIDER` | `ANTHROPIC_API_KEY` | Result                                            |
| ------------- | ------------------- | ------------------------------------------------- |
| `mock`        | (any)               | Development **mock** — labelled, no key needed     |
| `anthropic`   | set                 | Real Anthropic Claude                              |
| `anthropic`   | missing             | Error at request time (mis-config)                 |
| unset / auto  | set                 | Real Anthropic Claude                              |
| unset / auto  | missing             | Development **mock**                               |

### Local testing (no key required)

The template sets `AI_PROVIDER=mock`, so the Budget Coach works out of the box
locally. In mock mode it returns **structured advice derived from your real trip
numbers** (health, risk, daily/per-head advice, warnings) — useful for testing —
but every response is flagged `isMock: true` and the UI shows a clear
**"Development mock response"** note. Mock output is never presented as real AI.

```bash
# .env.local — works with no real key
AI_PROVIDER=mock
ANTHROPIC_API_KEY=
```

### Enabling real AI for deployment

Add a real key in your deployment environment (Vercel/host project settings —
**not** committed to git) and either leave `AI_PROVIDER` unset (auto-detects the
key) or set it explicitly:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...        # server-only secret; never prefix with NEXT_PUBLIC
```

The Budget Coach calls `POST /api/ai/budget-coach` with a **privacy-safe**
payload built from existing trip data — aggregate numbers and traveller display
names only. It never sends emails, Firebase uids, auth tokens, expense ids,
payer ids, or free-text notes. AI advice is approximate guidance and should be
reviewed; it is not financial advice.

You can confirm which provider is active via `GET /api/ai/health` (reports
`provider`, `usingMockProvider`, and `aiKeyConfigured` without ever exposing the
key value).

---

## Google Maps planning (Phase 6)

Maps-powered planning adds Google **place search** (attach a real place, with
rating and price level, to an itinerary activity) and **route estimates**
(travel time + distance between a day's placed activities). It is **optional and
gated** — the app builds and runs fully without any Google key, falling back to
manual location entry.

### Two gates

A maps feature is active only when **both** are true:

1. The feature flag is on: `NEXT_PUBLIC_FLAG_MAP_FEATURES=true`
2. A Google Maps API key is configured (see below)

If the flag is off → the UI shows **Coming Soon**. If the flag is on but no key
is set → **Setup required**. Either way, manual itinerary planning keeps working.

### Keys & env vars

All Google calls happen in server API routes, so the key stays server-side:

| Var | Scope | Purpose |
| --- | ----- | ------- |
| `GOOGLE_MAPS_API_KEY` | **server-only** (recommended) | Place search + route estimates + route optimisation (Routes API) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | public (optional) | Renders the real Google Maps canvas on Route Playback (Phase 7E); the server also falls back to it for server calls if the server-only key is unset |

```bash
# .env.local — enable maps locally
NEXT_PUBLIC_FLAG_MAP_FEATURES=true
GOOGLE_MAPS_API_KEY=AIza...        # server-only; never returned to the client
```

### Required Google APIs

Enable these in Google Cloud Console for the project that owns the key:

- **Places API (New)** — text place search (`places:searchText`)
- **Routes API** — travel time/distance (`computeRoutes`); also used by the Route Optimiser (`/api/maps/route/optimise`)

(If you later add an interactive map, also enable the **Maps JavaScript API** and
use the public `NEXT_PUBLIC_` key for it.)

> **Legacy Distance Matrix API is no longer used.** Phase 7D migrated all route
> distance and duration calculations to the Google Routes API (`computeRoutes`).
> If you previously restricted your key to the Distance Matrix API, update the
> restriction to include the Routes API instead.

### Restricting the key

- **Server-only key** (`GOOGLE_MAPS_API_KEY`): restrict by **server IP address**
  (Application restrictions → IP addresses) and by **API** (Places API (New) +
  Routes API).
- **Public key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`): restrict by **HTTP
  referrer** (your domains) and by API. Never use the public key for server
  routes if you can avoid it.

### How it behaves

- **Place search** lives in the Add/Edit Activity form. With maps available you
  can search and attach a Google place; otherwise you type a location manually.
  Manual entry is always offered as a fallback link.
- **Route planning** is a separate section on the itinerary page. It is
  **user-triggered only** — press *Calculate route & time* per day. Nothing is
  auto-called, and route results are kept in memory (never written to Firestore).
- Only a small set of place fields (id, name, address, rating, ratings count,
  price level, lat/lng) is stored on an activity — never raw Google responses.
- The app never requests your browser location.
- `GET /api/maps/status` reports `{ featureEnabled, configured, available }`
  without ever revealing the key.

---

## Travel History & live tracking (Phase 7A)

Each trip has a **Travel History** page (`/trips/{tripId}/location`) for saving
location check-ins and an approximate route of where you went.

- **Check-ins** and **foreground live tracking** are **user-triggered only**.
  The browser location permission is requested **only** when you tap *Use current
  location* or *Start live tracking* — never on page load.
- Live tracking is **foreground-only**: it runs while the tab is open and active,
  and stops when you switch apps or close the tab. (Web apps cannot track in the
  background; that requires a native app.) Points are de-duplicated to ≥50 m of
  movement and ≥30 s between saves.
- Distances are computed locally with the **Haversine formula** (straight-line,
  ±0.5%) and clearly labelled *approx.* — they are not driving distances.
- Points are stored at `trips/{tripId}/locations` and are private to trip members.

---

## Photos & Trip Memories (Phase 7B)

Each trip has a **Memories** page (`/trips/{tripId}/memories`) for uploading
photos with rich metadata: title, description, day, tagged travellers, an
optional linked itinerary activity or saved check-in, a place name, and optional
GPS coordinates.

### Firebase Storage setup

Photo binaries are stored in **Firebase Cloud Storage**; the metadata lives in
Firestore at `trips/{tripId}/memories/{memoryId}`.

1. In the Firebase Console, enable **Cloud Storage** for your project (the
   default bucket is `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`).
2. Deploy the Storage rules (they ship in `storage.rules`):

   ```bash
   firebase deploy --only storage
   # or, to deploy both rule sets at once:
   firebase deploy --only firestore:rules,storage
   ```

No new environment variables are needed — uploads reuse the existing
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` config.

### Storage path strategy

```
trips/{tripId}/memories/{memoryId}/{sanitizedFileName}
```

Filenames are sanitised to `[a-zA-Z0-9._-]`. Accepted image types are JPEG, PNG,
WebP, and HEIC/HEIF (HEIC may upload without a browser preview), max **15 MB**.

### How it behaves

- **Uploads are user-triggered.** You explicitly pick a file; the app never reads
  your camera or filesystem automatically.
- **Location is optional and user-triggered.** GPS metadata is attached only when
  you tap *Use current location*, or when you link the memory to an existing
  Travel History check-in. The location permission is never requested on load.
- Memories are shown in a **day-grouped gallery** with a lightbox; you can delete
  your trip's memories. Deleting removes the Firestore doc first, then makes a
  best-effort delete of the Storage object.
- We persist only curated fields — no raw EXIF and no raw browser `File` objects.

### Privacy

- Memories are **private to trip members** (governed by `storage.rules` and
  `firestore.rules`). There is **no public access**.
- Memories are **not** included in the public share snapshot (Phase 3). Sharing
  photos publicly is intentionally left for a future, opt-in phase.

---

## Smart Route Optimiser (Phase 7D)

The Route Optimiser is built into the **Route Playback** page
(`/trips/{tripId}/playback`) and adds three new capabilities:

### Manual reorder

Every point in the timeline has up/down arrow buttons (visible when playback is
paused). Drag-free reordering works on any device. The SVG map and the
straight-line Haversine distance update immediately after each move.

### Google Routes API optimisation (user-triggered)

The **Optimise via Google Routes** button sends the day's points to
`POST /api/maps/route/optimise`, which:

1. Builds a Haversine pairwise distance matrix.
2. Runs a **nearest-neighbour greedy algorithm** (preserving the start point) to
   find a short visit order.
3. Calls `Google Routes API → computeRoutes` for the optimised sequence to get
   the exact road distance and estimated travel time.
4. Returns the optimised order (point IDs), Haversine approximations for both
   original and optimised orders, and the exact Routes API figures.

The button is disabled (labelled *setup required*) when Maps is not configured.
**No API call is made automatically** — it is always user-triggered.

### Route comparison

After optimisation the UI shows three rows:

| Row | Distance type |
| --- | ------------- |
| **Original order** | ≈ X km straight-line (Haversine) |
| **Your order** (after manual reorder) | ≈ Y km straight-line (Haversine) |
| **Optimised order** | ≈ Z km straight-line + exact road distance & time via Routes API |

The *Apply optimised order* button reshuffles the timeline; *Revert to original*
returns it to the source order.

### AI Route Coach

The **AI Route Coach** card below the selected-point detail runs **entirely
locally** (no API call, no key required). It analyses the current day's order
and distance and surfaces up to three rule-based hints:

- Backtracking detected (optimiser would save >25% straight-line distance)
- Heavy travel day (>4 hours estimated road time)
- Too many stops for a comfortable day
- Or a ✓ confirmation that the route is already near-optimal

### Billing control

The Route Optimiser makes exactly **one** Routes API call per user press of
*Optimise via Google Routes*. No calls happen on page load, on day change, or on
manual reorder. The endpoint is rate-limited to 10 requests per IP per minute.

---

## Real Google Maps canvas (Phase 7E)

Route Playback can render an **actual Google Maps canvas** with coloured markers
and the exact road route, on top of everything from Phases 7C/7D. It is fully
**optional** — without the browser key the page uses the SVG route fallback and
nothing breaks.

### Browser key required for the map

The map canvas is the **only** place the browser loads Google Maps, and it needs
the PUBLIC key:

```bash
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...   # browser key, restricted by referrer
```

- Enable the **Maps JavaScript API** for this key in Google Cloud Console.
- Restrict it by **HTTP referrer** (your website domains, e.g. `localhost:3000/*`
  and your production domain) and to the **Maps JavaScript API** only.
- Keep it **separate** from the server-only `GOOGLE_MAPS_API_KEY`, which is used
  for the Routes/Places API server calls and is never exposed to the browser.

The Maps JS SDK is loaded **lazily** — only on the Route Playback page, only in
the browser, only when the key is present, and only once (a singleton loader
guards against duplicate `<script>` injection). It is never loaded globally.

### What the map does

- **Markers** for every point — colour-coded by type (check-in, live tracking,
  activity, memory) and numbered in visit order. The map auto-fits bounds to all
  visible points for the selected day.
- **Two-way selection sync**: clicking a marker selects that timeline point (and
  opens an info window with its title, type, time, and place/note); clicking a
  timeline point highlights and pans to its marker.
- **Playback sync**: Play/Pause/Reset drive the active marker, which enlarges,
  bounces, and the map gently pans to it — without jarring zoom changes.
- **Exact road polyline**: after you run *Optimise via Google Routes* and apply
  the optimised order, the map draws the exact road route returned by the Routes
  API (decoded from its encoded polyline). A **“Google Maps · road route”** badge
  indicates this.
- **Approximate path**: before optimisation, or after a manual reorder that no
  longer matches the optimised order, the map draws a dashed straight-line path
  and shows **“Google Maps · approx. line”**. The road polyline returns once the
  displayed order matches a Routes API result again.

### Fallback behaviour

| Situation | What renders | Badge |
| --------- | ------------ | ----- |
| No browser key | SVG route (Phase 7C) | *Approximate SVG fallback* |
| Maps JS fails to load | SVG route (auto fallback) | *Approximate SVG fallback* |
| Key set, map loaded, optimised order applied | Google Map + road polyline | *Google Maps · road route* |
| Key set, map loaded, order not yet optimised | Google Map + dashed line | *Google Maps · approx. line* |

No raw Google API responses are stored — only the small encoded polyline string
needed to draw the route, decoded in memory on the client and never persisted.

---

## Route Playback (Phase 7C)

The **Route Playback** page (`/trips/{tripId}/playback`) merges all location-tagged
data from a trip into an animated, day-wise timeline:

| Source | What is used |
| ------ | ------------ |
| **Travel History** | All check-ins and foreground live-tracking points |
| **Itinerary activities** | Activities that have Google Maps place coordinates (Phase 6) |
| **Photo memories** | Memories with GPS metadata attached (Phase 7B) |

Points from all three sources are merged, sorted chronologically, and grouped by
day. Nothing new is persisted — the playback dataset is derived in-memory.

### What it does

- **Day tabs**: filter to any day that has location data; use the prev/next arrows
  or tap a tab.
- **SVG route map**: a north-up flat projection of the day's GPS points connected
  by a dashed line. No map tiles, no API key needed. The traveled segment turns
  teal as playback advances. The active point shows a CSS pulse ring.
- **Play / Pause / Resume / Reset**: animate through points at 1×, 2×, or 4×
  speed (cycle with the ⚡ button). Points are highlighted sequentially on both
  the map and the timeline.
- **Timeline**: a scrollable list of all points for the selected day; click any
  point to jump to it. The active item auto-scrolls into view during playback.
- **Selected-point detail card**: shows context — check-in label/note/accuracy,
  activity category/time/place, or memory thumbnail/place.
- **Stats**: total points, approximate distance (Haversine, ±0.5%), days tracked.
- **Empty state**: if there is no location data, explains the three ways to add
  location data and links to each feature.

### Map rendering

The Phase 7C implementation uses a pure SVG flat projection — **no Google Maps
JavaScript SDK, no map tiles, no additional API key**. It works in every
environment and remains the automatic fallback. Phase 7E adds an **optional**
real Google Maps canvas on top (see *Real Google Maps canvas* above); when the
browser key is absent or the SDK fails to load, the page falls back to this SVG
renderer without any change to the playback data model.

### Privacy

Route playback data is **private to trip members** and is **not included** in
public share snapshots. Background tracking is not implemented — all location
data originates from user-triggered check-ins, foreground tracking, activity
place search, or memory uploads.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the local dev server           |
| `npm run build` | Production build                     |
| `npm run start` | Run the production build locally     |
| `npm run lint`  | Lint the codebase                    |
