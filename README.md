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
