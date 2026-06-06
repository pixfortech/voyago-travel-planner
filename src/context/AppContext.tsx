'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type User, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { getUserProfile, saveUserProfile } from '@/lib/firestore'
import type { UserProfile } from '@/types'

interface AppContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  saveProfile: (name: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const p = await getUserProfile(firebaseUser.uid)
        setProfile(p)
      } else {
        await signInAnonymously(auth)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function saveProfile(name: string) {
    if (!user) return
    const p = await saveUserProfile(user.uid, name)
    setProfile(p)
  }

  return (
    <AppContext.Provider value={{ user, profile, loading, saveProfile }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
