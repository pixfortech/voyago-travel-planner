/**
 * Tasks, Polls & Voting helpers (Phase 12).
 *
 * Tasks: trips/{tripId}/tasks/{taskId}
 * Polls: trips/{tripId}/polls/{pollId}   (options embedded in the document)
 *
 * Both subcollections are protected by the existing wildcard rule in firestore.rules:
 *   match /trips/{tripId} { match /{sub=**} { allow read, write: if isTripMember(tripId); } }
 *
 * Security model (client-enforced, consistent with Phase 8/11):
 *  - Any trip member can read/create tasks and polls.
 *  - Field-level ownership (creator/assignee/owner) is enforced in the UI.
 *  - Votes store voter uids only — never emails.
 *
 * Subscriptions use equality `where` filters with client-side sorting so no
 * composite Firestore indexes are required.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { generateId } from './utils'
import type { TripTask, TripPoll, PollOption } from '@/types'

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function addTask(
  tripId: string,
  data: Omit<TripTask, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'trips', tripId, 'tasks'), data)
  return ref.id
}

export async function updateTask(
  tripId: string,
  taskId: string,
  updates: Partial<Omit<TripTask, 'id' | 'tripId'>>,
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'tasks', taskId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteTask(tripId: string, taskId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'tasks', taskId))
}

/** Real-time subscription to all tasks for a trip, newest first. */
export function subscribeTasks(
  tripId: string,
  callback: (tasks: TripTask[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'trips', tripId, 'tasks'))
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TripTask))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    callback(tasks)
  }, () => callback([]))
}

/** One-time fetch of all tasks for a trip. Returns [] on error. */
export async function getTasks(tripId: string): Promise<TripTask[]> {
  try {
    const snap = await getDocs(collection(db, 'trips', tripId, 'tasks'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TripTask))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

// ── Polls ─────────────────────────────────────────────────────────────────────

export async function addPoll(
  tripId: string,
  data: Omit<TripPoll, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'trips', tripId, 'polls'), data)
  return ref.id
}

export async function updatePoll(
  tripId: string,
  pollId: string,
  updates: Partial<Omit<TripPoll, 'id' | 'tripId'>>,
): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId, 'polls', pollId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  })
}

export async function deletePoll(tripId: string, pollId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'polls', pollId))
}

/** Build a fresh poll option (client-side id; embedded in the poll doc). */
export function makePollOption(
  fields: Pick<PollOption, 'label'> &
    Partial<Pick<PollOption, 'description' | 'placeName' | 'estimatedCost' | 'linkedActivityId'>>,
): PollOption {
  return {
    id: generateId(),
    label: fields.label,
    description: fields.description,
    placeName: fields.placeName,
    estimatedCost: fields.estimatedCost,
    linkedActivityId: fields.linkedActivityId,
    votes: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * Add an option to an open poll. Re-writes the whole options array since options
 * are embedded in the poll document.
 */
export async function addPollOption(
  tripId: string,
  poll: TripPoll,
  option: PollOption,
): Promise<void> {
  await updatePoll(tripId, poll.id, { options: [...poll.options, option] })
}

/**
 * Cast or change a vote. For single-vote polls the voter is removed from every
 * other option first. Toggling the same option removes the vote (unvote).
 * Re-writes the options array (votes are embedded) so a single onSnapshot updates
 * every viewer live.
 */
export async function voteOnPoll(
  tripId: string,
  poll: TripPoll,
  optionId: string,
  voterUid: string,
): Promise<void> {
  const alreadyVotedHere = poll.options.find((o) => o.id === optionId)?.votes.includes(voterUid)

  const options = poll.options.map((o) => {
    if (o.id === optionId) {
      // Toggle off if already voted here; otherwise add.
      const votes = alreadyVotedHere
        ? o.votes.filter((v) => v !== voterUid)
        : [...o.votes.filter((v) => v !== voterUid), voterUid]
      return { ...o, votes }
    }
    // Single-vote polls: clear this voter from all other options.
    if (!poll.allowMultipleVotes) {
      return { ...o, votes: o.votes.filter((v) => v !== voterUid) }
    }
    return o
  })

  await updatePoll(tripId, poll.id, { options })
}

/** Close a poll (no more voting) without picking a winner. */
export async function closePoll(tripId: string, pollId: string): Promise<void> {
  await updatePoll(tripId, pollId, { status: 'closed' })
}

/** Re-open a closed poll. */
export async function reopenPoll(tripId: string, pollId: string): Promise<void> {
  await updatePoll(tripId, pollId, { status: 'open' })
}

/** Finalise a poll on a winning option. Marks status finalised + records the choice. */
export async function finalisePoll(
  tripId: string,
  pollId: string,
  finalisedOptionId: string,
): Promise<void> {
  await updatePoll(tripId, pollId, {
    status: 'finalised',
    finalisedOptionId,
  })
}

/** Real-time subscription to all polls for a trip, newest first. */
export function subscribePolls(
  tripId: string,
  callback: (polls: TripPoll[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'trips', tripId, 'polls'))
  return onSnapshot(q, (snap) => {
    const polls = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TripPoll))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    callback(polls)
  }, () => callback([]))
}
