'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Users, Check, Lock, Clock, X, AlertTriangle, Compass, LogIn,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { getInviteByToken, acceptInvite, getMemberRole, roleLabel, roleColor, effectiveStatus } from '@/lib/collaboration'
import type { TripInvite } from '@/types'

// ── Brand ────────────────────────────────────────────────────────────────────

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-0.5 select-none">
      <span className="text-xl font-black bg-gradient-to-r from-primary-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
        Voya
      </span>
      <span className="text-xl font-black text-gray-900 tracking-tight">GO</span>
    </Link>
  )
}

// ── Static state screens ──────────────────────────────────────────────────────

function StateScreen({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50/30 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-6">
        <Brand />
      </div>
      <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-5">
        {icon}
      </div>
      <h1 className="text-xl font-black text-gray-900 mb-2">{title}</h1>
      <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">{body}</p>
      {action ?? (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-600 transition-colors"
        >
          <Compass size={15} /> Go to dashboard
        </Link>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'invalid' | 'revoked' | 'expired' | 'already_member' | 'ready' | 'accepting' | 'done' | 'error'

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { user, profile, loading: authLoading } = useApp()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [invite, setInvite] = useState<TripInvite | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [emailMismatch, setEmailMismatch] = useState(false)

  // Load the invite by token (no auth required for the read).
  useEffect(() => {
    if (!token || authLoading) return

    getInviteByToken(token)
      .then((inv) => {
        if (!inv) { setLoadState('invalid'); return }

        const status = effectiveStatus(inv)
        if (status === 'revoked') { setLoadState('revoked'); return }
        if (status === 'expired') { setLoadState('expired'); return }

        // If there's a signed-in non-anonymous user, check whether they're already a member.
        if (user && !user.isAnonymous) {
          const isAlreadyMember = inv.status === 'accepted' && inv.acceptedByUid === user.uid
          if (isAlreadyMember) { setInvite(inv); setLoadState('already_member'); return }

          // Soft email mismatch warning.
          if (profile?.email && inv.email.toLowerCase() !== profile.email.toLowerCase()) {
            setEmailMismatch(true)
          }
        }

        setInvite(inv)
        setLoadState('ready')
      })
      .catch(() => setLoadState('invalid'))
  }, [token, user, profile, authLoading])

  async function handleAccept() {
    if (!invite || !user || user.isAnonymous) return
    setLoadState('accepting')
    setAcceptError(null)
    try {
      await acceptInvite(invite, user.uid)
      setLoadState('done')
      setTimeout(() => router.replace(`/trips/${invite.tripId}`), 1200)
    } catch (err) {
      setLoadState('ready')
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'invite_expired') {
        setAcceptError('This invite has expired.')
      } else if (msg === 'invite_not_pending') {
        setAcceptError('This invite is no longer active.')
      } else {
        setAcceptError('Something went wrong. Please try again.')
      }
    }
  }

  // ── Static state screens ──────────────────────────────────────────────────

  if (loadState === 'loading' || authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50/30 flex flex-col items-center justify-center p-6">
        <Brand />
        <div className="mt-10 w-8 h-8 border-3 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (loadState === 'invalid') {
    return (
      <StateScreen
        icon={<Lock size={24} className="text-gray-300" />}
        title="Invalid invite link"
        body="This invite link doesn't exist or has already been used. Ask the trip owner for a fresh link."
      />
    )
  }

  if (loadState === 'revoked') {
    return (
      <StateScreen
        icon={<X size={24} className="text-red-400" />}
        title="Invite revoked"
        body="The trip owner revoked this invite. Ask them for a new one."
      />
    )
  }

  if (loadState === 'expired') {
    return (
      <StateScreen
        icon={<Clock size={24} className="text-amber-400" />}
        title="Invite expired"
        body="Invite links are valid for 7 days. Ask the trip owner to generate a new link."
      />
    )
  }

  if (loadState === 'already_member') {
    return (
      <StateScreen
        icon={<Check size={24} className="text-green-500" />}
        title="You&apos;re already in!"
        body={`You have already joined${invite ? ` ${invite.tripName}` : ' this trip'}.`}
        action={
          invite ? (
            <Link
              href={`/trips/${invite.tripId}`}
              className="inline-flex items-center gap-2 bg-primary-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-600 transition-colors"
            >
              <Users size={15} /> Open trip
            </Link>
          ) : undefined
        }
      />
    )
  }

  if (loadState === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-primary-50/30 flex flex-col items-center justify-center p-6 text-center">
        <Brand />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="mt-8 w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center mb-5 shadow-lg shadow-green-500/30"
        >
          <Check size={30} className="text-white" />
        </motion.div>
        <h1 className="text-xl font-black text-gray-900 mb-2">You&apos;re in!</h1>
        <p className="text-sm text-gray-500">
          Welcome to <strong>{invite?.tripName}</strong>. Redirecting…
        </p>
      </div>
    )
  }

  // ── Ready state — main accept UI ─────────────────────────────────────────

  if (!invite) return null

  const isSignedIn = user && !user.isAnonymous
  const returnPath = `/invite/${token}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30 flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="mb-8">
        <Brand />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/60 overflow-hidden">

          {/* Gradient header */}
          <div className="bg-gradient-to-br from-primary-500 to-teal-500 px-6 py-8 text-white text-center">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users size={26} className="text-white" />
            </div>
            <p className="text-sm font-medium text-white/80 mb-1">You&apos;ve been invited to</p>
            <h1 className="text-2xl font-black leading-tight">{invite.tripName}</h1>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Invite details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Invited by</span>
                <span className="font-semibold text-gray-800">{invite.inviterName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Your role</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${roleColor(invite.role)}`}>
                  {roleLabel(invite.role)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Invited to</span>
                <span className="text-xs font-medium text-gray-600 truncate max-w-[160px]" title={invite.email}>
                  {invite.email}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Expires</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(invite.expiresAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {/* Role description */}
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <p className="text-xs text-gray-600 leading-snug">
                {invite.role === 'editor'
                  ? 'As an Editor you can view and edit the itinerary, budget, expenses, memories, and routes.'
                  : 'As a Viewer you can see all trip details but cannot make changes.'}
              </p>
            </div>

            {/* Email mismatch warning */}
            {emailMismatch && isSignedIn && (
              <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-snug">
                  This invite was sent to <strong>{invite.email}</strong> but you&apos;re signed in as{' '}
                  <strong>{profile?.email}</strong>. You can still accept if the trip owner intended it for you.
                </p>
              </div>
            )}

            {acceptError && (
              <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600">{acceptError}</p>
              </div>
            )}

            {/* CTA */}
            {isSignedIn ? (
              <button
                onClick={handleAccept}
                disabled={loadState === 'accepting'}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:bg-primary-300 text-white font-bold text-sm transition-colors"
              >
                {loadState === 'accepting' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining…
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Accept invite &amp; join trip
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-center text-gray-500">
                  Sign in or create an account to accept this invite.
                </p>
                <Link
                  href={`/auth?returnUrl=${encodeURIComponent(returnPath)}`}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-bold text-sm transition-colors"
                >
                  <LogIn size={15} />
                  Sign in / Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <p className="mt-6 text-xs text-gray-400 text-center max-w-xs">
        By accepting you agree that the trip owner can see your name and profile in the collaboration page.
      </p>
    </div>
  )
}
