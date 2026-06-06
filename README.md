# Voyago Travel Planner

A mobile-first travel planner — build day-by-day itineraries, track your budget,
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
> missing values or still contains placeholders, you'll get a clear error
> telling you exactly which variables to fix — instead of a confusing
> `auth/invalid-api-key` from the Firebase SDK.

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

Create your local env file from the template, then copy each value from the
Firebase config object into the matching variable:

```bash
cp .env.local.example .env.local
```

| Firebase config field | `.env.local` variable                     |
| --------------------- | ----------------------------------------- |
| `apiKey`              | `NEXT_PUBLIC_FIREBASE_API_KEY`            |
| `authDomain`          | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`        |
| `projectId`           | `NEXT_PUBLIC_FIREBASE_PROJECT_ID`         |
| `storageBucket`       | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`     |
| `messagingSenderId`   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`|
| `appId`               | `NEXT_PUBLIC_FIREBASE_APP_ID`             |

The template already fills in the public identifiers for
`voyago-travel-planner-ai`. The only value you must supply yourself is your
**`apiKey`** (your real Web API key).

> **Restart required:** Next.js reads `.env.local` at startup and inlines
> `NEXT_PUBLIC_*` values at build time. After editing `.env.local`, **stop and
> restart `npm run dev`** for changes to take effect.

> **Never commit `.env.local`.** It's already listed in `.gitignore`. Keep your
> real API key out of Git.

### 3. Enable the Firebase services used for local testing

In the Firebase Console, enable these for your project:

- **Authentication** → Sign-in method:
  - **Anonymous** (used today for instant, account-less sessions)
  - **Email/Password** (for the upcoming accounts feature)
  - **Google** (for the upcoming accounts feature)
- **Firestore Database** — create a database (start in test mode for local dev,
  or apply the rules in `firestore.rules`).
- **Storage** — enable Cloud Storage (rules staged in `storage.rules`).

> **Firebase Hosting is optional** and **not required** for local testing —
> `npm run dev` runs the app locally without it.

## AI provider (optional for local dev)

Voyago's AI features run through a server-only provider. For local development
the template sets `AI_PROVIDER=mock`, which uses a clearly-labelled mock and
needs no API key — so nothing breaks. Add a real `ANTHROPIC_API_KEY` in your
deployment environment when AI generation ships.

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the local dev server           |
| `npm run build` | Production build                     |
| `npm run start` | Run the production build locally     |
| `npm run lint`  | Lint the codebase                    |
