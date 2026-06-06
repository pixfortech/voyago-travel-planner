'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Sparkles } from 'lucide-react'
import { useApp } from '@/context/AppContext'

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

  const photoURL = user?.photoURL
  const displayName = profile?.name ?? 'Guest'
  const email = profile?.email
  const initial = displayName.charAt(0).toUpperCase()
  const color = profile?.color ?? '#94a3b8'
  const providerId = profile?.providerId

  function Avatar({ size = 8, textSize = 'text-xs' }: { size?: number; textSize?: string }) {
    const cls = `w-${size} h-${size} rounded-full overflow-hidden flex-shrink-0`
    if (!isAnonymous && photoURL) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={photoURL} alt={displayName} className={`${cls} object-cover`} />
    }
    return (
      <div
        className={`${cls} flex items-center justify-center text-white font-black ${textSize}`}
        style={{ backgroundColor: isAnonymous ? '#94a3b8' : color }}
      >
        {isAnonymous ? '?' : initial}
      </div>
    )
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
        <Avatar size={8} textSize="text-xs" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 overflow-hidden z-50">
          {/* Identity section */}
          <div className="p-4 flex items-center gap-3">
            <Avatar size={10} textSize="text-sm" />
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
