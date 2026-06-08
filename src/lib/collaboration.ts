/**
 * Collaboration helpers — Phase 8.
 *
 * All Firestore access uses the client SDK so rules are enforced normally.
 * Key design decisions:
 *   • The invite token is the Firestore document ID (invites/{token}), making
 *     token-based lookups O(1) with no composite index.
 *   • A 64-char crypto-random hex token (~256 bits of entropy) makes brute-force
 *     infeasible.
 *   • acceptInvite() is idempotent: if the user is already a member it skips the
 *     trip update so retries after a partial write are safe.
 *   • getMemberRole() returns 'owner' for the ownerId, falls back to the
 *     collaboratorRoles map, then defaults to 'viewer' for legacy members added
 *     before Phase 8.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type { TripInvite, TripRole, Trip, UserProfile } from '@/types'

const INVITE_EXPIRY_DAYS = 7

// ── Token generation ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 64-char hex invite token (~256-bit entropy).
 * Uses globalThis.crypto.getRandomValues (available in browsers and Node ≥ 18).
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32)
  const c = globalThis.crypto as Crypto | undefined
  if (c?.getRandomValues) {
    c.getRandomValues(bytes)
  } else {
    // Fallback (should never happen in modern Next.js environments)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ── Invite CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a new pending invite.
 *
 * If there is already a pending invite for the same (tripId, email) pair, the
 * existing invite is returned unchanged (idempotent). Call revokeInvite() first
 * to force a fresh link.
 */
export async function createInvite(params: {
  tripId: string
  tripName: string
  ownerId: string
  inviterName: string
  email: string
  role: 'editor' | 'viewer'
}): Promise<TripInvite> {
  const email = params.email.toLowerCase().trim()

  // Check for an existing pending invite for this email/trip.
  const existing = await findPendingInvite(params.tripId, email)
  if (existing) return existing

  const token = generateInviteToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const invite: TripInvite = {
    id: token,
    tripId: params.tripId,
    tripName: params.tripName,
    ownerId: params.ownerId,
    inviterName: params.inviterName,
    email,
    role: params.role,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }

  await setDoc(doc(db, 'invites', token), invite)
  return invite
}

/** Fetch a single invite by its token (the doc ID). Allowed for anyone. */
export async function getInviteByToken(token: string): Promise<TripInvite | null> {
  const snap = await getDoc(doc(db, 'invites', token))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as TripInvite
}

/**
 * List all invites for a trip (sorted newest-first).
 * The caller must be the trip owner; Firestore rules allow list for any
 * signed-in user and the client always filters by tripId.
 */
export async function getTripInvites(tripId: string): Promise<TripInvite[]> {
  const q = query(collection(db, 'invites'), where('tripId', '==', tripId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as TripInvite))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Find the first pending invite for a (tripId, email) pair, or null. */
async function findPendingInvite(tripId: string, email: string): Promise<TripInvite | null> {
  const all = await getTripInvites(tripId)
  return all.find((i) => i.email === email && i.status === 'pending') ?? null
}

/**
 * Revoke a pending invite. Only the trip owner may call this.
 * The invite remains readable for audit purposes; status becomes 'revoked'.
 */
export async function revokeInvite(token: string): Promise<void> {
  await updateDoc(doc(db, 'invites', token), { status: 'revoked' })
}

// ── Invite acceptance ───────────────────────────────────────────────────────

/**
 * Compute the effective status of an invite, accounting for expiry.
 * Returns 'expired' for invites that are nominally 'pending' but past expiresAt.
 */
export function effectiveStatus(invite: TripInvite): TripInvite['status'] {
  if (invite.status === 'pending' && new Date() > new Date(invite.expiresAt)) {
    return 'expired'
  }
  return invite.status
}

/**
 * Accept an invite.
 *
 * Two-step write:
 *   1. Mark invite as accepted with the acceptor's uid.
 *   2. Add the uid to the trip's members array and set their collaboratorRole.
 *
 * Step 2 uses Firestore rule Shape 3 (permissive self-addition) and is
 * idempotent — if the user is already a member we skip the trip update.
 *
 * Throws: 'invite_expired', 'invite_not_pending', 'trip_not_found'
 */
export async function acceptInvite(invite: TripInvite, uid: string): Promise<void> {
  if (effectiveStatus(invite) === 'expired') throw new Error('invite_expired')
  if (invite.status !== 'pending') throw new Error('invite_not_pending')

  const now = new Date().toISOString()

  // Step 1 — mark invite accepted.
  await updateDoc(doc(db, 'invites', invite.id), {
    status: 'accepted',
    acceptedAt: now,
    acceptedByUid: uid,
  })

  // Step 2 — add uid to trip.
  const tripRef = doc(db, 'trips', invite.tripId)
  const tripSnap = await getDoc(tripRef)
  if (!tripSnap.exists()) throw new Error('trip_not_found')

  const tripData = tripSnap.data() as Trip

  // Idempotent: skip if already a member.
  if (tripData.members.includes(uid)) return

  const newMembers = [...tripData.members, uid]
  const existingRoles = tripData.collaboratorRoles ?? {}
  const newRoles: Record<string, TripRole> = { ...existingRoles, [uid]: invite.role }

  await updateDoc(tripRef, {
    members: newMembers,
    collaboratorRoles: newRoles,
    updatedAt: now,
  })
}

// ── Member management ───────────────────────────────────────────────────────

/**
 * Remove a member from a trip (owner only; cannot remove the owner).
 * Updates both members array and collaboratorRoles.
 * Uses Firestore rule Shape 4.
 */
export async function removeTripMember(tripId: string, uid: string, trip: Trip): Promise<void> {
  if (uid === trip.ownerId) throw new Error('cannot_remove_owner')
  if (!trip.members.includes(uid)) return // already gone — idempotent

  const newMembers = trip.members.filter((m) => m !== uid)
  const newRoles = { ...(trip.collaboratorRoles ?? {}) }
  delete newRoles[uid]

  await updateDoc(doc(db, 'trips', tripId), {
    members: newMembers,
    collaboratorRoles: newRoles,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Change a member's role (owner only; cannot change the owner's role).
 * Uses Firestore rule Shape 1 (only collaboratorRoles changes; members unchanged).
 */
export async function updateMemberRole(
  tripId: string,
  uid: string,
  role: 'editor' | 'viewer',
  trip: Trip,
): Promise<void> {
  if (uid === trip.ownerId) throw new Error('cannot_change_owner_role')

  const newRoles: Record<string, TripRole> = { ...(trip.collaboratorRoles ?? {}), [uid]: role }
  await updateDoc(doc(db, 'trips', tripId), {
    collaboratorRoles: newRoles,
    updatedAt: new Date().toISOString(),
  })
}

// ── Role helpers ────────────────────────────────────────────────────────────

/**
 * Derive the effective TripRole for a uid.
 *   • Returns 'owner' if uid === trip.ownerId.
 *   • Returns the collaboratorRoles entry if present.
 *   • Defaults to 'viewer' for legacy members with no role entry.
 */
export function getMemberRole(trip: Trip, uid: string): TripRole {
  if (uid === trip.ownerId) return 'owner'
  return (trip.collaboratorRoles?.[uid] as TripRole | undefined) ?? 'viewer'
}

export function roleLabel(role: TripRole): string {
  return role === 'owner' ? 'Owner' : role === 'editor' ? 'Editor' : 'Viewer'
}

export function roleColor(role: TripRole): string {
  return role === 'owner'
    ? 'bg-violet-100 text-violet-700'
    : role === 'editor'
      ? 'bg-primary-100 text-primary-700'
      : 'bg-gray-100 text-gray-600'
}

export function roleDescription(role: 'editor' | 'viewer'): string {
  return role === 'editor'
    ? 'Can view and edit itinerary, budget, expenses, memories, and routes'
    : 'Can view the trip but cannot make changes'
}

// ── Profile helpers ─────────────────────────────────────────────────────────

/** Fetch Firestore user profiles for a list of UIDs (parallel, null-filtered). */
export async function getMemberProfiles(uids: string[]): Promise<UserProfile[]> {
  const results = await Promise.all(
    uids.map(async (uid) => {
      const snap = await getDoc(doc(db, 'users', uid))
      return snap.exists() ? (snap.data() as UserProfile) : null
    }),
  )
  return results.filter((p): p is UserProfile => p !== null)
}

/** Derive avatar initials from a display name. */
export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

/** Build the invite accept URL for copying. */
export function inviteUrl(token: string, origin: string): string {
  return `${origin}/invite/${token}`
}
