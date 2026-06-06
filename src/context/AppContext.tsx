'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUserProfile, saveUserProfile, upsertUserProfile } from '@/lib/firestore'
import {
  signInWithGoogle as authSignInGoogle,
  signUpWithEmail as authSignUpEmail,
  signInWithEmail as authSignInEmail,
  signOut as authSignOut,
  type AuthResult,
} from '@/lib/auth'
import type { UserProfile } from '@/types'

export type AuthSetupError = 'anonymous-not-enabled' | 'unknown'

interface AppContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  authSetupError: AuthSetupError | null
  isAnonymous: boolean
  signInWithGoogle: () => Promise<AuthResult>
  signUpWithEmail: (name: string, email: string, password: string) => Promise<AuthResult>
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  saveProfile: (name: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authSetupError, setAuthSetupError] = useState<AuthSetupError | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        try {
          if (!firebaseUser.isAnonymous) {
            // Real user (Google or email) — sync Firestore profile with latest identity data
            const p = await upsertUserProfile(firebaseUser)
            setProfile(p)
          } else {
            // Anonymous guest — load any previously saved profile (e.g. display name)
            const p = await getUserProfile(firebaseUser.uid)
            setProfile(p)
          }
        } catch (err) {
          // Firestore write/read failed (rules, network, etc.).
          // Still mark the user as signed-in using Firebase Auth data so the UI
          // correctly reflects their identity even without a Firestore profile.
          if (!firebaseUser.isAnonymous) {
            setProfile({
              id: firebaseUser.uid,
              name: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Traveller',
              color: '#14b8a6',
              email: firebaseUser.email ?? undefined,
              photoURL: firebaseUser.photoURL,
              providerId: firebaseUser.providerData[0]?.providerId,
              createdAt: new Date().toISOString(),
            })
          }
          if (process.env.NODE_ENV !== 'production') {
            console.error('[Voyago] Profile sync failed — using Firebase Auth data as fallback:', err)
          }
        } finally {
          setLoading(false)
        }
      } else {
        // No user — sign in anonymously so every visitor gets a persistent session
        try {
          await signInAnonymously(auth)
          // onAuthStateChanged fires again with the new anonymous user
        } catch (err: unknown) {
          const code = (err as { code?: string }).code
          setAuthSetupError(
            code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed'
              ? 'anonymous-not-enabled'
              : 'unknown'
          )
          setLoading(false)
        }
      }
    })
    return unsub
  }, [])

  async function signInWithGoogle(): Promise<AuthResult> {
    return authSignInGoogle(user)
  }

  async function signUpWithEmail(name: string, email: string, password: string): Promise<AuthResult> {
    const result = await authSignUpEmail(user, name, email, password)
    if (result.success) {
      // Sync profile immediately with the known name, handling the race where
      // onAuthStateChanged may fire before updateProfile completes inside auth.ts.
      const cu = auth.currentUser
      if (cu && !cu.isAnonymous) {
        const p = await upsertUserProfile(cu, name)
        setProfile(p)
        setUser(cu)
      }
    }
    return result
  }

  async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
    return authSignInEmail(email, password)
    // onAuthStateChanged fires after sign-in and handles profile sync
  }

  async function signOut(): Promise<void> {
    setProfile(null)
    await authSignOut()
    // onAuthStateChanged fires → signInAnonymously → new anonymous session starts
  }

  async function saveProfile(name: string): Promise<void> {
    if (!user) return
    const p = await saveUserProfile(user.uid, name)
    setProfile(p)
  }

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        loading,
        authSetupError,
        isAnonymous: user?.isAnonymous ?? true,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        signOut,
        saveProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
