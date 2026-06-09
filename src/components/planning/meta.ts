import type {
  TaskStatus,
  TaskPriority,
  TaskCategory,
  PollType,
} from '@/types'

// Shared label + colour metadata for tasks and polls, so the card components and
// the planning page stay visually consistent without duplicating the maps.

export const STATUS_META: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  todo:        { label: 'To do',       cls: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
  in_progress: { label: 'In progress', cls: 'bg-blue-50 text-blue-600',      dot: 'bg-blue-500' },
  done:        { label: 'Done',        cls: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-gray-50 text-gray-400',      dot: 'bg-gray-300' },
}

export const PRIORITY_META: Record<TaskPriority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-gray-50 text-gray-500' },
  medium: { label: 'Medium', cls: 'bg-sky-50 text-sky-600' },
  high:   { label: 'High',   cls: 'bg-amber-50 text-amber-600' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600' },
}

export const CATEGORY_META: Record<TaskCategory, { label: string; icon: string }> = {
  booking:   { label: 'Booking',   icon: '🎫' },
  payment:   { label: 'Payment',   icon: '💳' },
  packing:   { label: 'Packing',   icon: '🧳' },
  documents: { label: 'Documents', icon: '📄' },
  transport: { label: 'Transport', icon: '🚗' },
  food:      { label: 'Food',      icon: '🍽️' },
  shopping:  { label: 'Shopping',  icon: '🛍️' },
  route:     { label: 'Route',     icon: '🗺️' },
  memories:  { label: 'Memories',  icon: '📸' },
  general:   { label: 'General',   icon: '📌' },
}

export const POLL_TYPE_META: Record<PollType, { label: string; icon: string }> = {
  place:      { label: 'Place',       icon: '📍' },
  activity:   { label: 'Activity',    icon: '🎯' },
  restaurant: { label: 'Restaurant',  icon: '🍽️' },
  hotel:      { label: 'Hotel',       icon: '🏨' },
  route:      { label: 'Route',       icon: '🗺️' },
  budget:     { label: 'Budget',      icon: '💰' },
  date_time:  { label: 'Date / Time', icon: '🗓️' },
  general:    { label: 'General',     icon: '🗳️' },
}

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done', 'cancelled']
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
export const TASK_CATEGORIES: TaskCategory[] = [
  'booking', 'payment', 'packing', 'documents', 'transport',
  'food', 'shopping', 'route', 'memories', 'general',
]
export const POLL_TYPES: PollType[] = [
  'place', 'activity', 'restaurant', 'hotel', 'route', 'budget', 'date_time', 'general',
]

export function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/** Deterministic colour from a uid, used as an avatar fallback. */
const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]
export function colorFromUid(uid: string): string {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}
