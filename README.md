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
| **Authentication → Sign-in method** | **Anonymous** (required), Email/Password (future), Google (future) |
| **Authentication → Settings → Authorised domains** | Confirm `localhost` is listed |
| **Firestore Database** | Create a database (test mode for local dev, or apply `firestore.rules`) |
| **Storage** | Enable Cloud Storage (`storage.rules` is staged and ready) |

> **Firebase Hosting is optional** and not required for local testing.

---

## Troubleshooting

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

### `FirebaseError: auth/invalid-api-key`

**Cause:** `NEXT_PUBLIC_FIREBASE_API_KEY` is missing, blank, or still set to
`your_api_key` in `.env.local`.

**Fix:** Copy your real Web API key from Firebase Console → Project settings →
your Web App → Config → `apiKey`. Paste it into `.env.local`, then restart the
dev server.

---

## AI provider (optional for local dev)

Voyago's AI features run through a server-only provider. The template sets
`AI_PROVIDER=mock` so nothing breaks locally — the app uses a clearly-labelled
mock response. Add a real `ANTHROPIC_API_KEY` in the deployment environment when
AI generation ships.

---

## Google Maps (future)

Google Maps integration is planned for a future phase (gated behind the
`NEXT_PUBLIC_FLAG_MAP_FEATURES` feature flag). Planned features:

- Place search via Google Places API
- Ratings, review counts, price level, opening hours
- Travel time and distance between itinerary stops
- Day-wise route optimisation
- Interactive trip map

When the integration ships, you will need a `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
with the **Maps JavaScript API**, **Places API**, and **Directions API** enabled
in Google Cloud Console. The key is not needed today.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the local dev server           |
| `npm run build` | Production build                     |
| `npm run start` | Run the production build locally     |
| `npm run lint`  | Lint the codebase                    |
