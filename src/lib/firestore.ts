import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore'
import type { User as FirebaseUser } from 'firebase/auth'
import { db } from './firebase'
import type {
  UserProfile,
  Trip,
  TripType,
  Traveller,
  ItineraryDay,
  Activity,
  Expense,
  ExpenseCategory,
  ActivityType,
  Share,
  ShareVisibility,
  SharedTripSnapshot,
  TripLocationPoint,
  TripMemory,
} from '@/types'
import { generateTripColor, generateId, getDatesInRange } from './utils'
import { generateShareToken } from './share'
import { deleteMemoryPhoto } from './memories/storage'

/**
 * Recursively drop keys whose value is `undefined`. Firestore rejects undefined
 * values (including inside arrays/objects), and activities now carry many
 * optional fields (Phase 4 times, Phase 6 place metadata) that are frequently
 * absent. Pruning keeps writes safe without forcing every caller to set nulls.
 */
function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = pruneUndefined(v)
    }
    return out as T
  }
  return value
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

/** Legacy helper used for anonymous users setting a display name. */
export async function saveUserProfile(uid: string, name: string): Promise<UserProfile> {
  const profile: UserProfile = {
    id: uid,
    name,
    color: generateTripColor(),
    createdAt: new Date().toISOString(),
  }
  await setDoc(doc(db, 'users', uid), profile)
  return profile
}

/**
 * Create or update the Firestore profile for a signed-in Firebase user.
 * Called after Google sign-in, email sign-up, and every subsequent login
 * to keep displayName / photoURL / lastLoginAt in sync.
 * Uses merge so existing fields (color, createdAt) are not overwritten.
 */
export async function upsertUserProfile(
  firebaseUser: FirebaseUser,
  nameOverride?: string
): Promise<UserProfile> {
  const existing = await getUserProfile(firebaseUser.uid)
  const now = new Date().toISOString()
  const providerId = firebaseUser.providerData[0]?.providerId ?? 'anonymous'

  const profile: UserProfile = {
    id: firebaseUser.uid,
    name:
      nameOverride ??
      firebaseUser.displayName ??
      existing?.name ??
      firebaseUser.email?.split('@')[0] ??
      'Traveller',
    color: existing?.color ?? generateTripColor(),
    email: firebaseUser.email ?? undefined,
    photoURL: firebaseUser.photoURL,
    providerId,
    createdAt: existing?.createdAt ?? now,
    lastLoginAt: now,
  }

  await setDoc(doc(db, 'users', firebaseUser.uid), profile, { merge: true })
  return profile
}

// ── Trips ──────────────────────────────────────────────────────────────────

export async function getTrips(userId: string): Promise<Trip[]> {
  const q = query(collection(db, 'trips'), where('members', 'array-contains', userId))
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Trip)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const snap = await getDoc(doc(db, 'trips', tripId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Trip) : null
}

export async function createTrip(
  userId: string,
  data: {
    name: string
    destination: string
    type: TripType
    startDate: string
    endDate: string
    budget: number
    currency: string
    notes: string
    travellers?: Traveller[]
  }
): Promise<string> {
  const now = new Date().toISOString()
  const docRef = await addDoc(collection(db, 'trips'), {
    ...data,
    ownerId: userId,
    members: [userId],
    coverColor: generateTripColor(),
    createdAt: now,
    updatedAt: now,
  })

  // Bootstrap one empty day per trip date
  const dates = getDatesInRange(data.startDate, data.endDate)
  await Promise.all(
    dates.map((date, i) =>
      setDoc(doc(db, 'trips', docRef.id, 'days', `day-${i + 1}`), {
        id: `day-${i + 1}`,
        tripId: docRef.id,
        date,
        dayNumber: i + 1,
        activities: [],
      })
    )
  )

  return docRef.id
}

export async function updateTrip(tripId: string, data: Partial<Trip>): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId), {
    ...data,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteTrip(tripId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId))
}

// ── Itinerary ──────────────────────────────────────────────────────────────

export async function getItineraryDays(tripId: string): Promise<ItineraryDay[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'days'), orderBy('dayNumber'))
  )
  return snap.docs.map((d) => d.data() as ItineraryDay)
}

export async function updateItineraryDay(
  tripId: string,
  dayId: string,
  updates: Partial<Pick<ItineraryDay, 'date' | 'dayNumber' | 'activities' | 'essentialSuggestions'>>,
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'days', dayId), updates)
}

export async function deleteItineraryDay(tripId: string, dayId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'days', dayId))
}

export async function addItineraryDay(
  tripId: string,
  day: ItineraryDay,
): Promise<void> {
  await setDoc(doc(db, 'trips', tripId, 'days', day.id), pruneUndefined(day))
}

export async function addActivity(
  tripId: string,
  dayId: string,
  activity: Omit<Activity, 'id'>
): Promise<Activity> {
  const full: Activity = pruneUndefined({ ...activity, id: generateId() })
  const dayRef = doc(db, 'trips', tripId, 'days', dayId)
  const snap = await getDoc(dayRef)
  if (!snap.exists()) return full
  const current = snap.data() as ItineraryDay
  await updateDoc(dayRef, { activities: [...current.activities, full] })
  return full
}

export async function updateActivity(
  tripId: string,
  dayId: string,
  activityId: string,
  updates: Partial<Activity>
): Promise<void> {
  const dayRef = doc(db, 'trips', tripId, 'days', dayId)
  const snap = await getDoc(dayRef)
  if (!snap.exists()) return
  const current = snap.data() as ItineraryDay
  const activities = current.activities.map((a) =>
    a.id === activityId ? pruneUndefined({ ...a, ...updates }) : a
  )
  await updateDoc(dayRef, { activities })
}

export async function deleteActivity(
  tripId: string,
  dayId: string,
  activityId: string
): Promise<void> {
  const dayRef = doc(db, 'trips', tripId, 'days', dayId)
  const snap = await getDoc(dayRef)
  if (!snap.exists()) return
  const current = snap.data() as ItineraryDay
  await updateDoc(dayRef, {
    activities: current.activities.filter((a) => a.id !== activityId),
  })
}

// ── Expenses ───────────────────────────────────────────────────────────────

export async function getExpenses(tripId: string): Promise<Expense[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'expenses'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Expense)
}

export async function addExpense(
  tripId: string,
  data: Omit<Expense, 'id' | 'tripId' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'trips', tripId, 'expenses'), {
    ...data,
    tripId,
    createdAt: new Date().toISOString(),
  })
  return ref.id
}

export async function updateExpense(
  tripId: string,
  expenseId: string,
  updates: Partial<Omit<Expense, 'id' | 'tripId' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'expenses', expenseId), updates)
}

export async function deleteExpense(tripId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId))
}

// ── Sharing ──────────────────────────────────────────────────────────────
//
// shares/{shareId} holds a read-only public snapshot. Rules permit anyone to
// read it only when enabled === true; the owner may always read/write their own.
// The snapshot contains only the sections the owner enabled (see buildSnapshot),
// so disabled data is never written to a publicly-readable document.

export async function getShare(shareId: string): Promise<Share | null> {
  try {
    const snap = await getDoc(doc(db, 'shares', shareId))
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Share) : null
  } catch {
    // Rules deny reads of disabled shares to non-owners → treat as not available.
    return null
  }
}

/**
 * Create or overwrite the share document for a trip and point the trip at it.
 * Pass an existing `shareId` to update in place (preserves createdAt); omit it
 * to create a fresh token. Returns the share token used.
 */
export async function saveShare(
  trip: Trip,
  snapshot: SharedTripSnapshot,
  opts: { enabled: boolean; visibility: ShareVisibility; shareId?: string }
): Promise<string> {
  const shareId = opts.shareId ?? generateShareToken()
  const now = new Date().toISOString()
  const existing = opts.shareId ? await getShare(opts.shareId) : null

  await setDoc(doc(db, 'shares', shareId), {
    tripId: trip.id,
    ownerId: trip.ownerId,
    enabled: opts.enabled,
    visibility: opts.visibility,
    snapshot,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  // Point the trip at the (possibly new) share token. members/ownerId untouched
  // so this satisfies the standard trip-update rule.
  if (trip.shareId !== shareId) {
    await updateDoc(doc(db, 'trips', trip.id), { shareId, updatedAt: now })
  }

  return shareId
}

/** Delete a share document (used when regenerating to a new token). */
export async function deleteShare(shareId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'shares', shareId))
  } catch {
    // Best-effort cleanup of the old token; ignore if already gone.
  }
}

// ── Location points (Phase 7A) ────────────────────────────────────────────
//
// Stored in trips/{tripId}/locations — trip membership rules apply (see
// firestore.rules wildcard match). Permission is requested only when the user
// explicitly triggers a check-in or starts foreground live tracking.

export async function addLocationPoint(
  tripId: string,
  data: Omit<TripLocationPoint, 'id' | 'createdAt'>
): Promise<TripLocationPoint> {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'trips', tripId, 'locations'), {
    ...pruneUndefined(data),
    createdAt: now,
  })
  return { ...data, id: ref.id, createdAt: now }
}

export async function getLocationPoints(tripId: string): Promise<TripLocationPoint[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'locations'), orderBy('capturedAt', 'desc'))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TripLocationPoint)
}

export async function deleteLocationPoint(tripId: string, locationId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'locations', locationId))
}

// ── Photo memories (Phase 7B) ─────────────────────────────────────────────
//
// Metadata lives in trips/{tripId}/memories — trip membership rules apply (see
// firestore.rules wildcard match). The image binary lives in Firebase Storage
// (see src/lib/memories/storage.ts). Memories are private to trip members and
// are NOT included in public share snapshots.

export async function addMemory(
  tripId: string,
  data: Omit<TripMemory, 'id' | 'createdAt'>
): Promise<TripMemory> {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, 'trips', tripId, 'memories'), {
    ...pruneUndefined(data),
    createdAt: now,
  })
  return { ...data, id: ref.id, createdAt: now }
}

export async function getMemories(tripId: string): Promise<TripMemory[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'memories'), orderBy('uploadedAt', 'desc'))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TripMemory)
}

/**
 * Delete a memory: remove the Firestore metadata doc first, then best-effort
 * delete the Storage object. If the Storage delete fails the metadata removal
 * still counts as success (the user no longer sees the memory).
 */
export async function deleteMemory(tripId: string, memory: TripMemory): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'memories', memory.id))
  if (memory.storagePath) {
    await deleteMemoryPhoto(memory.storagePath)
  }
}

