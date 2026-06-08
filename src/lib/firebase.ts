'use client'

import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

/**
 * Firebase Web SDK configuration.
 *
 * All values come from NEXT_PUBLIC_FIREBASE_* environment variables, which
 * Next.js inlines at build time. They must be referenced statically (not via
 * process.env[dynamicKey]) for that inlining to work, so each field is read
 * explicitly below.
 *
 * Real values live only in a local, git-ignored `.env.local` (see
 * `.env.local.example` and the Firebase section of the README). If any value
 * is missing or still a placeholder, we throw a clear, actionable error here
 * rather than letting the SDK fail later with a confusing
 * `auth/invalid-api-key`.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
} as const

// Maps each config field back to the env var name a developer must set, so the
// error message can name the exact variable(s) that need fixing.
const ENV_VAR_NAMES: Record<keyof typeof firebaseConfig, string> = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
}

// A value is invalid if it is missing, blank, or still one of the placeholder
// values shipped in `.env.local.example`.
function isPlaceholder(value: string | undefined): boolean {
  if (!value || !value.trim()) return true
  const v = value.trim()
  return v.startsWith('your_') || v === 'your_project.firebaseapp.com'
}

function validateFirebaseConfig() {
  const missing = (Object.keys(ENV_VAR_NAMES) as (keyof typeof firebaseConfig)[])
    .filter((key) => isPlaceholder(firebaseConfig[key]))
    .map((key) => ENV_VAR_NAMES[key])

  if (missing.length > 0) {
    throw new Error(
      [
        'Firebase is not configured. The following environment variable(s) are missing or still set to a placeholder:',
        ...missing.map((name) => `  • ${name}`),
        '',
        'To fix this:',
        '  1. Copy .env.local.example to .env.local',
        '  2. Open your Firebase Console → Project settings → your Web App, and copy the',
        '     config values (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)',
        '     into the matching NEXT_PUBLIC_FIREBASE_* variables in .env.local',
        '  3. Restart the dev server (stop and re-run `npm run dev`)',
        '',
        'See the "Firebase setup" section of README.md for full instructions.',
      ].join('\n')
    )
  }
}

validateFirebaseConfig()

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
// Firebase Storage — used for trip photo memories (Phase 7B). Uploads/downloads
// are governed by storage.rules (trip-member access only; no public access).
export const storage = getStorage(app)
export default app
