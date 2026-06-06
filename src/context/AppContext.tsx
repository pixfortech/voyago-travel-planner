'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUserProfile, saveUserProfile } from '@/lib/firestore'
import type { UserProfile } from '@/types'

/**
 * Describes why anonymous sign-in failed at startup.
 * - anonymous-not-enabled: Firebase Auth is working but Anonymous sign-in
 *   hasn't been enabled in the Firebase Console (most common local-dev issue).
 * - unknown: any other unexpected auth error.
 */
export type AuthSetupError = 'anonymous-not-enabled' | 'unknown'

interface AppContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  authSetupError: AuthSetupError | null
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
        const p = await getUserProfile(firebaseUser.uid)
        setProfile(p)
        setLoading(false)
      } else {
        try {
          // Sign in anonymously so every visitor gets a persistent session.
          // onAuthStateChanged fires again with the new anonymous user.
          await signInAnonymously(auth)
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

  async function saveProfile(name: string) {
    if (!user) return
    const p = await saveUserProfile(user.uid, name)
    setProfile(p)
  }

  return (
    <AppContext.Provider value={{ user, profile, loading, authSetupError, saveProfile }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
