'use client'

import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from './firebase'

export type AuthError =
  | 'email-already-in-use'
  | 'credential-already-in-use'
  | 'invalid-credentials'
  | 'weak-password'
  | 'popup-closed'
  | 'network-error'
  | 'unknown'

export interface AuthResult {
  success: boolean
  /** true when an anonymous account was linked — uid is preserved, no migration needed. */
  linked: boolean
  error?: AuthError
  errorMessage?: string
}

function mapError(code: string | undefined): Pick<AuthResult, 'error' | 'errorMessage'> {
  switch (code) {
    case 'auth/email-already-in-use':
      return { error: 'email-already-in-use', errorMessage: 'This email is already registered. Sign in instead.' }
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return { error: 'credential-already-in-use', errorMessage: 'This Google account is already registered. Signing you in…' }
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
      return { error: 'invalid-credentials', errorMessage: 'Incorrect email or password. Please try again.' }
    case 'auth/user-not-found':
      return { error: 'invalid-credentials', errorMessage: 'No account found with this email.' }
    case 'auth/weak-password':
      return { error: 'weak-password', errorMessage: 'Password must be at least 6 characters.' }
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { error: 'popup-closed', errorMessage: 'Sign-in popup was closed. Please try again.' }
    case 'auth/popup-blocked':
      return {
        error: 'popup-closed',
        errorMessage: 'Sign-in popup was blocked by your browser. Allow popups for this site and try again.',
      }
    case 'auth/network-request-failed':
      return { error: 'network-error', errorMessage: 'Network error. Please check your connection and try again.' }
    case 'auth/operation-not-allowed':
      return {
        error: 'unknown',
        errorMessage:
          'Google sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method → Google.',
      }
    case 'auth/unauthorized-domain':
      return {
        error: 'unknown',
        errorMessage:
          'This domain is not authorised for sign-in. Add it in Firebase Console → Authentication → Settings → Authorised domains.',
      }
    default:
      return { error: 'unknown', errorMessage: 'Something went wrong. Please try again.' }
  }
}

function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Voyago Auth]', ...args)
  }
}

/**
 * Sign in with Google.
 *
 * Flow for anonymous users (preserves uid when possible):
 *   1. Try linkWithPopup — if the Google account is new, uid is preserved and
 *      all existing trips stay accessible without any migration.
 *   2. If linking fails with credential-already-in-use, extract the Google
 *      credential from the error and call signInWithCredential — no second
 *      popup is needed, avoiding browser popup-blocker issues.
 *   3. For any other non-popup-close error, fall through to signInWithPopup.
 *
 * For already-signed-in (non-anonymous) users, goes straight to signInWithPopup.
 */
export async function signInWithGoogle(currentUser: User | null): Promise<AuthResult> {
  const provider = new GoogleAuthProvider()

  if (currentUser?.isAnonymous) {
    try {
      await linkWithPopup(currentUser, provider)
      return { success: true, linked: true }
    } catch (linkErr: unknown) {
      const code = (linkErr as { code?: string }).code

      // User dismissed the popup — stop here, don't try a second popup
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-blocked'
      ) {
        return { success: false, linked: false, ...mapError(code) }
      }

      // The Google account already belongs to an existing Firebase account.
      // Use the credential returned in the error — avoids opening a second popup,
      // which browsers often block immediately after the first one closes.
      if (
        code === 'auth/credential-already-in-use' ||
        code === 'auth/account-exists-with-different-credential'
      ) {
        const credential = GoogleAuthProvider.credentialFromError(linkErr as FirebaseError)
        if (credential) {
          try {
            await signInWithCredential(auth, credential)
            return { success: true, linked: false }
          } catch (signInErr: unknown) {
            const signInCode = (signInErr as { code?: string }).code
            devLog('signInWithCredential failed:', signInCode, signInErr)
            return { success: false, linked: false, ...mapError(signInCode) }
          }
        }
        // credentialFromError returned null — fall through to popup-based sign-in
      }

      devLog('linkWithPopup error (falling through to signInWithPopup):', code, linkErr)
    }
  }

  // Non-anonymous user, or fallback from linking failure without a usable credential
  try {
    await signInWithPopup(auth, provider)
    return { success: true, linked: false }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    devLog('signInWithPopup error:', code, err)
    return { success: false, linked: false, ...mapError(code) }
  }
}

/**
 * Create a new account with email + password.
 * If the current session is anonymous, attempts to link the credential so the
 * uid is preserved. Returns email-already-in-use if the email is taken.
 */
export async function signUpWithEmail(
  currentUser: User | null,
  name: string,
  email: string,
  password: string
): Promise<AuthResult> {
  const credential = EmailAuthProvider.credential(email, password)

  if (currentUser?.isAnonymous) {
    try {
      const result = await linkWithCredential(currentUser, credential)
      await updateProfile(result.user, { displayName: name })
      return { success: true, linked: true }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      devLog('linkWithCredential (email) error:', code, err)
      return { success: false, linked: false, ...mapError(code) }
    }
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName: name })
    return { success: true, linked: false }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    devLog('createUserWithEmailAndPassword error:', code, err)
    return { success: false, linked: false, ...mapError(code) }
  }
}

/** Sign in with existing email + password. */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { success: true, linked: false }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    devLog('signInWithEmailAndPassword error:', code, err)
    return { success: false, linked: false, ...mapError(code) }
  }
}

/** Sign out the current Firebase user. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}
