'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Copy, Check, X, ChevronDown,
  Mail, Clock, AlertTriangle, Info, Link as LinkIcon,
  Shield, Eye, Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { useApp } from '@/context/AppContext'
import AppShell from '@/components/layout/AppShell'
import { getTrip } from '@/lib/firestore'
import {
  createInvite, getTripInvites, revokeInvite,
  removeTripMember, updateMemberRole, getMemberProfiles,
  getMemberRole, roleLabel, roleColor, roleDescription,
  nameInitials, inviteUrl, effectiveStatus,
} from '@/lib/collaboration'
import type { Trip, TripInvite, TripRole, UserProfile } from '@/types'

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

// ── Avatar component ─────────────────────────────────────────────────────────

function Avatar({ profile, size = 36 }: { profile: UserProfile | null; size?: number }) {
  const initials = profile ? nameInitials(profile.name) : '?'
  const color = profile?.color ?? '#14b8a6'
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        backgroundColor: color,
        fontSize: size * 0.38,
      }}
    >
      {initials}
    </div>
  )
}

// ── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: TripRole }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${roleColor(role)}`}>
      {roleLabel(role)}
    </span>
  )
}

// ── Invite status badge ──────────────────────────────────────────────────────

function InviteBadge({ status }: { status: TripInvite['status'] }) {
  const map: Record<TripInvite['status'], string> = {
    pending: 'bg-amber-50 text-amber-700',
    accepted: 'bg-green-50 text-green-700',
    revoked: 'bg-gray-100 text-gray-500',
    expired: 'bg-red-50 text-red-500',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${map[status]}`}>
      {status}
    </span>
  )
}

// ── Copy link button ─────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the text manually
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 hover:bg-primary-100 text-primary-700 text-xs font-bold transition-colors flex-shrink-0"
      title="Copy invite link"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const router = useRouter()
  const { user, profile: myProfile } = useApp()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [invites, setInvites] = useState<TripInvite[]>([])
  const [memberProfiles, setMemberProfiles] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [generatedInvite, setGeneratedInvite] = useState<TripInvite | null>(null)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Revoke/remove states
  const [revoking, setRevoking] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [roleChanging, setRoleChanging] = useState<string | null>(null)

  const isOwner = user?.uid === trip?.ownerId

  useEffect(() => {
    if (!tripId) return
    getTrip(tripId).then((t) => {
      if (!t) { router.push('/dashboard'); return }
      setTrip(t)
      return Promise.all([
        getMemberProfiles(t.members),
        getTripInvites(tripId),
      ])
    }).then((results) => {
      if (!results) return
      const [profiles, tripInvites] = results
      setMemberProfiles(profiles)
      setInvites(tripInvites)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [tripId, router])

  // Sort members: owner first, then by role
  const sortedMembers = useMemo(() => {
    if (!trip) return []
    return [...trip.members].sort((a, b) => {
      if (a === trip.ownerId) return -1
      if (b === trip.ownerId) return 1
      const ra = getMemberRole(trip, a)
      const rb = getMemberRole(trip, b)
      if (ra === 'editor' && rb === 'viewer') return -1
      if (ra === 'viewer' && rb === 'editor') return 1
      return 0
    })
  }, [trip])

  const pendingInvites = useMemo(
    () => invites.filter((i) => effectiveStatus(i) === 'pending'),
    [invites],
  )

  const acceptedInvites = useMemo(
    () => invites.filter((i) => i.status === 'accepted'),
    [invites],
  )

  const otherInvites = useMemo(
    () => invites.filter((i) => ['revoked', 'expired'].includes(effectiveStatus(i))),
    [invites],
  )

  function profileFor(uid: string): UserProfile | null {
    return memberProfiles.find((p) => p.id === uid) ?? null
  }

  async function handleGenerateInvite() {
    if (!trip || !user || !isOwner) return
    if (!isValidEmail(inviteEmail)) { setInviteError('Enter a valid email address.'); return }
    setInviting(true)
    setInviteError(null)
    setGeneratedInvite(null)
    try {
      const invite = await createInvite({
        tripId: trip.id,
        tripName: trip.name,
        ownerId: user.uid,
        inviterName: myProfile?.name ?? user.displayName ?? 'Trip Owner',
        email: inviteEmail,
        role: inviteRole,
      })
      setGeneratedInvite(invite)
      setInvites((prev) => {
        const without = prev.filter((i) => i.id !== invite.id)
        return [invite, ...without]
      })
    } catch {
      setInviteError('Failed to create invite. Please try again.')
    } finally {
      setInviting(false)
    }
  }

  async function handleRevoke(invite: TripInvite) {
    setRevoking(invite.id)
    try {
      await revokeInvite(invite.id)
      setInvites((prev) => prev.map((i) => i.id === invite.id ? { ...i, status: 'revoked' } : i))
      if (generatedInvite?.id === invite.id) setGeneratedInvite(null)
    } catch {
      // silently fail — not critical
    } finally {
      setRevoking(null)
    }
  }

  async function handleRemoveMember(uid: string) {
    if (!trip || !isOwner || uid === trip.ownerId) return
    setRemoving(uid)
    try {
      await removeTripMember(tripId, uid, trip)
      setTrip((prev) => {
        if (!prev) return prev
        const newMembers = prev.members.filter((m) => m !== uid)
        const newRoles = { ...(prev.collaboratorRoles ?? {}) }
        delete newRoles[uid]
        return { ...prev, members: newMembers, collaboratorRoles: newRoles }
      })
      setMemberProfiles((prev) => prev.filter((p) => p.id !== uid))
    } catch {
      // silently fail
    } finally {
      setRemoving(null)
    }
  }

  async function handleRoleChange(uid: string, role: 'editor' | 'viewer') {
    if (!trip || !isOwner) return
    setRoleChanging(uid)
    try {
      await updateMemberRole(tripId, uid, role, trip)
      setTrip((prev) => {
        if (!prev) return prev
        const newRoles: Record<string, TripRole> = { ...(prev.collaboratorRoles ?? {}), [uid]: role }
        return { ...prev, collaboratorRoles: newRoles }
      })
    } catch {
      // silently fail
    } finally {
      setRoleChanging(null)
    }
  }

  if (loading) {
    return (
      <AppShell back={`/trips/${tripId}`} tripId={tripId}>
        <div className="space-y-4 max-w-2xl mx-auto">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </AppShell>
    )
  }

  if (!trip) return null

  const currentLink = generatedInvite
    ? inviteUrl(generatedInvite.id, typeof window !== 'undefined' ? window.location.origin : '')
    : null

  return (
    <AppShell back={`/trips/${tripId}`} tripId={tripId}>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-primary-500 rounded-xl flex items-center justify-center shadow-sm">
              <Users size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">Members &amp; Collaboration</h1>
              <p className="text-xs text-gray-400">{trip.name}</p>
            </div>
          </div>
        </motion.div>

        {/* Current members */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.04 }}
        >
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide">
                Members <span className="normal-case font-semibold text-gray-500 ml-1">({trip.members.length})</span>
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {sortedMembers.map((uid) => {
                const p = profileFor(uid)
                const role = getMemberRole(trip, uid)
                const isMe = uid === user?.uid
                const isThisOwner = uid === trip.ownerId
                const isChangingRole = roleChanging === uid
                const isRemoving = removing === uid
                return (
                  <div key={uid} className="flex items-center gap-3 px-4 py-3">
                    <Avatar profile={p} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {p?.name ?? 'Unknown'}
                          {isMe && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                        </span>
                        <RoleBadge role={role} />
                      </div>
                      {p?.email && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{p.email}</p>
                      )}
                    </div>
                    {/* Owner controls for non-owner members */}
                    {isOwner && !isThisOwner && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Role selector */}
                        <div className="relative">
                          <select
                            value={role === 'owner' ? 'editor' : role}
                            onChange={(e) => handleRoleChange(uid, e.target.value as 'editor' | 'viewer')}
                            disabled={isChangingRole}
                            className="appearance-none bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 pl-2 pr-6 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-50"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveMember(uid)}
                          disabled={isRemoving}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                          title={`Remove ${p?.name ?? 'member'}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>

        {/* Invite new member (owner only) */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus size={14} className="text-primary-500" />
                <p className="text-xs font-black text-gray-700">Invite New Member</p>
              </div>

              {/* Role explanation */}
              <div className="flex gap-2">
                {(['editor', 'viewer'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`flex-1 rounded-xl border p-2.5 text-left transition-all ${
                      inviteRole === r
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {r === 'editor' ? (
                        <Pencil size={11} className={inviteRole === r ? 'text-primary-600' : 'text-gray-500'} />
                      ) : (
                        <Eye size={11} className={inviteRole === r ? 'text-primary-600' : 'text-gray-500'} />
                      )}
                      <span className={`text-xs font-bold capitalize ${inviteRole === r ? 'text-primary-700' : 'text-gray-600'}`}>
                        {r}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-snug">{roleDescription(r)}</p>
                  </button>
                ))}
              </div>

              {/* Email input + button */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    placeholder="colleague@example.com"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateInvite() }}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-transparent transition-all"
                  />
                </div>
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold transition-colors flex-shrink-0"
                >
                  {inviting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <LinkIcon size={13} />
                  )}
                  Get link
                </button>
              </div>

              {inviteError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  <AlertTriangle size={12} />
                  {inviteError}
                </div>
              )}

              {/* Generated invite link */}
              <AnimatePresence>
                {currentLink && generatedInvite && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-primary-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Check size={12} className="text-primary-600" />
                        <p className="text-xs font-bold text-primary-700">
                          Invite link ready — share it with{' '}
                          <span className="font-black">{generatedInvite.email}</span>
                        </p>
                      </div>
                      <div className="flex items-stretch gap-2">
                        <div className="flex-1 bg-white rounded-lg border border-primary-200 px-3 py-2 text-[11px] text-gray-600 font-mono truncate">
                          {currentLink}
                        </div>
                        <CopyButton text={currentLink} />
                      </div>
                      <p className="text-[10px] text-primary-600 flex items-center gap-1">
                        <Clock size={10} />
                        Expires {fmtDate(generatedInvite.expiresAt)}
                        {' · '}
                        <RoleBadge role={generatedInvite.role} />
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email sending note */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2.5">
                <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 leading-snug">
                  Email sending is not yet implemented. Copy and share the link manually.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pending invites (owner only) */}
        {isOwner && pendingInvites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide">
                  Pending Invites
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Mail size={13} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <InviteBadge status="pending" />
                        <RoleBadge role={inv.role} />
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock size={9} /> Expires {fmtDate(inv.expiresAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(inv)}
                      disabled={revoking === inv.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 flex-shrink-0"
                    >
                      <X size={10} /> Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Accepted invites history (owner only, collapsed by default) */}
        {isOwner && acceptedInvites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 }}
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Accepted Invites</p>
              </div>
              <div className="divide-y divide-gray-50">
                {acceptedInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check size={13} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <InviteBadge status="accepted" />
                        <RoleBadge role={inv.role} />
                        {inv.acceptedAt && (
                          <span className="text-[10px] text-gray-400">{fmtDate(inv.acceptedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Revoked/expired invites history (owner only, collapsed) */}
        {isOwner && otherInvites.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.16 }}
          >
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Past Invites</p>
              </div>
              <div className="divide-y divide-gray-50">
                {otherInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Mail size={13} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-600 truncate">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <InviteBadge status={effectiveStatus(inv)} />
                        <RoleBadge role={inv.role} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Role descriptions card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={13} className="text-gray-400" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Role Permissions</p>
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-start gap-2">
                <RoleBadge role="owner" />
                <span>Manages members, invites, and all trip data. Cannot be changed.</span>
              </div>
              <div className="flex items-start gap-2">
                <RoleBadge role="editor" />
                <span>Can view and edit itinerary, budget, expenses, memories, and routes.</span>
              </div>
              <div className="flex items-start gap-2">
                <RoleBadge role="viewer" />
                <span>Can view the trip but cannot make changes.</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-50">
              Viewer/editor restrictions are enforced in the UI. Server-side fine-grained role rules will be added in a future release.
            </p>
          </div>
        </motion.div>

        {/* Back to trip */}
        <div className="pb-4">
          <Link
            href={`/trips/${tripId}`}
            className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to trip overview
          </Link>
        </div>

      </div>
    </AppShell>
  )
}
