'use client'

import {
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
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
      return { error: 'credential-already-in-use', errorMessage: 'This Google account is already linked to another Voyago account.' }
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
    case 'auth/network-request-failed':
      return { error: 'network-error', errorMessage: 'Network error. Please check your connection.' }
    default:
      return { error: 'unknown', errorMessage: 'Something went wrong. Please try again.' }
  }
}

/**
 * Sign in with Google.
 * If the current session is anonymous, attempt to link first so the uid is
 * preserved and all existing trips remain accessible without any migration.
 * Falls back to a fresh Google sign-in when the credential is already used.
 */
export async function signInWithGoogle(currentUser: User | null): Promise<AuthResult> {
  const provider = new GoogleAuthProvider()

  if (currentUser?.isAnonymous) {
    try {
      await linkWithPopup(currentUser, provider)
      return { success: true, linked: true }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { success: false, linked: false, ...mapError(code) }
      }
      // credential-already-in-use or anything else → fall through to direct sign-in
    }
  }

  try {
    await signInWithPopup(auth, provider)
    return { success: true, linked: false }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    return { success: false, linked: false, ...mapError(code) }
  }
}

/**
 * Create a new account with email + password.
 * If the current session is anonymous, attempts to link the credential so the
 * uid is preserved. If linking fails because the email is already registered,
 * returns an error directing the user to sign in instead.
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
      if (code !== 'auth/email-already-in-use' && code !== 'auth/credential-already-in-use') {
        return { success: false, linked: false, ...mapError(code) }
      }
      return { success: false, linked: false, ...mapError(code) }
    }
  }

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName: name })
    return { success: true, linked: false }
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
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
    return { success: false, linked: false, ...mapError(code) }
  }
}

/** Sign out the current Firebase user. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}
