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
- **Routes API** — travel time/distance (`computeRoutes`) **and** the road-cost
  matrix used by the Route Optimiser (`computeRouteMatrix`, `/api/maps/route/optimise`)

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

### Road-aware optimisation (user-triggered)

The **Optimise via Google Routes** button sends the day's points to
`POST /api/maps/route/optimise`, which orders stops by **real road cost** — not
straight-line distance:

1. Builds a **traffic-aware road-cost matrix** with the Google Routes API
   **Compute Route Matrix** (`distanceMatrix/v2:computeRouteMatrix`). Each cell is
   the actual driving distance/time between two stops, using `TRAFFIC_AWARE`
   (live current traffic) for driving — so one-way roads, terrain and mountain
   switchbacks are respected.
2. Solves the visit order with a **TSP heuristic** (nearest-neighbour
   construction + **2-opt** local search) on the metric the chosen mode asks for:
   - **Fastest** → minimise road **duration** (live traffic)
   - **Shortest** → minimise road **distance**
   - **Balanced** → minimise a normalised blend of both
3. Pins the endpoints as requested — **Keep first fixed** (default on, your
   chosen day-start) and **Keep last fixed** (optional, e.g. return to hotel).
4. Calls `Google Routes API → computeRoutes` once for the optimised order to get
   the exact road distance, travel time and the drawable road polyline.

> **Why not straight-line nearest-neighbour?** Haversine ignores the actual road
> network. In hilly/curved-road places (e.g. Gangtok) two stops that are close
> as the crow flies can be far apart by road, producing a zig-zag order. Ordering
> by the real road-cost matrix follows the practical drive sequence instead.
> Haversine is kept **only** as a fallback when the road matrix is unavailable
> (no key, transit mode, or a transient API failure) — clearly labelled in the
> result (`optimisationMethod: 'haversine_fallback'`).

The button needs **at least 3 stops** and is disabled (labelled *setup required*)
when Maps is not configured. **No API call is made automatically** — it is always
user-triggered.

### Route comparison

After optimisation the UI shows a real before/after:

| Row | What it shows |
| --- | ------------- |
| **Original order** | ≈ X km straight-line (Haversine, instant) |
| **Your order** (after manual reorder) | ≈ Y km straight-line (Haversine, instant) |
| **Original road route** | exact road distance + time for the source order |
| **Optimised road route** | exact road distance + time for the optimised order |
| **You save** | road distance saved + time saved vs the original order |

A method badge shows whether the order is *real road* or a *straight-line
estimate*, the active mode, and a *live traffic* badge when traffic was used.

Optimisation is **never applied automatically**. The suggested order is shown as
a numbered **preview**; only the *Apply optimised order* button reshuffles the
timeline and map (marker numbers always match the timeline). *Revert to original*
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

Each press of *Optimise via Google Routes* makes at most **two** Routes API
calls: one **Compute Route Matrix** (for the road-cost ordering) and one
**Compute Routes** (for the optimised polyline + exact totals). Both use tight
field masks to request only the fields used. No calls happen on page load, on day
change, or on manual reorder — straight-line figures update locally. The endpoint
is rate-limited to 10 requests per IP per minute.

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

## Tasks, Polls & Voting (Phase 12)

Trip members can organise responsibilities and make group decisions from a
dedicated **Tasks & Polls** page at `/trips/[tripId]/planning` (also reachable
from the Overview Explore grid, Quick Actions, and the desktop "Tasks" tab).

**Tasks**

- Create tasks with title, description, priority (low/medium/high/urgent),
  category (booking, payment, packing, documents, transport, food, shopping,
  route, memories, general), optional due date, and an optional link to an
  itinerary activity.
- Assign a task to any trip member; change status (to do, in progress, done,
  cancelled) and priority inline.
- Summary cards show total, pending, in progress, done, and overdue counts.
- Filters: all, assigned to me, pending, completed, high priority.
- Field edits are limited in the UI to the task creator, current assignee, or
  the trip owner.

**Polls & voting**

- Create polls (place, activity, restaurant, hotel, route, budget, date/time,
  general) with two or more options; members can add more options while the
  poll is open.
- Single-vote by default, with an optional "allow multiple votes" mode.
- Live vote counts, percentage bars, and a "who voted" breakdown visible to
  trip members only (voter uids are resolved to member names; **no emails are
  stored**).
- The poll creator or trip owner can close, reopen, or **finalise** a poll on a
  winning option, which is clearly marked. Finalising never modifies the
  itinerary or route automatically.

**Notifications** — when a task is assigned to another member, an in-app
notification is created (existing bell model, no push/email). Users are never
notified about assigning a task to themselves.

**Privacy** — tasks, polls, and votes are stored under `trips/{tripId}/tasks`
and `trips/{tripId}/polls`, are readable/writable only by trip members (existing
`isTripMember` rule), and are **never** included in public share snapshots.

If you changed `firestore.rules`, redeploy them:

```
firebase deploy --only firestore:rules
```

(No new rules were required for Phase 12 — the existing trip-member wildcard
rule already covers the `tasks` and `polls` subcollections.)

---

## Restaurant / Café Intelligence (Phase 14)

Food activities in the **Itinerary** carry an optional **Food Intelligence**
card (tap the fork icon on any food/restaurant activity). It runs only when you
ask — analysis is never automatic.

- Input is privacy-safe place **metadata** (name, address, rating, rating count,
  price level, type) plus trip/budget context. Reviews and menus are **never
  scraped**; the review summary is explicitly based on rating metadata, not
  review text.
- Returns a premium decision card: vibe summary, budget fit, an **approximate**
  per-person cost range, suitable group type, ordering strategy, spend-control
  advice, generic dish ideas, and caveats — all clearly labelled **Approximate**
  with a confidence badge.
- Recommended dishes stay **generic** unless you supply a real menu/dish list.
- You can **save** an insight onto the activity; it is stored as
  `activity.foodInsight` and never exposed on public share pages.
- Endpoint: `POST /api/ai/food-place-insight`. Uses the shared Anthropic
  provider; when `ANTHROPIC_API_KEY` is missing it falls back to a clearly
  labelled **development mock**.

## Bill Upload & Spend Analysis (Phase 14)

From the **Budget** tab, expand any expense and tap **Attach Bill**:

1. **Upload** a receipt image/PDF (JPEG/PNG/WebP/PDF, max 10 MB) to Firebase
   Storage under `trips/{tripId}/bills/{expenseId}/{file}` — **private to trip
   members**, governed by the existing storage rules.
2. **Enter bill details** manually (vendor, date, total, tax, service charge,
   line items, notes). **Automatic image reading (OCR/vision) is Coming Soon**;
   manual entry is the primary, always-available path.
3. **Analyse** — `POST /api/ai/bill-analysis` returns a structured **AI Draft**
   (detected vendor/date/total/tax/items, suggested category and vendor type,
   per-person split, confidence, warnings). Mock fallback when no API key.
4. **Review & confirm** — detected values are shown **side-by-side** with
   editable confirmed values. The expense **amount is never overwritten
   silently**: the confirmed amount defaults to the existing amount, with an
   explicit "use detected total" shortcut. Nothing is saved until you press
   **Confirm & Save**, after which settlement recalculates from the confirmed
   figures.

**AI limitations** — all AI output is an **approximate draft**. The bill
endpoint analyses only the fields you typed (it does not read the image), and is
instructed to ignore/redact any card numbers, phone numbers, or sensitive
payment data. No expense is ever created or updated without your confirmation,
and no payment systems are connected.

**Privacy** — bill images and extracted fields are private to trip members,
stored on the expense document (`billImageUrl`, `billStoragePath`,
`billExtracted*`, `billConfidence`, …) and on Storage. They are **never**
included in public share snapshots, and deleting an expense best-effort removes
its attached bill image from Storage.

**Reports** — the Budget Report and Full Trip Recap now include a **Food & Café
Spend** section: total food spend, food per person, average per meal, highest
bill, food-expense count, bills-attached count, plus food spend broken down by
vendor and by location. CSV export adds bill-attached / bill-vendor / bill-total
/ bill-confidence columns.

**Environment keys**

| Key                 | Purpose                                                        |
| ------------------- | ------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Real AI for Food Intelligence & Bill Analysis (mock if unset) |
| `GOOGLE_MAPS_API_KEY` (server) | Place metadata used by Food Intelligence (manual entry works without it) |

(No new Firestore or Storage rules were required for Phase 14 — the existing
trip-member wildcards already cover bill subpaths and the new optional fields on
existing documents.)

---

## Smart Visited Places Tracker + Gap Planner (Phase 15A)

Voyago becomes a **live, adaptive trip assistant**. Instead of only planning
before you travel, it compares your saved location data against your itinerary to
estimate what you've already covered, then helps you plan the rest of the trip.

Open it from the trip overview → **Smart Planner** (`/trips/[tripId]/smart-planner`).

### Visited place detection (approximate, user-confirmed)

Detection reuses data you've already saved — it never starts new tracking:

- **Travel History** check-ins and **foreground live-tracking** points
- GPS attached to **photo memories**
- Itinerary **activity coordinates** (lat/lng from Google Places)

Each planned place with coordinates is compared to those signals with a
[haversine](https://en.wikipedia.org/wiki/Haversine_formula) distance check. If a
signal falls within a configurable radius (**100–250 m**, default **150 m**,
widened by GPS accuracy when available) the place is flagged **Likely visited**
with a **high / medium / low** confidence.

Detection is **approximate and never auto-confirms**. A place only becomes
*Confirmed visited* when you tap to confirm. A stored status always wins over
live detection, and you can override or reset any place by hand. Itinerary
activity cards show subtle badges: **Likely visited**, **Visited**, **Skipped**.

### Current-location check (user-triggered only)

The **Use current location** button is the *only* thing that requests location
permission — there is **no automatic prompt on load and no background tracking**
(a web-app constraint we lean into). When you run it, Voyago lists the nearest
planned places, lets you **mark a place visited** ("I'm here"), and lets you
**save the spot as a check-in**. Clearing it forgets the location locally.

### Gap analysis

The planner shows, at a glance:

- Itinerary **completion %** (confirmed + likely + skipped ÷ total planned)
- Places **visited / remaining / skipped**, plus **unplanned places visited**
- **Days remaining** in the trip and **budget remaining** (when set)
- **Distance already travelled** (from Travel History points)
- **Next best places** — remaining stops, ordered by nearness to your current
  location when you've provided it, otherwise by itinerary order

### AI Gap Planner (preview → edit → apply)

`POST /api/ai/itinerary-gap-planner` returns a **preview only** — it never writes
to Firestore. Choose a planning mode:

- **Complete remaining** · **Today only** · **Tomorrow only** · **Next few hours**
  · **Fill free time** · **Replace missed places**

plus a pace (relaxed / balanced / packed), an optional "allow revisits" toggle
and free-text constraints. The AI proposes timing, estimated (approximate) costs,
a sensible travel order and food/rest breaks, avoiding places you've already
visited unless you allow revisits. If a current location is provided it's used as
the start point; otherwise your last check-in / hotel / itinerary order is used.

You then **edit or remove** any proposed activity before applying. **Apply**:

- asks for explicit confirmation first,
- **only adds** new activities to **today and future days**,
- **protects past/completed days** (they're skipped),
- **never deletes or overwrites** your existing itinerary.

If `ANTHROPIC_API_KEY` is missing the endpoint returns a clearly-labelled
**Development Mock** plan so the flow always works. Google Routes is used only
when you explicitly run a route-aware action; with no Maps key the planner falls
back to itinerary-order suggestions.

### Privacy

- Visited/location data is **private to trip members** and is **never** written
  to the public share snapshot (the share builder copies only an explicit safe
  subset of itinerary fields — visited fields are not among them).
- Reports include a **Itinerary Progress** section (completion %, visited count,
  skipped, unplanned-visited, distance) but **never print precise coordinates**.
- The AI only ever receives the place/route data needed for the chosen plan, and
  only receives your current location when you explicitly run the planner with it.

No new Firestore or Storage rules were required — the new fields are optional and
live on existing trip-member documents.

---

## AI Trip Generator + Auto-Fill Itinerary (Phase 15C)

Generates a complete, day-by-day itinerary for an **existing trip** from its
destination, dates, budget, traveller composition and preferences. Open it from
the **trip overview → AI Trip Generator** (`/trips/[tripId]/ai-generator`), from
the **dashboard banner**, or via the note shown when creating a trip.

> Generating a brand-new trip from scratch (before it exists) is intentionally
> left as **Coming Soon** — create the trip first, then auto-fill it here. This
> keeps the create-trip flow untouched and the generation surface safe.

### Guided wizard

A 5-step wizard collects, with INR defaults:

1. **Basics** — destination, the trip's dates/day count (read-only), and the
   merge mode (see below).
2. **Travellers** — total plus group counts (couples, adults, kids, seniors,
   friends) and group flags (family / office / pilgrimage) and free-text notes
   such as _"two seniors, avoid stairs, prefer vegetarian"_. No per-person
   personal data is required.
3. **Preferences** — pace (relaxed/balanced/packed), interests, food
   preferences, allergy/avoid list (treated as a **constraint, never a safety
   guarantee**), accommodation style, route preference and constraint toggles.
4. **Budget** — total budget in the trip currency (0 = no target).
5. **Must-visit / avoid** — comma-separated lists plus extra notes.

### AI endpoint

`POST /api/ai/trip-generator` takes a **privacy-safe** `TripGeneratorInput`
(destination, dates, composition, preferences, budget, mode, and a compact
summary of existing days). It sends **no emails, UIDs, tokens, GPS history,
comments, bills or memories**. It uses the shared AI provider on the
`generation` tier (Claude Opus) and returns structured JSON only:

- `tripSummary`, `assumptions`, `confidence`
- `dayPlans[]` — each with `theme`, `estimatedDayCost`, `mealPlan`,
  `restBreaks`, and `activities[]`
- each activity: `title`, `description`, `category`, `startTime`/`endTime`,
  `estimatedCost` (+ per-person), `locationName`, `suggestedPlaceSearchQuery`,
  `priority`, `timeToSpend`, `routeNotes`, `whyRecommended`, `foodInsightNotes`
- `budgetSummary` (total, per-head, remaining buffer, high-cost risks,
  within-budget), `comfortSummary` (walking intensity, elderly/kid suitability,
  pace risk), `routeSummary` (ordering logic, backtracking risk), `warnings`

**Development Mock vs Anthropic.** With no `ANTHROPIC_API_KEY` the existing mock
provider returns a deterministic plan whose summary is prefixed `[DEV MOCK]` and
which is clearly badged **Development Mock** in the preview. With a key set, real
Opus generation is used. Either way the output is labelled approximate.

### Preview → edit → apply (nothing auto-saved)

The generated plan is shown as a fully editable preview:

- Edit each activity's time, title, cost, category, location, and move it to
  another day; remove/restore activities.
- **Enrich with Google Places** (user-triggered) — looks up each
  `suggestedPlaceSearchQuery`, attaches `placeId`/rating/lat-lng, and refines the
  category from Google place types. Optional, bounded (max 24 lookups/run), and
  **skipped gracefully** when no Google key is configured.
- **Optimise route for this plan** (user-triggered) — sends enriched stops to the
  existing road-aware optimiser, shows before/after distance and time, and only
  reorders the preview when you click **Apply optimised order**.
- **Regenerate** the whole plan, or **Discard**.

**Apply** writes only after a confirmation dialog summarising exactly what will
be added/replaced and what is skipped. Merge modes:

| Mode | Behaviour |
| ---- | --------- |
| `append` | Adds generated activities; nothing existing is removed. |
| `fill_empty` | Writes only to days that currently have **no** activities. |
| `replace_future` | Clears + replaces days **strictly after today**. |
| `replace_all_unprotected` | Clears + replaces **today and future** days. |

In every mode, **completed and past days are protected** and **confirmed-visited
/ completed activities are preserved** even when a day is "replaced". Generated
activities are saved with `bookingStatus: 'planned'`, an `(AI Trip Generator)`
note for traceability, and their estimated costs flow into the itinerary's
estimated total (so the **AI Budget Coach** can analyse the applied plan).
Generated costs are **planned estimates, not actual expenses**. After applying,
you're redirected to the itinerary page.

### Privacy & safety

- The plan is **never** auto-applied; all Google/Anthropic calls are
  user-triggered. No keys reach the browser (server key for Places/Routes,
  `NEXT_PUBLIC_…` only for the map canvas elsewhere).
- Allergy/avoid preferences are constraints only — Voyago makes **no medical,
  financial or food-safety guarantees**.
- Generation works fully **without** Google keys; enrichment/optimise simply
  show as unavailable.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the local dev server           |
| `npm run build` | Production build                     |
| `npm run start` | Run the production build locally     |
| `npm run lint`  | Lint the codebase                    |
