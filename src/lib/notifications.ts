/**
 * In-app notification service (Phase 9).
 *
 * Notifications are stored in users/{uid}/notifications/{id}.
 * Only the recipient can read/update/delete their own notifications.
 * Trip members may CREATE notifications for other members (for tag events).
 * No push notifications or email in this phase.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type { InAppNotification, Trip, TripMemory, TripComment, Traveller } from '@/types'

/**
 * Create tag notifications for all tagged travellers that have a linked user account.
 * Skips: uploader's own tag, already-notified user/memory pairs, travellers without userId.
 * Returns the number of notifications actually sent.
 */
export async function createTagNotifications(params: {
  memory: TripMemory
  trip: Trip
  uploaderName: string
}): Promise<{ notifiedCount: number }> {
  const { memory, trip, uploaderName } = params
  if (!memory.taggedTravellerIds || memory.taggedTravellerIds.length === 0) {
    return { notifiedCount: 0 }
  }

  const travellers = trip.travellers ?? []
  const now = new Date().toISOString()
  let notifiedCount = 0

  await Promise.all(
    memory.taggedTravellerIds.map(async (travellerId) => {
      const traveller = travellers.find((t) => t.id === travellerId)
      if (!traveller?.userId) return  // no linked user account — skip gracefully
      if (traveller.userId === memory.userId) return  // don't notify the uploader about their own tag

      // Duplicate guard: skip if already notified for this memory+user combination
      const existing = await getDocs(
        query(
          collection(db, 'users', traveller.userId, 'notifications'),
          where('memoryId', '==', memory.id),
          where('type', '==', 'memory_tagged'),
        )
      )
      if (!existing.empty) return

      const notification: Omit<InAppNotification, 'id'> = {
        userId: traveller.userId,
        tripId: trip.id,
        memoryId: memory.id,
        type: 'memory_tagged',
        title: 'You were tagged in a memory',
        message: `${uploaderName} tagged you in a photo from ${trip.name}`,
        read: false,
        createdAt: now,
        actorUid: memory.userId,
        actorName: uploaderName,
        tripName: trip.name,
      }

      await addDoc(
        collection(db, 'users', traveller.userId, 'notifications'),
        notification
      )
      notifiedCount++
    })
  )

  return { notifiedCount }
}

/**
 * Create in-app mention notifications for trip members @mentioned in a comment.
 * Detects @FirstName patterns in the comment body, matches against travellers with
 * a linked userId, skips the comment author, and deduplicates by commentId.
 */
export async function createMentionNotifications(params: {
  comment: TripComment
  trip: Trip
  travellers: Traveller[]
  authorName: string
}): Promise<void> {
  const { comment, trip, travellers, authorName } = params

  // Extract @mentions (first word after @)
  const mentionPattern = /@(\w+)/g
  const mentioned = new Set<string>()
  let m
  while ((m = mentionPattern.exec(comment.body)) !== null) {
    mentioned.add(m[1].toLowerCase())
  }
  if (mentioned.size === 0) return

  const now = new Date().toISOString()

  await Promise.all(
    travellers.map(async (traveller) => {
      if (!traveller.userId) return
      if (traveller.userId === comment.authorUid) return

      // Match traveller's first name (case-insensitive) against mentioned tokens
      const firstName = traveller.name.split(' ')[0].toLowerCase()
      const matched = Array.from(mentioned).some(
        (tok) => firstName.startsWith(tok) || tok.startsWith(firstName)
      )
      if (!matched) return

      // Duplicate guard
      const existing = await getDocs(
        query(
          collection(db, 'users', traveller.userId, 'notifications'),
          where('commentId', '==', comment.id),
          where('type', '==', 'comment_mention'),
        )
      )
      if (!existing.empty) return

      const notification: Omit<InAppNotification, 'id'> = {
        userId: traveller.userId,
        tripId: trip.id,
        commentId: comment.id,
        targetType: comment.targetType,
        targetId: comment.targetId,
        type: 'comment_mention',
        title: 'You were mentioned in a comment',
        message: `${authorName} mentioned you in ${trip.name}`,
        read: false,
        createdAt: now,
        actorUid: comment.authorUid,
        actorName: authorName,
        tripName: trip.name,
      }

      await addDoc(
        collection(db, 'users', traveller.userId, 'notifications'),
        notification
      )
    })
  )
}

/** Fetch all notifications for a user, newest first. Returns [] on error. */
export async function getNotifications(uid: string): Promise<InAppNotification[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'notifications'),
        orderBy('createdAt', 'desc')
      )
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InAppNotification))
  } catch {
    return []
  }
}

/** Mark a single notification as read. */
export async function markNotificationRead(
  uid: string,
  notificationId: string
): Promise<void> {
  await updateDoc(
    doc(db, 'users', uid, 'notifications', notificationId),
    { read: true }
  )
}

/** Mark all unread notifications as read in a single batch. */
export async function markAllNotificationsRead(uid: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'notifications'),
        where('read', '==', false)
      )
    )
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }))
    await batch.commit()
  } catch {
    // Best-effort; UI will reflect unchanged state
  }
}
