'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'

interface AvatarCircleProps {
  photoURL: string | null | undefined
  displayName: string
  initial: string
  color: string
  isAnonymous: boolean
  /** 'sm' = w-8 h-8 (header trigger), 'lg' = w-10 h-10 (dropdown identity panel) */
  size: 'sm' | 'lg'
}

function AvatarCircle({ photoURL, displayName, initial, color, isAnonymous, size }: AvatarCircleProps) {
  const sizeClass = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
  const textClass = size === 'lg' ? 'text-sm' : 'text-xs'
  const bg = isAnonymous ? '#94a3b8' : color

  if (!isAnonymous && photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoURL}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
        referrerPolicy="no-referrer"
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-black flex-shrink-0 ${textClass}`}
      style={{ backgroundColor: bg }}
    >
      {isAnonymous ? '?' : initial}
    </div>
  )
}

export default function ProfileMenu() {
  const { profile, user, isAnonymous, signOut } = useApp()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    router.push('/')
  }

  // Prefer user.photoURL (live Firebase Auth value) over profile.photoURL (Firestore snapshot)
  // so Google photo appears immediately after sign-in even before Firestore syncs.
  const photoURL = user?.photoURL ?? profile?.photoURL
  const displayName = profile?.name ?? user?.displayName ?? 'Guest'
  const email = profile?.email ?? user?.email ?? undefined
  const initial = (displayName !== 'Guest' ? displayName : '?').charAt(0).toUpperCase()
  const color = profile?.color ?? '#94a3b8'
  const providerId = profile?.providerId ?? user?.providerData[0]?.providerId

  const avatarProps: Omit<AvatarCircleProps, 'size'> = {
    photoURL,
    displayName,
    initial,
    color,
    isAnonymous,
  }

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block rounded-full border-2 border-transparent hover:border-primary-300 focus:outline-none focus:border-primary-400 transition-all"
        title={isAnonymous ? 'Guest — click to sign in' : displayName}
        aria-label="Account menu"
        aria-expanded={open}
      >
        <AvatarCircle {...avatarProps} size="sm" />
      </button>

      {/* Dropdown — rendered in a portal-like absolute position above all content */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden z-[100]">
          {/* Identity section */}
          <div className="p-4 flex items-center gap-3">
            <AvatarCircle {...avatarProps} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">
                {isAnonymous ? 'Guest' : displayName}
              </p>
              {!isAnonymous && email ? (
                <p className="text-xs text-gray-500 truncate">{email}</p>
              ) : (
                <p className="text-xs text-gray-400">Anonymous session</p>
              )}
              {!isAnonymous && providerId && (
                <span
                  className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    providerId === 'google.com'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {providerId === 'google.com' ? 'Google' : 'Email'}
                </span>
              )}
            </div>
          </div>

          <div className="border-t border-gray-50" />

          {/* Actions */}
          {isAnonymous ? (
            <div className="p-3">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={12} className="text-amber-500" />
                  <p className="text-xs font-bold text-amber-800">Save your trips</p>
                </div>
                <p className="text-[11px] text-amber-700 mb-2.5 leading-relaxed">
                  Sign in to access your trips from any device and keep your data safe.
                </p>
                <Link
                  href="/auth"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  Sign in or create account →
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-2">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
