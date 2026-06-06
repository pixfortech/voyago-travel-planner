import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, parseISO, addDays } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string): string {
  try {
    return format(parseISO(date), 'MMM d, yyyy')
  } catch {
    return date
  }
}

export function formatShortDate(date: string): string {
  try {
    return format(parseISO(date), 'MMM d')
  } catch {
    return date
  }
}

export function getDayCount(startDate: string, endDate: string): number {
  try {
    return differenceInDays(parseISO(endDate), parseISO(startDate)) + 1
  } catch {
    return 1
  }
}

export function getDatesInRange(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate)
  const count = getDayCount(startDate, endDate)
  return Array.from({ length: count }, (_, i) =>
    addDays(start, i).toISOString().split('T')[0]
  )
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function generateTripColor(): string {
  const colors = [
    '#14b8a6',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#6366f1',
    '#f97316',
    '#06b6d4',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
}

export function tripTypeLabel(type: string): string {
  return (
    {
      solo: 'Solo',
      couple: 'Couple',
      friends: 'Friends',
      group: 'Group',
      family: 'Family',
      office: 'Office Trip',
      pilgrimage: 'Pilgrimage',
      wedding: 'Wedding',
    }[type] ?? type
  )
}

export function activityTypeIcon(type: string): string {
  return (
    { hotel: '🏨', transport: '✈️', activity: '🎯', food: '🍽️', other: '📌' }[type] ?? '📌'
  )
}

export function expenseCategoryIcon(cat: string): string {
  return (
    {
      accommodation: '🏨',
      transport: '✈️',
      food: '🍽️',
      activities: '🎯',
      shopping: '🛍️',
      other: '📌',
    }[cat] ?? '📌'
  )
}
