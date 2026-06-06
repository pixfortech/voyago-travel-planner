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
} from '@/types'
import { generateTripColor, generateId, getDatesInRange } from './utils'

// ── Users ──────────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? (snap.data() as UserProfile) : null
}

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

export async function addActivity(
  tripId: string,
  dayId: string,
  activity: Omit<Activity, 'id'>
): Promise<Activity> {
  const full: Activity = { ...activity, id: generateId() }
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
    a.id === activityId ? { ...a, ...updates } : a
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
