/**
 * Comments & Reactions helpers (Phase 11).
 *
 * Comments:  trips/{tripId}/comments/{commentId}
 * Reactions: trips/{tripId}/reactions/{reactionId}
 *
 * Both subcollections are protected by the existing wildcard rule in firestore.rules:
 *   match /trips/{tripId} { match /{sub=**} { allow read, write: if isTripMember(tripId); } }
 *
 * Security model (client-enforced, consistent with Phase 8 collaboration):
 *  - Any trip member can read comments/reactions.
 *  - Any trip member can create comments/reactions.
 *  - Edit/soft-delete is enforced in the UI (authorUid === currentUid).
 *  - The trip owner may also delete any comment via the UI (moderation).
 *
 * Queries use equality `where` filters only (no orderBy) so no composite
 * Firestore indexes are required. Results are sorted client-side.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import type { TripComment, TripReaction, CommentTargetType } from '@/types'

// ── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(
  tripId: string,
  data: Omit<TripComment, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'trips', tripId, 'comments'), data)
  return ref.id
}

export async function editComment(
  tripId: string,
  commentId: string,
  body: string,
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'comments', commentId), {
    body,
    edited: true,
    updatedAt: new Date().toISOString(),
  })
}

export async function softDeleteComment(
  tripId: string,
  commentId: string,
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'comments', commentId), {
    deleted: true,
    body: '',
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Real-time subscription to all non-deleted comments for a specific target.
 * Sorted client-side by createdAt ascending to avoid composite-index requirement.
 */
export function subscribeComments(
  tripId: string,
  targetType: CommentTargetType,
  targetId: string,
  callback: (comments: TripComment[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'trips', tripId, 'comments'),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
  )
  return onSnapshot(q, (snap) => {
    const comments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TripComment))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    callback(comments)
  }, () => callback([]))
}

/** Fetch the N most recent comments across ALL targets for a trip (for the overview card). */
export async function getRecentTripComments(
  tripId: string,
  maxCount = 3,
): Promise<TripComment[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'trips', tripId, 'comments'),
        orderBy('createdAt', 'desc'),
        limit(maxCount),
      ),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripComment))
  } catch {
    return []
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────────

/** Real-time subscription to all reactions for a specific target. */
export function subscribeReactions(
  tripId: string,
  targetType: CommentTargetType,
  targetId: string,
  callback: (reactions: TripReaction[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'trips', tripId, 'reactions'),
    where('targetType', '==', targetType),
    where('targetId', '==', targetId),
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripReaction)))
  }, () => callback([]))
}

async function addReaction(
  tripId: string,
  data: Omit<TripReaction, 'id'>,
): Promise<void> {
  await addDoc(collection(db, 'trips', tripId, 'reactions'), data)
}

async function removeReaction(tripId: string, reactionId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'reactions', reactionId))
}

/**
 * Toggle a reaction: if the user already reacted with this emoji, remove it;
 * otherwise add it. One reaction per user per emoji per target.
 */
export async function toggleReaction(
  tripId: string,
  targetType: CommentTargetType,
  targetId: string,
  userId: string,
  emoji: string,
  existing?: TripReaction,
): Promise<void> {
  if (existing) {
    await removeReaction(tripId, existing.id)
  } else {
    await addReaction(tripId, {
      tripId,
      targetType,
      targetId,
      userId,
      emoji,
      createdAt: new Date().toISOString(),
    })
  }
}
