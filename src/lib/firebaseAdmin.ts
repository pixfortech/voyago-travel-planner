/**
 * Firebase Admin initialisation — Phase 0 foundation (structure only).
 *
 * The Admin SDK runs server-side only and is used to verify Firebase ID tokens
 * on protected API routes (wired up from Phase 2 onward). It initialises lazily
 * from server-only env vars, so importing this module never throws and the app
 * builds fine without credentials configured.
 */

import 'server-only'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null

/** Whether the server has the credentials needed to initialise Firebase Admin. */
export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  )
}

/** Lazily initialise (or reuse) the Firebase Admin app. Throws if unconfigured. */
export function getAdminApp(): App {
  if (app) return app
  const existing = getApps()
  if (existing.length) {
    app = existing[0]!
    return app
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  // Private keys are commonly stored with literal "\n" — normalise to newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin is not configured. Set FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.',
    )
  }

  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  return app
}

/** Verify a Firebase ID token and return its decoded claims. */
export async function verifyIdToken(idToken: string) {
  return getAuth(getAdminApp()).verifyIdToken(idToken)
}

/** Server-side Firestore handle (Admin SDK). Throws if Admin is unconfigured. */
export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp())
}
